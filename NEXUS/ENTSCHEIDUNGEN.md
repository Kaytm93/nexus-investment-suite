# NEXUS — Architektur-Entscheidungen (ADR)

> Format: Entscheidung | Datum | Status | Warum | Konsequenz

---

## Gemeinsamer SSE-Marktstream mit 60s-TTL-Cache
**Datum:** 2026-08-21 (Task 7)
**Status:** aktiv

**Warum:** Ein zentraler Backend-Poller verhindert, dass Home- und Portfolio-Clients yFinance unabhängig voneinander und zu häufig abfragen. Der 60s-TTL-Cache reduziert Ratelimits; SSE verteilt denselben Snapshot effizient an alle offenen Clients.

**Konsequenz:**
- `/api/market/stream` ist ein öffentlicher SSE-Stream für Markt-Snapshots.
- Portfolio-Clients stoßen beim Snapshot einen bestehenden, ebenfalls gecachten Preis-Refresh an.
- Ungültige yFinance-NaN-/Infinity-Werte werden verworfen statt als Kurs gespeichert.

---

## Elara-Screener-Export als semikolon-separierte CSV
**Datum:** 2026-08-21 (Task 4)
**Status:** aktiv

**Warum:** Nutzer in Deutschland öffnen Exporte typischerweise direkt in Excel; Semikolon wird dort als Spaltentrenner erkannt und ein UTF-8-BOM bewahrt Umlaute korrekt.

**Konsequenz:**
- Der Frontend-Export nutzt ausschließlich die aktuell gerenderte Elara-Markdown-Tabelle.
- Jede Zelle wird quotiert und doppelte Anführungszeichen werden CSV-konform escaped.
- Der Download erfolgt clientseitig als Blob ohne localStorage/sessionStorage.

---

## Groq-Key unter "claude"-Slot gespeichert
**Datum:** 2026-03 (Commit `d015e9d`)
**Status:** aktiv — NICHT ändern

**Warum:** Ursprünglich war der primäre Provider Claude (Anthropic). Als Groq als kostenloser Tier-Provider eingeführt wurde, wurde der existierende Slot-Name `"claude"` beibehalten um Backend-Kompatibilität zu wahren und kein DB-Migration-Risiko einzugehen.

**Konsequenz:**
- `POST /api/keys/claude` speichert den Groq-Key
- `AuthContext`: `hasApiKey = status?.claude || status?.has_claude_key`
- Settings.jsx zeigt den Slot als "Groq API Key" an, obwohl er intern `claude` heißt
- Darf NICHT umbenannt werden ohne vollständige Backend + Frontend + DB Migration

---

## Kein localStorage / sessionStorage
**Datum:** 2026-02 (Initial)
**Status:** aktiv — absolute Regel

**Warum:** Vercel Sandbox-Umgebung blockt localStorage-Zugriffe. Frühe Versuche haben zu stillen Fehlern geführt wo Daten nicht persistiert wurden ohne Fehlermeldung.

**Konsequenz:**
- API-Keys werden im Backend gespeichert (via `/api/keys/{provider}`)
- Nutzer-Präferenzen werden nicht gecacht (kein Offline-Support)
- Nach jedem Page-Reload wird Key-Status frisch vom Backend abgefragt

---

## useGSAP statt useEffect für Animationen
**Datum:** 2026-04 (Commit `e91387a` Design Reboot)
**Status:** aktiv

**Warum:** GSAP-Animationen in `useEffect` führten zu Memory Leaks (Gauge blieb animieren nach Unmount). `@gsap/react`'s `useGSAP()` gibt automatisch alle GSAP-Contexts frei ohne manuelles `ctx.revert()`.

**Konsequenz:**
- Alle Animationen verwenden `useGSAP(() => {...}, { dependencies: [...] })`
- `gsap.context()` + `ctx.revert()` ist nicht mehr nötig (von `useGSAP` übernommen)
- Scope-Parameter `{ scope: containerRef }` für saubere Selektor-Isolation

---

## MarketTicker entfernt
**Datum:** 2026-04-02 (Commit `8966b25`)
**Status:** abgeschlossen

**Warum:** Die MarketTicker-Komponente zeigte ausschließlich hardcodierte Fallback-Daten wenn das Backend nicht erreichbar war. Da das Backend bei Vercel-Deployments nicht automatisch verfügbar ist, sah der Nutzer immer alte/falsche Kurse. Das schadete dem Premium-Designeindruck mehr als es nützte.

**Konsequenz:**
- `components/MarketTicker.jsx` gelöscht
- Kein Import mehr in `App.jsx`
- `showTicker` Prop aus `Layout`-Komponente entfernt
- Kursdaten erscheinen jetzt nur noch in den Index-Cards auf Home.jsx (echte yFinance-Daten)

---

## yFinance als primäre Kursdatenquelle
**Datum:** 2026-02 (Initial)
**Status:** aktiv, mit Einschränkungen

**Warum:** Kostenlos, keine API-Key-Hürde für den Nutzer, deckt globale Märkte ab (US, XETRA, LSE, SIX, etc.). Keine Echtzeit (15-20min Delay), aber für Value-Investing-Kontext ausreichend.

**Konsequenz:**
- Kurse sind nicht Echtzeit
- Bei aggressivem Polling gibt yFinance `NaN` zurück (Ratelimit)
- Alpha Vantage ist als optionaler Fallback eingebaut (`/api/keys/alphavantage`)

---

## Supabase für Auth + Portfolio-Cloud
**Datum:** 2026-03 (Commit `2eb059c`)
**Status:** aktiv

**Warum:** Schnelle Integration von Auth ohne eigenes Backend-Auth-System. Portfolio-Daten müssen Nutzer-gebunden sein und Cloud-persistent (nicht nur SQLite lokal).

**Konsequenz:**
- Supabase-Projekt nötig (Env-Vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- Portfolio-Endpunkte verwenden `supabase_db.py` (nicht `database.py` SQLite) in Cloud-Deploy
- Lokal läuft weiterhin SQLite als Fallback

---

## WebSocket für Analyse-Progress
**Datum:** 2026-03 (Commit `2eb059c`)
**Status:** aktiv

**Warum:** Altair-Analysen dauern 15–60 Sekunden. Ohne Progress-Feedback dachten Nutzer der Request sei fehlgeschlagen. WebSocket erlaubt Server-Push von Fortschritts-Nachrichten ohne Long-Polling.

**Konsequenz:**
- Client öffnet WebSocket BEVOR der HTTP-Request abgeschickt wird (3s Timeout)
- WebSocket nur für Progress-Updates, nicht für das eigentliche Ergebnis
- Bei WS-Fehler läuft der HTTP-Request trotzdem weiter (degraded gracefully)

---

## Groq als Default-LLM-Provider (statt Ollama)
**Datum:** 2026-03 (Commit `d015e9d`)
**Status:** aktiv

**Warum:** Ollama erfordert lokale Installation + GPU (oder sehr langsame CPU-Inferenz). Die meisten Nutzer haben kein lokales LLM-Setup. Groq bietet `llama-3.3-70b-versatile` kostenlos (Rate-Limited) und ist um Faktor 10–50x schneller als lokales Ollama.

**Konsequenz:**
- Nutzer müssen Groq-Key in Settings eingeben (console.groq.com — kostenlos)
- Ollama bleibt als Option in config.json erhalten
- Backend wählt automatisch: Wenn Groq-Key vorhanden → Groq, sonst → Ollama
