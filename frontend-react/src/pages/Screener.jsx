import React, { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ApiKeyGate from '../components/ApiKeyGate'
import WatchlistButton from '../components/WatchlistButton'
import { runElaraScreener } from '../lib/api'
import { useGSAP } from '@gsap/react'
import { gsap } from 'gsap'
import {
  Search, Loader2, AlertCircle, ChevronRight, Info,
  ArrowUpDown, ArrowUp, ArrowDown, Download
} from 'lucide-react'

const SECTORS = [
  { value: 'Technology', label: 'Technology' },
  { value: 'Banking', label: 'Banking & Financial Services' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Healthcare_Pharma', label: 'Healthcare & Pharma' },
  { value: 'Energy_Oil_Gas', label: 'Energy (Oil & Gas)' },
  { value: 'Automotive', label: 'Automotive' },
  { value: 'Utilities', label: 'Utilities' },
  { value: 'Real_Estate_REIT', label: 'Real Estate & REITs' },
  { value: 'Mining_Materials', label: 'Mining & Materials' },
  { value: 'Telecom', label: 'Telecommunications' },
  { value: 'Consumer_Staples', label: 'Consumer Staples' },
  { value: 'Defense_Aerospace', label: 'Defense & Aerospace' },
  { value: 'Alt_Asset_Manager', label: 'Alternative Asset Managers' },
  { value: 'ETF_Index', label: 'ETF & Index Funds' },
]

const MARKET_CAPS = [
  { value: '', label: 'Alle' },
  { value: 'small', label: 'Small Cap (< 2 Mrd.)' },
  { value: 'mid', label: 'Mid Cap (2–10 Mrd.)' },
  { value: 'large', label: 'Large Cap (> 10 Mrd.)' },
]

const REGIONS = [
  { value: '', label: 'Alle Regionen' },
  { value: 'US', label: 'USA' },
  { value: 'Europe', label: 'Europa' },
  { value: 'Asia', label: 'Asien' },
  { value: 'Emerging', label: 'Emerging Markets' },
]

const HORIZONS = [
  { value: 'short', label: 'Kurzfristig (< 1 Jahr)' },
  { value: 'medium', label: 'Mittelfristig (1–3 Jahre)' },
  { value: 'long', label: 'Langfristig (> 3 Jahre)' },
]

// Parse Markdown table to array of objects
function parseMarkdownTable(markdown) {
  if (!markdown) return { headers: [], rows: [] }
  const lines = markdown.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 2) return { headers: [], rows: [] }

  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  const rows = lines.slice(2).map(line =>
    line.split('|').map(cell => cell.trim()).filter(Boolean)
  ).filter(row => row.length > 0)

  return { headers, rows }
}

function buildCsvContent(headers, rows) {
  const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
  return '\uFEFF' + [headers, ...rows]
    .map(row => row.map(escapeCell).join(';'))
    .join('\r\n')
}

function downloadCsv(headers, rows, filename) {
  const blob = new Blob([buildCsvContent(headers, rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function SortIcon({ column, sortCol, sortDir }) {
  if (sortCol !== column) return <ArrowUpDown size={12} style={{ color: 'var(--border)' }} />
  return sortDir === 'asc'
    ? <ArrowUp size={12} className="text-primary" />
    : <ArrowDown size={12} className="text-primary" />
}

function ResultsTable({ markdown, onTickerClick }) {
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('desc')
  const { headers, rows } = parseMarkdownTable(markdown)

  if (!headers.length) return null

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  let sortedRows = [...rows]
  if (sortCol !== null) {
    const colIdx = headers.indexOf(sortCol)
    sortedRows.sort((a, b) => {
      const va = parseFloat((a[colIdx] || '').replace(/[^0-9.-]/g, '')) || 0
      const vb = parseFloat((b[colIdx] || '').replace(/[^0-9.-]/g, '')) || 0
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }

  const tickerIdx = headers.findIndex(h => h.toLowerCase() === 'ticker')
  const nameIdx = headers.findIndex(h => /name|unternehmen|firma/i.test(h))

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>
                <button
                  className="flex items-center gap-1 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => handleSort(h)}
                >
                  {h}
                  <SortIcon column={h} sortCol={sortCol} sortDir={sortDir} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, ri) => {
            const scoreIdx = headers.findIndex(h => /score/i.test(h))
            const scoreVal = scoreIdx >= 0 ? parseFloat((row[scoreIdx] || '').replace(/[^0-9.-]/g, '')) : null
            return (
              <tr key={ri} className="screener-row">
                {row.map((cell, ci) => {
                  const isScore = ci === scoreIdx && scoreVal !== null
                  const scoreColor = isScore
                    ? scoreVal > 70 ? 'var(--accent)' : scoreVal < 40 ? 'var(--danger)' : 'var(--text)'
                    : null
                  return (
                    <td key={ci}>
                      {ci === tickerIdx ? (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => onTickerClick(cell)} className="font-mono font-semibold text-primary hover:underline cursor-pointer">{cell}</button>
                          <WatchlistButton ticker={cell} name={row[nameIdx]} />
                        </div>
                      ) : (
                        <span
                          className={/^[+-]?\d+\.?\d*%?$/.test(cell.trim()) && !['#', '1'].includes(cell.trim()) ? 'num' : ''}
                          style={{ color: scoreColor || 'var(--text-muted)' }}
                        >
                          {cell}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Extract non-table content (champion, notes, etc.)
function extractNonTable(text) {
  if (!text) return ''
  return text.split('\n').filter(line => !line.trim().startsWith('|')).join('\n').trim()
}

export default function Screener() {
  const { hasApiKey } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    sector: 'Technology',
    market_cap: '',
    region: '',
    exclusions: '',
    horizon: 'long',
  })
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const progressRef = useRef(null)

  // GSAP row stagger when results arrive
  useGSAP(() => {
    if (result) {
      gsap.fromTo('.screener-row',
        { opacity: 0, x: -16 },
        { opacity: 1, x: 0, stagger: 0.04, duration: 0.35, ease: 'power2.out' }
      )
    }
  }, { dependencies: [result] })

  const handleChange = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const startProgress = () => {
    setProgress(0)
    let p = 0
    progressRef.current = setInterval(() => {
      p = Math.min(p + Math.random() * 3, 90)
      setProgress(Math.round(p))
    }, 400)
  }

  const stopProgress = () => {
    if (progressRef.current) clearInterval(progressRef.current)
    setProgress(100)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)
    startProgress()
    try {
      const res = await runElaraScreener(form)
      stopProgress()
      setResult(res)
    } catch (err) {
      stopProgress()
      setError(err.message || 'Screening fehlgeschlagen. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(0), 1000)
    }
  }

  const handleTickerClick = (ticker) => {
    navigate(`/analyse?ticker=${ticker.toUpperCase().trim()}`)
  }

  const handleCsvDownload = () => {
    const sectorName = SECTORS.find(s => s.value === form.sector)?.label || 'elara-ergebnisse'
    const filename = `elara-${sectorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.csv`
    downloadCsv(headers, rows, filename)
  }

  // Extract markdown table from result
  const reportText = result?.result || result?.report || result?.text || ''
  const tableMatch = reportText.match(/((?:\|[^\n]+\|\n?)+)/m)
  const tableMarkdown = tableMatch ? tableMatch[0] : ''
  const { headers, rows } = parseMarkdownTable(tableMarkdown)
  const nonTableText = result ? extractNonTable(reportText) : ''

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          <Link to="/" className="hover:text-primary" style={{ color: 'var(--text-muted)' }}>Märkte</Link>
          <ChevronRight size={12} />
          <span style={{ color: 'var(--text)' }}>Elara Screener</span>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', fontFamily: "'Boska', serif" }}>Elara Sektor-Screener</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Quantamentaler Screening-Algorithmus — identifiziert die besten Titel pro Sektor
        </p>
      </div>

      {/* Free-use notice */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6"
        style={{ background: 'rgba(124,255,203,0.06)', border: '1px solid rgba(124,255,203,0.15)' }}
      >
        <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Kostenlos & sofort verfügbar.</strong>{' '}
          Elara läuft über den NEXUS-Server (Groq llama-3.3-70b). Kein eigener API-Key notwendig.
          Für erweiterte Modelle (GPT-4o, Gemini, Claude) kannst du optional eigene Keys in den{' '}
          <Link to="/settings" style={{ color: 'var(--primary)' }} className="hover:underline">Einstellungen</Link> hinterlegen.
        </p>
      </div>

      <ApiKeyGate hasApiKey={hasApiKey}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-1">
            <div className="card sticky top-20">
              <div className="card-header">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <Search size={14} />
                  Screening-Parameter
                </h2>
              </div>
              <form onSubmit={handleSubmit} className="card-body space-y-4">
                <div>
                  <label className="label">Sektor *</label>
                  <select
                    className="select-field"
                    value={form.sector}
                    onChange={e => handleChange('sector', e.target.value)}
                    required
                  >
                    {SECTORS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Min. Marktkapitalisierung</label>
                  <select
                    className="select-field"
                    value={form.market_cap}
                    onChange={e => handleChange('market_cap', e.target.value)}
                  >
                    {MARKET_CAPS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Region</label>
                  <select
                    className="select-field"
                    value={form.region}
                    onChange={e => handleChange('region', e.target.value)}
                  >
                    {REGIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Anlagehorizont</label>
                  <select
                    className="select-field"
                    value={form.horizon}
                    onChange={e => handleChange('horizon', e.target.value)}
                  >
                    {HORIZONS.map(h => (
                      <option key={h.value} value={h.value}>{h.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">
                    Ausschlüsse
                    <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="z.B. Rüstung, Tabak, China"
                    value={form.exclusions}
                    onChange={e => handleChange('exclusions', e.target.value)}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Kommagetrennte Ausschlusskriterien</p>
                </div>

                {/* Progress bar */}
                {loading && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        Elara analysiert…
                      </span>
                      <span className="font-mono">{progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full justify-center py-2.5"
                >
                  {loading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Screening läuft…
                    </>
                  ) : (
                    <>
                      <Search size={15} />
                      Screening starten
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-2 space-y-4">
            {error && (
              <div className="alert-error">
                <AlertCircle size={16} className="shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {!result && !loading && !error && (
              <div className="card p-8 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Search size={20} className="text-primary" />
                </div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Bereit zum Screening</h3>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Wähle einen Sektor und starte die Analyse. Elara identifiziert bis zu 30 Titel
                  nach Bewertung, Qualität, Risiko und Wachstum.
                </p>
              </div>
            )}

            {result && (
              <>
                {/* Table */}
                {tableMarkdown && (
                  <div className="card">
                    <div className="card-header flex items-center justify-between">
                      <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        Ergebnisse — {SECTORS.find(s => s.value === form.sector)?.label}
                      </h2>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                          <Info size={12} />
                          Klicke auf Ticker für Deep-Dive
                        </div>
                        <button
                          type="button"
                          onClick={handleCsvDownload}
                          className="btn-secondary text-xs py-1.5 px-2.5"
                          title="Ergebnisse als CSV für Excel herunterladen"
                        >
                          <Download size={13} />
                          CSV Export
                        </button>
                      </div>
                    </div>
                    <div className="card-body p-0">
                      <ResultsTable
                        markdown={tableMarkdown}
                        onTickerClick={handleTickerClick}
                      />
                    </div>
                  </div>
                )}

                {/* Notes / Champion section */}
                {nonTableText && (
                  <div className="card">
                    <div className="card-header">
                      <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Elara Einschätzung</h2>
                    </div>
                    <div className="card-body">
                      <div className="markdown-content prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {nonTableText}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </ApiKeyGate>
    </div>
  )
}
