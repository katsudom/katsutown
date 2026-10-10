/**
 * Always-on overlay: dialogue box + project card, interact prompt, location
 * banner and touch controls. Runs unzoomed in the full 960x720 space.
 *
 * Nothing here is positioned in CSS or window pixels, only in game space, so
 * the FIT-scaled canvas keeps every element on screen at any aspect ratio.
 */
import Phaser from 'phaser';
import { FONT } from '../assets';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { hex, css, type PaletteKey } from '../palette';
import { getAudio } from '../systems/audio';
import { InputManager } from '../systems/input';
import { TouchControls, hasTouchInput } from '../systems/touch';
import type { DialoguePage, Direction, ProjectCard } from '../types';

export interface DialogueRequest {
  pages: DialoguePage[];
  /** Renders a tech-stack + links panel after the pages. */
  card?: ProjectCard;
  onDone?: () => void;
}

// --- text helpers (shared with TitleScene) ---------------------------------

/** Either a bitmap-font label or, if the font failed to load, a plain Text stand-in. */
export type Label = Phaser.GameObjects.BitmapText | Phaser.GameObjects.Text;

/** Source pixel height assumed for the stand-in font, so `scale` means the same thing. */
const FALLBACK_GLYPH_PX = 8;

function hasFont(scene: Phaser.Scene): boolean {
  return scene.cache.bitmapFont.exists(FONT.key);
}

/** Create a label at an integer `scale`, coloured from the palette. Top-left origin. */
export function createLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  scale: number,
  color: PaletteKey,
): Label {
  if (hasFont(scene)) {
    const bt = scene.add.bitmapText(x, y, FONT.key, text);
    bt.setScale(scale);
    // The generated font is white-on-transparent, so a tint is a clean recolour.
    bt.setTint(hex(color));
    return bt;
  }
  return scene.add.text(x, y, text, {
    fontFamily: 'monospace',
    fontSize: `${FALLBACK_GLYPH_PX * scale}px`,
    color: css(color),
  });
}

export function setLabelColor(label: Label, color: PaletteKey): void {
  if (label instanceof Phaser.GameObjects.BitmapText) label.setTint(hex(color));
  else label.setColor(css(color));
}

/** Phaser's typings omit `xAdvance`, which the XML parser does populate. */
interface FontData {
  size: number;
  lineHeight: number;
  chars: Record<number, { xAdvance?: number } | undefined>;
}

export interface TextMetrics {
  /** Horizontal advance of one character, in screen pixels at the given scale. */
  adv: (ch: string) => number;
  /** Line height in screen pixels at the given scale. */
  lineHeight: number;
}

export function textMetrics(scene: Phaser.Scene, scale: number): TextMetrics {
  if (hasFont(scene)) {
    const data = scene.cache.bitmapFont.get(FONT.key).data as FontData;
    const fallback = data.size * 0.6;
    return {
      adv: (ch) => (data.chars[ch.charCodeAt(0)]?.xAdvance ?? fallback) * scale,
      lineHeight: data.lineHeight * scale,
    };
  }
  const fs = FALLBACK_GLYPH_PX * scale;
  return { adv: () => fs * 0.6, lineHeight: fs * 1.35 };
}

/**
 * Greedy word-wrap to `maxWidth` pixels. `\n` in the input is a hard break.
 * A single word wider than a line is split mid-word so no line ever overflows.
 * Pure (no Phaser) so it can be unit-tested.
 */
export function wrapText(text: string, maxWidth: number, adv: (ch: string) => number): string {
  const width = (s: string): number => {
    let w = 0;
    for (const ch of s) w += adv(ch);
    return w;
  };
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (width(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') lines.push(line);
      line = '';
      // Break an over-long word into pieces that each fit.
      for (const ch of word) {
        if (width(line + ch) > maxWidth && line !== '') {
          lines.push(line);
          line = '';
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** Split already-wrapped text into screens of at most `maxLines` lines. */
export function paginate(wrapped: string, maxLines: number): string[] {
  const lines = wrapped.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    out.push(lines.slice(i, i + maxLines).join('\n'));
  }
  return out.length > 0 ? out : [''];
}

// --- layout constants ------------------------------------------------------

/** The 9-slice frame is drawn at 3x; this is the corner/edge size in SOURCE pixels. */
const FRAME_SCALE = 3;
const FRAME_SLICE = 8;

const BOX_MARGIN = 24;
const BOX_W = GAME_WIDTH - BOX_MARGIN * 2; // 912
const BOX_H = 180; // about a quarter of the screen
const BOX_X = BOX_MARGIN;
const BOX_Y = GAME_HEIGHT - 16 - BOX_H;
const BOX_PAD = 30;
const TEXT_SCALE = 3;
const CHARS_PER_SEC = 45;

type DialogueState = 'closed' | 'typing' | 'waiting' | 'card';

interface Chunk {
  speaker?: string;
  /** Pre-wrapped text; the typewriter reveals a growing prefix of this. */
  text: string;
}

interface CardRow {
  bg: Phaser.GameObjects.Graphics;
  text: Label;
  y: number;
  w: number;
  h: number;
  /** null for the Close row; undefined-free so we can tell "close" from "coming soon". */
  url: string | null;
  kind: 'link' | 'close';
}

export class UiScene extends Phaser.Scene {
  private state: DialogueState = 'closed';
  private pad?: InputManager;
  private touch?: TouchControls;
  private touchWanted = true;
  private prevDir: Direction | null = null;

  // dialogue
  private box?: Phaser.GameObjects.Container;
  private bodyText?: Label;
  private plate?: Phaser.GameObjects.Container;
  private plateText?: Label;
  private plateBg?: Phaser.GameObjects.Graphics;
  private chevron?: Phaser.GameObjects.Graphics;
  private chevronTween?: Phaser.Tweens.Tween;
  private chunks: Chunk[] = [];
  private chunkIndex = 0;
  /** Characters revealed so far. Fractional so the rate is frame-rate independent. */
  private revealed = 0;
  private current?: DialogueRequest;
  private queue: DialogueRequest[] = [];
  private maxLines = 4;
  private openedFrame = -1;
  private closedFrame = -10;

  // card
  private cardObjs: Phaser.GameObjects.GameObject[] = [];
  private cardRows: CardRow[] = [];
  private cardSel = 0;

  // prompt + banner
  private promptBox?: Phaser.GameObjects.Container;
  private promptBg?: Phaser.GameObjects.Graphics;
  private promptText?: Label;
  private promptLabel: string | null = null;
  private banner?: Phaser.GameObjects.Container;
  private bannerBg?: Phaser.GameObjects.Graphics;
  private bannerText?: Label;
  private bannerTweens: Phaser.Tweens.Tween[] = [];

  constructor() {
    super(SCENES.UI);
  }

  /** True while a dialogue or card is up (and for the rest of the frame it closed in). */
  get dialogueOpen(): boolean {
    return this.state !== 'closed' || this.game.loop.frame - this.closedFrame < 1;
  }

  create(): void {
    // World/Menu are registered after this scene is declared, so lift the overlay
    // above them explicitly.
    this.scene.bringToTop();

    this.buildDialogue();
    this.buildPrompt();
    this.buildBanner();

    this.pad = new InputManager(this);
    this.touch = new TouchControls(this, DEPTH.UI);
    this.applyTouch();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  update(_time: number, delta: number): void {
    // Always read, even when idle, so edges are consumed every frame.
    const input = this.pad?.read();
    if (!input || this.state === 'closed') {
      this.prevDir = input?.dir ?? null;
      return;
    }
    const justOpened = this.openedFrame === this.game.loop.frame;

    if (this.state === 'typing') {
      this.revealed += (CHARS_PER_SEC * delta) / 1000;
      const text = this.chunks[this.chunkIndex].text;
      if (this.revealed >= text.length) this.finishTyping();
      else this.bodyText?.setText(text.slice(0, Math.floor(this.revealed)));
      if (input.interact && !justOpened) this.finishTyping();
    } else if (this.state === 'waiting') {
      if (input.interact && !justOpened) this.nextPage();
    } else if (this.state === 'card') {
      if (input.cancel) {
        getAudio().playSfx('back');
        this.closeAll();
      } else if (input.interact && !justOpened) {
        this.activateCardRow(this.cardSel);
      } else if (input.dir && input.dir !== this.prevDir) {
        const forward = input.dir === 'right' || input.dir === 'down';
        this.moveCardSel(forward ? 1 : -1);
      }
    }
    this.prevDir = input.dir;
  }

  // --- public API ----------------------------------------------------------

  openDialogue(req: DialogueRequest): void {
    if (this.state !== 'closed') {
      this.queue.push(req);
      return;
    }
    this.current = req;
    this.openedFrame = this.game.loop.frame;
    this.prepareChunks(req.pages);
    this.chunkIndex = 0;
    this.refreshPrompt();
    this.applyTouch();
    if (this.chunks.length === 0) {
      if (req.card) this.openCard(req.card);
      else this.closeAll();
      return;
    }
    this.box?.setVisible(true);
    this.beginChunk();
  }

  showPrompt(label: string | null): void {
    this.promptLabel = label;
    this.refreshPrompt();
  }

  showBanner(title: string): void {
    const { banner, bannerText, bannerBg } = this;
    if (!banner || !bannerText || !bannerBg) return;
    this.bannerTweens.forEach((t) => t.stop());
    this.bannerTweens = [];
    bannerText.setText(title);
    const w = Math.ceil(bannerText.displayWidth) + 64;
    const h = Math.ceil(bannerText.displayHeight) + 32;
    bannerBg.clear();
    bannerBg.fillStyle(hex('cream'), 1).fillRoundedRect(-w / 2, 0, w, h, 10);
    bannerBg.lineStyle(4, hex('crimson'), 1).strokeRoundedRect(-w / 2, 0, w, h, 10);
    bannerText.setPosition(-bannerText.displayWidth / 2, 16);
    banner
      .setVisible(true)
      .setAlpha(1)
      .setPosition(GAME_WIDTH / 2, -h - 8);
    const slide = this.tweens.add({
      targets: banner,
      y: 20,
      duration: 350,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Hold ~1.6s, then fade away.
        const fade = this.tweens.add({
          targets: banner,
          alpha: 0,
          delay: 1600,
          duration: 450,
          onComplete: () => banner.setVisible(false),
        });
        this.bannerTweens.push(fade);
      },
    });
    this.bannerTweens.push(slide);
  }

  setTouchVisible(on: boolean): void {
    this.touchWanted = on;
    this.applyTouch();
  }

  // --- touch ---------------------------------------------------------------

  /** Controls hide while reading: any tap advances dialogue, and they'd cover the box. */
  private applyTouch(): void {
    this.touch?.setVisible(this.touchWanted && this.state === 'closed');
  }

  private onPointerDown(_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (this.openedFrame === this.game.loop.frame) return;
    if (this.state === 'typing') this.finishTyping();
    else if (this.state === 'waiting' && over.length === 0) this.nextPage();
  }

  // --- dialogue ------------------------------------------------------------

  private buildDialogue(): void {
    const frame = this.add
      .nineslice(
        0,
        0,
        'ui-frame',
        undefined,
        BOX_W / FRAME_SCALE,
        BOX_H / FRAME_SCALE,
        FRAME_SLICE,
        FRAME_SLICE,
        FRAME_SLICE,
        FRAME_SLICE,
      )
      .setOrigin(0, 0)
      .setScale(FRAME_SCALE);
    this.bodyText = createLabel(this, BOX_PAD, BOX_PAD, '', TEXT_SCALE, 'ink');
    const m = textMetrics(this, TEXT_SCALE);
    this.maxLines = Math.max(2, Math.floor((BOX_H - BOX_PAD * 2) / m.lineHeight));

    // Blinking "next" chevron, bottom-right.
    this.chevron = this.add.graphics();
    this.chevron.fillStyle(hex('crimson'), 1);
    this.chevron.fillTriangle(0, 0, 24, 0, 12, 14);
    this.chevron.setPosition(BOX_W - BOX_PAD - 24, BOX_H - BOX_PAD - 6).setVisible(false);
    this.chevronTween = this.tweens.add({
      targets: this.chevron,
      alpha: { from: 1, to: 0.15 },
      y: this.chevron.y + 6,
      duration: 420,
      yoyo: true,
      repeat: -1,
    });

    this.box = this.add.container(BOX_X, BOX_Y, [frame, this.bodyText, this.chevron]);
    this.box.setDepth(DEPTH.UI).setVisible(false);

    // Speaker name plate, overlapping the top-left corner of the box.
    this.plateBg = this.add.graphics();
    this.plateText = createLabel(this, 16, 8, '', TEXT_SCALE, 'cream');
    this.plate = this.add.container(BOX_X + 24, BOX_Y - 26, [this.plateBg, this.plateText]);
    this.plate.setDepth(DEPTH.UI + 1).setVisible(false);
  }

  private prepareChunks(pages: DialoguePage[]): void {
    const m = textMetrics(this, TEXT_SCALE);
    const maxW = BOX_W - BOX_PAD * 2 - m.adv('M'); // one glyph of slack at the right edge
    this.chunks = pages.flatMap((p) =>
      // A page that wraps past the box is split into several screens rather than clipped.
      paginate(wrapText(p.text, maxW, m.adv), this.maxLines).map((text) => ({
        speaker: p.speaker,
        text,
      })),
    );
  }

  /**
   * Typewriter state machine:
   *   closed --open--> typing --(all chars shown | interact)--> waiting
   *   waiting --interact--> typing (next chunk) | card | closed
   * Interact while typing never skips a page: it only reveals the rest of this one.
   */
  private beginChunk(): void {
    const chunk = this.chunks[this.chunkIndex];
    this.revealed = 0;
    this.bodyText?.setText('');
    this.chevron?.setVisible(false);
    this.state = 'typing';
    this.applyTouch();
    if (chunk.speaker) this.showPlate(chunk.speaker);
    else this.plate?.setVisible(false);
    if (chunk.text.length === 0) this.finishTyping();
  }

  private finishTyping(): void {
    const chunk = this.chunks[this.chunkIndex];
    this.bodyText?.setText(chunk.text);
    this.revealed = chunk.text.length;
    this.state = 'waiting';
    this.chevron?.setVisible(true);
  }

  private nextPage(): void {
    getAudio().playSfx('menu');
    if (this.chunkIndex < this.chunks.length - 1) {
      this.chunkIndex++;
      this.beginChunk();
    } else if (this.current?.card) {
      this.openCard(this.current.card);
    } else {
      this.closeAll();
    }
  }

  private showPlate(name: string): void {
    const { plate, plateBg, plateText } = this;
    if (!plate || !plateBg || !plateText) return;
    plateText.setText(name);
    const w = Math.ceil(plateText.displayWidth) + 32;
    const h = Math.ceil(plateText.displayHeight) + 16;
    plateBg.clear();
    plateBg.fillStyle(hex('crimson'), 1).fillRoundedRect(0, 0, w, h, 6);
    plateBg.lineStyle(3, hex('creamLight'), 1).strokeRoundedRect(0, 0, w, h, 6);
    plate.setVisible(true);
  }

  private closeAll(): void {
    this.box?.setVisible(false);
    this.plate?.setVisible(false);
    this.destroyCard();
    const done = this.current?.onDone;
    this.current = undefined;
    this.state = 'closed';
    this.closedFrame = this.game.loop.frame;
    this.refreshPrompt();
    this.applyTouch();
    // onDone may itself open a new dialogue, so run it after state is reset.
    done?.();
    const next = this.queue.shift();
    if (next && this.state === 'closed') this.openDialogue(next);
  }

  // --- project card --------------------------------------------------------

  private openCard(card: ProjectCard): void {
    this.box?.setVisible(false);
    this.plate?.setVisible(false);
    this.state = 'card';
    this.prevDir = null;
    this.buildCard(card);
    this.applyTouch();
  }

  private buildCard(card: ProjectCard): void {
    this.destroyCard();
    const W = 840;
    const PAD = 33;
    const innerW = W - PAD * 2;
    const children: Phaser.GameObjects.GameObject[] = [];
    const m3 = textMetrics(this, 3);
    const m2 = textMetrics(this, 2);

    const dim = this.add.graphics().setDepth(DEPTH.UI + 2);
    dim.fillStyle(hex('black'), 0.55).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cardObjs.push(dim);

    let y = PAD;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      children.push(o);
      return o;
    };
    const text = (str: string, scale: 2 | 3, color: PaletteKey, x = PAD, wrapW = innerW): Label => {
      const m = scale === 3 ? m3 : m2;
      return add(createLabel(this, x, y, wrapText(str, wrapW, m.adv), scale, color));
    };

    const title = text(card.title, 3, 'crimson');
    y += title.displayHeight + 10;
    const tag = text(card.tagline, 2, 'inkSoft');
    y += tag.displayHeight + 22;

    const techHead = text('TECH', 2, 'crimsonDark');
    y += techHead.displayHeight + 10;
    // Tech chips, flowed onto as many rows as needed.
    const chipH = Math.ceil(m2.lineHeight) + 14;
    let cx = PAD;
    const chipG = add(this.add.graphics());
    for (const tech of card.tech) {
      let tw = 0;
      for (const ch of tech) tw += m2.adv(ch);
      const w = Math.ceil(tw) + 24;
      if (cx + w > PAD + innerW && cx > PAD) {
        cx = PAD;
        y += chipH + 8;
      }
      chipG.fillStyle(hex('creamDark'), 1).fillRoundedRect(cx, y, w, chipH, 8);
      chipG.lineStyle(2, hex('crimsonDark'), 1).strokeRoundedRect(cx, y, w, chipH, 8);
      add(createLabel(this, cx + 12, y + 7, tech, 2, 'ink'));
      cx += w + 10;
    }
    y += chipH + 24;

    const linkHead = text('LINKS', 2, 'crimsonDark');
    y += linkHead.displayHeight + 10;

    // Rows: each real link, each "coming soon" link (muted, unselectable), then Close.
    const rowH = Math.ceil(m3.lineHeight) + 20;
    const rowDefs: { label: string; url: string | null; kind: 'link' | 'close' }[] = [
      ...card.links.map((l) => ({ label: l.label, url: l.url, kind: 'link' as const })),
      { label: 'Close', url: null, kind: 'close' as const },
    ];
    const rows: CardRow[] = [];
    for (const def of rowDefs) {
      const soon = def.kind === 'link' && def.url === null;
      const bg = add(this.add.graphics());
      const label = soon ? `${def.label}  (link coming soon)` : def.label;
      const t = add(
        createLabel(
          this,
          PAD + 44,
          y + 10,
          wrapText(label, innerW - 56, m3.adv).split('\n')[0],
          3,
          'ink',
        ),
      );
      if (soon) t.setAlpha(0.5);
      const row: CardRow = { bg, text: t, y, w: innerW, h: rowH, url: def.url, kind: def.kind };
      if (!soon) {
        const zone = add(this.add.zone(PAD, y, innerW, rowH).setOrigin(0, 0));
        zone.setInteractive({ useHandCursor: true });
        const index = rows.length;
        // Hover moves the highlight; a tap/click selects and activates in one go.
        zone.on(Phaser.Input.Events.POINTER_OVER, () => this.setCardSel(index));
        zone.on(Phaser.Input.Events.POINTER_DOWN, () => {
          this.setCardSel(index);
          this.activateCardRow(index);
        });
      }
      rows.push(row);
      y += rowH + 8;
    }
    this.cardRows = rows;

    const hasLinks = rows.some((r) => r.kind === 'link' && r.url !== null);
    // Touch players have no arrow keys, Space or Esc, so name the gestures instead.
    const touch = hasTouchInput();
    const hintText = hasLinks
      ? touch
        ? 'Tap a link to open   Tap Close to dismiss'
        : 'Arrows: choose   Space: open   Esc: close'
      : touch
        ? 'Tap Close to dismiss'
        : 'Space or Esc: close';
    const hint = text(hintText, 2, 'inkSoft');
    hint.setAlpha(0.7);
    y += hint.displayHeight + PAD;

    // Frame goes behind everything; size is rounded to a multiple of the frame scale.
    const H = Math.ceil(y / FRAME_SCALE) * FRAME_SCALE;
    const frame = this.add
      .nineslice(
        0,
        0,
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
      .setScale(FRAME_SCALE);
    const container = this.add.container(
      Math.round((GAME_WIDTH - W) / 2),
      Math.max(16, Math.round((GAME_HEIGHT - H) / 2)),
      [frame, ...children],
    );
    container.setDepth(DEPTH.UI + 3);
    this.cardObjs.push(container);

    // Default highlight: first real link, else Close.
    const firstReal = rows.findIndex((r) => r.kind === 'link' && r.url !== null);
    this.cardSel = firstReal >= 0 ? firstReal : rows.length - 1;
    this.paintCardRows();
  }

  private selectableIndices(): number[] {
    return this.cardRows
      .map((r, i) => (r.kind === 'close' || r.url !== null ? i : -1))
      .filter((i) => i >= 0);
  }

  private moveCardSel(step: 1 | -1): void {
    const sel = this.selectableIndices();
    const pos = sel.indexOf(this.cardSel);
    const next = sel[(pos + step + sel.length) % sel.length];
    this.setCardSel(next);
  }

  private setCardSel(index: number): void {
    if (index === this.cardSel) return;
    this.cardSel = index;
    getAudio().playSfx('menu');
    this.paintCardRows();
  }

  /** The selected row is a solid crimson bar with cream text and an arrow: unmissable. */
  private paintCardRows(): void {
    const PAD_X = 33;
    this.cardRows.forEach((r, i) => {
      const selected = i === this.cardSel;
      const selectable = r.kind === 'close' || r.url !== null;
      r.bg.clear();
      if (selected) {
        r.bg.fillStyle(hex('crimson'), 1).fillRoundedRect(PAD_X, r.y, r.w, r.h, 8);
        r.bg.lineStyle(3, hex('crimsonDeep'), 1).strokeRoundedRect(PAD_X, r.y, r.w, r.h, 8);
        r.bg.fillStyle(hex('creamLight'), 1);
        const ay = r.y + r.h / 2;
        r.bg.fillTriangle(PAD_X + 14, ay - 10, PAD_X + 14, ay + 10, PAD_X + 32, ay);
        setLabelColor(r.text, 'creamLight');
      } else {
        r.bg
          .lineStyle(2, hex('creamShadow'), selectable ? 1 : 0.4)
          .strokeRoundedRect(PAD_X, r.y, r.w, r.h, 8);
        setLabelColor(r.text, 'ink');
      }
    });
  }

  private activateCardRow(index: number): void {
    const row = this.cardRows[index];
    if (!row) return;
    if (row.kind === 'close') {
      getAudio().playSfx('back');
      this.closeAll();
    } else if (row.url !== null) {
      getAudio().playSfx('confirm');
      window.open(row.url, '_blank', 'noopener,noreferrer');
    }
    // url === null ("coming soon") rows are never selectable, so nothing to do.
  }

  private destroyCard(): void {
    this.cardObjs.forEach((o) => o.destroy());
    this.cardObjs = [];
    this.cardRows = [];
  }

  // --- prompt + banner -----------------------------------------------------

  private buildPrompt(): void {
    this.promptBg = this.add.graphics();
    this.promptText = createLabel(this, 0, 0, '', 3, 'ink');
    this.promptBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 84, [
      this.promptBg,
      this.promptText,
    ]);
    this.promptBox.setDepth(DEPTH.UI).setVisible(false);
  }

  private refreshPrompt(): void {
    const { promptBox, promptBg, promptText } = this;
    if (!promptBox || !promptBg || !promptText) return;
    const label = this.promptLabel;
    if (label === null || this.state !== 'closed') {
      promptBox.setVisible(false);
      return;
    }
    promptText.setText(label);
    const w = Math.ceil(promptText.displayWidth) + 40;
    const h = Math.ceil(promptText.displayHeight) + 24;
    promptBg.clear();
    promptBg.fillStyle(hex('cream'), 1).fillRoundedRect(-w / 2, 0, w, h, h / 2);
    promptBg.lineStyle(3, hex('crimson'), 1).strokeRoundedRect(-w / 2, 0, w, h, h / 2);
    promptText.setPosition(-promptText.displayWidth / 2, 12);
    promptBox.setVisible(true);
  }

  private buildBanner(): void {
    this.bannerBg = this.add.graphics();
    this.bannerText = createLabel(this, 0, 0, '', 3, 'crimson');
    this.banner = this.add.container(GAME_WIDTH / 2, -100, [this.bannerBg, this.bannerText]);
    this.banner.setDepth(DEPTH.UI + 1).setVisible(false);
  }

  // --- teardown ------------------------------------------------------------

  private onShutdown(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.bannerTweens.forEach((t) => t.stop());
    this.bannerTweens = [];
    this.chevronTween?.stop();
    this.destroyCard();
    this.touch?.destroy();
    this.touch = undefined;
    this.pad?.destroy();
    this.pad = undefined;
    this.state = 'closed';
    this.queue = [];
    this.current = undefined;
  }
}
