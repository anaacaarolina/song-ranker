interface LoginViewProps {
  busy: boolean
  error: string | null
  onLogin: () => void
}

export function LoginView({ busy, error, onLogin }: LoginViewProps) {
  return (
    <div className="view view--centered">
      <div className="panel">
        <h1 className="brand">Song Ranker</h1>
        <p className="muted">
          Rank your Spotify playlist one duel at a time. Pick a song, repeat, get a perfect ranking.
        </p>

        {error && <div className="error">{error}</div>}

        <button type="button" className="btn btn--primary btn--large" onClick={onLogin} disabled={busy}>
          {busy ? 'Connecting…' : 'Connect to Spotify'}
        </button>
      </div>
    </div>
  )
}
