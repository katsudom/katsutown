# Project status

Short-lived context that isn't captured by the code or the other docs. Delete
sections as they stop being true.

## Where things stand

The game and the classic page are both complete and verified end to end. Every
acceptance criterion from the original brief has been checked against a running
build, not just read in source:

- 8 maps, 16 warps, 38 interactables, 5 NPCs — all reachable, all verified to
  open their dialogue with the correct text.
- All 20 project bullets appear exactly once, verbatim from `content.ts`.
- 6 menu tabs, fast travel, tour guide, sound toggle with persistence.
- Phone layout at 375x812: touch targets measured at 48–55 CSS px.
- Zero console errors on the dev server and on the built site.
- Built site loads in ~1.2 s; Phaser is split into its own cacheable chunk.

## Before you deploy

1. **Fill in the project links.** Every link in `src/game/data/content.ts` is
   deliberately `url: null`, which renders as "(link coming soon)" in both the
   game and the classic page. Replace the nulls with real URLs.
2. **Enable GitHub Pages**: repository Settings → Pages → Source → **GitHub
   Actions**. The workflow in `.github/workflows/deploy.yml` does the rest and
   sets Vite's `base` from the repository name automatically.
3. **Pages needs a public repository** on the GitHub free tier. A private repo
   requires a paid plan; otherwise deploy the built `dist/` elsewhere.

## Things worth knowing

- **Everything visual is generated.** `npm run assets` redraws all 31 images and
  the bitmap font from `src/game/palette.json`; `npm run maps` rebuilds the
  tilemaps from `src/game/data/maps.ts`. Both are deterministic — deleting
  `public/assets/` and regenerating produces byte-identical files. Nothing is
  downloaded and no third-party art is vendored.
- **All audio is synthesised** at runtime via Web Audio. No audio files exist.
- **The font covers ASCII 32–126 plus exactly four extras**: `·` (U+00B7),
  `–` (U+2013), `→` (U+2192) and `’` (U+2019). Introducing any other non-ASCII
  character into `content.ts` will render as a blank box. There is no em dash
  and no ellipsis character.
- **Movement is grid-locked.** A direction change can only take effect on a tile
  boundary, so `MOVE_MS` (140 ms) is also the ceiling on input latency. The
  buffering rules in `src/game/systems/player.ts` are subtle and were tuned
  against measurements — read the comments there before changing them. Two
  properties must hold: a tap always moves exactly one tile, and a fresh press
  beats a still-held key.

## Testing

A headless Puppeteer harness was used for verification. It is not committed (it
lives in the session scratchpad), but `docs/ARCHITECTURE.md` documents the hooks
it relies on: the dev-only `window.__katsudom` handle and the drivable members
on `WorldScene`. Recreating it is straightforward.

Note that a **hidden** browser pane throttles `requestAnimationFrame` to ~3 fps
and then to zero, which freezes Phaser's loop and makes input look broken. Test
headlessly, or keep the pane visible.
