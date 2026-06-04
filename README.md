# Cordle

A color-mixing Wordle. You're shown a target color and a palette of 8 real
artist pigments; find the subset (2–4) that mixes to the target. Mixing is
physically accurate, powered by [Mixbox](https://github.com/scrtwpns/mixbox).

## Develop

- `npm test` — run unit + build tests
- `npm run build` — inline `src/*` + `mixbox.js` into the single-file `index.html`

`index.html` is generated; edit the `src/` files and rebuild.

## Deploy (Cloudflare Pages)

The deployable artifact is the single `public/index.html`. To publish:

```bash
npm run build                 # regenerate index.html
cp index.html public/index.html
CLOUDFLARE_API_TOKEN=... npx wrangler pages deploy public --project-name cordle
```

## Attribution

Pigment mixing by Mixbox © Secret Weapons, licensed CC BY-NC 4.0
(non-commercial). This is a non-commercial fan project.
