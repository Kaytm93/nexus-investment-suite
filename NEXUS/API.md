# NEXUS — Backend API Dokumentation

> Backend: FastAPI auf Port 7842 (lokal) / Render (Produktion)  
> Base-URL: `VITE_API_BASE` Env-Var oder `http://localhost:7842`  
> Auth: `Authorization: Bearer <supabase_access_token>` (wo erforderlich)

---

## Health & Status

### `GET /api/health`
Prüft ob Backend läuft und welcher LLM-Provider aktiv ist.

**Response:**
```json
{
  "status": "ok",
  "provider": "groq",
  "model": "llama-3.3-70b-versatile"
}
```
Timeout im Frontend: 3 Sekunden. Wird alle 30s vom Header.jsx abgerufen.

---

### `GET /api/status`
Detaillierter Status aller Services.

**Response:**
```json
{
  "tavily": true,
  "ollama": false,
  "model": "llama-3.3-70b-versatile"
}
```

---

### `GET /api/config`
Aktuelle Konfiguration laden (API-Keys maskiert).

### `POST /api/config`
Konfiguration aktualisieren.

---

## WebSocket

### `WS /ws/{session_id}`
Real-Time Progress für Altair-Analysen.

**Empfangene Messages (vom Server):**
```json
{ "type": "progress", "message": "Lade Kursdaten für AAPL..." }
{ "type": "complete" }
{ "type": "error", "message": "Ticker nicht gefunden" }
```

**Flow:**
1. Frontend generiert `sessionId = crypto.randomUUID()`
2. WebSocket öffnen: `new WebSocket(WS_BASE + '/ws/' + sessionId)`
3. HTTP POST `/api/altair/analyse` mit `session_id` im Body
4. Server sendet Progress-Messages über WS während HTTP läuft
5. HTTP-Response enthält das fertige Ergebnis
6. WS wird nach `complete` oder nach HTTP-Response geschlossen

---

## Elara Screener

### `POST /api/elara/screen`
Startet einen Sektor-Screening-Lauf.

**Request Body:**
```json
{
  "sector": "Technology",
  "market_cap": "large",
  "region": "US",
  "exclusions": "Rüstung, Tabak",
  "horizon": "long"
}
```

**Erlaubte Werte:**
- `sector`: `Technology | Banking | Insurance | Healthcare_Pharma | Energy_Oil_Gas | Automotive | Utilities | Real_Estate_REIT | Mining_Materials | Telecom | Consumer_Staples | Defense_Aerospace | Alt_Asset_Manager | ETF_Index`
- `market_cap`: `small | mid | large | ""` (leer = alle)
- `region`: `US | Europe | Asia | Emerging | ""` (leer = alle)
- `horizon`: `short | medium | long`

**Response:**
```json
{
  "sector": "Technology",
  "raw_content": "| Ticker | Name | Elara Score | ...\n| MSFT | Microsoft | 87 | ...",
  "sources": ["https://..."],
  "cached": false
}
```

**Output-Format des `raw_content`:**
Markdown-Tabelle mit Spalten:
`Ticker | Name | Elara Score | Risk | Moat | [Sektor-spezifische KPIs]`

---

## Altair Analyse

### `POST /api/altair/analyse`
Startet eine tiefe Aktien-Analyse.

**Request Body:**
```json
{
  "ticker": "AAPL",
  "force_refresh": false,
  "session_id": "uuid-v4-string"
}
```

**Response:**
```json
{
  "ticker": "AAPL",
  "result": "## Finanz-Snapshot & Peer-Check\n| Kennzahl | Wert | ...",
  "sources": ["https://..."]
}
```

**Report-Format des `result`:**
Markdown mit Sektionen (via `##` Headings):
- `## Finanz-Snapshot & Peer-Check` — Tabelle mit KPIs
- `## Qualität & Substanz` — Freitext
- `## Bewertung & Szenarien` — DCF-Tabelle (Bull/Base/Worst)
- `## Rendite-Erwartungen` — Tabelle 3J/5J
- `## Pre-Mortem Stresstest` — Risiko-Szenarien
- `## Fazit`
- `## Conviction Score: X/7` — Score + Timing-Signal + Position-Sizing

**Geparstes Format (Frontend `extractReportSections()`):**
```js
{
  convictionScore: 5,              // aus Regex /Conviction.*:\s*(\d+)/
  timingSignal: "Jetzt kaufen",    // aus Regex /Timing.*Signal.*:\s*([^\n]+)/
  currentPrice: 185.50,           // aus KPI-Tabelle
  scenarios: [                     // DCF-Szenarien
    { label: "Bull Case", value: 220 },
    { label: "Base Case", value: 195 },
    { label: "Worst Case", value: 160 }
  ],
  snapshot: "| Kennzahl | ...",   // Markdown-String
  quality: "AAPL zeigt...",       // Freitext
  valuation: "| Szenario | ...",  // Markdown-Tabelle
  returns: "| Zeitraum | ...",    // Tabelle
  preMortem: "Risiko 1: ...",     // Freitext
  conclusion: "...",               // Freitext
  fullText: "..."                  // Gesamter Text
}
```

---

## Portfolio Transaktions-History

### `GET /api/portfolio/positions/{position_id}/transactions`
Lädt die Käufe einer Position, absteigend nach Kaufdatum.

### `POST /api/portfolio/positions/{position_id}/transactions`
Fügt einen Kauf hinzu. Request:
```json
{
  "entry_price": 180.5,
  "shares": 2,
  "purchase_date": "2026-08-21"
}
```

### `DELETE /api/portfolio/positions/{position_id}/transactions/{transaction_id}`
Löscht einen einzelnen historischen Kauf. Alle Endpunkte verwenden denselben Supabase-JWT-/SQLite-Fallback wie das Portfolio-CRUD.

---

## Stock Data

### `GET /api/stock/{ticker}`
Aktueller Snapshot für eine Aktie.

**Response:**
```json
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "price": 185.50,
  "change": 1.23,
  "market_cap": 2850000000000,
  "pe_ratio": 28.5,
  "volume": 54231000
}
```

---

### `GET /api/stock/{ticker}/history?period=1y`
Historische Kursdaten.

**Query-Params:** `period = 1d | 5d | 1mo | 3mo | 6mo | 1y | 2y | 5y`

**Response:**
```json
{
  "ticker": "AAPL",
  "dates": ["2024-01-02", "2024-01-03", ...],
  "closes": [185.20, 186.10, ...]
}
```

---

### `GET /api/search?q={query}`
Ticker-Suche (Autocomplete).

**Response:**
```json
[
  { "symbol": "AAPL", "name": "Apple Inc.", "exchange": "NASDAQ" },
  { "symbol": "AAPL.DE", "name": "Apple Inc.", "exchange": "XETRA" }
]
```

---

## Market Data

### `GET /api/market/movers`
Top Gainers + Losers + Index-Übersicht.

**Response:**
```json
{
  "indices": [
    { "symbol": "^GSPC", "name": "S&P 500", "price": 5234.18, "change": 0.42, "spark": [...] },
    { "symbol": "^GDAXI", "name": "DAX", "price": 18234.50, "change": -0.21, "spark": [...] }
  ],
  "gainers": [
    { "ticker": "NVDA", "name": "NVIDIA Corp.", "price": 875.40, "change": 4.21 }
  ],
  "losers": [
    { "ticker": "INTC", "name": "Intel Corp.", "price": 31.20, "change": -3.10 }
  ]
}
```

---

### `GET /api/market/benchmarks?period=1y`
Index-Benchmarks für Performance-Vergleich.

**Response:**
```json
{
  "sp500": [{ "date": "2024-01-02", "value": 100.0 }, ...],
  "msci_world": [{ "date": "2024-01-02", "value": 100.0 }, ...]
}
```
(Indexed auf 100 am Startpunkt)

---

## Portfolio

> Alle Portfolio-Endpunkte erfordern `Authorization: Bearer <token>`

### `GET /api/portfolio/positions`
Alle Positionen des eingeloggten Nutzers.

**Response:**
```json
[
  {
    "id": "uuid",
    "ticker": "AAPL",
    "name": "Apple Inc.",
    "purchase_price": 150.00,
    "quantity": 10,
    "purchase_date": "2024-01-15",
    "sector": "Technology",
    "region": "USA",
    "current_price": 185.50
  }
]
```

---

### `POST /api/portfolio/positions`
Position hinzufügen.

**Request Body:**
```json
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "purchase_price": 150.00,
  "quantity": 10,
  "purchase_date": "2024-01-15",
  "sector": "Technology",
  "region": "USA"
}
```

---

### `PUT /api/portfolio/positions/{id}`
Position aktualisieren. Gleicher Body wie POST.

---

### `DELETE /api/portfolio/positions/{id}`
Position löschen. Keine Body erforderlich.

---

### `POST /api/portfolio/refresh`
Aktuelle Kurse für alle Positionen neu laden.

**Response:** `{ "updated": 5 }`

---

### `GET /api/portfolio/performance?period=1y`
Portfolio-Performance vs. Benchmarks.

**Response:**
```json
{
  "portfolio": [{ "date": "2024-01-02", "value": 100.0 }, ...],
  "sp500": [...],
  "msci_world": [...],
  "outperforming_sp500": true,
  "returns": {
    "portfolio": 23.4,
    "sp500": 18.1,
    "msci_world": 15.3
  }
}
```

---

## API Key Management

> Erfordert `Authorization: Bearer <token>`

### `GET /api/keys/status`
Prüft welche Provider konfiguriert sind.

**Response:**
```json
{
  "groq": true,
  "claude": false,
  "tavily": true,
  "alphavantage": false,
  "ollama": false
}
```

---

### `POST /api/keys/test`
API-Key testen ohne zu speichern.

**Request Body:**
```json
{ "provider": "groq", "key": "gsk_..." }
```

**Response:**
```json
{ "valid": true, "message": "Verbindung erfolgreich" }
```

---

### `POST /api/keys/{provider}`
API-Key speichern.

**Erlaubte Provider:** `groq | claude | tavily`

**Request Body:**
```json
{ "key": "gsk_..." }
```

---

### `POST /api/keys/ollama`
Ollama-Konfiguration speichern.

**Request Body:**
```json
{ "base_url": "http://localhost:11434", "model": "llama3" }
```

---

### `POST /api/keys/alphavantage`
Alpha Vantage Key speichern.

**Request Body:**
```json
{ "key": "ABCDEF12345" }
```

---

## Frontend API-Helferfunktionen (lib/api.js)

### Formatter-Funktionen
```js
formatCurrency(value, currency='EUR', locale='de-DE')
// 12345.67 → "12.345,67 €"

formatNumber(value, decimals=2, locale='de-DE')
// 1234.567 → "1.234,57"

formatPercent(value, decimals=2)
// 0.1234 → "12.34%"

formatLargeNumber(value, locale='de-DE')
// 2850000000000 → "2,85 Bio."
// 1500000000 → "1,50 Mrd."
// 45000000 → "45,00 Mio."
```

### WebSocket-Basis
```js
WS_BASE // Automatisch aus API_BASE abgeleitet:
// "http://localhost:7842" → "ws://localhost:7842"
// "https://nexus.onrender.com" → "wss://nexus.onrender.com"
```
