/**
 * Token Art — every token wears the look of its state: ready, in combat, prone or dead, each a
 * file named beside the base art (`goblin.webp`, `goblin-ready.webp`, `goblin-combat.webp`,
 * `goblin-prone.webp`, `goblin-dead.webp`). Nothing to configure: the module asks the server
 * which look files exist beside a token's image, once per image, and swaps `texture.src` as the
 * state changes. A missing look falls through to the next that applies; the base is the floor.
 *
 * Who acts: the active GM's client, as Combat Plus's defeated marking. Every GM client computes
 * the same look from the same facts, so a second GM window's write is a no-op diff. Document
 * hooks, never canvas hooks, so tokens on scenes nobody is viewing follow too. The decisions are
 * in scripts/decide/looks.js, pure and unit-tested; this file is the Foundry side: settings, the
 * hooks, the probe cache, the writer, the wildcard wrap and the API.
 *
 * Two flags on the token, both this module's: `base` (the path to return to) and `look` (the one
 * worn now, absent at base), plus `subject` when the token's dynamic ring has its own subject
 * image. Nothing is written on the actor or the prototype token. The module's own writes carry a
 * `tokenart` option naming each token's change, which is what `updateToken` reads to fire
 * `tokenart.changed` on every client and to leave its own writes alone.
 */
import {
  FLAG_SCOPE,
  LOOKS,
  SEPARATORS,
  baseOf,
  lookCandidate,
  lookCandidatesOutside,
  lookPaths,
  restoreUpdate,
  stateOf,
  stillCurrent,
  tokenUpdate,
  winningLook,
  withDeletionOperators,
  withoutLooks
} from "./decide/looks.js";

const MODULE_ID = FLAG_SCOPE;
const TITLE = "Token Art";

/** Setting keys. */
const S = {
  readyLook: "readyLook",
  combatLook: "combatLook",
  proneLook: "proneLook",
  deadLook: "deadLook",
  separator: "separator",
  rescan: "rescan",
  paused: "paused"
};
const LOOK_SETTING = { ready: S.readyLook, combat: S.combatLook, prone: S.proneLook, dead: S.deadLook };

const setting = key => game.settings.get(MODULE_ID, key);

/** Exactly one client swaps images: the active GM's. */
const isActiveGM = () => game.users.activeGM?.isSelf ?? false;

const separator = () => {
  const s = setting(S.separator);
  return SEPARATORS.includes(s) ? s : "-";
};

const enabledLooks = () => Object.fromEntries(LOOKS.map(look => [look, Boolean(setting(LOOK_SETTING[look]))]));

/** Restore All pauses the module for the whole world, on every client, until Rescan is pressed. */
const isPaused = () => Boolean(setting(S.paused));

/* ---------------------------------------------------------------------------------------------
 * Which look files exist — a HEAD request per look path, once per base per GM session, misses
 * included, so a token with no looks costs four requests once and nothing after. `srcExists` is
 * source-agnostic (Foundry's data folder, a hosted box, the Forge, S3) and needs no permission.
 * A few at a time, so the first reconcile of a big world does not fire hundreds at once.
 * ------------------------------------------------------------------------------------------- */

const srcExists = src => (foundry.utils.srcExists ?? foundry.canvas?.srcExists ?? globalThis.srcExists)(src);
const PARALLEL = 6;
let inFlight = 0;
const waiting = [];

async function exists(src) {
  if (inFlight >= PARALLEL) await new Promise(resolve => waiting.push(resolve));
  inFlight++;
  try {
    return Boolean(await srcExists(src));
  } catch {
    return false;
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

/** A path worth asking the server about: not empty, not inline data. */
const probeable = path => typeof path === "string" && path.length > 0 && !/^(data|blob):/i.test(path);

/** path → Promise<boolean>: every answer the server gave this session, misses included. */
const cache = new Map();

function fileExists(path) {
  let pending = cache.get(path);
  if (!pending) {
    pending = exists(path);
    cache.set(path, pending);
  }
  return pending;
}

/** Which of a base's four looks have a file: { ready, combat, prone, dead }. */
async function looksAvailable(base) {
  const paths = lookPaths(base, separator());
  const entries = await Promise.all(LOOKS.map(async look => [look, await fileExists(paths[look])]));
  return Object.fromEntries(entries);
}

/**
 * A token's base. Its flags settle it when they recognise the image worn (the base itself or one
 * of its looks). Otherwise the image is adopted as the new base, with one exception: an image
 * whose name is a look of a base that exists on the server is that look of that base, so a token
 * handed a stored look back with no flags (dnd5e's revert of a transform does this) returns to
 * its base instead of making the look its base.
 */
async function resolveBase(src, flags, sep) {
  const known = baseOf({ src, flags }, sep);
  if (known !== src || flags?.base === src) return known;
  const candidate = lookCandidate(src, sep);
  if (candidate && probeable(candidate.base) && (await fileExists(candidate.base))) return candidate.base;
  return src;
}

/* ---------------------------------------------------------------------------------------------
 * The facts about a token
 * ------------------------------------------------------------------------------------------- */

/** Does any combat list this token? From the moment it is added to the tracker, started or not. */
function inCombat(tokenDoc) {
  const sceneId = tokenDoc.parent?.id ?? null;
  for (const combat of game.combats) {
    for (const c of combat.combatants) {
      if (c.tokenId !== tokenDoc.id) continue;
      const where = c.sceneId ?? combat.scene?.id ?? null;
      if (where === null || where === sceneId) return true;
    }
  }
  return false;
}

function stateFor(tokenDoc) {
  const actor = tokenDoc.actor;
  const hp = actor?.system?.attributes?.hp?.value;
  return stateOf({
    hp: typeof hp === "number" ? hp : null,
    statuses: actor?.statuses ?? null,
    inCombat: inCombat(tokenDoc)
  });
}

/**
 * An actor's tokens: a synthetic actor's is the one behind it; a world actor's are every token of
 * its on every scene, linked (they share its data) or unlinked (their synthetic actors inherit what
 * their deltas do not override, and Foundry fires no hook of theirs when the world actor changes).
 */
function tokensOf(actor) {
  if (!actor) return [];
  if (actor.isToken) return actor.token ? [actor.token] : [];
  const out = [];
  for (const scene of game.scenes) {
    for (const t of scene.tokens) if (t.actorId === actor.id) out.push(t);
  }
  return out;
}

/* ---------------------------------------------------------------------------------------------
 * The writer
 * ------------------------------------------------------------------------------------------- */

/**
 * A token's image and ring subject as stored, never as prepared: Foundry animates a texture change,
 * so the prepared `texture.src` lags the source by the length of the fade (measured 2026-10-15), and
 * a window whose canvas is throttled can hold the old value for good. Decisions come from the source.
 */
function stored(tokenDoc) {
  const source = tokenDoc._source ?? tokenDoc;
  const src = source.texture?.src ?? tokenDoc.texture?.src ?? "";
  const ring = source.ring ?? tokenDoc.ring;
  // `subject` is the ring subject in play (the ring on and an image set); `subjectSet` is the image
  // set whether or not the ring is on, which Restore All puts back so a ring switched on later
  // does not show a look the module had stored there.
  const subjectSet = ring?.subject?.texture || null;
  const subject = ring?.enabled ? subjectSet : null;
  return { src, subject, subjectSet };
}

/**
 * An update as this Foundry wants it: on 14 each legacy `-=` deletion key becomes a forced-deletion
 * operator (14 accepts the legacy key with a warning on every write and 16 drops it); on 13, which
 * has no operators, the legacy key stays.
 */
function forWrite(update) {
  const Deletion = foundry.data?.operators?.ForcedDeletion;
  return typeof Deletion === "function" ? withDeletionOperators(update, () => new Deletion()) : update;
}

/** The update a token needs now, with a note for the `tokenart.changed` hook, or null. */
async function planFor(tokenDoc) {
  const sep = separator();
  const { src, subject: ringSubject } = stored(tokenDoc);
  const flags = tokenDoc.flags?.[MODULE_ID] ?? {};
  if (!probeable(src)) return null;
  const base = await resolveBase(src, flags, sep);
  const available = await looksAvailable(base);
  const look = winningLook(stateFor(tokenDoc), available, enabledLooks());
  const paths = lookPaths(base, sep);

  // With the ring on and a subject image set, the subject gets the same suffix and both swap
  // together, when the subject's look file exists; with no subject, Foundry draws it from
  // `texture.src` and that alone is written.
  let subjectBase = null;
  let subjectLookSrc = null;
  if (ringSubject) {
    // The subject's base is resolved as the image's is, the look-candidate probe included: dnd5e's
    // revert of a transform hands the stored subject back with the flags gone, like the image.
    subjectBase = await resolveBase(ringSubject, { base: flags.subject, look: flags.look }, sep);
    if (look && probeable(subjectBase) && (await looksAvailable(subjectBase))[look]) {
      subjectLookSrc = lookPaths(subjectBase, sep)[look];
    }
  }

  const update = tokenUpdate(
    { id: tokenDoc.id, src, subject: ringSubject, flags },
    { base, look, lookSrc: look ? paths[look] : null, subjectBase, subjectLookSrc }
  );
  if (!update) return null;
  return { update, note: { from: src, to: update["texture.src"] ?? src, look } };
}

/**
 * Resolve and write the looks of these tokens, one update per scene. Returns how many changed.
 * Runs one call at a time: a reconcile at `ready` and a condition landing in the same second both
 * read the token fresh when their turn comes, so the second finds nothing left to write.
 */
let chain = Promise.resolve(0);
function applyTokens(tokens) {
  if (!isActiveGM() || isPaused()) return Promise.resolve(0);
  const next = chain.then(() => applyTokensNow(tokens));
  chain = next.catch(() => 0);
  return next;
}

async function applyTokensNow(tokens) {
  if (!isActiveGM() || isPaused()) return 0;
  const byScene = new Map();
  for (const t of tokens) {
    if (!t?.parent) continue;
    try {
      const plan = await planFor(t);
      if (!plan) continue;
      const entry = byScene.get(t.parent) ?? { updates: [], notes: {} };
      entry.updates.push(plan.update);
      entry.notes[t.id] = plan.note;
      byScene.set(t.parent, entry);
    } catch (err) {
      console.error(`${TITLE} | could not resolve the look of ${t.name}`, err);
    }
  }
  let changed = 0;
  for (const [scene, { updates, notes }] of byScene) {
    // Planning awaits probes; the seat or the pause may have changed meanwhile (Restore All sets
    // the pause, then reads the tokens), and a plan made before either is not written after.
    if (!isActiveGM() || isPaused()) break;
    // Nor is a plan for a token deleted meanwhile (it would fail the whole batch) or for one whose
    // image someone else changed meanwhile (that change's own event re-plans it).
    const live = stillCurrent(updates, notes, id => {
      const t = scene.tokens.get(id);
      return t ? stored(t).src : null;
    }).map(forWrite);
    if (!live.length) continue;
    try {
      await scene.updateEmbeddedDocuments("Token", live, { tokenart: notes });
      changed += live.length;
    } catch (err) {
      console.error(`${TITLE} | could not update tokens on ${scene.name}`, err);
    }
  }
  return changed;
}

/**
 * Every token on every scene, once: at ready, after a rescan, and when this client becomes the
 * active GM. A call while a pass is running asks for one more pass after it, so a Rescan pressed
 * mid-reconcile (its cache clear already done) still reaches the tokens the running pass had
 * planned with the old answers; the promise returned is the whole run's.
 */
let reconciling = null;
let reconcileAgain = false;
function reconcileAll() {
  if (reconciling) {
    reconcileAgain = true;
    return reconciling;
  }
  reconciling = (async () => {
    let changed = 0;
    do {
      reconcileAgain = false;
      for (const scene of game.scenes) changed += await applyTokens(scene.tokens.contents);
    } while (reconcileAgain);
    return changed;
  })().finally(() => {
    reconciling = null;
  });
  return reconciling;
}

/* ---------------------------------------------------------------------------------------------
 * The API — game.modules.get("fvtt-mod-tokenart").api
 * ------------------------------------------------------------------------------------------- */

const api = {
  LOOKS,

  /** A token's base, its separator, each look's path and whether its file exists, and the look worn now. */
  async looksFor(tokenDoc) {
    const sep = separator();
    const flags = tokenDoc.flags?.[MODULE_ID] ?? {};
    const { src } = stored(tokenDoc);
    const base = probeable(src) ? await resolveBase(src, flags, sep) : src;
    const paths = lookPaths(base, sep);
    const available = probeable(base) ? await looksAvailable(base) : {};
    return {
      base,
      separator: sep,
      looks: Object.fromEntries(LOOKS.map(look => [look, { path: paths[look], exists: Boolean(available[look]) }])),
      worn: flags.look ?? null
    };
  },

  /** Resolve and write one token's look now (the active GM's client only). */
  apply: tokenDoc => applyTokens([tokenDoc]),

  /**
   * Forget which look files were found and reconcile every token: new art uploaded mid-session.
   * Rides a hidden world setting, so every client's cache clears and the active GM's client does
   * the reconcile whichever window pressed the button (a headless bridge may hold that seat).
   */
  async rescan() {
    if (!game.user.isGM) {
      ui.notifications.warn(`${TITLE}: only a GM can rescan.`);
      return;
    }
    if (isPaused()) await game.settings.set(MODULE_ID, S.paused, false);
    await game.settings.set(MODULE_ID, S.rescan, Date.now());
    ui.notifications.info(`${TITLE}: rescanning on every client.`);
  },

  /** Every token back to its base, its flags gone: the step before the module is disabled. */
  async restoreAll({ confirm = false } = {}) {
    if (!game.user.isGM) {
      ui.notifications.warn(`${TITLE}: only a GM can restore tokens.`);
      return 0;
    }
    if (confirm) {
      const yes = await foundry.applications.api.DialogV2.confirm({
        window: { title: `${TITLE}: Restore every token to its base?`, icon: "fa-solid fa-arrow-rotate-left" },
        content:
          "<p>Every token on every scene goes back to its base image and forgets its looks. " +
          "Token Art then stays paused for this world, on every client, until Rescan is pressed, so the module " +
          "can be disabled without the looks coming back.</p>",
        yes: { label: "Restore all", icon: "fa-solid fa-arrow-rotate-left" },
        no: { label: "Keep the looks" },
        modal: true
      });
      if (!yes) return 0;
    }
    await game.settings.set(MODULE_ID, S.paused, true);
    // A batch this client had in flight finishes (and, paused now, writes nothing) before the
    // tokens are read, so a look it landed a moment ago is seen and taken off.
    await chain;
    const sep = separator();
    let restored = 0;
    for (const scene of game.scenes) {
      const updates = [];
      const notes = {};
      for (const t of scene.tokens) {
        const flags = t.flags?.[MODULE_ID] ?? {};
        const { src, subjectSet } = stored(t);
        const update = restoreUpdate({ id: t.id, src, subject: subjectSet, flags }, sep);
        if (!update) continue;
        updates.push(forWrite(update));
        notes[t.id] = { from: src, to: update["texture.src"] ?? src, look: null };
      }
      if (!updates.length) continue;
      try {
        await scene.updateEmbeddedDocuments("Token", updates, { tokenart: notes });
        restored += updates.length;
      } catch (err) {
        console.error(`${TITLE} | could not restore tokens on ${scene.name}`, err);
      }
    }
    ui.notifications.info(
      `${TITLE}: ${restored} token${restored === 1 ? "" : "s"} restored. Paused for this world: disable the module now, or press Rescan to resume.`
    );
    return restored;
  }
};

/* ---------------------------------------------------------------------------------------------
 * Settings — four switches, the separator, two buttons
 * ------------------------------------------------------------------------------------------- */

/** A settings button that runs an action instead of opening a window. */
class ActionMenu extends foundry.applications.api.ApplicationV2 {
  static async run() {}

  async render() {
    try {
      await this.constructor.run();
    } catch (err) {
      console.error(`${TITLE} |`, err);
    }
    return this;
  }
}

class RescanMenu extends ActionMenu {
  static async run() {
    await api.rescan();
  }
}

class RestoreMenu extends ActionMenu {
  static async run() {
    await api.restoreAll({ confirm: true });
  }
}

Hooks.once("init", () => {
  const switches = [
    ["ready", "Ready look", "A token wears its -ready image whenever nothing else applies."],
    [
      "combat",
      "Combat look",
      "A token wears its -combat image while a combat lists it, from the moment it is added to the tracker."
    ],
    ["prone", "Prone look", "A token wears its -prone image while its creature has the Prone condition."],
    [
      "dead",
      "Dead look",
      "A token wears its -dead image at 0 Hit Points or with the Dead condition, player characters included."
    ]
  ];
  for (const [look, name, hint] of switches) {
    game.settings.register(MODULE_ID, LOOK_SETTING[look], {
      name,
      hint,
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: () => {
        if (isActiveGM()) void reconcileAll();
      }
    });
  }

  game.settings.register(MODULE_ID, S.separator, {
    name: "Suffix separator",
    hint: "The character between the base name and the look: goblin-dead.webp, goblin_dead.webp or goblin.dead.webp.",
    scope: "world",
    config: true,
    type: String,
    choices: { "-": "- (goblin-dead.webp)", _: "_ (goblin_dead.webp)", ".": ". (goblin.dead.webp)" },
    default: "-",
    onChange: () => {
      cache.clear();
      if (isActiveGM()) void reconcileAll();
    }
  });

  // Hidden: the pause Restore All sets for the whole world (any GM client that joined meanwhile,
  // a bridge among them, would otherwise put the looks straight back); Rescan clears it.
  game.settings.register(MODULE_ID, S.paused, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  // Hidden: the rescan signal. Its change reaches every client; the active GM's reconciles.
  game.settings.register(MODULE_ID, S.rescan, {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: () => {
      cache.clear();
      if (!isActiveGM() || isPaused()) return;
      void reconcileAll().then(changed =>
        ui.notifications.info(`${TITLE}: rescanned; ${changed} token${changed === 1 ? "" : "s"} changed.`)
      );
    }
  });

  game.settings.registerMenu(MODULE_ID, "rescanMenu", {
    name: "Rescan token art",
    label: "Rescan",
    hint: "Forget which look files were found and look again. Press it after uploading new art mid-session; a reload does the same.",
    icon: "fa-solid fa-rotate",
    type: RescanMenu,
    restricted: true
  });

  game.settings.registerMenu(MODULE_ID, "restoreMenu", {
    name: "Restore every token to its base",
    label: "Restore all",
    hint: "Put every token back to its base image and forget the looks: the step before disabling or uninstalling the module.",
    icon: "fa-solid fa-arrow-rotate-left",
    type: RestoreMenu,
    restricted: true
  });

  game.modules.get(MODULE_ID).api = api;
});

/* ---------------------------------------------------------------------------------------------
 * Wildcard tokens — a prototype with `goblin-*.webp` would draw `goblin-dead.webp` as a random
 * image. The look files of the bases in the list are dropped, deferring to the original (a manual
 * wrap, no libWrapper, as the family does its Token-class patches).
 * ------------------------------------------------------------------------------------------- */

Hooks.once("setup", () => {
  const ActorClass = foundry.documents?.Actor ?? Actor;
  const proto = ActorClass?.prototype;
  const original = proto?.getTokenImages;
  if (typeof original !== "function") {
    console.error(`${TITLE} | Actor#getTokenImages not found; a wildcard token may draw a look file.`);
    return;
  }
  proto.getTokenImages = async function (...args) {
    const images = await original.apply(this, args);
    try {
      const sep = separator();
      const kept = withoutLooks(images, sep);
      // A look of a base the wildcard never matched (`goblin-*.webp` lists `goblin-dead.webp` but not
      // `goblin.webp`): the name alone cannot tell it from a base called `walking-dead.webp`, so the
      // server is asked whether the candidate base exists, once, through the same cache.
      // A GM client asks; a player's client, which cannot place a token, sends no request.
      const drop = new Set();
      if (game.user?.isGM) {
        await Promise.all(
          lookCandidatesOutside(kept, sep).map(async ({ path, base }) => {
            if (probeable(base) && (await fileExists(base))) drop.add(path);
          })
        );
      }
      return drop.size ? kept.filter(p => !drop.has(p)) : kept;
    } catch (err) {
      console.error(`${TITLE} | wildcard filter failed`, err);
      return images;
    }
  };
});

/* ---------------------------------------------------------------------------------------------
 * The hooks — document-level, so every scene follows; the active GM's client does the writing
 * ------------------------------------------------------------------------------------------- */

/** Run `fn` on the active GM's client only, and never while Restore All has paused it. */
const whenActiveGM =
  fn =>
  (...args) => {
    if (!isActiveGM() || isPaused()) return;
    void fn(...args);
  };

Hooks.once("ready", () => {
  if (isActiveGM()) void reconcileAll();
});

// When the active GM leaves, the next GM client picks the job up and sweeps what was missed.
Hooks.on("userConnected", (user, connected) => {
  if (!connected && user.isGM && isActiveGM() && !isPaused()) void reconcileAll();
});

Hooks.on(
  "createToken",
  whenActiveGM(doc => applyTokens([doc]))
);

// A scene that arrives with its tokens (duplicated, imported from a compendium or an adventure)
// fires no createToken for them.
Hooks.on(
  "createScene",
  whenActiveGM(scene => applyTokens(scene.tokens?.contents ?? []))
);

Hooks.on("updateToken", (doc, changed, options) => {
  // The module's own write: tell every client what changed, and leave it alone.
  const note = options?.tokenart?.[doc.id];
  if (note) {
    // The hook is for a changed image; a write that only sets the flags straight says nothing.
    if (note.from !== note.to) Hooks.callAll("tokenart.changed", doc, note);
    return;
  }
  if (!isActiveGM() || isPaused()) return;
  // Anyone else's texture change is the new base (a Token Config edit, a transform, a summon's
  // landing), unless it is one of the current base's own looks; re-resolve either way.
  const has = key => foundry.utils.hasProperty(changed, key);
  if (has("texture.src") || has("ring.enabled") || has("ring.subject.texture") || has("actorId") || has("actorLink")) {
    void applyTokens([doc]);
  }
});

Hooks.on(
  "updateActor",
  whenActiveGM((actor, changed) => {
    if (!foundry.utils.hasProperty(changed, "system.attributes.hp.value")) return;
    return applyTokens(tokensOf(actor));
  })
);

const WATCHED_STATUSES = new Set(["prone", "dead"]);
const watchesStatus = effect => [...(effect.statuses ?? [])].some(s => WATCHED_STATUSES.has(s));

/** The actor an effect applies to: its parent, or its item's parent. */
function effectActor(effect) {
  const parent = effect.parent;
  if (!parent) return null;
  if (parent.documentName === "Actor") return parent;
  if (parent.documentName === "Item" && parent.parent?.documentName === "Actor") return parent.parent;
  return null;
}

Hooks.on(
  "createActiveEffect",
  whenActiveGM(effect => (watchesStatus(effect) ? applyTokens(tokensOf(effectActor(effect))) : undefined))
);
Hooks.on(
  "deleteActiveEffect",
  whenActiveGM(effect => (watchesStatus(effect) ? applyTokens(tokensOf(effectActor(effect))) : undefined))
);
Hooks.on(
  "updateActiveEffect",
  whenActiveGM((effect, changed) => {
    if ("statuses" in changed || ("disabled" in changed && watchesStatus(effect))) {
      return applyTokens(tokensOf(effectActor(effect)));
    }
  })
);

const combatantTokens = combat => combat.combatants.map(c => c.token).filter(Boolean);

Hooks.on(
  "createCombatant",
  whenActiveGM(c => (c.token ? applyTokens([c.token]) : undefined))
);
Hooks.on(
  "deleteCombatant",
  whenActiveGM(c => (c.token ? applyTokens([c.token]) : undefined))
);
// A combatant pointed at another token (Foundry remaps one whose token a replacement deleted, as
// dnd5e's revert of an unlinked transform does): the token now in combat follows. The token it
// left, if any, waits for its next event.
Hooks.on(
  "updateCombatant",
  whenActiveGM((c, changed) =>
    ("tokenId" in changed || "sceneId" in changed) && c.token ? applyTokens([c.token]) : undefined
  )
);
Hooks.on(
  "createCombat",
  whenActiveGM(combat => applyTokens(combatantTokens(combat)))
);
Hooks.on(
  "deleteCombat",
  whenActiveGM(combat => applyTokens(combatantTokens(combat)))
);
