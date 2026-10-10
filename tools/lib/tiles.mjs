/**
 * tiles-town.png: a 16x16 grid of 16px tiles (256x256). Slot 0 is blank.
 * Every tile is drawn pixel-by-pixel with the Canvas helpers.
 */
import { Canvas, rng, hash } from './canvas.mjs';

export const TILESET_COLUMNS = 16;

/** Draw `n` scattered pixels of `key` on c using r(). */
function speckle(c, r, n, key, w = 16, h = 16) {
  for (let i = 0; i < n; i++) c.set(Math.floor(r() * w), Math.floor(r() * h), key);
}

/** Short horizontal strokes (2-3px) for grass/water texture. */
function strokes(c, r, n, key, len = 2) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * 16);
    const y = Math.floor(r() * 16);
    for (let k = 0; k < len; k++) c.set((x + k) % 16, y, key);
  }
}

/** Map (side, i, depth) to pixel coords of a 16x16 tile: used by edge helpers. */
function edgePos(side, i, d) {
  if (side === 'n') return [i, d];
  if (side === 's') return [i, 15 - d];
  if (side === 'w') return [d, i];
  return [15 - d, i];
}

// ---------------------------------------------------------------- terrain

function grass(c, r, dark = false) {
  c.fill(dark ? 'grassDark' : 'grass');
  strokes(c, r, 7, dark ? 'grass' : 'grassLight');
  speckle(c, r, 5, dark ? 'leafDark' : 'grassDark');
}

function tuft(c, x, y, hi) {
  c.set(x, y, 'grassDark');
  c.set(x, y - 1, hi);
  c.set(x - 1, y - 1, 'grassLight');
  c.set(x - 1, y - 2, hi);
  c.set(x + 1, y - 2, 'grassLight');
}

function flower(c, x, y, petal, centre) {
  c.set(x, y + 2, 'leaf');
  c.set(x, y + 1, 'leaf');
  c.set(x - 1, y, petal);
  c.set(x + 1, y, petal);
  c.set(x, y - 1, petal);
  c.set(x, y, centre);
}

function dirtBase(c, r) {
  c.fill('dirt');
  strokes(c, r, 6, 'dirtLight');
  speckle(c, r, 8, 'dirtDark');
}

function plazaBlocks(c, r) {
  for (const by of [0, 8]) {
    for (const bx of [0, 8]) {
      c.fillRect(bx, by, 8, 8, 'stoneLight');
      c.fillRect(bx, by, 7, 1, 'stoneHi');
      c.fillRect(bx, by, 1, 7, 'stoneHi');
      c.fillRect(bx + 7, by, 1, 8, 'stone');
      c.fillRect(bx, by + 7, 8, 1, 'stone');
      c.set(bx + 7, by + 7, 'stoneDark');
      // tiny per-block wear
      c.set(bx + 2 + Math.floor(r() * 4), by + 2 + Math.floor(r() * 4), 'stone');
    }
  }
}

/** Plaza with raised kerb on the listed sides (outside is grass). */
function plazaEdge(c, r, sides) {
  plazaBlocks(c, r);
  for (const s of sides) {
    for (let i = 0; i < 16; i++) {
      const [x0, y0] = edgePos(s, i, 0);
      const [x1, y1] = edgePos(s, i, 1);
      c.set(x0, y0, 'stoneDark');
      c.set(x1, y1, s === 'n' || s === 'w' ? 'stoneHi' : 'stone');
    }
  }
}

/** Path tile with ragged transparent edges on the listed sides (drawn over grass). */
function pathEdge(c, r, sides) {
  dirtBase(c, r);
  strokes(c, r, 3, 'dirtLight', 3);
  for (const s of sides) {
    for (let i = 0; i < 16; i++) {
      const jit = (i * 5 + s.charCodeAt(0)) % 4 === 0 ? 1 : 0;
      for (let d = 0; d <= jit; d++) {
        const [x, y] = edgePos(s, i, d);
        c.set(x, y, null);
      }
      const [sx, sy] = edgePos(s, i, jit + 1);
      c.set(sx, sy, 'dirtDark');
    }
  }
  // round off the outer corners
  const has = (s) => sides.includes(s);
  const corner = (a, b, x, y) => {
    if (has(a) && has(b)) {
      c.set(x, y, null);
    }
  };
  corner('n', 'w', 0, 0);
  corner('n', 'w', 1, 0);
  corner('n', 'w', 0, 1);
  corner('n', 'e', 15, 0);
  corner('n', 'e', 14, 0);
  corner('n', 'e', 15, 1);
  corner('s', 'w', 0, 15);
  corner('s', 'w', 1, 15);
  corner('s', 'w', 0, 14);
  corner('s', 'e', 15, 15);
  corner('s', 'e', 14, 15);
  corner('s', 'e', 15, 14);
}

function waterBase(c, r) {
  c.fill('water');
  strokes(c, r, 5, 'waterLight', 3);
  speckle(c, r, 4, 'waterDark');
}

/** Water tile with a grassy bank along `side`. */
function waterBank(c, r, side) {
  waterBase(c, r);
  for (let i = 0; i < 16; i++) {
    const set = (d, k) => {
      const [x, y] = edgePos(side, i, d);
      c.set(x, y, k);
    };
    set(0, (i + 1) % 5 === 0 ? 'grassLight' : 'grass');
    set(1, (i * 3) % 7 === 0 ? 'grass' : 'grassDark');
    set(2, 'dirtDark');
    set(3, i % 2 === 0 ? 'waterFoam' : 'water');
  }
}

// ---------------------------------------------------------------- trees

function shadeBlob(c, cx, cy, rx, ry, lx, ly, r) {
  c.ellipse(cx, cy, rx, ry, (x, y) => {
    const d = Math.hypot(x - lx, y - ly) / Math.max(rx, ry);
    const wob = (x + y) % 2 === 0;
    if (d < 0.32) return 'leafLight';
    if (d < 0.42) return wob ? 'leafLight' : 'leaf';
    if (d < 0.85) return 'leaf';
    if (d < 0.95) return wob ? 'leaf' : 'leafDark';
    return 'leafDark';
  });
  // leaf-cluster scallops
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const rad = r() * 0.7;
    const x = Math.round(cx + Math.cos(a) * rx * rad);
    const y = Math.round(cy + Math.sin(a) * ry * rad);
    c.set(x - 1, y, 'leafDark');
    c.set(x, y + 1, 'leafDark');
    c.set(x + 1, y, 'leafDark');
    c.set(x - 1, y - 1, 'leafLight');
  }
}

function drawTree() {
  const r = rng(hash('tree'));
  const t = new Canvas(32, 32);
  // trunk
  t.fillRect(13, 21, 6, 10, 'wood');
  t.fillRect(13, 21, 2, 10, 'woodLight');
  t.fillRect(17, 21, 2, 10, 'woodDark');
  t.fillRect(12, 29, 8, 2, 'wood');
  t.set(12, 29, 'woodLight');
  t.set(15, 25, 'woodDark');
  t.set(14, 27, 'woodDark');
  // canopy
  shadeBlob(t, 16, 13, 14, 12.5, 10, 6, r);
  for (let i = 0; i < 3; i++)
    t.set(8 + Math.floor(r() * 16), 5 + Math.floor(r() * 14), 'crimsonLight'); // blossoms
  t.outline('ink');
  // ground shadow tucked underneath
  t.ellipse(16, 30, 11, 2.2, 'shadow', 90);
  // restore ink over trunk base after shadow is set under
  return t;
}

function drawBush() {
  const r = rng(hash('bush'));
  const b = new Canvas(16, 16);
  shadeBlob(b, 8, 9, 6.5, 5.5, 5, 6, r);
  b.outline('ink');
  b.ellipse(8, 14, 7, 1.5, 'shadow', 90);
  return b;
}

// ---------------------------------------------------------------- fences

function fence(c, arms) {
  const hasArm = (a) => arms.includes(a);
  // horizontal rails (two stacked), vertical rails (two side by side)
  const spans = [];
  if (hasArm('w')) spans.push(['h', 0, 8]);
  if (hasArm('e')) spans.push(['h', 7, 15]);
  if (hasArm('n')) spans.push(['v', 0, 8]);
  if (hasArm('s')) spans.push(['v', 7, 15]);
  const rail = (kind, a, b, pass) => {
    for (const off of [3, 9]) {
      if (kind === 'h') {
        if (pass === 0) c.fillRect(a, off, b - a + 1, 4, 'ink');
        else {
          c.fillRect(a, off + 1, b - a + 1, 1, 'woodLight');
          c.fillRect(a, off + 2, b - a + 1, 1, 'wood');
        }
      } else if (pass === 0) c.fillRect(off, a, 4, b - a + 1, 'ink');
      else {
        c.fillRect(off + 1, a, 1, b - a + 1, 'woodLight');
        c.fillRect(off + 2, a, 1, b - a + 1, 'wood');
      }
    }
  };
  for (const pass of [0, 1]) for (const [k, a, b] of spans) rail(k, a, b, pass);
  // post
  c.fillRect(6, 1, 4, 14, 'ink');
  c.fillRect(7, 2, 1, 12, 'woodLight');
  c.fillRect(8, 2, 1, 12, 'wood');
  c.set(7, 2, 'creamDark');
  c.set(8, 2, 'woodLight');
}

// ---------------------------------------------------------------- interiors

function stripes(c, base, line, period = 8) {
  c.fill(base);
  for (let x = 0; x < 16; x += period) c.fillRect(x, 0, 1, 16, line);
}

function windowPane(c, x, y, w, h) {
  c.fillRect(x - 1, y - 1, w + 2, h + 2, 'ink');
  c.fillRect(x, y, w, h, 'glass');
  c.fillRect(x, y, w, 2, 'glassLight');
  c.fillRect(x + (w >> 1) - 1, y, 1, h, 'woodDark');
  c.fillRect(x, y + (h >> 1) - 1, w, 1, 'woodDark');
  c.set(x + 1, y + 2, 'glassLight');
  c.set(x + 2, y + 3, 'glassLight');
  c.fillRect(x - 1, y + h + 1, w + 2, 1, 'creamShadow');
}

const BOOK_COLORS = ['crimson', 'creamLight', 'flagGold', 'waterDark', 'leaf', 'brick', 'cream'];

function books(c, x, y, w, h, r) {
  let i = 0;
  while (i < w) {
    const bw = 1 + Math.floor(r() * 2);
    const bh = h - Math.floor(r() * 2);
    const col = BOOK_COLORS[Math.floor(r() * BOOK_COLORS.length)];
    c.fillRect(x + i, y + h - bh, bw, bh, col);
    c.set(x + i, y + h - bh, 'creamLight');
    i += bw;
  }
}

// ---------------------------------------------------------------- builder

export function buildTiles() {
  const sheet = new Canvas(256, 256);
  const names = ['blank']; // slot 0 stays transparent

  function place(name, c, sx = 0, sy = 0) {
    const idx = names.length;
    if (idx >= 256) throw new Error('tileset full');
    names.push(name);
    sheet.blit(c, (idx % TILESET_COLUMNS) * 16, Math.floor(idx / TILESET_COLUMNS) * 16, {
      sx,
      sy,
      w: 16,
      h: 16,
    });
  }
  function add(name, fn) {
    const c = new Canvas(16, 16);
    fn(c, rng(hash(name)));
    place(name, c);
  }

  // ---- terrain
  add('grass', (c, r) => grass(c, r));
  add('grassTuft', (c, r) => {
    grass(c, r);
    tuft(c, 4, 6, 'grassHi');
    tuft(c, 11, 11, 'grassHi');
    tuft(c, 12, 4, 'grassHi');
  });
  add('grassFlowerCrimson', (c, r) => {
    grass(c, r);
    flower(c, 4, 4, 'crimsonLight', 'creamLight');
    flower(c, 11, 8, 'crimson', 'flagGold');
    flower(c, 5, 12, 'crimsonLight', 'creamLight');
  });
  add('grassFlowerCream', (c, r) => {
    grass(c, r);
    flower(c, 10, 4, 'creamLight', 'flagGold');
    flower(c, 4, 9, 'cream', 'flagGold');
    flower(c, 12, 12, 'creamLight', 'flagGold');
  });
  add('grassDark', (c, r) => grass(c, r, true));
  add('dirt', (c, r) => dirtBase(c, r));
  add('dirtPath', (c, r) => {
    dirtBase(c, r);
    // worn centre and a few pebbles
    c.fillRect(0, 7, 16, 2, 'dirtLight');
    speckle(c, r, 3, 'stoneLight');
    speckle(c, r, 2, 'stoneDark');
  });
  add('sand', (c, r) => {
    c.fill('dirtLight');
    strokes(c, r, 5, 'creamDark', 2);
    speckle(c, r, 7, 'dirt');
    speckle(c, r, 3, 'cream');
  });

  // ---- stone plaza
  add('plaza', (c, r) => plazaBlocks(c, r));
  add('plazaCrack', (c, r) => {
    plazaBlocks(c, r);
    c.line(3, 1, 6, 6, 'stoneDark');
    c.line(6, 6, 9, 8, 'stoneDark');
    c.line(9, 8, 10, 13, 'stoneDark');
  });
  const nine = [
    ['TL', ['n', 'w']],
    ['T', ['n']],
    ['TR', ['n', 'e']],
    ['L', ['w']],
    ['C', []],
    ['R', ['e']],
    ['BL', ['s', 'w']],
    ['B', ['s']],
    ['BR', ['s', 'e']],
  ];
  for (const [sfx, sides] of nine) add(`plaza${sfx}`, (c, r) => plazaEdge(c, r, sides));
  for (const [sfx, sides] of nine) add(`path${sfx}`, (c, r) => pathEdge(c, r, sides));

  // ---- water
  add('water', (c, r) => waterBase(c, r));
  add('waterEdgeN', (c, r) => waterBank(c, r, 'n'));
  add('waterEdgeS', (c, r) => waterBank(c, r, 's'));
  add('waterEdgeE', (c, r) => waterBank(c, r, 'e'));
  add('waterEdgeW', (c, r) => waterBank(c, r, 'w'));
  const bridgeV = new Canvas(16, 16);
  {
    // plank deck seen from above, walkable north-south
    bridgeV.fill('water');
    bridgeV.fillRect(2, 0, 12, 16, 'woodLight');
    for (let y = 0; y < 16; y++) {
      if (y % 4 === 3) bridgeV.fillRect(2, y, 12, 1, 'woodDark');
      else if (y % 4 === 0) bridgeV.fillRect(2, y, 12, 1, 'dirtLight');
      else bridgeV.fillRect(2, y, 12, 1, 'woodLight');
    }
    for (const [x, hi] of [
      [0, 'woodDark'],
      [1, 'woodLight'],
      [14, 'woodLight'],
      [15, 'woodDark'],
    ]) {
      bridgeV.fillRect(x, 0, 1, 16, hi);
    }
    for (const y of [1, 9]) {
      bridgeV.fillRect(0, y, 2, 3, 'wood');
      bridgeV.fillRect(14, y, 2, 3, 'wood');
      bridgeV.set(0, y, 'woodLight');
      bridgeV.set(14, y, 'woodLight');
    }
  }
  place('bridge', bridgeV);
  place('bridgeH', bridgeV.transpose());

  // ---- trees & bushes
  const tree = drawTree();
  place('treeTL', tree, 0, 0);
  place('treeTR', tree, 16, 0);
  place('treeBL', tree, 0, 16);
  place('treeBR', tree, 16, 16);
  place('bushSmall', drawBush());

  // ---- fences
  add('fenceH', (c) => fence(c, ['w', 'e']));
  add('fenceV', (c) => fence(c, ['n', 's']));
  add('fenceCornerTL', (c) => fence(c, ['e', 's']));
  add('fenceCornerTR', (c) => fence(c, ['w', 's']));
  add('fenceCornerBL', (c) => fence(c, ['e', 'n']));
  add('fenceCornerBR', (c) => fence(c, ['w', 'n']));
  add('fencePost', (c) => fence(c, []));

  // ---- mountain / trail
  add('rock', (c, r) => {
    c.ellipse(8, 9, 7, 5.5, (x, y, nx, ny) => {
      if (nx + ny < -0.9) return 'stoneHi';
      if (nx + ny < -0.2) return 'stoneLight';
      if (nx + ny < 0.7) return 'stone';
      return 'stoneDark';
    });
    c.set(7, 10, 'stoneDark');
    c.set(8, 11, 'stoneDark');
    c.set(9, 11, 'stoneDark');
    c.outline('ink');
    c.ellipse(8, 15, 7, 1.2, 'shadow', 90);
    void r;
  });
  add('cliff', (c, r) => {
    c.fill('stone');
    for (const bx of [0, 5, 9, 13]) {
      const jag = Math.floor(r() * 3);
      for (let y = 0; y < 16; y++) c.set(bx + (y + jag > 8 ? 1 : 0), y, 'stoneDark');
      c.fillRect(bx + 1, 0, 2, 3, 'stoneLight');
    }
    c.fillRect(0, 0, 16, 2, 'stoneLight');
    c.fillRect(0, 0, 16, 1, 'stoneHi');
    c.fillRect(0, 13, 16, 3, 'stoneDark');
    c.dither(0, 11, 16, 2, 'stone', 'stoneDark');
    speckle(c, r, 6, 'stoneLight', 16, 12);
  });
  add('trailStep', (c, r) => {
    dirtBase(c, r);
    for (const y of [2, 9]) {
      c.fillRect(0, y, 16, 5, 'ink');
      c.fillRect(0, y + 1, 16, 1, 'woodLight');
      c.fillRect(0, y + 2, 16, 2, 'wood');
      c.set(3, y + 1, 'wood');
      c.set(11, y + 2, 'woodDark');
    }
    c.fillRect(0, 7, 16, 1, 'dirtDark');
    c.fillRect(0, 14, 16, 1, 'dirtDark');
  });
  add('summitSnow', (c, r) => {
    c.fill('white');
    c.dither(0, 12, 16, 4, 'white', 'waterFoam');
    c.fillRect(0, 14, 16, 2, 'waterFoam');
    speckle(c, r, 6, 'waterFoam', 16, 11);
    speckle(c, r, 3, 'stoneHi', 16, 16);
    c.set(3, 3, 'creamLight');
    c.set(10, 6, 'creamLight');
  });

  // ---- interior floors
  add('floorWood', (c, r) => {
    c.fill('woodLight');
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      c.fillRect(0, y + 3, 16, 1, 'wood');
      c.fillRect(0, y, 16, 1, 'dirtLight');
      c.fillRect((row * 5 + 3) % 16, y, 1, 3, 'wood');
    }
    speckle(c, r, 6, 'wood');
  });
  add('floorWoodAlt', (c, r) => {
    c.fill('wood');
    for (let row = 0; row < 2; row++) {
      const y = row * 8;
      c.fillRect(0, y + 7, 16, 1, 'woodDark');
      c.fillRect(0, y, 16, 1, 'woodLight');
      c.fillRect((row * 7 + 4) % 16, y, 1, 7, 'woodDark');
    }
    speckle(c, r, 8, 'woodDark');
  });
  add('floorTile', (c) => {
    for (const by of [0, 8]) {
      for (const bx of [0, 8]) {
        const alt = (bx + by) % 16 === 0;
        c.fillRect(bx, by, 8, 8, alt ? 'creamLight' : 'cream');
        c.fillRect(bx + 7, by, 1, 8, 'creamDark');
        c.fillRect(bx, by + 7, 8, 1, 'creamDark');
        c.set(bx + 1, by + 1, 'white');
      }
    }
  });
  add('floorCarpet', (c) => {
    c.fill('crimson');
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if ((x + y) % 8 === 0 || (x - y + 16) % 8 === 0) c.set(x, y, 'crimsonDark');
        else if ((x + y) % 8 === 4 && (x - y + 16) % 8 === 4) c.set(x, y, 'crimsonLight');
      }
    }
  });
  add('floorConcrete', (c, r) => {
    c.fill('stoneLight');
    speckle(c, r, 14, 'stone');
    speckle(c, r, 8, 'stoneHi');
    c.fillRect(0, 15, 16, 1, 'stone');
    c.fillRect(15, 0, 1, 16, 'stone');
  });

  // ---- interior walls
  add('wallUpper', (c) => {
    stripes(c, 'cream', 'creamDark', 8);
    stripes(c, 'cream', 'creamDark', 8);
    for (let x = 4; x < 16; x += 8) c.fillRect(x, 0, 1, 16, 'creamLight');
  });
  add('wallLower', (c) => {
    c.fill('wood');
    c.fillRect(0, 0, 16, 1, 'woodDark');
    c.fillRect(0, 1, 16, 2, 'woodLight');
    for (const x of [0, 8]) c.fillRect(x, 3, 1, 10, 'woodDark');
    c.fillRect(0, 13, 16, 1, 'woodLight');
    c.fillRect(0, 14, 16, 2, 'woodDark');
    c.fillRect(1, 4, 6, 1, 'woodLight');
    c.fillRect(9, 4, 6, 1, 'woodLight');
  });
  add('wallTrim', (c) => {
    c.fill('inkSoft');
    c.fillRect(0, 7, 16, 1, 'ink');
    c.fillRect(0, 8, 16, 1, 'crimsonLight');
    c.fillRect(0, 9, 16, 2, 'crimson');
    c.fillRect(0, 11, 16, 1, 'crimsonDark');
    c.fillRect(0, 12, 16, 1, 'creamShadow');
    c.fillRect(0, 13, 16, 3, 'cream');
    c.dither(0, 13, 16, 1, 'creamShadow', 'cream');
    for (let x = 2; x < 16; x += 4) c.set(x, 10, 'crimsonLight');
  });
  add('wallWindow', (c) => {
    stripes(c, 'cream', 'creamDark', 8);
    windowPane(c, 3, 2, 10, 10);
  });
  add('wallBookshelf', (c, r) => {
    c.fill('woodDark');
    c.fillRect(1, 0, 14, 16, 'wood');
    for (const y of [0, 5, 10]) {
      books(c, 1, y + 1, 14, 4, r);
      c.fillRect(0, y + 5, 16, 1, 'woodDark');
    }
    c.fillRect(0, 15, 16, 1, 'woodDark');
    c.fillRect(0, 0, 1, 16, 'woodDark');
    c.fillRect(15, 0, 1, 16, 'woodDark');
  });
  add('wallPoster', (c) => {
    stripes(c, 'cream', 'creamDark', 8);
    c.fillRect(3, 2, 10, 11, 'ink');
    c.fillRect(4, 3, 8, 9, 'creamLight');
    c.fillRect(5, 4, 6, 3, 'crimson');
    c.fillRect(5, 8, 6, 1, 'crimsonDark');
    c.fillRect(5, 10, 4, 1, 'stone');
    c.set(2, 1, 'flagGold');
    c.set(13, 1, 'flagGold');
  });
  add('wallWhiteboard', (c) => {
    stripes(c, 'cream', 'creamDark', 8);
    c.fillRect(0, 2, 16, 11, 'metalDark');
    c.fillRect(1, 3, 14, 9, 'white');
    c.fillRect(1, 3, 14, 1, 'stoneHi');
    c.line(3, 5, 9, 5, 'waterDark');
    c.line(3, 7, 12, 7, 'crimson');
    c.line(3, 9, 7, 9, 'leaf');
    c.fillRect(2, 13, 12, 1, 'metal');
    c.set(4, 12, 'crimsonDark');
  });

  // ---- interior objects (transparent background)
  add('desk', (c) => {
    c.fillRect(0, 3, 16, 9, 'ink');
    c.fillRect(1, 4, 14, 5, 'woodLight');
    c.fillRect(1, 4, 14, 1, 'dirtLight');
    c.fillRect(1, 9, 14, 3, 'wood');
    c.fillRect(1, 12, 2, 3, 'ink');
    c.fillRect(13, 12, 2, 3, 'ink');
    c.fillRect(1, 12, 1, 3, 'woodDark');
    c.fillRect(13, 12, 1, 3, 'woodDark');
    c.fillRect(6, 10, 4, 1, 'woodDark');
    c.set(8, 10, 'flagGold');
    c.fillRect(11, 5, 3, 2, 'creamLight'); // paper
    c.set(12, 6, 'crimson');
  });
  add('deskComputer', (c) => {
    c.fillRect(0, 7, 16, 8, 'ink');
    c.fillRect(1, 8, 14, 4, 'woodLight');
    c.fillRect(1, 8, 14, 1, 'dirtLight');
    c.fillRect(1, 12, 14, 2, 'wood');
    // monitor
    c.fillRect(3, 0, 10, 8, 'ink');
    c.fillRect(4, 1, 8, 5, 'screenDim');
    c.fillRect(4, 1, 8, 1, 'screenOn');
    c.line(5, 3, 9, 3, 'screenOn');
    c.line(5, 4, 7, 4, 'screenOn');
    c.fillRect(4, 6, 8, 1, 'metal');
    c.fillRect(6, 7, 4, 1, 'metalDark');
    // keyboard
    c.fillRect(4, 9, 8, 2, 'creamLight');
    c.dither(4, 10, 8, 1, 'cream', 'creamDark');
  });
  add('bed', (c) => {
    c.fillRect(1, 0, 14, 16, 'ink');
    c.fillRect(2, 1, 12, 14, 'woodDark');
    c.fillRect(3, 2, 10, 12, 'creamLight');
    c.fillRect(4, 3, 8, 3, 'white'); // pillow
    c.fillRect(4, 5, 8, 1, 'creamDark');
    c.fillRect(3, 7, 10, 7, 'crimson');
    c.fillRect(3, 7, 10, 1, 'creamLight');
    c.fillRect(3, 8, 10, 1, 'crimsonLight');
    c.fillRect(3, 13, 10, 1, 'crimsonDark');
    c.dither(5, 10, 6, 2, 'crimson', 'crimsonDark');
  });
  add('bookshelf', (c, r) => {
    c.fillRect(0, 0, 16, 16, 'ink');
    c.fillRect(1, 1, 14, 14, 'wood');
    for (const y of [1, 6, 11]) {
      c.fillRect(2, y, 12, 4, 'woodDark');
      books(c, 2, y, 12, 4, r);
      c.fillRect(1, y + 4, 14, 1, 'woodLight');
    }
  });
  add('rug', (c) => {
    c.fillRect(1, 1, 14, 14, 'ink');
    c.fillRect(2, 2, 12, 12, 'crimson');
    c.rect(3, 3, 10, 10, 'creamLight');
    c.fillRect(4, 4, 8, 8, 'crimsonDark');
    c.disc(8, 8, 2.5, 'creamLight');
    c.disc(8, 8, 1.2, 'crimson');
    for (const [x, y] of [
      [2, 2],
      [13, 2],
      [2, 13],
      [13, 13],
    ])
      c.set(x, y, 'flagGold');
  });
  add('chair', (c) => {
    c.fillRect(3, 1, 10, 6, 'ink');
    c.fillRect(4, 2, 8, 4, 'woodLight');
    c.fillRect(4, 2, 8, 1, 'dirtLight');
    c.fillRect(4, 5, 8, 1, 'wood');
    c.fillRect(3, 7, 10, 6, 'ink');
    c.fillRect(4, 8, 8, 4, 'crimson');
    c.fillRect(4, 8, 8, 1, 'crimsonLight');
    c.fillRect(3, 13, 2, 2, 'ink');
    c.fillRect(11, 13, 2, 2, 'ink');
    c.set(3, 13, 'woodDark');
    c.set(11, 13, 'woodDark');
  });
  add('table', (c) => {
    c.ellipse(8, 8, 7.5, 6, 'ink');
    c.ellipse(8, 7, 6.5, 5, (x, y, nx, ny) => (nx + ny < -0.6 ? 'dirtLight' : 'woodLight'));
    c.ellipse(8, 9.5, 6, 2.2, (x, y, nx, ny) => (ny > 0.3 ? 'wood' : undefined));
    c.fillRect(6, 11, 4, 3, 'woodDark');
    c.set(7, 6, 'creamLight');
    c.set(8, 6, 'creamLight');
  });
  add('counter', (c) => {
    c.fillRect(0, 2, 16, 14, 'ink');
    c.fillRect(1, 3, 14, 5, 'stoneHi');
    c.fillRect(1, 3, 14, 1, 'white');
    c.fillRect(1, 7, 14, 1, 'stoneLight');
    c.fillRect(1, 8, 14, 7, 'woodDark');
    c.fillRect(2, 9, 5, 5, 'wood');
    c.fillRect(9, 9, 5, 5, 'wood');
    c.set(6, 11, 'flagGold');
    c.set(9, 11, 'flagGold');
  });
  add('plant', (c) => {
    c.fillRect(4, 9, 8, 7, 'ink');
    c.fillRect(5, 10, 6, 5, 'brick');
    c.fillRect(5, 10, 6, 1, 'brickLight');
    c.fillRect(5, 14, 6, 1, 'brickDark');
    c.ellipse(8, 5, 6, 5, (x, y, nx, ny) =>
      nx + ny < -0.5 ? 'leafLight' : nx + ny < 0.4 ? 'leaf' : 'leafDark',
    );
    c.outline('ink');
    c.line(8, 6, 8, 9, 'leafDark');
    c.set(5, 3, 'grassHi');
    c.set(10, 5, 'grassHi');
  });
  add('crate', (c) => {
    c.fillRect(1, 2, 14, 13, 'ink');
    c.fillRect(2, 3, 12, 11, 'woodLight');
    c.rect(2, 3, 12, 11, 'woodDark');
    c.line(3, 4, 12, 12, 'wood');
    c.line(12, 4, 3, 12, 'wood');
    c.fillRect(2, 3, 12, 1, 'dirtLight');
    c.set(3, 4, 'flagGold');
    c.set(12, 4, 'flagGold');
  });
  add('doorMat', (c) => {
    c.fillRect(1, 4, 14, 9, 'ink');
    c.fillRect(2, 5, 12, 7, 'creamLight');
    c.fillRect(2, 6, 12, 1, 'crimson');
    c.fillRect(2, 10, 12, 1, 'crimson');
    c.dither(3, 8, 10, 1, 'cream', 'creamDark');
    c.fillRect(1, 13, 14, 1, 'creamDark');
  });
  add('stairsDown', (c) => {
    c.fill('ink');
    for (let i = 0; i < 4; i++) {
      const y = i * 4;
      const shade = ['stoneLight', 'stone', 'stoneDark', 'inkSoft'][i];
      c.fillRect(2, y, 12, 3, shade);
      c.fillRect(2, y, 12, 1, i === 0 ? 'stoneHi' : 'stoneLight');
      c.fillRect(2, y + 3, 12, 1, 'black');
    }
    c.fillRect(0, 0, 2, 16, 'stoneDark');
    c.fillRect(14, 0, 2, 16, 'stoneDark');
    c.fillRect(0, 0, 1, 16, 'stone');
  });

  // ---- doors
  add('doorClosed', (c) => {
    c.fillRect(1, 0, 14, 16, 'ink');
    c.fillRect(2, 1, 12, 15, 'crimsonDark');
    c.fillRect(3, 2, 10, 14, 'crimson');
    c.fillRect(3, 2, 10, 1, 'crimsonLight');
    c.fillRect(4, 4, 3, 4, 'crimsonDark');
    c.fillRect(9, 4, 3, 4, 'crimsonDark');
    c.fillRect(4, 9, 3, 5, 'crimsonDark');
    c.fillRect(9, 9, 3, 5, 'crimsonDark');
    c.set(11, 9, 'flagGold');
    c.set(11, 10, 'flagGold');
  });
  add('doorOpen', (c) => {
    c.fillRect(1, 0, 14, 16, 'ink');
    c.fillRect(2, 1, 12, 15, 'black');
    c.fillRect(3, 2, 10, 14, 'inkSoft');
    c.fillRect(3, 14, 10, 2, 'woodDark');
    c.fillRect(2, 1, 3, 15, 'crimsonDark');
    c.fillRect(3, 2, 1, 14, 'crimson');
    c.set(4, 9, 'flagGold');
  });

  add('blockSolid', (c) => c.fill('crimsonLight'));

  return { sheet, names };
}
