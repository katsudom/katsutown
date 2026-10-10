/**
 * Shared contracts. Content (src/game/data/*), maps, scenes and systems all
 * speak these types, so the pieces can be built independently.
 */

export type Direction = 'down' | 'left' | 'right' | 'up';

/** Every map in the game. One Tiled JSON per id at public/assets/maps/<id>.json. */
export type MapId =
  'overworld' | 'house' | 'archive' | 'truck' | 'trail' | 'shed' | 'clubhouse' | 'admissions';

/** One screenful of dialogue. `speaker` renders as a name header when present. */
export interface DialoguePage {
  speaker?: string;
  text: string;
}

/** A project link. `url: null` renders as "(link coming soon)" — Dominic fills these in later. */
export interface LinkRef {
  label: string;
  url: string | null;
}

/** The tech-stack + links panel shown inside each project building. */
export interface ProjectCard {
  title: string;
  tagline: string;
  tech: string[];
  links: LinkRef[];
}

/** What happens when the player presses Interact on something. */
export type InteractionPayload =
  | { kind: 'dialogue'; pages: DialoguePage[] }
  | { kind: 'projectCard'; card: ProjectCard; pages: DialoguePage[] }
  | { kind: 'warp'; target: WarpTarget };

/** A thing in the world the player can face and press Space/Enter on. */
export interface Interactable {
  id: string;
  /** Tile coordinates within this map. */
  tileX: number;
  tileY: number;
  /** Shown in the interact prompt, e.g. "Computer". */
  label: string;
  payload: InteractionPayload;
}

export interface WarpTarget {
  mapId: MapId;
  tileX: number;
  tileY: number;
  facing: Direction;
}

/** A door / path tile. `auto: true` triggers on step; false requires Interact. */
export interface Warp {
  id: string;
  tileX: number;
  tileY: number;
  auto: boolean;
  target: WarpTarget;
  /** Optional transition label, e.g. "Dominic's House". */
  label?: string;
}

export interface NpcDef {
  id: string;
  name: string;
  /** Texture key of a generated 16x16, 4-direction, 3-frame walk sheet. */
  spriteKey: string;
  tileX: number;
  tileY: number;
  facing: Direction;
  /** Idle bob / occasional turn-in-place. NPCs never leave their tile. */
  idleTurn?: boolean;
  pages: DialoguePage[];
  /** Hook for the Campus Gate tour guide's optional guided walk. */
  special?: 'tourGuide';
}

/**
 * A building PNG or animated prop dropped onto a map at tile coordinates.
 * Collision for these still comes from the map's `collide` layer — placing a
 * prop never blocks a tile by itself.
 */
export interface PropPlacement {
  /** An `ImageKey` (static PNG) or a `PropKey` (animated strip) from assets.ts. */
  key: string;
  kind: 'image' | 'anim';
  /** Top-left tile the artwork is anchored to. */
  tileX: number;
  tileY: number;
  /** Defaults to DEPTH.OBJECT_BEHIND; use DEPTH.OVERHANG to draw over the player. */
  depth?: number;
  /** Starting frame, so three identical server racks don't blink in lockstep. */
  frameOffset?: number;
}

export interface MapDef {
  id: MapId;
  /** Location banner shown on entry, e.g. "Katsudom Town". */
  title: string;
  /** Which music loop plays here. */
  music: MusicTrack;
  /** Where the player lands if entered without an explicit warp target. */
  defaultSpawn: { tileX: number; tileY: number; facing: Direction };
  npcs: NpcDef[];
  interactables: Interactable[];
  warps: Warp[];
  /** Building art and animated scenery placed on this map. */
  props: PropPlacement[];
  /** Interiors render letterboxed with no camera bleed past the walls. */
  isInterior: boolean;
}

export type MusicTrack = 'title' | 'town' | 'interior' | 'trail';
export type SfxName = 'step' | 'menu' | 'confirm' | 'back' | 'door' | 'warp';

// --- menu content --------------------------------------------------------

export interface SkillPouch {
  id: string;
  name: string;
  items: string[];
}

export interface QuestEntry {
  title: string;
  when: string;
  detail: string;
}

export interface MapMarker {
  mapId: MapId;
  label: string;
  /** Overworld tile the player is placed on when fast-travelling here. */
  tileX: number;
  tileY: number;
  facing: Direction;
  /** Position on the drawn mini-map, 0..1 of width/height. */
  pinX: number;
  pinY: number;
}

export interface ContactLink {
  label: string;
  value: string;
  url: string;
}
