import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  getPortfolioPositions, addPosition, updatePosition, deletePosition,
  refreshPrices, getPortfolioPerformance, searchTicker,
  getPositionTransactions, addPositionTransaction, deletePositionTransaction,
  openMarketStream,
  formatCurrency, formatPercent, formatLargeNumber
} from '../lib/api'
import PerformanceChart from '../components/PerformanceChart'
import {
  Briefcase, Plus, RefreshCw, Pencil, Trash2, AlertTriangle,
  TrendingUp, ChevronRight, Loader2, AlertCircle, X, Check,
  ArrowUpDown, ArrowUp, ArrowDown, Search
} from 'lucide-react'

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
function PositionModal({ position, onSave, onClose }) {
  const isEdit = !!position?.id
  const [form, setForm] = useState({
    ticker: position?.ticker || '',
    name: position?.name || '',
    purchase_price: position?.purchase_price || '',
    quantity: position?.quantity || '',
    purchase_date: position?.purchase_date || new Date().toISOString().split('T')[0],
    sector: position?.sector || '',
    region: position?.region || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tickerResults, setTickerResults] = useState([])
  const [tickerOpen, setTickerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('details')
  const [transactions, setTransactions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [transactionForm, setTransactionForm] = useState({
    entry_price: '',
    shares: '',
    purchase_date: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    if (activeTab !== 'history' || !isEdit) return
    setHistoryLoading(true)
    setHistoryError('')
    getPositionTransactions(position.id)
      .then(data => setTransactions(Array.isArray(data) ? data : []))
      .catch(err => setHistoryError(err.message || 'Historie konnte nicht geladen werden.'))
      .finally(() => setHistoryLoading(false))
  }, [activeTab, isEdit, position?.id])

  const handleTransactionSubmit = async (e) => {
    e.preventDefault()
    setHistoryError('')
    try {
      await addPositionTransaction(position.id, {
        entry_price: parseFloat(transactionForm.entry_price),
        shares: parseFloat(transactionForm.shares),
        purchase_date: transactionForm.purchase_date,
      })
      setTransactionForm({ entry_price: '', shares: '', purchase_date: new Date().toISOString().split('T')[0] })
      setTransactions(await getPositionTransactions(position.id))
    } catch (err) {
      setHistoryError(err.message || 'Transaktion konnte nicht gespeichert werden.')
    }
  }

  const handleTransactionDelete = async (transactionId) => {
    try {
      await deletePositionTransaction(position.id, transactionId)
      setTransactions(items => items.filter(item => item.id !== transactionId))
    } catch (err) {
      setHistoryError(err.message || 'Transaktion konnte nicht gelöscht werden.')
    }
  }

  const handleTransactionChange = (field, value) => {
    setTransactionForm(form => ({ ...form, [field]: value }))
  }
  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleTickerSearch = async (q) => {
    handleChange('ticker', q)
    if (q.length < 2) { setTickerResults([]); setTickerOpen(false); return }
    try {
      const res = await searchTicker(q)
      const arr = Array.isArray(res) ? res : res?.results || []
      setTickerResults(arr.slice(0, 6))
      setTickerOpen(arr.length > 0)
    } catch {
      setTickerResults([])
    }
  }

  const selectTicker = (r) => {
    setForm(f => ({
      ...f,
      ticker: r.symbol || r.ticker,
      name: r.name || r.shortname || f.name,
    }))
    setTickerOpen(false)
    setTickerResults([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = {
        ...form,
        purchase_price: parseFloat(form.purchase_price),
        quantity: parseFloat(form.quantity),
        ticker: form.ticker.toUpperCase().trim(),
      }
      if (isEdit) {
        await updatePosition(position.id, data)
      } else {
        await addPosition(data)
      }
      onSave()
    } catch (err) {
      setError(err.message || 'Fehler beim Speichern.')
    } finally {
      setLoading(false)
    }
  }

  const SECTORS = ['Technology', 'Healthcare', 'Financials', 'Energy', 'Consumer', 'Industrials', 'Utilities', 'Real Estate', 'Materials', 'Telecom', 'Defense', 'ETF']
  const REGIONS = ['USA', 'Europa', 'Asien', 'Emerging Markets', 'Global']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {isEdit ? 'Position bearbeiten' : 'Position hinzufügen'}
          </h2>
          <button onClick={onClose} className="transition-colors" style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className="px-3 py-2 text-xs font-medium transition-colors"
            style={{ color: activeTab === 'details' ? 'var(--accent)' : 'var(--text-muted)', borderBottom: activeTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent' }}
          >Details</button>
          {isEdit && (
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{ color: activeTab === 'history' ? 'var(--accent)' : 'var(--text-muted)', borderBottom: activeTab === 'history' ? '2px solid var(--accent)' : '2px solid transparent' }}
            >Kaufhistorie</button>
          )}
        </div>

        {activeTab === 'history' ? (
          <div className="p-5 space-y-4">
            {historyError && <div className="alert-error"><AlertCircle size={14} /><p className="text-xs">{historyError}</p></div>}
            {historyLoading ? (
              <div className="flex items-center gap-2 py-6 justify-center" style={{ color: 'var(--text-muted)' }}><Loader2 size={16} className="animate-spin" />Historie wird geladen…</div>
            ) : (
              <div className="space-y-2">
                {transactions.length === 0 && <p className="text-sm py-3" style={{ color: 'var(--text-muted)' }}>Noch keine Käufe erfasst.</p>}
                {transactions.map(transaction => (
                  <div key={transaction.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div>
                      <p className="text-sm font-mono" style={{ color: 'var(--text)' }}>{formatCurrency(transaction.entry_price)} × {transaction.shares}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{transaction.purchase_date}</p>
                    </div>
                    <button type="button" onClick={() => handleTransactionDelete(transaction.id)} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--text-muted)' }} title="Transaktion löschen"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleTransactionSubmit} className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Kauf hinzufügen</p>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" min="0.01" required value={transactionForm.entry_price} onChange={e => handleTransactionChange('entry_price', e.target.value)} className="input-field font-mono" placeholder="Preis" aria-label="Kaufpreis" />
                <input type="number" step="0.001" min="0.001" required value={transactionForm.shares} onChange={e => handleTransactionChange('shares', e.target.value)} className="input-field font-mono" placeholder="Stück" aria-label="Stückzahl" />
              </div>
              <input type="date" required value={transactionForm.purchase_date} onChange={e => handleTransactionChange('purchase_date', e.target.value)} className="input-field" aria-label="Kaufdatum" />
              <button type="submit" className="btn-primary w-full justify-center">Kauf speichern</button>
            </form>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="alert-error">
              <AlertCircle size={14} />
              <p className="text-xs">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Ticker *</label>
              <div className="relative">
                <input
                  type="text"
                  value={form.ticker}
                  onChange={e => handleTickerSearch(e.target.value)}
                  className="input-field font-mono uppercase"
                  placeholder="z.B. AAPL"
                  required
                />
                {tickerOpen && tickerResults.length > 0 && (
                  <div className="absolute top-full mt-1 w-full rounded-lg z-10" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
                    {tickerResults.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        className="flex items-center justify-between w-full px-3 py-2 text-left transition-colors"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => selectTicker(r)}
                      >
                        <span className="font-mono font-medium text-sm text-primary">{r.symbol || r.ticker}</span>
                        <span className="text-xs truncate max-w-[150px]" style={{ color: 'var(--text-muted)' }}>{r.name || r.shortname}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2">
              <label className="label">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                className="input-field"
                placeholder="Unternehmensname"
              />
            </div>

            <div>
              <label className="label">Einstandskurs (€/$) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.purchase_price}
                onChange={e => handleChange('purchase_price', e.target.value)}
                className="input-field font-mono"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="label">Stückzahl *</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={form.quantity}
                onChange={e => handleChange('quantity', e.target.value)}
                className="input-field font-mono"
                placeholder="0"
                required
              />
            </div>

            <div>
              <label className="label">Kaufdatum</label>
              <input
                type="date"
                value={form.purchase_date}
                onChange={e => handleChange('purchase_date', e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Sektor</label>
              <select
                className="select-field"
                value={form.sector}
                onChange={e => handleChange('sector', e.target.value)}
              >
                <option value="">— Sektor wählen —</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="label">Region</label>
              <select
                className="select-field"
                value={form.region}
                onChange={e => handleChange('region', e.target.value)}
              >
                <option value="">— Region wählen —</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
              Abbrechen
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Speichern…' : isEdit ? 'Aktualisieren' : 'Hinzufügen'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────
function DeleteConfirm({ position, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl shadow-2xl p-6 max-w-sm w-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Position löschen?</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
          Möchtest du <strong style={{ color: 'var(--text)' }}>{position.ticker} — {position.name}</strong> wirklich aus deinem Portfolio entfernen?
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Abbrechen</button>
          <button onClick={onConfirm} disabled={loading} className="btn-danger flex-1 justify-center">
            {loading && <Loader2 size={14} className="animate-spin" />}
            Löschen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────
function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <ArrowUpDown size={11} style={{ color: 'var(--border)' }} />
  return sortDir === 'asc'
    ? <ArrowUp size={11} className="text-primary" />
    : <ArrowDown size={11} className="text-primary" />
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Portfolio() {
  const [positions, setPositions] = useState([])
  const [performance, setPerformance] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editPosition, setEditPosition] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [sortCol, setSortCol] = useState('ticker')
  const [sortDir, setSortDir] = useState('asc')

  const loadData = useCallback(async () => {
    try {
      const [pos, perf] = await Promise.allSettled([
        getPortfolioPositions(),
        getPortfolioPerformance(),
      ])
      if (pos.status === 'fulfilled') setPositions(pos.value || [])
      if (perf.status === 'fulfilled') setPerformance(perf.value || {})
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const stream = openMarketStream(() => {
      refreshPrices()
        .then(data => {
          if (Array.isArray(data?.positions)) setPositions(data.positions)
        })
        .catch(() => {})
    })
    return () => stream.close()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshPrices()
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await deletePosition(deleteTarget.id)
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleModalSave = async () => {
    setShowModal(false)
    setEditPosition(null)
    await loadData()
  }

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  // Compute summary stats
  const totalValue = positions.reduce((sum, p) => sum + (p.current_price || p.purchase_price) * p.quantity, 0)
  const totalCost = positions.reduce((sum, p) => sum + p.purchase_price * p.quantity, 0)
  const totalPnl = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? totalPnl / totalCost : 0

  const bestPos = positions.reduce((best, p) => {
    const pnlPct = ((p.current_price || p.purchase_price) - p.purchase_price) / p.purchase_price
    return (!best || pnlPct > best.pct) ? { ...p, pct: pnlPct } : best
  }, null)

  const worstPos = positions.reduce((worst, p) => {
    const pnlPct = ((p.current_price || p.purchase_price) - p.purchase_price) / p.purchase_price
    return (!worst || pnlPct < worst.pct) ? { ...p, pct: pnlPct } : worst
  }, null)

  // Risk warnings
  const sectorCounts = {}
  const regionCounts = {}
  positions.forEach(p => {
    if (p.sector) sectorCounts[p.sector] = (sectorCounts[p.sector] || 0) + (p.current_price || p.purchase_price) * p.quantity
    if (p.region) regionCounts[p.region] = (regionCounts[p.region] || 0) + (p.current_price || p.purchase_price) * p.quantity
  })
  const sectorWarnings = Object.entries(sectorCounts)
    .filter(([, v]) => totalValue > 0 && v / totalValue > 0.30)
    .map(([s, v]) => ({ sector: s, pct: v / totalValue }))
  const regionWarnings = Object.entries(regionCounts)
    .filter(([, v]) => totalValue > 0 && v / totalValue > 0.50)
    .map(([r, v]) => ({ region: r, pct: v / totalValue }))

  // Sort positions
  const sortedPositions = [...positions].sort((a, b) => {
    let va, vb
    switch (sortCol) {
      case 'pnlPct': {
        va = ((a.current_price || a.purchase_price) - a.purchase_price) / a.purchase_price
        vb = ((b.current_price || b.purchase_price) - b.purchase_price) / b.purchase_price
        break
      }
      case 'weight': {
        va = (a.current_price || a.purchase_price) * a.quantity / (totalValue || 1)
        vb = (b.current_price || b.purchase_price) * b.quantity / (totalValue || 1)
        break
      }
      case 'currentPrice': {
        va = a.current_price || a.purchase_price
        vb = b.current_price || b.purchase_price
        break
      }
      default:
        va = a[sortCol] || ''
        vb = b[sortCol] || ''
    }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortDir === 'asc' ? va - vb : vb - va
  })

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-primary" />
          <span className="ml-2" style={{ color: 'var(--text-muted)' }}>Portfolio wird geladen…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Modals */}
      {(showModal || editPosition) && (
        <PositionModal
          position={editPosition}
          onSave={handleModalSave}
          onClose={() => { setShowModal(false); setEditPosition(null) }}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          position={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            <Link to="/" className="hover:text-primary" style={{ color: 'var(--text-muted)' }}>Märkte</Link>
            <ChevronRight size={12} />
            <span style={{ color: 'var(--text)' }}>Portfolio</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', fontFamily: "'Boska', serif" }}>Mein Portfolio</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{positions.length} Position{positions.length !== 1 ? 'en' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary text-sm"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Kurse aktualisieren
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="btn-primary text-sm"
          >
            <Plus size={14} />
            Position hinzufügen
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error mb-4">
          <AlertCircle size={16} className="shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Gesamtwert</p>
          <p className="text-xl font-mono font-bold" style={{ color: 'var(--text)' }}>{formatCurrency(totalValue)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Gesamt G/V</p>
          <p className="text-xl font-mono font-bold" style={{ color: totalPnl >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
            {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl)}
          </p>
          <p className="text-xs font-mono mt-0.5" style={{ color: totalPnlPct >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
            {isNaN(totalPnlPct) ? '—' : `${totalPnlPct >= 0 ? '+' : ''}${(totalPnlPct * 100).toFixed(2)}%`}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Beste Position</p>
          {bestPos ? (
            <>
              <p className="text-sm font-mono font-bold" style={{ color: 'var(--accent)' }}>{bestPos.ticker}</p>
              <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>
                {isNaN(bestPos.pct) ? '—' : `+${(bestPos.pct * 100).toFixed(2)}%`}
              </p>
            </>
          ) : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>—</p>}
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Schlechteste Position</p>
          {worstPos && worstPos.pct < 0 ? (
            <>
              <p className="text-sm font-mono font-bold" style={{ color: 'var(--danger)' }}>{worstPos.ticker}</p>
              <p className="text-xs font-mono" style={{ color: 'var(--danger)' }}>
                {isNaN(worstPos.pct) ? '—' : `${(worstPos.pct * 100).toFixed(2)}%`}
              </p>
            </>
          ) : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>—</p>}
        </div>
      </div>

      {/* Positions table */}
      {positions.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Briefcase size={20} className="text-primary" />
          </div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Portfolio ist leer</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Füge deine erste Position hinzu, um dein Portfolio zu tracken.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mx-auto">
            <Plus size={14} />
            Erste Position hinzufügen
          </button>
        </div>
      ) : (
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Positionen</h2>
          </div>
          <div className="table-container rounded-none border-0">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    { col: 'ticker', label: 'Ticker' },
                    { col: 'name', label: 'Name' },
                    { col: 'purchase_price', label: 'Einstand' },
                    { col: 'currentPrice', label: 'Kurs' },
                    { col: 'pnlEur', label: 'G/V €' },
                    { col: 'pnlPct', label: 'G/V %' },
                    { col: 'weight', label: 'Gewichtung' },
                    { col: 'sector', label: 'Sektor' },
                    { col: 'region', label: 'Region' },
                    { col: 'actions', label: '' },
                  ].map(({ col, label }) => (
                    <th key={col}>
                      {col !== 'actions' ? (
                        <button className="flex items-center gap-1 transition-colors hover:text-primary" onClick={() => handleSort(col)}>
                          {label}
                          <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                        </button>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map(pos => {
                  const curPrice = pos.current_price || pos.purchase_price
                  const pnlEur = (curPrice - pos.purchase_price) * pos.quantity
                  const pnlPct = (curPrice - pos.purchase_price) / pos.purchase_price
                  const weight = totalValue > 0 ? (curPrice * pos.quantity) / totalValue : 0
                  const positive = pnlEur >= 0
                  return (
                    <tr key={pos.id}>
                      <td>
                        <Link to={`/analyse?ticker=${pos.ticker}`} className="font-mono font-semibold text-primary hover:underline">
                          {pos.ticker}
                        </Link>
                      </td>
                      <td className="max-w-[160px] truncate" style={{ color: 'var(--text-muted)' }}>{pos.name || '—'}</td>
                      <td className="num">{formatCurrency(pos.purchase_price)}</td>
                      <td className="num">
                        {formatCurrency(curPrice)}
                        {pos.price_stale && (
                          <span
                            className="ml-1 text-xs"
                            style={{ color: 'var(--warning, #f59e0b)' }}
                            title="Kurs konnte nicht aktualisiert werden — Anzeige basiert auf Einstand"
                          >
                            *
                          </span>
                        )}
                      </td>
                      <td className={`num ${positive ? 'positive' : 'negative'}`}>
                        {isNaN(pnlEur) ? <span style={{ color: 'var(--text-muted)' }}>—</span> : `${positive ? '+' : ''}${formatCurrency(pnlEur)}`}
                      </td>
                      <td className={`num ${positive ? 'positive' : 'negative'}`}>
                        {isNaN(pnlPct) ? <span style={{ color: 'var(--text-muted)' }}>—</span> : `${positive ? '+' : ''}${(pnlPct * 100).toFixed(2)}%`}
                      </td>
                      <td className="num">{isNaN(weight) ? '—' : `${(weight * 100).toFixed(1)}%`}</td>
                      <td>
                        {pos.sector ? <span className="badge badge-blue">{pos.sector}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        {pos.region ? <span className="badge badge-gray">{pos.region}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditPosition(pos)}
                            className="p-1.5 hover:text-primary hover:bg-primary/10 rounded-md transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            title="Bearbeiten"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(pos)}
                            className="p-1.5 hover:bg-danger/10 rounded-md transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                            title="Löschen"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Performance Chart */}
      {positions.length > 0 && (
        <div className="card mb-6">
          <div className="card-header">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Performance vs. Benchmarks</h2>
          </div>
          <div className="card-body">
            <PerformanceChart
              data={performance}
              onPeriodChange={(period) => {
                getPortfolioPerformance(period).then(setPerformance).catch(() => {})
              }}
            />
          </div>
        </div>
      )}

      {/* Risk warnings */}
      {positions.length > 0 && (sectorWarnings.length > 0 || regionWarnings.length > 0) && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
              Risiko-Hinweise
            </h2>
          </div>
          <div className="card-body space-y-2">
            {sectorWarnings.map(w => (
              <div key={w.sector} className="alert-warning">
                <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                <p>
                  <strong>Sektor-Konzentration:</strong> {w.sector} macht {(w.pct * 100).toFixed(1)}% deines Portfolios aus.
                  Empfehlung: maximal 30% pro Sektor.
                </p>
              </div>
            ))}
            {regionWarnings.map(w => (
              <div key={w.region} className="alert-warning">
                <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                <p>
                  <strong>Regionale Konzentration:</strong> {w.region} macht {(w.pct * 100).toFixed(1)}% deines Portfolios aus.
                  Empfehlung: maximal 50% pro Region.
                </p>
              </div>
            ))}
            {performance?.outperforming_sp500 && (
              <div className="alert-success">
                <TrendingUp size={14} className="shrink-0 text-success" />
                <p><strong>Alpha generiert:</strong> Dein Portfolio outperformt den S&P 500 im gewählten Zeitraum.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
