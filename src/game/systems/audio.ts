/**
 * Synthesised chiptune. No audio files ship: everything here is oscillators and
 * noise through the raw Web Audio API.
 *
 * Signal graph:
 *   voice -> track gain (per track, for cross-fades) -> lowpass -> master -> out
 *   sfx   -> lowpass -> master -> out
 *
 * Music scheduling: a single lookahead scheduler per track. A timer wakes every
 * TICK_MS and schedules every step whose start time falls inside the next
 * LOOKAHEAD_S of audio-clock time. The audio clock (not setTimeout) decides
 * timing, so jitter in the timer never makes the beat wobble, and because the
 * step clock just keeps counting while the step index wraps, loops are
 * sample-accurate and seamless.
 */
import type { MusicTrack, SfxName } from '../types';
import { loadSettings, saveSettings, type GameSettings } from './settings';

// --- note maths (pure; exported for the throwaway tests) -------------------

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" -> 440. Supports sharps ("F#5") and flats ("Bb3"). Returns null for rests / bad names. */
export function noteToFreq(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const base = SEMITONE[m[1]];
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const midi = (Number(m[3]) + 1) * 12 + base + accidental;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** [note name, duration in eighth-note steps]. Name "R" is a rest; K/S/H are drum hits. */
export type Note = readonly [name: string, steps: number];

type Wave = 'square' | 'triangle' | 'pulse' | 'drums';

interface Channel {
  wave: Wave;
  gain: number;
  /** Seconds to fall from peak to `sustain` (fraction of peak). */
  decay: number;
  sustain: number;
  notes: Note[];
}

interface TrackDef {
  /** Quarter-note tempo. One step = one eighth note. */
  bpm: number;
  channels: Channel[];
}

/** "E5:3 G5:1 R:4" -> notes. */
function bar(src: string): Note[] {
  return src
    .trim()
    .split(/\s+/)
    .map((tok): Note => {
      const [name, dur] = tok.split(':');
      return [name, Number(dur)];
    });
}

function bars(...srcs: string[]): Note[] {
  return srcs.flatMap(bar);
}

interface Chord {
  root: string;
  fifth: string;
  tones: [string, string, string];
}

const CHORDS: Record<string, Chord> = {
  C: { root: 'C3', fifth: 'G3', tones: ['C4', 'E4', 'G4'] },
  Am: { root: 'A2', fifth: 'E3', tones: ['A3', 'C4', 'E4'] },
  F: { root: 'F2', fifth: 'C3', tones: ['F3', 'A3', 'C4'] },
  G: { root: 'G2', fifth: 'D3', tones: ['G3', 'B3', 'D4'] },
  Em: { root: 'E2', fifth: 'B2', tones: ['E3', 'G3', 'B3'] },
  D: { root: 'D3', fifth: 'A3', tones: ['D4', 'F#4', 'A4'] },
  A: { root: 'A2', fifth: 'E3', tones: ['A3', 'C#4', 'E4'] },
  Bm: { root: 'B2', fifth: 'F#3', tones: ['B3', 'D4', 'F#4'] },
};

function chord(name: string): Chord {
  return CHORDS[name] ?? CHORDS.C;
}

/** Bass: root/fifth bounce or long halves, 8 eighths per bar. */
function bassLine(prog: string[], style: 'bounce' | 'half'): Note[] {
  return prog.flatMap((c): Note[] => {
    const { root, fifth } = chord(c);
    return style === 'bounce'
      ? [
          [root, 1],
          [root, 1],
          [fifth, 1],
          [root, 1],
          [root, 1],
          [root, 1],
          [fifth, 1],
          [root, 1],
        ]
      : [
          [root, 4],
          [fifth, 4],
        ];
  });
}

/** Arpeggio: chord tones up and back down; `len` is the step length of each tone. */
function arpLine(prog: string[], len: 1 | 2): Note[] {
  return prog.flatMap((c): Note[] => {
    const [a, b, d] = chord(c).tones;
    const seq = [a, b, d, b];
    const out: Note[] = [];
    for (let i = 0; i < 8 / len; i++) out.push([seq[i % 4], len]);
    return out;
  });
}

function drumLine(barCount: number, pattern: string): Note[] {
  return Array.from({ length: barCount }, () => bar(pattern)).flat();
}

const TITLE_PROG = ['C', 'Am', 'F', 'G', 'C', 'F', 'G', 'C'];
const TOWN_PROG = [
  'G',
  'Em',
  'C',
  'D',
  'G',
  'Em',
  'C',
  'D',
  'C',
  'G',
  'Am',
  'D',
  'G',
  'Em',
  'C',
  'D',
];
const INTERIOR_PROG = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'C'];
const TRAIL_PROG = ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'];

/** Exported for the throwaway tests. */
export const TRACKS: Record<MusicTrack, TrackDef> = {
  // Slow, warm, a little grand: C major, 8 bars, wide-leaping lead over rolling arpeggios.
  title: {
    bpm: 84,
    channels: [
      {
        wave: 'pulse',
        gain: 0.5,
        decay: 0.5,
        sustain: 0.55,
        notes: bars(
          'E5:3 G5:1 C6:4',
          'A5:2 G5:2 E5:4',
          'F5:3 A5:1 C6:2 A5:2',
          'B5:4 G5:2 D5:2',
          'E5:2 G5:2 C6:2 E6:2',
          'D6:3 C6:1 A5:4',
          'B5:2 A5:2 G5:2 D5:2',
          'C6:6 R:2',
        ),
      },
      { wave: 'triangle', gain: 0.45, decay: 0.4, sustain: 0.6, notes: arpLine(TITLE_PROG, 2) },
      {
        wave: 'triangle',
        gain: 0.7,
        decay: 0.8,
        sustain: 0.7,
        notes: bassLine(TITLE_PROG, 'half'),
      },
    ],
  },
  // Bright and bouncy: G major, 16 bars (A A' B A''), with a light kick/hat groove.
  town: {
    bpm: 132,
    channels: [
      {
        wave: 'pulse',
        gain: 0.4,
        decay: 0.12,
        sustain: 0.4,
        notes: bars(
          'B4:1 D5:1 G5:2 F#5:1 G5:1 B5:2',
          'G5:2 E5:1 G5:1 E5:2 B4:2',
          'E5:1 G5:1 C6:2 B5:1 C6:1 E6:2',
          'D6:2 C6:1 B5:1 A5:2 F#5:2',
          'B4:1 D5:1 G5:2 F#5:1 G5:1 B5:2',
          'G5:2 B5:2 E6:2 B5:2',
          'C6:2 B5:1 A5:1 G5:2 E5:2',
          'D5:2 F#5:2 A5:2 B5:2',
          'E5:2 G5:2 C6:2 G5:2',
          'D5:2 G5:2 B5:2 G5:2',
          'C6:2 B5:1 A5:1 E5:2 A5:2',
          'F#5:2 A5:2 D6:2 C6:1 B5:1',
          'B4:1 D5:1 G5:2 F#5:1 G5:1 B5:2',
          'G5:2 B5:2 E6:2 B5:2',
          'C6:2 B5:1 A5:1 G5:2 E5:2',
          'D5:2 F#5:2 A5:2 D6:2',
        ),
      },
      { wave: 'square', gain: 0.16, decay: 0.08, sustain: 0.3, notes: arpLine(TOWN_PROG, 1) },
      {
        wave: 'triangle',
        gain: 0.8,
        decay: 0.1,
        sustain: 0.7,
        notes: bassLine(TOWN_PROG, 'bounce'),
      },
      {
        wave: 'drums',
        gain: 0.5,
        decay: 0.05,
        sustain: 0,
        notes: drumLine(16, 'K:1 H:1 S:1 H:1 K:1 H:1 S:1 H:1'),
      },
    ],
  },
  // Quiet and sparse: A minor, 8 bars, lots of air, no drums.
  interior: {
    bpm: 76,
    channels: [
      {
        wave: 'triangle',
        gain: 0.8,
        decay: 0.5,
        sustain: 0.4,
        notes: bars(
          'E5:4 R:2 C5:2',
          'A5:3 R:1 F5:4',
          'G5:2 E5:2 R:4',
          'D5:4 B4:2 R:2',
          'C5:2 E5:2 A5:4',
          'C6:3 A5:1 F5:4',
          'G5:4 D5:2 B4:2',
          'E5:6 R:2',
        ),
      },
      { wave: 'pulse', gain: 0.14, decay: 0.3, sustain: 0.3, notes: arpLine(INTERIOR_PROG, 2) },
      {
        wave: 'triangle',
        gain: 0.55,
        decay: 0.8,
        sustain: 0.6,
        notes: bassLine(INTERIOR_PROG, 'half'),
      },
    ],
  },
  // A climbing motif: D major, each bar's figure starts higher than the last
  // (bars 1-6 rise a step at a time), then it tips over and resets.
  trail: {
    bpm: 112,
    channels: [
      {
        wave: 'pulse',
        gain: 0.38,
        decay: 0.1,
        sustain: 0.45,
        notes: bars(
          'D5:1 F#5:1 A5:2 D5:1 F#5:1 A5:2',
          'E5:1 A5:1 C#6:2 E5:1 A5:1 C#6:2',
          'F#5:1 B5:1 D6:2 F#5:1 B5:1 D6:2',
          'G5:1 B5:1 D6:2 G5:1 B5:1 G6:2',
          'A5:1 D6:1 F#6:2 A5:1 D6:1 F#6:2',
          'C#6:1 E6:1 A6:2 C#6:1 E6:1 A6:2',
          'B5:1 D6:1 G6:2 D6:1 B5:1 G5:2',
          'A5:2 C#6:2 E6:2 E5:2',
        ),
      },
      { wave: 'square', gain: 0.14, decay: 0.08, sustain: 0.3, notes: arpLine(TRAIL_PROG, 1) },
      {
        wave: 'triangle',
        gain: 0.8,
        decay: 0.1,
        sustain: 0.7,
        notes: bassLine(TRAIL_PROG, 'bounce'),
      },
      {
        wave: 'drums',
        gain: 0.35,
        decay: 0.05,
        sustain: 0,
        notes: drumLine(8, 'K:2 H:1 H:1 S:2 H:1 H:1'),
      },
    ],
  },
};

// --- engine ----------------------------------------------------------------

/** How often the scheduler wakes, and how far ahead of the audio clock it queues notes. */
const TICK_MS = 25;
const LOOKAHEAD_S = 0.3;
const CROSSFADE_S = 0.6;
const MASTER_GAIN = 0.2;

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Shared pieces of the audio graph that every voice plugs into. */
interface Bus {
  ctx: AudioContext;
  /** Where music tracks connect (via their own gain). */
  music: AudioNode;
  /** Where sfx connect. */
  sfx: AudioNode;
  noise: AudioBuffer;
  pulse: PeriodicWave;
}

/** Pulse wave of a given duty cycle, built from its Fourier series. */
function makePulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    const amp = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    real[k] = amp * Math.cos(k * Math.PI * duty);
    imag[k] = amp * Math.sin(k * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** One pitched note: osc -> envelope gain -> dest. */
function playTone(
  bus: Bus,
  dest: AudioNode,
  wave: 'square' | 'triangle' | 'pulse' | 'sawtooth' | 'sine',
  freq: number,
  start: number,
  dur: number,
  peak: number,
  opts: { decay?: number; sustain?: number; freqEnd?: number } = {},
): void {
  const { ctx } = bus;
  const osc = ctx.createOscillator();
  if (wave === 'pulse') osc.setPeriodicWave(bus.pulse);
  else osc.type = wave;
  osc.frequency.setValueAtTime(freq, start);
  if (opts.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), start + dur);
  }
  const env = ctx.createGain();
  const end = start + dur;
  const decay = Math.min(opts.decay ?? dur, Math.max(0.01, dur - 0.03));
  const sustain = Math.max(0.0001, peak * (opts.sustain ?? 1));
  // Envelope: ~5ms attack (avoids clicks), decay to sustain, short release to silence.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.linearRampToValueAtTime(peak, start + 0.005);
  env.gain.exponentialRampToValueAtTime(sustain, start + 0.005 + decay);
  env.gain.setValueAtTime(sustain, Math.max(start + 0.006 + decay, end - 0.02));
  env.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(env).connect(dest);
  osc.start(start);
  osc.stop(end + 0.02);
}

/** A burst of filtered noise. */
function playNoise(
  bus: Bus,
  dest: AudioNode,
  start: number,
  dur: number,
  peak: number,
  filter: { type: BiquadFilterType; freq: number },
): void {
  const { ctx } = bus;
  const src = ctx.createBufferSource();
  src.buffer = bus.noise;
  const f = ctx.createBiquadFilter();
  f.type = filter.type;
  f.frequency.value = filter.freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(peak, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(env).connect(dest);
  src.start(start);
  src.stop(start + dur + 0.02);
}

/** Drum hits are named by letter in the drum channel: K kick, S snare, H hat. */
function playDrum(bus: Bus, dest: AudioNode, hit: string, t: number, vol: number): void {
  if (hit === 'K') {
    playTone(bus, dest, 'sine', 140, t, 0.12, vol * 1.3, { freqEnd: 45 });
  } else if (hit === 'S') {
    playNoise(bus, dest, t, 0.11, vol * 0.7, { type: 'highpass', freq: 1200 });
    playTone(bus, dest, 'triangle', 190, t, 0.06, vol * 0.4, { freqEnd: 120 });
  } else if (hit === 'H') {
    playNoise(bus, dest, t, 0.035, vol * 0.3, { type: 'highpass', freq: 7000 });
  }
}

/** Plays one track on a loop. Owns its own timer and its own fade gain. */
class LoopPlayer {
  private readonly gain: GainNode;
  /** stepEvents[channel][step] = the note that STARTS on that step, if any. */
  private readonly stepEvents: (Note | undefined)[][];
  private readonly loopSteps: number;
  private readonly stepDur: number;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  constructor(
    private readonly bus: Bus,
    private readonly def: TrackDef,
  ) {
    this.stepDur = 60 / def.bpm / 2;
    this.loopSteps = Math.max(
      ...def.channels.map((c) => c.notes.reduce((sum, n) => sum + n[1], 0)),
    );
    this.stepEvents = def.channels.map((c) => {
      const events: (Note | undefined)[] = new Array<Note | undefined>(this.loopSteps).fill(
        undefined,
      );
      let pos = 0;
      for (const n of c.notes) {
        if (pos < this.loopSteps) events[pos] = n;
        pos += n[1];
      }
      return events;
    });
    this.gain = bus.ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(bus.music);
  }

  /** Begin (or resume) scheduling, fading in. */
  start(fadeIn: number): void {
    const { ctx } = this.bus;
    this.pause();
    this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.06);
    this.gain.gain.cancelScheduledValues(ctx.currentTime);
    this.gain.gain.setValueAtTime(0, ctx.currentTime);
    this.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeIn);
    this.tick();
  }

  /** Stop scheduling immediately (already-queued notes are at most LOOKAHEAD_S long). */
  pause(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Cross-fade out, then tear down. */
  fadeOutAndDispose(fade: number): void {
    this.pause();
    const { ctx } = this.bus;
    const now = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + fade);
    window.setTimeout(() => this.disconnect(), fade * 1000 + 100);
  }

  /** Immediate teardown, no fade. */
  dispose(): void {
    this.pause();
    this.disconnect();
  }

  private disconnect(): void {
    try {
      this.gain.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  private tick = (): void => {
    const { ctx } = this.bus;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    while (this.nextTime < horizon) {
      this.scheduleStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      // Wrap: the clock keeps counting, only the index loops, so there is no seam.
      this.step = (this.step + 1) % this.loopSteps;
    }
    this.timer = window.setTimeout(this.tick, TICK_MS);
  };

  private scheduleStep(step: number, t: number): void {
    this.def.channels.forEach((ch, i) => {
      const note = this.stepEvents[i][step];
      if (!note || note[0] === 'R') return;
      if (ch.wave === 'drums') {
        playDrum(this.bus, this.gain, note[0], t, ch.gain);
        return;
      }
      const freq = noteToFreq(note[0]);
      if (freq === null) return;
      // Leave a hair of silence at the end so repeated notes articulate.
      const dur = note[1] * this.stepDur * 0.94;
      playTone(this.bus, this.gain, ch.wave, freq, t, dur, ch.gain, {
        decay: ch.decay,
        sustain: ch.sustain,
      });
    });
  }
}

export class AudioManager {
  private _soundOn: boolean;
  private ctx: AudioContext | null = null;
  private bus: Bus | null = null;
  private master: GainNode | null = null;
  private unlocked = false;
  private unavailable = false;
  /** What the game last asked for, so we can (re)start it once unlocked / unmuted. */
  private requested: MusicTrack | null = null;
  private playing: { track: MusicTrack; player: LoopPlayer } | null = null;
  private lastStepSfx = 0;

  constructor(settings: GameSettings) {
    this._soundOn = settings.soundOn;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  get soundOn(): boolean {
    return this._soundOn;
  }

  setSoundOn(on: boolean): void {
    if (on === this._soundOn) return;
    this._soundOn = on;
    saveSettings({ soundOn: on });
    if (!on) this.silence();
    else this.wake();
  }

  toggle(): boolean {
    this.setSoundOn(!this._soundOn);
    return this._soundOn;
  }

  /** Resume the AudioContext from a user gesture. Safe to call as often as you like. */
  unlock(): void {
    if (!this.ensureContext()) return;
    this.unlocked = true;
    if (this._soundOn) this.wake();
  }

  playMusic(track: MusicTrack): void {
    this.requested = track;
    if (this.playing?.track === track) return;
    if (!this._soundOn || !this.unlocked || !this.bus) return;
    this.startRequested(true);
  }

  stopMusic(): void {
    this.requested = null;
    if (this.playing) {
      this.playing.player.fadeOutAndDispose(0.3);
      this.playing = null;
    }
  }

  playSfx(name: SfxName): void {
    if (!this._soundOn || !this.unlocked || !this.bus) return;
    const { ctx } = this.bus;
    if (ctx.state !== 'running') return;
    const dest = this.bus.sfx;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'step': {
        // Rate-limit and detune a little so a held key never sounds like a machine gun.
        if (t - this.lastStepSfx < 0.08) return;
        this.lastStepSfx = t;
        const f = 95 + Math.random() * 35;
        playTone(this.bus, dest, 'triangle', f, t, 0.05, 0.1, { freqEnd: f * 0.7 });
        break;
      }
      case 'menu':
        playTone(this.bus, dest, 'square', 1040, t, 0.035, 0.07);
        break;
      case 'confirm':
        playTone(this.bus, dest, 'pulse', 659, t, 0.07, 0.14);
        playTone(this.bus, dest, 'pulse', 988, t + 0.07, 0.12, 0.14);
        break;
      case 'back':
        playTone(this.bus, dest, 'pulse', 659, t, 0.07, 0.13);
        playTone(this.bus, dest, 'pulse', 440, t + 0.07, 0.12, 0.13);
        break;
      case 'door':
        playNoise(this.bus, dest, t, 0.16, 0.5, { type: 'lowpass', freq: 500 });
        playTone(this.bus, dest, 'sine', 90, t, 0.14, 0.3, { freqEnd: 50 });
        break;
      case 'warp':
        playTone(this.bus, dest, 'square', 180, t, 0.4, 0.1, { freqEnd: 1800 });
        playTone(this.bus, dest, 'triangle', 90, t, 0.4, 0.14, { freqEnd: 900 });
        break;
    }
  }

  // --- internals -----------------------------------------------------------

  /** Build the audio graph once. Returns false (and stays silent) if Web Audio is missing. */
  private ensureContext(): boolean {
    if (this.bus) return true;
    if (this.unavailable) return false;
    const Ctor = getAudioCtor();
    if (!Ctor) {
      this.unavailable = true;
      return false;
    }
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      // The low-pass takes the edge off the raw square waves.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      lp.connect(master);
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.bus = {
        ctx,
        music: lp,
        sfx: lp,
        noise: makeNoise(ctx),
        pulse: makePulseWave(ctx, 0.25),
      };
      return true;
    } catch {
      this.unavailable = true;
      return false;
    }
  }

  /** Muting: kill sound NOW and stop all timers so the page idles. */
  private silence(): void {
    this.playing?.player.dispose();
    this.playing = null;
    const { ctx, master } = this;
    if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
      ctx.suspend().catch(() => undefined);
    }
  }

  /** Un-muting / unlocking: bring the context back and restart the requested track. */
  private wake(): void {
    const { ctx, master } = this;
    if (!ctx || !master || !this._soundOn) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);
    if (ctx.state === 'running') {
      if (this.requested && !this.playing) this.startNow(false);
    } else {
      ctx.resume().then(
        () => {
          if (this._soundOn && this.requested && !this.playing && ctx.state === 'running') {
            this.startNow(false);
          }
        },
        () => undefined,
      );
    }
  }

  private startRequested(crossfade: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'running') {
      this.startNow(crossfade);
      return;
    }
    // Not running yet (autoplay policy): start once resume() lands. Not re-armed on
    // failure, so a stubborn browser cannot spin us.
    ctx.resume().then(
      () => {
        if (this._soundOn && ctx.state === 'running') this.startNow(crossfade);
      },
      () => undefined,
    );
  }

  private startNow(crossfade: boolean): void {
    const bus = this.bus;
    const track = this.requested;
    if (!bus || !track) return;
    const old = this.playing;
    if (old) old.player.fadeOutAndDispose(CROSSFADE_S);
    const player = new LoopPlayer(bus, TRACKS[track]);
    player.start(old && crossfade ? CROSSFADE_S : 0.05);
    this.playing = { track, player };
  }

  /** Hidden tabs get suspended so a backgrounded game costs no CPU. */
  private onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || !this._soundOn) return;
    if (document.hidden) {
      this.playing?.player.pause();
      ctx.suspend().catch(() => undefined);
    } else {
      ctx.resume().then(
        () => {
          // Restart the loop's timer where it left off.
          this.playing?.player.start(0.1);
        },
        () => undefined,
      );
    }
  };
}

let instance: AudioManager | null = null;

export function getAudio(): AudioManager {
  if (!instance) instance = new AudioManager(loadSettings());
  return instance;
}
