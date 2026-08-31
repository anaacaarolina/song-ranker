import 'dotenv/config'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'

/**
 * Vite dev/preview middleware that exposes the Node-only `spotify-preview-finder`
 * package to the browser app. The package (CommonJS) searches Spotify and then
 * scrapes the track's public page for `p.scdn.co` preview links — something the
 * browser can't do itself (CORS), and which needs a client *secret* that must
 * never ship to the client.
 *
 * The app calls `GET /api/preview?name=...&artist=...&trackId=...` and gets back
 * `{ previewUrl }` or an error. The secret stays in `process.env`, server-side.
 */

const require = createRequire(import.meta.url)

interface PreviewResult {
  success: boolean
  searchQuery?: string
  results?: PreviewSong[]
  error?: string
}

interface PreviewSong {
  name?: string
  spotifyUrl?: string
  previewUrls: string[]
  trackId?: string
  albumName?: string
  releaseDate?: string
  popularity?: number
  durationMs?: number
}

type PreviewFinderFn = (
  songName: string,
  artistOrLimit?: string | number,
  limit?: number,
) => Promise<PreviewResult>

// The package's default export is the search function (module.exports = searchAndGetLinks).
const spotifyPreviewFinder = require('spotify-preview-finder') as PreviewFinderFn

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handlePreviewRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const name = url.searchParams.get('name') ?? ''
  const artist = url.searchParams.get('artist') ?? ''
  const trackId = url.searchParams.get('trackId') ?? ''

  if (!name) {
    sendJson(res, 400, { error: 'Missing required "name" query parameter.' })
    return
  }

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    sendJson(res, 500, {
      error: 'Server is missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET in .env.',
    })
    return
  }

  try {
    // The package ignores the limit when the artist arg is `undefined`, so pass
    // a numeric limit directly in the no-artist case.
    const result: PreviewResult = artist
      ? await spotifyPreviewFinder(name, artist, 3)
      : await spotifyPreviewFinder(name, 3)

    if (!result.success || !result.results || result.results.length === 0) {
      sendJson(res, 404, { error: result.error ?? 'No preview found.' })
      return
    }

    // Best match: exact trackId > first result that actually has a preview > first.
    const exact = trackId ? result.results.find((r) => r.trackId === trackId) : undefined
    const chosen =
      exact ?? result.results.find((r) => r.previewUrls.length > 0) ?? result.results[0]
    const previewUrl = chosen?.previewUrls[0] ?? null

    if (!previewUrl) {
      sendJson(res, 404, { error: 'No preview found.' })
      return
    }

    sendJson(res, 200, { previewUrl })
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Preview lookup failed.' })
  }
}

function install(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use('/api/preview', (req, res) => {
    // Connect does not await async handlers, so catch and finish safely here.
    void handlePreviewRequest(req, res)
  })
}

function previewMiddleware(): Plugin {
  return {
    name: 'spotify-preview-middleware',
    configureServer(server) {
      install(server)
    },
    configurePreviewServer(server) {
      install(server)
    },
  }
}

export default previewMiddleware
