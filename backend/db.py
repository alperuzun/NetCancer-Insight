"""
SQLite persistence layer. All mutable state that survives restarts lives here.
Tables: config, graphs, annotation_cache, gene_summary_cache, kegg_cache,
        expression_data, not_indexed_genes.
"""
import json
import os
import sqlite3
import threading
from datetime import datetime, timedelta
from typing import Optional

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv(
    "DB_PATH",
    os.path.join(_BACKEND_DIR, "..", "data", "db.sqlite"),
)

KEGG_TTL_DAYS = 7

_local = threading.local()


def _get_conn() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        db_dir = os.path.dirname(os.path.abspath(DB_PATH))
        os.makedirs(db_dir, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        _local.conn = conn
    return _local.conn


def _migrate(conn: sqlite3.Connection) -> None:
    """
    Apply pending schema migrations.

    Migration 1 — annotation_cache: add graph_index column and update PK.
    Old PK was (gene, view); new PK is (gene, view, graph_index).
    Existing rows are migrated with graph_index = -1 (topology-unaware).
    """
    table_exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='annotation_cache'"
    ).fetchone() is not None

    if not table_exists:
        return  # Fresh install — init() will create with correct schema.

    cols = {row["name"] for row in conn.execute("PRAGMA table_info(annotation_cache)").fetchall()}
    if "graph_index" in cols:
        return  # Already migrated.

    conn.executescript("""
        ALTER TABLE annotation_cache RENAME TO annotation_cache_v1;
        CREATE TABLE annotation_cache (
            gene        TEXT    NOT NULL,
            view        TEXT    NOT NULL,
            graph_index INTEGER NOT NULL DEFAULT -1,
            data        TEXT    NOT NULL,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (gene, view, graph_index)
        );
        INSERT INTO annotation_cache (gene, view, graph_index, data, updated_at)
            SELECT gene, view, -1, data, updated_at FROM annotation_cache_v1;
        DROP TABLE annotation_cache_v1;
    """)
    conn.commit()


def init() -> None:
    """Create all tables. Call once at application startup."""
    conn = _get_conn()
    _migrate(conn)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS config (
            id       INTEGER PRIMARY KEY CHECK (id = 1),
            provider TEXT    DEFAULT 'openai',
            api_key  TEXT    DEFAULT '',
            model    TEXT    DEFAULT 'gpt-4o-mini',
            base_url TEXT    DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS graphs (
            graph_index INTEGER NOT NULL,
            graph_type  TEXT    NOT NULL CHECK (graph_type IN ('original', 'current')),
            data        TEXT    NOT NULL,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (graph_index, graph_type)
        );
        CREATE TABLE IF NOT EXISTS annotation_cache (
            gene        TEXT    NOT NULL,
            view        TEXT    NOT NULL,
            graph_index INTEGER NOT NULL DEFAULT -1,
            data        TEXT    NOT NULL,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (gene, view, graph_index)
        );
        CREATE TABLE IF NOT EXISTS gene_summary_cache (
            gene       TEXT PRIMARY KEY,
            summary    TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS kegg_cache (
            gene       TEXT PRIMARY KEY,
            data       TEXT NOT NULL,
            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS expression_data (
            graph_index INTEGER PRIMARY KEY,
            data        TEXT NOT NULL,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS not_indexed_genes (
            gene     TEXT PRIMARY KEY,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()


# ── Config ────────────────────────────────────────────────────────────────────

def get_config() -> Optional[dict]:
    row = _get_conn().execute("SELECT * FROM config WHERE id = 1").fetchone()
    return dict(row) if row else None


def set_config(provider: str, api_key: str, model: str, base_url: str = "") -> None:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO config (id, provider, api_key, model, base_url, updated_at)
        VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            provider   = excluded.provider,
            api_key    = excluded.api_key,
            model      = excluded.model,
            base_url   = excluded.base_url,
            updated_at = CURRENT_TIMESTAMP
        """,
        (provider, api_key, model, base_url),
    )
    conn.commit()


# ── Graphs ────────────────────────────────────────────────────────────────────

def save_graph(graph_index: int, graph_type: str, data: dict) -> None:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO graphs (graph_index, graph_type, data, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(graph_index, graph_type) DO UPDATE SET
            data       = excluded.data,
            updated_at = CURRENT_TIMESTAMP
        """,
        (graph_index, graph_type, json.dumps(data)),
    )
    conn.commit()


def load_graph(graph_index: int, graph_type: str) -> Optional[dict]:
    row = _get_conn().execute(
        "SELECT data FROM graphs WHERE graph_index = ? AND graph_type = ?",
        (graph_index, graph_type),
    ).fetchone()
    return json.loads(row["data"]) if row else None


def load_all_graphs() -> dict:
    """Return {(graph_index, graph_type): data_dict} for all stored graphs."""
    rows = _get_conn().execute(
        "SELECT graph_index, graph_type, data FROM graphs"
    ).fetchall()
    return {
        (int(row["graph_index"]), row["graph_type"]): json.loads(row["data"])
        for row in rows
    }


# ── Annotation cache ──────────────────────────────────────────────────────────

def get_annotation(gene: str, view: str, graph_index: int = -1) -> Optional[dict]:
    row = _get_conn().execute(
        "SELECT data FROM annotation_cache WHERE gene = ? AND view = ? AND graph_index = ?",
        (gene.upper(), view.lower(), graph_index),
    ).fetchone()
    return json.loads(row["data"]) if row else None


def get_all_annotations_for_gene(gene: str, graph_index: int = -1) -> dict:
    rows = _get_conn().execute(
        "SELECT view, data FROM annotation_cache WHERE gene = ? AND graph_index = ?",
        (gene.upper(), graph_index),
    ).fetchall()
    return {row["view"]: json.loads(row["data"]) for row in rows}


def save_annotation(gene: str, view: str, data: dict, graph_index: int = -1) -> None:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO annotation_cache (gene, view, graph_index, data, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(gene, view, graph_index) DO UPDATE SET
            data       = excluded.data,
            updated_at = CURRENT_TIMESTAMP
        """,
        (gene.upper(), view.lower(), graph_index, json.dumps(data)),
    )
    conn.commit()


# ── Gene summary cache ────────────────────────────────────────────────────────

def get_gene_summary(gene: str) -> Optional[str]:
    row = _get_conn().execute(
        "SELECT summary FROM gene_summary_cache WHERE gene = ?",
        (gene.upper(),),
    ).fetchone()
    return row["summary"] if row else None


def save_gene_summary(gene: str, summary: str) -> None:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO gene_summary_cache (gene, summary, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(gene) DO UPDATE SET
            summary    = excluded.summary,
            updated_at = CURRENT_TIMESTAMP
        """,
        (gene.upper(), summary),
    )
    conn.commit()


# ── KEGG cache (7-day TTL) ────────────────────────────────────────────────────

def get_kegg_cache(gene: str) -> Optional[list]:
    row = _get_conn().execute(
        "SELECT data, fetched_at FROM kegg_cache WHERE gene = ?",
        (gene.upper(),),
    ).fetchone()
    if not row:
        return None
    fetched_at = datetime.fromisoformat(row["fetched_at"])
    if datetime.utcnow() - fetched_at > timedelta(days=KEGG_TTL_DAYS):
        return None
    return json.loads(row["data"])


def save_kegg_cache(gene: str, data: list) -> None:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO kegg_cache (gene, data, fetched_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(gene) DO UPDATE SET
            data       = excluded.data,
            fetched_at = CURRENT_TIMESTAMP
        """,
        (gene.upper(), json.dumps(data)),
    )
    conn.commit()


# ── Expression data ───────────────────────────────────────────────────────────

def save_expression_data(graph_index: int, data: dict) -> None:
    conn = _get_conn()
    conn.execute(
        """
        INSERT INTO expression_data (graph_index, data, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(graph_index) DO UPDATE SET
            data       = excluded.data,
            updated_at = CURRENT_TIMESTAMP
        """,
        (graph_index, json.dumps(data)),
    )
    conn.commit()


def get_expression_data(graph_index: int) -> Optional[dict]:
    row = _get_conn().execute(
        "SELECT data FROM expression_data WHERE graph_index = ?",
        (graph_index,),
    ).fetchone()
    return json.loads(row["data"]) if row else None


# ── Not-indexed genes ─────────────────────────────────────────────────────────

def add_not_indexed_gene(gene: str) -> None:
    conn = _get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO not_indexed_genes (gene) VALUES (?)",
        (gene.upper(),),
    )
    conn.commit()
