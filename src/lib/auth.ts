import { KEYS, loadJSON, removeItem, saveJSON } from './persist'

/**
 * Spotify Authorization Code with PKCE — the only browser flow Spotify supports
 * (the old Implicit Grant flow has been removed). No client secret is needed,
 * so this runs entirely in the browser.
 */

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number
  scopes: string
}

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? ''
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URL ?? ''
const SCOPES = import.meta.env.VITE_SCOPES ?? ''

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

/** 60s safety buffer so we never use a token that's about to expire. */
const EXPIRY_BUFFER_MS = 60_000

function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (x) => possible[x % possible.length]).join('')
}

function base64UrlEncode(input: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}

async function tokenRequest(body: Record<string, string>): Promise<AuthTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })

  if (!res.ok) {
    let message = `Token request failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.error_description) message = data.error_description
      else if (data?.error) message = data.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  const data = await res.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string | undefined) ?? '',
    expiresAt: Date.now() + ((data.expires_in as number | undefined) ?? 3600) * 1000,
    scopes: (data.scope as string | undefined) ?? '',
  }
}

/** Kick off login by redirecting to Spotify's authorize endpoint. */
export async function startAuth(): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('Missing VITE_SPOTIFY_CLIENT_ID — add it to your .env file.')
  }

  const verifier = generateRandomString(64)
  const challenge = await generateCodeChallenge(verifier)
  const state = generateRandomString(32)

  saveJSON(KEYS.verifier, verifier)
  saveJSON(KEYS.authState, state)

  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: REDIRECT_URI,
    state,
  }).toString()

  window.location.href = url.toString()
}

/** True if the current URL contains an authorization code (i.e. we're on the callback). */
export function isCallback(): boolean {
  return new URLSearchParams(window.location.search).has('code')
}

/** Exchange the authorization code in the URL for tokens, then clean the URL. */
export async function handleCallback(): Promise<AuthTokens> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  if (error) throw new Error(`Spotify authorization failed: ${error}`)
  if (!code) throw new Error('No authorization code found in the callback URL.')

  const storedState = loadJSON<string>(KEYS.authState)
  if (state && storedState && state !== storedState) {
    throw new Error('Authorization state mismatch. Please try signing in again.')
  }

  const verifier = loadJSON<string>(KEYS.verifier)
  if (!verifier) throw new Error('Missing PKCE code verifier. Please try signing in again.')

  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  })

  removeItem(KEYS.verifier)
  removeItem(KEYS.authState)
  saveTokens(tokens)

  // Strip ?code=...&state=... from the address bar so a refresh doesn't re-run the flow.
  window.history.replaceState(null, '', window.location.pathname)

  return tokens
}

export function saveTokens(tokens: AuthTokens): void {
  saveJSON(KEYS.auth, tokens)
}

export function loadTokens(): AuthTokens | null {
  return loadJSON<AuthTokens>(KEYS.auth)
}

/** True if the stored token grants playlist-modify access (needed for write-back). */
export function hasModifyScopes(tokens: AuthTokens | null): boolean {
  if (!tokens) return false
  const scopes = tokens.scopes.split(/\s+/).filter(Boolean)
  return scopes.some((s) => s === 'playlist-modify-public' || s === 'playlist-modify-private')
}

export function clearTokens(): void {
  removeItem(KEYS.auth)
}

export function isTokenValid(tokens: AuthTokens | null): boolean {
  return !!tokens && Date.now() < tokens.expiresAt - EXPIRY_BUFFER_MS
}

/** Returns a valid access token, silently refreshing first if needed. */
export async function getValidAccessToken(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('Not signed in.')
  if (isTokenValid(tokens)) return tokens.accessToken
  const refreshed = await refreshAccessToken(tokens)
  return refreshed.accessToken
}

/** Force a refresh (used when the API reports 401 despite a "valid" token). */
export async function forceRefreshToken(): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new Error('Not signed in.')
  const refreshed = await refreshAccessToken(tokens)
  return refreshed.accessToken
}

export async function refreshAccessToken(tokens: AuthTokens): Promise<AuthTokens> {
  if (!tokens.refreshToken) throw new Error('No refresh token available. Please sign in again.')

  const next = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: CLIENT_ID,
  })

  // Spotify may not return a new refresh token; keep the old one if absent.
  const merged: AuthTokens = {
    ...next,
    refreshToken: next.refreshToken || tokens.refreshToken,
  }

  saveTokens(merged)
  return merged
}
