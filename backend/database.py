"""
NEXUS Investment Suite — Database Layer
SQLite operations for portfolio positions, Altair reports, and Elara results.
All paths resolved relative to the project root (parent of backend/).
"""

import sqlite3
import json
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

# ─────────────────────────────────────────────────────────────────────────────
# Path resolution
# ─────────────────────────────────────────────────────────────────────────────

# backend/database.py → parent = backend/ → parent.parent = project root
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "nexus.db"


def _get_connection() -> sqlite3.Connection:
    """Create a database connection with row factory for dict-like access."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # Better concurrent read performance
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ─────────────────────────────────────────────────────────────────────────────
# Schema initialization
# ─────────────────────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables if they do not yet exist."""
    conn = _get_connection()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS positions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker       TEXT    NOT NULL,
                name         TEXT    NOT NULL,
                entry_price  REAL    NOT NULL,
                current_price REAL,
                shares       REAL    NOT NULL,
                purchase_date TEXT   NOT NULL,
                sector       TEXT,
                region       TEXT,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS altair_reports (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker       TEXT    NOT NULL,
                report_json  TEXT    NOT NULL,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_altair_ticker
                ON altair_reports (ticker, created_at DESC);

            CREATE TABLE IF NOT EXISTS elara_results (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                sector_query TEXT    NOT NULL,
                results_json TEXT    NOT NULL,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_elara_sector
                ON elara_results (sector_query, created_at DESC);

            CREATE TABLE IF NOT EXISTS position_transactions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                position_id   INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
                entry_price  REAL    NOT NULL,
                shares       REAL    NOT NULL,
                purchase_date TEXT   NOT NULL,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_position_transactions_position
                ON position_transactions (position_id, purchase_date DESC, id DESC);

            INSERT INTO position_transactions (position_id, entry_price, shares, purchase_date)
            SELECT p.id, p.entry_price, p.shares, p.purchase_date
            FROM positions p
            WHERE NOT EXISTS (
                SELECT 1 FROM position_transactions t WHERE t.position_id = p.id
            );
        """)
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio positions
# ─────────────────────────────────────────────────────────────────────────────

def get_all_positions() -> List[Dict[str, Any]]:
    """Return all portfolio positions as a list of dicts."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM positions ORDER BY created_at ASC"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_position_by_id(position_id: int) -> Optional[Dict[str, Any]]:
    """Return a single position by ID, or None if not found."""
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM positions WHERE id = ?", (position_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def add_position(
    ticker: str,
    name: str,
    entry_price: float,
    shares: float,
    purchase_date: str,
    sector: Optional[str] = None,
    region: Optional[str] = None,
) -> Dict[str, Any]:
    """Insert a new portfolio position and return the created record."""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO positions (ticker, name, entry_price, shares, purchase_date, sector, region)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (ticker.upper(), name, entry_price, shares, purchase_date, sector, region),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM positions WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        result = dict(row)
        conn.execute(
            """
            INSERT INTO position_transactions
                (position_id, entry_price, shares, purchase_date)
            VALUES (?, ?, ?, ?)
            """,
            (cursor.lastrowid, entry_price, shares, purchase_date),
        )
        conn.commit()
        return result
    finally:
        conn.close()


def update_position(position_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Update specified fields of a position.
    Only fields present in `updates` are modified.
    Returns the updated record, or None if not found.
    """
    allowed_fields = {
        "ticker", "name", "entry_price", "current_price",
        "shares", "purchase_date", "sector", "region"
    }
    filtered = {k: v for k, v in updates.items() if k in allowed_fields and v is not None}
    if not filtered:
        return get_position_by_id(position_id)

    set_clauses = ", ".join(f"{field} = ?" for field in filtered)
    values = list(filtered.values()) + [position_id]

    conn = _get_connection()
    try:
        conn.execute(
            f"UPDATE positions SET {set_clauses} WHERE id = ?",
            values,
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM positions WHERE id = ?", (position_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_position(position_id: int) -> bool:
    """Delete a position. Returns True if a row was deleted."""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM positions WHERE id = ?", (position_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def update_position_price(position_id: int, current_price: float) -> bool:
    """Convenience function to update only the current_price of a position."""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "UPDATE positions SET current_price = ? WHERE id = ?",
            (current_price, position_id),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_position_transactions(position_id: int) -> List[Dict[str, Any]]:
    """Return purchase transactions for a position, newest purchase first."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, position_id, entry_price, shares, purchase_date, created_at
            FROM position_transactions
            WHERE position_id = ?
            ORDER BY purchase_date DESC, id DESC
            """,
            (position_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def add_position_transaction(
    position_id: int,
    entry_price: float,
    shares: float,
    purchase_date: str,
) -> Dict[str, Any]:
    """Add a purchase transaction to an existing position."""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO position_transactions
                (position_id, entry_price, shares, purchase_date)
            VALUES (?, ?, ?, ?)
            """,
            (position_id, entry_price, shares, purchase_date),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT id, position_id, entry_price, shares, purchase_date, created_at
            FROM position_transactions WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()
        return dict(row)
    finally:
        conn.close()


def get_position_transaction(transaction_id: int) -> Optional[Dict[str, Any]]:
    """Return one purchase transaction or None."""
    conn = _get_connection()
    try:
        row = conn.execute(
            """
            SELECT id, position_id, entry_price, shares, purchase_date, created_at
            FROM position_transactions WHERE id = ?
            """,
            (transaction_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def delete_position_transaction(transaction_id: int) -> bool:
    """Delete a purchase transaction by ID."""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM position_transactions WHERE id = ?", (transaction_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Altair reports
# ─────────────────────────────────────────────────────────────────────────────

def save_altair_report(ticker: str, report_data: Dict[str, Any]) -> int:
    """
    Save an Altair analysis report.
    Returns the new record ID.
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "INSERT INTO altair_reports (ticker, report_json) VALUES (?, ?)",
            (ticker.upper(), json.dumps(report_data)),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_altair_report(ticker: str) -> Optional[Dict[str, Any]]:
    """
    Return the most recent Altair report for a ticker, or None.
    Reports older than 7 days are considered stale and not returned.
    """
    conn = _get_connection()
    try:
        row = conn.execute(
            """
            SELECT * FROM altair_reports
            WHERE ticker = ?
              AND created_at > datetime('now', '-7 days')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (ticker.upper(),),
        ).fetchone()
        if row:
            data = dict(row)
            data["report_json"] = json.loads(data["report_json"])
            return data
        return None
    finally:
        conn.close()


def get_all_altair_reports() -> List[Dict[str, Any]]:
    """Return all stored Altair reports (latest per ticker)."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            """
            SELECT r1.*
            FROM altair_reports r1
            INNER JOIN (
                SELECT ticker, MAX(created_at) as max_date
                FROM altair_reports
                GROUP BY ticker
            ) r2 ON r1.ticker = r2.ticker AND r1.created_at = r2.max_date
            ORDER BY r1.created_at DESC
            """
        ).fetchall()
        result = []
        for row in rows:
            data = dict(row)
            try:
                data["report_json"] = json.loads(data["report_json"])
            except (json.JSONDecodeError, TypeError):
                pass
            result.append(data)
        return result
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Elara results
# ─────────────────────────────────────────────────────────────────────────────

def save_elara_results(sector_query: str, results_data: Dict[str, Any]) -> int:
    """
    Save Elara screening results.
    Returns the new record ID.
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "INSERT INTO elara_results (sector_query, results_json) VALUES (?, ?)",
            (sector_query.lower().strip(), json.dumps(results_data)),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_elara_results(sector_query: str) -> Optional[Dict[str, Any]]:
    """
    Return the most recent Elara results for a sector query, or None.
    Results older than 24 hours are considered stale.
    """
    conn = _get_connection()
    try:
        row = conn.execute(
            """
            SELECT * FROM elara_results
            WHERE sector_query = ?
              AND created_at > datetime('now', '-1 day')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (sector_query.lower().strip(),),
        ).fetchone()
        if row:
            data = dict(row)
            data["results_json"] = json.loads(data["results_json"])
            return data
        return None
    finally:
        conn.close()


def get_recent_elara_results(limit: int = 10) -> List[Dict[str, Any]]:
    """Return the N most recent Elara results."""
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM elara_results ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        result = []
        for row in rows:
            data = dict(row)
            try:
                data["results_json"] = json.loads(data["results_json"])
            except (json.JSONDecodeError, TypeError):
                pass
            result.append(data)
        return result
    finally:
        conn.close()
