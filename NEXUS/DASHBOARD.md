# NEXUS — Dashboard

> Zuletzt aktualisiert: 2026-08-21 · Orchestrator-Session (Hermes Agenten-Kette gestartet)

---

## 🚦 Projektstatus

**Vault-Sync 2026-08-21: Roadmap/Kontext mit echtem Code-Stand abgeglichen. Bundle-Size ✅ (manualChunks aktiv, Build sauber), Error Boundaries ✅, Passwort-Vergessen ✅ waren bereits fertig. Frische Task-Queue unten — Agenten-Kette arbeitet sie der Reihe nach ab (1 Task = 1 frischer Agent = 1 Commit).**

---

## Fortschritt

### Pages

| Seite | Route | Status | Notiz |
|---|---|---|---|
| Home | `/` | ✅ fertig | Dark Hero, GSAP ScrollTrigger, Markt-Indices, Gainers/Losers |
| Auth | `/auth` | ✅ fertig | Supabase Login + Register, kein "Passwort vergessen" (offener Bug) |
| Screener | `/screener` | ✅ fertig | Elara, Dark Theme komplett, GSAP Row-Stagger |
| Analysis | `/analyse` | ✅ fertig | Altair, WebSocket Progress, DCF Chart, Conviction Gauge |
| Portfolio | `/portfolio` | ✅ fertig | Dark Theme komplett, CRUD Positionen, Performance Chart |
| Settings | `/settings` | ✅ fertig | Groq / Claude / Tavily Key-Management |

### Features

| Feature | Status | Notiz |
|---|---|---|
| Elara Screener | ✅ | 14 Sektoren, Elara Score 0–100 |
| Altair Analyse | ✅ | DCF, Conviction 0–7, Timing-Signal, Pre-Mortem |
| Dark Theme | ✅ | Vollständig, alle Pages + Komponenten |
| Supabase Auth | ✅ | Login, Register, ProtectedRoutes |
| WebSocket Progress | ✅ | Echtzeit-Fortschritt bei Altair-Analysen |
| Portfolio CRUD | ✅ | Positionen hinzufügen/bearbeiten/löschen |
| Groq API Integration | ✅ | llama-3.3-70b-versatile als primäres Modell |
| Obsidian Vault | ✅ | `NEXUS/` aktiv seit 2026-04-03, `CLAUDE_CODE_FAEHIGKEITEN.md` im Vault-Root |
| Error Boundaries | ✅ | App.jsx, jede Route gewrapped |
| "Passwort vergessen" | ✅ | Auth.jsx, Supabase resetPasswordForEmail + Recovery-Hash |
| Altair Inline-Markdown | ✅ | renderInline() — **bold** + *italic* korrekt gerendert |
| Altair Fair Value/Aktie | ✅ | Prompt erzwingt EUR/Aktie, kein Mrd.-Wert |
| Altair Ticker-Confusion | ✅ | company_name aus yFinance in allen Queries |
| Altair Tavily-Kosten | ✅ | ~75% weniger Credits pro Analyse |

### Deployment

| Layer | Plattform | Status |
|---|---|---|
| Frontend | Vercel (auto-deploy bei push auf `main`) | ✅ live |
| Backend | Render (FastAPI, Port 7842) | ✅ konfiguriert |
| Datenbank | Supabase | ✅ Auth + Portfolio |

---

## 🗒️ Meine nächsten Aktionen
> (Das füllst DU aus — Claude lässt diesen Block unberührt)

- [ ] 
- [ ] 

---

## 📋 Was Claude beim nächsten Mal tun soll
> Agenten-Kette: Jeder Task = genau EINER pro Session. Reihenfolge beachten! Nach jeder Task: Vault updaten ([[START_HIER]] End-of-Session-Checkliste), `npm run build` grün, Commit + Push.

**Queue (nächster freier = aktiver):**
1. [ ] **Settings Key-Vorschau** — Gespeicherte Keys als Maskiert-Preview anzeigen (`gsk_****…abc4`), Toggle zum Aufdecken, Copy-Button. Nur Frontend (`pages/Settings.jsx`, `/api/keys/status` liest vorhandene Flags).
2. [ ] **Home Hover → CSS** — Inline `onMouseEnter/onMouseLeave`-Handler in Home.jsx (MoverRows/Buttons, ca. Zeilen 595–635) durch CSS-Klassen ersetzen (`.mover-card:hover` etc., easing `cubic-bezier(0.22,1,0.36,1)`). Rein visuell, keine Logik ändern.
3. [ ] **Analysis Regex robuster** — `extractReportSections` + Feld-Extraktion (Conviction/Timing/Preis/DCF-Zeilen) toleranter machen: flexible Labels (dt./engl.), Tausenderpunkte, €/$-Zeichen, fehlende Felder → saubere Fallbacks statt Crash. Keine Output-Inhalte ändern.
4. [ ] **Screener CSV-Export** — Elara-Ergebnisse als CSV-Download (Button neben Ergebnis-Tabelle, BOM für Excel, Semikolon-Separator für DE-Excel).
5. [ ] **Altair Cache-Indikator** — Backend: Report-Cache-Alter im Response mitliefern (`cached_at` ISO). Frontend: Badge „Stand: vor X Min./Stdn." + „Neu analysieren"-Button nutzt vorhandenes `force_refresh`.
6. [ ] **Portfolio Transaktions-History** — Kaufhistorie je Position (Backend: Tabelle/Feld + Endpunkte, Supabase + SQLite-Fallback; Frontend: History-Tab im Positions-Modal).
7. [ ] **Echte Live-Kurse** — Backend-Polling yFinance alle 60s (Cache mit TTL), SSE-Endpoint `/api/market/stream`; Home Indices + Portfolio aktualisieren sich live. yFinance-NaN-Guards beachten ([[PROBLEME]]).
8. [ ] **Watchlist** — Stars auf Stock-Cards (Home/Screener/Analysis), persistiert in Supabase (Fallback SQLite), Watchlist-Sektion auf Home.

**Danach (optional, aus 💡 Ideen):** Onboarding-Flow, Dark/Light Toggle, Mobile-Nav, PDF-Export, Multi-Language, Portfolio-Alerts.

---

## 💬 Offene Fragen / Unsicher

- **Portfolio-Persistenz auf Render**: ✅ Analysiert — `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in Render-Env-Vars eintragen, dann läuft Supabase statt SQLite
- **Echte Live-Kurse**: yfinance Polling (60s) oder Finnhub WebSocket?
- ~~**Bundle-Size**: Vite warnt `1008 kB > 500 kB`~~ ✅ Gelöst — `manualChunks` aktiv, Build 2026-08-21 ohne Warning (größter Chunk: charts 394 kB / gzip 107 kB)
- **Backend auf Render**: Läuft der Render-Service aktuell? URL bekannt? *(für Live-Tests relevant, blockt Code-Tasks nicht)*
