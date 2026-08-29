import type { Track } from '../types'
import type { Side } from '../lib/ranking'

interface SongCardProps {
  track: Track
  side: Side
  playing: boolean
  onTogglePreview: (track: Track) => void
  onChoose: (side: Side) => void
}

export function SongCard({ track, side, playing, onTogglePreview, onChoose }: SongCardProps) {
  const label = side === 'left' ? 'A' : 'B'
  const hasPreview = Boolean(track.previewUrl)
  const previewClass = [
    'song-card__preview',
    hasPreview ? '' : 'song-card__preview--disabled',
    hasPreview && playing ? 'song-card__preview--playing' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const previewLabel = hasPreview ? (playing ? '⏸ Stop preview' : '▶ Preview') : 'No preview'
  return (
    <button
      type="button"
      className={`song-card song-card--${side}`}
      onClick={() => onChoose(side)}
      aria-label={`Choose ${track.name} by ${track.artists}`}
    >
      <span className="song-card__badge">{label}</span>

      <div className="song-card__art">
        {track.albumImageUrl ? (
          <img src={track.albumImageUrl} alt={`${track.albumName} cover`} />
        ) : (
          <div className="song-card__art-fallback">♪</div>
        )}
      </div>

      <div className="song-card__body">
        <h2 className="song-card__title">{track.name}</h2>
        <p className="song-card__artist">{track.artists}</p>
        <p className="song-card__album">{track.albumName}</p>
      </div>

      <span
        className={previewClass}
        role="button"
        aria-disabled={!hasPreview}
        tabIndex={hasPreview ? 0 : -1}
        title={hasPreview ? undefined : 'No preview available for this track'}
        onClick={(e) => {
          e.stopPropagation()
          if (hasPreview) onTogglePreview(track)
        }}
        onKeyDown={(e) => {
          if (hasPreview && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            e.stopPropagation()
            onTogglePreview(track)
          }
        }}
      >
        {previewLabel}
      </span>
    </button>
  )
}
