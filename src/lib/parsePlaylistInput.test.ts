import { describe, expect, it } from 'vitest'
import { parsePlaylistId } from './parsePlaylistInput'

const ID = '3cEYpjA9oz9GiPac4AsH4n'

describe('parsePlaylistId', () => {
  it('parses a full Spotify web URL', () => {
    expect(parsePlaylistId(`https://open.spotify.com/playlist/${ID}?si=abc123`)).toBe(ID)
  })

  it('parses a share URL without query', () => {
    expect(parsePlaylistId(`https://open.spotify.com/playlist/${ID}`)).toBe(ID)
  })

  it('parses a URI', () => {
    expect(parsePlaylistId(`spotify:playlist:${ID}`)).toBe(ID)
  })

  it('parses a raw 22-char id', () => {
    expect(parsePlaylistId(ID)).toBe(ID)
  })

  it('trims surrounding whitespace', () => {
    expect(parsePlaylistId(`  https://open.spotify.com/playlist/${ID}  `)).toBe(ID)
  })

  it('returns null for garbage input', () => {
    expect(parsePlaylistId('hello world')).toBeNull()
    expect(parsePlaylistId('')).toBeNull()
    expect(parsePlaylistId('https://open.spotify.com/artist/1234')).toBeNull()
  })
})
