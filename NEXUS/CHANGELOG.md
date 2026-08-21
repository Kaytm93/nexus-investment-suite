# NEXUS — Changelog

> Rekonstruiert aus Git-History + Code-Stand. Neueste Einträge oben.

---

## 2026-08-21 — Altair Cache-Indikator

- `backend/main.py` und `models.py` — `cached_at` als UTC-ISO-8601-Zeitstempel für Cache-Hits und frisch gespeicherte Reports ergänzt.
- `Analysis.jsx` — Badge „Stand: vor X Min./Std." ergänzt und „Neu analysieren" als expliziten `force_refresh`-Button umgesetzt.
- Veraltete Refresh-Checkbox entfernt; normale Analyse-Aufrufe bleiben cachefähig.

**Build:** ✅ `npm run build`

---

## 2026-08-21 — Screener CSV-Export

- `Screener.jsx` — CSV-Download-Button neben der Elara-Ergebnistabelle ergänzt.
- Exportiert Tabellenkopf und Ergebniszeilen mit UTF-8-BOM, Semikolon-Separator und korrekt escaped CSV-Zellen für deutsches Excel.
- Der bestehende GSAP-Row-Stagger nutzt jetzt `useGSAP()` gemäß Design-Regel; Ticker werden vor der Analyse-Navigation mit `.toUpperCase().trim()` normalisiert.

**Build:** ✅ `npm run build`

---

## 2026-08-21 — Analysis Regex robuster

- `Analysis.jsx` — `extractReportSections` akzeptiert flexible deutsche und englische Labels für Conviction, Timing, Kurs und DCF-Szenarien.
- Lokalisierte Zahlenformate mit Tausenderpunkten/-kommas sowie `€`, `$` und `£` werden sicher geparst.
- Fehlende oder ungültige Feldwerte führen zu sauberen Fallbacks statt `NaN`/Crash; bestehende Ausgabe-Labels und Inhalte bleiben unverändert.

**Build:** ✅ `npm run build`

---

## 2026-08-21 — Home Hover → CSS

- `Home.jsx` — Inline-`onMouseEnter`/`onMouseLeave`-Handler für MoverRows, Hero-CTAs, Aktualisieren-Button und unteren CTA entfernt.
- `index.css` — Hover-Zustände als CSS-Klassen (`.mover-card`, `.hero-cta`, `.market-refresh`) mit `cubic-bezier(0.22, 1, 0.36, 1)` umgesetzt.
- Keine React-Logik, Navigation oder API-Aufrufe geändert.

**Build:** ✅ `npm run build`

---

## 2026-08-21 — Settings Key-Vorschau

- `Settings.jsx` zeigt konfigurierte API-Keys als maskierte Vorschau mit Präfix und letzten vier Zeichen.
- Reveal-Toggle und Copy-Button für den im aktuellen Frontend-State verfügbaren Key ergänzt.
- `/api/keys/status` bleibt unverändert und wird weiterhin nur über vorhandene Status-Flags bzw. optionale Preview-Felder ausgewertet; keine Secrets in Storage oder Backend-Response ergänzt.

**Build:** ✅ `npm run build`

---

## 2026-04-05 Session 3 — Altair Output Quality (Klein + Mittel + Groß)

**Commits:** `a38e987`, `aa116a2`

### Klein (Frontend — Analysis.jsx)
- `renderInline()` helper: `**bold**` → `<strong>`, `*italic*` → `<em>`. In allen MarkdownSection-Zeilen und SimpleTable-Zellen aktiv. Vorher: Asterisken literal angezeigt.
- `SimpleTable` Fallback → `MarkdownSection` statt rohem Text (Rendite-Tabelle als Bullet-List jetzt korrekt gerendert).
- `extractReportSections`: `conclusion` first-match-wins statt overwrite → kein doppelter Dashboard-Inhalt.
- Sources-Card: `report.sources` wird nach Conclusion als "Quellen"-Sektion mit klickbaren Links angezeigt.
- Fallback-View: nutzt jetzt `raw_content` (wie strukturierte View).

### Mittel (ALTAIR_SYSTEM_PROMPT — main.py)
- Asset Manager Sektor-Methodik ergänzt: KBV, AUM-Wachstum, Fee-Marge — KEIN DCF.
- Pre-Mortem: unternehmens-spezifische Ursache Pflicht (kein allgemeiner Marktabschwung).
- Peer-Check: GENAU 2 Peers mit Name + Ticker Pflicht.
- Conviction Score: Punkt-für-Punkt Herleitung mit Format "+2 MoS ✓ | +2 Wide Moat ✗ → Gesamt: X/7".
- Rendite-Tabelle: "Markdown-Tabelle PFLICHT" mit Header-Format.

### Groß (Backend — main.py + search_service.py)
- **Ticker-Verwechslung behoben**: `gather_ticker_qualitative(company_name=)` nutzt yFinance-Firmennamen in Queries. `user_message` enthält prominente "⚠️ UNTERNEHMEN:" Warnung. Prompt verbietet Ticker-only-Recherchen. Verhindert ORC.DE → Orchid Island statt Oracle.
- **Tavily ~75% weniger Credits**: `gather_ticker_qualitative` 2×advanced×4 → 1×basic×3. `search_fn` max_results 2→1, basic, content 300→200 chars.
- **Fair Value pro Aktie**: Prompt erzwingt EUR/Aktie (Eigenkapitalwert ÷ Aktienanzahl), verbietet Mrd.-Angaben als Fair Value.
- **Conviction Score Mapping verbindlich**: Explizite Score→Positionsgröße Tabelle (Score 5→4-7%, Score 6→8-12%), keine LLM-Interpretation.

**Build:** ✅

---

## 2026-04-06 — Screener-Crash + Analysis-Parsing + Hero-Visual + Chart-Datum

**Commit:** `81004bd`

- `Screener.jsx` — TDZ-Crash behoben: `useEffect` referenzierte `result` vor `useState`-Deklaration (Temporal Dead Zone). State-Deklarationen nach oben verschoben.
- `Analysis.jsx` — `extractReportSections()` robuster: Heading-Normalisierung (`###`→`##`, `**Bold:**`→`##`) vor dem Split, Sektion-Matching per Regex statt einzelner Strings. Fallback-UI: `MarkdownSection` + gelbes Info-Banner statt rohem Monospace-Pre.
- `Home.jsx` — Hero-Bereich: 2-Spalten-Layout (`lg:grid-cols-2`). Neue `HeroVisual`-Komponente rechts: Mock-Analyse-Card (AAPL, SVG-Kurschart, Conviction/DCF/Upside-Metriken, Scan-Line-CSS-Animation, floating Badges). GSAP-Timeline um `.hero-visual` (fade-in von rechts) erweitert.
- `StockChart.jsx` — X-Achse zeigt nun echte Datumsangaben: `formatDate()` erkennt Unix-ms-Timestamps (>1e10) + ISO-Strings, formatiert als `"12. Mär"` (de-DE Locale). `tickFormatter` + `minTickGap={40}`. Tooltip-Label ebenfalls formatiert.
- `index.css` — `@keyframes scanline` + `@keyframes fadeInUp` ergänzt.
- `NEXUS/PROBLEME.md` — Alle 4 Bugs als gelöst markiert. Liste bereinigt.

**Build:** ✅ keine Warnings

---

## 2026-04-05 Session 2 — Market Cards Fix + Bundle-Splitting + UX-Cleanup

**Commits:** `08beced`, `37a5494`

- `Home.jsx` — Market Cards Fix: GSAP `ctx.revert()` Cleanup ersetzte Karten 2+3 dauerhaft mit `opacity:0`. Fix: `gsap.fromTo()` direkt auf `marketRef.current.querySelectorAll('.index-card')` ohne cleanup-Revert. Spark-Daten `[number]` → `[{date, value}]` Mapping für `StockChart`.
- `Home.jsx MoverRow` — `onMouseEnter/onMouseLeave` Inline-Handler → Tailwind `hover:bg-[rgba(79,142,247,0.05)]`.
- `Settings.jsx` — Optionale Groq-Key-Eingabe entfernt (State, Handler, Input, Buttons). Nur grüne Info-Box "Kostenlos & sofort nutzbar" bleibt.
- `Settings.jsx` — Key-Status Hinweis: "✓ Key hinterlegt — neuen eingeben zum Überschreiben" für Claude/OpenAI/Gemini wenn `status === true` und Feld leer.
- `vite.config.js` — `manualChunks`: vendor / gsap / charts / icons / supabase. 1 Chunk 1021 kB → 6 Chunks, größter 394 kB. Vite-Warnung weg.
- **Render** — `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (service_role) eingetragen → Portfolio-Persistenz aktiv.

**Build:** ✅ keine Warnings mehr

---

## 2026-04-05 — Error Boundaries + Passwort-Reset

- `App.jsx` — `ErrorBoundary` Class-Komponente hinzugefügt. Jede Route einzeln gewrapped (`/`, `/auth`, `/screener`, `/analyse`, `/portfolio`, `/settings`). Bei Render-Fehler: Fallback-UI mit Fehlermeldung, "Erneut versuchen" + "Zur Startseite" — kein App-Crash mehr.
- `Auth.jsx` — "Passwort vergessen?"-Link unter dem Login-Button. Zeigt Reset-View (Mail-Icon, E-Mail-Feld, Submit). Nutzt `supabase.resetPasswordForEmail()` mit `redirectTo: origin/auth`. Pre-füllt E-Mail aus Login-Feld wenn schon eingetippt. Zurück-Link wechselt zurück zur Anmeldung.

**Build:** ✅ 1022 kB (kein neuer Bug)

---

## 2026-04-05 — Freies Nutzungsmodell + OpenAI/Gemini Keys + Market Cards Fix

**Aufgabe A — Konzept-Umbau: Freie Nutzung + optionale eigene Keys**

- `AuthContext.jsx` — `hasApiKey` ist jetzt `true` für alle eingeloggten User (Server-Key GROQ_API_KEY ist immer verfügbar). `keyStatus`-Objekt wird zusätzlich im Context bereitgestellt für Details zu optionalen Keys.
- `ApiKeyGate.jsx` — Gate-Message geändert: nicht mehr "API-Key erforderlich" sondern "Anmeldung erforderlich". Icon: `LogIn` statt `KeyRound`. CTA → `/auth` statt `/settings`.
- `Settings.jsx` — Groq-Sektion: Hinweis "kostenlos & sofort verfügbar" + optional eigenen Key hinterlegen. Neue Sektionen: **OpenAI API** + **Gemini API** (beide als CollapsibleSection, mit Test- und Speichern-Button). Provider-Status-Block zeigt jetzt alle 4 Provider.
- `backend/main.py` — `/api/keys/status` gibt jetzt zusätzlich `groq_env`, `openai`, `gemini` zurück. `_load_secrets()` enthält `openai_key` + `gemini_key`. `save_key` mapping um `openai` + `gemini` erweitert. `/api/keys/test` unterstützt jetzt `openai` (GET /v1/models) und `gemini` (GET /v1beta/models) Test.
- `Screener.jsx` + `Analysis.jsx` — Gratis-Info-Banner: "Kostenlos & sofort verfügbar. Kein eigener API-Key notwendig."

**Aufgabe B — Market Cards Fix (Home.jsx)**

- `backend/main.py` — `/api/market/movers` vollständig überarbeitet: `yf.Ticker().info` (veraltet, langsam) → `fast_info` für Preisdaten. Batch-Fetch via `yf.Tickers()`. Indizes erhalten jetzt `spark`-Feld (5d/1h history) für Sparklines in `IndexCard`.
- `Home.jsx` — Leere Zustände bei Indizes und Mover erhalten Retry-Button (vorher nur statischer Text).

**Build:** `npm run build` ✅ — 1017 kB (Bundle-Warning bereits bekannt, kein neuer Bug)

---

## 2026-04-03 — Bugfixes Phase 1 + Vault-Neuaufbau

**Git-Commit:** `1647445`

**Was wurde gemacht:**

Code-Fixes:
- `frontend-react/src/index.css` — toten `ticker-scroll` Keyframe-Block entfernt (7 Zeilen, toter Code seit MarketTicker-Entfernung)
- `frontend-react/src/components/PerformanceChart.jsx` — vollständig auf Dark Theme umgestellt: `bg-white`→CSS-Vars, `text-slate-*`→CSS-Vars, Chart-Farben (Portfolio `#7cffcb`, S&P `#6b7599`, MSCI `#4f8ef7`), Grid `rgba(255,255,255,0.05)`, Period-Selector dark, `badge-gray`→Inline-Style
- `frontend-react/src/components/ApiKeyGate.jsx`, `ConvictionGauge.jsx`, `StockChart.jsx` — Dark Theme Fixes (aus vorheriger Session, jetzt committed)
- `frontend-react/src/pages/Settings.jsx` — Dark Theme + Layout-Cleanup (aus vorheriger Session)

Analyse (kein Code-Fix nötig):
- Portfolio-Persistenz auf Render: Root Cause gefunden — `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in Render-Env-Vars eintragen → automatisch Supabase statt SQLite. Dokumentiert in KONTEXT.md.

Vault:
- `NEXUS/` vollständig neu aufgebaut: DASHBOARD.md + MUSTER.md neu, alle bestehenden Dateien aktualisiert, `verlauf/SESSION_2026-04-02.md` angelegt
- `NEXUS/.obsidian/` aus git-Tracking entfernt + in `.gitignore` (Plugin `remotely-save/main.js` enthielt eingebettete Google OAuth Credentials → GitHub Push Protection hatte geblockt)
- `CLAUDE_CODE_FAEHIGKEITEN.md` im Vault-Root angelegt (globale Capabilities-Übersicht)

---

## 2026-04-02 — Obsidian Koordinationssystem eingerichtet (Zwischenstand)

**Was wurde gemacht:**
- NEXUS/ Vault mit echtem Inhalt befüllt: START_HIER, KONTEXT, PROBLEME, CHANGELOG, ENTSCHEIDUNGEN, ROADMAP, API
- Neue Dateien: DASHBOARD.md, MUSTER.md, verlauf/SESSION_2026-04-02.md
- Alles in Commit `1647445` zusammengefasst

---

## 2026-04-02 — Design Reboot Phase 2: Finale Bugfixes & Dark Theme Rollout

**Git-Commit:** `8966b25 fix: repair jsx bugs, remove market ticker, and finalize dark theme for portfolio/screener`

**Was wurde gemacht:**
- `App.jsx` — `MarketTicker` Import + Nutzung entfernt, `showTicker` Prop entfernt
- `components/MarketTicker.jsx` — Datei vollständig gelöscht
- `pages/Analysis.jsx` — Light-Theme-Reste entfernt; alle Report-Sektionen bekommen `report-card`-Klasse; GSAP Stagger auf `.report-card` umgestellt
- `pages/Auth.jsx` — `onMouseEnter/onMouseLeave` Inline-Handler entfernt, ersetzt durch Tailwind `hover:`-Klassen
- `pages/Portfolio.jsx` — Vollständiges Dark Theme: Modals, Delete-Confirm, Summary-Cards, Tabelle, Buttons, leerer State, Performance-Card-Header
- `pages/Screener.jsx` — Vollständiges Dark Theme: Page-Header, Form-Sidebar, Progress-Bar, Empty State, Results-Table; GSAP `screener-row` Stagger; Score-Farbe je Wert (>70 accent, <40 danger)
- `NEXUS/` Vault mit vollständigem Projektkontext erstellt

---

## 2026-04-01 (approx.) — Design Reboot Phase 1: Vollständiges Dark Theme

**Git-Commit:** `e91387a feat: complete design reboot — dark theme, Boska/Satoshi, Lenis, GSAP ScrollTrigger`

**Was wurde gemacht:**
- Kompletter visueller Reboot auf Dark Theme mit CSS-Token-System
- Fonts: Boska (Display) + Satoshi (Body) als Variable Fonts
- CSS-Variablen in `index.css`: `--bg`, `--surface`, `--surface-2`, `--border`, `--primary`, `--accent`, `--text`, `--text-muted`, `--danger`
- Lenis Smooth-Scrolling integriert
- GSAP ScrollTrigger auf Home.jsx (Feature-Cards, Hero-Animation)
- Header.jsx: Sticky, Scroll-Blur, Backend-Health Badge, Mobile Hamburger
- Home.jsx: Hero mit Dot-Grid, Glow-Blobs, animiertem Badge, Stagger-Text
- ConvictionGauge.jsx: SVG Arc mit GSAP Counter-Animation, `useGSAP()`
- StockChart.jsx: Recharts Area Chart dark-styled
- ApiKeyGate.jsx: Blur-Overlay Komponente
- Settings.jsx: Vollständig dark, Provider-Status-Anzeige, Groq/Claude/Tavily Keys

---

## 2026-03 (approx.) — Groq als primärer KI-Provider

**Git-Commits:** `583a2f0`, `d015e9d`

**Was wurde gemacht:**
- Groq Cloud als primärer LLM-Provider (ersetzt Ollama als Default)
- Modell: `llama-3.3-70b-versatile`
- Settings-Page: Groq-Key-Eingabe + Test-Button
- GSAP Animationen Phase 1: ConvictionGauge Arc, Card-Stagger, Progress-Steps Slide-In

---

## 2026-03 (approx.) — Supabase + WebSocket + Render

**Git-Commit:** `2eb059c Supabase portfolio migration, Render deploy, WebSocket progress`

**Was wurde gemacht:**
- Portfolio auf Supabase Auth migriert (User-basiert, nicht lokal)
- WebSocket Progress-Streaming für Altair-Analysen (`/ws/{sessionId}`)
- Render-Deployment konfiguriert (Backend)
- `WS_BASE` in api.js (http→ws Konversion)

---

## 2026-03 (approx.) — Backend Health + Env-Variablen

**Git-Commits:** `5a92900`, `68b645e`, `d8e74a9`

**Was wurde gemacht:**
- `/api/health` gibt tatsächlichen Provider + Modell zurück
- Backend liest API-Keys aus Umgebungsvariablen (Render-kompatibel)
- `vercel.json` hinzugefügt mit SPA-Rewrite für React Router

---

## 2026-02 (approx.) — Cleanup + Initial

**Git-Commits:** `93186de`, `6d42991`

**Was wurde gemacht:**
- Altes Vanilla-JS-Frontend entfernt, Playwright-Tests entfernt, ungenutzte Services entfernt
- Saubere Struktur: `frontend-react/` + `backend/`
- Initial Commit: React + Vite + FastAPI + Elara + Altair + Portfolio + Supabase Auth + yFinance + Tavily
