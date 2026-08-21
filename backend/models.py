"""
NEXUS Investment Suite — Pydantic Models
Data contracts for all API requests and responses.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date

# Shared validation patterns
TICKER_PATTERN = r"^[A-Za-z0-9.\-\^=]{1,20}$"
# Forbid control characters to prevent LLM prompt injection via newlines/tabs
SAFE_TEXT_PATTERN = r"^[^\x00-\x1f]+$"
ISO_DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


# ─────────────────────────────────────────────────────────────────────────────
# Elara Screener
# ─────────────────────────────────────────────────────────────────────────────

class ElaraFilters(BaseModel):
    """Optional filters for Elara sector screening."""
    min_market_cap: Optional[float] = Field(
        default=None,
        description="Minimum market cap in billion USD (e.g. 1.0 = $1B)"
    )
    region: Optional[str] = Field(
        default=None,
        max_length=100,
        pattern=SAFE_TEXT_PATTERN,
        description="Geographic filter, e.g. 'USA', 'Europe', 'Global'"
    )
    exclusions: Optional[str] = Field(
        default=None,
        max_length=500,
        pattern=SAFE_TEXT_PATTERN,
        description="Comma-separated tickers or names to exclude"
    )
    horizon: Optional[str] = Field(
        default=None,
        max_length=100,
        pattern=SAFE_TEXT_PATTERN,
        description="Investment horizon, e.g. '1-3 Jahre', '3-5 Jahre', 'langfristig'"
    )


class ElaraRequest(BaseModel):
    """Request body for /api/elara/screen."""
    sector: str = Field(
        ...,
        min_length=2,
        max_length=200,
        pattern=SAFE_TEXT_PATTERN,
        description="Sector or theme to screen, e.g. 'Cloud Computing', 'Pharmaceuticals'"
    )
    filters: Optional[ElaraFilters] = Field(
        default=None,
        description="Optional screening filters"
    )
    session_id: Optional[str] = Field(
        default=None,
        description="WebSocket session ID for progress streaming (optional)"
    )


class ElaraResponse(BaseModel):
    """Response body for /api/elara/screen."""
    success: bool
    sector: str
    raw_content: str = Field(default="", description="Raw markdown response from Perplexity")
    sources: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    cached: bool = Field(default=False, description="True if result served from cache")


# ─────────────────────────────────────────────────────────────────────────────
# Altair Deep Dive
# ─────────────────────────────────────────────────────────────────────────────

class AltairRequest(BaseModel):
    """Request body for /api/altair/analyze."""
    ticker: str = Field(
        ...,
        min_length=1,
        max_length=20,
        pattern=TICKER_PATTERN,
        description="Stock ticker or ETF ISIN, e.g. 'AAPL', 'MSFT', 'IE00B4L5Y983'"
    )
    session_id: Optional[str] = Field(
        default=None,
        description="WebSocket session ID for progress streaming (optional)"
    )
    force_refresh: bool = Field(
        default=False,
        description="If true, bypass cache and run a fresh analysis"
    )


class AltairResponse(BaseModel):
    """Response body for /api/altair/analyze."""
    success: bool
    ticker: str
    raw_content: str = Field(default="", description="Raw markdown response from Perplexity")
    sources: List[str] = Field(default_factory=list)
    error: Optional[str] = None
    cached: bool = Field(default=False, description="True if result served from cache")
    cached_at: Optional[str] = Field(default=None, description="ISO timestamp of the cached report")


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio
# ─────────────────────────────────────────────────────────────────────────────

class PortfolioPositionCreate(BaseModel):
    """Request body for adding a new portfolio position."""
    ticker: str = Field(..., min_length=1, max_length=20, pattern=TICKER_PATTERN, description="Stock ticker symbol")
    name: str = Field(..., min_length=1, max_length=200, pattern=SAFE_TEXT_PATTERN, description="Company or ETF name")
    entry_price: float = Field(..., gt=0, description="Purchase price per share in USD/EUR")
    shares: float = Field(..., gt=0, description="Number of shares purchased")
    purchase_date: str = Field(
        ...,
        pattern=ISO_DATE_PATTERN,
        description="Date of purchase in YYYY-MM-DD format"
    )
    sector: Optional[str] = Field(
        default=None,
        max_length=100,
        pattern=SAFE_TEXT_PATTERN,
        description="Sector classification, e.g. 'Technology', 'Healthcare'"
    )
    region: Optional[str] = Field(
        default=None,
        max_length=100,
        pattern=SAFE_TEXT_PATTERN,
        description="Geographic region, e.g. 'USA', 'Europe', 'Emerging Markets'"
    )


class PortfolioPosition(BaseModel):
    """A full portfolio position including calculated fields."""
    id: str  # UUID string from Supabase (or str-cast int from SQLite fallback)
    ticker: str
    name: str
    entry_price: float
    current_price: Optional[float] = None
    shares: float
    purchase_date: str
    sector: Optional[str] = None
    region: Optional[str] = None
    # Calculated fields (computed on the fly, not stored)
    pnl: Optional[float] = Field(
        default=None,
        description="Absolute P&L: (current_price - entry_price) * shares"
    )
    pnl_pct: Optional[float] = Field(
        default=None,
        description="Percentage P&L: (current_price / entry_price - 1) * 100"
    )
    weight: Optional[float] = Field(
        default=None,
        description="Position weight in portfolio as percentage (0-100)"
    )
    cost_basis: Optional[float] = Field(
        default=None,
        description="Total cost: entry_price * shares"
    )
    current_value: Optional[float] = Field(
        default=None,
        description="Current value: current_price * shares"
    )
    price_stale: bool = Field(
        default=False,
        description="True if current_price could not be refreshed and P&L falls back to entry_price."
    )


class PortfolioPositionUpdate(BaseModel):
    """Request body for updating an existing position (all fields optional)."""
    ticker: Optional[str] = Field(default=None, max_length=20, pattern=TICKER_PATTERN)
    name: Optional[str] = Field(default=None, max_length=200, pattern=SAFE_TEXT_PATTERN)
    entry_price: Optional[float] = Field(default=None, gt=0)
    current_price: Optional[float] = Field(default=None, gt=0)
    shares: Optional[float] = Field(default=None, gt=0)
    purchase_date: Optional[str] = Field(default=None, pattern=ISO_DATE_PATTERN)
    sector: Optional[str] = Field(default=None, max_length=100, pattern=SAFE_TEXT_PATTERN)
    region: Optional[str] = Field(default=None, max_length=100, pattern=SAFE_TEXT_PATTERN)


# ─────────────────────────────────────────────────────────────────────────────
# Performance / Benchmarks
# ─────────────────────────────────────────────────────────────────────────────

class PerformanceData(BaseModel):
    """Time-series performance data for chart rendering."""
    dates: List[str] = Field(
        ...,
        description="ISO date strings for the x-axis"
    )
    portfolio_values: List[float] = Field(
        ...,
        description="Portfolio indexed values (start = 100)"
    )
    sp500_values: List[float] = Field(
        ...,
        description="S&P 500 indexed values (start = 100)"
    )
    msci_values: List[float] = Field(
        ...,
        description="MSCI World indexed values (start = 100)"
    )
    total_return_pct: Optional[float] = Field(
        default=None,
        description="Portfolio total return in percent"
    )
    sp500_return_pct: Optional[float] = Field(
        default=None,
        description="S&P 500 total return in percent (same period)"
    )
    msci_return_pct: Optional[float] = Field(
        default=None,
        description="MSCI World total return in percent (same period)"
    )
    alpha_vs_sp500: Optional[float] = Field(
        default=None,
        description="Portfolio alpha vs S&P 500 in percentage points"
    )
    alpha_vs_msci: Optional[float] = Field(
        default=None,
        description="Portfolio alpha vs MSCI World in percentage points"
    )


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket / Progress
# ─────────────────────────────────────────────────────────────────────────────

class ProgressMessage(BaseModel):
    """Progress update sent via WebSocket."""
    type: str = Field(..., description="One of: 'progress', 'complete', 'error'")
    session_id: str
    status: Optional[str] = Field(default=None, description="'running', 'done', 'failed'")
    message: Optional[str] = None
    elapsed: Optional[int] = Field(default=None, description="Elapsed seconds")


# ─────────────────────────────────────────────────────────────────────────────
# Price Refresh
# ─────────────────────────────────────────────────────────────────────────────

class PriceRefreshResult(BaseModel):
    """Result of refreshing prices for all portfolio positions."""
    updated: int = Field(default=0, description="Number of positions successfully updated")
    failed: int = Field(default=0, description="Number of positions where price lookup failed")
    errors: List[str] = Field(default_factory=list, description="Error messages for failed lookups")
    positions: List[PortfolioPosition] = Field(
        default_factory=list,
        description="Updated list of all positions"
    )
