import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { addToWatchlist, getWatchlist, removeFromWatchlist } from '../lib/api'

const WatchlistContext = createContext(null)

export function WatchlistProvider({ children }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!user) { setItems([]); return }
    setLoading(true)
    try { setItems(await getWatchlist()) } catch { setItems([]) } finally { setLoading(false) }
  }, [user])

  useEffect(() => { reload() }, [reload])

  const toggle = useCallback(async (ticker, name) => {
    const normalized = ticker.toUpperCase().trim()
    const existing = items.some(item => item.ticker === normalized)
    setItems(current => existing ? current.filter(item => item.ticker !== normalized) : [...current, { ticker: normalized, name }])
    try {
      if (existing) await removeFromWatchlist(normalized)
      else await addToWatchlist(normalized, name)
    } catch { await reload() }
  }, [items, reload])

  const value = useMemo(() => ({ items, loading, isWatched: ticker => items.some(item => item.ticker === ticker.toUpperCase().trim()), toggle, reload }), [items, loading, toggle, reload])
  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>
}

export function useWatchlist() {
  const context = useContext(WatchlistContext)
  if (!context) throw new Error('useWatchlist must be used inside WatchlistProvider')
  return context
}
