import { useCallback, useEffect, useState } from 'react'
import type { PlaylistMeta, Track, User } from './types'
import {
  clearTokens,
  handleCallback,
  hasModifyScopes,
  isCallback,
  loadTokens,
  startAuth,
} from './lib/auth'
import {
  backfillPreviews,
  getCurrentUser,
  getPlaylistMeta,
  getPlaylistTracks,
  reorderPlaylist,
} from './lib/spotify'
import { clearSession, loadSession, saveSession, SESSION_VERSION } from './lib/persist'
import { parsePlaylistId } from './lib/parsePlaylistInput'
import { useRankingSession } from './hooks/useRankingSession'
import { LoginView } from './components/LoginView'
import { SetupView } from './components/SetupView'
import { DuelView } from './components/DuelView'
import { ResultsView } from './components/ResultsView'

type Phase = 'loading' | 'login' | 'setup' | 'duel'

/** Maps the app phase to the URL path shown in the address bar. */
function phaseToPath(phase: Phase, done: boolean): string {
  if (phase === 'duel') return done ? '/results' : '/duels'
  return '/'
}

function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [playlist, setPlaylist] = useState<PlaylistMeta | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [authError, setAuthError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingPlaylist, setLoadingPlaylist] = useState(false)
  const [canModify, setCanModify] = useState(false)
  const [previewNote, setPreviewNote] = useState<string | null>(null)

  const {
    state: rankState,
    left,
    right,
    result,
    totalDuels,
    progress,
    canUndo,
    start,
    pick,
    undo,
  } = useRankingSession()

  // Bootstrap: finish a PKCE callback or restore an existing sign-in.
  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        // Capture the path we landed on *before* the OAuth callback strips its
        // query string, so we can honor /duels or /results deep links.
        const initialPath = window.location.pathname
        if (isCallback()) await handleCallback()

        const tokens = loadTokens()
        if (!tokens) {
          if (!cancelled) setPhase('login')
          return
        }
        if (!cancelled) setCanModify(hasModifyScopes(tokens))

        const me = await getCurrentUser()
        if (cancelled) return
        setUser(me)

        const session = loadSession()
        if (session && session.tracks.length > 0) {
          setPlaylist(session.playlist)
          setTracks(session.tracks)
          start(session.tracks, session.rankState)
          // Honor an explicit deep link to /duels or /results; otherwise resume
          // an unfinished duel, or drop to setup if it's already complete.
          if (initialPath === '/results' || initialPath === '/duels') {
            setPhase('duel')
          } else {
            setPhase(session.rankState.done ? 'setup' : 'duel')
          }
        } else {
          setPhase('setup')
        }
      } catch (e) {
        if (!cancelled) {
          setAuthError(e instanceof Error ? e.message : 'Failed to sign in.')
          setPhase('login')
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [start])

  // Persist progress (including the finished ranking) so a refresh resumes at
  // the right URL. The session is only cleared when the user starts a new
  // playlist, quits, or signs out.
  useEffect(() => {
    if (phase !== 'duel' || !playlist || tracks.length === 0) return
    saveSession({ version: SESSION_VERSION, playlist, tracks, rankState })
  }, [phase, playlist, tracks, rankState])

  // Keep the address bar in sync with the current view (e.g. /duels, /results).
  // Skipped during 'loading' so we never clobber the OAuth ?code=... on /callback.
  useEffect(() => {
    if (phase === 'loading') return
    const target = phaseToPath(phase, rankState.done)
    if (window.location.pathname !== target) {
      window.history.replaceState(null, '', target)
    }
  }, [phase, rankState.done])

  const handleLogin = useCallback(async () => {
    setAuthError(null)
    try {
      await startAuth()
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Failed to start login.')
    }
  }, [])

  const handleLoadPlaylist = useCallback(
    async (input: string) => {
      setLoadError(null)
      const id = parsePlaylistId(input)
      if (!id) {
        setLoadError('Could not find a playlist ID in that link. Paste a Spotify playlist URL, URI, or ID.')
        return
      }

      setLoadingPlaylist(true)
      setPreviewNote(null)
      try {
        const [meta, list] = await Promise.all([getPlaylistMeta(id), getPlaylistTracks(id)])
        if (list.length === 0) {
          setLoadError("That playlist has no playable tracks (local files and podcast episodes aren't supported).")
          return
        }

        // Some preview_urls are missing from the playlist response but present
        // on the per-track endpoint — fill those gaps before starting.
        const withPreviews = await backfillPreviews(list)
        const withPreviewCount = withPreviews.filter((t) => t.previewUrl).length
        const missingCount = withPreviews.length - withPreviewCount
        if (missingCount > 0) {
          setPreviewNote(
            `${missingCount} of ${withPreviews.length} songs have no preview clip available (Spotify deprecated preview_url), so they won't show a ▶ button.`,
          )
        }

        setPlaylist(meta)
        setTracks(withPreviews)
        start(withPreviews)
        clearSession()
        setPhase('duel')
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Failed to load playlist.')
      } finally {
        setLoadingPlaylist(false)
      }
    },
    [start],
  )

  const handleLogout = useCallback(() => {
    clearTokens()
    clearSession()
    setUser(null)
    setPlaylist(null)
    setTracks([])
    setAuthError(null)
    setCanModify(false)
    setPhase('login')
  }, [])

  const handleQuit = useCallback(() => {
    clearSession()
    setPlaylist(null)
    setTracks([])
    setLoadError(null)
    setPreviewNote(null)
    setPhase('setup')
  }, [])

  const handleRestart = useCallback(() => {
    start(tracks)
    setPhase('duel')
  }, [start, tracks])

  const handleTie = useCallback(() => {
    pick(Math.random() < 0.5 ? 'left' : 'right')
  }, [pick])

  const handleSaveRanking = useCallback(async () => {
    if (!playlist || !result) return
    await reorderPlaylist(
      playlist.id,
      result.map((t) => t.uri),
    )
  }, [playlist, result])

  if (phase === 'loading') {
    return (
      <div className="view view--centered">
        <div className="spinner" aria-label="Loading" />
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (phase === 'login') {
    return <LoginView busy={false} error={authError} onLogin={handleLogin} />
  }

  if (phase === 'setup') {
    return (
      <SetupView
        userDisplayName={user?.displayName ?? 'Spotify user'}
        loading={loadingPlaylist}
        error={loadError}
        previewNote={previewNote}
        onLoad={handleLoadPlaylist}
        onLogout={handleLogout}
      />
    )
  }

  // 'duel' covers both the active duel and, once rankState.done, the results.
  if (phase === 'duel') {
    if (rankState.done) {
      return (
        <ResultsView
          ranking={result ?? []}
          wins={rankState.wins}
          battles={rankState.battles}
          canModify={canModify}
          onSave={handleSaveRanking}
          onRestart={handleRestart}
          onNewPlaylist={handleQuit}
        />
      )
    }

    if (!left || !right) return null

    return (
      <DuelView
        left={left}
        right={right}
        duelCount={rankState.duelCount}
        totalDuels={totalDuels}
        progress={progress}
        canUndo={canUndo}
        onPick={pick}
        onTie={handleTie}
        onUndo={undo}
        onQuit={handleQuit}
      />
    )
  }

  return null
}

export default App
