# 2026 PPR Superflex Draft Assistant

Mobile-first static app for a 12-team PPR Superflex snake draft from slot 6. Tap **Mine** or **Other** to record a pick; recommendations recompute from the model, roster need, tier scarcity, and VONA.

## Local

Requires Node 22. This repo’s `.nvmrc` pins it; `npm test` / `npm run dev` will switch via nvm if your shell is still on Node 16.

```bash
nvm use
```

```bash
npm install
npm test
npm run dev
```

Open the printed URL on your phone if you are on the same Wi-Fi.

## GitHub Pages

After the repo is on GitHub:

1. Push `main`.
2. In the repo, enable **Settings → Pages → GitHub Actions**.
3. The deploy workflow builds with base path `/NflFantasyDraftHelper/`.
4. Open `https://<user>.github.io/NflFantasyDraftHelper/`.

Draft state is stored in this browser's `localStorage`. Private/incognito windows may not keep it.
