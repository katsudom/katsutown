/**
 * Standalone props and animated strips.
 */
import { Canvas, rng, hash } from './canvas.mjs';

function welcomeSign() {
  const c = new Canvas(32, 32);
  // posts
  for (const x of [6, 23]) {
    c.fillRect(x, 20, 3, 11, 'wood');
    c.fillRect(x, 20, 1, 11, 'woodLight');
    c.fillRect(x + 2, 20, 1, 11, 'woodDark');
  }
  // board: crimson frame, cream face
  c.fillRect(1, 3, 30, 20, 'crimson');
  c.fillRect(1, 3, 30, 1, 'crimsonLight');
  c.fillRect(1, 21, 30, 2, 'crimsonDark');
  c.fillRect(30, 3, 1, 20, 'crimsonDark');
  c.fillRect(4, 6, 24, 14, 'cream');
  c.fillRect(4, 6, 24, 1, 'creamLight');
  c.fillRect(4, 6, 1, 14, 'creamLight');
  c.fillRect(4, 19, 24, 1, 'creamDark');
  // stylised text lines (the real words live in the dialogue)
  c.fillRect(8, 9, 16, 2, 'crimson');
  c.fillRect(11, 9, 3, 2, 'crimsonDark');
  c.fillRect(8, 13, 16, 1, 'woodLight');
  c.fillRect(8, 16, 11, 1, 'woodLight');
  for (const [x, y] of [
    [2, 4],
    [29, 4],
    [2, 20],
    [29, 20],
  ])
    c.set(x, y, 'flagGold');
  c.outline('ink');
  c.ellipse(16, 31, 12, 1.2, 'shadow', 90);
  return c;
}

/** Post-mounted mailbox: crimson box, cream door and a gold flag. 16x16. */
function mailbox() {
  const c = new Canvas(16, 16);
  // post
  c.fillRect(7, 9, 3, 6, 'wood');
  c.fillRect(7, 9, 1, 6, 'woodLight');
  c.fillRect(9, 9, 1, 6, 'woodDark');
  // box body with a rounded top
  c.fillRect(2, 3, 12, 7, 'crimson');
  c.fillRect(3, 2, 10, 1, 'crimsonLight');
  c.fillRect(2, 3, 12, 1, 'crimsonLight');
  c.fillRect(2, 8, 12, 2, 'crimsonDark');
  c.fillRect(13, 3, 1, 7, 'crimsonDark');
  // cream door end with a latch
  c.fillRect(2, 4, 3, 5, 'creamLight');
  c.fillRect(2, 8, 3, 1, 'creamDark');
  c.set(3, 6, 'flagGold');
  // mail slot line and a corner of an envelope poking out
  c.fillRect(6, 5, 5, 1, 'crimsonDeep');
  c.fillRect(11, 4, 2, 2, 'creamLight');
  // raised flag
  c.fillRect(12, 0, 1, 3, 'woodDark');
  c.fillRect(13, 0, 2, 2, 'flagGold');
  c.outline('ink');
  c.ellipse(8, 15, 6, 1, 'shadow', 90);
  return c;
}

/** Campus Gate signpost: pointed crimson-trimmed board on a post. 16x16. */
function signCampus() {
  const c = new Canvas(16, 16);
  c.fillRect(7, 9, 3, 6, 'wood');
  c.fillRect(7, 9, 1, 6, 'woodLight');
  c.fillRect(9, 9, 1, 6, 'woodDark');
  // arrow-shaped board
  c.poly(
    [
      [1, 1],
      [11, 1],
      [15, 5],
      [11, 9],
      [1, 9],
    ],
    'crimson',
  );
  c.fillRect(1, 1, 10, 1, 'crimsonLight');
  c.fillRect(1, 8, 10, 2, 'crimsonDark');
  c.fillRect(2, 3, 9, 5, 'cream');
  c.fillRect(2, 3, 9, 1, 'creamLight');
  c.fillRect(2, 7, 9, 1, 'creamDark');
  c.fillRect(3, 4, 6, 1, 'crimsonDark');
  c.fillRect(3, 6, 4, 1, 'woodLight');
  c.set(12, 5, 'flagGold');
  c.outline('ink');
  c.ellipse(8, 15, 6, 1, 'shadow', 90);
  return c;
}

/** Trailhead marker: a small rustic wooden board on a stake with a stone at its foot. 16x16. */
function signTrail() {
  const c = new Canvas(16, 16);
  c.fillRect(7, 6, 2, 9, 'wood');
  c.fillRect(7, 6, 1, 9, 'woodLight');
  // stone at the base
  c.ellipse(11, 14, 3, 1.6, (x, y, nx, ny) => (nx + ny < -0.3 ? 'stoneLight' : 'stone'));
  // plank board
  c.fillRect(3, 2, 10, 5, 'woodLight');
  c.fillRect(3, 2, 10, 1, 'dirtLight');
  c.fillRect(3, 6, 10, 1, 'woodDark');
  c.fillRect(4, 4, 5, 1, 'woodDark');
  c.fillRect(10, 3, 2, 3, 'woodDark');
  c.set(4, 3, 'ink');
  c.set(12, 3, 'ink');
  c.outline('ink');
  c.ellipse(8, 15, 5, 1, 'shadow', 90);
  return c;
}

/** Project display easel: cream poster with a crimson header and a glowing chip. 16x16. */
function projectCardProp() {
  const c = new Canvas(16, 16);
  // legs + crossbar
  c.fillRect(3, 11, 2, 5, 'wood');
  c.fillRect(11, 11, 2, 5, 'wood');
  c.fillRect(3, 11, 1, 5, 'woodLight');
  c.fillRect(11, 11, 1, 5, 'woodLight');
  c.fillRect(4, 13, 8, 1, 'woodDark');
  // frame
  c.fillRect(1, 0, 14, 12, 'woodLight');
  c.fillRect(1, 0, 14, 1, 'dirtLight');
  c.fillRect(1, 11, 14, 1, 'woodDark');
  // poster face
  c.fillRect(2, 1, 12, 10, 'creamLight');
  c.fillRect(2, 1, 12, 3, 'crimson');
  c.fillRect(2, 3, 12, 1, 'crimsonDark');
  c.fillRect(3, 2, 6, 1, 'creamLight');
  // glowing chip + text lines
  c.fillRect(3, 5, 4, 4, 'screenOn');
  c.fillRect(3, 8, 4, 1, 'screenDim');
  c.fillRect(8, 5, 5, 1, 'woodLight');
  c.fillRect(8, 7, 4, 1, 'woodLight');
  c.fillRect(8, 9, 5, 1, 'creamDark');
  c.set(13, 1, 'flagGold');
  c.outline('ink');
  c.ellipse(8, 15, 7, 1, 'shadow', 90);
  return c;
}

function foodTruck() {
  const c = new Canvas(64, 48);
  // cargo box
  c.fillRect(1, 6, 44, 32, 'crimson');
  c.fillRect(1, 6, 44, 2, 'crimsonLight');
  c.fillRect(1, 36, 44, 2, 'crimsonDark');
  // cab
  c.fillRect(45, 16, 17, 22, 'crimson');
  c.poly(
    [
      [45, 16],
      [55, 16],
      [62, 26],
      [62, 38],
      [45, 38],
    ],
    'crimson',
  );
  c.fillRect(48, 19, 9, 9, 'glass');
  c.poly(
    [
      [57, 19],
      [58, 19],
      [60, 26],
      [60, 28],
      [57, 28],
    ],
    'glass',
  );
  c.fillRect(48, 19, 9, 2, 'glassLight');
  c.set(49, 22, 'glassLight');
  c.set(50, 23, 'glassLight');
  c.fillRect(46, 30, 4, 1, 'crimsonDark'); // door handle line
  c.fillRect(46, 31, 2, 1, 'creamLight');
  // cream stripe along the body
  c.fillRect(1, 28, 61, 3, 'creamLight');
  c.fillRect(1, 30, 61, 1, 'creamDark');
  // serving window + counter
  c.fillRect(9, 13, 28, 13, 'ink');
  c.fillRect(10, 14, 26, 11, 'inkSoft');
  c.fillRect(10, 14, 26, 3, 'shadow');
  c.fillRect(14, 19, 4, 6, 'flagGold'); // glints of the kitchen
  c.fillRect(24, 18, 5, 7, 'metalLight');
  c.fillRect(8, 25, 30, 3, 'woodLight');
  c.fillRect(8, 25, 30, 1, 'dirtLight');
  // striped awning
  for (let x = 7; x < 39; x++) {
    const on = Math.floor((x - 7) / 4) % 2 === 0;
    c.fillRect(x, 8, 1, 5, on ? 'creamLight' : 'crimsonDark');
    c.set(x, 13, on ? 'creamDark' : 'crimsonDeep');
    if ((x - 7) % 4 === 1 || (x - 7) % 4 === 2) c.set(x, 14, on ? 'creamLight' : 'crimsonDark');
  }
  // menu board
  c.fillRect(39, 12, 5, 12, 'inkSoft');
  c.rect(39, 12, 5, 12, 'woodLight');
  for (let y = 14; y < 22; y += 2) c.fillRect(40, y, 3, 1, 'creamLight');
  // roof vent + string of lights
  c.fillRect(18, 3, 12, 3, 'metal');
  c.fillRect(18, 3, 12, 1, 'metalLight');
  for (let x = 20; x < 29; x += 3) c.fillRect(x, 4, 1, 2, 'metalDark');
  // bumpers + headlight
  c.fillRect(60, 34, 3, 4, 'metalLight');
  c.fillRect(0, 34, 2, 4, 'metal');
  c.fillRect(60, 28, 2, 2, 'flagGold');
  c.outline('ink');
  // wheels (drawn after the outline so they overlap the chassis)
  for (const x of [13, 50]) {
    c.disc(x, 38, 6.5, 'ink');
    c.disc(x, 38, 5, 'inkSoft');
    c.disc(x, 38, 2.6, 'metalLight');
    c.disc(x, 38, 1.2, 'metalDark');
    c.set(x - 3, 35, 'metalDark');
  }
  c.ellipse(32, 45, 28, 2.2, (x, y) => (c.solid(x, y) ? undefined : 'shadow'), 90);
  return c;
}

function mountain() {
  const r = rng(hash('mountain'));
  const c = new Canvas(96, 80);
  const peaks = [
    [50, 3, 1.05],
    [20, 28, 1.0],
    [80, 36, 0.95],
  ];
  const jag = Array.from({ length: 96 }, () => Math.floor(r() * 3));
  const top = (x) => {
    let t = 999;
    for (const [px, py, s] of peaks) t = Math.min(t, py + Math.abs(x - px) * s);
    return Math.round(t) + jag[x] - 1;
  };
  const snowLine = (x) =>
    3 + 20 + (Math.abs(((x * 5) % 14) - 7) > 3 ? 3 : -1) - Math.abs(x - 50) * 0.18;
  for (let x = 0; x < 96; x++) {
    const t = Math.max(0, top(x));
    for (let y = t; y < 80; y++) {
      const dist = x - 50;
      let k;
      if (y > 68) {
        // grassy foothills
        k = (x + y) % 5 === 0 ? 'leafLight' : (x * 3 + y) % 7 === 0 ? 'leafDark' : 'leaf';
      } else if (y < snowLine(x) && x > 28 && x < 74) {
        k =
          dist < 0
            ? (x + y) % 7 === 0
              ? 'waterFoam'
              : 'white'
            : y % 3 === 0
              ? 'stoneHi'
              : 'waterFoam';
        if (dist >= 0 && (x + y) % 4 === 0) k = 'stoneHi';
      } else {
        // rock: lit on the left of each peak, shaded on the right
        let side = dist;
        for (const [px] of peaks) if (Math.abs(x - px) < Math.abs(side)) side = x - px;
        if (side < -1) k = (x + y) % 11 < 2 ? 'stone' : 'stoneLight';
        else if (side > 6) k = (x * 2 + y) % 9 < 2 ? 'stone' : 'stoneDark';
        else k = (x + y) % 7 < 2 ? 'stoneDark' : 'stone';
        if (side < -1 && y - t < 3) k = 'stoneHi';
      }
      c.set(x, y, k);
    }
  }
  // ridge crack lines
  c.line(50, 12, 44, 40, 'stoneDark');
  c.line(50, 12, 58, 34, 'stoneDark');
  c.line(20, 32, 16, 50, 'stoneDark');
  c.line(80, 40, 84, 56, 'stoneDark');
  c.line(44, 40, 40, 62, 'stone');
  // trail zig-zag
  for (let i = 0; i < 6; i++) c.set(46 + (i % 2) * 4, 52 + i * 3, 'dirtLight');
  c.innerOutline('ink', false);
  return c;
}

// -------------------------------------------------------------- strips

function fountainFrame(f) {
  const c = new Canvas(32, 32);
  // basin
  c.ellipse(16, 21, 15, 9.5, 'stoneDark');
  c.ellipse(16, 20, 14.5, 9, (x, y, nx, ny) => (nx + ny < -0.7 ? 'stoneHi' : 'stoneLight'));
  c.ellipse(16, 21, 12, 6.8, 'stoneDark');
  c.ellipse(16, 21.5, 11, 6, (x, y, nx, ny) => (ny < -0.45 ? 'waterDark' : 'water'));
  // animated ripples on the pool
  const rr = 3 + f * 2.2;
  c.ring(16, 22, rr, rr * 0.55, 1, 'waterLight');
  const r2 = ((rr + 5) % 10) + 1;
  c.ring(16, 22, r2, r2 * 0.55, 1, 'waterFoam', 150);
  // central pillar and bowl
  c.fillRect(14, 11, 4, 11, 'stone');
  c.fillRect(14, 11, 1, 11, 'stoneHi');
  c.fillRect(17, 11, 1, 11, 'stoneDark');
  c.ellipse(16, 11, 6, 2.6, 'stoneLight');
  c.ellipse(16, 11, 4.5, 1.6, 'water');
  c.set(12, 10, 'stoneHi');
  c.set(13, 9, 'stoneHi');
  // water arcs falling from the top
  const drops = 6;
  for (let i = 0; i < drops; i++) {
    const t = (f / 4 + i / drops) % 1;
    const dir = i % 2 === 0 ? -1 : 1;
    const reach = 3 + (i % 3) * 2;
    const x = 16 + dir * reach * t * 2;
    const y = 9 + 30 * t * t - 11 * t;
    c.set(x, y, i % 3 === 0 ? 'white' : 'waterFoam');
    if (t > 0.1 && t < 0.8) c.set(x, y - 1, 'waterLight');
  }
  // central jet
  const jetTop = 2 + (f % 2) * 2;
  c.fillRect(16, jetTop + 1, 1, 9 - jetTop, 'waterLight');
  c.set(16, jetTop, 'white');
  c.set(15, jetTop + 2, 'waterFoam');
  c.set(17, jetTop + 3 + (f % 2), 'waterFoam');
  c.outline('ink');
  return c;
}

/** LED state per (slot, frame, lamp): 0 off, 1 green, 2 amber. Differs every frame. */
function led(slot, frame, lamp) {
  if (lamp === 0) return [1, 0, 1, 1][(slot * 3 + frame * 2) % 4] === 0 ? 2 : 1;
  return (slot + frame) % 3 === 0 ? 2 : (slot * (frame + 1) + 1) % 2 === 0 ? 1 : 0;
}

function serverRackFrame(f) {
  const c = new Canvas(16, 32);
  c.fillRect(1, 1, 14, 31, 'metalDark');
  c.fillRect(1, 1, 14, 1, 'metal');
  c.fillRect(1, 1, 1, 31, 'metal');
  c.fillRect(2, 2, 12, 28, 'inkSoft');
  for (let s = 0; s < 5; s++) {
    const y = 3 + s * 5;
    c.fillRect(3, y, 10, 4, 'metal');
    c.fillRect(3, y, 10, 1, 'metalLight');
    c.fillRect(3, y + 3, 10, 1, 'metalDark');
    c.fillRect(4, y + 1, 3, 2, 'inkSoft'); // drive bay
    for (const lamp of [0, 1]) {
      const state = led(s, f, lamp);
      const key = state === 1 ? 'screenOn' : state === 2 ? 'flagGold' : 'screenDim';
      c.fillRect(8 + lamp * 3, y + 1, 2, 2, key);
    }
  }
  c.fillRect(3, 28, 10, 1, 'metalDark');
  c.fillRect(2, 30, 12, 2, 'ink');
  c.innerOutline('ink');
  return c;
}

function trailFlagFrame(f) {
  const c = new Canvas(16, 24);
  // rock base + pole
  c.ellipse(4, 21, 4.5, 2.5, (x, y, nx, ny) => (nx + ny < -0.3 ? 'stoneLight' : 'stone'));
  c.fillRect(3, 2, 2, 20, 'woodLight');
  c.fillRect(4, 2, 1, 20, 'wood');
  c.disc(4, 2, 1.5, 'flagGold');
  // waving pennant: each column bobs on a travelling sine wave
  for (let i = 0; i < 10; i++) {
    const wave = Math.round(Math.sin((i * 0.7 + f * (Math.PI / 2)) * 1) * (0.5 + i * 0.18));
    const halfH = Math.max(0, 4 - Math.floor(i * 0.45));
    const y0 = 5 + wave;
    c.fillRect(5 + i, y0 - halfH + 3, 1, halfH * 2 + 1, i < 5 ? 'flagGold' : 'flagGold');
    c.set(5 + i, y0 - halfH + 3, 'creamLight');
    c.set(5 + i, y0 + halfH + 3, 'dirtDark');
  }
  c.outline('ink');
  return c;
}

function screenGlowFrame(f) {
  const c = new Canvas(16, 16);
  c.fillRect(1, 2, 14, 11, 'ink');
  c.fillRect(2, 3, 12, 8, 'metalDark');
  const lit = ['screenDim', 'screenDim', 'screenOn'];
  const bg = lit[f];
  c.fillRect(3, 4, 10, 6, bg);
  // scan lines grow with the pulse
  for (let i = 0; i <= f; i++) c.fillRect(4, 5 + i * 2, 4 + i * 2, 1, 'screenOn');
  if (f === 1) c.fillRect(4, 5, 6, 1, 'screenOn');
  if (f === 2) {
    c.fillRect(3, 4, 10, 1, 'white');
    c.set(12, 9, 'white');
  }
  c.fillRect(3, 4, 1, 6, f === 0 ? 'screenDim' : bg);
  c.fillRect(7, 13, 2, 1, 'metalDark');
  c.fillRect(4, 14, 8, 1, 'metal');
  c.fillRect(4, 15, 8, 1, 'ink');
  if (f === 2) {
    // soft halo
    c.fillRect(0, 1, 16, 1, 'screenOn', 70);
    c.fillRect(0, 2, 1, 11, 'screenOn', 70);
    c.fillRect(15, 2, 1, 11, 'screenOn', 70);
  }
  return c;
}

function strip(frameFn, frames, w, h) {
  const out = new Canvas(w * frames, h);
  for (let f = 0; f < frames; f++) out.blit(frameFn(f), f * w, 0);
  return out;
}

/** @returns {[string, Canvas][]} */
export function buildProps() {
  const racks = new Canvas(16 * 4, 32);
  for (let f = 0; f < 4; f++) racks.blit(serverRackFrame(f), f * 16, 0);
  return [
    ['assets/props/welcome-sign.png', welcomeSign()],
    ['assets/props/food-truck.png', foodTruck()],
    ['assets/props/mailbox.png', mailbox()],
    ['assets/props/sign-campus.png', signCampus()],
    ['assets/props/sign-trail.png', signTrail()],
    ['assets/props/project-card.png', projectCardProp()],
    ['assets/props/mountain.png', mountain()],
    ['assets/props/fountain.png', strip(fountainFrame, 4, 32, 32)],
    ['assets/props/server-rack.png', racks],
    ['assets/props/trail-flag.png', strip(trailFlagFrame, 4, 16, 24)],
    ['assets/props/screen-glow.png', strip(screenGlowFrame, 3, 16, 16)],
  ];
}
