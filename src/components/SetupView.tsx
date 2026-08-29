import { useState } from 'react'
import type { FormEvent } from 'react'

interface SetupViewProps {
  userDisplayName: string
  loading: boolean
  error: string | null
  previewNote: string | null
  onLoad: (input: string) => void
  onLogout: () => void
}

export function SetupView({
  userDisplayName,
  loading,
  error,
  previewNote,
  onLoad,
  onLogout,
}: SetupViewProps) {
  const [input, setInput] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (input.trim()) onLoad(input)
  }

  return (
    <div className="view view--centered">
      <div className="panel">
        <div className="panel__header">
          <h1 className="brand">Song Ranker</h1>
          <span className="user-chip">{userDisplayName}</span>
        </div>

        <p className="muted">
          Paste a Spotify playlist link (or URI) for a playlist you own or collaborate on.
        </p>

        <form onSubmit={submit} className="setup-form">
          <input
            className="text-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://open.spotify.com/playlist/…"
            disabled={loading}
            autoFocus
          />
          <button type="submit" className="btn btn--primary" disabled={loading || !input.trim()}>
            {loading ? 'Loading…' : 'Start ranking'}
          </button>
        </form>

        {error && <div className="error">{error}</div>}
        {previewNote && <div className="hint">{previewNote}</div>}

        <button type="button" className="btn btn--ghost" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </div>
  )
}
