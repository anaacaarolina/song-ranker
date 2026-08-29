import type { PlaylistMeta, Track } from '../types'
import type { RankState } from './ranking'

/** localStorage keys, kept in one place so they never collide or drift. */
export const KEYS = {
  auth: 'sr.auth',
  verifier: 'sr.code_verifier',
  authState: 'sr.auth_state',
  session: 'sr.session',
  previewCache: 'sr.previewCache',
} as const

export const SESSION_VERSION = 1

export interface SessionData {
  version: number
  playlist: PlaylistMeta
  tracks: Track[]
  rankState: RankState
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or blocked (private mode). Non-fatal for a local tool.
  }
}

export function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function saveSession(data: SessionData): void {
  saveJSON(KEYS.session, data)
}

export function loadSession(): SessionData | null {
  const data = loadJSON<SessionData>(KEYS.session)
  if (!data || data.version !== SESSION_VERSION) return null
  return data
}

export function clearSession(): void {
  removeItem(KEYS.session)
}

/** trackId → preview URL, cached so repeat loads don't re-scrape. */
export function loadPreviewCache(): Record<string, string> {
  return loadJSON<Record<string, string>>(KEYS.previewCache) ?? {}
}

export function savePreviewCache(cache: Record<string, string>): void {
  saveJSON(KEYS.previewCache, cache)
}
