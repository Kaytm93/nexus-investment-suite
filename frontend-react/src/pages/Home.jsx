import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchMarketMovers, openMarketStream } from '../lib/api'
import StockChart from '../components/StockChart'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  WifiOff, RefreshCw, ChevronRight, Search, Brain
} from 'lucide-react'

gsap.registerPlugin(ScrollTrigger)

// ─── CountUp ──────────────────────────────────────────────────────────────────
function CountUp({ target, duration = 1.4, delay = 1.1, suffix = '' }) {
  const [val, setVal] = useState(0)
  const elRef = useRef(null)
  useGSAP(() => {
    const obj = { n: 0 }
    gsap.to(obj, {
      n: target, duration, delay,
      ease: 'power2.out',
      onUpdate: () => setVal(Math.round(obj.n)),
    })
  }, { scope: elRef })
  return <span ref={elRef}>{val}{suffix}</span>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function deriveExchange(symbol) {
  if (!symbol) return ''
  const s = symbol.toUpperCase()
  if (s.endsWith('.DE') || s === 'DAX' || s === '^GDAXI') return 'XETRA'
  if (s.endsWith('.L') || s === 'MSCIW' || s === 'IWDA.L') return 'LSE'
  if (s === 'SPX' || s === '^GSPC' || s === 'S&P500') return 'NYSE'
  if (s.endsWith('.SW')) return 'SIX'
  if (s.endsWith('.PA')) return 'Euronext'
  return 'NASDAQ'
}

function fmtDateTime(date) {
  if (!date) return '—'
  return date.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Index Card ────────────────────────────────────────────────────────────────
function IndexCard({ index, fetchedAt }) {
  const positive = index.change >= 0
  const exchange = deriveExchange(index.symbol)

  return (
    <div
      className="index-card rounded-2xl p-5 transition-all duration-300 group cursor-default"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {index.name}
            </p>
            {exchange && (
              <span
                className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', letterSpacing: '0.08em' }}
              >
                {exchange}
              </span>
            )}
          </div>
          <p
            className="text-3xl font-bold tabular"
            style={{ fontFamily: "'Satoshi', sans-serif", color: 'var(--text)' }}
          >
            {index.price != null
              ? index.price.toLocaleString('de-DE', { minimumFractionDigits: 2 })
              : '—'}
          </p>
        </div>
        <span
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-semibold shrink-0 mt-1"
          style={{
            background: positive ? 'rgba(124,255,203,0.12)' : 'rgba(255,77,109,0.12)',
            color: positive ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${positive ? 'rgba(124,255,203,0.25)' : 'rgba(255,77,109,0.25)'}`,
          }}
        >
          {positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
          {index.change == null || isNaN(index.change) ? '—' : `${positive ? '+' : ''}${index.change.toFixed(2)}%`}
        </span>
      </div>

      {index.spark?.length > 0 ? (
        <StockChart
          data={index.spark.filter(v => v != null && !isNaN(v)).map((v, i) => ({ date: i, value: v }))}
          color={positive ? '#7cffcb' : '#ff4d6d'}
          height={52} minimal showArea
        />
      ) : (
        <div className="h-12 flex items-center justify-center">
          <span className="text-xs" style={{ color: 'rgba(107,117,153,0.5)' }}>Keine Verlaufsdaten</span>
        </div>
      )}

      {fetchedAt && (
        <p className="text-[10px] font-mono mt-3" style={{ color: 'rgba(107,117,153,0.6)' }}>
          Stand: {fmtDateTime(fetchedAt)}
        </p>
      )}
    </div>
  )
}

// ─── Mover Row ─────────────────────────────────────────────────────────────────
function MoverRow({ item, isGainer }) {
  const exchange = deriveExchange(item.ticker)
  const short = item.ticker.replace(/\.[A-Z]+$/, '').slice(0, 3)
  return (
    <Link
      to={`/analyse?ticker=${item.ticker}`}
      className="mover-card screener-row flex items-center justify-between py-3 px-3 rounded-xl -mx-3 group"
      style={{ color: 'inherit' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold font-mono shrink-0"
          style={{
            background: isGainer ? 'rgba(124,255,203,0.1)' : 'rgba(255,77,109,0.1)',
            color: isGainer ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${isGainer ? 'rgba(124,255,203,0.2)' : 'rgba(255,77,109,0.2)'}`,
          }}
        >
          {short}
        </div>
        <div>
          <p className="text-sm font-semibold transition-colors" style={{ color: 'var(--text)' }}>
            {item.ticker}
          </p>
          <div className="flex items-center gap-1.5">
            <p className="text-xs max-w-[120px] truncate" style={{ color: 'var(--text-muted)' }}>{item.name}</p>
            {exchange && (
              <span
                className="text-[9px] font-mono px-1 py-px rounded shrink-0"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}
              >
                {exchange}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-mono font-medium tabular" style={{ color: 'var(--text)' }}>
          {item.price != null
            ? item.price.toLocaleString('de-DE', { minimumFractionDigits: 2 })
            : '—'}
        </p>
        <p
          className="text-xs font-mono font-semibold"
          style={{ color: isGainer ? 'var(--success)' : 'var(--danger)' }}
        >
          {item.change == null || isNaN(item.change) ? '—' : `${isGainer ? '+' : ''}${item.change.toFixed(2)}%`}
        </p>
      </div>
    </Link>
  )
}

// ─── Hero Visual (right column) ───────────────────────────────────────────────
function HeroVisual() {
  const METRICS = [
    { label: 'Conviction Score', value: '6.2 / 7', color: 'var(--accent)' },
    { label: 'DCF Fair Value',   value: '$218.40',  color: 'var(--text)' },
    { label: 'Upside Potenzial', value: '+24.3 %',  color: 'var(--accent)' },
    { label: 'Pre-Mortem Risk',  value: 'Mittel',   color: '#f59e0b' },
    { label: 'Timing-Signal',    value: 'Jetzt kaufen', color: 'var(--accent)' },
  ]
  const path = 'M0,55 C20,50 35,52 50,38 C65,24 75,30 90,20 C105,10 118,14 132,9 C146,4 158,6 172,3 C186,0 200,2 220,1 L240,0'
  return (
    <div className="hero-visual relative hidden md:block select-none">
      {/* Floating badge top-right */}
      <div
        className="absolute -top-3 -right-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
        style={{
          background: 'rgba(124,255,203,0.12)',
          border: '1px solid rgba(124,255,203,0.3)',
          color: 'var(--accent)',
          backdropFilter: 'blur(10px)',
          animation: 'fadeInUp 0.6s 1.2s ease both',
        }}
      >
        <span>▲ +24.3%</span>
        <span style={{ color: 'rgba(124,255,203,0.5)' }}>12M</span>
      </div>

      {/* Floating badge bottom-left */}
      <div
        className="absolute -bottom-3 -left-3 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono"
        style={{
          background: 'rgba(79,142,247,0.1)',
          border: '1px solid rgba(79,142,247,0.25)',
          color: 'var(--primary)',
          backdropFilter: 'blur(10px)',
          animation: 'fadeInUp 0.6s 1.4s ease both',
        }}
      >
        DCF Fair Value: $218
      </div>

      {/* Main card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'var(--surface-2)',
          border: '1px solid rgba(79,142,247,0.15)',
          boxShadow: '0 0 80px rgba(79,142,247,0.07), 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        {/* Card header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold font-mono"
              style={{ background: 'rgba(79,142,247,0.12)', color: 'var(--primary)', border: '1px solid rgba(79,142,247,0.2)' }}
            >
              AAPL
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Apple Inc.</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>NASDAQ · Tech</p>
            </div>
          </div>
          <span
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
            style={{ background: 'rgba(124,255,203,0.12)', color: 'var(--accent)', border: '1px solid rgba(124,255,203,0.25)' }}
          >
            ✓ KAUFEN
          </span>
        </div>

        {/* SVG chart */}
        <div className="relative px-5 pt-5 pb-2">
          <svg viewBox="0 0 240 62" className="w-full" style={{ height: 62, overflow: 'visible' }}>
            <defs>
              <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f8ef7" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#4f8ef7" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${path} L240,62 L0,62 Z`} fill="url(#hg)" />
            <path d={path} fill="none" stroke="#4f8ef7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Endpoint dot */}
            <circle cx="240" cy="0" r="3" fill="var(--accent)" style={{ filter: 'drop-shadow(0 0 4px var(--accent))' }} />
          </svg>
        </div>

        {/* Metrics */}
        <div className="px-5 pb-4 space-y-2.5">
          {METRICS.map(({ label, value, color }, i) => (
            <div
              key={label}
              className="flex items-center justify-between"
              style={{ animation: `fadeInUp 0.4s ${0.9 + i * 0.07}s ease both` }}
            >
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span className="text-xs font-mono font-semibold tabular" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Scan line */}
        <div
          className="absolute left-0 right-0 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(79,142,247,0.5) 50%, transparent 100%)',
            animation: 'scanline 4s ease-in-out infinite',
            top: '12%',
          }}
        />
      </div>
    </div>
  )
}

// ─── Demo Ticker (Elara card animation) ──────────────────────────────────────��─
const DEMO_TICKERS = ['MSFT', 'NVDA', 'ASML', 'SAP', 'GOOGL', 'META', 'BRK', 'TSLA', 'AMZN', 'AAPL']

function ElaraDemoTicker() {
  const [visible, setVisible] = useState([])
  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      if (i >= DEMO_TICKERS.length) { clearInterval(id); return }
      setVisible(v => [...v, { ticker: DEMO_TICKERS[i], score: Math.floor(60 + Math.random() * 38) }])
      i++
    }, 300)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="space-y-2 mt-4">
      {visible.map(({ ticker, score }) => (
        <div
          key={ticker}
          className="flex items-center justify-between px-3 py-2 rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            animation: 'fadeInUp 0.35s ease forwards',
          }}
        >
          <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text)' }}>{ticker}</span>
          <div className="flex items-center gap-2">
            <div
              className="h-1 rounded-full"
              style={{
                width: `${score * 0.6}px`,
                background: score > 75
                  ? 'linear-gradient(90deg, var(--primary), var(--accent))'
                  : 'linear-gradient(90deg, var(--primary), rgba(79,142,247,0.4))',
                boxShadow: score > 75 ? '0 0 8px rgba(124,255,203,0.4)' : 'none',
              }}
            />
            <span className="text-xs font-mono w-7 text-right" style={{ color: score > 75 ? 'var(--accent)' : 'var(--primary)' }}>
              {score}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Conviction Ring (Altair card animation) ────────────────────────────────────
function ConvictionRing() {
  const [score, setScore] = useState(0)
  const target = 5
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const pct = score / 7
  const offset = circumference - pct * circumference

  useEffect(() => {
    let current = 0
    const id = setInterval(() => {
      if (current >= target) { clearInterval(id); return }
      current += 0.1
      setScore(Math.min(current, target))
    }, 40)
    return () => clearInterval(id)
  }, [])

  const label = score >= 5 ? 'STRONG BUY' : score >= 3 ? 'BUY' : 'HOLD'
  const color = score >= 5 ? 'var(--accent)' : score >= 3 ? 'var(--primary)' : '#fbbf24'

  return (
    <div className="flex items-center gap-6 mt-4">
      <div className="relative w-24 h-24">
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle
            className="conviction-ring"
            cx="48" cy="48" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              filter: `drop-shadow(0 0 8px ${color})`,
              transition: 'stroke-dashoffset 0.1s linear',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular" style={{ color, fontFamily: "'Boska', serif" }}>
            {score.toFixed(1)}
          </span>
          <span className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>/ 7</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color }}>
          {label}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', maxWidth: '160px' }}>
          Conviction Score basierend auf DCF + Qualität + Katalysatoren
        </p>
        <div className="flex gap-2 mt-3">
          {['Base', 'Bull', 'Bear'].map((s, i) => (
            <span key={s} className="text-[10px] font-mono px-2 py-0.5 rounded-lg" style={{
              background: i === 0 ? 'rgba(79,142,247,0.12)' : i === 1 ? 'rgba(124,255,203,0.1)' : 'rgba(255,77,109,0.1)',
              color: i === 0 ? 'var(--primary)' : i === 1 ? 'var(--accent)' : 'var(--danger)',
              border: `1px solid ${i === 0 ? 'rgba(79,142,247,0.2)' : i === 1 ? 'rgba(124,255,203,0.2)' : 'rgba(255,77,109,0.2)'}`,
            }}>
              DCF {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth()
  const [indices, setIndices] = useState([])
  const [gainers, setGainers] = useState([])
  const [losers, setLosers] = useState([])
  const [loading, setLoading] = useState(true)
  const [backendOffline, setBackendOffline] = useState(false)
  const [fetchedAt, setFetchedAt] = useState(null)

  const heroRef = useRef(null)
  const marketRef = useRef(null)
  const featuresRef = useRef(null)
  const ctaRef = useRef(null)

  // Hero entrance — deferred to next frame so first paint includes visible text
  // (FCP-safe). Skipped entirely for prefers-reduced-motion.
  useGSAP(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = requestAnimationFrame(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('.hero-badge', { opacity: 0, y: -20, duration: 0.5 })
        .from('.hero-line', { opacity: 0, y: 60, duration: 0.8, stagger: 0.12 }, '-=0.2')
        .from('.hero-sub',  { opacity: 0, y: 24, duration: 0.6 }, '-=0.35')
        .from('.hero-cta',  { opacity: 0, y: 20, duration: 0.5, stagger: 0.1 }, '-=0.3')
        .from('.hero-stat', { opacity: 0, scale: 0.85, duration: 0.5, stagger: 0.08, ease: 'back.out(1.4)' }, '-=0.25')
        .from('.hero-visual', { opacity: 0, x: 40, duration: 0.9, ease: 'power2.out' }, '-=0.7')
    })
    return () => cancelAnimationFrame(id)
  }, { scope: heroRef })

  // Market cards stagger on data load
  useGSAP(() => {
    if (loading) return
    const cards = marketRef.current?.querySelectorAll('.index-card')
    if (!cards?.length) return
    gsap.fromTo(cards,
      { opacity: 0, y: 32 },
      { opacity: 1, y: 0, duration: 0.55, stagger: 0.1, ease: 'power2.out' }
    )
  }, { scope: marketRef, dependencies: [loading, indices.length] })

  // ScrollTrigger: feature cards + CTA
  useGSAP(() => {
    document.querySelectorAll('.feature-card').forEach((card, i) => {
      gsap.from(card, {
        scrollTrigger: { trigger: card, start: 'top 85%', once: true },
        opacity: 0,
        x: i % 2 === 0 ? -40 : 40,
        duration: 0.7,
        ease: 'power2.out',
      })
    })
    gsap.from('.cta-section', {
      scrollTrigger: { trigger: '.cta-section', start: 'top 90%', once: true },
      opacity: 0,
      y: 40,
      duration: 0.7,
      ease: 'power2.out',
    })
  }, [])

  const loadData = async () => {
    setLoading(true)
    setBackendOffline(false)
    try {
      const data = await fetchMarketMovers()
      if (data?.indices?.length) setIndices(data.indices)
      if (data?.gainers?.length) setGainers(data.gainers)
      if (data?.losers?.length) setLosers(data.losers)
      setFetchedAt(new Date())
    } catch {
      setBackendOffline(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const stream = openMarketStream(data => {
      if (Array.isArray(data?.indices)) setIndices(data.indices)
      if (Array.isArray(data?.gainers)) setGainers(data.gainers)
      if (Array.isArray(data?.losers)) setLosers(data.losers)
      if (data?.fetched_at) setFetchedAt(new Date(data.fetched_at))
      setBackendOffline(false)
    })
    stream.onerror = () => setBackendOffline(true)
    return () => stream.close()
  }, [])

  return (
    <div style={{ background: 'var(--bg)' }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative overflow-hidden flex items-center"
        style={{ background: 'var(--bg)', minHeight: 'calc(100dvh - 4rem)' }}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            mask: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
            WebkitMask: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
          }}
        />

        {/* Glow blobs */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '-10%', right: '5%',
            width: '600px', height: '600px',
            background: 'radial-gradient(circle, rgba(79,142,247,0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: '5%', left: '-5%',
            width: '400px', height: '400px',
            background: 'radial-gradient(circle, rgba(124,255,203,0.07) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
          {/* KI Badge */}
          <div
            className="hero-badge inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-medium mb-6"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(232,234,240,0.7)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full rounded-full"
                style={{ background: 'var(--accent)', animation: 'ping-slow 2s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.7 }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }}
              />
            </span>
            KI aktiv — Powered by Groq
          </div>

          {/* Headline */}
          <div className="max-w-4xl mb-5">
            <h1
              className="leading-none tracking-tight"
              style={{
                fontFamily: "'Boska', Georgia, serif",
                fontWeight: 300,
                fontSize: 'clamp(2.6rem, 6.5vw, 5.5rem)',
              }}
            >
              <span className="hero-line block" style={{ color: 'var(--text)' }}>Institutionelle</span>
              <span className="hero-line block" style={{ color: 'var(--text)' }}>Investment-Analyse.</span>
              <span className="hero-line block" style={{ color: 'var(--primary)', textShadow: '0 0 80px rgba(79,142,247,0.4)' }}>Für jeden.</span>
            </h1>
          </div>

          <p
            className="hero-sub text-base sm:text-lg max-w-xl mb-7 leading-relaxed"
            style={{ color: 'rgba(232,234,240,0.55)' }}
          >
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Elara</strong> screent Sektoren quantamental.{' '}
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>Altair</strong> liefert DCF-Analyse und Conviction Score.
            Professionelles Research in Sekunden.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3 mb-10">
            {user ? (
              <>
                <Link
                  to="/screener"
                  className="hero-cta hero-cta-primary inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-semibold"
                  style={{
                    background: 'var(--accent)',
                    color: '#0a0f1e',
                    boxShadow: '0 0 32px rgba(124,255,203,0.3)',
                  }}

                >
                  <Search size={15} /> Screener starten
                </Link>
                <Link
                  to="/analyse"
                  className="hero-cta hero-cta-primary inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-semibold"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(8px)',
                  }}

                >
                  <Brain size={15} /> Aktie analysieren
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="hero-cta hero-cta-primary inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-semibold"
                  style={{
                    background: 'var(--accent)',
                    color: '#0a0f1e',
                    boxShadow: '0 0 32px rgba(124,255,203,0.3)',
                  }}

                >
                  Kostenlos starten <ChevronRight size={15} />
                </Link>
                <Link
                  to="/screener"
                  className="hero-cta hero-cta-primary inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-sm font-semibold"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}

                >
                  Demo ansehen
                </Link>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-8 sm:gap-14">
            {[
              { value: null,  countTo: 14, label: 'Sektoren' },
              { value: '0–7', label: 'Conviction Score' },
              { value: 'DCF', label: 'Bewertungsmodell' },
              { value: 'Live', label: 'KI-Analyse' },
            ].map(({ value, countTo, label }) => (
              <div key={label} className="hero-stat">
                <p
                  className="text-3xl font-bold tabular"
                  style={{ fontFamily: "'Boska', serif", color: 'var(--text)' }}
                >
                  {countTo != null ? <CountUp target={countTo} /> : value}
                </p>
                <p
                  className="text-[10px] uppercase tracking-widest mt-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
          </div>{/* end left col */}

          {/* Right column — Analysis Visual */}
          <HeroVisual />

          </div>{/* end grid */}
        </div>
      </section>

      {/* ── MARKET OVERVIEW ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12" ref={marketRef}>

        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2
                className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-1"
                style={{ fontFamily: "'Boska', serif", color: 'var(--text)' }}
              >
                Marktüberblick
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Live-Daten der wichtigsten Indizes
              </p>
            </div>
            <div className="flex items-center gap-4">
              {fetchedAt && !loading && (
                <span className="text-xs font-mono hidden sm:block" style={{ color: 'var(--text-muted)' }}>
                  {fmtDateTime(fetchedAt)}
                </span>
              )}
              {!loading && (
                <button
                  onClick={loadData}
                  className="market-refresh inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 -mr-3 rounded-lg text-xs"
                  style={{ color: 'var(--text-muted)' }}

                  aria-label="Marktdaten aktualisieren"
                >
                  <RefreshCw size={12} /> Aktualisieren
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-2xl p-5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="skeleton h-3 w-16 mb-3 rounded" />
                  <div className="skeleton h-9 w-28 mb-5 rounded" />
                  <div className="skeleton h-12 w-full rounded" />
                </div>
              ))}
            </div>
          ) : backendOffline ? (
            <div
              className="rounded-2xl p-10 text-center"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <WifiOff size={24} className="mx-auto mb-3" style={{ color: 'rgba(107,117,153,0.4)' }} />
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>Backend nicht erreichbar</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Kursdaten werden nur über das Backend geladen.
              </p>
              <button onClick={loadData} className="btn-secondary text-xs">
                <RefreshCw size={12} /> Erneut versuchen
              </button>
            </div>
          ) : indices.length === 0 ? (
            <div className="rounded-2xl p-8 text-center space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Indexdaten konnten nicht geladen werden</p>
              <button onClick={loadData} className="btn-secondary text-xs mx-auto">
                <RefreshCw size={12} /> Erneut versuchen
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {indices.map(idx => <IndexCard key={idx.symbol} index={idx} fetchedAt={fetchedAt} />)}
            </div>
          )}
        </section>

        {/* ── Größte Bewegungen ────────────────────────────────────────── */}
        <section>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6"
            style={{ fontFamily: "'Boska', serif", color: 'var(--text)' }}
          >
            Größte Bewegungen
          </h2>

          {backendOffline ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <WifiOff size={18} className="mx-auto mb-2" style={{ color: 'rgba(107,117,153,0.4)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Backend offline</p>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map(i => (
                <div key={i} className="rounded-2xl p-5 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  {[1,2,3].map(j => <div key={j} className="skeleton h-12 w-full rounded-xl" />)}
                </div>
              ))}
            </div>
          ) : gainers.length === 0 && losers.length === 0 ? (
            <div className="rounded-2xl p-8 text-center space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Marktdaten konnten nicht geladen werden</p>
              <button onClick={loadData} className="btn-secondary text-xs mx-auto">
                <RefreshCw size={12} /> Erneut versuchen
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl p-5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={14} style={{ color: 'var(--success)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Top Gewinner</h3>
                </div>
                <div>
                  {gainers.map(item => <MoverRow key={item.ticker} item={item} isGainer />)}
                </div>
              </div>
              <div className="rounded-2xl p-5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingDown size={14} style={{ color: 'var(--danger)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Top Verlierer</h3>
                </div>
                <div>
                  {losers.map(item => <MoverRow key={item.ticker} item={item} isGainer={false} />)}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── WIE ES FUNKTIONIERT ──────────────────────────────────────── */}
        <section ref={featuresRef}>
          <div className="mb-8">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-1"
              style={{ fontFamily: "'Boska', serif", color: 'var(--text)' }}
            >
              Zwei KI-Systeme. Ein Ziel.
            </h2>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              Institutionelles Research — demokratisiert
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ELARA */}
            <div
              className="feature-card rounded-2xl p-7"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.2)' }}
                >
                  <Search size={18} style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <h3
                    className="text-2xl font-bold"
                    style={{ fontFamily: "'Boska', serif", color: 'var(--text)' }}
                  >
                    Elara
                  </h3>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--primary)' }}>
                    Sektor-Screener
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed mb-1" style={{ color: 'rgba(232,234,240,0.6)' }}>
                Quantamentaler Screening-Algorithmus. Analysiert bis zu 30 Titel pro Sektor
                nach Bewertung, Qualität, Risiko und Wachstum — und rankt sie im Elara Score.
              </p>

              <ElaraDemoTicker />

              <div className="flex flex-wrap gap-2 mt-5">
                {['14 Sektoren', 'Elara Score', 'Moat-Bewertung', 'Risikofilter'].map(tag => (
                  <span key={tag} className="badge badge-blue">{tag}</span>
                ))}
              </div>
              <Link to="/screener" className="btn-secondary mt-5 w-full justify-center">
                Screener öffnen <ChevronRight size={14} />
              </Link>
            </div>

            {/* ALTAIR */}
            <div
              className="feature-card rounded-2xl p-7"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(124,255,203,0.08)', border: '1px solid rgba(124,255,203,0.15)' }}
                >
                  <Brain size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <h3
                    className="text-2xl font-bold"
                    style={{ fontFamily: "'Boska', serif", color: 'var(--text)' }}
                  >
                    Altair
                  </h3>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
                    Deep-Dive Analyst
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed mb-1" style={{ color: 'rgba(232,234,240,0.6)' }}>
                Vollständige Value-Analyse mit DCF-Modell, Szenario-Bewertung,
                Pre-Mortem Stresstest und Conviction Score.
              </p>

              <ConvictionRing />

              <div className="flex flex-wrap gap-2 mt-5">
                {['DCF-Modell', 'Conviction 0–7', 'Timing-Signal', 'Rendite-Prognose'].map(tag => (
                  <span key={tag} className="badge badge-green">{tag}</span>
                ))}
              </div>
              <Link to="/analyse" className="btn-primary mt-5 w-full justify-center">
                Aktie analysieren <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <section className="cta-section pb-8">
          <div
            className="rounded-3xl p-12 sm:p-16 text-center relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(79,142,247,0.12) 0%, rgba(124,255,203,0.06) 100%)',
              border: '1px solid rgba(79,142,247,0.2)',
            }}
          >
            <div
              className="absolute pointer-events-none"
              style={{
                top: '-30%', left: '50%', transform: 'translateX(-50%)',
                width: '500px', height: '300px',
                background: 'radial-gradient(ellipse, rgba(79,142,247,0.15) 0%, transparent 70%)',
                filter: 'blur(40px)',
              }}
            />
            <div className="relative">
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: 'var(--primary)' }}
              >
                Bereit?
              </p>
              <h2
                className="text-4xl sm:text-5xl font-bold mb-4 leading-tight"
                style={{ fontFamily: "'Boska', serif", color: 'var(--text)' }}
              >
                Research auf institutionellem Niveau.
              </h2>
              <p className="text-base mb-10 max-w-md mx-auto" style={{ color: 'rgba(232,234,240,0.55)' }}>
                Kein Bloomberg-Terminal. Keine 5-stellige Jahresgebühr.
                Nur Ergebnisse.
              </p>
              <Link
                to={user ? '/screener' : '/auth'}
                className="hero-cta hero-cta-primary hero-cta-large inline-flex items-center gap-2 px-10 py-4 rounded-2xl text-base font-semibold"
                style={{
                  background: 'var(--accent)',
                  color: '#0a0f1e',
                  boxShadow: '0 0 48px rgba(124,255,203,0.35)',
                }}

              >
                {user ? 'Screener starten' : 'Kostenlos starten'} <ChevronRight size={18} />
              </Link>
            </div>
          </div>
        </section>

      </div>

    </div>
  )
}
