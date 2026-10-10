/**
 * Character sheets: 3 columns (step-left, idle, step-right) x 4 rows
 * (down, left, right, up) of 16x16 frames => 48x64.
 * One shared body template, recoloured and accessorised per character.
 */
import { Canvas } from './canvas.mjs';

// Template letters: h/H hair+highlight, s/S skin+shade, k ink, t/T shirt+shade,
// p pants, b shoes, w white, W cream shade, g/G hat, B backpack, l glasses.
const HEAD = {
  down: [
    '.....hhhhhh.....',
    '....hhhHHhhh....',
    '....hhhhhhhh....',
    '....hssssssh....',
    '....sskssksS....',
    '....ssssssss....',
    '.....ssssss.....',
  ],
  up: [
    '.....hhhhhh.....',
    '....hhhHHhhh....',
    '....hhhhhhhh....',
    '....hhhhhhhh....',
    '....hhhhhhhh....',
    '....hhhhhhhh....',
    '.....hhhhhh.....',
  ],
  left: [
    '.....hhhhhh.....',
    '....hhhHHhhh....',
    '....hhhhhhhh....',
    '....hsssshhh....',
    '....sksshhhh....',
    '....ssssshhh....',
    '.....sssshh.....',
  ],
};

const BODY = {
  down: [
    '....tttttttt....',
    '....tttttttt....',
    '....sttttttS....',
    '.....ttttTT.....',
    '.....pppppp.....',
  ],
  up: [
    '....tttttttt....',
    '....tttttttt....',
    '....sttttttS....',
    '.....ttttTT.....',
    '.....pppppp.....',
  ],
  left: [
    '.....tttttt.....',
    '.....tttttt.....',
    '.....ttsstt.....',
    '.....ttttTT.....',
    '.....pppppp.....',
  ],
};

const LEGS = {
  down: {
    0: ['.....bb..pp.....', '.........bb.....'],
    1: ['.....pp..pp.....', '.....bb..bb.....'],
    2: ['.....pp..bb.....', '.....bb.........'],
  },
  left: {
    0: ['.....pp..pp.....', '....bbb..bb.....'],
    1: ['......pppp......', '.....bbbb.......'],
    2: ['.....pp..pp.....', '.....bb..bbb....'],
  },
};
LEGS.up = LEGS.down;

const BLANK = '................';

/** Build the character-letter grid for one direction (left/down/up) and step column. */
function grid(dir, col, cfg) {
  const rows = [BLANK, ...HEAD[dir], ...BODY[dir], ...LEGS[dir][col], BLANK].map((r) =>
    r.split(''),
  );
  if (rows.length !== 16) throw new Error('bad template height');
  rows.forEach((r) => {
    if (r.length !== 16) throw new Error(`bad template width: ${r.join('')}`);
  });
  const put = (x, y, ch) => {
    rows[y][x] = ch;
  };
  const acc = cfg.accessories;
  if (acc.includes('long')) {
    const spots = {
      down: [
        [4, 5],
        [4, 6],
        [4, 7],
        [11, 5],
        [11, 6],
        [11, 7],
        [5, 7],
        [10, 7],
        [4, 8],
        [11, 8],
      ],
      up: [
        [4, 8],
        [5, 8],
        [10, 8],
        [11, 8],
        [4, 9],
        [11, 9],
        [5, 10],
        [6, 10],
        [9, 10],
        [10, 10],
      ],
      left: [
        [8, 8],
        [9, 8],
        [10, 8],
        [9, 9],
        [10, 9],
        [10, 10],
      ],
    }[dir];
    for (const [x, y] of spots) put(x, y, 'h');
  }
  if (acc.includes('glasses')) {
    if (dir === 'down')
      for (const [x, ch] of [
        [5, 'l'],
        [6, 'k'],
        [7, 'l'],
        [8, 'l'],
        [9, 'k'],
        [10, 'l'],
      ])
        put(x, 5, ch);
    if (dir === 'left')
      for (const [x, ch] of [
        [4, 'l'],
        [5, 'k'],
        [6, 'l'],
      ])
        put(x, 5, ch);
  }
  if (acc.includes('backpack')) {
    if (dir === 'down') {
      put(5, 8, 'B');
      put(10, 8, 'B');
      put(5, 9, 'B');
      put(10, 9, 'B');
    }
    if (dir === 'up')
      for (let y = 8; y <= 11; y++) for (let x = 5; x <= 10; x++) put(x, y, y === 8 ? 'B' : 'B');
    if (dir === 'left') for (let y = 8; y <= 11; y++) for (const x of [9, 10]) put(x, y, 'B');
  }
  if (acc.includes('apron')) {
    if (dir === 'down') for (let y = 9; y <= 12; y++) for (let x = 6; x <= 9; x++) put(x, y, 'w');
    if (dir === 'left') for (let y = 9; y <= 12; y++) for (let x = 5; x <= 7; x++) put(x, y, 'w');
    if (dir === 'up') {
      put(7, 11, 'w');
      put(8, 11, 'w');
    }
  }
  if (acc.includes('hat') || acc.includes('chef')) {
    const chef = acc.includes('chef');
    const hat = chef
      ? ['.....gggggg.....', '....gggGGggg....', '....GGGGGGGG....']
      : ['.....gggggg.....', '....ggggGGgg....', '...gggggggggg...'];
    hat.forEach((r, i) => {
      for (let x = 0; x < 16; x++) if (r[x] !== '.') rows[1 + i][x] = r[x];
    });
  }
  return rows;
}

function paint(rows, cfg) {
  const map = {
    h: cfg.hair[0],
    H: cfg.hair[1],
    s: cfg.skin[0],
    S: cfg.skin[1],
    k: 'ink',
    t: cfg.shirt[0],
    T: cfg.shirt[1],
    p: cfg.pants,
    b: cfg.shoes,
    w: 'creamLight',
    W: 'creamDark',
    g: cfg.hat?.[0] ?? 'white',
    G: cfg.hat?.[1] ?? 'creamDark',
    B: 'metalDark',
    l: 'glassDark',
  };
  const c = new Canvas(16, 16);
  c.art(
    0,
    0,
    rows.map((r) => r.join('')),
    map,
  );
  c.outline('ink');
  return c;
}

function sheet(cfg) {
  const out = new Canvas(48, 64);
  const order = ['down', 'left', 'right', 'up'];
  order.forEach((dir, row) => {
    for (let col = 0; col < 3; col++) {
      let frame;
      if (dir === 'right') {
        const left = paint(grid('left', col, cfg), cfg);
        frame = new Canvas(16, 16);
        frame.blit(left, 0, 0, { flipX: true });
      } else {
        frame = paint(grid(dir, col, cfg), cfg);
      }
      out.blit(frame, col * 16, row * 16);
    }
  });
  return out;
}

const CHARACTERS = {
  'pc-dominic': {
    hair: ['hairBlack', 'inkSoft'],
    skin: ['skin', 'skinDark'],
    shirt: ['crimson', 'crimsonDark'],
    pants: 'waterDark',
    shoes: 'creamDark',
    accessories: ['backpack'],
  },
  'npc-welcome': {
    hair: ['hairBrown', 'woodLight'],
    skin: ['skinLight', 'skin'],
    shirt: ['creamDark', 'creamShadow'],
    pants: 'crimsonDark',
    shoes: 'ink',
    accessories: [],
  },
  'npc-guide': {
    hair: ['hairSand', 'dirtLight'],
    skin: ['skin', 'skinDark'],
    shirt: ['leaf', 'leafDark'],
    pants: 'dirtDark',
    shoes: 'woodDark',
    hat: ['flagGold', 'dirtDark'],
    accessories: ['hat'],
  },
  'npc-teammate': {
    hair: ['hairAuburn', 'brickLight'],
    skin: ['skin', 'skinDark'],
    shirt: ['metal', 'metalDark'],
    pants: 'inkSoft',
    shoes: 'white',
    accessories: ['glasses'],
  },
  'npc-organizer': {
    hair: ['hairBlack', 'inkSoft'],
    skin: ['skinDark', 'woodLight'],
    shirt: ['flagGold', 'dirtDark'],
    pants: 'brickDark',
    shoes: 'woodDark',
    accessories: ['long'],
  },
  'npc-vendor': {
    hair: ['hairBrown', 'woodLight'],
    skin: ['skin', 'skinDark'],
    shirt: ['crimson', 'crimsonDark'],
    pants: 'stoneDark',
    shoes: 'ink',
    hat: ['white', 'creamDark'],
    accessories: ['chef', 'apron'],
  },
};

/** @returns {[string, Canvas][]} */
export function buildCharacters() {
  return Object.entries(CHARACTERS).map(([key, cfg]) => [`assets/chars/${key}.png`, sheet(cfg)]);
}
