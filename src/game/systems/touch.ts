/**
 * On-screen D-pad + A button + menu button. Lives inside UiScene (unzoomed
 * 960x720 space) and mutates the shared `virtualInput`.
 *
 * Hit-testing is done by hand from scene-level pointer events instead of making
 * the images interactive. That means these controls never become the "top"
 * interactive object and so can't swallow taps meant for dialogue / menu UI
 * that happens to sit underneath their bounding boxes.
 *
 * The canvas is FIT-scaled, so one design pixel can be well under one CSS pixel
 * on a phone. Control sizes are therefore derived from the current canvas-to-CSS
 * ratio and recomputed on resize, so each control stays at least MIN_TAP_CSS on
 * screen.
 */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { hex } from '../palette';
import { resetVirtualInput, virtualInput } from './input';

const MARGIN = 28;
/** Design-space sizes used when the canvas is shown at (or near) design scale. */
const DPAD_BASE = 96 * 2.3;
const BUTTON_BASE = 48 * 2.7;
const MENU_BASE = 64;
const IDLE_ALPHA = 0.5;
const ACTIVE_ALPHA = 0.8;
/** Minimum on-screen (CSS px) size of a control: the 44px guideline plus a little slack. */
const MIN_TAP_CSS = 48;
/** The D-pad image is a 3x3 grid, so one arrow is a third of it. */
const DPAD_ARROW_FRAC = 1 / 3;
/** A press shorter than this is stretched to it, so a quick tap still takes one step. */
const MIN_HOLD_MS = 120;

type DpadDir = 'up' | 'down' | 'left' | 'right';

/** True when the device can actually be touched (a narrow desktop window does not count). */
export function hasTouchInput(): boolean {
  let coarse = false;
  try {
    coarse = window.matchMedia('(pointer: coarse)').matches;
  } catch {
    // matchMedia unavailable: fall through to maxTouchPoints.
  }
  return coarse || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

export class TouchControls {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly dpad: Phaser.GameObjects.Image;
  private readonly button: Phaser.GameObjects.Image;
  private readonly menuBtn: Phaser.GameObjects.Graphics;
  private readonly dpadHint: Phaser.GameObjects.Graphics;
  private readonly coarseQuery: MediaQueryList | null;

  private dpadCx = 0;
  private dpadCy = 0;
  private dpadR = 0;
  private btnCx = 0;
  private btnCy = 0;
  private btnR = 0;
  private menuCx = 0;
  private menuCy = 0;
  private menuSize = MENU_BASE;

  /** Which pointer id currently owns each control (multi-touch). */
  private dpadPointer: number | null = null;
  private aPointer: number | null = null;
  private menuPointer: number | null = null;

  private dir: DpadDir | null = null;
  private dirSince = 0;
  private releaseTimer: number | null = null;

  private enabled = true;
  private shown = false;

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;

    this.dpad = scene.add.image(0, 0, 'touch-dpad').setAlpha(IDLE_ALPHA);
    this.dpadHint = scene.add.graphics();
    this.button = scene.add.image(0, 0, 'touch-button').setAlpha(IDLE_ALPHA);
    this.menuBtn = scene.add.graphics();

    this.root = scene.add.container(0, 0, [this.dpad, this.dpadHint, this.button, this.menuBtn]);
    this.root.setDepth(depth).setScrollFactor(0);

    // Two thumbs at once (move + A) needs more than the default one touch pointer.
    scene.input.addPointer(2);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.GAME_OUT, this.releaseAll, this);
    // "Just pressed" flags live for exactly one full frame: cleared after every
    // scene has updated, so each InputManager gets to see the edge.
    scene.game.events.on(Phaser.Core.Events.POST_STEP, this.clearEdges, this);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.releaseAll);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(pointer: coarse)');
      mq.addEventListener('change', this.onResize);
    } catch {
      mq = null;
    }
    this.coarseQuery = mq;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);

    this.layout();
    this.refreshVisibility();
  }

  /** Show / hide the controls (e.g. hidden during a full-screen menu). Never forces them on desktop. */
  setVisible(on: boolean): void {
    this.enabled = on;
    this.refreshVisibility();
  }

  get visible(): boolean {
    return this.shown;
  }

  destroy(): void {
    const s = this.scene;
    s.input?.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    s.input?.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    s.input?.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    s.input?.off(Phaser.Input.Events.GAME_OUT, this.releaseAll, this);
    s.game?.events.off(Phaser.Core.Events.POST_STEP, this.clearEdges, this);
    s.scale?.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.releaseAll);
    this.coarseQuery?.removeEventListener('change', this.onResize);
    this.releaseAll();
    this.root.destroy();
  }

  // --- visibility + layout -------------------------------------------------

  /** Only real touch capability counts; a narrow desktop window must never show them. */
  private wanted(): boolean {
    return this.scene.sys.game.device.input.touch || hasTouchInput();
  }

  private refreshVisibility = (): void => {
    const show = this.enabled && this.wanted();
    if (!show) this.releaseAll();
    this.shown = show;
    this.root.setVisible(show);
  };

  private readonly onResize = (): void => {
    this.layout();
    this.refreshVisibility();
  };

  /** CSS pixels per design pixel (the canvas is FIT-scaled), clamped to a sane range. */
  private cssPerDesign(): number {
    const w = this.scene.scale.displaySize.width;
    const r = w > 0 ? w / GAME_WIDTH : 1;
    return Math.min(1, Math.max(0.1, r));
  }

  /** Size and place every control so each is at least MIN_TAP_CSS on screen. */
  private layout(): void {
    const minDesign = MIN_TAP_CSS / this.cssPerDesign();
    const dpadSize = Math.min(GAME_HEIGHT * 0.62, Math.max(DPAD_BASE, minDesign / DPAD_ARROW_FRAC));
    const btnSize = Math.max(BUTTON_BASE, minDesign * 1.15);
    this.menuSize = Math.max(MENU_BASE, minDesign);

    this.dpadR = dpadSize / 2;
    this.dpadCx = MARGIN + this.dpadR;
    this.dpadCy = GAME_HEIGHT - MARGIN - this.dpadR;
    this.btnR = btnSize / 2;
    this.btnCx = GAME_WIDTH - MARGIN - this.btnR;
    this.btnCy = GAME_HEIGHT - MARGIN - this.btnR - 20;
    this.menuCx = GAME_WIDTH - MARGIN - this.menuSize / 2;
    this.menuCy = MARGIN + this.menuSize / 2;

    this.dpad.setPosition(this.dpadCx, this.dpadCy).setDisplaySize(dpadSize, dpadSize);
    this.button.setPosition(this.btnCx, this.btnCy).setDisplaySize(btnSize, btnSize);
    this.drawMenuButton(this.menuPointer !== null);
    this.paintDir();
  }

  /** Current on-screen sizes in CSS px (used for verification). */
  measure(): { arrow: number; a: number; menu: number } {
    const k = this.cssPerDesign();
    return {
      arrow: this.dpadR * 2 * DPAD_ARROW_FRAC * k,
      a: this.btnR * 2 * k,
      menu: this.menuSize * k,
    };
  }

  // --- pointer handling ----------------------------------------------------

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.shown) return;
    const { x, y } = pointer;
    if (this.aPointer === null && this.inCircle(x, y, this.btnCx, this.btnCy, this.btnR * 1.2)) {
      this.aPointer = pointer.id;
      virtualInput.a = true;
      virtualInput.aJustPressed = true;
      this.button.setAlpha(ACTIVE_ALPHA);
      return;
    }
    if (
      this.menuPointer === null &&
      this.inCircle(x, y, this.menuCx, this.menuCy, this.menuSize * 0.7)
    ) {
      this.menuPointer = pointer.id;
      virtualInput.menu = true;
      virtualInput.menuJustPressed = true;
      this.drawMenuButton(true);
      return;
    }
    if (
      this.dpadPointer === null &&
      this.inCircle(x, y, this.dpadCx, this.dpadCy, this.dpadR * 1.15)
    ) {
      this.dpadPointer = pointer.id;
      this.applyDpad(x, y);
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    // Sliding a thumb across the D-pad: keep tracking even if it leaves the image.
    if (pointer.id === this.dpadPointer) this.applyDpad(pointer.x, pointer.y);
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.dpadPointer) {
      this.dpadPointer = null;
      this.releaseDir();
    }
    if (pointer.id === this.aPointer) {
      this.aPointer = null;
      virtualInput.a = false;
      this.button.setAlpha(IDLE_ALPHA);
    }
    if (pointer.id === this.menuPointer) {
      this.menuPointer = null;
      virtualInput.menu = false;
      this.drawMenuButton(false);
    }
  }

  private readonly releaseAll = (): void => {
    this.dpadPointer = null;
    this.aPointer = null;
    this.menuPointer = null;
    resetVirtualInput();
    this.setDir(null);
    this.button.setAlpha(IDLE_ALPHA);
    this.drawMenuButton(false);
  };

  private readonly clearEdges = (): void => {
    virtualInput.aJustPressed = false;
    virtualInput.menuJustPressed = false;
  };

  /** Pick the dominant axis from the pad centre; a small dead zone keeps the thumb "neutral". */
  private applyDpad(x: number, y: number): void {
    const dx = x - this.dpadCx;
    const dy = y - this.dpadCy;
    if (Math.hypot(dx, dy) < this.dpadR * 0.2) {
      this.setDir(null);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) this.setDir(dx < 0 ? 'left' : 'right');
    else this.setDir(dy < 0 ? 'up' : 'down');
  }

  private setDir(dir: DpadDir | null): void {
    if (this.releaseTimer !== null) {
      window.clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    if (dir !== this.dir) this.dirSince = dir ? performance.now() : 0;
    this.dir = dir;
    virtualInput.up = dir === 'up';
    virtualInput.down = dir === 'down';
    virtualInput.left = dir === 'left';
    virtualInput.right = dir === 'right';
    this.paintDir();
  }

  /**
   * Thumb lifted. A very short tap would otherwise start and end between two
   * movement polls (and be shorter than the player's turn grace period), so the
   * direction is held until it has lasted MIN_HOLD_MS: one tap, one step.
   */
  private releaseDir(): void {
    if (!this.dir) return;
    const remaining = MIN_HOLD_MS - (performance.now() - this.dirSince);
    if (remaining <= 0) {
      this.setDir(null);
      return;
    }
    this.releaseTimer = window.setTimeout(() => {
      this.releaseTimer = null;
      this.setDir(null);
    }, remaining);
  }

  private paintDir(): void {
    const dir = this.dir;
    this.dpadHint.clear();
    if (!dir) {
      this.dpad.setAlpha(IDLE_ALPHA);
      return;
    }
    this.dpad.setAlpha(ACTIVE_ALPHA);
    // Highlight the pressed arm so the player can see where the thumb is registering.
    const arm = this.dpadR * 0.62;
    const r = { x: this.dpadCx - arm / 2, y: this.dpadCy - arm / 2, w: arm, h: arm };
    if (dir === 'up') r.y -= arm;
    if (dir === 'down') r.y += arm;
    if (dir === 'left') r.x -= arm;
    if (dir === 'right') r.x += arm;
    this.dpadHint.fillStyle(hex('crimsonLight'), 0.45);
    this.dpadHint.fillRoundedRect(r.x, r.y, r.w, r.h, 8);
  }

  private inCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
    return Math.hypot(x - cx, y - cy) <= r;
  }

  private drawMenuButton(active: boolean): void {
    const g = this.menuBtn;
    const size = this.menuSize;
    g.clear();
    g.fillStyle(hex('ink'), active ? 0.75 : 0.5);
    g.fillRoundedRect(this.menuCx - size / 2, this.menuCy - size / 2, size, size, 12);
    g.lineStyle(3, hex('cream'), active ? 0.95 : 0.7);
    g.strokeRoundedRect(this.menuCx - size / 2, this.menuCy - size / 2, size, size, 12);
    // Hamburger glyph, scaled with the button.
    g.fillStyle(hex('cream'), active ? 1 : 0.85);
    const u = size / MENU_BASE;
    for (let i = -1; i <= 1; i++) {
      g.fillRect(this.menuCx - 18 * u, this.menuCy + (i * 12 - 3) * u, 36 * u, 6 * u);
    }
  }
}
