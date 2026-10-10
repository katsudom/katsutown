/**
 * Pause menu, launched over a paused WorldScene. Runs unzoomed in the full
 * 960x720 space, styled like the dialogue box (cream panel, crimson frame,
 * bitmap font).
 *
 * Input model (keyboard and pointer both reach everything):
 *  - focus 'tabs': Left/Right change tab, Down/Interact enter the body.
 *  - focus 'body': arrows move to the nearest selectable in that direction,
 *    Interact activates, Up from the top row returns to the tabs.
 *  - Esc always closes (or cancels the confirm dialog if one is open).
 *  - Pointer: tap tabs and rows, mouse wheel / drag to scroll. No game object
 *    is interactive; hits are tested by hand against the same rectangles the
 *    keyboard navigates, so a row clipped by the scroll mask can never be hit.
 *
 * The same scene also serves as the yes/no prompt for the tour guide
 * (`mode: 'confirm'`), because UiScene has no choice widget.
 */
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { CONTACTS, MAP_MARKERS, PERSON, QUEST_LOG, SKILL_POUCHES } from '../data/content';
import { hex, type PaletteKey } from '../palette';
import { getAudio } from '../systems/audio';
import { InputManager } from '../systems/input';
import { hasTouchInput } from '../systems/touch';
import type { Direction, MapMarker } from '../types';
import { createLabel, setLabelColor, textMetrics, wrapText, type Label } from './UiScene';

export type MenuLaunchData =
  | {
      mode: 'menu';
      /** Fast-travel request; the menu has already closed when this fires. */
      onTravel: (marker: MapMarker) => void;
    }
  | {
      mode: 'confirm';
      question: string;
      yesLabel: string;
      noLabel: string;
      onYes: () => void;
      onNo: () => void;
    };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SelState = 'idle' | 'dim' | 'active';

/** One keyboard/pointer target inside the scrolling body. Rects are body-local. */
interface Sel {
  bounds: Rect;
  hit: Rect[];
  paint: (state: SelState) => void;
  activate: () => void;
  /** Called when the selection lands here (keyboard, hover or tap). */
  onSelect?: () => void;
  /** Touch needs a first tap to select and a second to act (map pins). */
  twoTapOnTouch?: boolean;
}

interface ModalButton {
  rect: Rect;
  paint: (selected: boolean) => void;
  choose: () => void;
}

const FRAME_SCALE = 3;
const FRAME_SLICE = 8;

// Panel geometry (all in 960x720 game space).
const PANEL = { x: 12, y: 12, w: 936, h: 696 };
const INNER_X = 48;
const INNER_W = 864;
const TAB_Y = 48;
const TAB_H = 48;
const REGION: Rect = { x: INNER_X, y: 114, w: INNER_W, h: 530 };
const HINT_Y = 660;

const TABS = ['Profile', 'Inventory', 'Quest Log', 'Map', 'Settings', 'Exit'] as const;

const MAP_IMG_SCALE = 4;
const MAP_IMG_W = 160 * MAP_IMG_SCALE;
const MAP_IMG_H = 120 * MAP_IMG_SCALE;

const REPEAT_DELAY_MS = 380;
const REPEAT_RATE_MS = 90;
const SCROLL_STEP = 60;

const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

const overlapArea = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

export class MenuScene extends Phaser.Scene {
  private data_: MenuLaunchData | null = null;
  private pad?: InputManager;

  private tab = 0;
  private focus: 'tabs' | 'body' = 'tabs';
  private selIdx = 0;
  private sels: Sel[] = [];
  private scrollY = 0;
  private contentH = 0;

  private tabRects: Rect[] = [];
  private tabG?: Phaser.GameObjects.Graphics;
  private tabLabels: Label[] = [];
  private body?: Phaser.GameObjects.Container;
  private maskG?: Phaser.GameObjects.Graphics;
  private scrollG?: Phaser.GameObjects.Graphics;
  private hint?: Label;
  private closeG?: Phaser.GameObjects.Graphics;
  private closeCenter = { x: 934, y: 22 };

  /** Objects the selected inventory pouch owns on the right; rebuilt per selection. */
  private pouchObjs: Phaser.GameObjects.GameObject[] = [];
  private mapCaption?: Label;

  private modalObjs: Phaser.GameObjects.GameObject[] = [];
  private modalButtons: ModalButton[] = [];
  private modalSel = 0;
  private modalOnYes: (() => void) | null = null;
  private modalOnNo: (() => void) | null = null;

  // input
  private skipRead = true;
  private holdDir: Direction | null = null;
  private holdMs = 0;
  private repeatMs = 0;
  private drag: { startY: number; startScroll: number; moved: boolean } | null = null;
  private closing = false;

  constructor() {
    super(SCENES.MENU);
  }

  init(data?: MenuLaunchData): void {
    this.data_ = data ?? null;
    this.tab = 0;
    this.focus = 'tabs';
    this.selIdx = 0;
    this.sels = [];
    this.scrollY = 0;
    this.contentH = 0;
    this.tabRects = [];
    this.tabLabels = [];
    this.pouchObjs = [];
    this.modalObjs = [];
    this.modalButtons = [];
    this.modalSel = 0;
    this.modalOnYes = null;
    this.modalOnNo = null;
    this.skipRead = true;
    this.holdDir = null;
    this.drag = null;
    this.closing = false;
  }

  create(): void {
    // The Ui overlay was lifted to the top at boot; the menu must sit above it.
    this.scene.bringToTop();

    const backdrop = this.add.graphics();
    backdrop.fillStyle(hex('black'), 0.65).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    backdrop.setDepth(DEPTH.UI);

    this.pad = new InputManager(this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    const data = this.data_;
    if (data?.mode === 'confirm') {
      this.openModal(data.question, data.yesLabel, data.noLabel, true, data.onYes, data.onNo);
    } else {
      this.buildPanel();
      this.setTab(0, false);
    }
  }

  update(_time: number, delta: number): void {
    const input = this.pad?.read();
    if (!input) return;
    if (this.skipRead) {
      // The key that opened the menu is usually still down: swallow that read.
      this.skipRead = false;
      this.holdDir = input.dir;
      return;
    }
    const dir = this.pressedDir(input.dir, delta);

    if (this.modalButtons.length > 0) {
      if (input.cancel) this.chooseModal(false);
      else if (input.interact) this.modalButtons[this.modalSel]?.choose();
      else if (dir) this.moveModalSel(dir);
      return;
    }
    if (input.cancel) {
      this.close();
      return;
    }
    if (dir) this.navigate(dir);
    if (input.interact) this.activate();
  }

  // --- panel ---------------------------------------------------------------

  private buildPanel(): void {
    const frame = this.add
      .nineslice(
        PANEL.x,
        PANEL.y,
        'ui-frame',
        undefined,
        PANEL.w / FRAME_SCALE,
        PANEL.h / FRAME_SCALE,
        FRAME_SLICE,
        FRAME_SLICE,
        FRAME_SLICE,
        FRAME_SLICE,
      )
      .setOrigin(0, 0)
      .setScale(FRAME_SCALE);
    frame.setDepth(DEPTH.UI + 1);

    // Tabs: laid out from measured label widths so they always fit the bar.
    const m = textMetrics(this, 3);
    const widths = TABS.map((t) => [...t].reduce((w, ch) => w + m.adv(ch), 0));
    const gap = 4;
    const pad = Math.floor(
      (INNER_W - widths.reduce((a, b) => a + b, 0) - gap * (TABS.length - 1)) / (TABS.length * 2),
    );
    let x = INNER_X;
    this.tabG = this.add.graphics().setDepth(DEPTH.UI + 2);
    TABS.forEach((name, i) => {
      const w = Math.ceil(widths[i]) + pad * 2;
      this.tabRects.push({ x, y: TAB_Y, w, h: TAB_H });
      const label = createLabel(
        this,
        x + pad,
        TAB_Y + (TAB_H - m.lineHeight) / 2 + 2,
        name,
        3,
        'ink',
      );
      label.setDepth(DEPTH.UI + 3);
      this.tabLabels.push(label);
      x += w + gap;
    });

    // Close badge: touch users have no Esc key, so the panel carries its own.
    this.closeG = this.add.graphics().setDepth(DEPTH.UI + 4);
    this.paintClose();

    this.add
      .graphics()
      .setDepth(DEPTH.UI + 2)
      .fillStyle(hex('creamShadow'), 1)
      .fillRect(INNER_X, TAB_Y + TAB_H + 8, INNER_W, 2);

    this.body = this.add.container(REGION.x, REGION.y).setDepth(DEPTH.UI + 2);
    this.maskG = this.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff, 1).fillRect(REGION.x, REGION.y, REGION.w, REGION.h);
    this.body.setMask(this.maskG.createGeometryMask());
    this.scrollG = this.add.graphics().setDepth(DEPTH.UI + 3);

    this.hint = createLabel(this, INNER_X, HINT_Y, '', 2, 'inkSoft');
    this.hint.setDepth(DEPTH.UI + 3).setAlpha(0.8);
  }

  private paintClose(): void {
    const g = this.closeG;
    if (!g) return;
    const { x, y } = this.closeCenter;
    g.clear();
    g.fillStyle(hex('crimson'), 1).fillCircle(x, y, 18);
    g.lineStyle(3, hex('creamLight'), 1).strokeCircle(x, y, 18);
    g.lineStyle(4, hex('creamLight'), 1);
    g.lineBetween(x - 7, y - 7, x + 7, y + 7);
    g.lineBetween(x - 7, y + 7, x + 7, y - 7);
  }

  private paintTabs(): void {
    const g = this.tabG;
    if (!g) return;
    g.clear();
    this.tabRects.forEach((r, i) => {
      const active = i === this.tab;
      g.fillStyle(active ? hex('crimson') : hex('creamDark'), 1).fillRoundedRect(
        r.x,
        r.y,
        r.w,
        r.h,
        8,
      );
      if (active && this.focus === 'tabs') {
        g.lineStyle(4, hex('crimsonDeep'), 1).strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
      } else {
        g.lineStyle(2, active ? hex('crimsonDeep') : hex('creamShadow'), 1).strokeRoundedRect(
          r.x,
          r.y,
          r.w,
          r.h,
          8,
        );
      }
      setLabelColor(this.tabLabels[i], active ? 'creamLight' : 'ink');
    });
  }

  private paintHint(): void {
    const touch = hasTouchInput();
    const text = touch
      ? this.focus === 'tabs'
        ? 'Tap a tab or row   X (top right): close'
        : 'Tap to choose   Drag: scroll   X (top right): close'
      : this.focus === 'tabs'
        ? 'Left/Right: tab   Down: enter   Esc: close'
        : 'Arrows: move   Space: choose   Up: tabs   Esc: close';
    this.hint?.setText(text);
  }

  // --- tabs ----------------------------------------------------------------

  private setTab(index: number, sfx = true): void {
    if (sfx) getAudio().playSfx('menu');
    this.tab = (index + TABS.length) % TABS.length;
    this.pouchObjs = [];
    this.mapCaption = undefined;
    this.body?.removeAll(true);
    this.sels = [];
    this.selIdx = 0;
    this.scrollY = 0;

    switch (this.tab) {
      case 0:
        this.contentH = this.buildProfile();
        break;
      case 1:
        this.contentH = this.buildInventory();
        break;
      case 2:
        this.contentH = this.buildQuests();
        break;
      case 3:
        this.contentH = this.buildMap();
        break;
      case 4:
        this.contentH = this.buildSettings();
        break;
      default:
        this.contentH = this.buildExit();
        break;
    }
    if (this.focus === 'body' && this.sels.length === 0) this.focus = 'tabs';
    this.sels[0]?.onSelect?.();
    this.applyScroll();
    this.paintAll();
  }

  private paintAll(): void {
    this.paintTabs();
    this.paintHint();
    this.sels.forEach((s, i) => s.paint(this.selStateOf(i)));
  }

  private selStateOf(i: number): SelState {
    if (i !== this.selIdx) return 'idle';
    return this.focus === 'body' ? 'active' : 'dim';
  }

  private setSel(index: number, sfx = true): void {
    if (index === this.selIdx || index < 0 || index >= this.sels.length) return;
    if (sfx) getAudio().playSfx('menu');
    this.selIdx = index;
    this.sels[index].onSelect?.();
    this.ensureVisible(this.sels[index].bounds);
    this.paintAll();
  }

  // --- navigation ----------------------------------------------------------

  private pressedDir(dir: Direction | null, delta: number): Direction | null {
    if (!dir) {
      this.holdDir = null;
      return null;
    }
    if (dir !== this.holdDir) {
      this.holdDir = dir;
      this.holdMs = 0;
      this.repeatMs = 0;
      return dir;
    }
    this.holdMs += delta;
    if (this.holdMs < REPEAT_DELAY_MS) return null;
    this.repeatMs += delta;
    if (this.repeatMs < REPEAT_RATE_MS) return null;
    this.repeatMs = 0;
    return dir;
  }

  private navigate(dir: Direction): void {
    if (this.focus === 'tabs') {
      if (dir === 'left') this.setTab(this.tab - 1);
      else if (dir === 'right') this.setTab(this.tab + 1);
      else if (dir === 'down') {
        if (this.sels.length > 0) {
          this.focus = 'body';
          getAudio().playSfx('menu');
          this.paintAll();
        } else this.scrollBy(SCROLL_STEP);
      } else this.scrollBy(-SCROLL_STEP);
      return;
    }

    // Body focus: spatial navigation to the nearest selectable in that direction.
    const cur = this.sels[this.selIdx];
    if (!cur) return;
    const cx = cur.bounds.x + cur.bounds.w / 2;
    const cy = cur.bounds.y + cur.bounds.h / 2;
    let best = -1;
    let bestScore = Infinity;
    this.sels.forEach((s, i) => {
      if (i === this.selIdx) return;
      const dx = s.bounds.x + s.bounds.w / 2 - cx;
      const dy = s.bounds.y + s.bounds.h / 2 - cy;
      const along = dir === 'down' ? dy : dir === 'up' ? -dy : dir === 'right' ? dx : -dx;
      const across = dir === 'down' || dir === 'up' ? Math.abs(dx) : Math.abs(dy);
      if (along <= 4) return;
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) this.setSel(best);
    else if (dir === 'up') {
      this.focus = 'tabs';
      getAudio().playSfx('menu');
      this.paintAll();
    }
  }

  private activate(): void {
    if (this.focus === 'tabs') {
      if (this.sels.length > 0) this.navigate('down');
      return;
    }
    this.sels[this.selIdx]?.activate();
  }

  // --- scrolling -----------------------------------------------------------

  private get maxScroll(): number {
    return Math.max(0, this.contentH - REGION.h);
  }

  private scrollBy(amount: number): void {
    this.scrollY = Phaser.Math.Clamp(this.scrollY + amount, 0, this.maxScroll);
    this.applyScroll();
  }

  private ensureVisible(b: Rect): void {
    const margin = 10;
    if (b.y - margin < this.scrollY) this.scrollY = b.y - margin;
    else if (b.y + b.h + margin > this.scrollY + REGION.h) {
      this.scrollY = b.y + b.h + margin - REGION.h;
    }
    this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
    this.applyScroll();
  }

  private applyScroll(): void {
    this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.maxScroll);
    this.body?.setY(REGION.y - this.scrollY);
    const g = this.scrollG;
    if (!g) return;
    g.clear();
    if (this.maxScroll <= 0) return;
    // Thin scrollbar on the right edge of the region.
    const trackX = REGION.x + REGION.w + 2;
    const thumbH = Math.max(40, (REGION.h * REGION.h) / this.contentH);
    const thumbY = REGION.y + (this.scrollY / this.maxScroll) * (REGION.h - thumbH);
    g.fillStyle(hex('creamShadow'), 0.5).fillRect(trackX, REGION.y, 6, REGION.h);
    g.fillStyle(hex('crimson'), 1).fillRect(trackX, thumbY, 6, thumbH);
  }

  // --- pointer -------------------------------------------------------------

  private hitSel(px: number, py: number): number {
    if (!inRect(REGION, px, py)) return -1;
    const lx = px - REGION.x;
    const ly = py - REGION.y + this.scrollY;
    return this.sels.findIndex((s) => s.hit.some((r) => inRect(r, lx, ly)));
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.skipRead) return;
    if (this.modalButtons.length > 0) {
      const i = this.modalButtons.findIndex((b) => inRect(b.rect, p.x, p.y));
      if (i >= 0) {
        this.modalSel = i;
        this.modalButtons.forEach((b, j) => b.paint(j === i));
        this.modalButtons[i].choose();
      }
      return;
    }
    const dx = p.x - this.closeCenter.x;
    const dy = p.y - this.closeCenter.y;
    if (dx * dx + dy * dy <= 26 * 26) {
      this.close();
      return;
    }
    const tabIdx = this.tabRects.findIndex((r) => inRect(r, p.x, p.y));
    if (tabIdx >= 0) {
      this.focus = 'tabs';
      if (tabIdx !== this.tab) this.setTab(tabIdx);
      else this.paintAll();
      return;
    }
    if (inRect(REGION, p.x, p.y)) {
      this.drag = { startY: p.y, startScroll: this.scrollY, moved: false };
    }
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.modalButtons.length > 0 || this.skipRead) return;
    if (this.drag && p.isDown) {
      if (Math.abs(p.y - this.drag.startY) > 10) this.drag.moved = true;
      if (this.drag.moved && this.maxScroll > 0) {
        this.scrollY = this.drag.startScroll - (p.y - this.drag.startY);
        this.applyScroll();
      }
      return;
    }
    // Mouse hover moves the highlight; touch has no hover.
    if (!p.wasTouch) {
      const i = this.hitSel(p.x, p.y);
      if (i >= 0 && (i !== this.selIdx || this.focus !== 'body')) {
        this.focus = 'body';
        if (i !== this.selIdx) this.setSel(i);
        else this.paintAll();
      }
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.moved || this.modalButtons.length > 0) return;
    const i = this.hitSel(p.x, p.y);
    if (i < 0) return;
    const sel = this.sels[i];
    const wasSelected = i === this.selIdx && this.focus === 'body';
    this.focus = 'body';
    if (i !== this.selIdx) this.setSel(i);
    else this.paintAll();
    if (sel.twoTapOnTouch && p.wasTouch && !wasSelected) return;
    sel.activate();
  }

  private onWheel(
    _p: Phaser.Input.Pointer,
    _over: Phaser.GameObjects.GameObject[],
    _dx: number,
    dy: number,
  ): void {
    if (this.modalButtons.length === 0) this.scrollBy(Math.sign(dy) * SCROLL_STEP);
  }

  // --- row helpers ---------------------------------------------------------

  /** Adds an object to the scrolling body. */
  private put<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.body?.add(o);
    return o;
  }

  private text(
    x: number,
    y: number,
    str: string,
    scale: 2 | 3,
    color: PaletteKey,
    wrapW?: number,
  ): Label {
    const m = textMetrics(this, scale);
    const wrapped = wrapW === undefined ? str : wrapText(str, wrapW, m.adv);
    return this.put(createLabel(this, x, y, wrapped, scale, color));
  }

  private lineHeight(scale: 2 | 3): number {
    return textMetrics(this, scale).lineHeight;
  }

  /** A framed row: idle outline, dim fill when focus is on the tabs, solid crimson when active. */
  private rowSel(
    rect: Rect,
    parts: Array<{ label: Label; idle: PaletteKey }>,
    activate: () => void,
    extras?: {
      onSelect?: () => void;
      draw?: (g: Phaser.GameObjects.Graphics, s: SelState) => void;
    },
  ): Sel {
    const g = this.put(this.add.graphics());
    // Rows paint under their labels: send the graphics to the back of the body.
    this.body?.sendToBack(g);
    const sel: Sel = {
      bounds: rect,
      hit: [rect],
      activate,
      onSelect: extras?.onSelect,
      paint: (state) => {
        g.clear();
        if (state === 'active') {
          g.fillStyle(hex('crimson'), 1).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
          g.lineStyle(3, hex('crimsonDeep'), 1).strokeRoundedRect(
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            8,
          );
          g.fillStyle(hex('creamLight'), 1);
          const ay = rect.y + rect.h / 2;
          g.fillTriangle(rect.x + 12, ay - 9, rect.x + 12, ay + 9, rect.x + 28, ay);
        } else if (state === 'dim') {
          g.fillStyle(hex('creamDark'), 1).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
          g.lineStyle(3, hex('crimson'), 1).strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
        } else {
          g.fillStyle(hex('creamLight'), 0.6).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
          g.lineStyle(2, hex('creamShadow'), 1).strokeRoundedRect(
            rect.x,
            rect.y,
            rect.w,
            rect.h,
            8,
          );
        }
        extras?.draw?.(g, state);
        for (const part of parts) {
          setLabelColor(part.label, state === 'active' ? 'creamLight' : part.idle);
        }
      },
    };
    this.sels.push(sel);
    return sel;
  }

  private sectionHeader(y: number, str: string): number {
    const t = this.text(0, y, str, 2, 'crimsonDark');
    return y + t.displayHeight + 10;
  }

  // --- tab: profile --------------------------------------------------------

  private buildProfile(): number {
    let y = this.sectionHeader(0, 'PROFILE');
    const bio = this.text(0, y, PERSON.bio, 3, 'ink', REGION.w);
    y += bio.displayHeight + 26;
    y = this.sectionHeader(y, 'CONTACT  (opens in a new tab)');
    const rowH = 52;
    for (const c of CONTACTS) {
      const rect = { x: 0, y, w: REGION.w, h: rowH };
      const label = this.text(48, y + 14, c.label, 3, 'crimson');
      const value = this.text(48 + 180, y + 14, c.value, 3, 'ink');
      this.rowSel(
        rect,
        [
          { label, idle: 'crimson' },
          { label: value, idle: 'ink' },
        ],
        () => {
          getAudio().playSfx('confirm');
          window.open(c.url, '_blank', 'noopener,noreferrer');
        },
      );
      y += rowH + 8;
    }
    return y;
  }

  // --- tab: inventory ------------------------------------------------------

  private buildInventory(): number {
    const leftW = 330;
    const rightX = leftW + 24;
    const rightW = REGION.w - rightX;
    const rowH = 64;
    const itemH = 38;
    const maxItems = Math.max(...SKILL_POUCHES.map((p) => p.items.length));
    const rightH = 84 + maxItems * itemH + 12;

    const panel = this.put(this.add.graphics());
    panel.fillStyle(hex('creamLight'), 0.6).fillRoundedRect(rightX, 0, rightW, rightH, 8);
    panel.lineStyle(2, hex('creamShadow'), 1).strokeRoundedRect(rightX, 0, rightW, rightH, 8);

    let y = 0;
    SKILL_POUCHES.forEach((pouch) => {
      const rect = { x: 0, y, w: leftW, h: rowH };
      const label = this.text(72, y + (rowH - 24) / 2, pouch.name, 3, 'ink');
      this.rowSel(rect, [{ label, idle: 'ink' }], () => getAudio().playSfx('confirm'), {
        onSelect: () => this.showPouch(pouch.id, rightX, rightW),
        draw: (g) => {
          // A little satchel: leather body, flap and a crimson tie.
          const bx = rect.x + 32;
          const by = rect.y + 18;
          g.fillStyle(hex('wood'), 1).fillRoundedRect(bx, by + 6, 30, 26, 6);
          g.fillStyle(hex('woodLight'), 1).fillRoundedRect(bx + 2, by, 26, 14, 6);
          g.fillStyle(hex('crimson'), 1).fillRect(bx + 12, by + 10, 6, 10);
          g.lineStyle(2, hex('woodDark'), 1).strokeRoundedRect(bx, by + 6, 30, 26, 6);
        },
      });
      y += rowH + 10;
    });
    return Math.max(y, rightH);
  }

  private showPouch(id: string, x: number, w: number): void {
    for (const o of this.pouchObjs) o.destroy();
    this.pouchObjs = [];
    const pouch = SKILL_POUCHES.find((p) => p.id === id);
    if (!pouch) return;
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.pouchObjs.push(o);
      return o;
    };
    const maxW = w - 70;
    track(this.text(x + 24, 16, pouch.name, 3, 'crimson'));
    track(this.text(x + 24, 52, `${pouch.items.length} items`, 2, 'inkSoft'));
    const g = track(this.put(this.add.graphics()));
    let y = 84;
    for (const item of pouch.items) {
      g.fillStyle(hex('crimson'), 1).fillTriangle(x + 26, y + 6, x + 26, y + 22, x + 40, y + 14);
      track(this.text(x + 52, y + 2, wrapText(item, maxW, textMetrics(this, 3).adv), 3, 'ink'));
      y += 38;
    }
  }

  // --- tab: quest log ------------------------------------------------------

  private buildQuests(): number {
    let y = this.sectionHeader(0, 'QUEST LOG');
    const textX = 64;
    const textW = REGION.w - textX - 16;
    for (const q of QUEST_LOG) {
      const detailLines = Math.max(
        1,
        wrapText(q.detail, textW, textMetrics(this, 2).adv).split('\n').length,
      );
      const cardH = 16 + 30 + 24 + detailLines * this.lineHeight(2) + 14;
      const g = this.put(this.add.graphics());
      g.fillStyle(hex('creamLight'), 0.6).fillRoundedRect(0, y, REGION.w, cardH, 8);
      g.lineStyle(2, hex('creamShadow'), 1).strokeRoundedRect(0, y, REGION.w, cardH, 8);
      // Completed badge: crimson disc with a cream tick.
      g.fillStyle(hex('crimson'), 1).fillCircle(32, y + 30, 16);
      g.lineStyle(4, hex('creamLight'), 1);
      g.lineBetween(24, y + 30, 30, y + 37);
      g.lineBetween(30, y + 37, 41, y + 23);
      this.text(textX, y + 14, q.title, 3, 'crimson');
      const tag = this.text(0, y + 18, 'COMPLETED', 2, 'creamLight');
      const tagW = Math.ceil(tag.displayWidth) + 20;
      const tagX = REGION.w - tagW - 14;
      g.fillStyle(hex('crimson'), 1).fillRoundedRect(tagX, y + 12, tagW, 28, 6);
      tag.setPosition(tagX + 10, y + 16);
      this.text(textX, y + 46, q.when, 2, 'inkSoft');
      this.text(textX, y + 70, q.detail, 2, 'ink', textW);
      y += cardH + 12;
    }
    return y;
  }

  // --- tab: map ------------------------------------------------------------

  private buildMap(): number {
    const ox = Math.floor((REGION.w - MAP_IMG_W) / 2);
    const oy = 0;
    this.put(this.add.image(ox, oy, 'minimap').setOrigin(0, 0).setScale(MAP_IMG_SCALE));
    const frame = this.put(this.add.graphics());
    frame
      .lineStyle(4, hex('crimsonDark'), 1)
      .strokeRect(ox - 2, oy - 2, MAP_IMG_W + 4, MAP_IMG_H + 4);

    this.mapCaption = this.text(0, MAP_IMG_H + 10, '', 3, 'crimson');

    const m2 = textMetrics(this, 2);
    const pinR = 12;
    const pins = MAP_MARKERS.map((mk) => ({
      mk,
      x: ox + mk.pinX * MAP_IMG_W,
      y: oy + mk.pinY * MAP_IMG_H,
    }));

    // Label placement: try eight spots around each pin and keep the one that
    // overlaps the fewest already-placed labels and pins (and stays in the panel).
    const placed: Rect[] = pins.map((p) => ({
      x: p.x - pinR - 2,
      y: p.y - pinR - 2,
      w: pinR * 2 + 4,
      h: pinR * 2 + 4,
    }));
    const labelH = 28;
    const labelRects = new Map<MapMarker, Rect>();
    const order = [...pins].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const p of order) {
      const w = [...p.mk.label].reduce((acc, ch) => acc + m2.adv(ch), 0) + 16;
      const near = pinR + 6;
      const spots: Array<[number, number]> = [
        [p.x + near, p.y - labelH / 2],
        [p.x - near - w, p.y - labelH / 2],
        [p.x - w / 2, p.y + near],
        [p.x - w / 2, p.y - near - labelH],
        [p.x + near - 4, p.y + 6],
        [p.x + near - 4, p.y - 6 - labelH],
        [p.x - near - w + 4, p.y + 6],
        [p.x - near - w + 4, p.y - 6 - labelH],
      ];
      let bestRect: Rect = { x: spots[0][0], y: spots[0][1], w, h: labelH };
      let bestPenalty = Infinity;
      spots.forEach(([sx, sy], idx) => {
        const r: Rect = { x: sx, y: sy, w, h: labelH };
        let penalty = idx * 40;
        for (const other of placed) penalty += overlapArea(r, other) * 4;
        // Keep labels inside the body region.
        if (r.x < 0) penalty += -r.x * 400;
        if (r.x + r.w > REGION.w) penalty += (r.x + r.w - REGION.w) * 400;
        if (r.y < 0) penalty += -r.y * 400;
        if (r.y + r.h > MAP_IMG_H) penalty += (r.y + r.h - MAP_IMG_H) * 400;
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestRect = r;
        }
      });
      placed.push(bestRect);
      labelRects.set(p.mk, bestRect);
    }

    for (const p of pins) {
      const lr = labelRects.get(p.mk);
      if (!lr) continue;
      const plate = this.put(this.add.graphics());
      const pin = this.put(this.add.graphics());
      const label = this.text(lr.x + 8, lr.y + 4, p.mk.label, 2, 'ink');
      const pinRect: Rect = { x: p.x - 22, y: p.y - 22, w: 44, h: 44 };
      const sel: Sel = {
        bounds: pinRect,
        hit: [pinRect, lr],
        twoTapOnTouch: true,
        activate: () => this.travel(p.mk),
        onSelect: () => this.mapCaption?.setText(`${p.mk.label}  -  Space: fast travel`),
        paint: (state) => {
          const on = state !== 'idle';
          plate.clear();
          plate.fillStyle(on ? hex('crimson') : hex('creamLight'), 0.95);
          plate.fillRoundedRect(lr.x, lr.y, lr.w, lr.h, 6);
          plate.lineStyle(2, on ? hex('crimsonDeep') : hex('crimson'), 1);
          plate.strokeRoundedRect(lr.x, lr.y, lr.w, lr.h, 6);
          setLabelColor(label, on ? 'creamLight' : 'ink');
          pin.clear();
          pin
            .fillStyle(on ? hex('flagGold') : hex('crimson'), 1)
            .fillCircle(p.x, p.y, on ? pinR + 3 : pinR);
          pin.lineStyle(3, on ? hex('crimsonDeep') : hex('creamLight'), 1);
          pin.strokeCircle(p.x, p.y, on ? pinR + 3 : pinR);
          if (on) {
            // Selected pin draws over its neighbours.
            this.body?.bringToTop(plate);
            this.body?.bringToTop(label);
            this.body?.bringToTop(pin);
          }
        },
      };
      this.sels.push(sel);
    }
    // Default selection is the first marker in data order, matching tab order.
    return MAP_IMG_H + 10 + this.lineHeight(3);
  }

  private travel(marker: MapMarker): void {
    const data = this.data_;
    if (data?.mode !== 'menu') return;
    getAudio().playSfx('confirm');
    this.close(() => data.onTravel(marker), false);
  }

  // --- tab: settings -------------------------------------------------------

  private buildSettings(): number {
    let y = this.sectionHeader(0, 'SETTINGS');
    const audio = getAudio();
    const rect = { x: 0, y, w: REGION.w, h: 68 };
    const label = this.text(48, y + 22, 'Sound', 3, 'ink');
    const yState = y + 22;
    const state = this.text(0, yState, '', 3, 'ink');
    const place = (): void => {
      state.setText(audio.soundOn ? 'ON' : 'OFF');
      state.setPosition(REGION.w - 120 - Math.ceil(state.displayWidth), yState);
    };
    this.rowSel(
      rect,
      [
        { label, idle: 'ink' },
        { label: state, idle: 'ink' },
      ],
      () => {
        audio.toggle();
        getAudio().playSfx('confirm');
        place();
        this.paintAll();
      },
      {
        draw: (g, s) => {
          // Toggle switch on the right: knob slides, track turns green-ish when on.
          const tx = rect.x + rect.w - 100;
          const ty = rect.y + 18;
          const on = audio.soundOn;
          g.fillStyle(on ? hex('leafLight') : hex('stoneDark'), 1).fillRoundedRect(
            tx,
            ty,
            80,
            32,
            16,
          );
          g.lineStyle(3, s === 'active' ? hex('creamLight') : hex('ink'), 1).strokeRoundedRect(
            tx,
            ty,
            80,
            32,
            16,
          );
          g.fillStyle(hex('creamLight'), 1).fillCircle(on ? tx + 62 : tx + 18, ty + 16, 12);
        },
      },
    );
    place();
    y += rect.h + 20;
    this.text(
      0,
      y,
      'Music and sound effects. Your choice is saved on this device and remembered next time.',
      2,
      'inkSoft',
      REGION.w,
    );
    return y + 60;
  }

  // --- tab: exit -----------------------------------------------------------

  private buildExit(): number {
    let y = this.sectionHeader(0, 'EXIT TO REGULAR PORTFOLIO');
    const body = this.text(
      0,
      y,
      'Prefer a plain page? Leave the town and open the regular version of this portfolio.',
      3,
      'ink',
      REGION.w,
    );
    y += body.displayHeight + 24;
    const rect = { x: 0, y, w: REGION.w, h: 64 };
    const label = this.text(48, y + 20, 'Exit to regular portfolio', 3, 'crimson');
    this.rowSel(rect, [{ label, idle: 'crimson' }], () => {
      getAudio().playSfx('confirm');
      this.openModal(
        'Leave the town and open the regular portfolio?',
        'Yes, leave',
        'Stay here',
        false,
        () => {
          this.closeModal();
          window.location.assign(new URL('classic.html', window.location.href).toString());
        },
        () => this.closeModal(),
      );
    });
    return y + rect.h;
  }

  // --- confirm modal -------------------------------------------------------

  private openModal(
    question: string,
    yesLabel: string,
    noLabel: string,
    defaultYes: boolean,
    onYes: () => void,
    onNo: () => void,
  ): void {
    this.closeModal();
    const W = 720;
    const PADX = 36;
    const m = textMetrics(this, 3);
    const wrapped = wrapText(question, W - PADX * 2, m.adv);
    const lines = wrapped.split('\n').length;
    const btnH = 64;
    const H =
      Math.ceil((PADX + lines * m.lineHeight + 30 + btnH + PADX) / FRAME_SCALE) * FRAME_SCALE;
    const X = Math.round((GAME_WIDTH - W) / 2);
    const Y = Math.round((GAME_HEIGHT - H) / 2);
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.modalObjs.push(o);
      return o;
    };

    const dim = track(this.add.graphics().setDepth(DEPTH.UI + 10));
    dim.fillStyle(hex('black'), 0.5).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    track(
      this.add
        .nineslice(
          X,
          Y,
          'ui-frame',
          undefined,
          W / FRAME_SCALE,
          H / FRAME_SCALE,
          FRAME_SLICE,
          FRAME_SLICE,
          FRAME_SLICE,
          FRAME_SLICE,
        )
        .setOrigin(0, 0)
        .setScale(FRAME_SCALE)
        .setDepth(DEPTH.UI + 11),
    );
    track(createLabel(this, X + PADX, Y + PADX, wrapped, 3, 'ink').setDepth(DEPTH.UI + 12));

    const btnY = Y + H - PADX - btnH;
    const btnW = (W - PADX * 2 - 20) / 2;
    const defs = [
      { text: yesLabel, yes: true },
      { text: noLabel, yes: false },
    ];
    this.modalButtons = defs.map((d, i) => {
      const rect: Rect = { x: X + PADX + i * (btnW + 20), y: btnY, w: btnW, h: btnH };
      const g = track(this.add.graphics().setDepth(DEPTH.UI + 12));
      const label = track(createLabel(this, 0, 0, d.text, 3, 'ink').setDepth(DEPTH.UI + 13));
      label.setPosition(
        rect.x + (rect.w - label.displayWidth) / 2,
        rect.y + (rect.h - m.lineHeight) / 2 + 2,
      );
      return {
        rect,
        paint: (selected: boolean): void => {
          g.clear();
          if (selected) {
            g.fillStyle(hex('crimson'), 1).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
            g.lineStyle(3, hex('crimsonDeep'), 1).strokeRoundedRect(
              rect.x,
              rect.y,
              rect.w,
              rect.h,
              8,
            );
          } else {
            g.fillStyle(hex('creamLight'), 0.8).fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 8);
            g.lineStyle(2, hex('creamShadow'), 1).strokeRoundedRect(
              rect.x,
              rect.y,
              rect.w,
              rect.h,
              8,
            );
          }
          setLabelColor(label, selected ? 'creamLight' : 'ink');
        },
        choose: (): void => this.chooseModal(d.yes),
      };
    });
    this.modalSel = defaultYes ? 0 : 1;
    this.modalButtons.forEach((b, i) => b.paint(i === this.modalSel));
    this.modalOnYes = onYes;
    this.modalOnNo = onNo;
  }

  private moveModalSel(dir: Direction): void {
    if (dir === 'up' || dir === 'down') return;
    const next = dir === 'left' ? 0 : 1;
    if (next === this.modalSel) return;
    getAudio().playSfx('menu');
    this.modalSel = next;
    this.modalButtons.forEach((b, i) => b.paint(i === this.modalSel));
  }

  private chooseModal(yes: boolean): void {
    const fn = yes ? this.modalOnYes : this.modalOnNo;
    getAudio().playSfx(yes ? 'confirm' : 'back');
    if (this.data_?.mode === 'confirm') {
      // Standalone confirm (tour guide): close the overlay, then report the answer.
      this.close(fn ?? undefined, false);
    } else {
      fn?.();
    }
  }

  private closeModal(): void {
    for (const o of this.modalObjs) o.destroy();
    this.modalObjs = [];
    this.modalButtons = [];
    this.modalOnYes = null;
    this.modalOnNo = null;
  }

  // --- close ---------------------------------------------------------------

  /** Resumes the World, stops this scene, then runs `after` (e.g. fast travel). */
  private close(after?: () => void, sfx = true): void {
    if (this.closing) return;
    this.closing = true;
    if (sfx) getAudio().playSfx('back');
    this.scene.resume(SCENES.WORLD);
    this.scene.bringToTop(SCENES.UI);
    this.scene.stop();
    after?.();
  }

  private onShutdown(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.pad?.destroy();
    this.pad = undefined;
    this.closeModal();
    this.body?.clearMask(true);
    this.maskG?.destroy();
    this.maskG = undefined;
  }
}
