/**
 * Grid-locked player. Also exports `registerCharAnims` so NPC sprites built
 * elsewhere share the exact same animation naming.
 */
import Phaser from 'phaser';
import { CHAR_COLS, CHAR_IDLE_COL, CHAR_ROW, CHAR_ROWS } from '../assets';
import { DEPTH, INPUT_BUFFER_MS, MOVE_MS, TILE_SIZE, TURN_MS } from '../config';
import type { Direction } from '../types';
import { getAudio } from './audio';
import { DIR_VECTOR, stepTile, tileToPixelCenter, type WalkQuery } from './grid';
import type { InputState } from './input';

const DIRECTIONS: Direction[] = ['down', 'left', 'right', 'up'];

export function walkAnimKey(textureKey: string, dir: Direction): string {
  return `${textureKey}:walk-${dir}`;
}

export function idleFrame(dir: Direction): number {
  return CHAR_ROW[dir] * CHAR_COLS + CHAR_IDLE_COL;
}

/**
 * Create the four walk animations for a character sheet. Idempotent: calling it
 * again for the same texture does nothing. Keys: `<texture>:walk-<dir>`.
 * Idle is simply frame `idleFrame(dir)` (column CHAR_IDLE_COL of the facing row).
 */
export function registerCharAnims(scene: Phaser.Scene, textureKey: string): void {
  const tex = scene.textures.exists(textureKey) ? scene.textures.get(textureKey) : null;
  // Frame names in a spritesheet are numeric strings "0".."N-1"; also skip the __BASE entry.
  if (!tex || tex.frameTotal - 1 < CHAR_COLS * CHAR_ROWS) return;
  for (const dir of DIRECTIONS) {
    const key = walkAnimKey(textureKey, dir);
    if (scene.anims.exists(key)) continue;
    const row = CHAR_ROW[dir] * CHAR_COLS;
    scene.anims.create({
      key,
      // left foot, stand, right foot, stand: a full stride spans two tiles.
      frames: [row, row + 1, row + 2, row + 1].map((frame) => ({ key: textureKey, frame })),
      frameRate: 4 / ((MOVE_MS * 2) / 1000),
      repeat: -1,
    });
  }
}

interface PlayerOpts {
  textureKey: string;
  tileX: number;
  tileY: number;
  facing: Direction;
  walk: WalkQuery;
}

export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;
  inputEnabled = true;

  private readonly scene: Phaser.Scene;
  private readonly walk: WalkQuery;
  private readonly textureKey: string;
  private _tileX: number;
  private _tileY: number;
  private _facing: Direction;
  private _isMoving = false;
  /** True while walkPath() is driving; input is ignored. */
  private scripted = false;
  /** Time left in a turn-in-place before the step may begin. */
  private turnRemaining = 0;
  /**
   * A direction pressed while a step was in flight. Without this, a key pressed
   * and released inside one MOVE_MS step is dropped entirely and the controls
   * feel unresponsive when changing direction quickly.
   */
  private bufferedDir: Direction | null = null;
  private bufferAge = 0;
  /**
   * True once a step has landed and the player is still walking. A direction
   * change mid-walk should flow straight into the next step; only a change from
   * a genuine standstill pays the TURN_MS tap-turn pause.
   */
  private inMotion = false;
  private stepTween: Phaser.Tweens.Tween | null = null;
  /** Resolves the in-flight step promise if the tween is cancelled (teleport / shutdown). */
  private resolveStep: (() => void) | null = null;
  /** Bumped by teleport() so an in-progress walkPath() abandons its remaining steps. */
  private scriptEpoch = 0;

  constructor(scene: Phaser.Scene, opts: PlayerOpts) {
    this.scene = scene;
    this.walk = opts.walk;
    this.textureKey = opts.textureKey;
    this._tileX = opts.tileX;
    this._tileY = opts.tileY;
    this._facing = opts.facing;
    registerCharAnims(scene, opts.textureKey);
    const p = tileToPixelCenter(opts.tileX, opts.tileY);
    this.sprite = scene.add.sprite(p.x, p.y, opts.textureKey, idleFrame(opts.facing));
    this.sprite.setDepth(DEPTH.ACTOR);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  get tileX(): number {
    return this._tileX;
  }
  get tileY(): number {
    return this._tileY;
  }
  get facing(): Direction {
    return this._facing;
  }
  get isMoving(): boolean {
    return this._isMoving;
  }

  update(input: InputState, delta: number): void {
    // Mid-step the player can't act, but we still remember what was pressed so
    // the input isn't lost. This is what makes "release A, press D" feel instant
    // instead of waiting out the rest of the current tile.
    if (this._isMoving) {
      // Only a direction CHANGE is worth buffering. Buffering the direction we
      // are already walking would mean a held key that is released mid-step
      // leaves a stale press behind, which then fires an extra step depending
      // on exactly when the release landed — a tap would cover one tile or two
      // at random. Continuing straight on is handled by the live key at the
      // tile boundary instead, so it needs no buffer.
      if (input.dir && input.dir !== this._facing) {
        this.bufferedDir = input.dir;
        this.bufferAge = 0;
      } else if (this.bufferedDir) {
        this.bufferAge += delta;
        if (this.bufferAge > INPUT_BUFFER_MS) this.bufferedDir = null;
      }
      return;
    }

    if (this.scripted || !this.inputEnabled) {
      this.turnRemaining = 0;
      this.bufferedDir = null;
      this.inMotion = false;
      this.settle();
      return;
    }

    // A buffered press beats the live key: it is the most recent deliberate
    // direction change, so with A held and W tapped mid-step, W must win even
    // though A is the only key still down at the tile boundary. The buffer only
    // ever records CHANGES from the facing direction, so continuing straight on
    // (and a plain tap from idle) is still decided by the live key alone. Once
    // the buffered step is done the live key (A) simply resumes.
    let dir = input.dir;
    if (this.bufferedDir) {
      this.bufferAge += delta;
      if (this.bufferAge <= INPUT_BUFFER_MS) dir = this.bufferedDir;
    }
    this.bufferedDir = null;
    this.bufferAge = 0;

    if (!dir) {
      // Nothing driving us: settle on the standing frame (no-op if already there).
      this.turnRemaining = 0;
      this.inMotion = false;
      this.settle();
      return;
    }

    // Turn-then-step, but only from a standstill. A direction press while
    // standing still turns the sprite and starts a TURN_MS grace period, so a
    // quick tap turns in place and a held key walks. While already walking, a
    // direction change takes effect on the very next tile with no pause, which
    // is what keeps WASD feeling responsive.
    if (dir !== this._facing) {
      this.face(dir);
      if (!this.inMotion) {
        this.turnRemaining = TURN_MS;
        return;
      }
    }
    if (this.turnRemaining > 0) {
      this.turnRemaining -= delta;
      if (this.turnRemaining > 0) return;
    }

    const next = stepTile(this._tileX, this._tileY, dir);
    if (this.walk.isBlocked(next.tileX, next.tileY)) {
      // Bumping a wall: stay turned, stay put, and stay quiet.
      this.inMotion = false;
      this.settle();
      return;
    }
    void this.beginStep(dir, true);
  }

  facingTile(): { tileX: number; tileY: number } {
    return stepTile(this._tileX, this._tileY, this._facing);
  }

  teleport(tileX: number, tileY: number, facing: Direction): void {
    this.cancelStep();
    this.scriptEpoch++;
    this._isMoving = false;
    this.turnRemaining = 0;
    this.bufferedDir = null;
    this.bufferAge = 0;
    this.inMotion = false;
    this._tileX = tileX;
    this._tileY = tileY;
    const p = tileToPixelCenter(tileX, tileY);
    this.sprite.setPosition(p.x, p.y);
    this.face(facing);
  }

  /**
   * Scripted movement (tour guide). Input is ignored until the whole path has
   * played. Scripted steps do not consult the collision query: the author of the
   * path is trusted to have laid it out on walkable ground.
   */
  async walkPath(steps: Direction[]): Promise<void> {
    if (this.scripted) return;
    this.scripted = true;
    const epoch = this.scriptEpoch;
    try {
      for (const dir of steps) {
        if (epoch !== this.scriptEpoch) break;
        // Let any step already in flight land first.
        while (this._isMoving) await new Promise<void>((r) => this.scene.time.delayedCall(16, r));
        this.face(dir);
        await this.beginStep(dir, false);
      }
    } finally {
      this.scripted = false;
      this.settle();
    }
  }

  // --- internals -----------------------------------------------------------

  private face(dir: Direction): void {
    this._facing = dir;
    this.sprite.anims.stop();
    this.sprite.setFrame(idleFrame(dir));
  }

  /** Return to the standing frame if we were mid-stride. */
  private settle(): void {
    if (this.sprite.anims.isPlaying) {
      this.sprite.anims.stop();
      this.sprite.setFrame(idleFrame(this._facing));
    }
  }

  /** Move exactly one tile. The logical tile updates immediately so collision is conservative. */
  private beginStep(dir: Direction, withSfx: boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      const v = DIR_VECTOR[dir];
      this._facing = dir;
      this._isMoving = true;
      this.resolveStep = resolve;
      this._tileX += v.dx;
      this._tileY += v.dy;
      this.turnRemaining = 0;
      // ignoreIfPlaying keeps the stride cycle going across consecutive tiles.
      const animKey = walkAnimKey(this.textureKey, dir);
      if (this.scene.anims.exists(animKey)) this.sprite.anims.play(animKey, true);
      if (withSfx) getAudio().playSfx('step');
      this.stepTween = this.scene.tweens.add({
        targets: this.sprite,
        x: this.sprite.x + v.dx * TILE_SIZE,
        y: this.sprite.y + v.dy * TILE_SIZE,
        duration: MOVE_MS,
        ease: 'Linear',
        onComplete: () => {
          this._isMoving = false;
          // We are now mid-walk rather than standing, so the next direction
          // change skips the tap-turn pause.
          this.inMotion = true;
          this.stepTween = null;
          this.resolveStep = null;
          resolve();
        },
      });
    });
  }

  private cancelStep(): void {
    this.stepTween?.stop();
    this.stepTween = null;
    this.scene.tweens.killTweensOf(this.sprite);
    const resolve = this.resolveStep;
    this.resolveStep = null;
    resolve?.();
  }

  private onShutdown(): void {
    this.scriptEpoch++;
    this.cancelStep();
  }
}
