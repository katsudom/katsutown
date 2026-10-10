/**
 * Katsudom Town asset generator.
 *
 *   npm run assets
 *
 * Draws every PNG pixel-by-pixel (no external art) from src/game/palette.json
 * and writes them to public/assets/. Fully deterministic: re-running produces
 * byte-identical files. Also writes src/game/generated/tiles.ts.
 */
import { writePng, writeText } from './lib/canvas.mjs';
import { buildTiles, TILESET_COLUMNS } from './lib/tiles.mjs';
import { buildBuildings } from './lib/buildings.mjs';
import { buildProps } from './lib/props.mjs';
import { buildUi } from './lib/ui.mjs';
import { buildFont } from './lib/font.mjs';
import { buildCharacters } from './lib/chars.mjs';

/** Emit the typed tile-index module the map builders import. */
function tilesModule(names) {
  const entries = names.map((n, i) => `  ${n}: ${i},`).join('\n');
  return `// AUTO-GENERATED - do not edit. Produced by tools/generate-assets.mjs (npm run assets).

/** Number of tiles per row in assets/tiles/tiles-town.png. */
export const TILESET_COLUMNS = ${TILESET_COLUMNS};

/** 0-based tile indices in tiles-town.png (row-major). Slot 0 is blank. */
export const TILES = {
${entries}
} as const;

export type TileName = keyof typeof TILES;

/** Tiled gid = index + 1 */
export function gid(name: TileName): number {
  return TILES[name] + 1;
}
`;
}

// ---- tiles
const { sheet, names } = buildTiles();
writePng('assets/tiles/tiles-town.png', sheet);
writeText('src/game/generated/tiles.ts', tilesModule(names));
console.log(`  (${names.length} tiles defined)`);

// ---- everything else
for (const [file, canvas] of buildBuildings()) writePng(file, canvas);
for (const [file, canvas] of buildProps()) writePng(file, canvas);
for (const [file, canvas] of buildCharacters()) writePng(file, canvas);
for (const [file, canvas] of buildUi()) writePng(file, canvas);
const font = buildFont();
writePng(font.pngPath, font.canvas);
writeText(`public/${font.xmlPath}`, font.xml);

console.log('Asset generation complete.');
