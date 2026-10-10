/**
 * Katsudom Town palette — the single source of truth for every colour in the
 * game and in the generated spritesheets.
 *
 * The raw values live in `palette.json` so that both the TypeScript game code
 * and the plain-Node asset generator (`tools/generate-assets.mjs`) read the
 * exact same data. Edit the JSON; this file only adds types and helpers.
 *
 * Accents are crimson + cream (per spec). Everything else is a warm, GBA-era
 * town: grass greens, brick reds, soft stone greys.
 */
import paletteJson from './palette.json';

export const PALETTE: Record<string, string> & typeof paletteJson = paletteJson;

export type PaletteKey = keyof typeof paletteJson;

/** Hex string -> 0xRRGGBB number, for Phaser tint/fill/graphics APIs. */
export function hex(key: PaletteKey): number {
  return parseInt(PALETTE[key].slice(1), 16);
}

/** Hex string -> css colour, for DOM/Text styles. */
export function css(key: PaletteKey): string {
  return PALETTE[key];
}
