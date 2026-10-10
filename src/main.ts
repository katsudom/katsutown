/**
 * Entry point. Boots Phaser with the pixel-art settings from the architecture doc.
 *
 * Scene registration is deliberately defensive: Boot, Title and Ui are always
 * registered here. World and Menu are registered by BootScene (via a lazy
 * `import.meta.glob`) if their modules exist, so the app still boots and the
 * Title screen still works while those files are missing.
 *
 * TODO(world-agent): do NOT add World/Menu to the list below. Create
 * `src/game/scenes/WorldScene.ts` and `MenuScene.ts` and BootScene picks them up.
 */
/// <reference types="vite/client" />
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './game/config';
import { hex } from './game/palette';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { UiScene } from './game/scenes/UiScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: hex('ink'),
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Movement is grid-locked and tween-driven, so no physics engine is needed.
  scene: [BootScene, TitleScene, UiScene],
});

// Vite HMR: tear the old game down so a hot reload doesn't stack canvases / listeners.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}

// Dev-only handle for automated testing, so a harness can read real game state
// (active scenes, player tile, dialogue status) instead of guessing from pixels.
// `import.meta.env.DEV` is statically false in a production build, so this whole
// block is dead-code-eliminated and never ships.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__katsudom = game;
}
