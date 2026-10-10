/// <reference types="vite/client" />
/**
 * The one world scene. It renders ANY MapId: moving between maps is a swap of
 * tilemap + props + NPCs inside this scene (fade out, rebuild, fade in), never
 * a scene restart, so the player, camera and input handlers live for the whole
 * session.
 *
 * Collision comes only from the `collide` tile layer, which is read as data and
 * never rendered. Interactables and NPCs sit on blocked tiles by design; the
 * player faces them from a neighbouring walkable tile.
 */
import Phaser from 'phaser';
import { PROPS, mapPath, type PropKey } from '../assets';
import {
  DEPTH,
  REGISTRY,
  RENDER_SCALE,
  SCENES,
  TILE_SIZE,
  VIEW_TILES_H,
  VIEW_TILES_W,
} from '../config';
import { MAP_MARKERS } from '../data/content';
import { MAPS, START_MAP, START_SPAWN } from '../data/maps';
import { hex } from '../palette';
import { getAudio } from '../systems/audio';
import { DIR_VECTOR, tileToPixelCenter, type WalkQuery } from '../systems/grid';
import { InputManager } from '../systems/input';
import { hasTouchInput } from '../systems/touch';
import { Player, idleFrame, registerCharAnims } from '../systems/player';
import type {
  Direction,
  Interactable,
  MapId,
  MapMarker,
  NpcDef,
  SfxName,
  Warp,
  WarpTarget,
} from '../types';
import type { MenuLaunchData } from './MenuScene';
import type { UiScene } from './UiScene';

export interface WorldInitData {
  mapId?: MapId;
  tileX?: number;
  tileY?: number;
  facing?: Direction;
}

interface NpcEntry {
  def: NpcDef;
  sprite: Phaser.GameObjects.Sprite;
  facing: Direction;
  timer: Phaser.Time.TimerEvent | null;
}

const DIRECTIONS: Direction[] = ['down', 'left', 'right', 'up'];
const OPPOSITE: Record<Direction, Direction> = {
  down: 'up',
  up: 'down',
  left: 'right',
  right: 'left',
};

const FADE_MS = 250;
const PLAYER_SHEET = 'pc-dominic';

/**
 * Tour route, as MapIds whose fast-travel marker tile (the overworld tile in
 * front of that building) is a stop. A loop that finishes back near the gate.
 */
const TOUR_ROUTE: MapId[] = [
  'truck',
  'shed',
  'house',
  'archive',
  'clubhouse',
  'trail',
  'admissions',
];
const TOUR_PAUSE_MS = 1300;

const tileKey = (x: number, y: number): string => `${x},${y}`;

function isPropKey(key: string): key is PropKey {
  return key in PROPS;
}

export class WorldScene extends Phaser.Scene {
  private mapId: MapId = START_MAP;
  private spawn: { tileX: number; tileY: number; facing: Direction } = { ...START_SPAWN };

  private pad?: InputManager;
  private player?: Player;
  private ui?: UiScene;

  // current map (rebuilt on every swap)
  private tilemap?: Phaser.Tilemaps.Tilemap;
  private mapW = 0;
  private mapH = 0;
  /** blocked[y][x], copied out of the `collide` layer so lookups allocate nothing. */
  private blocked: boolean[][] = [];
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private npcs: NpcEntry[] = [];
  private npcByTile = new Map<string, NpcEntry>();
  private interactByTile = new Map<string, Interactable>();
  private warpByTile = new Map<string, Warp>();

  // state
  private alive = false;
  private transitioning = false;
  /**
   * Warp debouncing. An auto warp fires only when the player FINISHES a step onto
   * its tile, i.e. when the settled tile changes. Arrival from a warp records the
   * arrival tile as already settled, so landing on (or next to) a door never
   * bounces the player straight back; they must leave the tile and re-enter it.
   */
  private settledKey = '';
  private lastPrompt: string | null = null;
  private talkingTo: NpcEntry | null = null;
  /** Set on RESUME so the key that closed the menu is not read as a fresh press. */
  private discardNextRead = false;
  private afterResume: (() => void) | null = null;
  private tourActive = false;
  private tourCancel = false;

  private readonly walkQuery: WalkQuery = {
    isBlocked: (x, y) => this.isBlocked(x, y),
  };

  constructor() {
    super(SCENES.WORLD);
  }

  // --- lifecycle -----------------------------------------------------------

  init(data?: WorldInitData): void {
    // Scene instances are reused across scene.start(), so reset everything.
    const id = data?.mapId ?? START_MAP;
    const base = data?.mapId ? MAPS[id].defaultSpawn : START_SPAWN;
    this.mapId = id;
    this.spawn = {
      tileX: data?.tileX ?? base.tileX,
      tileY: data?.tileY ?? base.tileY,
      facing: data?.facing ?? base.facing,
    };
    this.tilemap = undefined;
    this.blocked = [];
    this.mapObjects = [];
    this.npcs = [];
    this.npcByTile.clear();
    this.interactByTile.clear();
    this.warpByTile.clear();
    this.alive = false;
    this.transitioning = false;
    this.settledKey = '';
    this.lastPrompt = null;
    this.talkingTo = null;
    this.discardNextRead = false;
    this.afterResume = null;
    this.tourActive = false;
    this.tourCancel = false;
  }

  preload(): void {
    // Each scene owns its loader, so the deploy base path must be set again here.
    this.load.setBaseURL(import.meta.env.BASE_URL);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.error(`[world] failed to load "${file.key}": ${file.url}`);
    });
    this.queueMap(this.mapId);
  }

  create(): void {
    this.alive = true;
    this.ui = this.scene.get(SCENES.UI) as UiScene;

    const cam = this.cameras.main;
    cam.setBackgroundColor(hex('black'));
    cam.setZoom(RENDER_SCALE);
    cam.setRoundPixels(true);

    this.pad = new InputManager(this);
    this.buildMap(this.mapId);
    this.player = new Player(this, {
      textureKey: PLAYER_SHEET,
      tileX: this.spawn.tileX,
      tileY: this.spawn.tileY,
      facing: this.spawn.facing,
      walk: this.walkQuery,
    });
    this.settledKey = tileKey(this.spawn.tileX, this.spawn.tileY);
    this.followPlayer();

    cam.fadeIn(300, 0, 0, 0);
    this.ui.setTouchVisible(true);
    this.ui.showBanner(MAPS[this.mapId].title);
    getAudio().playMusic(MAPS[this.mapId].music);

    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  update(_time: number, delta: number): void {
    const { pad, player, ui } = this;
    if (!pad || !player || !ui) return;
    const input = pad.read();
    if (this.discardNextRead) {
      this.discardNextRead = false;
      return;
    }

    // Depth sorting: actors are ordered by their feet (sprite y), so a sprite
    // lower on screen draws over one above it. The fraction keeps the whole
    // range inside the ACTOR band (map height is at most ~720px => +0.72).
    player.sprite.setDepth(DEPTH.ACTOR + player.sprite.y / 1000);

    if (this.tourActive) {
      // Esc / Interact stop the tour; the tour loop notices the flag between steps.
      // The press is consumed here: it only ends the tour, and the next read is
      // discarded so it can never fall through to the menu / interact handlers.
      if (input.interact || input.menu) {
        this.tourCancel = true;
        this.discardNextRead = true;
      }
      player.update({ ...input, dir: null }, delta);
      return;
    }

    const talking = ui.dialogueOpen;
    // Freeze movement while reading or fading; the player still settles its sprite.
    player.update(talking || this.transitioning ? { ...input, dir: null } : input, delta);

    if (this.transitioning) return;

    if (talking) {
      this.setPrompt(null);
      return;
    }
    if (input.menu) {
      this.openMenu();
      return;
    }

    this.checkAutoWarp();
    if (this.transitioning) return;

    this.updatePrompt();
    if (input.interact) this.interact();
  }

  // --- map loading ---------------------------------------------------------

  private mapKey(id: MapId): string {
    return `map-${id}`;
  }

  private queueMap(id: MapId): void {
    const key = this.mapKey(id);
    if (!this.cache.tilemap.exists(key)) this.load.tilemapTiledJSON(key, mapPath(id));
  }

  /** Loads a map's JSON on demand. The Phaser cache is global, so each map is fetched once. */
  private ensureMap(id: MapId): Promise<boolean> {
    const key = this.mapKey(id);
    if (this.cache.tilemap.exists(key)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      this.queueMap(id);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve(this.cache.tilemap.exists(key)));
      this.load.start();
    });
  }

  // --- map build / teardown ------------------------------------------------

  private buildMap(id: MapId): void {
    const def = MAPS[id];
    this.mapId = id;
    this.registry.set(REGISTRY.CURRENT_MAP, id);

    const map = this.make.tilemap({ key: this.mapKey(id) });
    this.tilemap = map;
    this.mapW = map.width;
    this.mapH = map.height;

    const tileset = map.addTilesetImage('tiles-town', 'tiles-town');
    if (tileset) {
      map.createLayer('ground', tileset, 0, 0)?.setDepth(DEPTH.GROUND);
      map.createLayer('decor', tileset, 0, 0)?.setDepth(DEPTH.DECAL);
      map.createLayer('overhang', tileset, 0, 0)?.setDepth(DEPTH.OVERHANG);
    } else {
      console.error(`[world] map "${id}" has no usable "tiles-town" tileset`);
    }

    // `collide` is never created as a layer: its data is copied into a bool grid.
    const collide = map.getLayer('collide');
    this.blocked = [];
    for (let y = 0; y < this.mapH; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < this.mapW; x++) {
        row.push((collide?.data[y]?.[x]?.index ?? -1) > 0);
      }
      this.blocked.push(row);
    }

    for (const prop of def.props) {
      const x = prop.tileX * TILE_SIZE;
      const y = prop.tileY * TILE_SIZE;
      const depth = prop.depth ?? DEPTH.OBJECT_BEHIND;
      if (prop.kind === 'image') {
        this.mapObjects.push(this.add.image(x, y, prop.key).setOrigin(0, 0).setDepth(depth));
      } else if (isPropKey(prop.key)) {
        const spec = PROPS[prop.key];
        const animKey = this.propAnim(prop.key);
        const sprite = this.add.sprite(x, y, prop.key, 0).setOrigin(0, 0).setDepth(depth);
        // frameOffset desynchronises identical props (the three server racks).
        sprite.play({ key: animKey, startFrame: (prop.frameOffset ?? 0) % spec.frames });
        this.mapObjects.push(sprite);
      } else {
        console.warn(`[world] unknown animated prop "${prop.key}" on ${id}`);
      }
    }

    this.interactByTile.clear();
    for (const it of def.interactables) this.interactByTile.set(tileKey(it.tileX, it.tileY), it);
    this.warpByTile.clear();
    for (const w of def.warps) this.warpByTile.set(tileKey(w.tileX, w.tileY), w);

    this.npcs = [];
    this.npcByTile.clear();
    for (const npc of def.npcs) this.spawnNpc(npc);
  }

  private destroyMap(): void {
    for (const npc of this.npcs) {
      npc.timer?.remove(false);
      npc.sprite.destroy();
    }
    this.npcs = [];
    this.npcByTile.clear();
    this.talkingTo = null;
    for (const o of this.mapObjects) o.destroy();
    this.mapObjects = [];
    // Destroying the tilemap also destroys the layers created from it.
    this.tilemap?.destroy();
    this.tilemap = undefined;
  }

  /** Animations are global and keyed per prop; created the first time a prop appears. */
  private propAnim(key: PropKey): string {
    const animKey = `prop:${key}`;
    if (!this.anims.exists(animKey)) {
      const spec = PROPS[key];
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: spec.frames - 1 }),
        frameRate: spec.frameRate,
        repeat: -1,
      });
    }
    return animKey;
  }

  private spawnNpc(def: NpcDef): void {
    registerCharAnims(this, def.spriteKey);
    const p = tileToPixelCenter(def.tileX, def.tileY);
    const sprite = this.add.sprite(p.x, p.y, def.spriteKey, idleFrame(def.facing));
    sprite.setDepth(DEPTH.ACTOR + sprite.y / 1000);
    const entry: NpcEntry = { def, sprite, facing: def.facing, timer: null };
    this.npcs.push(entry);
    this.npcByTile.set(tileKey(def.tileX, def.tileY), entry);
    if (def.idleTurn) this.scheduleIdleTurn(entry);
  }

  /** NPCs never leave their tile; every few seconds they just look another way. */
  private scheduleIdleTurn(entry: NpcEntry): void {
    entry.timer = this.time.delayedCall(Phaser.Math.Between(2200, 5200), () => {
      if (this.talkingTo !== entry && !this.ui?.dialogueOpen) {
        const options = DIRECTIONS.filter((d) => d !== entry.facing);
        this.faceNpc(entry, options[Phaser.Math.Between(0, options.length - 1)]);
      }
      this.scheduleIdleTurn(entry);
    });
  }

  private faceNpc(entry: NpcEntry, dir: Direction): void {
    entry.facing = dir;
    entry.sprite.setFrame(idleFrame(dir));
  }

  // --- collision -----------------------------------------------------------

  private isBlocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.mapW || y >= this.mapH) return true;
    return this.blocked[y][x] || this.npcByTile.has(tileKey(x, y));
  }

  // --- camera --------------------------------------------------------------

  /**
   * Follows the player, clamped to the map. When a map is smaller than the view
   * (every interior), the bounds are widened symmetrically so Phaser has nothing
   * to scroll and the map sits centred, with the black background around it.
   */
  private followPlayer(): void {
    const { player } = this;
    if (!player) return;
    const cam = this.cameras.main;
    const mw = this.mapW * TILE_SIZE;
    const mh = this.mapH * TILE_SIZE;
    const vw = VIEW_TILES_W * TILE_SIZE;
    const vh = VIEW_TILES_H * TILE_SIZE;
    cam.setBounds(
      mw < vw ? -(vw - mw) / 2 : 0,
      mh < vh ? -(vh - mh) / 2 : 0,
      Math.max(mw, vw),
      Math.max(mh, vh),
    );
    cam.stopFollow();
    cam.startFollow(player.sprite, true, 1, 1);
    cam.centerOn(player.sprite.x, player.sprite.y);
  }

  // --- interaction ---------------------------------------------------------

  private facedTarget(): { npc?: NpcEntry; item?: Interactable; warp?: Warp } {
    const { player } = this;
    if (!player || player.isMoving) return {};
    const t = player.facingTile();
    const key = tileKey(t.tileX, t.tileY);
    const warp =
      this.warpByTile.get(key) ?? this.warpByTile.get(tileKey(player.tileX, player.tileY));
    return {
      npc: this.npcByTile.get(key),
      item: this.interactByTile.get(key),
      // Only manual warps are interactive; auto ones fire on their own.
      warp: warp && !warp.auto ? warp : undefined,
    };
  }

  private updatePrompt(): void {
    const { npc, item, warp } = this.facedTarget();
    this.setPrompt(npc?.def.name ?? item?.label ?? warp?.label ?? null);
  }

  private setPrompt(label: string | null): void {
    if (label === this.lastPrompt) return;
    this.lastPrompt = label;
    this.ui?.showPrompt(label);
  }

  private interact(): void {
    const { npc, item, warp } = this.facedTarget();
    const ui = this.ui;
    if (!ui) return;

    if (npc) {
      getAudio().playSfx('confirm');
      this.talkTo(npc);
    } else if (item) {
      getAudio().playSfx('confirm');
      if (item.payload.kind === 'warp') {
        void this.warpTo(item.payload.target, 'door', MAPS[item.payload.target.mapId].title);
      } else if (item.payload.kind === 'projectCard') {
        ui.openDialogue({ pages: item.payload.pages, card: item.payload.card });
      } else {
        ui.openDialogue({ pages: item.payload.pages });
      }
    } else if (warp) {
      void this.warpTo(warp.target, 'door', MAPS[warp.target.mapId].title);
    }
  }

  private talkTo(npc: NpcEntry): void {
    const { player, ui } = this;
    if (!player || !ui) return;
    // The NPC turns to face the player before speaking.
    this.faceNpc(npc, OPPOSITE[player.facing]);
    this.talkingTo = npc;
    this.setPrompt(null);
    ui.openDialogue({
      pages: npc.def.pages,
      onDone: () => {
        this.talkingTo = null;
        if (npc.def.special === 'tourGuide') this.askTour();
      },
    });
  }

  // --- warps ---------------------------------------------------------------

  private checkAutoWarp(): void {
    const { player } = this;
    if (!player || player.isMoving) return;
    const key = tileKey(player.tileX, player.tileY);
    if (key === this.settledKey) return;
    this.settledKey = key;
    const warp = this.warpByTile.get(key);
    if (warp?.auto) void this.warpTo(warp.target, 'door', MAPS[warp.target.mapId].title);
  }

  private fade(out: boolean): Promise<void> {
    const cam = this.cameras.main;
    return new Promise<void>((resolve) => {
      if (out) {
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => resolve());
        cam.fadeOut(FADE_MS, 0, 0, 0);
      } else {
        cam.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => resolve());
        cam.fadeIn(FADE_MS, 0, 0, 0);
      }
    });
  }

  /** Fade out, swap the map, fade in. Input and warps stay locked for the duration. */
  private async warpTo(target: WarpTarget, sfx: SfxName, banner: string): Promise<void> {
    const { player, ui } = this;
    if (!player || !ui || this.transitioning) return;
    this.transitioning = true;
    player.inputEnabled = false;
    this.setPrompt(null);
    getAudio().playSfx(sfx);

    await this.fade(true);
    if (!this.alive) return;
    const loaded = await this.ensureMap(target.mapId);
    if (!this.alive) return;

    if (loaded) {
      this.destroyMap();
      this.buildMap(target.mapId);
      player.teleport(target.tileX, target.tileY, target.facing);
      // Arrival tile counts as already settled: see settledKey.
      this.settledKey = tileKey(target.tileX, target.tileY);
      this.followPlayer();
      getAudio().playMusic(MAPS[target.mapId].music);
      ui.showBanner(banner);
    } else {
      console.error(`[world] could not load map "${target.mapId}"; staying put`);
    }

    await this.fade(false);
    if (!this.alive) return;
    player.inputEnabled = true;
    this.transitioning = false;
  }

  /** Called when the Map tab selects a marker (after the menu has closed). */
  private fastTravel(marker: MapMarker): void {
    // Every marker lands on an OVERWORLD tile, including the ones named for buildings.
    void this.warpTo(
      { mapId: 'overworld', tileX: marker.tileX, tileY: marker.tileY, facing: marker.facing },
      'warp',
      marker.label,
    );
  }

  // --- menu ----------------------------------------------------------------

  private openMenu(): void {
    getAudio().playSfx('menu');
    this.setPrompt(null);
    this.openOverlay({
      mode: 'menu',
      onTravel: (marker) => this.runAfterResume(() => this.fastTravel(marker)),
    });
  }

  private openOverlay(data: MenuLaunchData): void {
    this.ui?.setTouchVisible(false);
    this.scene.launch(SCENES.MENU, data);
    this.scene.pause();
  }

  /** The overlay calls back before World is resumed; hold the action until it is. */
  private runAfterResume(fn: () => void): void {
    if (this.sys.isPaused()) this.afterResume = fn;
    else fn();
  }

  private onResume(): void {
    this.discardNextRead = true;
    this.ui?.setTouchVisible(true);
    const fn = this.afterResume;
    this.afterResume = null;
    fn?.();
  }

  // --- tour guide ----------------------------------------------------------

  private askTour(): void {
    this.openOverlay({
      mode: 'confirm',
      question: 'Take the guided walk around town?',
      yesLabel: 'Yes, show me',
      noLabel: 'Not now',
      onYes: () => this.runAfterResume(() => void this.runTour()),
      onNo: () => undefined,
    });
  }

  /**
   * Walks the player to each building in turn. Input is disabled for the walk;
   * Esc / Interact set tourCancel, which is checked between every single step so
   * control comes back within one tile.
   */
  private async runTour(): Promise<void> {
    const { player, ui } = this;
    if (!player || !ui || this.tourActive || this.transitioning) return;
    this.tourActive = true;
    this.tourCancel = false;
    player.inputEnabled = false;
    this.setPrompt(hasTouchInput() ? 'Tap A: stop tour' : 'Esc: stop tour');
    // The prompt label is ours for the duration; keep the cache honest.

    try {
      for (const id of TOUR_ROUTE) {
        const stop = MAP_MARKERS.find((m) => m.mapId === id);
        if (!stop || this.mapId !== 'overworld') continue;
        const steps = this.findPath(player.tileX, player.tileY, stop.tileX, stop.tileY);
        if (!steps) {
          console.warn(`[world] tour: no walkable path to ${stop.label}`);
          continue;
        }
        for (const dir of steps) {
          if (this.tourCancel || !this.alive) return;
          await player.walkPath([dir]);
        }
        if (this.tourCancel || !this.alive) return;
        player.teleport(stop.tileX, stop.tileY, stop.facing);
        ui.showBanner(stop.label);
        await this.waitOrCancel(TOUR_PAUSE_MS);
        if (this.tourCancel || !this.alive) return;
      }
    } finally {
      this.tourActive = false;
      this.tourCancel = false;
      if (this.alive) {
        player.inputEnabled = true;
        // Don't let the final tile count as a fresh arrival.
        this.settledKey = tileKey(player.tileX, player.tileY);
        this.setPrompt(null);
      }
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.time.delayedCall(ms, resolve);
    });
  }

  /**
   * Like wait(), but woken in small slices so a cancel during the pause at a
   * tour stop is felt almost immediately. A single delayedCall would hold the
   * player hostage for the whole pause before the next cancel check ran.
   */
  private async waitOrCancel(ms: number): Promise<void> {
    const SLICE_MS = 80;
    for (let left = ms; left > 0; left -= SLICE_MS) {
      if (this.tourCancel || !this.alive) return;
      await this.wait(Math.min(SLICE_MS, left));
    }
  }

  /**
   * Breadth-first search over walkable tiles (collision + NPCs), returning the
   * shortest list of steps. Warp tiles are treated as walls so a tour can never
   * clip a doorway and teleport the player mid-walk. walkPath() ignores
   * collision, which is why the route is computed here from the same data.
   */
  private findPath(fromX: number, fromY: number, toX: number, toY: number): Direction[] | null {
    if (fromX === toX && fromY === toY) return [];
    const start = tileKey(fromX, fromY);
    const prev = new Map<string, { from: string; dir: Direction }>();
    const seen = new Set<string>([start]);
    const queue: Array<[number, number]> = [[fromX, fromY]];
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = queue[head];
      for (const dir of DIRECTIONS) {
        const nx = x + DIR_VECTOR[dir].dx;
        const ny = y + DIR_VECTOR[dir].dy;
        const key = tileKey(nx, ny);
        if (seen.has(key) || this.isBlocked(nx, ny) || this.warpByTile.has(key)) continue;
        seen.add(key);
        prev.set(key, { from: tileKey(x, y), dir });
        if (nx === toX && ny === toY) {
          const steps: Direction[] = [];
          for (let k = key; k !== start;) {
            const link = prev.get(k);
            if (!link) break;
            steps.push(link.dir);
            k = link.from;
          }
          return steps.reverse();
        }
        queue.push([nx, ny]);
      }
    }
    return null;
  }

  // --- teardown ------------------------------------------------------------

  private onShutdown(): void {
    this.alive = false;
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.destroyMap();
    this.player = undefined;
    this.pad = undefined;
    this.time.removeAllEvents();
    this.tweens.killAll();
  }
}
