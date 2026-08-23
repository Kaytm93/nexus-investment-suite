# NEXUS Investment Suite — Vollständiger Projektkontext

> Letzte Aktualisierung: 2026-08-23 | Stand: ProtectedRoute-Bluescreen behoben + Regressionstest ergänzt; zuvor Echte Live-Kurse + Portfolio Transaktions-History + Settings Key-Vorschau + Bundle-Splitting + Recovery-Flow + GSAP Refactor

---

## ⚠️ Pflicht-Regel für Claude: Commit & Push nach jeder Session

Nach **jedem abgeschlossenen Workflow** (egal ob Bugfix, Feature, Refactor) gilt zwingend:

1. `git add` — nur die tatsächlich geänderten Dateien (keine `.claude/`, `.env`, Binaries)
2. `git commit -m "..."` — aussagekräftige Commit-Message mit kurzer Beschreibung aller Änderungen
3. `git push` — auf `origin/main`

Ohne Push ist die Session **nicht abgeschlossen**. Der Schritt kommt immer ganz am Ende, nach dem Build-Check und nach dem Eintrag in PROBLEME.md.

---

## Was ist NEXUS?

NEXUS ist eine **institutionelle Investment-Analyse-WebApp** für Privatanleger.
Ziel: Research-Qualität wie professionelle Analysten — kostenlos, BYOK (Bring Your Own Key).

**Zwei KI-Engines:**
- **Elara** — Quantamentaler Sektor-Screener: 14 Sektoren, bewertet ~30 Aktien nach Bewertung, Qualität, Risiko, Wachstum → Elara Score 0–100. Nutzt Tavily Web-Suche + Groq LLM.
- **Altair** — Deep-Dive Analyst: DCF-Modell, Szenario-Bewertung (Bull/Base/Worst), Conviction Score 0–7, Timing-Signal (Kaufen/Warten/Nur Watchlist), Pre-Mortem Stresstest. Auch ETF-Analyse.

**Monetarisierung:** Kein SaaS. Kostenlose Nutzung über Server-seitigen GROQ_API_KEY (kein eigener Key notwendig). Nutzer können optional eigene Keys für Premium-Modelle hinterlegen (Claude API, OpenAI, Gemini).

---

## Tech Stack

### Frontend (`frontend-react/`)

| Tech | Version | Zweck |
|---|---|---|
| React | 18.2.0 | UI Framework |
| Vite | 5.1.4 | Build Tool (`npm run dev` / `npm run build`) |
| React Router | 6.22.0 | Client-Side Routing (SPA) |
| TailwindCSS | 3.4.1 | Utility-CSS (ergänzt durch CSS-Variablen) |
| GSAP | 3.14.2 + `@gsap/react` 2.1.2 | Animationen — IMMER `useGSAP()` nutzen |
| Lenis | 1.3.21 | Smooth Scrolling |
| Recharts | 2.12.0 | Charts (StockChart, PerformanceChart, DCFChart) |
| Lucide React | 0.344.0 | Icons |
| Supabase JS | 2.39.0 | Auth + Portfolio-DB |

### Backend (`backend/`)

| Tech | Zweck |
|---|---|
| FastAPI (Python) | REST API + WebSocket (`/ws/{sessionId}`) |
| yFinance | Stock-Daten, History, Ticker-Suche (kostenlos) |
| Groq Cloud API | LLM primär — `llama-3.3-70b-versatile` |
| Claude API | LLM optional — `claude-3-5-sonnet` |
| Ollama | LLM lokal (optional, default `qwen2.5:14b`) |
| Tavily | Web-Suche für Elara + Altair Recherche |
| Alpha Vantage | Fallback-Kursdaten (optional) |
| SQLite | Lokale Portfolio-DB (`database.py`) |
| Supabase | Cloud Portfolio-DB (`supabase_db.py`) |

### Deployment

| Layer | Plattform | Details |
|---|---|---|
| Frontend | Vercel | Auto-Deploy bei push auf `main`. SPA-Routing via `vercel.json` |
| Backend | Render | FastAPI, Port 7842. Env-Vars: `GROQ_API_KEY`, `TAVILY_API_KEY` |

### Env-Variablen

**Backend (Render):**
- `GROQ_API_KEY` — Groq Key (beginnt `gsk_`)
- `TAVILY_API_KEY` — Tavily Key (beginnt `tvly-`)
- `SUPABASE_URL` — ⚠️ Pflicht für persistentes Portfolio! (z.B. `https://xxx.supabase.co`)
- `SUPABASE_SERVICE_KEY` — ⚠️ Pflicht für persistentes Portfolio! (Service Role Key aus Supabase Dashboard)
- `OLLAMA_MODEL` — Lokales Modell (optional)

> Ohne `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` fällt das Backend auf SQLite zurück — Daten gehen bei Render-Neustart verloren!

**Frontend (Vercel):**
- `VITE_API_BASE` — Backend URL (default: `http://localhost:7842`)

---

## Routen & Pages

| Route | Datei | Status | Beschreibung |
|---|---|---|---|
| `/` | `pages/Home.jsx` | ✅ | Dark Hero, Dot-Grid, Glow, GSAP ScrollTrigger, Indices, Gainers/Losers |
| `/auth` | `pages/Auth.jsx` | ✅ | Supabase Login + Register (Tab-Switch), PW-Reset mit `redirectTo`, Recovery-Hash-Handling |
| `/screener` | `pages/Screener.jsx` | ✅ | Elara: 14 Sektoren, Marktcap-Filter, Region, Horizont, GSAP Row-Stagger |
| `/analyse` | `pages/Analysis.jsx` | ✅ | Altair: TickerSearch, WebSocket-Progress, Conviction Gauge, DCF Chart, Markdown-Sektionen |
| `/portfolio` | `pages/Portfolio.jsx` | ✅ | CRUD Positionen, Modal, Kaufhistorie, Sortierung, Performance vs. Benchmark |
| `/settings` | `pages/Settings.jsx` | ✅ | Groq / Claude / Tavily / AlphaVantage Keys, Test-Buttons, Health-Check |
| `/chat` | `pages/Chat.jsx` | ✅ | KI-Assistent: Streaming SSE via Groq, localStorage-Verlauf, Suggested Prompts, Split-Layout |
| `*` | `App.jsx` | ✅ | Catch-all → redirect `/` |

**ProtectedRoutes:** `/screener`, `/analyse`, `/portfolio`, `/settings`, `/chat` → redirect `/auth` wenn kein User

---

## Komponenten

| Datei | Status | Beschreibung |
|---|---|---|
| `components/Header.jsx` | ✅ | Sticky Nav, Scroll-aware Glassmorphism, Backend-Health Badge (inkl. Cold-Start Spinner + 5s-Retry bis 60s), User-Dropdown mit Fade+Scale Animation, Mobile Hamburger, /chat Sparkles-Icon |
| `components/ApiKeyGate.jsx` | ✅ | Blur-Overlay + Hinweis wenn kein API-Key gesetzt (`hasApiKey` aus AuthContext) |
| `components/WatchlistButton.jsx` | ✅ | Persistenter Stern-Toggle für Watchlist-Ticker |
| `context/WatchlistContext.jsx` | ✅ | Lädt und mutiert Watchlist über Backend, ohne Browser-Storage |
| `components/ConvictionGauge.jsx` | ✅ | SVG Arc Gauge 0–7, GSAP Counter + Arc-Animation, `useGSAP()` |
| `components/StockChart.jsx` | ✅ | Recharts Area/Line Chart, dark-styled, Optional Area-Füllung |
| `components/PerformanceChart.jsx` | ✅ | Portfolio vs. S&P 500 vs. MSCI World Linienchart. Dark Theme (2026-04-03). Demo-Daten Fallback mit Badge. |
| ~~`components/MarketTicker.jsx`~~ | ❌ gelöscht | 2026-04-02 entfernt — zeigte nur Fallback-Daten, störte das Design |

---

## Backend — API-Endpunkte

Alle Endpunkte in `backend/main.py`. Basis-URL: `http://localhost:7842` (oder Render-URL via `VITE_API_BASE`).

| Methode | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/status` | Backend läuft? |
| `GET` | `/api/health` | Provider, Modell, Tavily-Status |
| `GET` | `/api/config` | Aktuelle Config (Modell, Port) |
| `POST` | `/api/config` | Config updaten |
| `WS` | `/ws/{sessionId}` | WebSocket für Analyse-Progress |
| `POST` | `/api/elara/screen` | Elara Screener starten (Body: sector, market_cap, region, horizon, session_id) |
| `POST` | `/api/altair/analyse` | Altair Analyse (Body: ticker, force_refresh, session_id) |
| `GET` | `/api/portfolio/positions` | Alle Portfolio-Positionen (Auth required) |
| `POST` | `/api/portfolio/positions` | Position hinzufügen |
| `PUT` | `/api/portfolio/positions/{id}` | Position updaten |
| `DELETE` | `/api/portfolio/positions/{id}` | Position löschen |
| `GET` | `/api/portfolio/positions/{id}/transactions` | Kaufhistorie laden (Auth required) |
| `POST` | `/api/portfolio/positions/{id}/transactions` | Kauf zur Historie hinzufügen |
| `DELETE` | `/api/portfolio/positions/{id}/transactions/{transaction_id}` | Historischen Kauf löschen |
| `POST` | `/api/portfolio/refresh` | Preise via yFinance aktualisieren |
| `GET` | `/api/portfolio/performance` | Performance vs. Benchmarks |
| `GET` | `/api/stock/{ticker}` | Aktueller Kurs + Stammdaten |
| `GET` | `/api/stock/{ticker}/history` | Kursverlauf (`?period=1y`) |
| `GET` | `/api/search` | Ticker-Suche (`?q=AAPL`) |
| `GET` | `/api/market/benchmarks` | S&P 500, MSCI World, DAX, etc. |
| `GET` | `/api/market/movers` | Top Gainers + Losers |
| `GET` | `/api/market/stream` | SSE-Live-Stream für Markt-Snapshots (60s) |
| `GET` | `/api/keys/status` | Welche Keys sind gesetzt? |
| `POST` | `/api/keys/test` | Key testen |
| `POST` | `/api/keys/{provider}` | Key speichern (`claude`, `tavily`, `alphavantage`, `ollama`) |
| `GET` | `/api/watchlist` | Eigene Watchlist laden (Supabase oder SQLite-Fallback) |
| `POST` | `/api/watchlist` | Ticker zur Watchlist hinzufügen |
| `DELETE` | `/api/watchlist/{ticker}` | Ticker aus Watchlist entfernen |

---

## Design System

### CSS-Variablen (`frontend-react/src/index.css`)

| Token | Wert | Verwendung |
|---|---|---|
| `--bg` | `#0a0f1e` | Seiten-Hintergrund |
| `--surface` | `#0f1629` | Leicht heller als bg |
| `--surface-2` | `#141d35` | Card-Hintergrund |
| `--border` | `rgba(255,255,255,0.07)` | Trennlinien |
| `--primary` | `#4f8ef7` | Blau — Haupt-Akzent, Links |
| `--accent` | `#7cffcb` | Cyan — Erfolg, btn-primary, positive Zahlen |
| `--text` | `#e8eaf0` | Haupttext |
| `--text-muted` | `#6b7599` | Gedämpfter Text, Labels |
| `--danger` | `#ff4d6d` | Fehler, negative Zahlen |
| `--success` | `#7cffcb` | Identisch mit --accent |

### CSS-Utility-Klassen (in index.css definiert)

- `.btn-primary` — Cyan-Hintergrund (`--accent`), für primäre Aktionen
- `.btn-secondary` — Glassmorphism-Look
- `.btn-danger` — Rot-transparent für Löschen
- `.card` — `--surface-2`, 16px Radius, Hover-Lift-Animation
- `.card-header` / `.card-body` — Card-Innere Struktur
- `.input-field` — Einheitliches Input-Styling
- `.badge`, `.badge-green`, `.badge-yellow`, `.badge-red` — Status-Badges
- `.data-table` / `.table-container` — Tabellen-Styling
- `.alert-error` — Fehler-Banner

### Fonts

- **Body:** `Satoshi` (Variable Font) — geladen via `@font-face` in `index.css`
- **Display / Headings:** `Boska` (Serif Variable Font) — h1/h2 nutzen Boska mit `font-weight: 300` (Editorial-Feel)
- **Code / Zahlen:** `JetBrains Mono` — via `.num` und `.tabular` Klassen

### Design-Regeln (seit 2026-04-07 implementiert)

| Regel | Detail |
|---|---|
| `html { color-scheme: dark }` | Browser weiß dass dark mode aktiv → korrekte native UI-Elemente |
| `h1, h2` → Boska 300 | Editorial, Apple-like Gewichtung — NICHT 600 wie bei normalen Überschriften |
| `h1, h2, h3` → `text-wrap: balance` | Keine awkward Zeilenumbrüche bei Headings |
| Card-Hover Easing | `cubic-bezier(0.22, 1, 0.36, 1)` — kein Spring/Overshoot mehr |
| `.dropdown-enter` | Fade+Scale (0.18s) beim Öffnen des User-Dropdowns |
| Focus-visible Ring | Global `*:focus-visible` mit 0.55 Opacity (vorher 0.1 nur auf inputs) |

---

## AuthContext (`frontend-react/src/context/AuthContext.jsx`)

- Provides: `user`, `loading`, `hasApiKey`, `keyStatusLoading`, `signIn`, `signUp`, `signOut`, `fetchKeyStatus`
- `hasApiKey`: `true` wenn Backend-Key-Status `claude === true` oder `has_claude_key === true`
- Wird beim Login automatisch aktualisiert

---

## API-Client (`frontend-react/src/lib/api.js`)

- `API_BASE` = `import.meta.env.VITE_API_BASE` || `http://localhost:7842`
- `WS_BASE` = API_BASE mit `http` → `ws` ersetzt
- Auth-Header aus Supabase Session werden automatisch mitgeschickt
- Alle Requests über `apiFetch()` Wrapper

---

## WebSocket-Protokoll (Altair-Analyse)

```
Client → WebSocket: ws://localhost:7842/ws/{sessionId}
Server → Client:
  { type: "progress", message: "Recherchiere Finanzdaten..." }
  { type: "complete" }
  { type: "error", message: "..." }
```

Parallel läuft HTTP POST `/api/altair/analyse` für das eigentliche Ergebnis.
WebSocket nur für Progress-Anzeige.

---

## Bekannte Einschränkungen

- **Groq-Key unter "claude"-Slot gespeichert** — Backend-Kompatibilität, darf nicht geändert werden
- **Kein localStorage** — Vercel Sandbox blockt es. Keys werden im Backend gespeichert
- **yFinance Ratelimits** — Bei aggressivem Polling gibt yFinance `NaN` zurück
- **Portfolio-Persistenz auf Render** — `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in Render-Env-Vars setzen → Supabase aktiv. Ohne diese Vars: SQLite-Fallback (ephemeral, Daten weg nach Neustart)
- **Bundle Size** — 1008 kB, Vite warnt. Kein funktionaler Bug

---

## Nächste Schritte

1. ~~`index.css` bereinigen~~ ✅ erledigt 2026-04-03
2. ~~PerformanceChart Dark Theme~~ ✅ erledigt 2026-04-03
3. ~~Bundle-Size: `manualChunks`~~ ✅ verifiziert 2026-08-21 (Chunks getrennt, keine Warning)
4. ~~Error Boundaries in `App.jsx`~~ ✅ vorhanden (jede Route gewrapped)
5. ~~"Passwort vergessen" Flow in Auth.jsx~~ ✅ vorhanden (`resetPasswordForEmail` + Recovery-Hash)
6. ~~Settings.jsx Key-Anzeige nach Reload (`gsk_****` Vorschau)~~ ✅ erledigt 2026-08-21 (maskierte Vorschau, Aufdecken, Copy)
7. ~~Home.jsx Inline-Hover-Handler (onMouseEnter/Leave) → CSS-Klassen~~ ✅ erledigt 2026-08-21
8. ~~Analysis.jsx Regex-Parsing robuster machen~~ ✅ erledigt 2026-08-21 (flexible Labels, lokalisierte Währungen/Zahlen, sichere Fallbacks)
9. ~~Screener CSV-Export~~ ✅ erledigt 2026-08-21 (BOM, Semikolon-Separator, Excel-kompatibler Download)
10. ~~Altair Cache-Indikator~~ ✅ erledigt 2026-08-21 (`cached_at` ISO-8601, Alters-Badge, Force-Refresh-Button)
11. ~~Portfolio Transaktions-History~~ ✅ erledigt 2026-08-21 (SQLite/Supabase-Tabelle, CRUD-Endpunkte, History-Tab im Positions-Modal)
12. ~~Echte Live-Kurse~~ ✅ erledigt 2026-08-21 (60s-yFinance-TTL-Cache, SSE `/api/market/stream`, Home + Portfolio live)
13. ~~Watchlist~~ ✅ erledigt 2026-08-21 (Stars auf Home/Screener/Analysis, Supabase/SQLite-Persistenz, Watchlist-Sektion auf Home)

➡️ Aktuelle, vollständige Task-Queue für Agent-Sessions: siehe [[DASHBOARD]] Abschnitt „📋 Was Claude beim nächsten Mal tun soll" (dort werden auch Roadmap-Features wie CSV-Export, Cache-Indikator, Watchlist, Transaktions-History, Live-Kurse der Reihe nach abgearbeitet).

---

## 🛠️ Skills für NEXUS — Nach Context Clear sofort lesen

> Stand: 2026-04-07 | Vollständige Liste aller Skills: `D:/KI_Agenten/claude code/CLAUDE_CODE_FAEHIGKEITEN.md`
> **Regel:** Vor jedem UI/Animation/Finance Task den passenden Skill aktivieren — nie ohne.

### Design & UI
| Skill | Wann | Identifier |
|---|---|---|
| **UI/UX Pro Max** | Stile, Paletten, Font-Pairings, neue Komponenten | `nextlevelbuilder-ui-ux-pro-max-skill-ui-ux-pro-max` |
| **Apple UI Design** | Apple-like, minimal, premium — z.B. Settings, Cards, Header | `aiskillstore-marketplace-apple-ui-design` |
| **Frontend Design** | Neue Pages oder Komponenten mit hohem Designanspruch | `frontend-design` *(Plugin)* |
| **Design Consultation** | Komplette neue Design-Richtung → erstellt `DESIGN.md` | `garrytan-gstack-design-consultation` |
| **Plan Design Review** | UI-Audit: was ist AI-Slop, was muss verbessert werden | `garrytan-gstack-plan-design-review` |
| **Color & Font** | Neue Farbpalette oder Font-Kombination wählen | `minimax-ai-skills-color-font-skill` |

### Animationen & Motion (React + GSAP + Lenis)
| Skill | Wann | Identifier |
|---|---|---|
| **Awwwards Animations** | Jede GSAP-Aufgabe: `useGSAP()`, ScrollTrigger, Stagger, Lenis | `awwwards-animations` |
| **Motion Principles** | Animation-Audit, Emil Kowalski Apple-Motion-Technik | `kylezantos-design-motion-principles-design-motion-principles` |
| **Animation Systems** | Globale Motion-Entscheidungen, Easing-System, Choreographie | `animation-systems` |
| **Interaction Design** | Loading States, Microinteractions, Error-UX, Hover-Feedback | `secondsky-claude-skills-interaction-design` |

### Finanz-Charts & Analyse (Kern von NEXUS)
| Skill | Wann | Identifier |
|---|---|---|
| **Data Viz 2025** | Charts in React/Recharts/Tailwind — Tufte + NYT Standard | `erichowens-some_claude_skills-data-viz-2025` |
| **Quant Analyst** | Altair DCF verbessern, Szenario-Modelle, Risk Metrics | `sickn33-antigravity-awesome-skills-quant-analyst` |
| **Stock Evaluator** | Conviction Score, Einstiegspreise, Buy/Hold/Sell Logik | `openclaw-skills-stock-evaluator` |

### Präsentationen
| Skill | Wann | Identifier |
|---|---|---|
| **PPTX** | Analyse-Reports als PowerPoint exportieren | `anthropics-skills-pptx` |

### Optimierung
| Skill | Wann | Identifier |
|---|---|---|
| **Context Engineering** | Sessions > 1h, Token-Limit nähert sich, großer Refactor | `context-engineering` |
| **Claude API** | Altair/Elara Prompts, Streaming, Tool Use im Backend | `claude-api` |

> **Nicht für NEXUS:** `gepeto`, `pinokio` (Pinokio), `gsap` (→ stattdessen `awwwards-animations`), `taste-skill` (→ für Blank-Slate)

---

## 🤖 Regeln für Claude Code

### Absolut verboten
- `localStorage` / `sessionStorage` — Vercel Sandbox blockt es
- `bg-white`, `text-slate-*`, `text-gray-*` in neuen/geänderten Dateien
- `useEffect` für GSAP-Animationen — immer `useGSAP()` nutzen
- React-Logik, State oder API-Calls verändern bei rein visuellen Aufgaben
- Direktes Schreiben in andere Vaults — `NEXUS/` IST der aktive Obsidian-Vault dieses Projekts (mit `.obsidian/`). Nach jeder Session gemäß [[START_HIER]] hier aktualisieren.

### Immer so machen
- GSAP: `useGSAP(() => { ... }, { dependencies: [data] })` mit `ctx.revert()` via Context
- Dark Theme Farben: `style={{ color: 'var(--text)' }}` oder CSS-Variablen-Klassen
- Positive Zahlen: `var(--accent)` | Negative: `var(--danger)` | Neutral: `var(--text-muted)`
- Nach jeder Dateiänderung: `npm run build` ausführen und Ergebnis mitteilen
- Ticker-Symbole immer `.toUpperCase().trim()` vor API-Calls
- Groq-Key-Slot ist `"claude"` (historisch bedingt, NICHT ändern)
