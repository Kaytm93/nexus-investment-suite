import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ApiKeyGate from '../components/ApiKeyGate'
import ConvictionGauge from '../components/ConvictionGauge'
import StockChart from '../components/StockChart'
import WatchlistButton from '../components/WatchlistButton'
import { runAltairAnalysis, searchTicker, fetchStockData, fetchHistory, buildWsUrl } from '../lib/api'
import { gsap } from 'gsap'
import {
  Brain, Search, Loader2, AlertCircle, ChevronRight, RefreshCw,
  Printer, TrendingUp, TrendingDown, BarChart2, Shield,
  CheckCircle, AlertTriangle, XCircle, Clock, X
} from 'lucide-react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

// ─── Inline markdown renderer ────────────────────────────────────────────────
function renderInline(text) {
  const parts = []
  const re = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1]) parts.push(<strong key={m.index} style={{ color: 'var(--text)', fontWeight: 600 }}>{m[1]}</strong>)
    else if (m[2]) parts.push(<em key={m.index}>{m[2]}</em>)
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// ─── Markdown renderer (simple) ──────────────────────────────────────────────
function MarkdownSection({ content, className = '' }) {
  if (!content) return null
  const lines = content.split('\n')
  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`} style={{ color: 'var(--text-muted)' }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-semibold mt-4 mb-2 pb-1.5" style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)', fontFamily: "'Boska', serif" }}>{renderInline(line.replace('## ', ''))}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold mt-3 mb-1.5" style={{ color: 'var(--text)' }}>{renderInline(line.replace('### ', ''))}</h3>
        if (line.startsWith('- ') || line.startsWith('• ')) return <p key={i} className="flex gap-2"><span className="mt-0.5 shrink-0" style={{ color: 'var(--primary)' }}>•</span><span>{renderInline(line.replace(/^[-•] /, ''))}</span></p>
        if (line.startsWith('| ')) return null // tables rendered by SimpleTable
        if (line.match(/^\d+\./)) return <p key={i} className="pl-2">{renderInline(line)}</p>
        if (line.trim() === '') return null
        return <p key={i}>{renderInline(line)}</p>
      })}
    </div>
  )
}

// ─── Parse markdown table ─────────────────────────────────────────────────────
function parseMarkdownTable(text) {
  if (!text) return null
  const lines = text.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 2) return null
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean)
  const rows = lines.slice(2).map(line =>
    line.split('|').map(c => c.trim()).filter(Boolean)
  ).filter(r => r.length > 0)
  return { headers, rows }
}

function SimpleTable({ markdown }) {
  const parsed = parseMarkdownTable(markdown)
  if (!parsed) return <MarkdownSection content={markdown} />
  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>{parsed.headers.map((h, i) => <th key={i}>{renderInline(h)}</th>)}</tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={ci > 0 ? 'num' : ''}>{renderInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Timing badge ─────────────────────────────────────────────────────────────
function TimingBadge({ signal }) {
  if (!signal) return null
  const s = signal.toLowerCase()
  if (s.includes('kaufen') || s.includes('green') || s.includes('jetzt')) {
    return <span className="badge badge-green flex items-center gap-1"><CheckCircle size={11} /> Jetzt kaufen</span>
  }
  if (s.includes('warte') || s.includes('yellow')) {
    return <span className="badge badge-yellow flex items-center gap-1"><Clock size={11} /> Warte auf Rücksetzer</span>
  }
  return <span className="badge badge-red flex items-center gap-1"><XCircle size={11} /> Nur Watchlist</span>
}

// ─── Cache age label ────────────────────────────────────────────────────────────
function formatCacheAge(cachedAt) {
  if (!cachedAt) return null
  const timestamp = Date.parse(cachedAt)
  if (Number.isNaN(timestamp)) return null
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
  if (minutes < 60) return `vor ${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std.`
  return `vor ${Math.floor(hours / 24)} T.`
}

// ─── DCF Bar Chart ────────────────────────────────────────────────────────────
function DCFChart({ scenarios, currentPrice }) {
  if (!scenarios?.length) return null
  const data = scenarios.map(s => ({ name: s.label, value: s.value }))
  const colors = { 'Bull Case': '#7cffcb', 'Base Case': '#4f8ef7', 'Worst Case': '#ff4d6d' }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 20 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7599' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#6b7599' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={50} />
        <Tooltip
          formatter={(val) => [`$${val.toFixed(2)}`, 'Fair Value']}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)', background: '#141d35', color: '#e8eaf0' }}
        />
        {currentPrice && (
          <ReferenceLine
            y={currentPrice}
            stroke="#f59e0b"
            strokeDasharray="4 2"
            label={{ value: `Kurs: $${currentPrice}`, position: 'right', fontSize: 10, fill: '#f59e0b' }}
          />
        )}
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={colors[entry.name] || '#4f8ef7'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Ticker Search ────────────────────────────────────────────────────────────
function TickerSearch({ value, onChange, onSelect }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value || value.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchTicker(value)
        const arr = Array.isArray(res) ? res : res?.results || []
        setResults(arr.slice(0, 8))
        setOpen(arr.length > 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [value])

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative flex-1" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          className="input-field pr-8 font-mono uppercase"
          placeholder="Ticker eingeben (z.B. AAPL, MSFT, VOW3.DE)"
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--text-muted)' }} />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full rounded-xl z-20 overflow-hidden" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
          {results.map((r, i) => (
            <button
              key={i}
              className="flex items-center justify-between w-full px-3 py-2.5 text-left transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => {
                onSelect(r.symbol || r.ticker || r)
                setOpen(false)
                setResults([])
              }}
            >
              <span className="font-mono font-semibold text-sm" style={{ color: 'var(--primary)' }}>{r.symbol || r.ticker}</span>
              <span className="text-xs max-w-[200px] truncate" style={{ color: 'var(--text-muted)' }}>{r.name || r.shortname}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Extract sections from full report text ───────────────────────────────────
const NUMBER_PATTERN = '[€$£]?\\s*[-+]?\\d[\\d\\s.,]*'

function parseReportNumber(value) {
  if (!value) return null
  const normalized = value.replace(/[€$£\s]/g, '')
  const lastComma = normalized.lastIndexOf(',')
  const lastDot = normalized.lastIndexOf('.')
  let number = normalized

  // Treat the last separator as the decimal separator when both are present,
  // otherwise a single separator followed by exactly two digits is decimal.
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.'
    const thousands = decimal === ',' ? '.' : ','
    number = normalized.replace(new RegExp(`\\${thousands}`, 'g'), '').replace(decimal, '.')
  } else if (lastComma >= 0) {
    number = /,\d{1,2}$/.test(normalized) ? normalized.replace(',', '.') : normalized.replace(/,/g, '')
  } else if (lastDot >= 0) {
    number = /\.\d{1,2}$/.test(normalized) ? normalized : normalized.replace(/\./g, '')
  }

  const parsed = Number(number)
  return Number.isFinite(parsed) ? parsed : null
}

function firstReportNumber(value) {
  return value?.match(new RegExp(NUMBER_PATTERN))?.[0] || null
}

function extractReportSections(text) {
  if (typeof text !== 'string' || !text.trim()) return {}
  const sections = {}
  const lines = text.split(/\r?\n/)

  // Extract conviction score (English/German labels, with or without colon).
  const convMatch = text.match(/(?:conviction(?:\s+score)?|überzeugung(?:sscore)?|\bscore)\s*(?:score)?\s*[:\-|→]*\s*[*_`]*(\d{1,2})(?:\s*\/?\s*7)?/i)
  const convictionScore = convMatch ? Number(convMatch[1]) : null
  if (Number.isFinite(convictionScore)) sections.convictionScore = convictionScore

  // Extract timing signal from flexible English/German labels.
  const timingMatch = text.match(/(?:timing(?:\s*[-_ ]?\s*signal)?|zeitpunkt|einstiegs(?:zeitpunkt|signal)|signal)\s*[:\-|→]*\s*([^\n|]+)/i)
  const timingSignal = timingMatch?.[1]?.replace(/[*_`]/g, '').trim()
  if (timingSignal) sections.timingSignal = timingSignal

  // Extract current price from a snapshot row or a labelled inline value.
  const priceMatch = text.match(/(?:^|\n)\s*[^\n]*(?:kurs|aktueller?\s*kurs|current\s*price|price)\s*[^\n|]*\|\s*([^\n|]+)/im)
    || text.match(/(?:kurs|aktueller?\s*kurs|current\s*price|price)\s*[:\-|→]\s*([^\n|]+)/i)
  const currentPrice = parseReportNumber(firstReportNumber(priceMatch?.[1]))
  if (currentPrice !== null) sections.currentPrice = currentPrice

  // Extract DCF scenarios. Keep the existing display labels, but accept common
  // German/English variants and only parse numbers after each scenario label.
  const scenarios = []
  const scenarioPattern = /(Bull(?:\s+Case)?|Base(?:\s+Case)?|Worst(?:\s+Case)?|Bear(?:\s+Case)?|Bullen(?:szenario)?|Basisszenario|Bären(?:szenario)?)/i
  lines.forEach(line => {
    const scenarioMatch = line.match(scenarioPattern)
    if (!scenarioMatch) return
    const value = parseReportNumber(firstReportNumber(line.slice(scenarioMatch.index + scenarioMatch[0].length)))
    if (value === null) return
    const rawLabel = scenarioMatch[1].toLowerCase()
    const label = rawLabel.startsWith('bull') || rawLabel.startsWith('bullen') ? 'Bull Case'
      : rawLabel.startsWith('base') || rawLabel.startsWith('basis') ? 'Base Case' : rawLabel.startsWith('bear') ? 'Bear Case' : 'Worst Case'
    scenarios.push({ label, value })
  })
  if (scenarios.length) sections.scenarios = scenarios

  // Normalize heading styles → all become ## so one split handles everything:
  // ###+ headings → ##
  // **Bold heading** or **Bold heading:** alone on a line → ##
  const normalized = text
    .replace(/^#{3,} /gm, '## ')
    .replace(/^\*{1,2}([^*\n]{3,})\*{1,2}:?\s*$/gm, '## $1')

  // Split into major sections by ## headings
  const sectionMatches = normalized.split(/(?=^## )/m)
  sectionMatches.forEach(chunk => {
    const title = (chunk.match(/^## (.+)/m)?.[1] || '').trim().toLowerCase()
    const content = chunk.replace(/^## [^\n]+\n/, '').trim()
    if (!content) return
    if (/snapshot|finanz|peer|kenn/.test(title)) {
      sections.snapshot = content
    } else if (/qualit|substanz|moat|wettbewerb/.test(title)) {
      sections.quality = content
    } else if (/bewert|szenario|dcf|valuat|fair.?value/.test(title)) {
      sections.valuation = content
    } else if (/pre.?mortem|stresstest|risiko|risk/.test(title)) {
      sections.preMortem = content
    } else if (/fazit|kapital|allokation|conclusion|dashboard|modul 4/.test(title)) {
      if (!sections.conclusion) sections.conclusion = content  // first match wins — avoids duplication
    } else if (/rendite|return|ertrags/.test(title)) {
      sections.returns = content
    }
  })

  sections.fullText = text
  return sections
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Analysis() {
  const { hasApiKey } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [ticker, setTicker] = useState(searchParams.get('ticker') || '')
  const [loading, setLoading] = useState(false)
  const [progressStep, setProgressStep] = useState('')
  const [progressLog, setProgressLog] = useState([])   // real WS messages
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [history, setHistory] = useState([])
  const wsRef = useRef(null)

  // Animation refs
  const reportRef = useRef(null)
  const progressLogRef = useRef(null)
  const prevLogLengthRef = useRef(0)

  // Stagger-animate report cards when report arrives
  useEffect(() => {
    if (!report || !reportRef.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo('.report-card',
        { opacity: 0, y: 32 },
        { opacity: 1, y: 0, stagger: 0.1, duration: 0.6, ease: 'power2.out', clearProps: 'all' }
      )
    }, reportRef)
    return () => ctx.revert()
  }, [report])

  // Slide-in each new progress log entry as it arrives
  useEffect(() => {
    if (!progressLogRef.current || progressLog.length === 0) return
    if (progressLog.length <= prevLogLengthRef.current) {
      prevLogLengthRef.current = progressLog.length
      return
    }
    const items = progressLogRef.current.querySelectorAll('.progress-step')
    const lastItem = items[items.length - 1]
    if (lastItem) {
      gsap.from(lastItem, {
        opacity: 0,
        x: -14,
        duration: 0.35,
        ease: 'power2.out',
      })
    }
    prevLogLengthRef.current = progressLog.length
  }, [progressLog])

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => { wsRef.current?.close() }
  }, [])

  // Auto-load if ticker in URL
  useEffect(() => {
    const urlTicker = searchParams.get('ticker')
    if (urlTicker && hasApiKey) {
      setTicker(urlTicker)
      handleAnalyse(urlTicker)
    }
  }, [hasApiKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnalyse = async (t = ticker, refresh = false) => {
    const sym = (t || ticker).trim().toUpperCase()
    if (!sym) return

    // Close any previous WebSocket
    wsRef.current?.close()

    setError('')
    setReport(null)
    setLoading(true)
    setProgressLog([])
    setProgressStep('Verbinde mit Analyse-Engine…')

    navigate(`/analyse?ticker=${sym}`, { replace: true })

    // Generate a session ID for this analysis run
    const sessionId = crypto.randomUUID()

    // Open WebSocket and wait for connection (authenticated via ?token=...)
    const wsUrl = await buildWsUrl(`/ws/${sessionId}`)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'progress' && data.message) {
          setProgressStep(data.message)
          setProgressLog(prev => [...prev, data.message])
        } else if (data.type === 'complete') {
          setProgressStep('Analyse fertig!')
          ws.close()
        } else if (data.type === 'error' && data.message) {
          setError(data.message)
          ws.close()
        }
      } catch { /* ignore non-JSON pings */ }
    }

    // Wait for WebSocket to open (max 3s) before sending HTTP request
    await new Promise((resolve) => {
      if (ws.readyState === WebSocket.OPEN) { resolve(); return }
      ws.onopen = resolve
      ws.onerror = resolve  // proceed even if WS fails (analysis still works via HTTP)
      setTimeout(resolve, 3000)
    })

    try {
      const [res, hist] = await Promise.allSettled([
        runAltairAnalysis(sym, refresh, sessionId),
        fetchHistory(sym, '1y').catch(() => null),
      ])

      if (res.status === 'fulfilled') {
        setReport(res.value)
        setProgressStep('Fertig!')
      } else {
        setError(res.reason?.message || 'Analyse fehlgeschlagen.')
      }

      if (hist.status === 'fulfilled' && hist.value) {
        const h = hist.value
        setHistory(
          (h.dates || []).map((d, i) => ({
            date: d,
            value: h.closes?.[i] || h.close?.[i] || h.values?.[i] || 0,
          }))
        )
      }
    } catch (err) {
      setError(err.message || 'Analyse fehlgeschlagen. Bitte versuche es erneut.')
    } finally {
      setLoading(false)
      ws.close()
    }
  }

  const sections = report ? extractReportSections(report?.raw_content || report?.result || report?.report || report?.text || '') : null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          <Link to="/" className="hover:text-primary" style={{ color: 'var(--text-muted)' }}>Märkte</Link>
          <ChevronRight size={12} />
          <span style={{ color: 'var(--text)' }}>Altair Analyse</span>
          {ticker && <><ChevronRight size={12} /><span className="text-primary font-mono font-medium">{ticker}</span></>}
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', fontFamily: "'Boska', serif" }}>Altair Deep-Dive</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>KI-gestützte Value-Analyse mit DCF, Conviction Score und Timing-Signal</p>
          </div>
          {report && (
            <div className="flex items-center gap-2 shrink-0 no-print">
              {formatCacheAge(report.cached_at) && (
                <span className="badge badge-yellow flex items-center gap-1" title={report.cached ? 'Aus dem Report-Cache geladen' : 'Zeitpunkt der letzten Analyse'}>
                  <Clock size={11} />
                  Stand: {formatCacheAge(report.cached_at)}
                </span>
              )}
              <WatchlistButton ticker={ticker} name={report?.company_name || report?.name} />
              <button
                onClick={() => handleAnalyse(ticker, true)}
                disabled={loading}
                className="btn-secondary text-sm"
              >
                <RefreshCw size={14} />
                Neu analysieren
              </button>
              <button
                onClick={() => window.print()}
                className="btn-secondary text-sm"
              >
                <Printer size={14} />
                PDF Export
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Free-use notice */}
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-xl mb-6 no-print"
        style={{ background: 'rgba(124,255,203,0.06)', border: '1px solid rgba(124,255,203,0.15)' }}
      >
        <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>Kostenlos & sofort verfügbar.</strong>{' '}
          Altair läuft über den NEXUS-Server (Groq llama-3.3-70b). Kein eigener API-Key notwendig.
          Für erweiterte Modelle kannst du optional eigene Keys in den{' '}
          <Link to="/settings" style={{ color: 'var(--primary)' }} className="hover:underline">Einstellungen</Link> hinterlegen.
        </p>
      </div>

      <ApiKeyGate hasApiKey={hasApiKey}>
        <div className="space-y-6">
          {/* Search bar */}
          <div className="card p-4 no-print">
            <div className="flex gap-2">
              <TickerSearch
                value={ticker}
                onChange={setTicker}
                onSelect={(sym) => { setTicker(sym); handleAnalyse(sym) }}
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleAnalyse()}
                  disabled={loading || !ticker.trim()}
                  className="btn-primary shrink-0"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Brain size={15} />}
                  {loading ? 'Analysiert…' : 'Analyse starten'}
                </button>
              </div>
            </div>

            {/* Progress — animated WebSocket steps */}
            {loading && (
              <div className="mt-4 space-y-3">
                {/* Active step — pulsing indicator */}
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{progressStep}</span>
                </div>

                {/* Completed steps log */}
                {progressLog.length > 0 && (
                  <div
                    ref={progressLogRef}
                    className="rounded-lg p-3 space-y-1.5 max-h-44 overflow-y-auto"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    {progressLog.map((msg, i) => (
                      <div key={i} className="progress-step flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        <CheckCircle size={11} className="text-primary mt-0.5 shrink-0" />
                        <span>{msg}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Indeterminate progress bar */}
                <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{
                      width: progressLog.length > 0 ? `${Math.min(90, (progressLog.length / 8) * 100)}%` : '15%',
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="alert-error">
              <AlertCircle size={16} className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!report && !loading && !error && (
            <div className="card p-12 text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Brain size={24} className="text-primary" />
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>Altair bereit</h3>
              <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
                Gib einen Aktien-Ticker ein (z.B. <span className="font-mono font-medium">AAPL</span>,
                <span className="font-mono font-medium"> VOW3.DE</span>,
                <span className="font-mono font-medium"> NESN.SW</span>) und starte die KI-Analyse.
              </p>
            </div>
          )}

          {/* Report */}
          {report && sections && (
            <div ref={reportRef} className="space-y-4">
              {/* Price chart + Conviction */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Price chart */}
                <div className="card report-card md:col-span-2">
                  <div className="card-header flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                      <BarChart2 size={14} />
                      Kursverlauf (12 Monate)
                    </h2>
                    <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>{ticker}</span>
                  </div>
                  <div className="card-body">
                    {history.length > 0 ? (
                      <StockChart data={history} height={160} showArea />
                    ) : (
                      <div className="flex items-center justify-center h-40 text-sm" style={{ color: 'var(--text-muted)' }}>
                        Kursdaten nicht verfügbar
                      </div>
                    )}
                  </div>
                </div>

                {/* Conviction gauge */}
                <div className="card report-card">
                  <div className="card-header">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Conviction Score</h2>
                  </div>
                  <div className="card-body flex flex-col items-center gap-3">
                    <ConvictionGauge score={sections.convictionScore ?? 0} size={150} />
                    {sections.timingSignal && (
                      <TimingBadge signal={sections.timingSignal} />
                    )}
                  </div>
                </div>
              </div>

              {/* Finanz-Snapshot */}
              {sections.snapshot && (
                <div className="card report-card">
                  <div className="card-header">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Finanz-Snapshot & Peer-Check</h2>
                  </div>
                  <div className="card-body">
                    <SimpleTable markdown={sections.snapshot} />
                  </div>
                </div>
              )}

              {/* DCF Chart */}
              {sections.scenarios?.length > 0 && (
                <div className="card report-card">
                  <div className="card-header">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>DCF Fair-Value Szenarien</h2>
                  </div>
                  <div className="card-body">
                    <DCFChart scenarios={sections.scenarios} currentPrice={sections.currentPrice} />
                  </div>
                </div>
              )}

              {/* Valuation section */}
              {sections.valuation && (
                <div className="card report-card">
                  <div className="card-header">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Bewertung & Szenarien</h2>
                  </div>
                  <div className="card-body">
                    <SimpleTable markdown={sections.valuation} />
                  </div>
                </div>
              )}

              {/* Returns table */}
              {sections.returns && (
                <div className="card report-card">
                  <div className="card-header">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Rendite-Erwartungen (3J / 5J)</h2>
                  </div>
                  <div className="card-body">
                    <SimpleTable markdown={sections.returns} />
                  </div>
                </div>
              )}

              {/* Quality */}
              {sections.quality && (
                <div className="card report-card">
                  <div className="card-header">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Qualität & Substanz</h2>
                  </div>
                  <div className="card-body">
                    <MarkdownSection content={sections.quality} />
                  </div>
                </div>
              )}

              {/* Pre-mortem */}
              {sections.preMortem && (
                <div className="card report-card" style={{ borderColor: 'rgba(245,158,11,0.3)' }}>
                  <div className="card-header" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
                    <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: '#f59e0b' }}>
                      <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                      Pre-Mortem Stresstest
                    </h2>
                  </div>
                  <div className="card-body">
                    <MarkdownSection content={sections.preMortem} />
                  </div>
                </div>
              )}

              {/* Conclusion */}
              {sections.conclusion && (
                <div className="card report-card" style={{ borderColor: 'rgba(79,142,247,0.2)' }}>
                  <div className="card-header" style={{ borderColor: 'rgba(79,142,247,0.2)', background: 'rgba(79,142,247,0.05)' }}>
                    <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--primary)' }}>
                      <Shield size={14} />
                      Abschluss-Dashboard & Kapitalallokation
                    </h2>
                  </div>
                  <div className="card-body">
                    <MarkdownSection content={sections.conclusion} />
                  </div>
                </div>
              )}

              {/* Sources */}
              {report?.sources?.length > 0 && (
                <div className="card report-card">
                  <div className="card-header">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Quellen</h2>
                  </div>
                  <div className="card-body">
                    <ul className="space-y-1.5">
                      {report.sources.map((src, i) => {
                        const url = typeof src === 'string' ? src : src?.url
                        const label = typeof src === 'string' ? src : (src?.title || src?.url)
                        if (!url) return null
                        return (
                          <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span className="shrink-0 mt-0.5" style={{ color: 'var(--primary)' }}>↗</span>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate" style={{ color: 'var(--primary)' }}>{label}</a>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              )}

              {/* Full text fallback if sections not parsed */}
              {!sections.snapshot && !sections.valuation && (
                <div className="card report-card">
                  <div className="card-header flex items-center justify-between">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Altair Analyse-Report</h2>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Volltext</span>
                  </div>
                  <div className="card-body">
                    <div
                      className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-4 text-xs"
                      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}
                    >
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      <span>Bericht-Struktur konnte nicht automatisch erkannt werden — Volltext wird angezeigt.</span>
                    </div>
                    <MarkdownSection content={report?.raw_content || report?.result || report?.report || report?.text || JSON.stringify(report, null, 2)} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ApiKeyGate>
    </div>
  )
}
