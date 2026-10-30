import { describe, expect, it } from "vitest";
import {
  FLAG_SCOPE,
  LOOKS,
  PRECEDENCE,
  applicable,
  STASH_KEYS,
  baseOf,
  browseTarget,
  isLookOf,
  lookCandidate,
  lookCandidatesOutside,
  lookPath,
  lookPaths,
  restoreUpdate,
  samePath,
  splitPath,
  stashUpdate,
  stashedBase,
  stateOf,
  stillCurrent,
  subjectLookOf,
  tokenUpdate,
  winningLook,
  withDeletionOperators,
  withoutLooks
} from "../scripts/decide/looks.js";

/**
 * DECISION layer: the naming convention and the precedence are exactly what unit tests catch.
 * No Foundry stub on purpose.
 */

describe("splitPath — the file name's extension and the query string", () => {
  it("splits a plain path at the file name's last dot", () => {
    expect(splitPath("assets/tokens/goblin.webp")).toEqual({ stem: "assets/tokens/goblin", ext: ".webp", query: "" });
  });
  it("keeps a query string apart", () => {
    expect(splitPath("https://assets.forge-vtt.com/x/goblin.webp?v=3")).toEqual({
      stem: "https://assets.forge-vtt.com/x/goblin",
      ext: ".webp",
      query: "?v=3"
    });
  });
  it("never takes a dot in a folder name for the extension", () => {
    expect(splitPath("art.v2/goblin")).toEqual({ stem: "art.v2/goblin", ext: "", query: "" });
  });
  it("a dot-file has no extension", () => {
    expect(splitPath("tokens/.goblin")).toEqual({ stem: "tokens/.goblin", ext: "", query: "" });
  });
  it("reads a backslash as a folder separator too", () => {
    expect(splitPath("a.b\\goblin.png")).toEqual({ stem: "a.b\\goblin", ext: ".png", query: "" });
  });
});

describe("lookPath / lookPaths — base → looks, one way", () => {
  it("adds the suffix before the extension, in the same folder", () => {
    expect(lookPath("assets/tokens/goblin.webp", "dead")).toBe("assets/tokens/goblin-dead.webp");
  });
  it("keeps the query string after the extension", () => {
    expect(lookPath("x/goblin.webp?v=3", "dead")).toBe("x/goblin-dead.webp?v=3");
  });
  it("follows video textures the same way", () => {
    expect(lookPath("x/goblin.webm", "combat")).toBe("x/goblin-combat.webm");
  });
  it("takes the table's separator", () => {
    expect(lookPath("goblin.webp", "ready", "_")).toBe("goblin_ready.webp");
    expect(lookPath("goblin.webp", "ready", ".")).toBe("goblin.ready.webp");
  });
  it("a base with no extension still gets its looks", () => {
    expect(lookPath("tokens/goblin", "dead")).toBe("tokens/goblin-dead");
  });
  it("gives every look its path: three looks, ready, combat and dead", () => {
    expect(lookPaths("g.webp")).toEqual({
      ready: "g-ready.webp",
      combat: "g-combat.webp",
      dead: "g-dead.webp"
    });
    expect(Object.keys(lookPaths("g.webp"))).toEqual([...LOOKS]);
    expect(LOOKS).not.toContain("prone");
  });
});

describe("isLookOf — which look a path is of a base", () => {
  it("names the look", () => {
    expect(isLookOf("t/goblin-dead.webp", "t/goblin.webp")).toBe("dead");
    expect(isLookOf("t/goblin.combat.webp", "t/goblin.webp", ".")).toBe("combat");
  });
  it("is null for the base itself, another file, or another separator", () => {
    expect(isLookOf("t/goblin.webp", "t/goblin.webp")).toBeNull();
    expect(isLookOf("t/orc-dead.webp", "t/goblin.webp")).toBeNull();
    expect(isLookOf("t/goblin_dead.webp", "t/goblin.webp")).toBeNull();
  });
  it("is exact: the query string counts", () => {
    expect(isLookOf("g-dead.webp?v=2", "g.webp?v=3")).toBeNull();
    expect(isLookOf("g-dead.webp?v=3", "g.webp?v=3")).toBe("dead");
  });
  it("never reads a base out of a look's name", () => {
    expect(isLookOf("walking.webp", "walking-dead.webp")).toBeNull();
    expect(isLookOf("walking-dead-dead.webp", "walking-dead.webp")).toBe("dead");
  });
  it("a word that is no look is no look: goblin-prone.webp is not a look of goblin.webp", () => {
    expect(isLookOf("t/goblin-prone.webp", "t/goblin.webp")).toBeNull();
  });
  it("tolerates junk", () => {
    expect(isLookOf(null, "g.webp")).toBeNull();
    expect(isLookOf("g-dead.webp", undefined)).toBeNull();
    expect(isLookOf("", "")).toBeNull();
  });
});

describe("baseOf — adoption against recognition", () => {
  it("a token never touched: what it wears is its base", () => {
    expect(baseOf({ src: "t/goblin.webp", flags: {} })).toBe("t/goblin.webp");
    expect(baseOf({ src: "t/goblin.webp" })).toBe("t/goblin.webp");
  });
  it("wearing a look of the known base keeps that base", () => {
    expect(baseOf({ src: "t/goblin-combat.webp", flags: { base: "t/goblin.webp", look: "combat" } })).toBe(
      "t/goblin.webp"
    );
  });
  it("a snapshot that hands a look back is a look, not a new base", () => {
    expect(baseOf({ src: "t/owl-dead.webp", flags: { base: "t/owl.webp" } })).toBe("t/owl.webp");
  });
  it("any other image is adopted as the new base", () => {
    expect(baseOf({ src: "t/bear.webp", flags: { base: "t/owl.webp", look: "ready" } })).toBe("t/bear.webp");
  });
  it("a look under another separator is a new base, not a look", () => {
    expect(baseOf({ src: "t/owl_dead.webp", flags: { base: "t/owl.webp" } })).toBe("t/owl_dead.webp");
    expect(baseOf({ src: "t/owl_dead.webp", flags: { base: "t/owl.webp" } }, "_")).toBe("t/owl.webp");
  });
  it("the look the flags name is the module's own write, recognised after the separator changes", () => {
    // Dressed goblin_dead.webp under "_", the table switches to "-": still the dead look of goblin.webp.
    expect(baseOf({ src: "t/owl_dead.webp", flags: { base: "t/owl.webp", look: "dead" } })).toBe("t/owl.webp");
    expect(baseOf({ src: "t/owl.dead.webp", flags: { base: "t/owl.webp", look: "dead" } }, "_")).toBe("t/owl.webp");
    // The flags must name that look; another look's path under another separator is a hand change.
    expect(baseOf({ src: "t/owl_combat.webp", flags: { base: "t/owl.webp", look: "dead" } })).toBe("t/owl_combat.webp");
  });
  it("a look the module no longer has (1.0.x's prone) is still its own write when the flags name it", () => {
    // Upgraded from 1.0.1 while wearing the prone look: the flags say so, and the token returns to
    // its base instead of adopting goblin-prone.webp as a base of its own.
    const flags = { base: "t/goblin.webp", look: "prone" };
    expect(baseOf({ src: "t/goblin-prone.webp", flags })).toBe("t/goblin.webp");
    expect(tokenUpdate({ id: "a", src: "t/goblin-prone.webp", flags }, { base: "t/goblin.webp", look: null })).toEqual({
      _id: "a",
      "texture.src": "t/goblin.webp",
      "flags.fvtt-mod-tokenart.-=look": null
    });
    expect(restoreUpdate({ id: "a", src: "t/goblin-prone.webp", flags })).toEqual({
      _id: "a",
      "texture.src": "t/goblin.webp",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
    // With no look flag the name is just a name: adopted, as any image is.
    expect(baseOf({ src: "t/goblin-prone.webp", flags: { base: "t/goblin.webp" } })).toBe("t/goblin-prone.webp");
  });
  it("switching the separator while a look is worn takes the token back to its base, not to a new base", () => {
    const B = "t/goblin.webp";
    const dressed = tokenUpdate(
      { id: "a", src: B, flags: {} },
      { base: B, look: "dead", lookSrc: "t/goblin-dead.webp" }
    );
    const now = { id: "a", src: dressed["texture.src"], flags: { base: B, look: "dead" } };
    // Under "_" no goblin_dead.webp exists; the base is still goblin.webp and the token returns to it.
    expect(baseOf(now, "_")).toBe(B);
    expect(tokenUpdate(now, { base: B, look: null })).toEqual({
      _id: "a",
      "texture.src": B,
      "flags.fvtt-mod-tokenart.-=look": null
    });
  });
  it("an empty image is an empty base", () => {
    expect(baseOf({ src: "", flags: {} })).toBe("");
    expect(baseOf({ src: null, flags: { base: "t/owl.webp" } })).toBe("");
  });
});

describe("stateOf — one rule for everyone", () => {
  it("dead at 0 Hit Points, or with the dead status", () => {
    expect(stateOf({ hp: 0, statuses: new Set(), inCombat: false }).dead).toBe(true);
    expect(stateOf({ hp: -3, statuses: new Set(), inCombat: false }).dead).toBe(true);
    expect(stateOf({ hp: 12, statuses: new Set(["dead"]), inCombat: false }).dead).toBe(true);
    expect(stateOf({ hp: 12, statuses: new Set(["unconscious"]), inCombat: false }).dead).toBe(false);
  });
  it("no hit points known (another system, a vehicle): not dead by HP", () => {
    expect(stateOf({ hp: null, statuses: new Set(), inCombat: true })).toEqual({ dead: false, combat: true });
    expect(stateOf({ hp: undefined, statuses: null })).toEqual({ dead: false, combat: false });
  });
  it("dead from the status, combat from the tracker, statuses as a Set or an array", () => {
    expect(stateOf({ hp: 5, statuses: ["dead"], inCombat: true })).toEqual({ dead: true, combat: true });
    expect(stateOf({ hp: 5, statuses: new Set(["dead"]), inCombat: false })).toEqual({ dead: true, combat: false });
  });
  it("the Prone condition is not a state: a prone creature is whatever else it is", () => {
    expect(stateOf({ hp: 5, statuses: new Set(["prone"]), inCombat: false })).toEqual({ dead: false, combat: false });
    expect(stateOf({ hp: 5, statuses: ["prone"], inCombat: true })).toEqual({ dead: false, combat: true });
    expect(stateOf({ hp: 0, statuses: ["prone"], inCombat: true })).toEqual({ dead: true, combat: true });
  });
});

describe("applicable / winningLook — dead > combat > ready > base", () => {
  const all = { ready: true, combat: true, dead: true };
  it("the precedence is the one the README states", () => {
    expect([...PRECEDENCE]).toEqual(["dead", "combat", "ready"]);
  });
  it("lists what a state asks for, strongest first, ready always", () => {
    expect(applicable({ dead: true, combat: true })).toEqual(["dead", "combat", "ready"]);
    expect(applicable({ combat: true })).toEqual(["combat", "ready"]);
    expect(applicable({})).toEqual(["ready"]);
    expect(applicable(null)).toEqual(["ready"]);
  });
  it("a dead creature is dead whatever else is true", () => {
    expect(winningLook({ dead: true, combat: true }, all)).toBe("dead");
  });
  it("a combatant is in combat; anything else is ready", () => {
    expect(winningLook({ combat: true }, all)).toBe("combat");
    expect(winningLook({}, all)).toBe("ready");
  });
  it("a state the module does not track asks for no look, whatever files sit beside the base", () => {
    expect(applicable({ prone: true })).toEqual(["ready"]);
    expect(winningLook({ prone: true, combat: true }, { ...all, prone: true })).toBe("combat");
    expect(winningLook({ prone: true }, new Set(["prone"]))).toBeNull();
  });
  it("a missing file falls through to the next look that applies and exists", () => {
    expect(winningLook({ dead: true, combat: true }, { ready: true, combat: true })).toBe("combat");
    expect(winningLook({ combat: true }, { ready: true })).toBe("ready");
    expect(winningLook({ dead: true }, { combat: true })).toBeNull();
  });
  it("no file at all means the base", () => {
    expect(winningLook({ dead: true }, {})).toBeNull();
    expect(winningLook({}, null)).toBeNull();
  });
  it("a look switched off counts as missing", () => {
    expect(winningLook({ dead: true, combat: true }, all, { dead: false })).toBe("combat");
    expect(winningLook({}, all, { ready: false })).toBeNull();
    expect(winningLook({ combat: true }, all, { combat: false })).toBe("ready");
  });
  it("takes the available looks as a Set too", () => {
    expect(winningLook({ combat: true }, new Set(["combat"]))).toBe("combat");
    expect(winningLook({ combat: true }, new Set(["ready"]))).toBe("ready");
  });
});

describe("withoutLooks — a wildcard never draws a look file", () => {
  it("drops the look files of the bases in the list", () => {
    expect(
      withoutLooks(["g/goblin-1.webp", "g/goblin-1-dead.webp", "g/goblin-2.webp", "g/goblin-2-combat.webp"])
    ).toEqual(["g/goblin-1.webp", "g/goblin-2.webp"]);
  });
  it("keeps a file whose name merely ends in a look word", () => {
    expect(withoutLooks(["z/walking-dead.webp", "z/zombie.webp"])).toEqual(["z/walking-dead.webp", "z/zombie.webp"]);
    expect(withoutLooks(["z/walking.webp", "z/walking-dead.webp"])).toEqual(["z/walking.webp"]);
  });
  it("a -prone file left over from 1.0.x is an ordinary image: a wildcard may draw it", () => {
    expect(withoutLooks(["g/goblin-1.webp", "g/goblin-1-prone.webp"])).toEqual([
      "g/goblin-1.webp",
      "g/goblin-1-prone.webp"
    ]);
  });
  it("honours the separator and keeps the order", () => {
    expect(withoutLooks(["g_2.webp", "g_1.webp", "g_1_dead.webp"], "_")).toEqual(["g_2.webp", "g_1.webp"]);
    expect(withoutLooks(["g_1.webp", "g_1_dead.webp"], "-")).toEqual(["g_1.webp", "g_1_dead.webp"]);
  });
  it("tolerates junk", () => {
    expect(withoutLooks(null)).toEqual([]);
    expect(withoutLooks(["a.webp", 3, undefined])).toEqual(["a.webp"]);
  });
});

describe("lookCandidatesOutside — the look-shaped names a wildcard lists without their base", () => {
  it("names the candidates whose base the wildcard did not match, for the server to confirm", () => {
    // goblin-*.webp lists goblin-dead.webp but never goblin.webp: the name alone cannot settle it.
    expect(lookCandidatesOutside(["g/goblin-1.webp", "g/goblin-dead.webp", "g/goblin-2.webp"])).toEqual([
      { path: "g/goblin-dead.webp", base: "g/goblin.webp", look: "dead" }
    ]);
  });
  it("leaves out a look whose base is in the list (withoutLooks settles those) and plain bases", () => {
    expect(lookCandidatesOutside(["g/goblin-1.webp", "g/goblin-1-dead.webp"])).toEqual([]);
    expect(lookCandidatesOutside(["g/goblin-1.webp", "g/goblin-2.webp"])).toEqual([]);
  });
  it("a name that merely ends in a look word is a candidate too; the probe decides", () => {
    expect(lookCandidatesOutside(["z/walking-dead.webp"])).toEqual([
      { path: "z/walking-dead.webp", base: "z/walking.webp", look: "dead" }
    ]);
  });
  it("honours the separator, keeps the order and tolerates junk", () => {
    expect(lookCandidatesOutside(["g_dead.webp", "g_1.webp", "g_ready.webp"], "_")).toEqual([
      { path: "g_dead.webp", base: "g.webp", look: "dead" },
      { path: "g_ready.webp", base: "g.webp", look: "ready" }
    ]);
    expect(lookCandidatesOutside(["g_dead.webp"], "-")).toEqual([]);
    expect(lookCandidatesOutside(["g_prone.webp"], "_")).toEqual([]);
    expect(lookCandidatesOutside(null)).toEqual([]);
    expect(lookCandidatesOutside(["g-dead.webp", 3, undefined])).toEqual([
      { path: "g-dead.webp", base: "g.webp", look: "dead" }
    ]);
  });
});

describe("tokenUpdate — the write, flat keys, or nothing", () => {
  const B = "t/goblin.webp";
  const flag = key => `flags.${FLAG_SCOPE}.${key}`;

  it("a token at its base the module never touched: nothing", () => {
    expect(tokenUpdate({ id: "a", src: B, flags: {} }, { base: B, look: null })).toBeNull();
  });
  it("putting a look on: the image, the base and the look", () => {
    expect(
      tokenUpdate({ id: "a", src: B, flags: {} }, { base: B, look: "combat", lookSrc: "t/goblin-combat.webp" })
    ).toEqual({
      _id: "a",
      "texture.src": "t/goblin-combat.webp",
      [flag("base")]: B,
      [flag("look")]: "combat"
    });
  });
  it("already wearing it with the right flags: nothing", () => {
    expect(
      tokenUpdate(
        { id: "a", src: "t/goblin-combat.webp", flags: { base: B, look: "combat" } },
        { base: B, look: "combat", lookSrc: "t/goblin-combat.webp" }
      )
    ).toBeNull();
  });
  it("changing looks: the image and the look, the base untouched", () => {
    expect(
      tokenUpdate(
        { id: "a", src: "t/goblin-combat.webp", flags: { base: B, look: "combat" } },
        { base: B, look: "dead", lookSrc: "t/goblin-dead.webp" }
      )
    ).toEqual({ _id: "a", "texture.src": "t/goblin-dead.webp", [flag("look")]: "dead" });
  });
  it("back to base: the image, the look flag removed, the base flag kept", () => {
    expect(
      tokenUpdate({ id: "a", src: "t/goblin-dead.webp", flags: { base: B, look: "dead" } }, { base: B, look: null })
    ).toEqual({
      _id: "a",
      "texture.src": B,
      [flag("-=look")]: null
    });
  });
  it("at base with only a base flag: nothing to write", () => {
    expect(tokenUpdate({ id: "a", src: B, flags: { base: B } }, { base: B, look: null })).toBeNull();
  });
  it("a new base adopted while a look is worn: the base flag follows", () => {
    expect(
      tokenUpdate(
        { id: "a", src: "t/bear.webp", flags: { base: B, look: "ready" } },
        { base: "t/bear.webp", look: "ready", lookSrc: "t/bear-ready.webp" }
      )
    ).toEqual({ _id: "a", "texture.src": "t/bear-ready.webp", [flag("base")]: "t/bear.webp" });
  });
  it("a new base adopted at rest: the stale base flag is corrected, the look flag dropped", () => {
    expect(
      tokenUpdate(
        { id: "a", src: "t/bear.webp", flags: { base: B, look: "ready" } },
        { base: "t/bear.webp", look: null }
      )
    ).toEqual({
      _id: "a",
      [flag("base")]: "t/bear.webp",
      [flag("-=look")]: null
    });
  });
  it("a look with no file of its own falls back to the base image, flags still set", () => {
    expect(tokenUpdate({ id: "a", src: B, flags: {} }, { base: B, look: "ready", lookSrc: null })).toEqual({
      _id: "a",
      [flag("base")]: B,
      [flag("look")]: "ready"
    });
  });
  describe("the dynamic ring's subject", () => {
    const SB = "t/goblin-subject.webp";
    it("swaps with the look when its own look file exists", () => {
      expect(
        tokenUpdate(
          { id: "a", src: B, subject: SB, flags: {} },
          {
            base: B,
            look: "dead",
            lookSrc: "t/goblin-dead.webp",
            subjectBase: SB,
            subjectLookSrc: "t/goblin-subject-dead.webp"
          }
        )
      ).toEqual({
        _id: "a",
        "texture.src": "t/goblin-dead.webp",
        "ring.subject.texture": "t/goblin-subject-dead.webp",
        [flag("base")]: B,
        [flag("look")]: "dead",
        [flag("subject")]: SB
      });
    });
    it("stays at its base when its look file is missing", () => {
      const u = tokenUpdate(
        { id: "a", src: B, subject: SB, flags: {} },
        { base: B, look: "dead", lookSrc: "t/goblin-dead.webp", subjectBase: SB, subjectLookSrc: null }
      );
      expect(u["ring.subject.texture"]).toBeUndefined();
      expect(u[flag("subject")]).toBe(SB);
    });
    it("comes back with the base", () => {
      expect(
        tokenUpdate(
          {
            id: "a",
            src: "t/goblin-dead.webp",
            subject: "t/goblin-subject-dead.webp",
            flags: { base: B, look: "dead", subject: SB }
          },
          { base: B, look: null, subjectBase: SB }
        )
      ).toEqual({ _id: "a", "texture.src": B, "ring.subject.texture": SB, [flag("-=look")]: null });
    });
    it("a token with no subject writes nothing about one", () => {
      const u = tokenUpdate(
        { id: "a", src: B, subject: null, flags: {} },
        { base: B, look: "ready", lookSrc: "t/goblin-ready.webp" }
      );
      expect(Object.keys(u)).toEqual(["_id", "texture.src", flag("base"), flag("look")]);
    });
  });
});

describe("restoreUpdate — back to base and forgotten", () => {
  it("a token the module never touched: nothing", () => {
    expect(restoreUpdate({ id: "a", src: "t/g.webp", flags: {} })).toBeNull();
  });
  it("wearing a look: the base image back and the whole flag scope gone", () => {
    expect(restoreUpdate({ id: "a", src: "t/g-dead.webp", flags: { base: "t/g.webp", look: "dead" } })).toEqual({
      _id: "a",
      "texture.src": "t/g.webp",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
  });
  it("at base with a base flag: only the flags go", () => {
    expect(restoreUpdate({ id: "a", src: "t/g.webp", flags: { base: "t/g.webp" } })).toEqual({
      _id: "a",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
  });
  it("the ring subject comes back too", () => {
    expect(
      restoreUpdate({
        id: "a",
        src: "t/g-dead.webp",
        subject: "t/s-dead.webp",
        flags: { base: "t/g.webp", look: "dead", subject: "t/s.webp" }
      })
    ).toEqual({
      _id: "a",
      "texture.src": "t/g.webp",
      "ring.subject.texture": "t/s.webp",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
  });
  it("an image the module never put there stays: only the flags go", () => {
    // A token pasted while paused carries the flags of the one it was copied from; its image was then
    // changed by hand, which nothing adopted. Restore All must not undo the hand change.
    expect(restoreUpdate({ id: "a", src: "t/bear.webp", flags: { base: "t/g.webp", look: "dead" } })).toEqual({
      _id: "a",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
    expect(
      restoreUpdate({
        id: "a",
        src: "t/g-dead.webp",
        subject: "t/other.webp",
        flags: { base: "t/g.webp", look: "dead", subject: "t/s.webp" }
      })
    ).toEqual({ _id: "a", "texture.src": "t/g.webp", [`flags.-=${FLAG_SCOPE}`]: null });
  });
  it("a look worn under the previous separator still comes back", () => {
    expect(restoreUpdate({ id: "a", src: "t/g_dead.webp", flags: { base: "t/g.webp", look: "dead" } }, "-")).toEqual({
      _id: "a",
      "texture.src": "t/g.webp",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
  });
});

describe("lookCandidate — the base a look-shaped name points at, for the server to confirm", () => {
  it("reads the base and the look out of the name", () => {
    expect(lookCandidate("t/goblin-dead.webp")).toEqual({ base: "t/goblin.webp", look: "dead" });
    expect(lookCandidate("t/goblin.combat.webp", ".")).toEqual({ base: "t/goblin.webp", look: "combat" });
    expect(lookCandidate("x/g-ready.webm?v=3")).toEqual({ base: "x/g.webm?v=3", look: "ready" });
  });
  it("a name ending in a word that is no look is no candidate", () => {
    expect(lookCandidate("t/goblin-prone.webp")).toBeNull();
  });
  it("a name that merely ends in a look word is a candidate too; the file probe decides", () => {
    expect(lookCandidate("z/walking-dead.webp")).toEqual({ base: "z/walking.webp", look: "dead" });
  });
  it("null for a base, a bare suffix, another separator, or junk", () => {
    expect(lookCandidate("t/goblin.webp")).toBeNull();
    expect(lookCandidate("t/-dead.webp")).toBeNull();
    expect(lookCandidate("t/goblin_dead.webp")).toBeNull();
    expect(lookCandidate("t/goblin_dead.webp", "_")).toEqual({ base: "t/goblin.webp", look: "dead" });
    expect(lookCandidate(null)).toBeNull();
    expect(lookCandidate("")).toBeNull();
  });
  it("agrees with isLookOf both ways", () => {
    const c = lookCandidate("t/giant-owl-combat.webp");
    expect(isLookOf("t/giant-owl-combat.webp", c.base)).toBe(c.look);
  });
});

describe("stillCurrent — the plans still safe to write once planning is over", () => {
  const notes = { a: { from: "t/a.png" }, b: { from: "t/b.png" }, c: { from: "t/c.png" } };
  const updates = [
    { _id: "a", "texture.src": "t/a-ready.png" },
    { _id: "b", "texture.src": "t/b-ready.png" },
    { _id: "c", "texture.src": "t/c-ready.png" }
  ];
  it("keeps a token that still wears what its plan started from", () => {
    expect(stillCurrent(updates, notes, () => "t/a.png")).toEqual([updates[0]]);
  });
  it("drops a token deleted meanwhile (it would fail the whole batch)", () => {
    const worn = { a: "t/a.png", b: null, c: "t/c.png" };
    expect(stillCurrent(updates, notes, id => worn[id])).toEqual([updates[0], updates[2]]);
  });
  it("drops a token whose image someone else changed meanwhile (its own event re-plans it)", () => {
    const worn = { a: "t/a.png", b: "t/bear.png", c: "t/c.png" };
    expect(stillCurrent(updates, notes, id => worn[id])).toEqual([updates[0], updates[2]]);
  });
  it("drops a plan with no note", () => {
    expect(stillCurrent([{ _id: "z" }], notes, () => "t/z.png")).toEqual([]);
  });
});

describe("withDeletionOperators — Foundry 14's deletion operators for the legacy -= keys", () => {
  const DEL = Symbol("ForcedDeletion");
  it("turns a flag deletion into the key with an operator, the rest untouched", () => {
    expect(
      withDeletionOperators({ _id: "a", "texture.src": "t/g.webp", [`flags.${FLAG_SCOPE}.-=look`]: null }, () => DEL)
    ).toEqual({ _id: "a", "texture.src": "t/g.webp", [`flags.${FLAG_SCOPE}.look`]: DEL });
  });
  it("turns the whole-scope deletion Restore All writes", () => {
    expect(withDeletionOperators({ _id: "a", [`flags.-=${FLAG_SCOPE}`]: null }, () => DEL)).toEqual({
      _id: "a",
      [`flags.${FLAG_SCOPE}`]: DEL
    });
  });
  it("makes a fresh operator per key and leaves a -= inside a value or a non-null value alone", () => {
    let n = 0;
    const out = withDeletionOperators({ "a.-=x": null, "b.-=y": null, "c-=d": null, "-=e": 1 }, () => ++n);
    expect(out).toEqual({ "a.x": 1, "b.y": 2, "c-=d": null, "-=e": 1 });
  });
});

describe("the ring subject falls through on its own (D2 for the subject, #2)", () => {
  const B = "t/goblin.webp";
  const SB = "t/goblin-subject.webp";
  const flag = key => `flags.${FLAG_SCOPE}.${key}`;

  it("the image dead, the subject with no dead file: the subject wears its own combat look", () => {
    expect(
      tokenUpdate(
        { id: "a", src: B, subject: SB, flags: {} },
        {
          base: B,
          look: "dead",
          lookSrc: "t/goblin-dead.webp",
          subjectBase: SB,
          subjectLook: "combat",
          subjectLookSrc: "t/goblin-subject-combat.webp"
        }
      )
    ).toEqual({
      _id: "a",
      "texture.src": "t/goblin-dead.webp",
      "ring.subject.texture": "t/goblin-subject-combat.webp",
      [flag("base")]: B,
      [flag("look")]: "dead",
      [flag("subject")]: SB,
      [flag("subjectLook")]: "combat"
    });
  });
  it("the image at its base, the subject with a look: the flags still record both bases", () => {
    expect(
      tokenUpdate(
        { id: "a", src: B, subject: SB, flags: {} },
        { base: B, look: null, subjectBase: SB, subjectLook: "ready", subjectLookSrc: "t/goblin-subject-ready.webp" }
      )
    ).toEqual({
      _id: "a",
      "ring.subject.texture": "t/goblin-subject-ready.webp",
      [flag("base")]: B,
      [flag("subject")]: SB,
      [flag("subjectLook")]: "ready"
    });
  });
  it("the subject's look the same as the image's: no subjectLook flag", () => {
    const u = tokenUpdate(
      { id: "a", src: B, subject: SB, flags: {} },
      {
        base: B,
        look: "dead",
        lookSrc: "t/goblin-dead.webp",
        subjectBase: SB,
        subjectLook: "dead",
        subjectLookSrc: "t/goblin-subject-dead.webp"
      }
    );
    expect(u?.[flag("subjectLook")]).toBeUndefined();
  });
  it("the subject catching up with the image: its subjectLook flag goes", () => {
    expect(
      tokenUpdate(
        {
          id: "a",
          src: "t/goblin-dead.webp",
          subject: "t/goblin-subject-combat.webp",
          flags: { base: B, look: "dead", subject: SB, subjectLook: "combat" }
        },
        {
          base: B,
          look: "dead",
          lookSrc: "t/goblin-dead.webp",
          subjectBase: SB,
          subjectLook: "dead",
          subjectLookSrc: "t/goblin-subject-dead.webp"
        }
      )
    ).toEqual({ _id: "a", "ring.subject.texture": "t/goblin-subject-dead.webp", [flag("-=subjectLook")]: null });
  });
  it("both back at base: the look flags go, the bases stay", () => {
    expect(
      tokenUpdate(
        {
          id: "a",
          src: B,
          subject: "t/goblin-subject-ready.webp",
          flags: { base: B, subject: SB, subjectLook: "ready" }
        },
        { base: B, look: null, subjectBase: SB, subjectLook: null }
      )
    ).toEqual({ _id: "a", "ring.subject.texture": SB, [flag("-=subjectLook")]: null });
  });
  it("subjectLookOf reads the subject's own flag, else the image's", () => {
    expect(subjectLookOf({ look: "dead", subjectLook: "combat" })).toBe("combat");
    expect(subjectLookOf({ look: "dead" })).toBe("dead");
    expect(subjectLookOf(undefined)).toBeUndefined();
  });
  it("Restore All recognises a subject wearing its own look", () => {
    expect(
      restoreUpdate({
        id: "a",
        src: "t/goblin-dead.webp",
        subject: "t/goblin-subject-combat.webp",
        flags: { base: B, look: "dead", subject: SB, subjectLook: "combat" }
      })
    ).toEqual({ _id: "a", "texture.src": B, "ring.subject.texture": SB, [`flags.-=${FLAG_SCOPE}`]: null });
  });
});

describe("stashedBase / stashUpdate — a look dnd5e stored for a transform's revert (#1, #3)", () => {
  const B = "t/druid.webp";

  it("a look of the recorded base stored: the base goes in its place", () => {
    expect(stashedBase("t/druid-ready.webp", B, "ready")).toBe(B);
  });
  it("the look the flags name under another separator: still the base", () => {
    expect(stashedBase("t/druid_dead.webp", B, "dead")).toBe(B);
  });
  it("the base itself stored, or nothing recorded: nothing to fix", () => {
    expect(stashedBase(B, B, "ready")).toBeNull();
    expect(stashedBase("t/druid-ready.webp", undefined, undefined)).toBeNull();
    expect(stashedBase(null, B, "ready")).toBeNull();
  });
  it("an image that is no look of the base (the form's own art): nothing to fix", () => {
    expect(stashedBase("t/wolf-ready.webp", B, "ready")).toBeNull();
  });
  it("stashUpdate writes only the stored images that need it", () => {
    expect(stashUpdate({ src: B, subject: null })).toEqual({ [STASH_KEYS.src]: B });
    expect(stashUpdate({ subject: "t/s.webp" })).toEqual({ [STASH_KEYS.subject]: "t/s.webp" });
    expect(stashUpdate({})).toEqual({});
  });
  it("the stash keys are dnd5e's", () => {
    expect(STASH_KEYS).toEqual({
      src: "flags.dnd5e.previousTokenData.texture.src",
      subject: "flags.dnd5e.previousTokenData.ring.subject.texture"
    });
  });
});

describe("browseTarget / samePath — a folder listing instead of a HEAD per file (#5)", () => {
  it("a world asset: the data source, its folder", () => {
    expect(browseTarget("worlds/w/assets/tokens/goblin.webp")).toEqual({
      source: "data",
      dir: "worlds/w/assets/tokens",
      path: "worlds/w/assets/tokens/goblin.webp"
    });
  });
  it("a core icon: the public source", () => {
    expect(browseTarget("icons/svg/mystery-man.svg")).toEqual({
      source: "public",
      dir: "icons/svg",
      path: "icons/svg/mystery-man.svg"
    });
  });
  it("a leading slash is dropped, a file at the root lists the root", () => {
    expect(browseTarget("/modules/m/t.webp")?.path).toBe("modules/m/t.webp");
    expect(browseTarget("goblin.webp")).toEqual({ source: "data", dir: "", path: "goblin.webp" });
  });
  it("URLs, query strings, inline data and parent folders are left to a HEAD", () => {
    expect(browseTarget("https://assets.forge-vtt.com/x/goblin.webp")).toBeNull();
    expect(browseTarget("worlds/w/goblin.webp?v=2")).toBeNull();
    expect(browseTarget("data:image/png;base64,AAAA")).toBeNull();
    expect(browseTarget("worlds/../goblin.webp")).toBeNull();
    expect(browseTarget("")).toBeNull();
    expect(browseTarget(undefined)).toBeNull();
  });
  it("samePath reads an encoded and a plain path alike, and leaves a broken escape as it is", () => {
    expect(samePath("t/my%20goblin.webp")).toBe("t/my goblin.webp");
    expect(samePath("t/my goblin.webp")).toBe("t/my goblin.webp");
    expect(samePath("t/100%.webp")).toBe("t/100%.webp");
  });
});
