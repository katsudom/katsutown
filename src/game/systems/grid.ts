/**
 * Grid helpers. Dependency-free on purpose (no Phaser import) so the pure
 * maths can be unit-tested from plain Node.
 */
import { TILE_SIZE } from '../config';
import type { Direction } from '../types';

/** What the Player asks the world before it steps onto a tile. */
export interface WalkQuery {
  isBlocked(tileX: number, tileY: number): boolean;
}

/** Unit tile offsets for each facing. */
export const DIR_VECTOR: Record<Direction, { dx: number; dy: number }> = {
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: -1 },
};

/** The tile one step away in `dir`. */
export function stepTile(
  tileX: number,
  tileY: number,
  dir: Direction,
): { tileX: number; tileY: number } {
  const v = DIR_VECTOR[dir];
  return { tileX: tileX + v.dx, tileY: tileY + v.dy };
}

/** World-pixel centre of a tile (source pixels; the camera zoom scales it up). */
export function tileToPixelCenter(tileX: number, tileY: number): { x: number; y: number } {
  return { x: tileX * TILE_SIZE + TILE_SIZE / 2, y: tileY * TILE_SIZE + TILE_SIZE / 2 };
}

/** Tile containing a world-pixel position. */
export function pixelToTile(x: number, y: number): { tileX: number; tileY: number } {
  return { tileX: Math.floor(x / TILE_SIZE), tileY: Math.floor(y / TILE_SIZE) };
}
