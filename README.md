# Open Roll 5e: Token Art

A Foundry VTT module that gives every token the look of its state. Name a file beside the token's
art, `goblin-dead.webp` next to `goblin.webp`, and the token wears it when the goblin dies. Three
looks, found by file name, with nothing to configure: **ready** when nothing else applies,
**combat** while a combat lists the token, **dead** at 0 Hit Points. A look you have not made is
simply skipped, and the base art is the floor.

## How it works

- **The base is the token's own image**, whatever Token Config, a transform or a summon's landing
  set. The module never writes it and never touches the prototype token.
- **The looks sit beside the base**, the same name with a suffix before the extension, in the same
  folder: `goblin-ready.webp`, `goblin-combat.webp`, `goblin-dead.webp`. No subfolders, no table,
  no folder scan.
- **The GM's client does the swapping.** Once per image, it asks the server which of the three
  files exist, then changes the token's image as the state changes. Players' clients see the
  swaps and do nothing else.
- **Every scene follows**, viewed or not: the module watches the documents, not the canvas, so a
  character at 0 Hit Points is dead on the scene nobody is looking at too.
- **A missing look falls through.** A combatant with a `-ready` file and no `-combat` file keeps
  its ready look through the fight instead of flipping to the base art.

## Installation

Paste the manifest URL into Foundry's *Install Module* dialog:

```
https://github.com/Txpple/fvtt-mod-tokenart/releases/latest/download/module.json
```

Requires Foundry VTT v13 or v14 and the dnd5e system (the dead look reads dnd5e's hit points; the
Dead condition is Foundry's own). No other dependencies.

## The convention

| Look | File | When |
| --- | --- | --- |
| base | `goblin.webp` | the token's own image; the floor |
| ready | `goblin-ready.webp` | nothing else applies |
| combat | `goblin-combat.webp` | a combat lists the token, from the moment it is added to the tracker |
| dead | `goblin-dead.webp` | the creature is at 0 Hit Points or has the Dead condition |

A creature's folder reads as one family of names, the portrait By the Books' Summon Art already
reads among them:

```
assets/tokens/
  giant-owl.webp              the token (the base)
  giant-owl-portrait.webp     the portrait, for Summon Art
  giant-owl-ready.webp
  giant-owl-combat.webp
  giant-owl-dead.webp
```

- **Which look wins:** dead, then combat, then ready, then the base. A dead creature is dead
  whatever else is true; a combatant is in combat; anything else at rest is ready. A look whose
  file is missing, or whose switch is off, hands over to the next. No other condition is a state:
  a prone or unconscious creature wears whatever else applies.
- **Dead is one rule for everyone.** A player character at 0 Hit Points is dying by the book, not
  dead; this module shows the dead look anyway, as Combat Plus's Auto-Defeated stamps the overlay.
  Turn the *Dead look* switch off if your table would rather not. Who writes the Dead status this
  look also reads (dnd5e, By the Books, Combat Plus) is written once for the family in
  [contracts/dead.md](https://github.com/Txpple/fvtt-suite-openroll5e/blob/main/contracts/dead.md).
- **Derivation runs one way,** base to looks. A token placed as `walking-dead.webp` has the base
  `walking-dead.webp` and the looks `walking-dead-dead.webp` and so on. The module reads a base out
  of a look's name in one case only, below, and only when that base file exists.
- **Any image change by anyone else becomes the new base:** a Token Config edit, a dnd5e
  transform, By the Books' Wild Shape Art and Summon Art, the dnd5e MCP's `set-actor-art`. The
  looks are re-derived from it. Two exceptions, both so a stored image handed back stays a look: a
  change that lands on one of the current base's own look files is recognised as that look; and a
  token found wearing a look-shaped name with no record of its base (dnd5e's revert of a transform
  hands the stored image back and drops the flags) is taken as that look when the base file exists
  beside it, so `giant-owl-ready.webp` returns to `giant-owl.webp` instead of becoming a base of
  its own. A `walking-dead.webp` beside no `walking.webp` is still a base.
- **Wildcard tokens** (`goblin-*.webp`) never draw a look file: the module filters them out of the
  wildcard list, so `goblin-1-dead.webp` is left alone while `goblin-1.webp` is in it.
- **Dynamic rings.** With the ring on and its own subject image set, the subject gets the same
  suffix and both swap together when the subject's look file exists. With no subject image, Foundry
  draws the ring from the token image, which is the only thing written.
- **Video textures** (`.webm`) follow the same rule, and a query string (a Forge or S3 URL) is kept
  after the extension.
- **New art uploaded mid-session:** press **Rescan** in the settings, from any GM window (or
  reload). The found files are remembered per image until then.

## Settings

*Game Settings → Configure Settings → Open Roll 5e: Token Art.*

| Setting | Default | What it does |
| --- | --- | --- |
| Ready look | On | Wears the `-ready` image whenever nothing else applies. |
| Combat look | On | Wears the `-combat` image while a combat lists the token. |
| Dead look | On | Wears the `-dead` image at 0 Hit Points or with the Dead condition. |
| Suffix separator | `-` | The character before the look word: `goblin-dead.webp`, `goblin_dead.webp` or `goblin.dead.webp`. |
| Rescan token art | | Forgets which files were found and looks again, from any GM window; also resumes after Restore All. |
| Restore every token to its base | | Puts every token back to its base image and forgets the looks; the step before disabling or uninstalling the module. Token Art then stays paused for the world, on every client, until Rescan is pressed. |

## Playing with the family

- **Combat Plus** marks a creature defeated at 0 Hit Points and stamps the skull overlay; Token Art
  reads the same hit points and needs neither. The skull still draws over the dead look; a table
  with dead art may turn Combat Plus's overlay off, in its settings.
- **By the Books'** Summon Art, Wild Shape Art and Battle Familiar's transforms all write token
  images; each is adopted as the base and the looks follow.
- **The dnd5e MCP's** `set-actor-art` writes the base, nothing more to teach it. **imagegen** makes
  the looks: an edit of the base token ("the same goblin, weapon drawn", "dead, eyes closed, weapon
  dropped"), saved under the convention's names and uploaded beside the base.

Each module installs and works on its own; none of the above is required.

## API and hook

```js
const api = game.modules.get("fvtt-mod-tokenart").api;
await api.looksFor(tokenDoc);   // { base, separator, looks: { ready: { path, exists }, ... }, worn }
await api.apply(tokenDoc);      // resolve and write one token's look now (the active GM's client)
await api.rescan();             // forget the found files and reconcile every token
await api.restoreAll();         // every token back to its base, the flags gone
```

One hook, fired on every client whenever the module changes a token's image:

```js
Hooks.on("tokenart.changed", (tokenDoc, { from, to, look }) => {
  // `look` is "ready", "combat" or "dead", or null when the token is back at its base
});
```

Two flags on the token, both the module's: `flags.fvtt-mod-tokenart.base` (the path to return to)
and `flags.fvtt-mod-tokenart.look` (the one worn now, absent at base). Nothing is written on the
actor or the prototype token.

## Development

There is no build step: the module is plain ES modules loaded straight from the repo. The decisions
(which file a token should wear, from plain data) are in `scripts/decide/looks.js`, pure and
unit-tested; `scripts/tokenart.js` is the Foundry side. `npm install` once, then `npm run verify`
(Biome, the type check, the manifest check, the tests). The sandbox acceptance walk is in
[tools/README.md](tools/README.md).

Releases: bump `version` and the `download` URL in `module.json` together, tag `vX.Y.Z`, and
publish a zip of the module with the manifest as a GitHub release.

<!-- openroll5e:family -->
## Part of Open Roll 5e

Token Art is one of the Open Roll 5e modules for Foundry VTT, a suite built for one D&D 5e table and
shared. Each module installs and works on its own and none needs another; together they cover the
table from the fog of war to the loot. The other modules:

- [Open Roll 5e: Autoexplore](https://github.com/Txpple/fvtt-mod-autoexplore): lets a scene start fully explored, so the whole map shows through the fog of war while tokens still need line of sight.
- [Open Roll 5e: By the Books](https://github.com/Txpple/fvtt-mod-bythebooks): the 2024 rules played from the sheet: a hit rolls and applies its own damage, saves resolve themselves, reactions hold, concentration is tracked, and rests, senses, sizes and lights follow the book. Every rule that rides a use or an effect in the 2024 core books, Heroes of Faerûn, Arcana Unleashed and Ravenloft: The Horrors Within, each step with a receipt and a revert; offered, never enforced.
- [Open Roll 5e: Combat Plus](https://github.com/Txpple/fvtt-mod-combatplus): automates the chores of running a fight: combat music, an initiative gate, an out-of-turn movement block, defeated marking at 0 HP and turn alerts.
- [Open Roll 5e: Errata](https://github.com/Txpple/fvtt-mod-errata5e): corrects, in memory, bugs in the premium D&D 2024 books, the dnd5e system and Foundry itself, each fix held until the vendor ships its own.
- [Open Roll 5e: FX Studio](https://github.com/Txpple/fvtt-mod-fxstudio): visual and sound effects for dnd5e, played from what actually happened at the table, with about a thousand stock FX and a window for authoring your own.
- [Open Roll 5e: Loot Shelf](https://github.com/Txpple/fvtt-mod-lootshelf): loot chests and merchant shelves that players can take from, buy from and sell to without owning them, with a receipt for every trade.
- [Open Roll 5e: Open Server](https://github.com/Txpple/fvtt-mod-openserver): for hosted worlds: clears the startup pause so players can play before the GM arrives, and gives every user a one-click jump to their character's token, and their familiar's, from the Players list.
- [Open Roll 5e: Party Stash](https://github.com/Txpple/fvtt-mod-partystash): makes a dnd5e Group actor's inventory a working party stash: drags move instead of copying, coin moves through a dialog, and every transfer posts a receipt.
- [Open Roll 5e: Area Sounds](https://github.com/Txpple/fvtt-mod-areasounds): background sound for scenes: random one-shots with silence between them, seamless crossfaded loops, day and night gating, and quiet during combat.

Three MCP servers for [Claude Code](https://claude.com/claude-code) complete the suite:

- [fvtt-mcp-dnd5e](https://github.com/Txpple/fvtt-mcp-dnd5e): builds D&D 5e content in a live Foundry world from Claude Code: a stat block becomes a complete NPC, a map image a walled and lit scene, an adventure its journals, tables and handouts.
- [fvtt-mcp-imagegen](https://github.com/Txpple/fvtt-mcp-imagegen): makes the art with Google's Gemini image models: icons, tokens, props, portraits and illustrations, token redresses and restyles, battlemap and overland-map repaints, and the illustrated session records, all grounded in what the world already shows.
- [fvtt-mcp-sessionscribe](https://github.com/Txpple/fvtt-mcp-sessionscribe): turns a session's Discord recording and Foundry chat log into its record. Its end-to-end `session-scribe` skill drives the server from the Craig link to a speaker-labelled transcript, a fully illustrated player recap, combat statistics, GM notes and a party snapshot.

Issues are welcome on every repo in the family; pull requests are not accepted, since each is one
author's design for one table, shared because it might suit yours. How they fit together is mapped in [fvtt-suite-openroll5e](https://github.com/Txpple/fvtt-suite-openroll5e).
<!-- /openroll5e:family -->

## License

MIT. See [LICENSE](LICENSE).
