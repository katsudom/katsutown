/**
 * UI art: 9-slice frame, title logo, minimap, touch controls.
 */
import { Canvas, rng, hash } from './canvas.mjs';

// ------------------------------------------------------------ ui-frame

function uiFrame() {
  const c = new Canvas(48, 48);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      const d = Math.min(x, y, 47 - x, 47 - y);
      let k;
      if (d === 0) k = 'ink';
      else if (d <= 2) k = d === 1 ? 'crimsonLight' : 'crimson';
      else if (d === 3) k = 'crimsonDark';
      else if (d === 4) {
        // inner highlight on the top/left edges, soft shade on bottom/right
        const topLeft = y <= x && y <= 47 - x ? true : x < y && x <= 47 - y;
        k = topLeft ? 'creamLight' : 'creamDark';
      } else k = 'cream';
      c.set(x, y, k);
    }
  }
  // round the outer corners
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [47, 0, -1, 1],
    [0, 47, 1, -1],
    [47, 47, -1, -1],
  ]) {
    c.set(cx, cy, null);
    c.set(cx + sx, cy, 'ink');
    c.set(cx, cy + sy, 'ink');
    c.set(cx + sx, cy + sy, 'ink');
    c.set(cx + 2 * sx, cy + sy, 'crimsonLight');
    c.set(cx + sx, cy + 2 * sy, 'crimsonLight');
  }
  // golden corner studs
  for (const [x, y] of [
    [4, 4],
    [43, 4],
    [4, 43],
    [43, 43],
  ])
    c.set(x, y, 'flagGold');
  return c;
}

// ------------------------------------------------------------ pixel letters (5x7)

const LETTERS = {
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
};

/** Paint a letter bitmap at integer scale; returns nothing, draws `key`. */
function stampLetter(c, glyph, x, y, sx, sy, key) {
  glyph.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '#') c.fillRect(x + i * sx, y + j * sy, sx, sy, key);
    }
  });
}

function titleLogo() {
  const text = 'KATSUDOM TOWN';
  const sx = 2;
  const sy = 3;
  const pitch = 5 * sx + 4;
  const spaceAdv = 12;
  const mask = new Canvas(208, 48);
  let total = 0;
  for (const ch of text) total += ch === ' ' ? spaceAdv : pitch;
  total -= 4;
  const x0 = Math.floor((208 - total - 2) / 2); // leave room for the drop shadow
  const y0 = Math.floor((48 - 7 * sy - 2) / 2);
  let x = x0;
  for (const ch of text) {
    if (ch === ' ') x += spaceAdv;
    else {
      stampLetter(mask, LETTERS[ch], x, y0, sx, sy, 'cream');
      x += pitch;
    }
  }
  const c = new Canvas(208, 48);
  // crimson drop shadow (2px down-right)
  for (let y = 0; y < 48; y++) {
    for (let xx = 0; xx < 208; xx++) {
      if (mask.solid(xx - 2, y - 2))
        c.set(
          xx,
          y,
          mask.solid(xx - 2, y - 1) && mask.solid(xx - 2, y - 3) ? 'crimson' : 'crimsonDark',
        );
    }
  }
  // cream letters with top highlight and bottom shade
  for (let y = 0; y < 48; y++) {
    for (let xx = 0; xx < 208; xx++) {
      if (!mask.solid(xx, y)) continue;
      let k = 'cream';
      if (!mask.solid(xx, y - 1)) k = 'creamLight';
      else if (!mask.solid(xx, y + 1)) k = 'creamDark';
      c.set(xx, y, k);
    }
  }
  c.outline('ink', true);
  return c;
}

// ------------------------------------------------------------ minimap

function minimap() {
  const c = new Canvas(160, 120);
  const r = rng(hash('minimap'));
  const S = 160 / 60; // pixels per tile
  const px = (t) => Math.round(t * S);
  const rectT = (tx, ty, tw, th, key) =>
    c.fillRect(px(tx), px(ty), px(tx + tw) - px(tx), px(ty + th) - px(ty), key);

  // ground with a hint of texture
  c.fill('grass');
  for (let i = 0; i < 260; i++)
    c.set(Math.floor(r() * 160), Math.floor(r() * 120), r() < 0.5 ? 'grassLight' : 'grassDark');

  // tree border (dark) on N, W and E; creek along the south
  for (let x = 0; x < 160; x++) {
    for (let y = 0; y < 120; y++) {
      const edge = Math.min(x, 159 - x, y);
      if (edge < 5 && (x + y * 3) % 4 !== 3) c.set(x, y, edge < 3 ? 'leafDark' : 'leaf');
    }
  }
  for (let x = 0; x < 160; x++) {
    const wob = Math.round(Math.sin(x / 9) * 2);
    const top = 106 + wob;
    for (let y = top; y < 120; y++)
      c.set(x, y, y === top ? 'waterFoam' : y % 5 === 0 ? 'waterLight' : 'water');
  }
  // path cross
  rectT(29, 4, 2, 37, 'dirt');
  rectT(6, 21, 48, 2, 'dirt');
  c.fillRect(px(29) + 1, px(4), 1, px(41) - px(4), 'dirtLight');
  c.fillRect(px(6), px(21) + 1, px(54) - px(6), 1, 'dirtLight');
  // bridge over the creek
  c.fillRect(px(29) - 1, 104, px(2) + 2, 14, 'woodLight');
  c.fillRect(px(29) - 1, 104, 1, 14, 'woodDark');
  c.fillRect(px(31) + 1, 104, 1, 14, 'woodDark');

  // stone square with fountain
  rectT(24, 16, 12, 11, 'stoneDark');
  rectT(24.4, 16.4, 11.2, 10.2, 'stoneLight');
  c.dither(px(24.4), px(16.4), px(35.6) - px(24.4), 1, 'stoneHi', 'stoneLight');
  c.disc(px(30), px(21.5), 4, 'stoneDark');
  c.disc(px(30), px(21.5), 3, 'water');
  c.set(px(30) - 1, px(21.5) - 1, 'waterFoam');

  /** Building footprint: ink outline, wall fill, roof strip. */
  const building = (tx, ty, tw, th, wall, roofKey) => {
    const x = px(tx);
    const y = px(ty);
    const w = Math.max(5, px(tx + tw) - x);
    const h = Math.max(5, px(ty + th) - y);
    c.fillRect(x - 1, y - 1, w + 2, h + 3, 'ink');
    c.fillRect(x, y, w, h, wall);
    c.fillRect(x, y, w, Math.ceil(h / 2), roofKey);
    c.fillRect(x, y, w, 1, 'creamLight');
    c.fillRect(x + (w >> 1) - 1, y + h - 2, 2, 2, 'woodDark'); // door mark
  };
  building(8, 13, 6, 5, 'cream', 'crimson'); // Dominic's House
  building(17, 8, 7, 6, 'stoneLight', 'crimson'); // Archive (NW)
  building(17, 29, 6, 5, 'metalLight', 'metalDark'); // Server Shed (SW)
  building(38, 29, 7, 4, 'crimson', 'creamLight'); // Free Food Finder truck (SE)
  building(26, 2, 8, 6, 'brick', 'roofDark'); // Hacklahoma Clubhouse (N)
  building(46, 25, 7, 6, 'stoneLight', 'crimsonDark'); // Admissions
  // campus gate (E): two brick pillars either side of a gap in the path
  for (const ty of [18, 25]) {
    c.fillRect(px(55) - 1, px(ty) - 1, 8, 8, 'ink');
    c.fillRect(px(55), px(ty), 6, 6, 'brick');
    c.fillRect(px(55), px(ty), 6, 2, 'stoneLight');
  }
  c.fillRect(px(55), px(20) + 2, 6, px(25) - px(20) - 3, 'dirt');
  // Ascent trailhead (NE): mountain triangle + dotted trail
  const mx = px(48);
  const my = px(5);
  c.poly(
    [
      [mx + 12, my],
      [mx + 26, my + 26],
      [mx, my + 26],
    ],
    'stone',
  );
  c.poly(
    [
      [mx + 12, my],
      [mx + 12, my + 26],
      [mx, my + 26],
    ],
    'stoneLight',
  );
  c.poly(
    [
      [mx + 12, my],
      [mx + 16, my + 7],
      [mx + 8, my + 7],
    ],
    'white',
  );
  for (let i = 0; i < 6; i++) c.set(mx + 12 + (i % 2) * 2, my + 28 + i * 2, 'dirtLight');
  c.outline('ink');
  return c;
}

// ------------------------------------------------------------ touch controls

function touchDpad() {
  const c = new Canvas(96, 96);
  const pads = [
    { x: 33, y: 1, dir: 'up' },
    { x: 33, y: 65, dir: 'down' },
    { x: 1, y: 33, dir: 'left' },
    { x: 65, y: 33, dir: 'right' },
  ];
  for (const { x, y, dir } of pads) {
    // translucent cream pad with soft rim
    c.fillRect(x, y, 30, 30, 'cream', 150);
    c.rect(x, y, 30, 30, 'ink', 170);
    c.fillRect(x + 1, y + 1, 28, 1, 'creamLight', 210);
    c.fillRect(x + 1, y + 1, 1, 28, 'creamLight', 210);
    for (const [cx, cy] of [
      [x, y],
      [x + 29, y],
      [x, y + 29],
      [x + 29, y + 29],
    ])
      c.set(cx, cy, null);
    // crimson arrow
    const mx = x + 15;
    const my = y + 15;
    const arrow = (ox, oy, key, a) => {
      for (let i = 0; i < 7; i++) {
        const half = i;
        for (let k = -half; k <= half; k++) {
          const [ax, ay] = {
            up: [k, i - 3],
            down: [k, 3 - i],
            left: [i - 3, k],
            right: [3 - i, k],
          }[dir];
          c.set(mx + ax + ox, my + ay + oy, key, a);
        }
      }
    };
    arrow(1, 1, 'crimsonDeep', 200);
    arrow(0, 0, 'crimson', 255);
  }
  return c;
}

const A_GLYPH = ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'];

function touchButton() {
  const c = new Canvas(48, 48);
  c.disc(24, 24, 23.5, 'ink');
  c.disc(24, 24, 22, 'crimsonDark');
  c.disc(24, 24, 20, (x, y, nx, ny) =>
    nx + ny < -0.9 ? 'crimsonLight' : nx + ny > 0.8 ? 'crimsonDark' : 'crimson',
  );
  c.ring(24, 24, 22, 22, 1, 'crimsonLight', 255);
  stampLetter(c, A_GLYPH, 17, 15, 3, 3, 'crimsonDeep');
  stampLetter(c, A_GLYPH, 16, 14, 3, 3, 'cream');
  return c;
}

/** @returns {[string, Canvas][]} */
export function buildUi() {
  return [
    ['assets/ui/ui-frame.png', uiFrame()],
    ['assets/ui/title-logo.png', titleLogo()],
    ['assets/ui/minimap.png', minimap()],
    ['assets/ui/touch-dpad.png', touchDpad()],
    ['assets/ui/touch-button.png', touchButton()],
  ];
}
