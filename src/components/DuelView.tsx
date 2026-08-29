import { useEffect, useRef, useState } from 'react'
import type { Track } from '../types'
import type { Side } from '../lib/ranking'
import { SongCard } from './SongCard'
import { ProgressBar } from './ProgressBar'

interface DuelViewProps {
  left: Track
  right: Track
  duelCount: number
  totalDuels: number
  progress: number
  canUndo: boolean
  onPick: (side: Side) => void
  onTie: () => void
  onUndo: () => void
  onQuit: () => void
}

export function DuelView({
  left,
  right,
  duelCount,
  totalDuels,
  progress,
  canUndo,
  onPick,
  onTie,
  onUndo,
  onQuit,
}: DuelViewProps) {
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const togglePreview = (track: Track) => {
    setPreview((cur) => (cur?.id === track.id ? null : { id: track.id, url: track.previewUrl! }))
  }

  // Start playback when a preview is selected. The element only exists after a
  // user click (a user gesture), so autoplay restrictions don't block `.play()`.
  useEffect(() => {
    if (preview && audioRef.current) {
      const playPromise = audioRef.current.play()
      // `.play()` returns a promise; ignore rejections (e.g. an interrupted clip).
      if (playPromise) playPromise.catch(() => {})
    }
  }, [preview])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === '1') onPick('left')
      else if (e.key === 'ArrowRight' || e.key === '2') onPick('right')
      else if (e.key === 't' || e.key === 'T') onTie()
      else if (e.key === 'u' || e.key === 'U' || e.key === 'z' || e.key === 'Z') {
        if (canUndo) onUndo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPick, onTie, onUndo, canUndo])

  return (
    <div className="view view--duel">
      <header className="duel-header">
        <button type="button" className="btn btn--ghost" onClick={onQuit}>
          ✕ Quit
        </button>

        <div className="duel-header__progress">
          <span className="duel-header__count">
            Duel {duelCount} of ~{totalDuels}
          </span>
          <ProgressBar value={progress} />
        </div>

        <button type="button" className="btn btn--ghost" onClick={onUndo} disabled={!canUndo}>
          ↩ Undo
        </button>
      </header>

      <p className="duel-prompt">Which song is better?</p>

      <div className="duel-grid">
        <SongCard
          track={left}
          side="left"
          playing={preview?.id === left.id}
          onTogglePreview={togglePreview}
          onChoose={onPick}
        />
        <div className="duel-vs">VS</div>
        <SongCard
          track={right}
          side="right"
          playing={preview?.id === right.id}
          onTogglePreview={togglePreview}
          onChoose={onPick}
        />
      </div>

      <div className="duel-footer">
        <button type="button" className="btn" onClick={onTie}>
          ⚖ Can&apos;t decide
        </button>
        <p className="muted">
          Keys: ← / → or 1 / 2 to pick · T for tie · U to undo
        </p>
      </div>

      {preview && (
        <audio
          key={preview.id}
          ref={audioRef}
          src={preview.url}
          onEnded={() => setPreview(null)}
        />
      )}
    </div>
  )
}
