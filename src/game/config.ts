/**
 * Global rendering + gameplay constants. Every scene and system reads these;
 * nothing hard-codes a tile size or a speed.
 */

/** Source art is 16x16. Non-negotiable: the generator emits exactly this. */
export const TILE_SIZE = 16;

/** Pixel-art render scale (spec: 3x). Applied as a camera zoom on world scenes. */
export const RENDER_SCALE = 3;

/** Visible world area, in tiles: 20x15 tiles = 320x240 source pixels. */
export const VIEW_TILES_W = 20;
export const VIEW_TILES_H = 15;

/**
 * Canvas size. World scenes zoom their camera by RENDER_SCALE, so a world
 * scene shows VIEW_TILES_W x VIEW_TILES_H tiles. UI scenes run unzoomed and
 * address this full space directly, which keeps text crisp.
 */
export const GAME_WIDTH = TILE_SIZE * VIEW_TILES_W * RENDER_SCALE; // 960
export const GAME_HEIGHT = TILE_SIZE * VIEW_TILES_H * RENDER_SCALE; // 720

/**
 * Milliseconds to walk exactly one tile. Movement is grid-locked, GBA-style.
 * The era's walk cycle was 8 frames at 60fps (~133ms), and because a direction
 * change can only take effect on a tile boundary, this value is also the
 * ceiling on input latency — keep it tight.
 */
export const MOVE_MS = 140;

/**
 * Extra delay before a tap-turn becomes a step, so turning in place feels right.
 * Only applied from a standstill — see INPUT_BUFFER_MS.
 */
export const TURN_MS = 70;

/**
 * How long a direction pressed mid-step is remembered. A step takes MOVE_MS,
 * during which the player can't act; without a buffer, a key pressed and
 * released inside that window is silently dropped and the controls feel laggy.
 * Slightly shorter than MOVE_MS so a stale press can never cause a surprise
 * extra step after the player has clearly stopped.
 */
export const INPUT_BUFFER_MS = 120;

/** Scene keys. Use these constants, never raw strings. */
export const SCENES = {
  BOOT: 'Boot',
  TITLE: 'Title',
  WORLD: 'World',
  UI: 'Ui',
  MENU: 'Menu',
} as const;

/** Registry keys for cross-scene state. */
export const REGISTRY = {
  SOUND_ON: 'soundOn',
  CURRENT_MAP: 'currentMap',
  VISITED: 'visitedMaps',
} as const;

/** localStorage key for persisted settings (spec: mute toggle remembers itself). */
export const STORAGE_KEY = 'katsudom-town/settings/v1';

/** Depth layers, so sprites and UI never fight over draw order. */
export const DEPTH = {
  GROUND: 0,
  DECAL: 10,
  OBJECT_BEHIND: 20,
  ACTOR: 30,
  OBJECT_FRONT: 40,
  OVERHANG: 50,
  WEATHER: 60,
  UI: 1000,
} as const;
