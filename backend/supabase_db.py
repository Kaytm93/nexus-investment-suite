"""
NEXUS Investment Suite — Supabase Portfolio Layer
Replaces SQLite for all portfolio (positions) operations.
Altair/Elara cache stays in SQLite (ephemeral on Render, but acceptable).

Required env vars:
    SUPABASE_URL          — https://<project>.supabase.co
    SUPABASE_SERVICE_KEY  — service_role key (bypasses RLS safely server-side)

NOTE: Before using, run this migration in the Supabase SQL Editor:
    ALTER TABLE positions ADD COLUMN IF NOT EXISTS current_price numeric(18,4);
    CREATE TABLE IF NOT EXISTS position_transactions (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        position_id uuid REFERENCES positions(id) ON DELETE CASCADE NOT NULL,
        entry_price numeric(18,4) NOT NULL,
        shares numeric(18,6) NOT NULL,
        purchase_date date NOT NULL,
        created_at timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_position_transactions_position
        ON position_transactions(position_id, purchase_date DESC, created_at DESC);
"""

import os
from typing import Optional, List, Dict, Any

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

_client = None


def is_configured() -> bool:
    """Return True when both required env vars are set."""
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY)


def get_client():
    """Lazy-initialize and return the Supabase service-role client."""
    global _client
    if _client is None:
        if not is_configured():
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set to use Supabase."
            )
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


# ─────────────────────────────────────────────────────────────────────────────
# Auth helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_user_from_token(access_token: str) -> Optional[str]:
    """
    Validate a Supabase JWT and return the user_id (UUID string).
    Returns None if the token is invalid or expired.
    """
    try:
        client = get_client()
        result = client.auth.get_user(access_token)
        return result.user.id if result.user else None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_or_create_portfolio(user_id: str) -> str:
    """
    Return the UUID of the user's default portfolio.
    Creates one automatically on first call.
    """
    client = get_client()
    res = (
        client.table("portfolios")
        .select("id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]["id"]
    # Create default portfolio
    new = client.table("portfolios").insert(
        {"user_id": user_id, "name": "Mein Portfolio"}
    ).execute()
    return new.data[0]["id"]


# ─────────────────────────────────────────────────────────────────────────────
# Position CRUD
# ─────────────────────────────────────────────────────────────────────────────

def _map_position(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Map Supabase column names → internal model names used throughout main.py.

    Supabase schema  →  internal name
    ───────────────────────────────────
    buy_price        →  entry_price
    buy_date         →  purchase_date
    current_price    →  current_price  (nullable column added via migration)
    """
    return {
        "id": row["id"],                                          # UUID string
        "ticker": row.get("ticker", ""),
        "name": row.get("name") or row.get("ticker", ""),
        "entry_price": float(row.get("buy_price", 0) or 0),
        "current_price": (
            float(row["current_price"])
            if row.get("current_price") is not None
            else None
        ),
        "shares": float(row.get("shares", 0) or 0),
        "purchase_date": str(row["buy_date"]) if row.get("buy_date") else "",
        "sector": row.get("sector"),
        "region": row.get("region"),
    }


def get_all_positions(portfolio_id: str) -> List[Dict[str, Any]]:
    """Return all positions for a portfolio, ordered by creation date."""
    client = get_client()
    res = (
        client.table("positions")
        .select("*")
        .eq("portfolio_id", portfolio_id)
        .order("created_at")
        .execute()
    )
    return [_map_position(r) for r in (res.data or [])]


def get_position_by_id(position_id: str) -> Optional[Dict[str, Any]]:
    """Return a single position or None."""
    client = get_client()
    res = (
        client.table("positions")
        .select("*")
        .eq("id", position_id)
        .maybe_single()
        .execute()
    )
    return _map_position(res.data) if res.data else None


def add_position(
    portfolio_id: str,
    ticker: str,
    name: str,
    entry_price: float,
    shares: float,
    purchase_date: str,
    sector: Optional[str] = None,
    region: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a new position and return the created record."""
    client = get_client()
    res = client.table("positions").insert({
        "portfolio_id": portfolio_id,
        "ticker": ticker.upper(),
        "name": name,
        "buy_price": entry_price,
        "buy_date": purchase_date,
        "shares": shares,
        "sector": sector,
        "region": region,
    }).execute()
    raw = res.data[0]
    add_position_transaction(
        position_id=raw["id"],
        entry_price=entry_price,
        shares=shares,
        purchase_date=purchase_date,
    )
    return _map_position(raw)


def _map_transaction(row: Dict[str, Any]) -> Dict[str, Any]:
    """Map a Supabase transaction row to the API representation."""
    return {
        "id": row["id"],
        "position_id": row["position_id"],
        "entry_price": float(row.get("entry_price", 0) or 0),
        "shares": float(row.get("shares", 0) or 0),
        "purchase_date": str(row["purchase_date"]),
        "created_at": row.get("created_at"),
    }


def get_position_transactions(position_id: str) -> List[Dict[str, Any]]:
    """Return purchase transactions for a position, newest purchase first."""
    client = get_client()
    res = (
        client.table("position_transactions")
        .select("*")
        .eq("position_id", position_id)
        .order("purchase_date", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return [_map_transaction(row) for row in (res.data or [])]


def add_position_transaction(
    position_id: str,
    entry_price: float,
    shares: float,
    purchase_date: str,
) -> Dict[str, Any]:
    """Add a purchase transaction to an existing position."""
    client = get_client()
    res = client.table("position_transactions").insert({
        "position_id": position_id,
        "entry_price": entry_price,
        "shares": shares,
        "purchase_date": purchase_date,
    }).execute()
    return _map_transaction(res.data[0])


def get_transaction(transaction_id: str) -> Optional[Dict[str, Any]]:
    """Return one transaction or None."""
    client = get_client()
    res = (
        client.table("position_transactions")
        .select("*")
        .eq("id", transaction_id)
        .maybe_single()
        .execute()
    )
    return _map_transaction(res.data) if res.data else None


def delete_position_transaction(transaction_id: str) -> bool:
    """Delete a purchase transaction by ID."""
    client = get_client()
    res = client.table("position_transactions").delete().eq("id", transaction_id).execute()
    return bool(res.data)
def update_position(
    position_id: str, updates: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Update specified fields and return the updated position."""
    client = get_client()
    _FIELD_MAP = {
        "entry_price": "buy_price",
        "purchase_date": "buy_date",
    }
    _ALLOWED = {"ticker", "name", "buy_price", "buy_date", "shares", "sector", "region"}

    su: Dict[str, Any] = {}
    for k, v in updates.items():
        if v is None:
            continue
        mapped = _FIELD_MAP.get(k, k)
        if mapped in _ALLOWED:
            su[mapped] = v

    if not su:
        return get_position_by_id(position_id)

    res = client.table("positions").update(su).eq("id", position_id).execute()
    return _map_position(res.data[0]) if res.data else None


def update_position_price(position_id: str, current_price: float) -> bool:
    """
    Persist the latest market price.
    Requires the `current_price` column (see migration note at top of file).
    Returns True on success; gracefully returns False if column is missing.
    """
    try:
        client = get_client()
        res = (
            client.table("positions")
            .update({"current_price": current_price})
            .eq("id", position_id)
            .execute()
        )
        return bool(res.data)
    except Exception:
        return False


def delete_position(position_id: str) -> bool:
    """Delete a position. Returns True if a row was deleted."""
    client = get_client()
    res = client.table("positions").delete().eq("id", position_id).execute()
    return bool(res.data)
