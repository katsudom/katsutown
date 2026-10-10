/// <reference types="vite/client" />
import Phaser from 'phaser';
import {
  CHAR_COLS,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_ROWS,
  FONT,
  IMAGES,
  PROPS,
  SHEETS,
  type ImageKey,
  type SheetKey,
} from '../assets';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { css, hex } from '../palette';
import { registerCharAnims } from '../systems/player';

/**
 * World and Menu are written by another module set and may not exist yet.
 * `import.meta.glob` resolves to an empty record for a missing file instead of
 * failing the build, and loads lazily, so Boot/Title/Ui still run without them.
 *
 * TODO(world-agent): nothing to wire up here. Drop `WorldScene.ts` / `MenuScene.ts`
 * next to this file and they are registered automatically (any exported Phaser.Scene
 * subclass is accepted; it is added under SCENES.WORLD / SCENES.MENU).
 */
const OPTIONAL_SCENES: ReadonlyArray<{
  key: string;
  loaders: Record<string, () => Promise<unknown>>;
}> = [
  { key: SCENES.WORLD, loaders: import.meta.glob('./WorldScene.ts') },
  { key: SCENES.MENU, loaders: import.meta.glob('./MenuScene.ts') },
];

type SceneCtor = new (...args: never[]) => Phaser.Scene;

function findSceneClass(mod: unknown): SceneCtor | null {
  if (typeof mod !== 'object' || mod === null) return null;
  for (const exp of Object.values(mod)) {
    if (typeof exp === 'function' && exp.prototype instanceof Phaser.Scene) {
      return exp as SceneCtor;
    }
  }
  return null;
}

export class BootScene extends Phaser.Scene {
  private barFill?: Phaser.GameObjects.Graphics;
  private barLabel?: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.BOOT);
  }

  preload(): void {
    this.drawProgress(0);

    // The deploy base path is absolute in production builds (GitHub Pages subpath).
    this.load.setBaseURL(import.meta.env.BASE_URL);

    // A missing file must not hang the loader: report it and carry on.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[boot] failed to load asset "${file.key}" (${file.type}): ${file.url}`);
    });
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => this.drawProgress(value));

    // Everything below iterates the manifest; no literal asset paths live here.
    // Tilemap JSON is deliberately NOT loaded: WorldScene loads maps on demand.
    for (const [key, spec] of Object.entries(IMAGES)) {
      this.load.image(key, spec.path);
    }
    for (const [key, spec] of Object.entries(SHEETS)) {
      this.load.spritesheet(key, spec.path, {
        frameWidth: CHAR_FRAME_W,
        frameHeight: CHAR_FRAME_H,
      });
    }
    for (const [key, spec] of Object.entries(PROPS)) {
      this.load.spritesheet(key, spec.path, {
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
      });
    }
    this.load.bitmapFont(FONT.key, FONT.texture, FONT.descriptor);
  }

  create(): void {
    this.fillMissingTextures();
    for (const key of Object.keys(SHEETS)) registerCharAnims(this, key);
    void this.registerOptionalScenes().then(() => this.handOff());
  }

  // --- progress bar --------------------------------------------------------

  private drawProgress(value: number): void {
    const w = 480;
    const h = 24;
    const x = (GAME_WIDTH - w) / 2;
    const y = GAME_HEIGHT / 2;
    if (!this.barFill) {
      const track = this.add.graphics();
      track.fillStyle(hex('inkSoft'), 1).fillRect(x - 4, y - 4, w + 8, h + 8);
      track.lineStyle(2, hex('creamShadow'), 1).strokeRect(x - 4, y - 4, w + 8, h + 8);
      this.barFill = this.add.graphics();
      // The bitmap font is still being fetched, so the label is a plain Text.
      this.barLabel = this.add
        .text(GAME_WIDTH / 2, y - 36, 'loading', {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: css('cream'),
        })
        .setOrigin(0.5);
    }
    this.barFill
      .clear()
      .fillStyle(hex('crimson'), 1)
      .fillRect(x, y, w * value, h);
    this.barLabel?.setText(`loading ${Math.round(value * 100)}%`);
  }

  // --- placeholders --------------------------------------------------------

  /**
   * The art is produced by a separate generator and may be absent. Rather than
   * letting Phaser show its green "missing texture" box (or throw on a 9-slice
   * of nothing), synthesise a plain stand-in for any image/sheet that failed to
   * load. `title-logo` is skipped: TitleScene has its own text fallback.
   */
  private fillMissingTextures(): void {
    for (const key of Object.keys(IMAGES) as ImageKey[]) {
      if (key === 'title-logo' || this.textures.exists(key)) continue;
      const { width, height } = IMAGES[key];
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      if (key === 'ui-frame') {
        g.fillStyle(hex('crimson')).fillRect(0, 0, width, height);
        g.fillStyle(hex('cream')).fillRect(4, 4, width - 8, height - 8);
      } else if (key === 'touch-dpad') {
        g.fillStyle(hex('ink'), 0.85);
        g.fillRoundedRect(width / 3, 0, width / 3, height, 6);
        g.fillRoundedRect(0, height / 3, width, height / 3, 6);
        g.lineStyle(2, hex('cream'), 1).strokeRoundedRect(width / 3, 0, width / 3, height, 6);
      } else if (key === 'touch-button') {
        g.fillStyle(hex('crimson')).fillCircle(width / 2, height / 2, width / 2 - 2);
        g.lineStyle(3, hex('cream')).strokeCircle(width / 2, height / 2, width / 2 - 3);
      } else {
        g.fillStyle(hex('inkSoft')).fillRect(0, 0, width, height);
        g.lineStyle(2, hex('creamShadow')).strokeRect(1, 1, width - 2, height - 2);
      }
      g.generateTexture(key, width, height);
      g.destroy();
    }

    for (const key of Object.keys(SHEETS) as SheetKey[]) {
      if (this.textures.exists(key)) continue;
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const w = CHAR_FRAME_W * CHAR_COLS;
      const h = CHAR_FRAME_H * CHAR_ROWS;
      for (let row = 0; row < CHAR_ROWS; row++) {
        for (let col = 0; col < CHAR_COLS; col++) {
          const ox = col * CHAR_FRAME_W;
          const oy = row * CHAR_FRAME_H;
          g.fillStyle(hex('crimson')).fillRect(ox + 4, oy + 7, 8, 8);
          g.fillStyle(hex('skin')).fillRect(ox + 4, oy + 1, 8, 7);
          // A dark pip marks which way the stand-in is facing (down, left, right, up).
          g.fillStyle(hex('ink'));
          if (row === 0) g.fillRect(ox + 6, oy + 5, 4, 2);
          else if (row === 1) g.fillRect(ox + 4, oy + 4, 2, 2);
          else if (row === 2) g.fillRect(ox + 10, oy + 4, 2, 2);
        }
      }
      g.generateTexture(key, w, h);
      g.destroy();
      const tex = this.textures.get(key);
      for (let i = 0; i < CHAR_COLS * CHAR_ROWS; i++) {
        tex.add(
          i,
          0,
          (i % CHAR_COLS) * CHAR_FRAME_W,
          Math.floor(i / CHAR_COLS) * CHAR_FRAME_H,
          CHAR_FRAME_W,
          CHAR_FRAME_H,
        );
      }
    }
  }

  // --- hand-off ------------------------------------------------------------

  private async registerOptionalScenes(): Promise<void> {
    for (const { key, loaders } of OPTIONAL_SCENES) {
      if (this.scene.get(key)) continue;
      const loader = Object.values(loaders)[0];
      if (!loader) continue; // module not written yet
      try {
        const ctor = findSceneClass(await loader());
        if (ctor) this.scene.add(key, ctor, false);
        else console.error(`[boot] ${key} module exports no Phaser.Scene subclass`);
      } catch (err) {
        console.error(`[boot] could not load the ${key} scene`, err);
      }
    }
  }

  private handOff(): void {
    // Ui is an always-on overlay running in parallel with whichever scene is active.
    if (!this.scene.isActive(SCENES.UI)) this.scene.launch(SCENES.UI);
    this.scene.start(SCENES.TITLE);
  }
}
