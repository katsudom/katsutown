/**
 * Input: keyboard + on-screen touch controls merged into one edge-aware state.
 *
 * Several scenes (World, Ui, Menu) each own an InputManager. They all read the
 * same `virtualInput` singleton, so edges are detected per-manager by comparing
 * with that manager's own previous frame, never by consuming shared flags.
 */
import Phaser from 'phaser';
import type { Direction } from '../types';

export interface VirtualInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  aJustPressed: boolean;
  menu: boolean;
  menuJustPressed: boolean;
}

/** Module singleton mutated by TouchControls; merged with the keyboard. */
export const virtualInput: VirtualInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  a: false,
  aJustPressed: false,
  menu: false,
  menuJustPressed: false,
};

export function resetVirtualInput(): void {
  virtualInput.up = false;
  virtualInput.down = false;
  virtualInput.left = false;
  virtualInput.right = false;
  virtualInput.a = false;
  virtualInput.aJustPressed = false;
  virtualInput.menu = false;
  virtualInput.menuJustPressed = false;
}

export interface InputState {
  /** Currently held direction, null if none. Newest press wins when several are held. */
  dir: Direction | null;
  /** Space/Enter/A, edge-triggered. */
  interact: boolean;
  /** Esc / menu button, edge-triggered. */
  menu: boolean;
  /** Esc / B in menus, edge-triggered. */
  cancel: boolean;
}

const DIRS: Direction[] = ['up', 'down', 'left', 'right'];

type KeyMap = Record<
  'up' | 'down' | 'left' | 'right' | 'space' | 'enter' | 'esc',
  Phaser.Input.Keyboard.Key[]
>;

export class InputManager {
  private readonly keys: KeyMap | null;
  private readonly allKeys: Phaser.Input.Keyboard.Key[] = [];
  /** Held directions, oldest first, so the most recent press takes priority. */
  private order: Direction[] = [];
  private prevInteract = false;
  private prevMenu = false;
  private readonly onBlur = (): void => {
    // Losing window focus swallows key-up events: clear everything or we walk forever.
    for (const k of this.allKeys) k.reset();
    this.order = [];
    this.prevInteract = false;
    this.prevMenu = false;
    resetVirtualInput();
  };

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      const mk = (...codes: number[]): Phaser.Input.Keyboard.Key[] =>
        codes.map((c) => kb.addKey(c, true, false));
      this.keys = {
        up: mk(K.UP, K.W),
        down: mk(K.DOWN, K.S),
        left: mk(K.LEFT, K.A),
        right: mk(K.RIGHT, K.D),
        space: mk(K.SPACE),
        enter: mk(K.ENTER),
        esc: mk(K.ESC),
      };
      this.allKeys = Object.values(this.keys).flat();
    } else {
      this.keys = null;
    }
    window.addEventListener('blur', this.onBlur);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  /** Call once per update. */
  read(): InputState {
    const held: Record<Direction, boolean> = {
      up: this.isDown('up') || virtualInput.up,
      down: this.isDown('down') || virtualInput.down,
      left: this.isDown('left') || virtualInput.left,
      right: this.isDown('right') || virtualInput.right,
    };
    // Maintain press order: drop released directions, append newly pressed ones.
    this.order = this.order.filter((d) => held[d]);
    for (const d of DIRS) {
      if (held[d] && !this.order.includes(d)) this.order.push(d);
    }
    const dir = this.order.length > 0 ? this.order[this.order.length - 1] : null;

    const interactHeld = this.isDown('space') || this.isDown('enter') || virtualInput.a;
    const menuHeld = this.isDown('esc') || virtualInput.menu;
    const interact = (interactHeld && !this.prevInteract) || virtualInput.aJustPressed;
    const menu = (menuHeld && !this.prevMenu) || virtualInput.menuJustPressed;
    this.prevInteract = interactHeld;
    this.prevMenu = menuHeld;

    // Esc doubles as "back" inside menus, so menu and cancel share the same edge.
    return { dir, interact, menu, cancel: menu };
  }

  destroy(): void {
    window.removeEventListener('blur', this.onBlur);
    this.allKeys.forEach((k) => k.reset());
  }

  private isDown(name: keyof KeyMap): boolean {
    const list = this.keys?.[name];
    return list ? list.some((k) => k.isDown) : false;
  }
}
