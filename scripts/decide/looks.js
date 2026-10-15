// @ts-check
/**
 * Token Art — the DECISION layer: which file a token should wear, from plain data. ⚠ PURE: no
 * `game`, no `foundry`, no imports; everything here is unit-tested in tests/.
 *
 * The convention: the base is the token's own image (`assets/tokens/goblin.webp`); a look is the
 * same name with a suffix before the extension, in the same folder (`goblin-dead.webp`).
 * Derivation runs one way, base → looks: a base is never read out of a look's name, so a token
 * placed as `walking-dead.webp` has the base `walking-dead.webp` and the looks
 * `walking-dead-dead.webp` and so on.
 */

/** The looks, in the order the README lists them. */
export const LOOKS = Object.freeze(["ready", "combat", "prone", "dead"]);

/** Which look wins when several apply: a dead creature is dead whatever else is true. */
export const PRECEDENCE = Object.freeze(["dead", "prone", "combat", "ready"]);

/** The separators a table may pick; "-" is the one By the Books' Summon Art already reads. */
export const SEPARATORS = Object.freeze(["-", "_", "."]);

/**
 * The flag scope the module writes on a token: `base` (the path to return to), `look` (the one
 * worn now, absent at base) and `subject` (the dynamic ring subject's base, when the token has
 * one). Nothing is written on the actor or the prototype token.
 */
export const FLAG_SCOPE = "fvtt-mod-tokenart";

/**
 * A path in three parts: everything up to the extension, the extension with its dot, and the
 * query string from its "?" (a Forge or S3 URL carries one). The extension is the last dot of the
 * file name alone, never one in a folder name; a file with no dot has none.
 * @param {unknown} path
 * @returns {{ stem: string, ext: string, query: string }}
 */
export function splitPath(path) {
  const s = String(path ?? "");
  const q = s.indexOf("?");
  const query = q >= 0 ? s.slice(q) : "";
  const body = q >= 0 ? s.slice(0, q) : s;
  const slash = Math.max(body.lastIndexOf("/"), body.lastIndexOf("\\"));
  const dot = body.lastIndexOf(".");
  if (dot <= slash + 1) return { stem: body, ext: "", query };
  return { stem: body.slice(0, dot), ext: body.slice(dot), query };
}

/**
 * The path a look's file has beside a base: `goblin.webp` → `goblin-dead.webp`, the folder, the
 * extension and the query string kept.
 * @param {string} base
 * @param {string} look
 * @param {string} [separator]
 * @returns {string}
 */
export function lookPath(base, look, separator = "-") {
  const { stem, ext, query } = splitPath(base);
  return `${stem}${separator}${look}${ext}${query}`;
}

/**
 * Every look's path for a base, keyed by look.
 * @param {string} base
 * @param {string} [separator]
 * @returns {Record<string, string>}
 */
export function lookPaths(base, separator = "-") {
  return Object.fromEntries(LOOKS.map(look => [look, lookPath(base, look, separator)]));
}

/**
 * The look `path` is of `base`, or null: `goblin-dead.webp` is the dead look of `goblin.webp`.
 * Exact, query string included.
 * @param {unknown} path
 * @param {unknown} base
 * @param {string} [separator]
 * @returns {string|null}
 */
export function isLookOf(path, base, separator = "-") {
  if (typeof path !== "string" || typeof base !== "string" || !path || !base) return null;
  return LOOKS.find(look => lookPath(base, look, separator) === path) ?? null;
}

/**
 * The base and look a path would be the look of, by its name alone: `t/goblin-dead.webp` →
 * `{ base: "t/goblin.webp", look: "dead" }`; null when the name ends in no look suffix. A name
 * alone proves nothing (`walking-dead.webp` may be a base), so the caller asks the server whether
 * the candidate base exists before believing it; that is the one place a base is read out of a
 * look's name, for a token that wears a look with no record of its base (a module that stored the
 * image and handed it back, dnd5e's revert of a transform among them).
 * @param {unknown} path
 * @param {string} [separator]
 * @returns {{ base: string, look: string }|null}
 */
export function lookCandidate(path, separator = "-") {
  if (typeof path !== "string" || !path) return null;
  const { stem, ext, query } = splitPath(path);
  for (const look of LOOKS) {
    const suffix = `${separator}${look}`;
    if (!stem.endsWith(suffix)) continue;
    const rest = stem.slice(0, -suffix.length);
    const name = rest.slice(Math.max(rest.lastIndexOf("/"), rest.lastIndexOf("\\")) + 1);
    if (!name) return null;
    return { base: `${rest}${ext}${query}`, look };
  }
  return null;
}

/**
 * A token's base: the one its flags remember when the image it wears is that base or one of its
 * looks (a snapshot restored while prone hands a prone look back, and that is a look, not a new
 * base); otherwise the image it wears, which is how a Token Config edit, a transform or a summon's
 * landing becomes the base.
 * @param {{ src?: string|null, flags?: { base?: string } }} token
 * @param {string} [separator]
 * @returns {string}
 */
export function baseOf({ src, flags }, separator = "-") {
  const known = flags?.base;
  const worn = src ?? "";
  if (known && (worn === known || isLookOf(worn, known, separator))) return known;
  return worn;
}

/**
 * What is true of a creature: dead at 0 Hit Points (dnd5e floors at 0, so "below" is "at") or
 * with the dead status, one rule for everyone (a character at 0 is dying by the book; the table's
 * call); prone with the prone status; in combat when a combat lists its token.
 * @param {{ hp?: number|null, statuses?: Set<string>|string[]|null, inCombat?: boolean }} facts
 * @returns {{ dead: boolean, prone: boolean, combat: boolean }}
 */
export function stateOf({ hp, statuses, inCombat }) {
  const has = (/** @type {string} */ id) =>
    statuses instanceof Set ? statuses.has(id) : Array.isArray(statuses) ? statuses.includes(id) : false;
  return {
    dead: (typeof hp === "number" && hp <= 0) || has("dead"),
    prone: has("prone"),
    combat: Boolean(inCombat)
  };
}

/**
 * The looks a state asks for, strongest first; ready always, as the floor above base.
 * @param {{ dead?: boolean, prone?: boolean, combat?: boolean }|null|undefined} state
 * @returns {string[]}
 */
export function applicable(state) {
  return PRECEDENCE.filter(look => look === "ready" || Boolean(state?.[look]));
}

/**
 * The look to wear: the first that applies, is switched on and has a file; null means the base.
 * A missing file falls through to the next that applies, so a creature with only a ready look
 * keeps it through a fight instead of flipping to base on the tracker's first row.
 * @param {{ dead?: boolean, prone?: boolean, combat?: boolean }} state
 * @param {Set<string>|Record<string, boolean>|null|undefined} available   the looks whose files exist
 * @param {Record<string, boolean>} [enabled]   the settings; a look absent here counts as on
 * @returns {string|null}
 */
export function winningLook(state, available, enabled = {}) {
  const has = (/** @type {string} */ look) =>
    available instanceof Set ? available.has(look) : Boolean(available?.[look]);
  const on = (/** @type {string} */ look) => enabled?.[look] !== false;
  return applicable(state).find(look => on(look) && has(look)) ?? null;
}

/**
 * A wildcard list without the look files of the bases in it: `goblin-1-dead.webp` goes when
 * `goblin-1.webp` is there; `walking-dead.webp` stays unless `walking.webp` is. Order kept.
 * @param {unknown} paths
 * @param {string} [separator]
 * @returns {string[]}
 */
export function withoutLooks(paths, separator = "-") {
  const list = Array.isArray(paths) ? paths.filter(p => typeof p === "string") : [];
  return list.filter(p => !list.some(q => q !== p && isLookOf(p, q, separator)));
}

/**
 * @typedef {object} TokenNow
 * @property {string} id
 * @property {string} src                      the image the token wears
 * @property {string|null} [subject]           the ring subject's image when the ring is on and one is set, else null
 * @property {{ base?: string, look?: string, subject?: string }} [flags]   this module's flags on the token
 */

/**
 * @typedef {object} TokenTarget
 * @property {string} base                     the base the token returns to
 * @property {string|null} look                the look to wear, null for the base
 * @property {string|null} [lookSrc]           that look's file
 * @property {string|null} [subjectBase]       the ring subject's base, when the token has one
 * @property {string|null} [subjectLookSrc]    the subject's file for that look, when it exists
 */

/**
 * The update a token needs, with flat keys (a nested `texture` object left the prepared texture
 * stale on 14.369), or null when it already wears the right image with the right flags. A token
 * at its base that this module never touched gets nothing written; one it did keeps its `base`
 * flag and loses `look`.
 * @param {TokenNow} current
 * @param {TokenTarget} target
 * @returns {Record<string, unknown>|null}
 */
export function tokenUpdate(current, target) {
  const { id, src, subject = null, flags = {} } = current;
  const { base, look, lookSrc = null, subjectBase = null, subjectLookSrc = null } = target;
  const wantSrc = look ? (lookSrc ?? base) : base;
  const wantSubject =
    subject == null || subjectBase == null ? null : look && subjectLookSrc ? subjectLookSrc : subjectBase;
  const touched = flags.base !== undefined || flags.look !== undefined || flags.subject !== undefined;
  /** @type {Record<string, unknown>} */
  const u = {};
  if (src !== wantSrc) u["texture.src"] = wantSrc;
  if (wantSubject != null && subject !== wantSubject) u["ring.subject.texture"] = wantSubject;
  if (look) {
    if (flags.base !== base) u[`flags.${FLAG_SCOPE}.base`] = base;
    if (flags.look !== look) u[`flags.${FLAG_SCOPE}.look`] = look;
    if (subjectBase != null && flags.subject !== subjectBase) u[`flags.${FLAG_SCOPE}.subject`] = subjectBase;
  } else if (touched) {
    if (flags.base !== undefined && flags.base !== base) u[`flags.${FLAG_SCOPE}.base`] = base;
    if (flags.look !== undefined) u[`flags.${FLAG_SCOPE}.-=look`] = null;
    if (subjectBase != null && flags.subject !== undefined && flags.subject !== subjectBase) {
      u[`flags.${FLAG_SCOPE}.subject`] = subjectBase;
    }
  }
  if (!Object.keys(u).length) return null;
  return { _id: id, ...u };
}

/**
 * The update that puts a token back at its base and forgets it: the step before the module is
 * disabled or uninstalled. Null for a token the module never touched.
 * @param {TokenNow} current
 * @returns {Record<string, unknown>|null}
 */
export function restoreUpdate({ id, src, subject = null, flags = {} }) {
  if (flags.base === undefined && flags.look === undefined && flags.subject === undefined) return null;
  /** @type {Record<string, unknown>} */
  const u = {};
  if (flags.base && src !== flags.base) u["texture.src"] = flags.base;
  if (subject != null && flags.subject && subject !== flags.subject) u["ring.subject.texture"] = flags.subject;
  u[`flags.-=${FLAG_SCOPE}`] = null;
  return { _id: id, ...u };
}
