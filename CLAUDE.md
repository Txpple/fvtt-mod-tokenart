# fvtt-mod-tokenart — working notes for sessions in this repo

**What this is.** Open Roll 5e: Token Art, a Foundry VTT module: every token wears the look of its
state (ready, combat, dead), each a file named beside the base art, with nothing to
configure. Part of Open Roll 5e (the suite repo is `..`, its CLAUDE.md has the family's
conventions; the plan this was built from is `../docs/plans/tokenart.md`). Plain ES modules, no
build step, no patching beyond one manual wrap, no libWrapper, no socketlib, MIT.

**State (2026-10-16).** 1.0.2 is released (both assets; the prone look off, three looks) and the
sandbox carries its bytes (`--local`, read back through a GM page: `api.LOOKS` three, no `proneLook`
registered, no Token Art console line; the version the page reports stays 1.0.1 until the local
process next boots), the module enabled, with the walk's art under `assets/tokenart-walk/` (nine
small PNGs; its prone look is an ordinary image now) for trying it. Prod runs 1.0.1 until
the installer is run. `npm run verify` is green (79 tests). The design points the 1.0.1 review left
are issues #1–#4; its findings are `audits/review-2026-10-15.md`. How it was built, walked and
released: `docs/log/2026-10.md`.

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
