import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  testApiKey, saveApiKey, getKeyStatus,
  saveAlphaVantageKey, checkHealth
} from '../lib/api'
import {
  Key, CheckCircle, XCircle, Loader2, Eye, EyeOff, Copy, Check,
  Globe, Shield, User, AlertTriangle, ChevronDown,
  Zap, Activity, Brain, Sparkles
} from 'lucide-react'

// ─── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ ok, label }) {
  if (ok === null || ok === undefined) return null
  return ok ? (
    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--success)' }}>
      <CheckCircle size={12} /> {label || 'Verbunden'}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--danger)' }}>
      <XCircle size={12} /> {label || 'Fehler'}
    </span>
  )
}

// ─── Primary section card ──────────────────────────────────────────────────────
function Section({ icon: Icon, title, badge, children, accent }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'var(--surface-2)',
        border: `1px solid ${accent ? 'rgba(79,142,247,0.3)' : 'var(--border)'}`,
      }}
    >
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{
          background: accent ? 'rgba(79,142,247,0.06)' : 'rgba(255,255,255,0.02)',
          borderBottom: `1px solid ${accent ? 'rgba(79,142,247,0.15)' : 'var(--border)'}`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: accent ? 'rgba(79,142,247,0.15)' : 'rgba(255,255,255,0.06)' }}
          >
            <Icon size={14} style={{ color: accent ? 'var(--primary)' : 'var(--text-muted)' }} />
          </div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        </div>
        {badge}
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  )
}

// ─── Collapsible section ────────────────────────────────────────────────────────
function CollapsibleSection({ icon: Icon, title, badge, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <button
        className="w-full px-6 py-4 flex items-center justify-between transition-colors"
        style={{ color: 'inherit' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <Icon size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</span>
          {badge && <span className="ml-1">{badge}</span>}
        </div>
        <ChevronDown
          size={15}
          style={{
            color: 'var(--text-muted)',
            transition: 'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>
      {open && (
        <div className="p-6 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Password input ────────────────────────────────────────────────────────────
function SecretInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="input-field pr-10 font-mono text-xs"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        aria-label={show ? 'Key verbergen' : 'Key anzeigen'}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  )
}

function maskApiKey(value) {
  if (!value) return ''
  const key = value.trim()
  if (key.length <= 8) return `${key.slice(0, 3)}****`
  return `${key.slice(0, 4)}****…${key.slice(-4)}`
}

function getStatusPreview(status, provider) {
  const candidates = [
    status?.[`${provider}_preview`],
    status?.[`${provider}Preview`],
    typeof status?.[provider] === 'string' ? status[provider] : null,
  ]
  return candidates.find(value => typeof value === 'string' && value.trim()) || ''
}

function SavedKeyPreview({ value, configured, label = 'Gespeicherter Key' }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!configured) return null

  const displayValue = value || 'Gespeicherter Key'
  const canReveal = Boolean(value)
  const handleCopy = async () => {
    if (!value || !navigator.clipboard) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(124,255,203,0.05)', border: '1px solid rgba(124,255,203,0.12)' }}>
      <Key size={13} style={{ color: 'var(--accent)' }} />
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <code className="min-w-0 flex-1 truncate text-xs font-mono" style={{ color: 'var(--text)' }}>
        {revealed && canReveal ? displayValue : (value ? maskApiKey(value) : 'Hinterlegt')}
      </code>
      <button
        type="button"
        className="shrink-0 transition-colors"
        onClick={() => canReveal && setRevealed(current => !current)}
        disabled={!canReveal}
        style={{ color: canReveal ? 'var(--text-muted)' : 'var(--border)', cursor: canReveal ? 'pointer' : 'not-allowed' }}
        aria-label={revealed ? 'Key verbergen' : 'Key aufdecken'}
        title={canReveal ? (revealed ? 'Key verbergen' : 'Key aufdecken') : 'Key kann nach dem Reload nicht aufgedeckt werden'}
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        type="button"
        className="shrink-0 transition-colors"
        onClick={handleCopy}
        disabled={!value}
        style={{ color: value ? (copied ? 'var(--accent)' : 'var(--text-muted)') : 'var(--border)', cursor: value ? 'pointer' : 'not-allowed' }}
        aria-label="Key kopieren"
        title={value ? 'Key kopieren' : 'Key ist nach dem Reload nicht verfügbar'}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  )
}

// ─── Provider pill ─────────────────────────────────────────────────────────────
function ProviderPill({ active, label, model }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        background: active ? 'rgba(79,142,247,0.07)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${active ? 'rgba(79,142,247,0.2)' : 'var(--border)'}`,
      }}
    >
      {active ? (
        <div className="relative flex h-2.5 w-2.5 shrink-0">
          <span
            className="absolute inline-flex h-full w-full rounded-full"
            style={{ background: 'var(--primary)', animation: 'ping-slow 2s cubic-bezier(0,0,0.2,1) infinite', opacity: 0.5 }}
          />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: 'var(--primary)' }} />
        </div>
      ) : (
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: 'rgba(107,117,153,0.4)' }} />
      )}
      <div>
        <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{label}</p>
        {model && <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{model}</p>}
      </div>
      {active && (
        <span
          className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ color: 'var(--primary)', background: 'rgba(79,142,247,0.12)' }}
        >
          Aktiv
        </span>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Settings() {
  const { user, signOut, refreshKeyStatus } = useAuth()

  const [claudeKey,    setClaudeKey]    = useState('')
  const [claudeSaving, setClaudeSaving] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState(null)
  const [claudeMsg,    setClaudeMsg]    = useState('')

  const [openaiKey,    setOpenaiKey]    = useState('')
  const [openaiSaving, setOpenaiSaving] = useState(false)
  const [openaiStatus, setOpenaiStatus] = useState(null)
  const [openaiMsg,    setOpenaiMsg]    = useState('')

  const [geminiKey,    setGeminiKey]    = useState('')
  const [geminiSaving, setGeminiSaving] = useState(false)
  const [geminiStatus, setGeminiStatus] = useState(null)
  const [geminiMsg,    setGeminiMsg]    = useState('')

  const [avKey,    setAvKey]    = useState('')
  const [avSaving, setAvSaving] = useState(false)
  const [avStatus, setAvStatus] = useState(null)
  const [avMsg,    setAvMsg]    = useState('')

  const [tavilyKey, setTavilyKey] = useState('')
  const [tavSaving, setTavSaving] = useState(false)
  const [tavStatus, setTavStatus] = useState(null)
  const [tavMsg,    setTavMsg]    = useState('')

  const [backendOk, setBackendOk] = useState(null)
  const [keyPreviews, setKeyPreviews] = useState({})

  useEffect(() => {
    const init = async () => {
      const ok = await checkHealth()
      setBackendOk(ok)
      try {
        const status = await getKeyStatus()
        setKeyPreviews({
          claude: getStatusPreview(status, 'claude'),
          openai: getStatusPreview(status, 'openai'),
          gemini: getStatusPreview(status, 'gemini'),
          tavily: getStatusPreview(status, 'tavily'),
          alphavantage: getStatusPreview(status, 'alphavantage'),
        })
        if (status?.claude)       { setClaudeStatus(true) }
        if (status?.alphavantage) setAvStatus(true)
        if (status?.tavily)       setTavStatus(true)
        if (status?.openai)       setOpenaiStatus(true)
        if (status?.gemini)       setGeminiStatus(true)
      } catch { /* ignore */ }
    }
    init()
  }, [])

  const handleClaudeTest = async () => {
    if (!claudeKey.trim()) return
    setClaudeSaving(true); setClaudeMsg('')
    try {
      await testApiKey('claude', claudeKey.trim())
      setClaudeMsg('Key gültig.'); setClaudeStatus(true)
    } catch (e) { setClaudeMsg(`Fehler: ${e.message}`); setClaudeStatus(false) }
    finally { setClaudeSaving(false) }
  }
  const handleClaudeSave = async () => {
    if (!claudeKey.trim()) return
    setClaudeSaving(true); setClaudeMsg('')
    try {
      await saveApiKey('claude', claudeKey.trim())
      setClaudeMsg('Gespeichert.'); setClaudeStatus(true); setKeyPreviews(current => ({ ...current, claude: claudeKey.trim() })); refreshKeyStatus()
    } catch (e) { setClaudeMsg(`Fehler: ${e.message}`) }
    finally { setClaudeSaving(false) }
  }

  const handleOpenaiTest = async () => {
    if (!openaiKey.trim()) return
    setOpenaiSaving(true); setOpenaiMsg('')
    try {
      await testApiKey('openai', openaiKey.trim())
      setOpenaiMsg('Key gültig.'); setOpenaiStatus(true)
    } catch (e) { setOpenaiMsg(`Fehler: ${e.message}`); setOpenaiStatus(false) }
    finally { setOpenaiSaving(false) }
  }
  const handleOpenaiSave = async () => {
    if (!openaiKey.trim()) return
    setOpenaiSaving(true); setOpenaiMsg('')
    try {
      await saveApiKey('openai', openaiKey.trim())
      setOpenaiMsg('Gespeichert.'); setOpenaiStatus(true); setKeyPreviews(current => ({ ...current, openai: openaiKey.trim() }))
    } catch (e) { setOpenaiMsg(`Fehler: ${e.message}`) }
    finally { setOpenaiSaving(false) }
  }

  const handleGeminiTest = async () => {
    if (!geminiKey.trim()) return
    setGeminiSaving(true); setGeminiMsg('')
    try {
      await testApiKey('gemini', geminiKey.trim())
      setGeminiMsg('Key gültig.'); setGeminiStatus(true)
    } catch (e) { setGeminiMsg(`Fehler: ${e.message}`); setGeminiStatus(false) }
    finally { setGeminiSaving(false) }
  }
  const handleGeminiSave = async () => {
    if (!geminiKey.trim()) return
    setGeminiSaving(true); setGeminiMsg('')
    try {
      await saveApiKey('gemini', geminiKey.trim())
      setGeminiMsg('Gespeichert.'); setGeminiStatus(true); setKeyPreviews(current => ({ ...current, gemini: geminiKey.trim() }))
    } catch (e) { setGeminiMsg(`Fehler: ${e.message}`) }
    finally { setGeminiSaving(false) }
  }

  const handleAvSave = async () => {
    if (!avKey.trim()) return
    setAvSaving(true); setAvMsg('')
    try {
      await saveAlphaVantageKey(avKey.trim())
      setAvMsg('Gespeichert.'); setAvStatus(true); setKeyPreviews(current => ({ ...current, alphavantage: avKey.trim() }))
    } catch (e) { setAvMsg(`Fehler: ${e.message}`) }
    finally { setAvSaving(false) }
  }

  const handleTavSave = async () => {
    if (!tavilyKey.trim()) return
    setTavSaving(true); setTavMsg('')
    try {
      await saveApiKey('tavily', tavilyKey.trim())
      setTavMsg('Gespeichert.'); setTavStatus(true); setKeyPreviews(current => ({ ...current, tavily: tavilyKey.trim() }))
    } catch (e) { setTavMsg(`Fehler: ${e.message}`) }
    finally { setTavSaving(false) }
  }

  const linkStyle = { color: 'var(--primary)' }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-5">

      <div className="mb-2">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Boska', serif", color: 'var(--text)' }}>
          Einstellungen
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          API-Keys, KI-Provider und Profil verwalten.
        </p>
      </div>

      {backendOk === false && (
        <div className="alert-warning">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Backend nicht erreichbar</p>
            <p className="text-xs mt-0.5">
              Starte:{' '}
              <code
                className="font-mono px-1.5 py-0.5 rounded text-xs"
                style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
              >
                python backend/main.py
              </code>
            </p>
          </div>
        </div>
      )}

      {/* Provider Status */}
      <div
        className="rounded-2xl p-5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} style={{ color: 'var(--primary)' }} />
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            KI-Provider Status
          </h2>
        </div>
        <div className="space-y-2">
          <ProviderPill active={true} label="Groq Cloud (Standard)" model="llama-3.3-70b-versatile — kostenlos" />
          <ProviderPill active={claudeStatus === true} label="Claude API (optional)" model={claudeStatus ? 'sk-ant-... konfiguriert' : 'Nicht hinterlegt'} />
          <ProviderPill active={openaiStatus === true} label="OpenAI API (optional)" model={openaiStatus ? 'sk-... konfiguriert' : 'Nicht hinterlegt'} />
          <ProviderPill active={geminiStatus === true} label="Gemini API (optional)" model={geminiStatus ? 'AIza... konfiguriert' : 'Nicht hinterlegt'} />
        </div>
      </div>

      {/* Groq */}
      <Section icon={Zap} title="Groq Cloud API — Aktiver Provider" badge={<StatusBadge ok={true} label="Aktiv" />} accent>
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(124,255,203,0.06)', border: '1px solid rgba(124,255,203,0.15)' }}
        >
          <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
            <strong>Kostenlos & sofort nutzbar.</strong>{' '}
            <span style={{ color: 'var(--text-muted)' }}>
              Elara und Altair laufen über den NEXUS-Server-Key auf Groq (llama-3.3-70b). Kein eigener Key notwendig.
            </span>
          </p>
        </div>
      </Section>

      {/* Claude */}
      <CollapsibleSection
        icon={Brain}
        title="Claude API — Optionaler Provider"
        badge={claudeStatus ? <StatusBadge ok={true} label="Konfiguriert" /> : null}
      >
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Alternativ zu Groq kannst du <strong style={{ color: 'var(--text)' }}>Claude (Anthropic)</strong> als
          KI-Provider nutzen. Key wird im gleichen Slot gespeichert.
        </p>
        <div>
          <label className="label">Claude API-Key</label>
          <SecretInput value={claudeKey} onChange={setClaudeKey} placeholder="sk-ant-api03-..." disabled={claudeSaving} />
          <SavedKeyPreview value={keyPreviews.claude} configured={claudeStatus} />
          {claudeStatus && !claudeKey && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              ✓ Key hinterlegt — neuen eingeben zum Überschreiben
            </p>
          )}
        </div>
        {claudeMsg && <p className="text-xs" style={{ color: claudeStatus ? 'var(--success)' : 'var(--danger)' }}>{claudeMsg}</p>}
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={handleClaudeTest} disabled={claudeSaving || !claudeKey.trim()}>
            {claudeSaving && <Loader2 size={13} className="animate-spin" />} Testen
          </button>
          <button className="btn-primary text-xs" onClick={handleClaudeSave} disabled={claudeSaving || !claudeKey.trim()}>
            {claudeSaving && <Loader2 size={13} className="animate-spin" />} Speichern
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Key holen:{' '}
          <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={linkStyle} className="hover:underline">
            console.anthropic.com
          </a>
        </p>
      </CollapsibleSection>

      {/* OpenAI */}
      <CollapsibleSection
        icon={Sparkles}
        title="OpenAI API — Premium-Modelle (optional)"
        badge={openaiStatus ? <StatusBadge ok={true} label="Konfiguriert" /> : null}
      >
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Schaltet <strong style={{ color: 'var(--text)' }}>GPT-4o und o1</strong> als alternative KI-Provider frei.
          Eigener Key über OpenAI Platform.
        </p>
        <div>
          <label className="label">OpenAI API-Key</label>
          <SecretInput value={openaiKey} onChange={setOpenaiKey} placeholder="sk-proj-..." disabled={openaiSaving} />
          <SavedKeyPreview value={keyPreviews.openai} configured={openaiStatus} />
          {openaiStatus && !openaiKey && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              ✓ Key hinterlegt — neuen eingeben zum Überschreiben
            </p>
          )}
        </div>
        {openaiMsg && <p className="text-xs" style={{ color: openaiStatus ? 'var(--success)' : 'var(--danger)' }}>{openaiMsg}</p>}
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={handleOpenaiTest} disabled={openaiSaving || !openaiKey.trim()}>
            {openaiSaving && <Loader2 size={13} className="animate-spin" />} Testen
          </button>
          <button className="btn-primary text-xs" onClick={handleOpenaiSave} disabled={openaiSaving || !openaiKey.trim()}>
            {openaiSaving && <Loader2 size={13} className="animate-spin" />} Speichern
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Key holen:{' '}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={linkStyle} className="hover:underline">
            platform.openai.com
          </a>
        </p>
      </CollapsibleSection>

      {/* Gemini */}
      <CollapsibleSection
        icon={Brain}
        title="Gemini API — Google AI (optional)"
        badge={geminiStatus ? <StatusBadge ok={true} label="Konfiguriert" /> : null}
      >
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Schaltet <strong style={{ color: 'var(--text)' }}>Gemini 2.5 Pro</strong> als optionalen Provider frei.
          Kostenloser Tarif verfügbar via Google AI Studio.
        </p>
        <div>
          <label className="label">Gemini API-Key</label>
          <SecretInput value={geminiKey} onChange={setGeminiKey} placeholder="AIzaSy..." disabled={geminiSaving} />
          <SavedKeyPreview value={keyPreviews.gemini} configured={geminiStatus} />
          {geminiStatus && !geminiKey && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              ✓ Key hinterlegt — neuen eingeben zum Überschreiben
            </p>
          )}
        </div>
        {geminiMsg && <p className="text-xs" style={{ color: geminiStatus ? 'var(--success)' : 'var(--danger)' }}>{geminiMsg}</p>}
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={handleGeminiTest} disabled={geminiSaving || !geminiKey.trim()}>
            {geminiSaving && <Loader2 size={13} className="animate-spin" />} Testen
          </button>
          <button className="btn-primary text-xs" onClick={handleGeminiSave} disabled={geminiSaving || !geminiKey.trim()}>
            {geminiSaving && <Loader2 size={13} className="animate-spin" />} Speichern
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Key holen:{' '}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={linkStyle} className="hover:underline">
            aistudio.google.com
          </a>
          {' '}— Kostenloser Tarif verfügbar.
        </p>
      </CollapsibleSection>

      {/* Tavily */}
      <Section icon={Globe} title="Tavily — Web-Suche" badge={<StatusBadge ok={tavStatus} />}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Aktuelle Nachrichten und Marktinfos für Altair-Analysen. Kostenloser Tarif: 1.000 Suchen/Monat.
        </p>
        <div>
          <label className="label">Tavily API-Key</label>
          <SecretInput value={tavilyKey} onChange={setTavilyKey} placeholder="tvly-..." disabled={tavSaving} />
          <SavedKeyPreview value={keyPreviews.tavily} configured={tavStatus} />
        </div>
        {tavMsg && <p className="text-xs" style={{ color: tavStatus ? 'var(--success)' : 'var(--danger)' }}>{tavMsg}</p>}
        <div className="flex gap-2">
          <button className="btn-primary text-xs" onClick={handleTavSave} disabled={tavSaving || !tavilyKey.trim()}>
            {tavSaving && <Loader2 size={13} className="animate-spin" />} Speichern
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Key holen:{' '}
          <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" style={linkStyle} className="hover:underline">tavily.com</a>
        </p>
      </Section>

      {/* Alpha Vantage */}
      <CollapsibleSection
        icon={Shield}
        title="Alpha Vantage — Kursdaten Fallback (optional)"
        badge={avStatus ? <StatusBadge ok={true} label="Konfiguriert" /> : null}
      >
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Optionaler Fallback für Kursdaten wenn yfinance Lücken hat. Kostenlos: 25 Anfragen/Tag.
        </p>
        <div>
          <label className="label">Alpha Vantage API-Key</label>
          <SecretInput value={avKey} onChange={setAvKey} placeholder="XXXXXXXXXXXXXX" disabled={avSaving} />
          <SavedKeyPreview value={keyPreviews.alphavantage} configured={avStatus} />
        </div>
        {avMsg && <p className="text-xs" style={{ color: avStatus ? 'var(--success)' : 'var(--danger)' }}>{avMsg}</p>}
        <div className="flex gap-2">
          <button className="btn-primary text-xs" onClick={handleAvSave} disabled={avSaving || !avKey.trim()}>
            {avSaving && <Loader2 size={13} className="animate-spin" />} Speichern
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Key holen:{' '}
          <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" style={linkStyle} className="hover:underline">
            alphavantage.co
          </a>
        </p>
      </CollapsibleSection>

      {/* Profil */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        <div
          className="px-6 py-4 flex items-center gap-2.5"
          style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <User size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Profil</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-0">
            {[
              { label: 'E-Mail',       value: user?.email || '—',                                                                           mono: true  },
              { label: 'Nutzername',   value: user?.user_metadata?.username || '—',                                                         mono: false },
              { label: 'Mitglied seit',value: user?.created_at ? new Date(user.created_at).toLocaleDateString('de-DE') : '—',               mono: true  },
            ].map(({ label, value, mono }) => (
              <div
                key={label}
                className="flex items-center justify-between py-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className={`text-xs font-medium ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text)' }}>{value}</span>
              </div>
            ))}
          </div>
          <button onClick={() => signOut().catch(console.error)} className="btn-danger text-xs">
            Abmelden
          </button>
        </div>
      </div>

    </div>
  )
}
