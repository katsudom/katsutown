import Phaser from 'phaser';
import { FONT, IMAGES } from '../assets';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { PERSON } from '../data/content';
import { css, hex } from '../palette';
import { getAudio } from '../systems/audio';
import { InputManager } from '../systems/input';
import { createLabel, setLabelColor, type Label } from './UiScene';

/** Where the plain-React portfolio lives, resolved against the current page. */
function classicUrl(): string {
  // Relative resolution keeps this working under a GitHub Pages subpath
  // (/repo-name/index.html -> /repo-name/classic.html), never a hard-coded "/".
  return new URL('classic.html', window.location.href).toString();
}

export class TitleScene extends Phaser.Scene {
  private pad?: InputManager;
  private started = false;
  private navigating = false;
  private skipZone?: Phaser.GameObjects.Zone;
  private skipBg?: Phaser.GameObjects.Graphics;
  private skipText?: Label;
  private skipW = 0;
  private skipH = 0;
  private message?: Label;

  constructor() {
    super(SCENES.TITLE);
  }

  create(): void {
    this.started = false;
    this.navigating = false;
    this.cameras.main.setBackgroundColor(hex('ink'));
    this.cameras.main.fadeIn(250);
    this.drawBackdrop();

    // Logo image, or a bitmap-text stand-in if the art is missing.
    if (this.textures.exists('title-logo')) {
      this.add
        .image(GAME_WIDTH / 2, 230, 'title-logo')
        .setDisplaySize(IMAGES['title-logo'].width * 3, IMAGES['title-logo'].height * 3);
    } else {
      const shadow = createLabel(this, 0, 0, PERSON.townName, 6, 'crimsonDeep');
      const logo = createLabel(this, 0, 0, PERSON.townName, 6, 'crimsonLight');
      const x = (GAME_WIDTH - logo.displayWidth) / 2;
      shadow.setPosition(x + 6, 206 + 6);
      logo.setPosition(x, 206);
    }

    const sub = createLabel(
      this,
      0,
      0,
      `${PERSON.name} ${this.dot()} ${PERSON.tagline}`,
      3,
      'cream',
    );
    sub.setPosition((GAME_WIDTH - sub.displayWidth) / 2, 340);

    const startLabel = 'PRESS START';
    // Dark drop shadow + bright cream face keeps the call to action readable on crimson.
    const startShadow = createLabel(this, 0, 0, startLabel, 4, 'crimsonDeep');
    const start = createLabel(this, 0, 0, startLabel, 4, 'creamLight');
    const sx = (GAME_WIDTH - start.displayWidth) / 2;
    startShadow.setPosition(sx + 4, 466 + 4);
    start.setPosition(sx, 466);
    // Blink, but only down to 35% so the call to action never vanishes; it rests at full strength.
    this.tweens.add({
      targets: [start, startShadow],
      alpha: 0.35,
      duration: 420,
      yoyo: true,
      repeat: -1,
      repeatDelay: 700,
    });

    this.buildSkipLink();

    this.pad = new InputManager(this);
    this.input.keyboard?.on('keydown', this.onKey, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  update(): void {
    const s = this.pad?.read();
    // Keyboard is also covered by the raw keydown listener; this catches the touch A button.
    if (s && (s.interact || s.menu)) this.startGame();
  }

  // --- layout --------------------------------------------------------------

  /** The bitmap font may lack U+00B7; fall back to a hyphen rather than a blank gap. */
  private dot(): string {
    if (!this.cache.bitmapFont.exists(FONT.key)) return '·';
    const data = this.cache.bitmapFont.get(FONT.key)
      .data as Phaser.Types.GameObjects.BitmapText.BitmapFontData;
    return data.chars[0xb7] ? '·' : '-';
  }

  private drawBackdrop(): void {
    const g = this.add.graphics();
    // Soft crimson horizon glow near the bottom, and a scatter of twinkling stars.
    for (let i = 0; i < 6; i++) {
      g.fillStyle(hex('crimsonDeep'), 0.12 + i * 0.03);
      g.fillRect(0, GAME_HEIGHT - 260 + i * 44, GAME_WIDTH, 44);
    }
    const rng = new Phaser.Math.RandomDataGenerator(['katsudom']);
    for (let i = 0; i < 40; i++) {
      const star = this.add.rectangle(
        rng.between(0, GAME_WIDTH),
        rng.between(0, 360),
        rng.pick([3, 3, 6]),
        3,
        hex('cream'),
        0.8,
      );
      this.tweens.add({
        targets: star,
        alpha: 0.15,
        duration: rng.between(900, 2200),
        yoyo: true,
        repeat: -1,
        delay: rng.between(0, 1500),
      });
    }
  }

  private buildSkipLink(): void {
    const text = createLabel(this, 0, 0, 'Skip to regular portfolio', 3, 'crimson');
    this.skipText = text;
    this.skipW = Math.ceil(text.displayWidth) + 48;
    this.skipH = Math.ceil(text.displayHeight) + 28;
    const x = (GAME_WIDTH - this.skipW) / 2;
    const y = GAME_HEIGHT - this.skipH - 36;
    this.skipBg = this.add.graphics().setPosition(x, y);
    text.setPosition(x + 24, y + 14);
    // The pill is added to the display list after the label, so without explicit
    // depths the graphics paints straight over the text and hides it.
    this.skipBg.setDepth(0);
    text.setDepth(1);
    this.paintSkip(false);

    // Hit zone is the full pill; useHandCursor gives the pointer cursor on desktop.
    this.skipZone = this.add
      .zone(x, y, this.skipW, this.skipH)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.skipZone.on(Phaser.Input.Events.POINTER_OVER, () => this.paintSkip(true));
    this.skipZone.on(Phaser.Input.Events.POINTER_OUT, () => this.paintSkip(false));
    this.skipZone.on(Phaser.Input.Events.POINTER_DOWN, () => this.goClassic());
  }

  /** Cream pill + crimson underlined text at rest; solid crimson with cream text on hover. */
  private paintSkip(hover: boolean): void {
    const g = this.skipBg;
    const t = this.skipText;
    if (!g || !t) return;
    g.clear();
    g.fillStyle(hover ? hex('crimson') : hex('cream'), 1).fillRoundedRect(
      0,
      0,
      this.skipW,
      this.skipH,
      10,
    );
    g.lineStyle(4, hover ? hex('creamLight') : hex('crimson'), 1).strokeRoundedRect(
      0,
      0,
      this.skipW,
      this.skipH,
      10,
    );
    // Underline sits under the text, on both states.
    g.fillStyle(hover ? hex('creamLight') : hex('crimson'), 1);
    g.fillRect(24, this.skipH - 14, Math.ceil(t.displayWidth), 3);
    setLabelColor(t, hover ? 'creamLight' : 'crimson');
  }

  // --- flow ----------------------------------------------------------------

  private onKey(): void {
    this.startGame();
  }

  private onPointer(_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    // A click on the skip link navigates; it must not also start the game.
    if (this.skipZone && over.includes(this.skipZone)) return;
    this.startGame();
  }

  private goClassic(): void {
    if (this.navigating) return;
    this.navigating = true;
    window.location.assign(classicUrl());
  }

  private startGame(): void {
    if (this.started || this.navigating) return;
    this.started = true;

    // First real user gesture: audio is allowed to start now.
    const audio = getAudio();
    audio.unlock();
    audio.playMusic('title');
    audio.playSfx('confirm');

    if (!this.scene.get(SCENES.WORLD)) {
      this.showPlaceholder();
      this.started = false;
      return;
    }
    this.cameras.main.fadeOut(300);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.WORLD);
    });
  }

  /** Shown only if the World scene module hasn't been added to the build yet. */
  private showPlaceholder(): void {
    this.message?.destroy();
    const msg = createLabel(
      this,
      0,
      0,
      'The town is still being built.\nCheck back soon!',
      3,
      'creamLight',
    );
    msg.setPosition((GAME_WIDTH - msg.displayWidth) / 2, 540);
    if (msg instanceof Phaser.GameObjects.Text) msg.setAlign('center').setColor(css('creamLight'));
    this.message = msg;
  }

  private onShutdown(): void {
    this.input.keyboard?.off('keydown', this.onKey, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
    this.pad?.destroy();
    this.pad = undefined;
  }
}
