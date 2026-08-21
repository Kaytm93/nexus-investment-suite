import React from 'react'
import { Star } from 'lucide-react'
import { useWatchlist } from '../context/WatchlistContext'

export default function WatchlistButton({ ticker, name, className = '' }) {
  const { isWatched, toggle } = useWatchlist()
  const watched = isWatched(ticker)
  const normalized = ticker.toUpperCase().trim()
  return (
    <button
      type="button"
      aria-label={watched ? `${normalized} aus Watchlist entfernen` : `${normalized} zur Watchlist hinzufügen`}
      title={watched ? 'Aus Watchlist entfernen' : 'Zur Watchlist hinzufügen'}
      className={`watchlist-star inline-flex items-center justify-center rounded-lg min-w-[36px] min-h-[36px] ${className}`}
      style={{ color: watched ? 'var(--accent)' : 'var(--text-muted)', background: watched ? 'rgba(124,255,203,0.1)' : 'transparent' }}
      onClick={event => { event.preventDefault(); event.stopPropagation(); toggle(normalized, name) }}
    >
      <Star size={15} fill={watched ? 'currentColor' : 'none'} />
    </button>
  )
}
