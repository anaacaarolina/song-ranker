import { forceRefreshToken, getValidAccessToken } from './auth'
import { loadPreviewCache, savePreviewCache } from './persist'
import type { PlaylistMeta, Track, User } from '../types'

const API = 'https://api.spotify.com/v1'

export class SpotifyApiError extends Error {
  status: number
  retryAfterSeconds: number | null

  constructor(status: number, message: string, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'SpotifyApiError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

async function rawFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${API}${path}`, { ...init, headers })
}

/** Fetches with a valid token; on 401, refreshes once and retries. */
async function request(path: string, init?: RequestInit, retried = false): Promise<Response> {
  let token = await getValidAccessToken()
  let res = await rawFetch(token, path, init)
  if (res.status === 401 && !retried) {
    token = await forceRefreshToken()
    res = await rawFetch(token, path, init)
  }
  return res
}

/**
 * Runs `asyncFn` over `items` with at most `limit` concurrent in-flight calls,
 * collecting results in input order.
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  asyncFn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await asyncFn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function expectOk(res: Response, context: 'read' | 'write' = 'read'): Promise<Response> {
  if (res.ok) return res

  if (res.status === 401) {
    throw new SpotifyApiError(401, 'Your session has expired. Please sign in again.')
  }
  if (res.status === 403) {
    const message =
      context === 'write'
        ? "Spotify denied permission to modify this playlist (403). This usually means the 'playlist-modify' permission wasn't granted when you connected. Sign out and connect again, making sure to approve all permissions."
        : 'Spotify only lets apps read playlists you own or collaborate on (403 Forbidden).'
    throw new SpotifyApiError(403, message)
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After'))
    throw new SpotifyApiError(
      429,
      'Too many requests to Spotify. Please wait a moment and try again.',
      Number.isFinite(retryAfter) ? retryAfter : null,
    )
  }

  let message = `Spotify API error (${res.status})`
  try {
    const data = (await res.json()) as { error?: { message?: string } }
    if (data?.error?.message) message = data.error.message
  } catch {
    // ignore parse errors
  }
  throw new SpotifyApiError(res.status, message)
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await request(path)
  await expectOk(res)
  return (await res.json()) as T
}

export async function getCurrentUser(): Promise<User> {
  const data = await getJSON<{
    id: string
    display_name: string | null
    images?: { url: string }[]
  }>('/me')
  return {
    id: data.id,
    displayName: data.display_name ?? data.id,
    imageUrl: data.images?.[0]?.url ?? null,
  }
}

export async function getPlaylistMeta(playlistId: string): Promise<PlaylistMeta> {
  const data = await getJSON<{
    id: string
    name: string
    owner?: { display_name?: string; id?: string }
    images?: { url: string }[]
    tracks?: { total?: number }
  }>(`/playlists/${playlistId}`)
  return {
    id: data.id,
    name: data.name || 'Untitled playlist',
    ownerName: data.owner?.display_name ?? '',
    ownerId: data.owner?.id ?? '',
    imageUrl: data.images?.[0]?.url ?? null,
    totalTracks: data.tracks?.total ?? 0,
  }
}

function toTrack(t: {
  id: string
  name?: string
  type?: string
  uri?: string
  preview_url?: string | null
  artists?: { name?: string }[]
  album?: { name?: string; images?: { url: string }[] }
  external_urls?: { spotify?: string }
}): Track {
  return {
    id: t.id,
    name: t.name ?? 'Unknown track',
    artists: (t.artists ?? []).map((a) => a.name).filter(Boolean).join(', '),
    albumName: t.album?.name ?? '',
    albumImageUrl: t.album?.images?.[0]?.url ?? null,
    previewUrl: t.preview_url ?? null,
    uri: t.uri ?? '',
    externalUrl: t.external_urls?.spotify ?? '',
  }
}

/** Paginates the (current) playlist-items endpoint, following `next`. */
export async function getPlaylistTracks(playlistId: string): Promise<Track[]> {
  const tracks: Track[] = []
  let path: string | null = `/playlists/${playlistId}/items?limit=50`

  while (path) {
    const res = await request(path)
    await expectOk(res)
    const data = (await res.json()) as {
      items?: Array<{ track?: unknown; item?: unknown }>
      next?: string | null
    }

    for (const entry of data.items ?? []) {
      // `item` is the current field; `track` is the deprecated one. Support both.
      const raw = entry.item ?? entry.track
      if (!raw || typeof raw !== 'object') continue
      const track = raw as { type?: string }
      if (track.type !== 'track') continue // skip episodes & local files
      tracks.push(toTrack(track as Parameters<typeof toTrack>[0]))
    }

    path = data.next ? data.next.replace(API, '') : null
  }

  return tracks
}

/**
 * Fills in missing previews, from fast to slow:
 *
 * 1. Per-track API endpoint (`GET /tracks/{id}`) — quick, but often still null.
 * 2. Server-side scrape fallback (`GET /api/preview`) — slow, but finds previews
 *    that the API no longer exposes (via the `spotify-preview-finder` package),
 *    with a localStorage cache so repeat loads are instant.
 */
export async function backfillPreviews(tracks: Track[]): Promise<Track[]> {
  // Pass 1: cheap per-track API lookups.
  const missing = tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.previewUrl)

  if (missing.length > 0) {
    await mapLimit(missing, 10, async ({ t, i }) => {
      let preview: string | null = null
      for (let attempt = 0; attempt < 2 && !preview; attempt++) {
        try {
          const res = await request(`/tracks/${t.id}`)
          await expectOk(res)
          const data = (await res.json()) as { preview_url?: string | null }
          preview = data.preview_url ?? null
        } catch {
          // Ignore per-track failures; we still have the scrape fallback below.
        }
      }
      if (preview) {
        tracks[i] = { ...t, previewUrl: preview }
      }
    })
  }

  // Pass 2: server-side scrape for whatever is still missing.
  const stillMissing = tracks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.previewUrl)

  if (stillMissing.length > 0) {
    const cache = loadPreviewCache()
    const toFetch: Array<{ t: Track; i: number }> = []

    for (const { t, i } of stillMissing) {
      const cached = cache[t.id]
      if (cached) {
        tracks[i] = { ...t, previewUrl: cached }
      } else {
        toFetch.push({ t, i })
      }
    }

    if (toFetch.length > 0) {
      // Scraping is slow; keep concurrency low to avoid hammering Spotify.
      await mapLimit(toFetch, 3, async ({ t, i }) => {
        const url = await fetchPreviewFromServer(t)
        if (url) {
          tracks[i] = { ...t, previewUrl: url }
          cache[t.id] = url
        }
      })
      savePreviewCache(cache)
    }
  }

  return tracks
}

/** Builds the query for the server-side preview middleware. */
function buildPreviewServerUrl(track: Track): string {
  const params = new URLSearchParams({ name: track.name })
  const firstArtist = track.artists.split(',')[0]?.trim()
  if (firstArtist) params.set('artist', firstArtist)
  if (track.id) params.set('trackId', track.id)
  return `/api/preview?${params.toString()}`
}

/** Calls the Vite middleware that runs `spotify-preview-finder` server-side. */
async function fetchPreviewFromServer(track: Track): Promise<string | null> {
  try {
    const res = await fetch(buildPreviewServerUrl(track))
    if (!res.ok) return null
    const data = (await res.json()) as { previewUrl?: string | null }
    return data.previewUrl ?? null
  } catch {
    return null
  }
}

/**
 * Reorders the playlist to match a ranking.
 *
 * For ≤100 tracks we use the "replace" operation (PUT .../items with `uris`),
 * which sets the playlist to exactly the given order in one atomic call.
 * For larger playlists (replace caps at 100 items) we clear the playlist and
 * re-add in ranked order. Either way this replaces added_at/added_by and drops
 * duplicates — the UI warns the user before calling.
 */
export async function reorderPlaylist(playlistId: string, rankedUris: string[]): Promise<void> {
  if (rankedUris.length <= 100) {
    const res = await request(`/playlists/${playlistId}/items`, {
      method: 'PUT',
      body: JSON.stringify({ uris: rankedUris }),
    })
    await expectOk(res, 'write')
    return
  }

  const existing = await getPlaylistTracks(playlistId)
  const existingUris = existing.map((t) => t.uri).filter(Boolean)

  for (let i = 0; i < existingUris.length; i += 100) {
    const chunk = existingUris.slice(i, i + 100)
    const res = await request(`/playlists/${playlistId}/items`, {
      method: 'DELETE',
      body: JSON.stringify({ items: chunk.map((uri) => ({ uri })) }),
    })
    await expectOk(res, 'write')
  }

  for (let i = 0; i < rankedUris.length; i += 100) {
    const chunk = rankedUris.slice(i, i + 100)
    const res = await request(`/playlists/${playlistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: chunk, position: i }),
    })
    await expectOk(res, 'write')
  }
}
