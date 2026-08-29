import { useState } from 'react'
import type { Track } from '../types'
import type { Battle } from '../lib/ranking'

interface ResultsViewProps {
  ranking: Track[]
  wins: Record<string, number>
  battles: Battle[]
  canModify: boolean
  onSave: () => Promise<void>
  onRestart: () => void
  onNewPlaylist: () => void
}

const MEDALS = ['🥇', '🥈', '🥉']

export function ResultsView({
  ranking,
  wins,
  battles,
  canModify,
  onSave,
  onRestart,
  onNewPlaylist,
}: ResultsViewProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    const ok = window.confirm(
      'Reorder your Spotify playlist to match this ranking?\n\nThis replaces the current order and removes any duplicate tracks.',
    )
    if (!ok) return

    setSaving(true)
    setSaveError(null)
    try {
      await onSave()
      setSaved(true)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    const text = ranking.map((t, i) => `${i + 1}. ${t.name} — ${t.artists}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  const handleDownload = () => {
    const payload = ranking.map((t, i) => ({
      rank: i + 1,
      name: t.name,
      artists: t.artists,
      album: t.albumName,
      uri: t.uri,
    }))
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'song-ranking.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Resolves each battle's ids into readable rows (with names and winners). */
  const battleRows = battles.map((b, i) => {
    const left = ranking.find((t) => t.id === b.leftId)
    const right = ranking.find((t) => t.id === b.rightId)
    const winner = b.winner === 'left' ? left : right
    return {
      battle: i + 1,
      left: left?.name ?? 'Unknown',
      right: right?.name ?? 'Unknown',
      winner: winner?.name ?? 'Unknown',
      winnerSide: b.winner,
    }
  })

  const downloadText = (filename: string, mime: string, text: string) => {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const escapeCsv = (value: string) => {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  const handleDownloadBattleCsv = () => {
    const header = ['Battle', 'Song A', 'Song B', 'Winner']
    const rows = battleRows.map((r) => [
      String(r.battle),
      r.left,
      r.right,
      r.winner,
    ])
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\r\n')
    downloadText('battle-log.csv', 'text/csv;charset=utf-8', '\uFEFF' + csv)
  }

  const handleDownloadBattleJson = () => {
    const payload = battleRows.map((r) => ({
      battle: r.battle,
      left: r.left,
      right: r.right,
      winner: r.winner,
      winnerSide: r.winnerSide,
    }))
    downloadText('battle-log.json', 'application/json', JSON.stringify(payload, null, 2))
  }

  return (
    <div className="view view--results">
      <h1 className="brand">Your Ranking</h1>

      <ol className="results-list">
        {ranking.map((t, i) => (
          <li key={t.id} className="result-item">
            <span className="result-item__rank">{MEDALS[i] ?? i + 1}</span>
            {t.albumImageUrl ? (
              <img className="result-item__art" src={t.albumImageUrl} alt="" width={48} height={48} />
            ) : (
              <div className="result-item__art result-item__art--empty">♪</div>
            )}
            <div className="result-item__body">
              <span className="result-item__name">{t.name}</span>
              <span className="result-item__artist">{t.artists}</span>
            </div>
            {(wins[t.id] ?? 0) > 0 && <span className="result-item__wins">🏆 {wins[t.id]}</span>}
          </li>
        ))}
      </ol>

      <div className="results-actions">
        <button type="button" className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? '✓ Saved to Spotify' : 'Save ranking to Spotify'}
        </button>
        <button type="button" className="btn" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy as text'}
        </button>
        <button type="button" className="btn" onClick={handleDownload}>
          Download JSON
        </button>
      </div>

      {battles.length > 0 && (
        <section className="battles">
          <div className="battles__header">
            <h2 className="battles__title">Battle history</h2>
            <div className="battles__exports">
              <button type="button" className="btn btn--small" onClick={handleDownloadBattleCsv}>
                Export CSV
              </button>
              <button type="button" className="btn btn--small" onClick={handleDownloadBattleJson}>
                Export JSON
              </button>
            </div>
          </div>
          <ol className="battles-list">
            {battles.map((b, i) => {
              const left = ranking.find((t) => t.id === b.leftId)
              const right = ranking.find((t) => t.id === b.rightId)
              const winner = b.winner === 'left' ? left : right
              return (
                <li key={i} className="battle-item">
                  <span className="battle-item__num">{i + 1}</span>
                  <span className="battle-item__pair">
                    <span className={b.winner === 'left' ? 'battle-item__name battle-item__name--winner' : 'battle-item__name'}>
                      {left?.name ?? 'Unknown'}
                    </span>
                    <span className="battle-item__vs">vs</span>
                    <span className={b.winner === 'right' ? 'battle-item__name battle-item__name--winner' : 'battle-item__name'}>
                      {right?.name ?? 'Unknown'}
                    </span>
                  </span>
                  <span className="battle-item__result">
                    🏆 {winner?.name ?? 'Unknown'}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {!canModify && (
        <div className="hint">
          ⚠️ Your connection is missing the &quot;modify playlist&quot; permission. Sign out and
          connect again, approving all permissions, to enable saving to Spotify.
        </div>
      )}

      {saveError && <div className="error">{saveError}</div>}

      <div className="results-footer">
        <button type="button" className="btn btn--ghost" onClick={onRestart}>
          ↺ Re-rank (new order)
        </button>
        <button type="button" className="btn btn--ghost" onClick={onNewPlaylist}>
          New playlist
        </button>
      </div>
    </div>
  )
}
