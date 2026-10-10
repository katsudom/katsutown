/**
 * World data: NPCs, interactables, warps and prop placements for every map.
 *
 * The terrain (the four tile layers) lives in public/assets/maps/<id>.json and is
 * produced by `npm run maps` (tools/generate-maps.mjs). That script bundles THIS file
 * to derive collision for props, NPCs and interactables, so the coordinates here are
 * the single source of truth for what stands where.
 *
 * Conventions
 *  - Every interior has an exit warp on its doorway (door-mat) tile; `defaultSpawn`
 *    is the tile just inside it, so arriving never re-triggers the exit.
 *  - Warps sit on walkable tiles. Interactables and NPCs sit on tiles that are blocked
 *    in `collide` (you face them, you never stand on them).
 *  - All copy comes from ./content - nothing is retyped here.
 */
import { DEPTH } from '../config';
import type {
  DialoguePage,
  Direction,
  Interactable,
  InteractionPayload,
  MapDef,
  MapId,
  NpcDef,
  PropPlacement,
  Warp,
} from '../types';
import { ADMISSIONS, HACKLAHOMA, NPC_DIALOGUE, PERSON, PROJECTS, SIGNS } from './content';
import type { ProjectContent } from './content';

export const START_MAP: MapId = 'overworld';

/** Outside Dominic's House: the tile below the front door. */
export const START_SPAWN: { tileX: number; tileY: number; facing: Direction } = {
  tileX: 14,
  tileY: 24,
  facing: 'down',
};

// ---------------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------------

type Pos = readonly [number, number];

function say(speaker: string, text: string): InteractionPayload {
  return { kind: 'dialogue', pages: [{ speaker, text }] };
}

function pagesOf(pages: DialoguePage[]): InteractionPayload {
  return { kind: 'dialogue', pages };
}

function thing(
  id: string,
  [tileX, tileY]: Pos,
  label: string,
  payload: InteractionPayload,
): Interactable {
  return { id, tileX, tileY, label, payload };
}

/** One interactable carrying exactly one bullet of a project. */
function bullet(
  project: ProjectContent['id'],
  index: number,
  pos: Pos,
  label: string,
): Interactable {
  return thing(`${project}-${index + 1}`, pos, label, say(label, PROJECTS[project].bullets[index]));
}

/** The project card interactable (tech stack + links panel). */
function projectCard(project: ProjectContent['id'], pos: Pos, label: string): Interactable {
  const { card } = PROJECTS[project];
  return thing(`${project}-card`, pos, label, {
    kind: 'projectCard',
    card,
    pages: [
      { speaker: card.title, text: card.tagline },
      { speaker: card.title, text: `Built with: ${card.tech.join(', ')}` },
    ],
  });
}

function npc(
  id: string,
  dialogueKey: string,
  spriteKey: string,
  [tileX, tileY]: Pos,
  facing: Direction,
  extra: Partial<NpcDef> = {},
): NpcDef {
  const d = NPC_DIALOGUE[dialogueKey];
  return {
    id,
    name: d.name,
    spriteKey,
    tileX,
    tileY,
    facing,
    idleTurn: true,
    pages: d.pages,
    ...extra,
  };
}

function door(
  id: string,
  [tileX, tileY]: Pos,
  mapId: MapId,
  [toX, toY]: Pos,
  facing: Direction,
  label?: string,
): Warp {
  return { id, tileX, tileY, auto: true, target: { mapId, tileX: toX, tileY: toY, facing }, label };
}

const image = (key: string, tileX: number, tileY: number, depth?: number): PropPlacement => ({
  key,
  kind: 'image',
  tileX,
  tileY,
  ...(depth === undefined ? {} : { depth }),
});

const anim = (key: string, tileX: number, tileY: number, frameOffset = 0): PropPlacement => ({
  key,
  kind: 'anim',
  tileX,
  tileY,
  frameOffset,
});

// ---------------------------------------------------------------------------
// Overworld (60 x 45)
// ---------------------------------------------------------------------------

const overworld: MapDef = {
  id: 'overworld',
  title: PERSON.townName,
  music: 'town',
  defaultSpawn: START_SPAWN,
  isInterior: false,
  props: [
    image('bldg-house', 12, 20),
    image('bldg-archive', 22, 12),
    image('bldg-shed', 23, 27),
    image('bldg-clubhouse', 28, 4),
    image('bldg-admissions', 48, 19),
    // Drawn over the player so the lintel arches over anyone walking through the gap.
    image('campus-gate', 41, 25, DEPTH.OVERHANG),
    image('food-truck', 35, 24),
    image('mountain', 41, 12),
    image('welcome-sign', 33, 22),
    image('mailbox', 17, 23),
    image('sign-campus', 45, 29),
    image('sign-trail', 42, 17),
    anim('fountain', 29, 22),
  ],
  npcs: [
    npc('greeter', 'greeter', 'npc-welcome', [28, 22], 'right'),
    npc('vendor', 'vendor', 'npc-vendor', [39, 27], 'left'),
    npc('tour-guide', 'tourGuide', 'npc-guide', [46, 30], 'left', { special: 'tourGuide' }),
  ],
  interactables: [
    thing('mailbox', [17, 23], 'Mailbox', pagesOf(SIGNS.mailbox)),
    thing('welcome-sign', [33, 23], 'Welcome Sign', pagesOf(SIGNS.welcome)),
    thing('campus-gate-sign', [45, 29], 'Campus Gate', pagesOf(SIGNS.campusGate)),
    thing('trailhead-sign', [42, 17], 'Trailhead Sign', pagesOf(SIGNS.trailhead)),
  ],
  warps: [
    door('to-house', [14, 23], 'house', [5, 8], 'up', "Dominic's House"),
    door('to-archive', [24, 16], 'archive', [7, 10], 'up', PROJECTS.hackerPortal.place),
    door('to-shed-a', [24, 30], 'shed', [6, 8], 'up', PROJECTS.devTracker.place),
    door('to-shed-b', [25, 30], 'shed', [6, 8], 'up', PROJECTS.devTracker.place),
    door('to-truck', [36, 26], 'truck', [5, 7], 'up', PROJECTS.freeFoodFinder.place),
    door('to-trail', [44, 17], 'trail', [10, 33], 'up', PROJECTS.ascent.place),
    door('to-clubhouse', [30, 8], 'clubhouse', [7, 10], 'up', HACKLAHOMA.place),
    door('to-admissions', [50, 23], 'admissions', [5, 8], 'up', ADMISSIONS.place),
  ],
};

// ---------------------------------------------------------------------------
// Dominic's House (12 x 10) - bio
// ---------------------------------------------------------------------------

const house: MapDef = {
  id: 'house',
  title: "Dominic's House",
  music: 'interior',
  defaultSpawn: { tileX: 5, tileY: 8, facing: 'up' },
  isInterior: true,
  props: [],
  npcs: [],
  interactables: [
    thing('computer', [3, 2], 'Computer', say('Computer', PERSON.bio)),
    thing('bookshelf', [4, 1], 'Bookshelf', say('Bookshelf', 'A tall shelf packed with books.')),
    thing('bed', [10, 2], 'Bed', say('Bed', 'A cosy bed with a red blanket.')),
  ],
  warps: [door('exit', [5, 9], 'overworld', [14, 24], 'down', 'Katsudom Town')],
};

// ---------------------------------------------------------------------------
// The Archive (16 x 12) - Hacker Portal
// ---------------------------------------------------------------------------

const archive: MapDef = {
  id: 'archive',
  title: PROJECTS.hackerPortal.place,
  music: 'interior',
  defaultSpawn: { tileX: 7, tileY: 10, facing: 'up' },
  isInterior: true,
  props: [anim('screen-glow', 6, 1), image('project-card', 9, 5)],
  npcs: [],
  interactables: [
    bullet('hackerPortal', 0, [6, 1], 'Monitor'),
    bullet('hackerPortal', 1, [2, 1], 'Bookshelf'),
    // The shelf art spans two tiles, so the second half answers too (same payload, distinct id).
    thing(
      'hackerPortal-2b',
      [3, 1],
      'Bookshelf',
      say('Bookshelf', PROJECTS.hackerPortal.bullets[1]),
    ),
    bullet('hackerPortal', 2, [4, 5], 'Desk'),
    bullet('hackerPortal', 3, [9, 1], 'Poster'),
    bullet('hackerPortal', 4, [12, 1], 'Whiteboard'),
    projectCard('hackerPortal', [9, 5], 'Project Card'),
  ],
  warps: [door('exit', [7, 11], 'overworld', [24, 17], 'down', 'Katsudom Town')],
};

// ---------------------------------------------------------------------------
// Free Food Finder truck (12 x 9)
// ---------------------------------------------------------------------------

const truck: MapDef = {
  id: 'truck',
  title: PROJECTS.freeFoodFinder.place,
  music: 'interior',
  defaultSpawn: { tileX: 5, tileY: 7, facing: 'up' },
  isInterior: true,
  props: [anim('screen-glow', 3, 1), image('project-card', 7, 5)],
  npcs: [],
  interactables: [
    bullet('freeFoodFinder', 0, [3, 1], 'Monitor'),
    bullet('freeFoodFinder', 1, [5, 1], 'Poster'),
    bullet('freeFoodFinder', 2, [4, 5], 'Desk'),
    bullet('freeFoodFinder', 3, [8, 1], 'Whiteboard'),
    bullet('freeFoodFinder', 4, [4, 3], 'Serving Counter'),
    projectCard('freeFoodFinder', [7, 5], 'Project Card'),
  ],
  warps: [door('exit', [5, 8], 'overworld', [36, 27], 'down', 'Katsudom Town')],
};

// ---------------------------------------------------------------------------
// Server Shed (14 x 10) - Developer Tracker Widget
// ---------------------------------------------------------------------------

const shed: MapDef = {
  id: 'shed',
  title: PROJECTS.devTracker.place,
  music: 'interior',
  defaultSpawn: { tileX: 6, tileY: 8, facing: 'up' },
  isInterior: true,
  // One rack per Node replica, each starting on a different frame so they blink out of sync.
  props: [
    anim('server-rack', 2, 2, 0),
    anim('server-rack', 4, 2, 1),
    anim('server-rack', 6, 2, 2),
    anim('screen-glow', 8, 1),
    image('project-card', 7, 6),
  ],
  npcs: [],
  interactables: [
    bullet('devTracker', 0, [2, 3], 'Server Rack'),
    bullet('devTracker', 1, [4, 3], 'Server Rack'),
    bullet('devTracker', 2, [8, 1], 'Monitor'),
    bullet('devTracker', 3, [6, 3], 'Server Rack'),
    bullet('devTracker', 4, [11, 1], 'Whiteboard'),
    projectCard('devTracker', [7, 6], 'Project Card'),
  ],
  warps: [door('exit', [6, 9], 'overworld', [24, 31], 'down', 'Katsudom Town')],
};

// ---------------------------------------------------------------------------
// Ascent Trail (20 x 36) - an outdoor climb, one flag per bullet
// ---------------------------------------------------------------------------

/** Flag base tiles, bottom of the trail to the top. Each prop is anchored one tile higher. */
const TRAIL_FLAGS: Pos[] = [
  [11, 31],
  [8, 27],
  [6, 21],
  [3, 17],
  [12, 11],
];

const trail: MapDef = {
  id: 'trail',
  title: PROJECTS.ascent.place,
  music: 'trail',
  defaultSpawn: { tileX: 10, tileY: 33, facing: 'up' },
  isInterior: false,
  props: [
    image('mountain', 7, 0),
    image('project-card', 10, 5),
    ...TRAIL_FLAGS.map(([x, y], i) => anim('trail-flag', x, y - 1, i % 4)),
  ],
  npcs: [],
  interactables: [
    ...TRAIL_FLAGS.map((pos, i) => bullet('ascent', i, pos, 'Trail Flag')),
    projectCard('ascent', [10, 5], 'Summit Cairn'),
  ],
  warps: [
    door('exit-a', [9, 34], 'overworld', [44, 18], 'down', 'Katsudom Town'),
    door('exit-b', [10, 34], 'overworld', [44, 18], 'down', 'Katsudom Town'),
  ],
};

// ---------------------------------------------------------------------------
// Hacklahoma Clubhouse (16 x 12)
// ---------------------------------------------------------------------------

const clubhouse: MapDef = {
  id: 'clubhouse',
  title: HACKLAHOMA.place,
  music: 'interior',
  defaultSpawn: { tileX: 7, tileY: 10, facing: 'up' },
  isInterior: true,
  props: [],
  npcs: [
    npc('teammate', 'teammate', 'npc-teammate', [3, 5], 'up'),
    npc('organizer', 'organizer', 'npc-organizer', [8, 3], 'left'),
  ],
  interactables: [
    thing('whiteboard', [6, 1], 'Whiteboard', say('Whiteboard', HACKLAHOMA.whiteboard)),
    thing('poster', [9, 1], 'Poster', say('Poster', HACKLAHOMA.poster)),
    thing(
      'plaque',
      [13, 7],
      'Plaque',
      say(HACKLAHOMA.org, `${HACKLAHOMA.role}\n${HACKLAHOMA.dates}\n${HACKLAHOMA.location}`),
    ),
  ],
  warps: [door('exit', [7, 11], 'overworld', [30, 9], 'down', 'Katsudom Town')],
};

// ---------------------------------------------------------------------------
// Admissions Office (12 x 10)
// ---------------------------------------------------------------------------

const admissions: MapDef = {
  id: 'admissions',
  title: ADMISSIONS.place,
  music: 'interior',
  defaultSpawn: { tileX: 5, tileY: 8, facing: 'up' },
  isInterior: true,
  props: [],
  npcs: [],
  interactables: [
    thing(
      'front-desk',
      [4, 4],
      'Front Desk',
      say(ADMISSIONS.place, `${ADMISSIONS.role}\n${ADMISSIONS.dates}`),
    ),
    thing('computer', [9, 3], 'Computer', say('Computer', ADMISSIONS.bullets[0])),
    thing('poster', [5, 1], 'Poster', say('Poster', ADMISSIONS.bullets[1])),
  ],
  warps: [door('exit', [5, 9], 'overworld', [50, 24], 'down', 'Katsudom Town')],
};

export const MAPS: Record<MapId, MapDef> = {
  overworld,
  house,
  archive,
  truck,
  trail,
  shed,
  clubhouse,
  admissions,
};
