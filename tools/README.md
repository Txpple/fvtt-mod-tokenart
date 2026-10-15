# tools/

Development tooling; none of it ships in the module zip.

- `check-manifest.mjs`: `module.json` in step with itself (id, title, `version` against the
  `download` tag, every `esmodules` entry on disk). Part of `npm run verify`.

## Deploying to the sandbox

From the dnd5e MCP repo beside this one (its `.env` names the local Foundry):

```bash
node scripts/deploy-house-module.mjs fvtt-mod-tokenart --local
```

A brand-new module has to be registered once through Foundry's own installer before the sandbox
will list it (`register-module.mjs` with the GitHub manifest, once a release exists), or by
restarting the local Foundry process after the first copy, since the package registry is scanned
at process boot. After that, `--local` plus a world reload is enough for script changes. Then
enable it in the world (`configure-modules.mjs --enable fvtt-mod-tokenart`).

## The sandbox walk (acceptance)

Run by hand against the local sandbox with a BTB test actor whose token is `x.webp` and four look
files uploaded beside it (imagegen redresses, or tinted copies for a first walk). Each line is
green when what it says is what the token shows.

1. **Placed:** the token wears the ready look.
2. **Added to the tracker:** combat. **Removed:** ready. **Combat deleted with it inside:** ready.
3. **Prone applied** (`apply-condition`): prone, in and out of combat. **Removed in combat:** combat.
4. **Hit Points to 0:** dead, under Combat Plus's skull. **Healed:** whatever applies.
5. **The `-combat` file deleted and Rescan pressed:** a combatant falls through to ready.
6. **The texture changed by hand in Token Config:** adopted as the base, its looks re-derived.
7. **A druid Wild Shaped** (By the Books' Wild Shape Art): the form's art adopted; **reverted:** the
   druid's base and looks back.
8. **A second GM window open:** no flicker, one visible swap.
9. **A wildcard prototype `goblin-*.webp` with `goblin-1-dead.webp` present:** ten placements never
   pick a look file.
10. **A player's client:** the swaps show, no permission errors, no probe requests in its network
    log.
11. **A linked character on an unviewed scene at 0 Hit Points:** dead there too, seen on switching
    to it.
12. **Restore all, then the module disabled:** every token at its base.

**Walked 2026-10-15** on the local sandbox (Foundry 14.369, dnd5e 6.0.6), with a BTB test fighter's
token set to `assets/tokenart-walk/x.png` and five labelled discs as the base and the four looks, the
MCP bridge and a browser window both GM clients, and a `tokenart.changed` listener counting every
swap. All twelve green. Notes per step: 1 one write, flags `base` + `look`. 2 one swap per change,
none when the state is unchanged. 3 prone beats combat; removed in combat, combat. 4 dead under
Combat Plus's overlay; healed, combat; out of combat dnd5e's downed conditions left the Prone rider,
which the module showed as prone until it was cleared. 5 green both ways: Rescan pressed on the
non-active GM window reached the active GM through the hidden setting, and a reload of a lone GM
window fell the combatant through to ready. 6 a Token Config edit adopted as the base, the `look`
flag dropped, the old base's looks back when set back. 7 through dnd5e's own `transformInto` with the
Wild Shape preset (the call By the Books' Wild Shape makes) and `revertOriginalForm`: the Cat's art
adopted; the revert handed `x-ready.png` back with every flag gone, which the look-candidate rule
recognised. 8 throughout: two GM clients, one write per change. 9 `getTokenImages` returned the two
bases only; ten placements never a look file. 10 the player's window showed both swaps, no Token Art
errors, nothing written from it. 11 the linked character's token on the unviewed scene went dead and
back with the viewed one. 12 Restore All put both tokens at the base with no flags on any scene; the
first build paused the pressing client only, and the dnd5e MCP's `configure-modules.mjs`, joining as
a GM to write the disable, ran the module on its own page and dressed the tokens again before the
bounce. Fixed the same day with a world-wide pause (Restore All sets it, Rescan clears it), deployed
to the sandbox; **the re-run of step 12's second half is owed**: a By the Books battery took the
sandbox before it could run.
