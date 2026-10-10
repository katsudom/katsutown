/**
 * Building sprites. All are drawn from the top-left, fill their canvas fully,
 * and get a 1px ink "inner outline" so they keep their exact footprint.
 * Every entrance sits on a 16px column on the bottom tile row.
 */
import { Canvas } from './canvas.mjs';

// ------------------------------------------------------------ materials

/** Staggered 8x4 bricks. */
function bricks(c, x, y, w, h) {
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / 4);
    const off = (row % 2) * 4;
    for (let i = 0; i < w; i++) {
      const bx = (i + off) % 8;
      let k = 'brick';
      if (j % 4 === 3 || bx === 7) k = 'brickDark';
      else if (j % 4 === 0 && bx < 3) k = 'brickLight';
      else if ((i * 7 + j * 3) % 11 === 0) k = 'brickDark';
      c.set(x + i, y + j, k);
    }
  }
}

/** Cut stone blocks 10x6. */
function stoneBlocks(c, x, y, w, h, base = 'stoneLight') {
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / 6);
    const off = (row % 2) * 5;
    for (let i = 0; i < w; i++) {
      const bx = (i + off) % 10;
      let k = base;
      if (j % 6 === 5 || bx === 9) k = 'stone';
      else if (j % 6 === 0 || bx === 0) k = 'stoneHi';
      if (base !== 'stoneLight' && k === 'stoneLight') k = base;
      c.set(x + i, y + j, k);
    }
  }
}

/** Clapboard siding in cream. */
function siding(c, x, y, w, h) {
  for (let j = 0; j < h; j++) {
    const k = j % 4 === 3 ? 'creamDark' : j % 4 === 0 ? 'creamLight' : 'cream';
    c.fillRect(x, y + j, w, 1, k);
  }
}

/** Vertical corrugated metal. */
function corrugated(c, x, y, w, h) {
  const cols = ['metalLight', 'metal', 'metal', 'metalDark'];
  for (let i = 0; i < w; i++) c.fillRect(x + i, y, 1, h, cols[i % 4]);
}

/**
 * Trapezoid roof: rows y0..y1, left edge goes xl0->xl1, right xr0->xr1.
 * Shingle rows of 4px with staggered joints.
 */
function roof(c, y0, y1, xl0, xl1, xr0, xr1, cols = {}) {
  const { base = 'roof', dark = 'roofDark', light = 'roofLight' } = cols;
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const xl = Math.round(xl0 + (xl1 - xl0) * t);
    const xr = Math.round(xr0 + (xr1 - xr0) * t);
    const row = Math.floor((y - y0) / 4);
    for (let x = xl; x <= xr; x++) {
      let k = base;
      const jy = (y - y0) % 4;
      if (jy === 3) k = dark;
      else if (jy === 0) k = light;
      else if ((x + (row % 2) * 3) % 6 === 0) k = dark;
      if (x === xl) k = light;
      if (x === xr) k = dark;
      c.set(x, y, k);
    }
  }
}

/** Framed window with panes. */
function win(c, x, y, w, h, opts = {}) {
  const frame = opts.frame ?? 'creamLight';
  c.fillRect(x - 1, y - 1, w + 2, h + 2, 'ink');
  c.fillRect(x, y, w, h, frame);
  c.fillRect(x + 1, y + 1, w - 2, h - 2, 'glass');
  c.fillRect(x + 1, y + 1, w - 2, 2, 'glassLight');
  c.fillRect(x + (w >> 1), y + 1, 1, h - 2, frame);
  if (h > 8) c.fillRect(x + 1, y + (h >> 1), w - 2, 1, frame);
  c.set(x + 2, y + 3, 'glassLight');
  c.set(x + 3, y + 4, 'glassLight');
  if (opts.sill !== false) c.fillRect(x - 2, y + h + 1, w + 4, 2, 'stoneLight');
}

/** Flat wooden/coloured door rectangle with an ink frame. */
function door(c, x, y, w, h, body = 'crimson', dark = 'crimsonDark', light = 'crimsonLight') {
  c.fillRect(x - 1, y - 1, w + 2, h + 1, 'ink');
  c.fillRect(x, y, w, h, body);
  c.fillRect(x, y, w, 1, light);
  c.fillRect(x + w - 2, y, 2, h, dark);
  const panelW = Math.max(2, (w >> 1) - 2);
  c.fillRect(x + 2, y + 3, panelW, Math.max(3, (h >> 1) - 3), dark);
  c.fillRect(x + w - panelW - 3, y + 3, panelW, Math.max(3, (h >> 1) - 3), dark);
  c.set(x + w - 4, y + (h >> 1) + 1, 'flagGold');
}

function doormat(c, x, y, w) {
  c.fillRect(x, y, w, 2, 'creamLight');
  c.fillRect(x, y + 1, w, 1, 'crimson');
}

// ------------------------------------------------------------ buildings

function house() {
  const c = new Canvas(64, 64);
  // walls
  siding(c, 0, 30, 64, 34);
  c.fillRect(0, 46, 64, 2, 'woodLight'); // storey band
  c.fillRect(0, 46, 64, 1, 'dirtLight');
  c.fillRect(0, 60, 64, 4, 'stone'); // foundation
  c.fillRect(0, 60, 64, 1, 'stoneLight');
  // roof (hip) + eaves
  roof(c, 8, 29, 14, 0, 49, 63);
  c.fillRect(0, 28, 64, 3, 'roofDark');
  c.fillRect(0, 28, 64, 1, 'crimson');
  c.fillRect(14, 8, 36, 2, 'roofLight');
  // chimney
  c.fillRect(43, 1, 10, 3, 'stoneLight');
  c.fillRect(43, 1, 10, 1, 'stoneHi');
  c.fillRect(44, 4, 8, 11, 'brick');
  for (let y = 4; y < 15; y += 3) c.fillRect(44, y, 8, 1, 'brickDark');
  c.fillRect(44, 4, 2, 11, 'brickLight');
  c.fillRect(50, 4, 2, 11, 'brickDark');
  // upper windows
  win(c, 12, 33, 12, 11);
  win(c, 40, 33, 12, 11);
  // lower windows + flower boxes
  win(c, 6, 50, 16, 8, { sill: false });
  c.fillRect(5, 59, 18, 2, 'woodDark');
  for (let x = 6; x < 22; x += 3) c.set(x, 58, x % 2 === 0 ? 'crimsonLight' : 'creamLight');
  win(c, 52, 50, 8, 8, { sill: false });
  c.fillRect(51, 59, 10, 2, 'woodDark');
  for (let x = 52; x < 60; x += 3) c.set(x, 58, 'crimsonLight');
  c.innerOutline('ink');
  // door on tile column 2 (x 32..47) - drawn after the outline so its base is open
  door(c, 32, 48, 16, 16);
  c.fillRect(34, 51, 12, 3, 'glass');
  c.fillRect(34, 51, 12, 1, 'glassLight');
  c.fillRect(31, 62, 18, 2, 'stoneHi');
  c.fillRect(31, 63, 18, 1, 'stoneLight');
  doormat(c, 34, 61, 12);
  return c;
}

function archive() {
  const c = new Canvas(80, 80);
  // facade
  stoneBlocks(c, 0, 26, 80, 54);
  // recessed centre
  stoneBlocks(c, 26, 26, 28, 54, 'stone');
  // pediment (triangle) with recessed tympanum
  roof(c, 1, 19, 38, 4, 41, 76, { base: 'stoneLight', dark: 'stone', light: 'stoneHi' });
  for (let y = 7; y <= 18; y++) {
    const t = (y - 1) / 18;
    const xl = Math.round(38 + (4 - 38) * t) + 5;
    const xr = Math.round(41 + (76 - 41) * t) - 5;
    c.fillRect(xl, y, xr - xl + 1, 1, 'stone');
  }
  c.fillRect(0, 19, 80, 1, 'stoneHi');
  // crimson frieze with cream dentils
  c.fillRect(0, 20, 80, 6, 'crimson');
  c.fillRect(0, 20, 80, 1, 'crimsonLight');
  c.fillRect(0, 24, 80, 2, 'crimsonDark');
  for (let x = 2; x < 80; x += 4) c.fillRect(x, 21, 2, 3, 'creamLight');
  // round window in the pediment
  c.disc(40, 13, 7, 'ink');
  c.disc(40, 13, 6, 'creamLight');
  c.disc(40, 13, 4.5, 'glass');
  c.fillRect(35, 13, 11, 1, 'creamLight');
  c.fillRect(40, 9, 1, 9, 'creamLight');
  c.set(37, 10, 'glassLight');
  c.set(38, 10, 'glassLight');
  c.set(37, 11, 'glassLight');
  // columns
  for (const x of [6, 18, 54, 66]) {
    c.fillRect(x, 28, 8, 48, 'stoneLight');
    c.fillRect(x, 28, 1, 48, 'stoneHi');
    c.fillRect(x + 4, 30, 1, 42, 'stone');
    c.fillRect(x + 6, 28, 2, 48, 'stoneDark');
    c.fillRect(x + 5, 28, 1, 48, 'stone');
    c.fillRect(x - 1, 26, 10, 3, 'stoneHi');
    c.fillRect(x - 1, 28, 10, 1, 'stone');
    c.fillRect(x - 1, 73, 10, 3, 'stoneHi');
    c.fillRect(x - 1, 75, 10, 1, 'stoneDark');
  }
  // steps
  c.fillRect(2, 76, 76, 2, 'stoneHi');
  c.fillRect(2, 78, 76, 2, 'stoneLight');
  c.fillRect(2, 77, 76, 1, 'stone');
  c.innerOutline('ink');
  // arched crimson doorway (tile column 2 = x 32..47, tile row 4 = y 64..79)
  c.ellipse(40, 64, 10, 10, 'ink');
  c.fillRect(30, 64, 20, 16, 'ink');
  c.ellipse(40, 64, 9, 9, 'creamLight');
  c.fillRect(31, 64, 18, 16, 'creamLight');
  c.ellipse(40, 64, 8, 8, 'crimson');
  c.fillRect(32, 64, 16, 16, 'crimson');
  c.fillRect(32, 62, 8, 4, 'crimson');
  c.fillRect(46, 56, 2, 24, 'crimsonDark');
  c.fillRect(39, 57, 2, 23, 'crimsonDeep');
  c.fillRect(33, 60, 1, 20, 'crimsonLight');
  c.set(37, 70, 'flagGold');
  c.set(42, 70, 'flagGold');
  c.fillRect(30, 78, 20, 2, 'stoneLight');
  c.fillRect(32, 78, 16, 2, 'crimsonDark');
  return c;
}

function shed() {
  const c = new Canvas(64, 56);
  corrugated(c, 0, 14, 64, 42);
  // roof slab
  c.fillRect(0, 8, 64, 8, 'metalDark');
  c.fillRect(0, 8, 64, 2, 'metal');
  c.fillRect(0, 15, 64, 1, 'inkSoft');
  for (let x = 3; x < 64; x += 6) c.fillRect(x, 10, 1, 5, 'inkSoft');
  // rooftop vent unit
  c.fillRect(6, 2, 14, 6, 'metal');
  c.fillRect(6, 2, 14, 1, 'metalLight');
  for (let x = 8; x < 19; x += 3) c.fillRect(x, 4, 2, 3, 'inkSoft');
  // satellite dish on a stand
  c.fillRect(48, 8, 2, 4, 'metalDark');
  c.ellipse(49, 5, 7.5, 5.5, 'ink');
  c.ellipse(49, 5, 6.5, 4.5, (x, y, nx, ny) =>
    nx + ny < -0.5 ? 'white' : nx + ny < 0.5 ? 'creamLight' : 'creamDark',
  );
  c.ring(49, 5, 6.5, 4.5, 1, 'stoneLight');
  c.line(49, 5, 55, 0, 'metalDark');
  c.fillRect(54, 0, 2, 2, 'crimson');
  // wall vent grille
  c.fillRect(5, 21, 14, 11, 'inkSoft');
  for (let y = 22; y < 31; y += 2) c.fillRect(6, y, 12, 1, 'metalLight');
  // warning plate
  c.fillRect(50, 22, 9, 9, 'crimsonDark');
  c.rect(50, 22, 9, 9, 'creamLight');
  c.line(52, 24, 56, 28, 'creamLight');
  c.line(56, 24, 52, 28, 'creamLight');
  // status lights above the door
  c.fillRect(28, 29, 2, 2, 'screenOn');
  c.fillRect(34, 29, 2, 2, 'flagGold');
  // wide service door (tile columns 1-2 = x 16..47)
  c.innerOutline('ink');
  c.fillRect(15, 33, 34, 23, 'ink');
  c.fillRect(16, 34, 32, 22, 'metalDark');
  for (let y = 36; y < 56; y += 4) {
    c.fillRect(17, y, 30, 1, 'metal');
    c.fillRect(17, y + 1, 30, 1, 'metalLight');
  }
  c.fillRect(31, 34, 2, 22, 'inkSoft');
  c.fillRect(28, 46, 2, 4, 'flagGold');
  c.fillRect(34, 46, 2, 4, 'flagGold');
  c.fillRect(16, 55, 32, 1, 'stoneDark');
  return c;
}

function clubhouse() {
  const c = new Canvas(80, 72);
  bricks(c, 0, 24, 80, 48);
  // pennant poles + flags
  const flags = [
    [12, 'crimson'],
    [38, 'creamLight'],
    [64, 'flagGold'],
  ];
  for (const [x, col] of flags) {
    c.fillRect(x, 0, 2, 14, 'metalLight');
    c.fillRect(x + 1, 0, 1, 14, 'metal');
    for (let j = 0; j < 7; j++) c.fillRect(x + 2, 1 + j, Math.max(1, 12 - j * 2), 1, col);
    c.set(x + 2, 1, 'white');
  }
  // roof
  roof(c, 10, 25, 6, 0, 73, 79);
  c.fillRect(6, 10, 68, 2, 'roofLight');
  c.fillRect(0, 24, 80, 3, 'roofDark');
  // crimson sign band
  c.fillRect(0, 27, 80, 6, 'crimsonDark');
  c.fillRect(0, 27, 80, 1, 'crimson');
  for (let x = 6; x < 74; x += 6) c.fillRect(x, 29, 4, 2, 'creamLight');
  // big windows with planters
  for (const x of [6, 54]) {
    win(c, x, 37, 20, 17, { sill: false });
    c.fillRect(x - 2, 55, 24, 3, 'stoneLight');
    c.fillRect(x - 2, 55, 24, 1, 'stoneHi');
    for (let i = x; i < x + 20; i += 3) c.set(i, 54, i % 2 === 0 ? 'crimsonLight' : 'creamLight');
  }
  // awning over the door
  for (let x = 27; x < 53; x++) {
    const stripe = Math.floor((x - 27) / 4) % 2 === 0 ? 'crimson' : 'creamLight';
    c.fillRect(x, 42, 1, 6, stripe);
    c.set(x, 48, Math.floor((x - 27) / 4) % 2 === 0 ? 'crimsonDark' : 'creamDark');
  }
  c.fillRect(27, 42, 26, 1, 'crimsonLight');
  // steps
  c.fillRect(26, 69, 28, 3, 'stoneLight');
  c.fillRect(26, 69, 28, 1, 'stoneHi');
  c.innerOutline('ink');
  // double doors (tile column 2 = x 32..47)
  c.fillRect(31, 49, 18, 23, 'ink');
  c.fillRect(32, 50, 16, 22, 'woodDark');
  c.fillRect(32, 50, 7, 22, 'wood');
  c.fillRect(41, 50, 7, 22, 'wood');
  c.fillRect(32, 50, 7, 1, 'woodLight');
  c.fillRect(41, 50, 7, 1, 'woodLight');
  c.fillRect(33, 53, 5, 6, 'glass');
  c.fillRect(42, 53, 5, 6, 'glass');
  c.fillRect(33, 53, 5, 1, 'glassLight');
  c.fillRect(42, 53, 5, 1, 'glassLight');
  c.fillRect(37, 62, 1, 3, 'flagGold');
  c.fillRect(42, 62, 1, 3, 'flagGold');
  doormat(c, 33, 70, 14);
  return c;
}

function admissions() {
  const c = new Canvas(80, 72);
  stoneBlocks(c, 0, 20, 80, 52);
  // cornice
  c.fillRect(0, 14, 80, 6, 'stoneHi');
  c.fillRect(0, 18, 80, 2, 'stone');
  for (let x = 1; x < 80; x += 4) c.fillRect(x, 16, 2, 2, 'stoneLight');
  // pediment over the door
  roof(c, 2, 13, 40, 22, 41, 58, { base: 'stoneLight', dark: 'stone', light: 'stoneHi' });
  c.fillRect(34, 8, 12, 5, 'stone');
  c.disc(40, 10, 3, 'crimson');
  c.set(39, 9, 'crimsonLight');
  // flagpole + flag
  c.fillRect(8, 0, 2, 15, 'woodLight');
  c.fillRect(9, 0, 1, 15, 'wood');
  c.fillRect(10, 1, 12, 7, 'crimson');
  c.fillRect(10, 1, 12, 1, 'crimsonLight');
  c.fillRect(10, 4, 12, 1, 'creamLight');
  // pilasters beside the door
  for (const x of [26, 50]) {
    c.fillRect(x, 22, 5, 46, 'stoneLight');
    c.fillRect(x, 22, 1, 46, 'stoneHi');
    c.fillRect(x + 4, 22, 1, 46, 'stoneDark');
    c.fillRect(x - 1, 21, 7, 2, 'stoneHi');
    c.fillRect(x - 1, 66, 7, 2, 'stone');
  }
  // windows, two storeys each side
  for (const x of [8, 62]) {
    win(c, x, 25, 10, 14);
    win(c, x, 48, 10, 14, { sill: true });
  }
  // crest banner above the door
  c.fillRect(33, 24, 14, 12, 'crimsonDark');
  c.fillRect(34, 25, 12, 10, 'crimson');
  c.fillRect(34, 25, 12, 1, 'crimsonLight');
  c.disc(40, 30, 3, 'creamLight');
  c.disc(40, 30, 1.5, 'crimsonDark');
  // lintel over the door
  c.fillRect(31, 48, 18, 4, 'stoneHi');
  c.fillRect(31, 51, 18, 1, 'stone');
  // steps
  c.fillRect(24, 68, 32, 4, 'stoneLight');
  c.fillRect(24, 68, 32, 1, 'stoneHi');
  c.innerOutline('ink');
  // formal double door (tile column 2 = x 32..47)
  c.fillRect(31, 51, 18, 21, 'ink');
  c.fillRect(32, 52, 16, 20, 'crimsonDark');
  c.fillRect(32, 52, 7, 20, 'crimson');
  c.fillRect(41, 52, 7, 20, 'crimson');
  c.fillRect(33, 54, 5, 8, 'crimsonDark');
  c.fillRect(42, 54, 5, 8, 'crimsonDark');
  c.fillRect(33, 54, 5, 1, 'crimsonLight');
  c.fillRect(42, 54, 5, 1, 'crimsonLight');
  c.set(38, 64, 'flagGold');
  c.set(41, 64, 'flagGold');
  c.fillRect(32, 71, 16, 1, 'stoneDark');
  return c;
}

function campusGate() {
  const c = new Canvas(96, 64);
  // pillars (brick) - gap between x 32..63 is the walkable entrance
  bricks(c, 0, 28, 32, 36);
  bricks(c, 64, 28, 32, 36);
  // lintel across the top
  stoneBlocks(c, 0, 0, 96, 28);
  // arch cut-out
  for (let y = 0; y < 64; y++) {
    for (let x = 32; x < 64; x++) {
      const nx = (x + 0.5 - 48) / 16;
      const ny = (y + 0.5 - 28) / 12;
      if (y >= 28 || nx * nx + ny * ny <= 1) c.set(x, y, null);
    }
  }
  // arch ring (voussoirs)
  for (let y = 0; y < 28; y++) {
    for (let x = 28; x < 68; x++) {
      const nx = (x + 0.5 - 48) / 20;
      const ny = (y + 0.5 - 28) / 16;
      const inner = ((x + 0.5 - 48) / 16) ** 2 + ((y + 0.5 - 28) / 12) ** 2;
      if (nx * nx + ny * ny <= 1 && inner > 1) {
        const ang = Math.floor(Math.atan2(y - 28, x - 48) * 6);
        c.set(x, y, ang % 2 === 0 ? 'stoneHi' : 'stoneLight');
      }
    }
  }
  // crimson banner across the top
  c.fillRect(4, 3, 88, 11, 'crimson');
  c.fillRect(4, 3, 88, 1, 'crimsonLight');
  c.fillRect(4, 12, 88, 2, 'crimsonDark');
  c.fillRect(4, 5, 88, 1, 'creamLight');
  c.fillRect(4, 11, 88, 1, 'creamLight');
  for (let x = 34; x < 62; x += 3) c.fillRect(x, 7, 2, 3, x % 2 === 0 ? 'creamLight' : 'cream');
  for (const x of [8, 84]) c.disc(x, 8, 2, 'flagGold');
  // pillar caps and bases
  for (const x of [0, 64]) {
    c.fillRect(x, 28, 32, 4, 'stoneHi');
    c.fillRect(x, 31, 32, 1, 'stone');
    c.fillRect(x, 58, 32, 6, 'stone');
    c.fillRect(x, 58, 32, 1, 'stoneLight');
  }
  c.innerOutline('ink');
  return c;
}

/** @returns {[string, Canvas][]} */
export function buildBuildings() {
  return [
    ['assets/buildings/house.png', house()],
    ['assets/buildings/archive.png', archive()],
    ['assets/buildings/shed.png', shed()],
    ['assets/buildings/clubhouse.png', clubhouse()],
    ['assets/buildings/admissions.png', admissions()],
    ['assets/buildings/campus-gate.png', campusGate()],
  ];
}
