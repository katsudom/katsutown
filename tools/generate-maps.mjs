/**
 * Katsudom Town map generator.
 *
 * Writes public/assets/maps/<id>.json (Tiled JSON, 16px tiles, four layers:
 * ground / decor / overhang / collide) for every MapId.
 *
 *  - Terrain is declared here, as compact readable layouts (rect helpers for the
 *    outdoor maps, ASCII art for the interiors).
 *  - Props, NPCs, interactables and warps are declared in src/game/data/maps.ts.
 *    This script bundles that file with esbuild and derives collision from it, so a
 *    door, a sign or a server rack can never end up on a different tile than its art.
 *
 * Run with `npm run maps`. The generated JSON is committed because `npm run dev`
 * does not run this script.
 *
 * Tiled gid = tile index + 1 (index 0 is the blank tile, gid 0 means "empty cell").
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'assets', 'maps');

// ---------------------------------------------------------------------------
// Load the typed game data (TS) by bundling it on the fly.
// ---------------------------------------------------------------------------

async function loadGameData() {
  const result = await build({
    stdin: {
      contents: `
        export { MAPS, START_MAP, START_SPAWN } from './src/game/data/maps';
        export { IMAGES, PROPS } from './src/game/assets';
        export { TILES } from './src/game/generated/tiles';
        export { MAP_MARKERS } from './src/game/data/content';
      `,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const DATA = await loadGameData();
const { MAPS, TILES, IMAGES, PROPS } = DATA;

const TILE = 16;
const BLOCK = TILES.blockSolid + 1;

/** Tile name -> Tiled gid. Throws on a typo so a bad name can never become tile 0. */
function gid(name) {
  const index = TILES[name];
  if (index === undefined) throw new Error(`Unknown tile name: ${name}`);
  return index + 1;
}

// ---------------------------------------------------------------------------
// Deterministic RNG so regenerating never churns the committed JSON.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Grid: the four layers of one map.
// ---------------------------------------------------------------------------

const LAYER_ORDER = ['ground', 'decor', 'overhang', 'collide'];

class Grid {
  constructor(id, w, h) {
    this.id = id;
    this.w = w;
    this.h = h;
    for (const layer of LAYER_ORDER) this[layer] = new Array(w * h).fill(0);
  }
  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  put(layer, x, y, name) {
    if (!this.inside(x, y)) throw new Error(`${this.id}: ${layer} write out of range (${x},${y})`);
    this[layer][y * this.w + x] = gid(name);
  }
  fill(layer, x, y, w, h, name) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(layer, i, j, name);
  }
  block(x, y) {
    if (!this.inside(x, y)) throw new Error(`${this.id}: block out of range (${x},${y})`);
    this.collide[y * this.w + x] = BLOCK;
  }
  blockRect(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.block(i, j);
  }
  unblock(x, y) {
    this.collide[y * this.w + x] = 0;
  }
  blocked(x, y) {
    return !this.inside(x, y) || this.collide[y * this.w + x] !== 0;
  }
  has(layer, x, y) {
    return this.inside(x, y) && this[layer][y * this.w + x] !== 0;
  }
}

/** A tree is 2x2: canopy on `overhang` (drawn over the player), trunk on `decor`. */
function plantTree(g, x, y) {
  g.put('overhang', x, y, 'treeTL');
  g.put('overhang', x + 1, y, 'treeTR');
  g.put('decor', x, y + 1, 'treeBL');
  g.put('decor', x + 1, y + 1, 'treeBR');
  g.blockRect(x, y, 2, 2);
}

/** Boolean mask helpers for keep-out areas. */
class Mask {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.bits = new Uint8Array(w * h);
  }
  get(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.bits[y * this.w + x] === 1;
  }
  set(x, y) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.bits[y * this.w + x] = 1;
  }
  rect(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j);
  }
  /** Chebyshev dilation by r tiles. */
  dilated(r) {
    const out = new Mask(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (this.get(x, y)) out.rect(x - r, y - r, 2 * r + 1, 2 * r + 1);
    return out;
  }
  union(other) {
    for (let i = 0; i < this.bits.length; i++) this.bits[i] |= other.bits[i];
    return this;
  }
}

// ---------------------------------------------------------------------------
// Collision derived from the data in maps.ts
// ---------------------------------------------------------------------------

/** Tiles an image/animated prop physically occupies (`[x, y]` pairs). */
function propFootprint(p) {
  const spec = p.kind === 'image' ? IMAGES[p.key] : PROPS[p.key];
  if (!spec) throw new Error(`Unknown prop key: ${p.key}`);
  const width = spec.width ?? spec.frameWidth;
  const height = spec.height ?? spec.frameHeight;
  const cols = Math.ceil(width / TILE);
  const rows = Math.ceil(height / TILE);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // The Campus Gate's columns 2-3 are a walkable archway.
      if (p.key === 'campus-gate' && (c === 2 || c === 3)) continue;
      // Only the foot of a flag pole is solid.
      if (p.key === 'trail-flag' && r < rows - 1) continue;
      cells.push([p.tileX + c, p.tileY + r]);
    }
  }
  return cells;
}

/** Block props, NPCs and interactables; warps stay open (and must not be blocked). */
function applyDefinition(g, def) {
  const warpAt = new Set(def.warps.map((w) => `${w.tileX},${w.tileY}`));
  for (const p of def.props) {
    for (const [x, y] of propFootprint(p)) if (!warpAt.has(`${x},${y}`)) g.block(x, y);
  }
  for (const n of def.npcs) g.block(n.tileX, n.tileY);
  for (const it of def.interactables) g.block(it.tileX, it.tileY);
  for (const w of def.warps) {
    if (g.blocked(w.tileX, w.tileY))
      throw new Error(`${g.id}: warp ${w.id} sits on a blocked tile`);
  }
}

/** Everything the player can step on or face, as a keep-out mask. */
function specialsMask(g, def) {
  const m = new Mask(g.w, g.h);
  for (const w of def.warps) m.set(w.tileX, w.tileY);
  for (const n of def.npcs) m.set(n.tileX, n.tileY);
  for (const it of def.interactables) m.set(it.tileX, it.tileY);
  return m;
}

// ---------------------------------------------------------------------------
// OVERWORLD (60 x 45)
// ---------------------------------------------------------------------------

const PLAZA = { x: 25, y: 19, w: 10, h: 8 };

/** Walkable dirt roads, as [x, y, w, h] rects (all at least two tiles wide). */
const ROADS = [
  [12, 24, 13, 2], //  house yard -> west edge of the square
  [24, 17, 2, 2], //   The Archive door apron
  [29, 9, 2, 10], //   north road to the Clubhouse
  [24, 31, 6, 2], //   Server Shed apron
  [29, 27, 2, 9], //   south road, down to the bridge
  [29, 38, 2, 3], //   south bank of the creek
  [31, 27, 10, 2], //  food truck apron
  [31, 29, 14, 2], //  east road, under the Campus Gate
  [43, 17, 2, 13], //  gate road, north to the trailhead
  [35, 21, 10, 2], //  east path from the square
  [43, 23, 5, 2], //   towards Admissions
  [47, 24, 6, 2], //   Admissions apron
];

const CREEK = { y: 36, rows: 2, x0: 2, x1: 57 };
const BRIDGE_X = [29, 30];

function buildOverworld(def) {
  const W = 60;
  const H = 45;
  const g = new Grid('overworld', W, H);
  const rng = mulberry32(0x6b61747375);

  // --- ground: grass with a little variety
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = rng();
      const name =
        r < 0.1
          ? 'grassTuft'
          : r < 0.125
            ? 'grassFlowerCrimson'
            : r < 0.15
              ? 'grassFlowerCream'
              : r < 0.18
                ? 'grassDark'
                : 'grass';
      g.put('ground', x, y, name);
    }
  }

  // --- town square (opaque plaza pieces belong on `ground`)
  const pm = new Mask(W, H);
  pm.rect(PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h);
  for (let y = PLAZA.y; y < PLAZA.y + PLAZA.h; y++) {
    for (let x = PLAZA.x; x < PLAZA.x + PLAZA.w; x++) {
      const top = y === PLAZA.y;
      const bottom = y === PLAZA.y + PLAZA.h - 1;
      const left = x === PLAZA.x;
      const right = x === PLAZA.x + PLAZA.w - 1;
      let name = rng() < 0.07 ? 'plazaCrack' : 'plaza';
      if (top && left) name = 'plazaTL';
      else if (top && right) name = 'plazaTR';
      else if (bottom && left) name = 'plazaBL';
      else if (bottom && right) name = 'plazaBR';
      else if (top) name = 'plazaT';
      else if (bottom) name = 'plazaB';
      else if (left) name = 'plazaL';
      else if (right) name = 'plazaR';
      g.put('ground', x, y, name);
    }
  }
  // Open the kerb where roads meet the square.
  for (const [x, y] of [
    [29, 19],
    [30, 19],
    [25, 19],
    [25, 24],
    [25, 25],
    [29, 26],
    [30, 26],
    [34, 21],
    [34, 22],
  ]) {
    g.put('ground', x, y, 'plaza');
  }

  // --- creek + bridge (ground)
  const water = new Mask(W, H);
  for (let r = 0; r < CREEK.rows; r++) {
    const name = r === 0 ? 'waterEdgeN' : r === CREEK.rows - 1 ? 'waterEdgeS' : 'water';
    for (let x = CREEK.x0; x <= CREEK.x1; x++) {
      g.put('ground', x, CREEK.y + r, name);
      water.set(x, CREEK.y + r);
      g.block(x, CREEK.y + r);
    }
  }
  const road = new Mask(W, H);
  for (const [x, y, w, h] of ROADS) road.rect(x, y, w, h);
  for (const bx of BRIDGE_X) {
    for (let r = 0; r < CREEK.rows; r++) {
      g.put('ground', bx, CREEK.y + r, 'bridge');
      g.unblock(bx, CREEK.y + r);
      road.set(bx, CREEK.y + r);
    }
  }

  // --- roads: the path 9-slice has transparent edges, so it lives on `decor`
  const flat = (x, y) => road.get(x, y) || pm.get(x, y);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!road.get(x, y) || pm.get(x, y)) continue;
      const n = !flat(x, y - 1);
      const s = !flat(x, y + 1);
      const wst = !flat(x - 1, y);
      const e = !flat(x + 1, y);
      let name = 'pathC';
      if (n && wst) name = 'pathTL';
      else if (n && e) name = 'pathTR';
      else if (s && wst) name = 'pathBL';
      else if (s && e) name = 'pathBR';
      else if (n) name = 'pathT';
      else if (s) name = 'pathB';
      else if (wst) name = 'pathL';
      else if (e) name = 'pathR';
      g.put('decor', x, y, name);
    }
  }

  // --- the data-driven part: buildings, NPCs, signs, doors
  applyDefinition(g, def);

  // Any other overworld interactable falls back to a fence post marker.
  for (const it of def.interactables) {
    if (it.id === 'welcome-sign') continue; // the welcome-sign prop draws itself
    // The mailbox and the two signs have dedicated prop art too.
    if (['mailbox', 'campus-gate-sign', 'trailhead-sign'].includes(it.id)) continue;
    g.put('decor', it.tileX, it.tileY, 'fencePost');
  }

  // --- fences
  fenceRect(g, 10, 18, 18, 26, [
    [18, 24],
    [18, 25],
  ]);
  for (let x = 3; x <= 55; x++) {
    if (x >= 28 && x <= 31) continue; // the road to the bridge
    g.put('decor', x, 35, 'fenceH');
    g.block(x, 35);
  }

  // --- the world edge: a thick wall of trees all the way round
  for (let x = 0; x < W; x += 2) {
    plantTree(g, x, 0);
    plantTree(g, x, 41);
    plantTree(g, x, 43);
  }
  for (let y = 2; y <= 38; y += 2) {
    plantTree(g, 0, y);
    plantTree(g, W - 2, y);
  }
  for (const x of [0, 1, W - 2, W - 1]) {
    g.put('decor', x, 40, 'bushSmall');
    g.block(x, 40);
  }

  // --- scatter: forest in the corners, a few trees and bushes in the open
  const keepOut = new Mask(W, H);
  keepOut.union(road).union(pm).union(specialsMask(g, def));
  const reserved = keepOut.dilated(2);
  const blocked = new Mask(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g.blocked(x, y)) blocked.set(x, y);
  reserved.union(blocked.dilated(1));
  for (const wpos of def.warps) reserved.rect(wpos.tileX - 2, wpos.tileY - 2, 5, 5);

  const free = (x, y) => !reserved.get(x, y) && !g.blocked(x, y) && !g.has('decor', x, y);
  for (let y = 2; y < H - 3; y += 2) {
    const shift = rng() < 0.5 ? 0 : 1;
    for (let x = 2 + shift; x < W - 3; x += 2) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      const p = d < 10 ? 0.8 : d < 16 ? 0.45 : 0.2;
      if (rng() > p) continue;
      if (!free(x, y) || !free(x + 1, y) || !free(x, y + 1) || !free(x + 1, y + 1)) continue;
      plantTree(g, x, y);
    }
  }
  for (let y = 2; y < H - 3; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (!free(x, y)) continue;
      const r = rng();
      if (r < 0.025) {
        g.put('decor', x, y, 'bushSmall');
        g.block(x, y);
      } else if (r < 0.035) {
        g.put('decor', x, y, 'rock');
        g.block(x, y);
      }
    }
  }

  // The border must be airtight regardless of anything above.
  for (let x = 0; x < W; x++) {
    g.block(x, 0);
    g.block(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    g.block(0, y);
    g.block(W - 1, y);
  }
  return g;
}

/** Wooden fence loop with corner pieces; `gaps` are cells left open. */
function fenceRect(g, x0, y0, x1, y1, gaps = []) {
  const isGap = (x, y) => gaps.some(([gx, gy]) => gx === x && gy === y);
  const lay = (x, y, name) => {
    if (isGap(x, y)) return;
    g.put('decor', x, y, name);
    g.block(x, y);
  };
  for (let x = x0 + 1; x < x1; x++) {
    lay(x, y0, 'fenceH');
    lay(x, y1, 'fenceH');
  }
  for (let y = y0 + 1; y < y1; y++) {
    lay(x0, y, 'fenceV');
    lay(x1, y, 'fenceV');
  }
  lay(x0, y0, 'fenceCornerTL');
  lay(x1, y0, 'fenceCornerTR');
  lay(x0, y1, 'fenceCornerBL');
  lay(x1, y1, 'fenceCornerBR');
}

// ---------------------------------------------------------------------------
// TRAIL (20 x 36): an outdoor climb
// ---------------------------------------------------------------------------

function buildTrail(def) {
  const W = 20;
  const H = 36;
  const g = new Grid('trail', W, H);
  const rng = mulberry32(0xa5ce47);

  const dirt = [
    [9, 25, 2, 10], //  start of the climb
    [4, 24, 7, 2], //   first switchback
    [4, 14, 11, 2], //  second switchback
    [6, 5, 9, 3], //    summit plateau (snow)
  ];
  const steps = [
    [4, 15, 2, 10], //  left flight of steps
    [13, 6, 2, 9], //   right flight of steps
  ];
  const meadow = [5, 29, 10, 6]; // open grass around the trail start
  const summit = [6, 5, 9, 3];

  const walk = new Mask(W, H);
  const stepMask = new Mask(W, H);
  for (const r of dirt) walk.rect(...r);
  for (const r of steps) {
    walk.rect(...r);
    stepMask.rect(...r);
  }
  walk.rect(...meadow);

  const inSummit = (x, y) =>
    x >= summit[0] && x < summit[0] + summit[2] && y >= summit[1] && y < summit[1] + summit[3];
  const inMeadow = (x, y) =>
    x >= meadow[0] && x < meadow[0] + meadow[2] && y >= meadow[1] && y < meadow[1] + meadow[3];
  const onTrail = new Mask(W, H);
  for (const r of dirt.slice(0, 3)) onTrail.rect(...r);
  for (const r of steps) onTrail.rect(...r);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let name;
      if (!walk.get(x, y)) name = y <= 12 ? 'cliff' : 'grassDark';
      else if (inSummit(x, y)) name = 'summitSnow';
      else if (stepMask.get(x, y)) name = 'trailStep';
      else if (onTrail.get(x, y)) name = 'dirtPath';
      else if (inMeadow(x, y)) {
        const r = rng();
        name = r < 0.12 ? 'grassTuft' : r < 0.17 ? 'grassFlowerCream' : 'grass';
      } else name = 'dirtPath';
      g.put('ground', x, y, name);
      if (!walk.get(x, y)) g.block(x, y);
    }
  }

  applyDefinition(g, def);

  // The summit cairn.
  // (the summit's Project Card is drawn by the project-card prop)

  // Trees on the grassy slopes, rocks on the cliffs.
  const propCells = new Mask(W, H);
  for (const p of def.props) for (const [x, y] of propFootprint(p)) propCells.set(x, y);
  const reserved = walk.dilated(1).union(propCells.dilated(1));
  const free = (x, y) =>
    x >= 0 &&
    x < W &&
    y >= 0 &&
    y < H &&
    !reserved.get(x, y) &&
    !g.has('decor', x, y) &&
    !g.has('overhang', x, y);
  for (let y = 13; y < H - 1; y += 2) {
    for (let x = 0; x < W - 1; x += 2) {
      if (rng() > 0.75) continue;
      if (free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) plantTree(g, x, y);
    }
  }
  for (let y = 0; y <= 12; y++) {
    for (let x = 0; x < W; x++) {
      if (walk.get(x, y) || propCells.get(x, y) || g.has('decor', x, y)) continue;
      if (rng() < 0.08) g.put('decor', x, y, 'rock');
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// INTERIORS: ASCII layouts
// ---------------------------------------------------------------------------

/**
 * Legend. `ground` of wall tiles is drawn on the ground layer; furniture goes on
 * `decor` over the room's floor. `solid` cells are written to `collide`.
 *
 *  U wall (upper)     T wall trim row       # side / front wall
 *  W window           B bookshelf (wall)    P poster       w whiteboard
 *  . floor            , alternate floor     m door mat (the exit)
 *  d desk   c desk+computer   b bed   S bookshelf   h chair   t table
 *  k counter   l plant   x crate   r rug (walkable)
 */
const LEGEND = {
  U: { ground: 'wallUpper', solid: true },
  T: { ground: 'wallTrim', solid: true },
  '#': { ground: 'wallLower', solid: true },
  W: { ground: 'wallTrim', decor: 'wallWindow', solid: true },
  B: { ground: 'wallTrim', decor: 'wallBookshelf', solid: true },
  P: { ground: 'wallTrim', decor: 'wallPoster', solid: true },
  w: { ground: 'wallTrim', decor: 'wallWhiteboard', solid: true },
  '.': { floor: true },
  ',': { floorAlt: true },
  m: { floor: true, decor: 'doorMat' },
  d: { floor: true, decor: 'desk', solid: true },
  c: { floor: true, decor: 'deskComputer', solid: true },
  b: { floor: true, decor: 'bed', solid: true },
  S: { floor: true, decor: 'bookshelf', solid: true },
  h: { floor: true, decor: 'chair', solid: true },
  t: { floor: true, decor: 'table', solid: true },
  k: { floor: true, decor: 'counter', solid: true },
  l: { floor: true, decor: 'plant', solid: true },
  x: { floor: true, decor: 'crate', solid: true },
  r: { floor: true, decor: 'rug' },
};

function buildInterior(id, rows, floor, floorAlt, def) {
  const H = rows.length;
  const W = rows[0].length;
  const g = new Grid(id, W, H);
  rows.forEach((row, y) => {
    if (row.length !== W) throw new Error(`${id}: row ${y} is ${row.length} wide, expected ${W}`);
    [...row].forEach((ch, x) => {
      const spec = LEGEND[ch];
      if (!spec) throw new Error(`${id}: unknown legend character "${ch}" at (${x},${y})`);
      if (spec.ground) g.put('ground', x, y, spec.ground);
      else g.put('ground', x, y, spec.floorAlt ? floorAlt : floor);
      if (spec.decor) g.put('decor', x, y, spec.decor);
      if (spec.solid) g.block(x, y);
    });
  });
  applyDefinition(g, def);
  return g;
}

const INTERIORS = {
  house: {
    floor: 'floorWood',
    alt: 'floorWoodAlt',
    rows: [
      'UUUUUUUUUUUU',
      '#TWTBBTTWTT#',
      '#.dc......b#',
      '#..h.......#',
      '#..........#',
      '#.....rr...#',
      '#.l...rr...#',
      '#..........#',
      '#..........#',
      '#####m######',
    ],
  },
  archive: {
    floor: 'floorWood',
    alt: 'floorWoodAlt',
    rows: [
      'UUUUUUUUUUUUUUUU',
      '#TBBTTTTTPTTwTB#',
      '#..............#',
      '#SS..........SS#',
      '#..............#',
      '#..dc........l.#',
      '#..h...........#',
      '#..............#',
      '#SS....rrrr..SS#',
      '#..............#',
      '#.l..........l.#',
      '#######m########',
    ],
  },
  truck: {
    floor: 'floorTile',
    alt: 'floorTile',
    rows: [
      'UUUUUUUUUUUU',
      '#TTTTPTTwTT#',
      '#..........#',
      '#kkkk....lx#',
      '#..........#',
      '#..dc......#',
      '#..h.......#',
      '#..........#',
      '#####m######',
    ],
  },
  shed: {
    floor: 'floorConcrete',
    alt: 'floorConcrete',
    rows: [
      'UUUUUUUUUUUUUU',
      '#TTTTTTTTTTwT#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#............#',
      '#.x........l.#',
      '#............#',
      '######m#######',
    ],
  },
  clubhouse: {
    floor: 'floorCarpet',
    alt: 'floorCarpet',
    rows: [
      'UUUUUUUUUUUUUUUU',
      '#TWTTTwTTPTTWTT#',
      '#..............#',
      '#..............#',
      '#.dc........dc.#',
      '#..............#',
      '#....rrrrrr....#',
      '#....rrrrrr..k.#',
      '#..............#',
      '#.l..........l.#',
      '#..............#',
      '#######m########',
    ],
  },
  admissions: {
    floor: 'floorTile',
    alt: 'floorTile',
    rows: [
      'UUUUUUUUUUUU',
      '#TTWTPTTWTT#',
      '#.l......l.#',
      '#.......dc.#',
      '#..kkkk....#',
      '#..........#',
      '#..rrrr....#',
      '#..rrrr....#',
      '#..........#',
      '#####m######',
    ],
  },
};

// ---------------------------------------------------------------------------
// Tiled JSON
// ---------------------------------------------------------------------------

function toTiled(g) {
  const layers = LAYER_ORDER.map((name, i) => ({
    data: g[name],
    height: g.h,
    id: i + 1,
    name,
    opacity: 1,
    type: 'tilelayer',
    visible: name !== 'collide',
    width: g.w,
    x: 0,
    y: 0,
  }));
  return {
    compressionlevel: -1,
    height: g.h,
    infinite: false,
    layers,
    nextlayerid: layers.length + 1,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: TILE,
    tilesets: [
      {
        columns: 16,
        firstgid: 1,
        image: '../tiles/tiles-town.png',
        imageheight: 256,
        imagewidth: 256,
        margin: 0,
        name: 'tiles-town',
        spacing: 0,
        tilecount: 256,
        tileheight: TILE,
        tilewidth: TILE,
      },
    ],
    tilewidth: TILE,
    type: 'map',
    version: '1.10',
    width: g.w,
  };
}

/** JSON with one row of tiles per line, so diffs and eyeballs stay manageable. */
function serialize(g) {
  const tiled = toTiled(g);
  const layerText = tiled.layers.map((layer) => {
    const rows = [];
    for (let y = 0; y < g.h; y++)
      rows.push(`    ${layer.data.slice(y * g.w, (y + 1) * g.w).join(',')}`);
    const rest = JSON.stringify({ ...layer, data: undefined });
    return `${rest.slice(0, -1)},"data":[\n${rows.join(',\n')}\n  ]}`;
  });
  const head = JSON.stringify({ ...tiled, layers: undefined });
  return `${head.slice(0, -1)},"layers":[\n  ${layerText.join(',\n  ')}\n]}\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const grids = {
  overworld: buildOverworld(MAPS.overworld),
  trail: buildTrail(MAPS.trail),
};
for (const [id, spec] of Object.entries(INTERIORS)) {
  grids[id] = buildInterior(id, spec.rows, spec.floor, spec.alt, MAPS[id]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [id, g] of Object.entries(grids)) {
  const text = serialize(g);
  JSON.parse(text); // fail loudly if the hand-rolled serializer ever breaks
  writeFileSync(path.join(OUT_DIR, `${id}.json`), text);
  console.log(`  wrote ${id}.json (${g.w}x${g.h})`);
}
