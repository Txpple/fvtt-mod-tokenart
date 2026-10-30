# fvtt-mod-tokenart — working notes for sessions in this repo

**What this is.** Open Roll 5e: Token Art, a Foundry VTT module: every token wears the look of its
state (ready, combat, dead), each a file named beside the base art, with nothing to
configure. Part of Open Roll 5e (the suite repo is `..`, its CLAUDE.md has the family's
conventions; the plan this was built from is `../docs/plans/tokenart.md`). Plain ES modules, no
build step, no patching beyond one manual wrap, no libWrapper, no socketlib, MIT.

**State (2026-10-30).** 1.0.3 is released (both assets) and on prod through the installer (read
back from a GM page: version 1.0.3, active, not paused; a rescan of the world sent 6 folder listings
and no HEAD request). It closed every open issue, #1–#5: a look-shaped name is a base, dnd5e's
transform stash gets the base, the ring subject falls through on its own, Restore All runs on the
active GM's client, the probes list folders. The sandbox runs the same bytes (`--local`), with the
live check's art under `assets/tokenart-check/` (ten copies of one image; the next mirror removes
it). `npm run verify` is green (97 tests). The 1.0.1 review's findings are
`audits/review-2026-10-15.md`; how it was built, walked and released: `docs/log/2026-10.md`.

## The decisions (the plan's D1–D4)

- **D1. One dead rule for all.** 0 Hit Points or the `dead` status wears the dead look, player
  characters included (dying by the book; the table's call, as Combat Plus's Auto-Defeated). A
  `down` look for a dying PC is one more word in `LOOKS` and one more place in `PRECEDENCE` if
  wanted later.
- **D2. A missing look falls through** to the next that applies and exists: dead → combat → ready
  → base. A look switched off counts as missing.
- **D3. Combat from the tracker**, the moment a token is added, started or not; removed, or the
  combat deleted, it comes off.
- **D4. The name** Token Art: free on the setup screen's package list when it was chosen (the
  count and its neighbours there are in the log).
- **D5. No prone look** (1.0.2, on the user's word): the Prone condition is not a state, and the
  `prone` word is no look. A `-prone` file beside a base is an ordinary image (a wildcard may draw
  it; the table deletes or renames the ones it made). A token upgraded while flagged `look: "prone"`
  is still recognised by its flags and returns to its base at the first reconcile; the old
  `proneLook` setting is no longer registered, its stored entry read by nothing.

## How the code is laid out

- `scripts/decide/looks.js` (`// @ts-check`, pure, no Foundry): `splitPath`, `lookPath`,
  `lookPaths`, `isLookOf`, `baseOf` (adoption against recognition), `stateOf`, `applicable`,
  `winningLook` (the D2 chain), `withoutLooks` (the wildcard filter), `tokenUpdate` (the write,
  flat keys, or null), `restoreUpdate`, `stashedBase` / `stashUpdate` (dnd5e's transform stash),
  `browseTarget` / `samePath` (the folder listing). Everything here has a test in `tests/`.
- `scripts/tokenart.js` (the Foundry side): the settings, the probe cache (one listing per folder
  through `FilePicker.browse`, a socket call that logs no 404; a HEAD only where a path cannot be
  listed; only definite answers kept, a network error or timeout asked again after a minute; six
  at a time; every token of a batch planned at once, the viewed and active scenes first), the
  writer (one `updateEmbeddedDocuments` per scene, the `tokenart` option carrying each token's
  `{ from, to, look }`), the document hooks, the `Actor#getTokenImages` wrap, the API and the
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
- **The base is the flags' or the image** (`baseOf`): the flags recognise the image worn (the base
  or one of its looks); anything else is adopted as the base, a look-shaped name included (a corpse
  prop wearing `goblin-dead.webp` keeps it, issue #1). What once needed reading a base out of a
  look's name, dnd5e's revert handing a stored look back with the flags gone, is closed where it
  starts: when dnd5e writes `flags.dnd5e.previousTokenData` the plan swaps a stored look for its
  base (`stashFix`), recognised by the flags the transform's own write still carries; a stash made
  before (an older version) is recognised by name and one probe, only on a token the module has
  dressed. `lookCandidate` otherwise serves the wildcard filter only.
- **The ring subject falls through on its own** (D2 for the subject, issue #2): its look is
  `winningLook` over its own files; `subjectLook` is stored only when it differs from `look`.
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
  from any GM window. **Restore All runs on the active GM's client too** (issue #4): the pressing
  window sets the pause, then `restore` (a timestamp); the active GM's `onChange` awaits its own
  chain, restores (dnd5e's stash included, issue #3) and answers through `restored` (`{ at, count
  }`), which the pressing window waits on for a minute.

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
