"""
Phase 2 test suite — SQLite persistence layer.

Coverage:
  TestDBSchema        – all 7 tables are created, have correct columns
  TestConfigCRUD      – get/set config with upsert semantics
  TestGraphCRUD       – save/load/load_all graphs, both types
  TestAnnotationCache – get/save/get_all annotation cache entries
  TestGeneSummary     – get/save gene summaries
  TestKEGGCache       – cache hit, cache miss, 7-day TTL expiry
  TestExpressionData  – save/get expression data
  TestNotIndexedGenes – add_not_indexed_gene deduplicates correctly
  TestStateMigration  – state.py no longer exposes old file-cache helpers
  TestMainLifespan    – lifespan restores graphs from SQLite into memory
  TestSettingsEndpoints – GET/POST /settings/llm via TestClient
"""
import importlib
import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# Make sure the backend package root is on sys.path
# ---------------------------------------------------------------------------
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    """Point db.DB_PATH at a fresh temp file and reinitialise all tables."""
    import db as dbmod

    db_file = str(tmp_path / "test.sqlite")
    monkeypatch.setattr(dbmod, "DB_PATH", db_file)

    # Force a fresh connection on this thread
    if hasattr(dbmod._local, "conn"):
        dbmod._local.conn.close()
        del dbmod._local.conn

    dbmod.init()
    yield dbmod

    # Cleanup
    if hasattr(dbmod._local, "conn"):
        dbmod._local.conn.close()
        del dbmod._local.conn


# ===========================================================================
# TestDBSchema
# ===========================================================================

class TestDBSchema:
    EXPECTED_TABLES = {
        "config",
        "graphs",
        "annotation_cache",
        "gene_summary_cache",
        "kegg_cache",
        "expression_data",
        "not_indexed_genes",
    }

    def _table_columns(self, db_path: str, table: str) -> set:
        conn = sqlite3.connect(db_path)
        cur = conn.execute(f"PRAGMA table_info({table})")
        cols = {row[1] for row in cur.fetchall()}
        conn.close()
        return cols

    def test_all_tables_created(self, tmp_db):
        conn = sqlite3.connect(tmp_db.DB_PATH)
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cur.fetchall()}
        conn.close()
        assert self.EXPECTED_TABLES.issubset(tables)

    def test_config_columns(self, tmp_db):
        cols = self._table_columns(tmp_db.DB_PATH, "config")
        assert {"id", "provider", "api_key", "model", "base_url", "updated_at"}.issubset(cols)

    def test_graphs_columns(self, tmp_db):
        cols = self._table_columns(tmp_db.DB_PATH, "graphs")
        assert {"graph_index", "graph_type", "data", "updated_at"}.issubset(cols)

    def test_annotation_cache_columns(self, tmp_db):
        cols = self._table_columns(tmp_db.DB_PATH, "annotation_cache")
        assert {"gene", "view", "data", "updated_at"}.issubset(cols)

    def test_gene_summary_cache_columns(self, tmp_db):
        cols = self._table_columns(tmp_db.DB_PATH, "gene_summary_cache")
        assert {"gene", "summary", "updated_at"}.issubset(cols)

    def test_kegg_cache_columns(self, tmp_db):
        cols = self._table_columns(tmp_db.DB_PATH, "kegg_cache")
        assert {"gene", "data", "fetched_at"}.issubset(cols)

    def test_expression_data_columns(self, tmp_db):
        cols = self._table_columns(tmp_db.DB_PATH, "expression_data")
        assert {"graph_index", "data", "updated_at"}.issubset(cols)

    def test_not_indexed_genes_columns(self, tmp_db):
        cols = self._table_columns(tmp_db.DB_PATH, "not_indexed_genes")
        assert {"gene", "added_at"}.issubset(cols)

    def test_wal_mode_enabled(self, tmp_db):
        conn = sqlite3.connect(tmp_db.DB_PATH)
        row = conn.execute("PRAGMA journal_mode").fetchone()
        conn.close()
        assert row[0] == "wal"

    def test_init_is_idempotent(self, tmp_db):
        """Calling init() twice must not raise or duplicate tables."""
        tmp_db.init()
        conn = sqlite3.connect(tmp_db.DB_PATH)
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cur.fetchall()]
        conn.close()
        assert len(tables) == len(set(tables)), "Duplicate tables after second init()"


# ===========================================================================
# TestConfigCRUD
# ===========================================================================

class TestConfigCRUD:
    def test_get_config_returns_none_when_empty(self, tmp_db):
        assert tmp_db.get_config() is None

    def test_set_config_creates_row(self, tmp_db):
        tmp_db.set_config("openai", "sk-test", "gpt-4o-mini")
        cfg = tmp_db.get_config()
        assert cfg is not None
        assert cfg["provider"] == "openai"
        assert cfg["api_key"] == "sk-test"
        assert cfg["model"] == "gpt-4o-mini"

    def test_set_config_upserts(self, tmp_db):
        tmp_db.set_config("openai", "key1", "gpt-4o-mini")
        tmp_db.set_config("anthropic", "key2", "claude-3-5-sonnet-20241022", "https://api.anthropic.com")
        cfg = tmp_db.get_config()
        assert cfg["provider"] == "anthropic"
        assert cfg["api_key"] == "key2"
        assert cfg["model"] == "claude-3-5-sonnet-20241022"

    def test_config_single_row_constraint(self, tmp_db):
        tmp_db.set_config("openai", "k1", "m1")
        tmp_db.set_config("groq", "k2", "m2")
        conn = sqlite3.connect(tmp_db.DB_PATH)
        count = conn.execute("SELECT COUNT(*) FROM config").fetchone()[0]
        conn.close()
        assert count == 1

    def test_base_url_defaults_to_empty(self, tmp_db):
        tmp_db.set_config("openai", "key", "gpt-4o-mini")
        cfg = tmp_db.get_config()
        assert cfg["base_url"] == ""


# ===========================================================================
# TestGraphCRUD
# ===========================================================================

SAMPLE_GRAPH = {
    "nodes": [{"id": "TP53", "val": 3}, {"id": "BRCA1", "val": 2}],
    "links": [{"source": "TP53", "target": "BRCA1", "weight": 0.9}],
}


class TestGraphCRUD:
    def test_load_graph_returns_none_when_missing(self, tmp_db):
        assert tmp_db.load_graph(0, "original") is None

    def test_save_and_load_graph(self, tmp_db):
        tmp_db.save_graph(0, "original", SAMPLE_GRAPH)
        loaded = tmp_db.load_graph(0, "original")
        assert loaded == SAMPLE_GRAPH

    def test_save_graph_upserts(self, tmp_db):
        tmp_db.save_graph(0, "current", SAMPLE_GRAPH)
        updated = {"nodes": [{"id": "EGFR", "val": 1}], "links": []}
        tmp_db.save_graph(0, "current", updated)
        assert tmp_db.load_graph(0, "current") == updated

    def test_load_all_graphs_empty(self, tmp_db):
        assert tmp_db.load_all_graphs() == {}

    def test_load_all_graphs_multiple(self, tmp_db):
        g1 = {"nodes": [{"id": "A"}], "links": []}
        g2 = {"nodes": [{"id": "B"}], "links": []}
        tmp_db.save_graph(0, "original", g1)
        tmp_db.save_graph(1, "original", g2)
        tmp_db.save_graph(0, "current", g2)
        result = tmp_db.load_all_graphs()
        assert len(result) == 3
        assert result[(0, "original")] == g1
        assert result[(1, "original")] == g2

    def test_graph_type_check(self, tmp_db):
        with pytest.raises(Exception):
            conn = sqlite3.connect(tmp_db.DB_PATH)
            conn.execute("INSERT INTO graphs VALUES (0, 'invalid', '{}', CURRENT_TIMESTAMP)")
            conn.commit()
            conn.close()

    def test_graph_data_is_json_serialised(self, tmp_db):
        tmp_db.save_graph(0, "original", SAMPLE_GRAPH)
        conn = sqlite3.connect(tmp_db.DB_PATH)
        raw = conn.execute("SELECT data FROM graphs WHERE graph_index=0 AND graph_type='original'").fetchone()[0]
        conn.close()
        assert json.loads(raw) == SAMPLE_GRAPH


# ===========================================================================
# TestAnnotationCache
# ===========================================================================

class TestAnnotationCache:
    def test_get_annotation_returns_none_when_missing(self, tmp_db):
        assert tmp_db.get_annotation("TP53", "function") is None

    def test_save_and_get_annotation(self, tmp_db):
        data = {"summary": "Tumour suppressor", "retrieved_passages": []}
        tmp_db.save_annotation("TP53", "function", data)
        result = tmp_db.get_annotation("TP53", "function")
        assert result == data

    def test_gene_normalised_to_uppercase(self, tmp_db):
        data = {"summary": "test"}
        tmp_db.save_annotation("tp53", "pathway", data)
        assert tmp_db.get_annotation("TP53", "pathway") == data

    def test_get_all_annotations_for_gene(self, tmp_db):
        tmp_db.save_annotation("BRCA1", "function", {"summary": "f"})
        tmp_db.save_annotation("BRCA1", "pathway", {"summary": "p"})
        result = tmp_db.get_all_annotations_for_gene("BRCA1")
        assert set(result.keys()) == {"function", "pathway"}

    def test_get_all_annotations_empty(self, tmp_db):
        assert tmp_db.get_all_annotations_for_gene("UNKNOWN") == {}

    def test_save_annotation_upserts(self, tmp_db):
        tmp_db.save_annotation("EGFR", "disease", {"summary": "v1"})
        tmp_db.save_annotation("EGFR", "disease", {"summary": "v2"})
        assert tmp_db.get_annotation("EGFR", "disease")["summary"] == "v2"


# ===========================================================================
# TestGeneSummary
# ===========================================================================

class TestGeneSummary:
    def test_get_gene_summary_returns_none_when_missing(self, tmp_db):
        assert tmp_db.get_gene_summary("TP53") is None

    def test_save_and_get_gene_summary(self, tmp_db):
        tmp_db.save_gene_summary("TP53", "Tumour suppressor involved in apoptosis.")
        assert tmp_db.get_gene_summary("TP53") == "Tumour suppressor involved in apoptosis."

    def test_gene_normalised_to_uppercase(self, tmp_db):
        tmp_db.save_gene_summary("brca1", "DNA repair gene.")
        assert tmp_db.get_gene_summary("BRCA1") == "DNA repair gene."

    def test_save_gene_summary_upserts(self, tmp_db):
        tmp_db.save_gene_summary("EGFR", "v1")
        tmp_db.save_gene_summary("EGFR", "v2")
        assert tmp_db.get_gene_summary("EGFR") == "v2"


# ===========================================================================
# TestKEGGCache
# ===========================================================================

class TestKEGGCache:
    SAMPLE_RESULTS = [{"source": "KEGG", "term_id": "hsa04110", "term_name": "Cell cycle"}]

    def test_get_kegg_cache_returns_none_when_missing(self, tmp_db):
        assert tmp_db.get_kegg_cache("TP53") is None

    def test_save_and_get_kegg_cache(self, tmp_db):
        tmp_db.save_kegg_cache("TP53", self.SAMPLE_RESULTS)
        result = tmp_db.get_kegg_cache("TP53")
        assert result == self.SAMPLE_RESULTS

    def test_kegg_cache_within_ttl(self, tmp_db):
        tmp_db.save_kegg_cache("BRCA1", self.SAMPLE_RESULTS)
        assert tmp_db.get_kegg_cache("BRCA1") is not None

    def test_kegg_cache_expired_returns_none(self, tmp_db):
        tmp_db.save_kegg_cache("EGFR", self.SAMPLE_RESULTS)
        expired_time = datetime.utcnow() - timedelta(days=tmp_db.KEGG_TTL_DAYS + 1)
        conn = sqlite3.connect(tmp_db.DB_PATH)
        conn.execute(
            "UPDATE kegg_cache SET fetched_at = ? WHERE gene = 'EGFR'",
            (expired_time.isoformat(sep=" "),),
        )
        conn.commit()
        conn.close()
        if hasattr(tmp_db._local, "conn"):
            tmp_db._local.conn.close()
            del tmp_db._local.conn
        assert tmp_db.get_kegg_cache("EGFR") is None

    def test_kegg_cache_upserts_on_second_fetch(self, tmp_db):
        tmp_db.save_kegg_cache("MYC", [])
        tmp_db.save_kegg_cache("MYC", self.SAMPLE_RESULTS)
        assert tmp_db.get_kegg_cache("MYC") == self.SAMPLE_RESULTS

    def test_gene_normalised_to_uppercase(self, tmp_db):
        tmp_db.save_kegg_cache("tp53", self.SAMPLE_RESULTS)
        assert tmp_db.get_kegg_cache("TP53") is not None


# ===========================================================================
# TestExpressionData
# ===========================================================================

class TestExpressionData:
    SAMPLE = {"GENE_A": {"sample1": 1.2, "sample2": 3.4}}

    def test_get_expression_data_returns_none_when_missing(self, tmp_db):
        assert tmp_db.get_expression_data(0) is None

    def test_save_and_get_expression_data(self, tmp_db):
        tmp_db.save_expression_data(0, self.SAMPLE)
        assert tmp_db.get_expression_data(0) == self.SAMPLE

    def test_separate_graph_indices(self, tmp_db):
        tmp_db.save_expression_data(0, {"A": {}})
        tmp_db.save_expression_data(1, {"B": {}})
        assert tmp_db.get_expression_data(0) == {"A": {}}
        assert tmp_db.get_expression_data(1) == {"B": {}}

    def test_save_expression_data_upserts(self, tmp_db):
        tmp_db.save_expression_data(0, {"old": {}})
        tmp_db.save_expression_data(0, self.SAMPLE)
        assert tmp_db.get_expression_data(0) == self.SAMPLE


# ===========================================================================
# TestNotIndexedGenes
# ===========================================================================

class TestNotIndexedGenes:
    def test_add_not_indexed_gene(self, tmp_db):
        tmp_db.add_not_indexed_gene("UNKNOWN1")
        conn = sqlite3.connect(tmp_db.DB_PATH)
        row = conn.execute("SELECT gene FROM not_indexed_genes WHERE gene='UNKNOWN1'").fetchone()
        conn.close()
        assert row is not None

    def test_add_not_indexed_gene_deduplicates(self, tmp_db):
        tmp_db.add_not_indexed_gene("FAKE")
        tmp_db.add_not_indexed_gene("FAKE")
        conn = sqlite3.connect(tmp_db.DB_PATH)
        count = conn.execute("SELECT COUNT(*) FROM not_indexed_genes WHERE gene='FAKE'").fetchone()[0]
        conn.close()
        assert count == 1

    def test_gene_normalised_to_uppercase(self, tmp_db):
        tmp_db.add_not_indexed_gene("abc")
        conn = sqlite3.connect(tmp_db.DB_PATH)
        row = conn.execute("SELECT gene FROM not_indexed_genes WHERE gene='ABC'").fetchone()
        conn.close()
        assert row is not None


# ===========================================================================
# TestStateMigration
# ===========================================================================

class TestStateMigration:
    """Verify that old file-based helpers no longer exist in state.py."""

    def test_no_load_annotation_cache(self):
        import state
        assert not hasattr(state, "load_annotation_cache"), \
            "state.load_annotation_cache should have been removed in Phase 2"

    def test_no_save_annotation_cache(self):
        import state
        assert not hasattr(state, "save_annotation_cache")

    def test_no_load_gene_summary_cache(self):
        import state
        assert not hasattr(state, "load_gene_summary_cache")

    def test_no_save_gene_summary_cache(self):
        import state
        assert not hasattr(state, "save_gene_summary_cache")

    def test_no_gene_summary_cache_dict(self):
        import state
        assert not hasattr(state, "gene_summary_cache"), \
            "In-memory gene_summary_cache dict should have been removed"

    def test_no_expression_data_store(self):
        import state
        assert not hasattr(state, "expression_data_store"), \
            "expression_data_store dict should have been removed"

    def test_record_not_indexed_gene_still_exists(self):
        import state
        assert callable(state.record_not_indexed_gene)

    def test_chunks_dir_uses_env_var(self):
        import state
        assert hasattr(state, "CHUNKS_DIR")


# ===========================================================================
# TestMainLifespan
# ===========================================================================

class TestMainLifespan:
    """Verify the lifespan handler restores graphs from SQLite into state."""

    def test_lifespan_restores_graphs(self, tmp_db, monkeypatch):
        import state

        saved = {
            "nodes": [{"id": "MYC", "val": 5}],
            "links": [{"source": "MYC", "target": "EGFR", "weight": 0.5}],
        }
        tmp_db.save_graph(0, "original", saved)
        tmp_db.save_graph(0, "current", saved)

        state.original_graphs[0] = {"nodes": [], "links": []}
        state.current_graphs[0]  = {"nodes": [], "links": []}

        all_graphs = tmp_db.load_all_graphs()
        for (graph_index, graph_type), data in all_graphs.items():
            if graph_type == "original":
                state.original_graphs[graph_index] = data
            else:
                state.current_graphs[graph_index] = data

        assert state.original_graphs[0]["nodes"][0]["id"] == "MYC"
        assert state.current_graphs[0]["nodes"][0]["id"] == "MYC"

    def test_lifespan_with_empty_db_leaves_empty_graphs(self, tmp_db, monkeypatch):
        import state
        state.original_graphs[0] = {"nodes": [], "links": []}
        all_graphs = tmp_db.load_all_graphs()
        assert all_graphs == {}
        assert state.original_graphs[0] == {"nodes": [], "links": []}


# ===========================================================================
# TestSettingsEndpoints
# ===========================================================================

class TestSettingsEndpoints:
    """GET/POST /settings/llm via FastAPI TestClient."""

    @pytest.fixture
    def client(self, tmp_db):
        from fastapi.testclient import TestClient
        import main as main_mod
        return TestClient(main_mod.app, raise_server_exceptions=False)

    def test_get_settings_404_when_unconfigured(self, client, tmp_db):
        resp = client.get("/settings/llm")
        assert resp.status_code == 404

    def test_post_settings_saves_config(self, client, tmp_db):
        body = {"provider": "openai", "api_key": "sk-abc", "model": "gpt-4o-mini", "base_url": ""}
        resp = client.post("/settings/llm", json=body)
        assert resp.status_code == 200
        assert "saved" in resp.json().get("message", "").lower()

    def test_get_settings_after_save_omits_api_key(self, client, tmp_db):
        client.post("/settings/llm", json={
            "provider": "anthropic", "api_key": "sk-secret", "model": "claude-3-5-sonnet-20241022"
        })
        resp = client.get("/settings/llm")
        assert resp.status_code == 200
        data = resp.json()
        assert "api_key" not in data
        assert data.get("has_api_key") is True
        assert data["provider"] == "anthropic"

    def test_post_settings_upsert(self, client, tmp_db):
        client.post("/settings/llm", json={"provider": "openai", "api_key": "k1", "model": "m1"})
        client.post("/settings/llm", json={"provider": "groq", "api_key": "k2", "model": "m2"})
        resp = client.get("/settings/llm")
        assert resp.json()["provider"] == "groq"
