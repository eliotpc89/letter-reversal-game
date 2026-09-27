# Letter Reversal Game — public static build

A static export of the Letter Reversal phonics arcade (letter games + three
Fundations short-o/short-u games + coin bank + trophy shop), hosted on GitHub
Pages.

- **Live site:** https://eliotpc89.github.io/letter-reversal-game/
- **How it saves:** game state (coins, trophies, per-letter stats) is stored in
  the browser's `localStorage` — no login, no server. Progress is per-device.
- **On iPad:** open the URL in Safari → Share → **Add to Home Screen** for a
  fullscreen, app-like icon.

## Layout

- `/index.html`, `/assets/` — the built site (what GitHub Pages serves).
- `/game-src/` — the export source: client source copied from the hosted
  arcade's `client/`, with `src/api.ts` replaced by a localStorage-backed
  implementation of the same action surface. Nothing else was changed.

## Rebuilding

The source of truth for the game itself lives in the arcade project
(`~/workspace/ts-spaces/letter-reversal-game`). To refresh this export:

```bash
# 1. Re-copy client source
rm -rf game-src/src
cp -r ~/workspace/ts-spaces/letter-reversal-game/client/src game-src/src
cp ~/workspace/ts-spaces/letter-reversal-game/client/index.html game-src/index.html
# 2. Re-apply the localStorage layer + standalone entry (kept as patches in git history)
# 3. Rebuild
cd game-src && bun build.mjs
# 4. Copy dist output to the site root
cp -r dist/* ..
```

Audio begins after the first tap (browser autoplay policy); all MP3s are
bundled locally under `/assets/`.
