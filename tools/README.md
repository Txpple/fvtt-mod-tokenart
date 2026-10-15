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
