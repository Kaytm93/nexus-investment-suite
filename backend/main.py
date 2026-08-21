"""
NEXUS Investment Suite — FastAPI Backend
Uses Ollama (local LLM) + Tavily (web search) instead of Playwright/Perplexity.
"""

import os
import re
import sys
import json
import uuid
import time
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional, Dict, List

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

sys.path.insert(0, str(Path(__file__).parent))

import database
from database import (
    init_db,
    get_all_positions as sqlite_get_all_positions,
    add_position as sqlite_add_position,
    update_position as sqlite_update_position,
    delete_position as sqlite_delete_position,
    update_position_price as sqlite_update_position_price,
    get_position_transactions as sqlite_get_position_transactions,
    add_position_transaction as sqlite_add_position_transaction,
    get_position_transaction as sqlite_get_position_transaction,
    delete_position_transaction as sqlite_delete_position_transaction,
    save_altair_report, get_altair_report,
    save_elara_results, get_elara_results,
)
import supabase_db
import models
from models import (
    ElaraRequest, AltairRequest,
    PortfolioPositionCreate, PortfolioPositionUpdate,
    PortfolioTransactionCreate, PortfolioTransaction,
    PortfolioPosition, PerformanceData, PriceRefreshResult,
)
from search_service import SearchService
from ollama_service import OllamaService
from groq_service import GroqService
from yfinance_service import YFinanceService
from sandbox import run_python

# ── Path constants ─────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# ── Load config ────────────────────────────────────────────────────────────────

CONFIG_PATH = PROJECT_ROOT / "config.json"

# Secret fields in config.json that must be encrypted at rest.
_SECRET_FIELDS = (
    "tavily_api_key",
    "claude_api_key",
    "alphavantage_api_key",
    "openai_api_key",
    "gemini_api_key",
)
_ENCRYPTED_PREFIX = "fernet:"

def _get_fernet():
    """Return a Fernet instance, or None if ENCRYPTION_KEY is not set."""
    key = os.environ.get("ENCRYPTION_KEY", "").strip()
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as exc:
        print(f"[NEXUS] WARNING: ENCRYPTION_KEY invalid ({exc}); secrets will be stored in plaintext.")
        return None

def _decrypt_secret(value: str, fernet) -> str:
    if not value or not isinstance(value, str) or not value.startswith(_ENCRYPTED_PREFIX):
        return value
    if fernet is None:
        # Encrypted value but no key available — cannot decrypt. Return empty to fail closed.
        print("[NEXUS] WARNING: encrypted secret in config but no ENCRYPTION_KEY set.")
        return ""
    try:
        return fernet.decrypt(value[len(_ENCRYPTED_PREFIX):].encode()).decode()
    except Exception as exc:
        print(f"[NEXUS] WARNING: failed to decrypt secret ({exc}).")
        return ""

def _encrypt_secret(value: str, fernet) -> str:
    if not value or not isinstance(value, str):
        return value
    if value.startswith(_ENCRYPTED_PREFIX):
        return value  # already encrypted
    if fernet is None:
        return value  # no key: store as-is (degraded mode, warned in lifespan)
    return _ENCRYPTED_PREFIX + fernet.encrypt(value.encode()).decode()

def load_config() -> dict:
    if CONFIG_PATH.exists():
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    else:
        cfg = {
            "ollama_model": "qwen2.5:14b",
            "ollama_num_ctx": 32768,
            "tavily_api_key": "",
            "port": 7842,
        }
    # Decrypt any encrypted secrets before handing cfg to callers.
    fernet = _get_fernet()
    for field in _SECRET_FIELDS:
        if field in cfg:
            cfg[field] = _decrypt_secret(cfg[field], fernet)
    # Env vars override config.json — needed for Render deployment
    if os.environ.get("TAVILY_API_KEY"):
        cfg["tavily_api_key"] = os.environ["TAVILY_API_KEY"]
    if os.environ.get("OLLAMA_MODEL"):
        cfg["ollama_model"] = os.environ["OLLAMA_MODEL"]
    return cfg

def save_config(cfg: dict) -> None:
    """Persist config.json, encrypting secret fields at rest."""
    fernet = _get_fernet()
    cfg_to_write = dict(cfg)
    for field in _SECRET_FIELDS:
        if field in cfg_to_write:
            cfg_to_write[field] = _encrypt_secret(cfg_to_write[field], fernet)
    CONFIG_PATH.write_text(
        json.dumps(cfg_to_write, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

# ── Simple in-memory TTL cache ────────────────────────────────────────────────
# Used for read-heavy yFinance/Tavily lookups so repeated requests for the same
# input don't hammer upstream APIs.

_TTL_CACHE: Dict[str, tuple] = {}

def cache_get(key: str):
    entry = _TTL_CACHE.get(key)
    if entry and entry[0] > time.monotonic():
        return entry[1]
    if entry:
        _TTL_CACHE.pop(key, None)
    return None

def cache_set(key: str, value, ttl_seconds: int) -> None:
    _TTL_CACHE[key] = (time.monotonic() + ttl_seconds, value)

# ── System Prompts ─────────────────────────────────────────────────────────────

ELARA_SYSTEM_PROMPT = """# System-Rolle: Project Elara v2 (Quantamental Sector Screener)

Du bist **Elara**, ein spezialisiertes KI-Screening-System für quantamentale Aktien-Vorauswahl. Dein Zweck: Aus einem gegebenen Sektor die ~30 relevantesten Titel identifizieren, nach einem proprietären Score ranken und eine saubere Shortlist liefern — effizient, datengetrieben, ohne Overengineering.

> **Wichtig:** Du bist ein Screener, kein Deep-Analyst. Deine Aufgabe ist Breite und Geschwindigkeit, nicht Tiefe.

Starte SOFORT mit dem Screening. Überspringe jede Willkommensnachricht.

## PHASE 2: SCREENING & AUSFÜHRUNG

### 2.1 Sektor-Adaptive Logik

Vier Dimensionen müssen IMMER abgedeckt sein — die konkreten Metriken wählst du basierend auf dem Sektor:

1. **Bewertung** — P/E, P/B, EV/EBITDA, P/FFO je nach Sektor. Mit 5Y Ø und Val. Gap wenn möglich.
2. **Qualität** — FCF Margin, ROE, Margenstabilität. Plus: Moat (1-10).
3. **Risiko** — Beta + Risk Score (1-10). Sektorspezifische Kennzahlen.
4. **Wachstum** — PEG, Revenue Growth, relevante Wachstumsmetrik des Sektors.

Score-Gewichtung nach Sektortyp:
- Growth (Tech, Biotech): Bewertung 15% · Qualität 25% · Risiko 20% · Wachstum 40%
- Value/Defensiv: Bewertung 35% · Qualität 35% · Risiko 20% · Wachstum 10%
- Zyklisch: Bewertung 25% · Qualität 25% · Risiko 30% · Wachstum 20%
- Financials: Bewertung 30% · Qualität 30% · Risiko 25% · Wachstum 15%
- Blend: Bewertung 25% · Qualität 30% · Risiko 20% · Wachstum 25%

### 2.2 Daten-Integrität

Nutze AUSSCHLIESSLICH die im Kontext bereitgestellten Daten aus der Websuche. Kennzeichne fehlende Werte mit `—`. Schätze oder erfinde KEINE Zahlen.

### 2.3 Die Elara-Tabelle

Erstelle eine Markdown-Tabelle, sortiert absteigend nach Elara Score:
`| # | Ticker | Name | Mkt Cap | [5-8 Metriken] | Risk (1-10) | Moat (1-10) | Elara Score |`

Risk (1-10): 1 = minimal, 10 = hochriskant. Risk ≥ 9 automatisch ans Ende.
Moat (1-10): 1 = kein Vorteil, 10 = unangreifbar.
Elara Score (0-100): Gewichteter Gesamtscore.

## PHASE 3: ABSCHLUSS

### 3.1 Sector Champion (3-4 Sätze max)
### 3.2 Auffälligkeiten (optional, 1-2 Sätze)
### 3.3 Daten-Signatur

Format: **Daten:** Tavily Web Search | Basis: Live-Daten | Modell: Lokal ✅

## VERHALTENSREGELN
- ~30 Titel als Richtwert
- Runde auf 2 Nachkommastellen
- Keine Kaufempfehlungen
- Du bist kein Finanzberater"""

ALTAIR_SYSTEM_PROMPT = """Du bist Altair, ein KI-System für Value Investing. Starte SOFORT. Keine Willkommensnachricht.

RECHERCHE-PFLICHT: Nutze in ALLEN ```research Queries IMMER den vollständigen Firmennamen aus dem ANALYSE-AUFTRAG-Header (z.B. "Oracle Corporation", nicht "ORC"). Ticker-Kürzel allein können zu falschen Suchergebnissen führen.

SCHRITT 0 — TYP-ERKENNUNG (PFLICHT)
ETF-Signale: "ETF", "UCITS", "iShares", "Vanguard", "Xtrackers", "Amundi", "SPDR", "Lyxor".
FALL A — ETF → SEKTION ETF-ANALYSE (überspringe Phase 1+2)
FALL B — Aktie → PHASE 1

SEKTION ETF-ANALYSE (NUR wenn ETF erkannt)
VERBOTEN: DCF, Fair Value, Insider-Aktivität, EV/EBITDA, KGV, Margin of Safety, Conviction Score, Pre-Mortem.

Recherchiere mit:
```research
[ETF-Name/ISIN] TER expense ratio replication top holdings tracking difference 2024 2025
```

Report-Pflichtfelder: Name, ISIN, Replikation (physisch/synthetisch), TER, Tracking Difference, Fondsvolumen, Ausschüttungsart, Auflagedatum, Domizil.
Dann: Top-10-Holdings (Tabelle), Sektorverteilung, Länderverteilung, Index-KGV/KBV, Kosten-Effizienz (TD vs. TER), Rendite 1J/3J/5J/10J, Alpha vs. S&P 500 (~10% p.a.) / MSCI World (~8% p.a.), Fazit (Core/Satellit/Meiden, Sparplan-geeignet).

PHASE 1 — METHODIK-RECHERCHE (max. 2 Recherchen, nur Aktien)
Sektorabhängige Methoden:
  Tech/SaaS: EV/Revenue, Rule of 40, FCF-Marge, NTM-Multiples
  Banken: KBV, RoE, NIM, CET1 — KEIN DCF
  Asset Manager: KBV, AUM-Wachstum, Fee-Marge, Cost-Income-Ratio — KEIN DCF
  REITs: FFO-Multiple, NAV-Abschlag, LTV — KEIN KGV
  Energie: EV/EBITDA, Reserve-Leben, Lifting-Kosten
  Pharma: rNPV, EV/Sales, SOTP
  Konsum: EV/EBITDA, ROIC, Pricing Power
  Standard: DCF (zweistufig), EV/EBITDA, KGV, KBV

```research
[Ticker] valuation methods fair value analyst 2025
```
Maximal 2 Recherchen.

═══════════════════════════════════════════════════════════════
PHASE 2 — PYTHON-BERECHNUNG (max. 4 Berechnungen)
Berechne Fair Values mit Python (math/statistics vorgeladen). print() für alle Ergebnisse.
NIEMALS Zahlen erfinden — immer ```calculate verwenden.

PHASE 3 — ALTAIR-REPORT
Sections: ## 1. Finanz-Snapshot & Peer-Check | ## 2. Qualität & Substanz | ## 3. Bewertung & Szenarien (Base/Worst/Bull mit Fair Value + Margin of Safety) | ## 4. Pre-Mortem Stresstest (2030, -70%) | ## 5. Fazit

## 1. Finanz-Snapshot & Peer-Check
PFLICHT: Nenne GENAU 2 direkte Peers mit Name + Ticker (z.B. "Apple (AAPL)"). Format: Markdown-Tabelle mit Kennzahlen.

## 4. Pre-Mortem Stresstest (2030, -70%)
PFLICHT: Beschreibe EINE spezifische, unternehmensrelevante Ursache (z.B. konkreter Wettbewerber, Regulierungsrisiko, Technologieshift). KEIN allgemeiner "Marktabschwung" oder "Rezession" als einzige Ursache erlaubt.

MODUL 4 — KAPITALALLOKATION

Conviction Score (0-7) — PFLICHT: Zeige für jedes Kriterium den zugeteilten Punkt, z.B.:
+2 MoS >30% ✓ | +2 Wide Moat ✓ | +1 kein Kill-Szenario ✓ | +1 Insider-Käufe ✗ | -1 ND/EBITDA >3 ✗ → Gesamt: X/7
Kriterien: +2 MoS >30%, +1 MoS 15-30%, +2 Wide Moat, +1 Mod. Moat, +1 kein Kill-Szenario, -1 starkes Kill-Szenario, +1 Insider-Käufe netto, -1 ND/EBITDA >3

Positionsgröße VERBINDLICH (exakt diese Tabelle, keine eigene Interpretation):
Score 7 oder 6 → Positionsgröße 8-12%
Score 5 oder 4 → Positionsgröße 4-7%
Score 3 oder 2 → Positionsgröße 1-3%
Score 1 oder 0 → NICHT KAUFEN

Timing-Signal: >20% unter FV→🟢 JETZT KAUFEN | 5-20%→🟡 WARTE | nahe/über FV→🔴 WATCHLIST

Fair Value PFLICHT: IMMER als Preis pro Aktie in der Handelswährung (z.B. 185,00 EUR/Aktie), NIEMALS als Marktkapitalisierung in Mrd. Berechnung: Eigenkapitalwert (EUR) ÷ Aktienanzahl = Fair Value pro Aktie.

Rendite-Tabelle (Markdown-Tabelle PFLICHT): | Szenario | Fair Value (€/Aktie) | Kaufkurs | Rendite 3J | Rendite 5J | p.a. |
Alpha-Check: Base p.a. vs. S&P 500 (~10%) / MSCI World (~8%).

Abschluss-Dashboard: Conviction [X/7], Positionsgröße (aus Tabelle oben), Timing-Signal, Rendite 3J/5J/p.a., Alpha.

Regeln: Runde auf 2 Stellen. Kein Finanzberater. Niemals Zahlen erfinden."""

# ── WebSocket Manager ──────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self._connections: Dict[str, WebSocket] = {}

    async def connect(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self._connections[session_id] = ws

    def disconnect(self, session_id: str):
        self._connections.pop(session_id, None)

    async def send(self, session_id: str, message: str, msg_type: str = "progress"):
        ws = self._connections.get(session_id)
        if ws:
            try:
                await ws.send_json({
                    "type": msg_type,
                    "session_id": session_id,
                    "message": message,
                    "timestamp": time.time(),
                })
            except Exception:
                self.disconnect(session_id)

    async def send_progress(self, session_id: str, message: str, elapsed: int = 0, status: str = "running"):
        ws = self._connections.get(session_id)
        if ws:
            try:
                await ws.send_json({
                    "type": "progress",
                    "session_id": session_id,
                    "status": status,
                    "message": message,
                    "elapsed": elapsed,
                })
            except Exception:
                self.disconnect(session_id)

    async def send_complete(self, session_id: str):
        ws = self._connections.get(session_id)
        if ws:
            try:
                await ws.send_json({"type": "complete", "session_id": session_id, "status": "done"})
            except Exception:
                self.disconnect(session_id)

    async def send_error(self, session_id: str, error_message: str):
        ws = self._connections.get(session_id)
        if ws:
            try:
                await ws.send_json({
                    "type": "error",
                    "session_id": session_id,
                    "status": "failed",
                    "message": error_message,
                })
            except Exception:
                self.disconnect(session_id)


manager = ConnectionManager()

# ── Services ───────────────────────────────────────────────────────────────────

search_service: Optional[SearchService] = None
ollama_service: Optional[OllamaService] = None
yf_service: Optional[YFinanceService] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global search_service, ollama_service, yf_service
    init_db()
    print("[NEXUS] Database initialized.")

    cfg = load_config()
    tavily_key = cfg.get("tavily_api_key", "")

    if tavily_key and tavily_key != "YOUR_TAVILY_API_KEY_HERE":
        search_service = SearchService(api_key=tavily_key)
        await search_service.init()
        print("[NEXUS] Search service (Tavily) initialized.")
    else:
        print("[NEXUS] WARNING: No Tavily API key. Qualitative search disabled.")

    yf_service = YFinanceService()
    print("[NEXUS] yFinance service initialized (no API key needed).")

    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if groq_key:
        print("[NEXUS] GROQ_API_KEY detected.")
        ollama_service = GroqService(api_key=groq_key)
        print("[NEXUS] AI provider: Groq (llama-3.3-70b-versatile)")
    else:
        ollama_service = OllamaService(
            model=cfg.get("ollama_model", "qwen2.5:14b"),
            num_ctx=cfg.get("ollama_num_ctx", 32768),
        )
        print("[NEXUS] AI provider: Ollama (local)")
    await ollama_service.init()

    # Also expose services on app.state so future endpoints can inject via
    # `request.app.state.*` instead of reaching for module globals.
    app.state.search_service = search_service
    app.state.ollama_service = ollama_service
    app.state.yf_service = yf_service
    app.state.connection_manager = manager

    yield

    if search_service:
        await search_service.close()
    await ollama_service.close()
    if yf_service:
        yf_service.close()
    print("[NEXUS] Services closed.")


app = FastAPI(
    title="NEXUS Investment Suite",
    description="AI-powered investment research: Elara screener + Altair deep dives + Portfolio management",
    version="2.0.0",
    lifespan=lifespan,
)

_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://nexus-investment-suite.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

# ── Rate limiting (per-IP) ─────────────────────────────────────────────────────
# Protects expensive LLM/search endpoints from quota exhaustion.
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Static files ───────────────────────────────────────────────────────────────

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/", include_in_schema=False)
async def serve_frontend():
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse(
        {"error": "Frontend not found. Ensure frontend/index.html exists."},
        status_code=404,
    )

# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    # When Supabase is configured (production), require a valid token via
    # ?token=<jwt> query param so unauthenticated clients can't subscribe to
    # arbitrary session_ids and observe other users' research progress.
    if supabase_db.is_configured():
        token = websocket.query_params.get("token", "")
        user_id = supabase_db.get_user_from_token(token) if token else None
        if not user_id:
            await websocket.close(code=4401)  # Policy violation
            return

    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception:
        manager.disconnect(session_id)

# ── Status endpoint ────────────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    cfg = load_config()
    tavily_ok = bool(cfg.get("tavily_api_key") and cfg["tavily_api_key"] != "YOUR_TAVILY_API_KEY_HERE")
    ollama_ok = await ollama_service.is_available() if ollama_service else False
    return {
        "tavily": tavily_ok,
        "ollama": ollama_ok,
        "model": cfg.get("ollama_model", "qwen2.5:14b"),
        "ready": tavily_ok and ollama_ok,
    }

@app.get("/api/health")
async def health_check():
    cfg = load_config()
    tavily_ok = bool(cfg.get("tavily_api_key") and cfg["tavily_api_key"] != "YOUR_TAVILY_API_KEY_HERE")
    ollama_ok = await ollama_service.is_available() if ollama_service else False
    groq_active = bool(os.environ.get("GROQ_API_KEY", "").strip())
    active_model = "llama-3.3-70b-versatile (Groq)" if groq_active else cfg.get("ollama_model", "qwen2.5:14b")
    return {
        "status": "ok",
        "tavily_configured": tavily_ok,
        "ollama_running": ollama_ok,
        "model": active_model,
        "provider": "groq" if groq_active else "ollama",
    }

# ── Config endpoint ────────────────────────────────────────────────────────────

@app.get("/api/config")
async def get_config():
    cfg = load_config()
    key = cfg.get("tavily_api_key", "")
    cfg["tavily_api_key_set"] = bool(key and key != "YOUR_TAVILY_API_KEY_HERE")
    cfg["tavily_api_key"] = "***" if cfg["tavily_api_key_set"] else ""
    return cfg

@app.post("/api/config")
async def update_config(data: dict):
    global search_service, ollama_service
    cfg = load_config()
    allowed = ["ollama_model", "ollama_num_ctx", "tavily_api_key"]
    for k in allowed:
        if k in data:
            cfg[k] = data[k]
    save_config(cfg)
    # Reinit services with new config
    if "tavily_api_key" in data:
        if search_service:
            await search_service.close()
        search_service = SearchService(api_key=data["tavily_api_key"])
        await search_service.init()
        app.state.search_service = search_service
    if "ollama_model" in data or "ollama_num_ctx" in data:
        await ollama_service.close()
        ollama_service = OllamaService(
            model=cfg.get("ollama_model", "qwen2.5:14b"),
            num_ctx=cfg.get("ollama_num_ctx", 32768),
        )
        await ollama_service.init()
        app.state.ollama_service = ollama_service
    return {"success": True}

# ── Elara Screener ─────────────────────────────────────────────────────────────

def _validate_elara_scores(markdown: str) -> dict:
    """
    Extract the rightmost numeric column (Elara Score) from every data row of
    the first markdown table and validate it is in [0, 100].

    Returns {"rows": int, "valid": int, "out_of_range": int, "unparseable": int,
             "min": float|None, "max": float|None}.
    """
    rows = 0
    valid = 0
    out_of_range = 0
    unparseable = 0
    min_s: Optional[float] = None
    max_s: Optional[float] = None

    for line in markdown.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|") or not stripped.endswith("|"):
            continue
        # Skip header separator rows like |---|---|
        if set(stripped.replace("|", "").replace(":", "").strip()) <= {"-", " "}:
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if len(cells) < 4:
            continue
        # Header row heuristic: first cell is "#" literal or "Ticker"
        first = cells[0].lower()
        if first in ("#", "ticker", "name") or "ticker" in first and "name" in cells[1].lower() if len(cells) > 1 else False:
            continue
        rows += 1
        # Elara Score is the last numeric-looking cell
        score_cell = cells[-1].replace(",", ".").replace("%", "").strip()
        try:
            score = float(score_cell)
        except ValueError:
            unparseable += 1
            continue
        if 0.0 <= score <= 100.0:
            valid += 1
            min_s = score if min_s is None else min(min_s, score)
            max_s = score if max_s is None else max(max_s, score)
        else:
            out_of_range += 1

    return {
        "rows": rows,
        "valid": valid,
        "out_of_range": out_of_range,
        "unparseable": unparseable,
        "min": min_s,
        "max": max_s,
    }


@app.post("/api/elara/screen")
@limiter.limit("5/minute")
async def elara_screen(request: Request, payload: ElaraRequest):
    session_id = payload.session_id

    # Check cache first
    cached = get_elara_results(payload.sector)
    if cached:
        result_data = cached["results_json"]
        raw_content = result_data.get("content", result_data.get("raw_content", ""))
        return {
            "success": True,
            "sector": payload.sector,
            "raw_content": raw_content,
            "sources": result_data.get("sources", []),
            "cached": True,
            "score_validation": _validate_elara_scores(raw_content),
        }

    # 1. Gather web data
    await manager.send_progress(session_id, "Suche Finanzdaten via Tavily...")
    if search_service:
        filters = {}
        if payload.filters:
            if payload.filters.min_market_cap:
                filters["min_market_cap"] = payload.filters.min_market_cap
            if payload.filters.region:
                filters["region"] = payload.filters.region
        search_data = await search_service.gather_sector_data(payload.sector, filters)
        context = search_data["context"]
        sources = search_data["sources"]
    else:
        context = "Keine Web-Suche verfügbar (Tavily API-Key nicht konfiguriert)."
        sources = []

    await manager.send_progress(session_id, f"Web-Daten gesammelt ({len(context)} Zeichen). Starte Ollama-Analyse...")

    # 2. Build prompt
    filter_text = ""
    if payload.filters:
        f = payload.filters
        if f.min_market_cap is not None:
            filter_text += f"\nMindest-Marktkapitalisierung: ${f.min_market_cap:.1f}B"
        if f.region:
            filter_text += f"\nRegion: {f.region}"
        if f.exclusions:
            filter_text += f"\nAusschlüsse: {f.exclusions}"
        if f.horizon:
            filter_text += f"\nAnlagehorizont: {f.horizon}"

    user_message = f"""SCREENING-AUFTRAG:
Sektor/Thema: {payload.sector}{filter_text}

AKTUELLE WEB-DATEN (Tavily-Suche):
{context}

Erstelle jetzt das vollständige Elara-Screening basierend auf diesen Daten."""

    # 3. Run Ollama (awaited — HTTP connection stays open, WS progress still works)
    async def progress(msg):
        await manager.send_progress(session_id, msg)

    result = await ollama_service.chat(
        system_prompt=ELARA_SYSTEM_PROMPT,
        user_message=user_message,
        progress_callback=progress,
    )

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Ollama-Fehler"))

    validation = _validate_elara_scores(result["content"])
    if validation["rows"] > 0 and (validation["out_of_range"] or validation["unparseable"]):
        print(
            f"[Elara] Score validation warnings for '{payload.sector}': "
            f"rows={validation['rows']} valid={validation['valid']} "
            f"out_of_range={validation['out_of_range']} unparseable={validation['unparseable']}"
        )

    save_elara_results(payload.sector, {
        "content": result["content"],
        "sources": sources,
        "sector": payload.sector,
    })
    await manager.send_complete(session_id)
    return {
        "success": True,
        "sector": payload.sector,
        "raw_content": result["content"],
        "sources": sources,
        "cached": False,
        "score_validation": validation,
    }

# ── Altair Deep Dive ───────────────────────────────────────────────────────────

def _cache_timestamp_iso(value: Optional[str]) -> Optional[str]:
    """Normalize SQLite's UTC timestamp into an explicit ISO-8601 UTC value."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError):
        return None


@app.post("/api/altair/analyze")
@limiter.limit("5/minute")
async def altair_analyze(request: Request, payload: AltairRequest):
    session_id = payload.session_id
    ticker = payload.ticker.upper().strip()

    # Check cache (skip if force_refresh requested)
    cached = None if payload.force_refresh else get_altair_report(ticker)
    if cached:
        report_data = cached["report_json"]
        return {
            "success": True,
            "ticker": ticker,
            "raw_content": report_data.get("content", report_data.get("raw_content", "")),
            "sources": report_data.get("sources", []),
            "cached": True,
            "cached_at": _cache_timestamp_iso(cached.get("created_at")),
        }

    # 1a. yfinance — strukturierte Finanzdaten (kostenlos, schnell)
    await manager.send_progress(session_id, f"Lade Finanzdaten für {ticker} via yFinance...")
    yf_data = await yf_service.get_ticker_data(ticker)

    yf_failed = bool(yf_data.get("error"))
    resolved_ticker = yf_data.get("ticker", ticker)

    if not yf_failed and resolved_ticker != ticker:
        await manager.send_progress(session_id, f"Ticker aufgelöst: {ticker} → {resolved_ticker}")
    elif yf_failed and search_service:
        # Try to resolve the primary ticker via web search (handles ISIN, company name, cross-listings)
        await manager.send_progress(session_id, f"Kein yFinance-Treffer für '{ticker}' — suche primären Ticker...")
        resolution = await search_service.resolve_primary_ticker(ticker)
        if resolution["found"] and resolution["ticker"] != ticker:
            candidate = resolution["ticker"]
            await manager.send_progress(session_id, f"Primärer Ticker gefunden: {candidate} — lade yFinance-Daten...")
            yf_data2 = await yf_service.get_ticker_data(candidate)
            if not yf_data2.get("error"):
                yf_data = yf_data2
                resolved_ticker = candidate
                yf_failed = False
                await manager.send_progress(session_id, f"yFinance-Daten für {candidate} geladen.")
            else:
                await manager.send_progress(session_id, f"Auch {candidate} nicht in yFinance — nutze Tavily-Fallback.")
        else:
            await manager.send_progress(session_id, f"Kein primärer Ticker ermittelbar — nutze Tavily-Fallback.")

    yf_context = yf_service.format_for_prompt(yf_data)
    company_name = yf_data.get("name", "") or ticker

    # 1b. Risk-Free Rate — 10y US Treasury yield (^TNX)
    rfr_value = None
    try:
        rfr_data = await yf_service.get_ticker_data("^TNX")
        rfr_raw = rfr_data.get("current_price")
        if rfr_raw:
            rfr_value = float(rfr_raw)
    except Exception:
        pass
    # CAPM: discount_rate = Rf + β × ERP (equity risk premium ≈ 5.0%)
    # Clamp β to [0.5, 2.5] to avoid pathological outputs from sparse/noisy yfinance data.
    EQUITY_RISK_PREMIUM = 5.0
    beta_raw = yf_data.get("beta")
    beta_used: Optional[float]
    try:
        beta_used = float(beta_raw) if beta_raw is not None else None
    except (TypeError, ValueError):
        beta_used = None
    if beta_used is not None:
        beta_used = max(0.5, min(2.5, beta_used))

    if rfr_value:
        rfr_text = f"10y US-Treasury Yield (Risk-Free Rate): {rfr_value:.2f}%"
        if beta_used is not None:
            discount_rate = rfr_value + beta_used * EQUITY_RISK_PREMIUM
            rfr_text += (
                f"\nBeta (yFinance, geklemmt auf [0.5, 2.5]): {beta_used:.2f}"
                f"\nDiskontierungssatz (CAPM: Rf + β × 5%): {discount_rate:.2f}%"
            )
        else:
            discount_rate = rfr_value + EQUITY_RISK_PREMIUM
            rfr_text += (
                f"\nBeta: nicht verfügbar — Annahme β=1.0"
                f"\nDiskontierungssatz (Rf + 5%): {discount_rate:.2f}%"
            )
    else:
        if beta_used is not None:
            fallback_rate = 4.5 + beta_used * EQUITY_RISK_PREMIUM
            rfr_text = (
                f"10y US-Treasury Yield: ~4.50% (Fallback-Schätzung, kein Live-Wert)"
                f"\nBeta (yFinance, geklemmt auf [0.5, 2.5]): {beta_used:.2f}"
                f"\nDiskontierungssatz (CAPM: 4.5% + β × 5%): {fallback_rate:.2f}%"
            )
        else:
            rfr_text = (
                "10y US-Treasury Yield: ~4.50% (Fallback-Schätzung, kein Live-Wert)"
                "\nBeta: nicht verfügbar — Annahme β=1.0"
                "\nDiskontierungssatz: 9.50%"
            )

    # 1c. Tavily — qualitative Daten + bei yfinance-Fehler auch quantitative Suche
    sources = []
    qualitative_context = ""
    if search_service:
        if yf_failed:
            # yfinance hat nichts gefunden → mehr Tavily-Suchen als Fallback
            fallback = await search_service.gather_ticker_data_full(ticker)
            qualitative_context = fallback["context"]
            sources = fallback["sources"]
            await manager.send_progress(session_id, f"Fallback: {len(sources)} Quellen via Tavily gesammelt.")
        else:
            qual_data = await search_service.gather_ticker_qualitative(ticker, company_name=company_name)
            qualitative_context = qual_data["context"]
            sources = qual_data["sources"]
            await manager.send_progress(session_id, f"Daten komplett ({len(sources)} Quellen). Starte Analyse...")

    yf_hint = ""
    if yf_failed:
        yf_hint = (
            f"\n⚠️ HINWEIS: Kein Yahoo Finance Datensatz für '{ticker}' gefunden "
            f"(möglicherweise Cross-Listing oder unbekanntes Symbol). "
            f"Quantitative Daten aus Web-Recherche — bitte explizit kennzeichnen."
        )
    elif resolved_ticker != ticker:
        yf_hint = f"\nHINWEIS: '{ticker}' wurde automatisch zum primären Ticker '{resolved_ticker}' aufgelöst."

    # 2. Build initial prompt
    # Cap context to stay within Groq free tier TPM limit
    yf_context_capped = yf_context[:3000]
    qual_context_capped = (qualitative_context or "Keine Web-Suche konfiguriert.")[:2500]

    user_message = f"""ANALYSE-AUFTRAG: {ticker} — {company_name}
⚠️ UNTERNEHMEN: "{company_name}" (Ticker: {ticker}). Nutze IMMER den vollständigen Firmennamen in Recherche-Queries, NIEMALS nur das Ticker-Kürzel — Kürzel können auf mehrere Unternehmen zeigen.
{yf_hint}

## ZINSDATEN (für DCF-Berechnung):
{rfr_text}

## STRUKTURIERTE FINANZDATEN (Yahoo Finance — Live):
{yf_context_capped}

## QUALITATIVE KONTEXTDATEN (Insider, News, Moat):
{qual_context_capped}

Starte jetzt mit Phase 1: Recherchiere die optimale Bewertungsmethodik für {company_name}."""

    # 3. Agentic loop — research → calculate → report
    async def progress(msg):
        await manager.send_progress(session_id, msg)

    async def search_fn(query: str) -> str:
        """Wrapper: runs Tavily search and returns formatted string for the model."""
        if not search_service:
            return "Tavily nicht konfiguriert — keine Suche möglich."
        result = await search_service.search(query, max_results=1, search_depth="basic")
        if not result["success"]:
            return f"Suche fehlgeschlagen: {result.get('error', 'unbekannt')}"
        parts = []
        if result.get("answer"):
            parts.append(f"Zusammenfassung: {result['answer'][:300]}")
        for r in result.get("results", []):
            parts.append(f"[{r['url']}]\n{r['content'][:200]}")
            sources.append({"url": r["url"], "title": r.get("title", r["url"])})
        return "\n\n".join(parts) if parts else "Keine Ergebnisse gefunden."

    result = await ollama_service.agentic_chat(
        system_prompt=ALTAIR_SYSTEM_PROMPT,
        user_message=user_message,
        search_fn=search_fn,
        calc_fn=run_python,
        progress_callback=progress,
        max_rounds=10,
    )

    if not result["success"]:
        raise HTTPException(status_code=500, detail=result.get("error", "Ollama-Fehler"))

    save_altair_report(ticker, {
        "content": result["content"],
        "sources": sources,
        "ticker": ticker,
    })
    saved_report = get_altair_report(ticker)
    await manager.send_complete(session_id)
    return {
        "success": True,
        "ticker": ticker,
        "raw_content": result["content"],
        "sources": sources,
        "cached": False,
        "cached_at": _cache_timestamp_iso(saved_report.get("created_at") if saved_report else None),
    }

# ── Auth dependency ────────────────────────────────────────────────────────────

async def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> Optional[str]:
    """
    Extract and validate the Supabase JWT from the Authorization header.

    Behavior:
      - When Supabase is NOT configured (local dev): returns None, allowing the
        SQLite fallback path. Multi-user isolation is impossible without Supabase,
        so this mode is intended for single-user dev environments only.
      - When Supabase IS configured (production): requires a valid Bearer token.
        Missing or invalid tokens raise HTTP 401 to prevent unauthenticated
        access to portfolio data.
    """
    if not supabase_db.is_configured():
        # Dev mode: no auth available, allow SQLite fallback.
        return None
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = authorization.removeprefix("Bearer ")
    user_id = supabase_db.get_user_from_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    return user_id


def _resolve_portfolio(user_id: Optional[str]) -> Optional[str]:
    """
    Return Supabase portfolio_id for the given user.
    Returns None if Supabase is not configured (triggers SQLite fallback).
    Raises 503 on DB error.
    """
    if not user_id or not supabase_db.is_configured():
        return None
    try:
        return supabase_db.get_or_create_portfolio(user_id)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Supabase-Fehler: {exc}")


def _sqlite_id(position_id: str) -> int:
    """Convert str position_id to int for SQLite fallback. Raises 400 on error."""
    try:
        return int(position_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Ungültige Position-ID für lokalen Modus")


def _serialize_transaction(transaction: dict) -> dict:
    """Normalize SQLite integer IDs to the string IDs exposed by the API."""
    result = dict(transaction)
    result["id"] = str(result["id"])
    result["position_id"] = str(result["position_id"])
    return result


# ── Portfolio ──────────────────────────────────────────────────────────────────

@app.get("/api/portfolio", response_model=List[PortfolioPosition])
async def get_portfolio(user_id: Optional[str] = Depends(get_current_user)):
    """Return all portfolio positions with calculated P&L and weights."""
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        raw_positions = supabase_db.get_all_positions(portfolio_id)
    else:
        raw_positions = sqlite_get_all_positions()
    return _enrich_positions(raw_positions)


@app.post("/api/portfolio/position", response_model=PortfolioPosition)
async def create_position(
    position: PortfolioPositionCreate,
    user_id: Optional[str] = Depends(get_current_user),
):
    """Add a new portfolio position."""
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        created = supabase_db.add_position(
            portfolio_id=portfolio_id,
            ticker=position.ticker,
            name=position.name,
            entry_price=position.entry_price,
            shares=position.shares,
            purchase_date=position.purchase_date,
            sector=position.sector,
            region=position.region,
        )
    else:
        created = sqlite_add_position(
            ticker=position.ticker,
            name=position.name,
            entry_price=position.entry_price,
            shares=position.shares,
            purchase_date=position.purchase_date,
            sector=position.sector,
            region=position.region,
        )
        created["id"] = str(created["id"])
    return _calculate_position_pnl(created, total_value=None)


@app.put("/api/portfolio/position/{position_id}", response_model=PortfolioPosition)
async def update_pos(
    position_id: str,
    updates: PortfolioPositionUpdate,
    user_id: Optional[str] = Depends(get_current_user),
):
    """Update an existing portfolio position."""
    update_dict = updates.model_dump(exclude_unset=True)
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        updated = supabase_db.update_position(position_id, update_dict)
    else:
        updated = sqlite_update_position(_sqlite_id(position_id), update_dict)
        if updated:
            updated["id"] = str(updated["id"])
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Position {position_id} nicht gefunden")
    return _calculate_position_pnl(updated, total_value=None)


@app.delete("/api/portfolio/position/{position_id}")
async def delete_pos(
    position_id: str,
    user_id: Optional[str] = Depends(get_current_user),
):
    """Delete a portfolio position."""
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        deleted = supabase_db.delete_position(position_id)
    else:
        deleted = sqlite_delete_position(_sqlite_id(position_id))
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Position {position_id} nicht gefunden")
    return {"success": True, "deleted_id": position_id}


@app.post("/api/portfolio/refresh-prices", response_model=PriceRefreshResult)
async def refresh_prices(user_id: Optional[str] = Depends(get_current_user)):
    """Refresh current prices for all portfolio positions via yFinance."""
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        positions = supabase_db.get_all_positions(portfolio_id)
    else:
        positions = sqlite_get_all_positions()

    updated_count = 0
    failed_count = 0
    errors = []

    tickers = [p["ticker"] for p in positions]
    if tickers:
        price_results = await yf_service.get_multiple(tickers)
        price_map = {r["ticker"]: r for r in price_results}
    else:
        price_map = {}

    for pos in positions:
        data = price_map.get(pos["ticker"], {})
        price = data.get("current_price")
        if price:
            if portfolio_id:
                supabase_db.update_position_price(pos["id"], price)
            else:
                sqlite_update_position_price(int(pos["id"]), price)
            pos["current_price"] = price
            updated_count += 1
        else:
            failed_count += 1
            errors.append(f"{pos['ticker']}: {data.get('error', 'Preis nicht gefunden')}")

    enriched = _enrich_positions(positions)

    return PriceRefreshResult(
        updated=updated_count,
        failed=failed_count,
        errors=errors,
        positions=enriched,
    )


@app.get("/api/portfolio/performance", response_model=PerformanceData)
async def get_performance(user_id: Optional[str] = Depends(get_current_user)):
    """Calculate portfolio performance vs S&P 500 and MSCI World benchmarks."""
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        positions = supabase_db.get_all_positions(portfolio_id)
    else:
        positions = sqlite_get_all_positions()
    if not positions:
        return PerformanceData(
            dates=[],
            portfolio_values=[],
            sp500_values=[],
            msci_values=[],
        )
    return _calculate_performance(positions)

# ── Portfolio calculation helpers ──────────────────────────────────────────────

def _calculate_position_pnl(pos: dict, total_value: Optional[float]) -> PortfolioPosition:
    """Compute P&L fields for a single position."""
    entry = pos.get("entry_price", 0) or 0
    stored_price = pos.get("current_price")
    price_stale = stored_price is None
    current = stored_price if stored_price is not None else entry
    shares = pos.get("shares", 0) or 0

    cost_basis = entry * shares
    current_value = current * shares
    pnl = current_value - cost_basis
    pnl_pct = ((current / entry) - 1) * 100 if entry > 0 else 0.0
    weight = (current_value / total_value * 100) if total_value and total_value > 0 else None

    return PortfolioPosition(
        id=str(pos["id"]),  # Always string — handles both UUID and SQLite int IDs
        ticker=pos["ticker"],
        name=pos["name"],
        entry_price=entry,
        current_price=current,
        shares=shares,
        purchase_date=pos.get("purchase_date", ""),
        sector=pos.get("sector"),
        region=pos.get("region"),
        pnl=round(pnl, 2),
        pnl_pct=round(pnl_pct, 2),
        weight=round(weight, 2) if weight is not None else None,
        cost_basis=round(cost_basis, 2),
        current_value=round(current_value, 2),
        price_stale=price_stale,
    )


def _enrich_positions(raw_positions: list) -> List[PortfolioPosition]:
    """Enrich all positions with P&L and weight calculations."""
    if not raw_positions:
        return []

    total_value = sum(
        (pos.get("current_price") or pos.get("entry_price", 0)) * pos.get("shares", 0)
        for pos in raw_positions
    )

    return [_calculate_position_pnl(pos, total_value) for pos in raw_positions]


def _calculate_performance(positions: list) -> PerformanceData:
    """
    Calculate simplified time-weighted portfolio performance.
    Uses earliest purchase date as start, today as end.
    Generates monthly data points.
    """
    from datetime import datetime, date

    earliest_date = None
    for pos in positions:
        try:
            d = datetime.strptime(pos["purchase_date"], "%Y-%m-%d").date()
            if earliest_date is None or d < earliest_date:
                earliest_date = d
        except (ValueError, TypeError):
            continue

    if earliest_date is None:
        earliest_date = date.today().replace(day=1)

    today = date.today()

    # Generate monthly date points
    dates = []
    current = earliest_date.replace(day=1)
    while current <= today:
        dates.append(current.isoformat())
        if current.month == 12:
            current = current.replace(year=current.year + 1, month=1)
        else:
            current = current.replace(month=current.month + 1)

    if not dates:
        return PerformanceData(
            dates=[today.isoformat()],
            portfolio_values=[100.0],
            sp500_values=[100.0],
            msci_values=[100.0],
        )

    total_months = len(dates)

    total_cost = sum(pos.get("entry_price", 0) * pos.get("shares", 0) for pos in positions)
    total_current = sum(
        (pos.get("current_price") or pos.get("entry_price", 0)) * pos.get("shares", 0)
        for pos in positions
    )

    total_return = (total_current / total_cost - 1) if total_cost > 0 else 0.0

    portfolio_values = []
    for i, _ in enumerate(dates):
        t = i / max(total_months - 1, 1)
        portfolio_values.append(round(100 * (1 + total_return * t), 2))

    sp500_annual_rate = 0.10
    msci_annual_rate = 0.08

    sp500_values = []
    msci_values = []
    for i, _ in enumerate(dates):
        years = i / 12.0
        sp500_values.append(round(100 * (1 + sp500_annual_rate) ** years, 2))
        msci_values.append(round(100 * (1 + msci_annual_rate) ** years, 2))

    portfolio_return_pct = round(total_return * 100, 2)
    years_total = total_months / 12.0
    sp500_return_pct = round(((1 + sp500_annual_rate) ** years_total - 1) * 100, 2)
    msci_return_pct = round(((1 + msci_annual_rate) ** years_total - 1) * 100, 2)

    return PerformanceData(
        dates=dates,
        portfolio_values=portfolio_values,
        sp500_values=sp500_values,
        msci_values=msci_values,
        total_return_pct=portfolio_return_pct,
        sp500_return_pct=sp500_return_pct,
        msci_return_pct=msci_return_pct,
        alpha_vs_sp500=round(portfolio_return_pct - sp500_return_pct, 2),
        alpha_vs_msci=round(portfolio_return_pct - msci_return_pct, 2),
    )

# ── Route aliases (React frontend uses these paths) ─────────────────────────────

@app.post("/api/altair/analyse")
@limiter.limit("5/minute")
async def altair_analyse_alias(request: Request, payload: AltairRequest):
    """Alias: frontend uses /analyse (German), backend originally used /analyze."""
    return await altair_analyze(request, payload)

@app.get("/api/portfolio/positions")
async def get_positions(user_id: Optional[str] = Depends(get_current_user)):
    return await get_portfolio(user_id)

@app.post("/api/portfolio/positions")
async def create_position_alias(
    position: PortfolioPositionCreate,
    user_id: Optional[str] = Depends(get_current_user),
):
    return await create_position(position, user_id)

@app.put("/api/portfolio/positions/{position_id}")
async def update_position_alias(
    position_id: str,
    updates: PortfolioPositionUpdate,
    user_id: Optional[str] = Depends(get_current_user),
):
    return await update_pos(position_id, updates, user_id)

@app.delete("/api/portfolio/positions/{position_id}")
async def delete_position_alias(
    position_id: str,
    user_id: Optional[str] = Depends(get_current_user),
):
    return await delete_pos(position_id, user_id)

@app.post("/api/portfolio/refresh")
async def refresh_alias():
    return await refresh_prices()

@app.get(
    "/api/portfolio/positions/{position_id}/transactions",
    response_model=List[PortfolioTransaction],
)
async def get_position_history(
    position_id: str,
    user_id: Optional[str] = Depends(get_current_user),
):
    """Return the purchase history for one portfolio position."""
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        owned = any(
            str(position["id"]) == position_id
            for position in supabase_db.get_all_positions(portfolio_id)
        )
        if not owned:
            raise HTTPException(status_code=404, detail=f"Position {position_id} nicht gefunden")
        return supabase_db.get_position_transactions(position_id)

    sqlite_position_id = _sqlite_id(position_id)
    if database.get_position_by_id(sqlite_position_id) is not None:
        return [_serialize_transaction(item) for item in sqlite_get_position_transactions(sqlite_position_id)]
    raise HTTPException(status_code=404, detail=f"Position {position_id} nicht gefunden")


@app.post(
    "/api/portfolio/positions/{position_id}/transactions",
    response_model=PortfolioTransaction,
)
async def create_position_history(
    position_id: str,
    transaction: PortfolioTransactionCreate,
    user_id: Optional[str] = Depends(get_current_user),
):
    """Append a purchase to one portfolio position's history."""
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        owned = any(
            str(position["id"]) == position_id
            for position in supabase_db.get_all_positions(portfolio_id)
        )
        if not owned:
            raise HTTPException(status_code=404, detail=f"Position {position_id} nicht gefunden")
        return supabase_db.add_position_transaction(
            position_id, transaction.entry_price, transaction.shares, transaction.purchase_date
        )

    sqlite_position_id = _sqlite_id(position_id)
    if database.get_position_by_id(sqlite_position_id) is None:
        raise HTTPException(status_code=404, detail=f"Position {position_id} nicht gefunden")
    return _serialize_transaction(sqlite_add_position_transaction(
        sqlite_position_id, transaction.entry_price, transaction.shares, transaction.purchase_date
    ))


@app.delete("/api/portfolio/positions/{position_id}/transactions/{transaction_id}")
async def delete_position_history(
    position_id: str,
    transaction_id: str,
    user_id: Optional[str] = Depends(get_current_user),
):
    """Delete one purchase from a position's history."""
    portfolio_id = _resolve_portfolio(user_id)
    if portfolio_id:
        owned = any(
            str(position["id"]) == position_id
            for position in supabase_db.get_all_positions(portfolio_id)
        )
        transaction = supabase_db.get_transaction(transaction_id)
        if not owned or not transaction or str(transaction["position_id"]) != position_id:
            raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")
        deleted = supabase_db.delete_position_transaction(transaction_id)
    else:
        sqlite_position_id = _sqlite_id(position_id)
        transaction = sqlite_get_position_transaction(_sqlite_id(transaction_id))
        if not transaction or transaction["position_id"] != sqlite_position_id:
            raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")
        deleted = sqlite_delete_position_transaction(_sqlite_id(transaction_id))

    if not deleted:
        raise HTTPException(status_code=404, detail="Transaktion nicht gefunden")
    return {"success": True, "deleted_id": transaction_id}


# ── Stock data endpoints ─────────────────────────────────────────────────────────


@app.get("/api/stock/{ticker}")
async def get_stock(ticker: str):
    """Return structured stock data for a single ticker via yfinance."""
    data = await yf_service.get_ticker_data(ticker.upper())
    if data.get("error") and not data.get("current_price"):
        raise HTTPException(status_code=404, detail=data["error"])
    return data

@app.get("/api/stock/{ticker}/history")
async def get_stock_history(ticker: str, period: str = "1y"):
    """Return OHLCV history for charting."""
    loop = asyncio.get_event_loop()

    def _fetch():
        import yfinance as yf
        t = yf.Ticker(ticker.upper())
        hist = t.history(period=period)
        if hist.empty:
            return {"error": "Keine historischen Daten gefunden"}
        return {
            "ticker": ticker.upper(),
            "period": period,
            "dates": hist.index.strftime("%Y-%m-%d").tolist(),
            "closes": [round(float(v), 4) for v in hist["Close"].tolist()],
            "volumes": [int(v) for v in hist["Volume"].tolist()],
        }

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as ex:
        result = await loop.run_in_executor(ex, _fetch)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

# ── Ticker search ────────────────────────────────────────────────────────────────

@app.get("/api/search")
async def search_ticker(q: str = ""):
    """Quick ticker lookup — tries bare ticker + common exchange suffixes."""
    if not q or len(q.strip()) < 1:
        return []

    query = q.strip().upper()
    cache_key = f"search:{query}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    suffixes = ["", ".DE", ".F", ".PA", ".L", ".AS", ".SW", ".TO", ".HK", ".T", ".MI"]
    results = []
    loop = asyncio.get_event_loop()

    def _try(candidate):
        import yfinance as yf
        try:
            info = yf.Ticker(candidate).info
            name = info.get("longName") or info.get("shortName")
            price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
            if name and price:
                return {
                    "ticker": candidate,
                    "name": name,
                    "sector": info.get("sector", ""),
                    "exchange": info.get("exchange", ""),
                    "currency": info.get("currency", ""),
                    "price": price,
                }
        except Exception:
            pass
        return None

    from concurrent.futures import ThreadPoolExecutor
    candidates = [query + s for s in suffixes]
    with ThreadPoolExecutor(max_workers=6) as ex:
        hits = await asyncio.gather(*[loop.run_in_executor(ex, _try, c) for c in candidates])

    for h in hits:
        if h and len(results) < 5:
            results.append(h)
    cache_set(cache_key, results, ttl_seconds=3600)  # 1h
    return results

# ── Market data ──────────────────────────────────────────────────────────────────

_BENCHMARK_SYMBOLS = {
    "S&P 500": "^GSPC",
    "MSCI World": "IWDA.L",
    "DAX": "^GDAXI",
}

@app.get("/api/market/benchmarks")
async def get_benchmarks(period: str = "1y"):
    """Return normalized benchmark performance data for portfolio comparison."""
    loop = asyncio.get_event_loop()

    def _fetch():
        import yfinance as yf
        result = {}
        for name, symbol in _BENCHMARK_SYMBOLS.items():
            try:
                hist = yf.Ticker(symbol).history(period=period)
                if hist.empty:
                    continue
                closes = hist["Close"]
                base = float(closes.iloc[0])
                normalized = [round(float(v) / base * 100, 2) for v in closes.tolist()]
                result[name] = {
                    "symbol": symbol,
                    "dates": hist.index.strftime("%Y-%m-%d").tolist(),
                    "values": normalized,
                    "current": round(float(closes.iloc[-1]) / base * 100, 2),
                    "change_pct": round((float(closes.iloc[-1]) / base - 1) * 100, 2),
                }
            except Exception:
                continue
        return result

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as ex:
        data = await loop.run_in_executor(ex, _fetch)
    return data

_MOVER_WATCHLIST = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA",
    "AMD", "INTC", "NFLX", "CRM", "ADBE", "PYPL", "SHOP",
    "JPM", "GS", "BAC", "JNJ", "PFE", "UNH",
    "DAI.DE", "BMW.DE", "SAP.DE", "SIE.DE", "ALV.DE",
]

@app.get("/api/market/movers")
async def get_market_movers():
    """Return biggest intraday movers from watchlist + major index values with sparklines."""
    cached = cache_get("market:movers")
    if cached is not None:
        return cached
    loop = asyncio.get_event_loop()

    def _get_price_change(ticker_obj):
        """Use fast_info for price data — much faster than .info."""
        try:
            fi = ticker_obj.fast_info
            prev = getattr(fi, "previous_close", None) or 0
            curr = getattr(fi, "last_price", None) or getattr(fi, "regular_market_price", None) or prev
            return float(prev), float(curr)
        except Exception:
            return 0.0, 0.0

    def _fetch():
        import yfinance as yf

        # Fetch movers in batch using download for speed
        movers = []
        batch_data = {}
        try:
            tickers_obj = yf.Tickers(" ".join(_MOVER_WATCHLIST))
            for sym in _MOVER_WATCHLIST:
                try:
                    t = tickers_obj.tickers.get(sym)
                    if not t:
                        continue
                    prev, curr = _get_price_change(t)
                    if not curr or not prev or prev == 0:
                        continue
                    change = (curr / prev - 1) * 100
                    # shortName via fast_info if available, else sym
                    name = getattr(t.fast_info, "exchange", None) and sym or sym
                    try:
                        name = t.info.get("shortName") or t.info.get("longName") or sym
                    except Exception:
                        name = sym
                    movers.append({
                        "ticker": sym,
                        "name": name,
                        "price": round(curr, 2),
                        "change": round(change, 2),
                    })
                except Exception:
                    continue
        except Exception:
            # Fallback: individual fetches
            for sym in _MOVER_WATCHLIST[:15]:
                try:
                    t = yf.Ticker(sym)
                    prev, curr = _get_price_change(t)
                    if not curr or not prev or prev == 0:
                        continue
                    change = (curr / prev - 1) * 100
                    movers.append({
                        "ticker": sym,
                        "name": sym,
                        "price": round(curr, 2),
                        "change": round(change, 2),
                    })
                except Exception:
                    continue

        movers.sort(key=lambda x: x["change"], reverse=True)
        gainers = [m for m in movers if m["change"] > 0][:5]
        losers = [m for m in movers if m["change"] < 0][-5:]
        losers.sort(key=lambda x: x["change"])

        # Index snapshot with sparkline (5d hourly)
        indices = []
        for symbol, name, display in [
            ("^GDAXI", "DAX", "DAX"),
            ("^GSPC", "S&P 500", "SPX"),
            ("IWDA.L", "MSCI World", "MSCIW"),
        ]:
            try:
                t = yf.Ticker(symbol)
                prev, curr = _get_price_change(t)
                if not curr or not prev:
                    continue
                change = round((curr / prev - 1) * 100, 2) if prev else 0.0

                # Sparkline: last 5 days hourly closes
                spark = []
                try:
                    hist = t.history(period="5d", interval="1h")
                    if not hist.empty:
                        spark = [round(float(v), 2) for v in hist["Close"].dropna().tolist()]
                except Exception:
                    pass

                indices.append({
                    "symbol": display,
                    "name": name,
                    "price": round(curr, 2),
                    "change": change,
                    "spark": spark,
                })
            except Exception:
                continue

        return {"gainers": gainers, "losers": losers, "indices": indices}

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as ex:
        data = await loop.run_in_executor(ex, _fetch)
    cache_set("market:movers", data, ttl_seconds=300)  # 5 min
    return data

# ── API Key management ────────────────────────────────────────────────────────────

def _load_secrets() -> dict:
    """Load secrets from config.json (reuses existing config file)."""
    cfg = load_config()
    return {
        "claude_key": cfg.get("claude_api_key", ""),
        "alphavantage_key": cfg.get("alphavantage_api_key", ""),
        "ollama_url": cfg.get("ollama_base_url", "http://localhost:11434"),
        "ollama_model": cfg.get("ollama_model", "gemma3:27b"),
        "tavily_key": cfg.get("tavily_api_key", ""),
        "openai_key": cfg.get("openai_api_key", ""),
        "gemini_key": cfg.get("gemini_api_key", ""),
    }

def _save_config_field(key: str, value: str):
    cfg = load_config()
    cfg[key] = value
    save_config(cfg)

@app.get("/api/keys/status")
async def get_key_status():
    """Return which API keys are configured (without exposing the values)."""
    s = _load_secrets()
    tavily_ok = bool(s["tavily_key"] and s["tavily_key"] not in ("", "YOUR_TAVILY_API_KEY_HERE"))
    groq_env_ok = bool(os.environ.get("GROQ_API_KEY", "").strip())
    return {
        "claude": bool(s["claude_key"]),
        "alphavantage": bool(s["alphavantage_key"]),
        "ollama": await ollama_service.is_available() if ollama_service else False,
        "tavily": tavily_ok,
        "ollama_url": s["ollama_url"],
        "ollama_model": s["ollama_model"],
        "groq_env": groq_env_ok,
        "openai": bool(s.get("openai_key", "")),
        "gemini": bool(s.get("gemini_key", "")),
    }

@app.post("/api/keys/test")
async def test_key(data: dict):
    """Test an API key without saving it."""
    provider = data.get("provider", "").lower()
    key = data.get("key", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Kein Key angegeben")

    if provider == "claude":
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-haiku-4-5-20251001",
                        "max_tokens": 10,
                        "messages": [{"role": "user", "content": "ping"}],
                    },
                )
            if resp.status_code == 200:
                return {"valid": True, "provider": "claude"}
            raise HTTPException(status_code=400, detail=f"Claude Key ungültig: HTTP {resp.status_code}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Verbindungsfehler: {str(e)}")
    elif provider == "openai":
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {key}"},
                )
            if resp.status_code == 200:
                return {"valid": True, "provider": "openai"}
            raise HTTPException(status_code=400, detail=f"OpenAI Key ungültig: HTTP {resp.status_code}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Verbindungsfehler: {str(e)}")
    elif provider == "gemini":
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={key}",
                )
            if resp.status_code == 200:
                return {"valid": True, "provider": "gemini"}
            raise HTTPException(status_code=400, detail=f"Gemini Key ungültig: HTTP {resp.status_code}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Verbindungsfehler: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail=f"Unbekannter Provider: {provider}")

@app.post("/api/keys/ollama")
async def save_ollama(data: dict):
    """Save Ollama base URL and model to config.json."""
    global ollama_service
    base_url = data.get("base_url", "http://localhost:11434").strip()
    model = data.get("model", "gemma3:27b").strip()

    cfg = load_config()
    cfg["ollama_base_url"] = base_url
    cfg["ollama_model"] = model
    save_config(cfg)

    # Reinit Ollama service
    await ollama_service.close()
    ollama_service = OllamaService(model=model, num_ctx=cfg.get("ollama_num_ctx", 32768))
    await ollama_service.init()
    app.state.ollama_service = ollama_service
    return {"success": True, "base_url": base_url, "model": model}

@app.post("/api/keys/alphavantage")
async def save_av_key(data: dict):
    """Save Alpha Vantage key (convenience alias)."""
    key = data.get("key", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Kein Key angegeben")
    _save_config_field("alphavantage_api_key", key)
    return {"success": True, "provider": "alphavantage"}

@app.post("/api/keys/{provider}")
async def save_key(provider: str, data: dict):
    """Save an API key to config.json. Must come AFTER specific /api/keys/* routes."""
    key = data.get("key", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Kein Key angegeben")

    mapping = {
        "claude": "claude_api_key",
        "tavily": "tavily_api_key",
        "alphavantage": "alphavantage_api_key",
        "openai": "openai_api_key",
        "gemini": "gemini_api_key",
    }
    config_key = mapping.get(provider.lower())
    if not config_key:
        raise HTTPException(status_code=400, detail=f"Unbekannter Provider: {provider}")

    _save_config_field(config_key, key)

    if provider.lower() == "tavily":
        global search_service
        if search_service:
            await search_service.close()
        search_service = SearchService(api_key=key)
        await search_service.init()
        app.state.search_service = search_service

    return {"success": True, "provider": provider}

# ── Chat endpoint (investment assistant with optional Tavily research) ─────────

_RE_CHAT_RESEARCH = re.compile(r'```research\s*\n(.*?)```', re.DOTALL | re.IGNORECASE)

GROQ_HEADERS = lambda key: {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

CHAT_SYSTEM_BASE = """Du bist der NEXUS Assistent — ein präziser, sachkundiger Gesprächspartner für Finanz- und Investmentthemen.

Dein Charakter:
- Erkläre Finanzkonzepte klar und verständlich
- Beziehe dich auf bewährte Investment-Prinzipien (Value Investing, DCF, Diversifikation)
- Verweise bei komplexen Aktienanalysen auf die NEXUS-Tools (Elara-Screener / Altair-Analyse)
- Sei präzise, aber menschlich

WICHTIG: Du bist kein Finanzberater. Weise bei konkreten Kauf-/Verkaufsempfehlungen stets darauf hin.

Antworte auf Deutsch, außer der Nutzer schreibt eine andere Sprache."""

CHAT_SYSTEM_WITH_RESEARCH = CHAT_SYSTEM_BASE + """

RECHERCHE-FÄHIGKEIT:
Du hast Zugriff auf aktuelle Web-Suche über Tavily. Nutze sie wenn:
- Aktuelle Kurse, Quartalszahlen oder News gefragt werden
- Du zu einem konkreten Unternehmen/ETF aktuelle Daten brauchst
- Der Nutzer "aktuell", "heute", "jetzt" oder ein konkretes Ticker-Symbol nennt
- Du dir bei aktuellen Fakten unsicher bist

Recherche starten mit einem Block am ANFANG deiner Antwort:
```research
<präziser Suchbegriff auf Englisch>
```

Nutze NUR EINE Recherche pro Antwort. Ohne Recherche: direkt antworten."""


async def _groq_complete_sync(client: httpx.AsyncClient, groq_key: str, messages: list) -> str:
    """Non-streaming Groq call — used for the research-decision step."""
    resp = await client.post(
        GROQ_CHAT_URL,
        headers=GROQ_HEADERS(groq_key),
        json={"model": "llama-3.3-70b-versatile", "messages": messages,
              "stream": False, "temperature": 0.5, "max_tokens": 1024},
        timeout=45.0,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


async def _tavily_search(client: httpx.AsyncClient, api_key: str, query: str) -> str:
    """Execute a Tavily search and return formatted results."""
    try:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={"api_key": api_key, "query": query, "search_depth": "basic",
                  "include_answer": True, "max_results": 4},
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()
        parts = []
        if data.get("answer"):
            parts.append(f"Zusammenfassung: {data['answer']}")
        for r in data.get("results", [])[:4]:
            parts.append(f"— {r.get('title', '')}: {r.get('content', '')[:300]}")
        return "\n".join(parts) if parts else "Keine Ergebnisse gefunden."
    except Exception as e:
        return f"Suche fehlgeschlagen: {e}"


@app.post("/api/chat")
@limiter.limit("20/minute")
async def chat_stream(request: Request, data: dict):
    """
    Investment assistant with optional Tavily research + Groq streaming.
    SSE events:
      {"status": "text"}  — progress (research in progress)
      {"status": null}    — clear status
      {"delta": "text"}   — streaming response token
      [DONE]              — stream end
    """
    messages = data.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="Keine Nachrichten angegeben")

    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        raise HTTPException(status_code=503, detail="KI-Service nicht verfügbar (kein Groq API Key)")

    cfg = load_config()
    tavily_key = cfg.get("tavily_api_key", "").strip()
    has_tavily = bool(tavily_key and tavily_key not in ("", "YOUR_TAVILY_API_KEY_HERE"))

    system_prompt = CHAT_SYSTEM_WITH_RESEARCH if has_tavily else CHAT_SYSTEM_BASE
    clean_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]

    async def generate():
        async with httpx.AsyncClient(timeout=90.0) as client:
            conv = [{"role": "system", "content": system_prompt}] + clean_messages

            # ── Step 1: Research phase (only if Tavily available) ──────────────
            if has_tavily:
                try:
                    first_reply = await _groq_complete_sync(client, groq_key, conv)
                    match = _RE_CHAT_RESEARCH.search(first_reply)
                    if match:
                        query = match.group(1).strip()
                        yield f"data: {json.dumps({'status': f'🔍 Suche nach: {query}'})}\n\n"
                        search_result = await _tavily_search(client, tavily_key, query)
                        yield f"data: {json.dumps({'status': None})}\n\n"

                        # Strip the research block, keep any text before it
                        text_before = first_reply[:match.start()].strip()
                        assistant_turn = (text_before + "\n\n" if text_before else "") + \
                            f"[Suche ausgeführt: {query}]"
                        conv = conv + [
                            {"role": "assistant", "content": assistant_turn},
                            {"role": "user", "content":
                                f"RECHERCHE-ERGEBNIS für \"{query}\":\n\n{search_result}\n\n"
                                "Beantworte jetzt die ursprüngliche Frage auf Basis dieser Daten. "
                                "Starte NICHT mit einem neuen ```research Block."},
                        ]
                    # else: no research needed, proceed directly to streaming
                except Exception:
                    pass  # fall through to streaming without research

            # ── Step 2: Stream final answer ────────────────────────────────────
            try:
                async with client.stream(
                    "POST", GROQ_CHAT_URL,
                    headers=GROQ_HEADERS(groq_key),
                    json={"model": "llama-3.3-70b-versatile", "messages": conv,
                          "stream": True, "temperature": 0.65, "max_tokens": 2048},
                ) as response:
                    if response.status_code != 200:
                        yield f"data: {json.dumps({'error': f'Groq Fehler {response.status_code}'})}\n\n"
                        return
                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        raw = line[6:]
                        if raw == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        try:
                            chunk = json.loads(raw)
                            delta = chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield f"data: {json.dumps({'delta': delta})}\n\n"
                        except Exception:
                            pass
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
