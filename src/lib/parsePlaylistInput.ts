/**
 * Extracts a Spotify playlist ID from a pasted URL, URI, or raw ID.
 * Accepts:
 *   - https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n?si=...
 *   - spotify:playlist:3cEYpjA9oz9GiPac4AsH4n
 *   - 3cEYpjA9oz9GiPac4AsH4n
 */

const URL_PATTERN = /(?:open\.spotify\.com|spotify\.com)\/playlist\/([A-Za-z0-9]+)/
const URI_PATTERN = /spotify:playlist:([A-Za-z0-9]+)/
const RAW_PATTERN = /^([A-Za-z0-9]{22})$/

export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const urlMatch = trimmed.match(URL_PATTERN)
  if (urlMatch) return urlMatch[1]

  const uriMatch = trimmed.match(URI_PATTERN)
  if (uriMatch) return uriMatch[1]

  const rawMatch = trimmed.match(RAW_PATTERN)
  if (rawMatch) return rawMatch[1]

  return null
}
