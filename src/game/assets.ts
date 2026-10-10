/**
 * Asset contract.
 *
 * `tools/generate-assets.mjs` MUST emit exactly these files with exactly these
 * dimensions; `BootScene` loads exactly this manifest. Nothing else in the game
 * may reference an asset path directly — go through these keys.
 *
 * Swapping in a third-party (CC0) art pack later means replacing the PNGs at
 * these paths with same-sized images. No code changes required.
 */

/** Character sheets: 3 columns x 4 rows of 16x16 frames => 48x64 px. */
export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 16;
export const CHAR_COLS = 3;
export const CHAR_ROWS = 4;

/**
 * Row order in every character sheet. Column order is
 * [step-left-foot, idle, step-right-foot] so column 1 is the standing frame.
 */
export const CHAR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
export const CHAR_IDLE_COL = 1;

export type ImageKey =
  | 'tiles-town'
  | 'ui-frame'
  | 'title-logo'
  | 'bldg-house'
  | 'bldg-archive'
  | 'bldg-shed'
  | 'bldg-clubhouse'
  | 'bldg-admissions'
  | 'campus-gate'
  | 'welcome-sign'
  | 'food-truck'
  | 'mailbox'
  | 'sign-campus'
  | 'sign-trail'
  | 'project-card'
  | 'mountain'
  | 'minimap'
  | 'touch-dpad'
  | 'touch-button';

export type SheetKey =
  'pc-dominic' | 'npc-welcome' | 'npc-guide' | 'npc-teammate' | 'npc-organizer' | 'npc-vendor';

/** Animated props. Each is a horizontal strip of equal frames. */
export type PropKey = 'fountain' | 'server-rack' | 'trail-flag' | 'screen-glow';

export interface PropSpec {
  frameWidth: number;
  frameHeight: number;
  frames: number;
  frameRate: number;
}

export const IMAGES: Record<ImageKey, { path: string; width: number; height: number }> = {
  'tiles-town': { path: 'assets/tiles/tiles-town.png', width: 256, height: 256 },
  'ui-frame': { path: 'assets/ui/ui-frame.png', width: 48, height: 48 },
  'title-logo': { path: 'assets/ui/title-logo.png', width: 208, height: 48 },
  'bldg-house': { path: 'assets/buildings/house.png', width: 64, height: 64 },
  'bldg-archive': { path: 'assets/buildings/archive.png', width: 80, height: 80 },
  'bldg-shed': { path: 'assets/buildings/shed.png', width: 64, height: 56 },
  'bldg-clubhouse': { path: 'assets/buildings/clubhouse.png', width: 80, height: 72 },
  'bldg-admissions': { path: 'assets/buildings/admissions.png', width: 80, height: 72 },
  'campus-gate': { path: 'assets/buildings/campus-gate.png', width: 96, height: 64 },
  'welcome-sign': { path: 'assets/props/welcome-sign.png', width: 32, height: 32 },
  mailbox: { path: 'assets/props/mailbox.png', width: 16, height: 16 },
  'sign-campus': { path: 'assets/props/sign-campus.png', width: 16, height: 16 },
  'sign-trail': { path: 'assets/props/sign-trail.png', width: 16, height: 16 },
  'project-card': { path: 'assets/props/project-card.png', width: 16, height: 16 },
  'food-truck': { path: 'assets/props/food-truck.png', width: 64, height: 48 },
  mountain: { path: 'assets/props/mountain.png', width: 96, height: 80 },
  minimap: { path: 'assets/ui/minimap.png', width: 160, height: 120 },
  'touch-dpad': { path: 'assets/ui/touch-dpad.png', width: 96, height: 96 },
  'touch-button': { path: 'assets/ui/touch-button.png', width: 48, height: 48 },
};

export const SHEETS: Record<SheetKey, { path: string }> = {
  'pc-dominic': { path: 'assets/chars/pc-dominic.png' },
  'npc-welcome': { path: 'assets/chars/npc-welcome.png' },
  'npc-guide': { path: 'assets/chars/npc-guide.png' },
  'npc-teammate': { path: 'assets/chars/npc-teammate.png' },
  'npc-organizer': { path: 'assets/chars/npc-organizer.png' },
  'npc-vendor': { path: 'assets/chars/npc-vendor.png' },
};

export const PROPS: Record<PropKey, PropSpec & { path: string }> = {
  fountain: {
    path: 'assets/props/fountain.png',
    frameWidth: 32,
    frameHeight: 32,
    frames: 4,
    frameRate: 6,
  },
  'server-rack': {
    path: 'assets/props/server-rack.png',
    frameWidth: 16,
    frameHeight: 32,
    frames: 4,
    frameRate: 4,
  },
  'trail-flag': {
    path: 'assets/props/trail-flag.png',
    frameWidth: 16,
    frameHeight: 24,
    frames: 4,
    frameRate: 5,
  },
  'screen-glow': {
    path: 'assets/props/screen-glow.png',
    frameWidth: 16,
    frameHeight: 16,
    frames: 3,
    frameRate: 3,
  },
};

/**
 * Bitmap font, generated as a PNG + Phaser XML descriptor so the game ships no
 * third-party font binary and has zero webfont licensing questions.
 */
export const FONT = {
  key: 'pixel',
  texture: 'assets/ui/font-pixel.png',
  descriptor: 'assets/ui/font-pixel.xml',
} as const;

/** Tiled maps. One JSON per MapId. */
export function mapPath(id: string): string {
  return `assets/maps/${id}.json`;
}
