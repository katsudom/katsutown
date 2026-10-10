/**
 * Persisted settings. localStorage can throw (private browsing, blocked site
 * data, quota), so every access is wrapped and falls back to defaults.
 */
import { STORAGE_KEY } from '../config';

export interface GameSettings {
  soundOn: boolean;
}

const DEFAULTS: GameSettings = { soundOn: true };

export function loadSettings(): GameSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const soundOn = (parsed as { soundOn?: unknown }).soundOn;
      return { soundOn: typeof soundOn === 'boolean' ? soundOn : DEFAULTS.soundOn };
    }
  } catch {
    // Storage unavailable or corrupt JSON: fall through to defaults.
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: GameSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Persisting is best-effort; the in-memory setting still applies.
  }
}
