/**
 * Tiny pixel-buffer toolkit used by every drawing module.
 * Colours are always palette KEYS (see src/game/palette.json), never hex.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Fixed seed: the whole generator is deterministic. */
export const SEED = 0x4b415453; // "KATS"

const palette = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/game/palette.json'), 'utf8'));
const rgbCache = new Map();

/** Resolve a palette key to [r,g,b]. Throws on unknown keys. */
export function rgb(key) {
  let v = rgbCache.get(key);
  if (!v) {
    const hex = palette[key];
    if (!hex) throw new Error(`Unknown palette key: ${key}`);
    v = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    rgbCache.set(key, v);
  }
  return v;
}

/** Seeded PRNG (mulberry32). Returns a function giving floats in [0,1). */
export function rng(seed) {
  let a = (seed ^ SEED) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash, used to derive per-asset seeds. */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4);
  }

  inb(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Set one pixel. key === null clears it. alpha is 0..255. */
  set(x, y, key, alpha = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x) * 4;
    if (key === null || key === undefined) {
      this.px[i] = this.px[i + 1] = this.px[i + 2] = this.px[i + 3] = 0;
      return;
    }
    const [r, g, b] = rgb(key);
    this.px[i] = r;
    this.px[i + 1] = g;
    this.px[i + 2] = b;
    this.px[i + 3] = alpha;
  }

  /** Set only if the pixel is still fully transparent (draw "underneath"). */
  setUnder(x, y, key, alpha = 255) {
    if (this.inb(x, y) && this.alpha(x, y) === 0) this.set(x, y, key, alpha);
  }

  alpha(x, y) {
    return this.inb(x, y) ? this.px[(y * this.w + x) * 4 + 3] : 0;
  }

  solid(x, y) {
    return this.alpha(x, y) > 0;
  }

  fillRect(x, y, w, h, key, alpha = 255) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, key, alpha);
  }

  fill(key) {
    this.fillRect(0, 0, this.w, this.h, key);
  }

  /** 1px rectangle outline. */
  rect(x, y, w, h, key, alpha = 255) {
    this.fillRect(x, y, w, 1, key, alpha);
    this.fillRect(x, y + h - 1, w, 1, key, alpha);
    this.fillRect(x, y, 1, h, key, alpha);
    this.fillRect(x + w - 1, y, 1, h, key, alpha);
  }

  /** Bresenham line (inclusive). */
  line(x0, y0, x1, y1, key, alpha = 255) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, key, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /**
   * Filled ellipse centred on (cx,cy) (floats ok). `key` may be a function
   * (x,y,nx,ny) => paletteKey | undefined to shade per pixel.
   */
  ellipse(cx, cy, rx, ry, key, alpha = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) {
          const k = typeof key === 'function' ? key(x, y, nx, ny) : key;
          if (k !== undefined) this.set(x, y, k, alpha);
        }
      }
    }
  }

  disc(cx, cy, r, key, alpha = 255) {
    this.ellipse(cx, cy, r, r, key, alpha);
  }

  /** Ring between (rx,ry) and (rx-t, ry-t). */
  ring(cx, cy, rx, ry, t, key, alpha = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const ix = (x + 0.5 - cx) / Math.max(rx - t, 0.01);
        const iy = (y + 0.5 - cy) / Math.max(ry - t, 0.01);
        if (nx * nx + ny * ny <= 1 && ix * ix + iy * iy > 1) this.set(x, y, key, alpha);
      }
    }
  }

  /** Scanline-fill a polygon (even-odd) sampled at pixel centres. */
  poly(points, key, alpha = 255) {
    const ys = points.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
          xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.set(x, y, key, alpha);
      }
    }
  }

  /** Draw ASCII art. `map` maps a character to a palette key; '.' and ' ' are skipped. */
  art(x, y, rows, map) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        const k = map[ch];
        if (k === undefined) throw new Error(`art(): no colour for '${ch}'`);
        this.set(x + i, y + j, k);
      }
    });
  }

  /** Copy opaque pixels of `src` onto this canvas. */
  blit(src, dx, dy, opts = {}) {
    const sx = opts.sx ?? 0;
    const sy = opts.sy ?? 0;
    const w = opts.w ?? src.w - sx;
    const h = opts.h ?? src.h - sy;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const fx = opts.flipX ? w - 1 - i : i;
        const si = ((sy + j) * src.w + sx + fx) * 4;
        if (src.px[si + 3] === 0) continue;
        if (dx + i < 0 || dy + j < 0 || dx + i >= this.w || dy + j >= this.h) continue;
        const di = ((dy + j) * this.w + dx + i) * 4;
        this.px[di] = src.px[si];
        this.px[di + 1] = src.px[si + 1];
        this.px[di + 2] = src.px[si + 2];
        this.px[di + 3] = src.px[si + 3];
      }
    }
  }

  /** Outer outline: transparent pixels touching an opaque one become `key`. */
  outline(key, diag = false) {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.solid(x, y)) continue;
        let hit =
          this.solid(x - 1, y) ||
          this.solid(x + 1, y) ||
          this.solid(x, y - 1) ||
          this.solid(x, y + 1);
        if (!hit && diag) {
          hit =
            this.solid(x - 1, y - 1) ||
            this.solid(x + 1, y - 1) ||
            this.solid(x - 1, y + 1) ||
            this.solid(x + 1, y + 1);
        }
        if (hit) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, key);
  }

  /**
   * Inner outline: opaque pixels bordering transparency (or, if canvasEdges, the
   * canvas edge) become `key`. Keeps art inside its exact footprint.
   */
  innerOutline(key, canvasEdges = true) {
    const mark = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.solid(x, y)) continue;
        const nb = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nx, ny] of nb) {
          const outside = !this.inb(nx, ny);
          if ((outside && canvasEdges) || (!outside && !this.solid(nx, ny))) {
            mark.push([x, y]);
            break;
          }
        }
      }
    }
    for (const [x, y] of mark) this.set(x, y, key);
  }

  /** Checkerboard dither between two keys over a rectangle. */
  dither(x, y, w, h, k1, k2, phase = 0) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) this.set(x + i, y + j, (i + j + phase) % 2 === 0 ? k1 : k2);
    }
  }

  transpose() {
    const c = new Canvas(this.h, this.w);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const s = (y * this.w + x) * 4;
        const d = (x * c.w + y) * 4;
        for (let k = 0; k < 4; k++) c.px[d + k] = this.px[s + k];
      }
    }
    return c;
  }

  /** Number of non-transparent pixels. */
  count() {
    let n = 0;
    for (let i = 3; i < this.px.length; i += 4) if (this.px[i] > 0) n++;
    return n;
  }
}

/** Write a canvas as PNG (creating folders) and print a summary line. */
export function writePng(relPath, canvas) {
  const file = path.join(ROOT, 'public', relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const png = new PNG({ width: canvas.w, height: canvas.h });
  png.data = Buffer.from(canvas.px);
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log(`wrote public/${relPath} (${canvas.w}x${canvas.h})`);
}

/** Write a text file under the project root, creating folders. */
export function writeText(relPath, text) {
  const file = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log(`wrote ${relPath}`);
}
