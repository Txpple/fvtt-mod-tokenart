# fvtt-mod-tokenart — working notes for sessions in this repo

**What this is.** Open Roll 5e: Token Art, a Foundry VTT module: every token wears the look of its
state (ready, combat, prone, dead), each a file named beside the base art, with nothing to
configure. Part of Open Roll 5e (the suite repo is `..`, its CLAUDE.md has the family's
conventions; the plan this was built from is `../docs/plans/tokenart.md`). Plain ES modules, no
build step, no patching beyond one manual wrap, no libWrapper, no socketlib, MIT.

**State (2026-10-15).** Built from the plan on 2026-10-15; `npm run verify` green (58 tests);
deployed to the sandbox with the dnd5e MCP's `deploy-house-module.mjs --local`, registered there by a
restart of the local Foundry process (a new module's folder is scanned at process boot), enabled, and
walked: all twelve steps of `tools/README.md` green (the results are under the list; step 12's
"then disabled" half failed on the first build and passed on the world-pause build, re-run after the
By the Books battery that held the sandbox meanwhile). The walk changed the build four times:
decisions read the token's stored image (`_source`), never the prepared one, since Foundry animates a
texture change and the prepared `texture.src` lags the source; Rescan rides a hidden world setting so
any GM window's press reaches the active GM; a token found wearing a look-shaped image with no flags
is recognised as that look when the base file exists (dnd5e's `revertOriginalForm` hands the stored
image back and drops every flag); and Restore All pauses the whole world, not one client, since the
MCP's `configure-modules.mjs` page is a GM client that runs the module. **Released as 1.0.0 on
2026-10-15** (tag `v1.0.0` at 110d743, the zip and `module.json` on the release) and installed on
prod the same day through Foundry's installer (`register-module.mjs` from the GitHub manifest, a new
module needs `/setup`'s `installPackage`, never a world bounce), then `configure-modules.mjs
--enable` and a second installer run as the bounce; the DM's own window was the one connection
dropped. The sandbox runs the same bytes as a dev copy (`--local`). The sandbox was left with the module enabled and
unpaused, Party Camp active, the walk's scenes deleted, no combats and no Token Art flags on any
token; the walk's art stays under `assets/tokenart-walk/` (nine small PNGs: `x.png` and its four
looks, and a `wild/` folder) for trying the module. The BTB test actors the walk borrowed were gone
by then, torn down by the battery, so nothing of theirs needed restoring. **1.0.1 the same day**: a correctness review by a session that did not build it, with an independent second
read beside it, found fifteen things, all fixed (`audits/review-2026-10-15.md` has each with its fix; the
design points it left are the repo's issues #1–#4): the wildcard filter kept a look whose base the wildcard
never matched (`goblin-*.webp` lists `goblin-dead.webp`, never `goblin.webp`; `lookCandidatesOutside` plus one
cached probe of the candidate base, GM clients only, settles it); a change of the separator setting adopted a
worn look as a new base (`baseOf` recognises the look the flags name under every separator); Restore All put
the flagged base over an image the module never adopted (`restoreUpdate` restores only from the base's own
looks); Restore All raced an in-flight batch (the seat and the pause are re-checked before each scene's write;
`restoreAll` awaits the chain); a Rescan during a running reconcile was swallowed (`reconcileAll` queues one
more pass); a stale plan overwrote a concurrent image change, and a token deleted meanwhile failed its scene's
whole batch (`stillCurrent` drops both before the write); the ring subject dnd5e's revert hands back was
adopted as a base of its own (`resolveBase` for the subject too), and Restore All with the ring off left the
subject's look stored (`stored().subjectSet`); `updateCombatant` and `createScene` are heard; a world actor's
unlinked tokens follow its edits; `tokenart.changed` fires only when the image changed; and every `-=` deletion
key becomes a `ForcedDeletion` operator on Foundry 14, which logs a compatibility warning on every legacy key
and drops them in 16 (`withDeletionOperators`; 13 keeps the keys). `npm run verify` green (73 tests). The
three live checks owed (a back-to-base swap, Restore All then Rescan, the wildcard with an unmatched base) ran
green on the sandbox through a GM page script with the console captured, zero deletion-key warnings; the
check's first run taught that a fresh NPC with no Hit Points sits at 0 and wears its dead look (D1). Released
as **1.0.1** (tag `v1.0.1`, both assets on the release); the sandbox carries the same bytes (`--local`).

## The decisions (taken 2026-10-15, the plan's D1–D4)

- **D1. One dead rule for all.** 0 Hit Points or the `dead` status wears the dead look, player
  characters included (dying by the book; the table's call, as Combat Plus's Auto-Defeated). A
  `down` look for a dying PC is one more word in `LOOKS` and one more place in `PRECEDENCE` if
  wanted later.
- **D2. A missing look falls through** to the next that applies and exists: dead → prone → combat
  → ready → base. A look switched off counts as missing.
- **D3. Combat from the tracker**, the moment a token is added, started or not; removed, or the
  combat deleted, it comes off.
- **D4. The name** Token Art: free on the setup screen's package list on 2026-10-15 (6,988
  modules; neighbours Show Token Art, Token Variant Art, Automatic Token Image, Token Alt Image
  Toggle, Update Token Image).

## How the code is laid out

- `scripts/decide/looks.js` (`// @ts-check`, pure, no Foundry): `splitPath`, `lookPath`,
  `lookPaths`, `isLookOf`, `baseOf` (adoption against recognition), `stateOf`, `applicable`,
  `winningLook` (the D2 chain), `withoutLooks` (the wildcard filter), `tokenUpdate` (the write,
  flat keys, or null), `restoreUpdate`. Everything here has a test in `tests/`.
- `scripts/tokenart.js` (the Foundry side): the settings, the probe cache (`srcExists`, a HEAD per
  look path, once per base per GM session, misses included, six at a time), the writer (one
  `updateEmbeddedDocuments` per scene, the `tokenart` option carrying each token's `{ from, to,
  look }`), the document hooks, the `Actor#getTokenImages` wrap, the API and the
  `tokenart.changed` hook.
- **Who acts:** the active GM's client (`game.users.activeGM?.isSelf`). Every GM client computes the
  same look, so a second GM window's write is a no-op diff; no leading-window election. The active
  GM may be the bridge's headless client; nothing here needs a canvas.
- **Flat keys on the write** (`"texture.src"`): By the Books measured a nested `texture` object
  leaving the prepared texture stale on 14.369.
- **Read the source, not the prepared data** (`stored()` in tokenart.js). Foundry 13+ animates a
  token's texture change, and the document's prepared `texture.src` only takes the new value when
  the fade ends; a window whose canvas is throttled (a hidden pane, a background tab) can hold the
  old value for good. `_source.texture.src` is right at once. The same goes for the ring subject.
- **The base is resolved in three steps** (`resolveBase`): the flags recognise the image worn (the
  base or one of its looks); else a look-shaped name whose base file exists is that look
  (`lookCandidate` names it, one cached HEAD confirms it); else the image is adopted as the base.
  The probe is what keeps `walking-dead.webp` a base when no `walking.webp` sits beside it.
- **Writes run one at a time** (`applyTokens` chains): a `ready` reconcile and an event in the
  same second both read the token fresh when their turn comes.
- **Every look is per token, so a linked actor with two placed tokens swaps both**, and a listener
  on `tokenart.changed` hears one call per token (the walk's "double" was that, not a double write).
- **The marker option.** The module's own `updateToken` is told apart by `options.tokenart`; every
  client fires `tokenart.changed` from it. Anyone else's `texture.src` change on the active GM
  re-resolves the token through `baseOf`: a look of the known base is recognised, anything else is
  adopted as the new base.
- **Restore All** sets a hidden world setting (`paused`) before it writes, so every client, the
  bridge's included, stays quiet until **Rescan** is pressed, and the module can be disabled without
  the looks coming back. The first build paused the pressing client only, and the walk's step 12
  caught it: the dnd5e MCP's `configure-modules.mjs` joins as a GM to write the disable, its page
  ran the module, and its `ready` reconcile dressed the restored tokens again before the bounce.
  **Rescan** clears the pause and sets a hidden world setting (`rescan`, a timestamp); its
  `onChange` clears every client's cache and the active GM's client reconciles, so the button works
  from any GM window.

## Conventions this repo keeps

- Biome and Vitest copied from By the Books (the family's rule when a small module grows tooling);
  `npm run verify` is `check`, `typecheck`, `manifest` and `test`, and its real exit code is the
  verdict (never piped into `tail` or `grep`).
- The "Part of Open Roll 5e" README section is generated by the suite's `tools/suite-sections.mjs`;
  never edit between its markers by hand.
- Releases by hand: bump `version` and `download` together (`tools/check-manifest.mjs` refuses a
  mismatch), tag `vX.Y.Z`, attach `module.json` and `fvtt-mod-tokenart.zip`. A patch by default;
  a minor only when the user names one.
- Issues welcome, pull requests not accepted (`.github/PULL_REQUEST_TEMPLATE.md`).
- Out of scope, kept for later: more looks (`down`, `hidden`, `concentrating`), a Token Config tab
  listing the looks found and missing, an imagegen tool making the four looks from a base, FX
  Studio's puff on `tokenart.changed`, the MCP audit recognising look files as referenced.
