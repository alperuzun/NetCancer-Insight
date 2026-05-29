"""
Phase 3 test suite — API safety fixes.

Coverage:
  TestFileSizeLimit      – upload >10 MB returns 413; ≤10 MB is accepted
  TestGraphletSizeGuard  – 4-node analysis always returns 200 (sampling for large graphs)
                         – invalid size returns 400
  TestKEGGTimeout        – 504 returned when KEGG hangs beyond timeout
                         – successful fetch is cached and re-served
                         – TimeoutError constant and env-var wiring
  TestComparativeSync    – /comparative-analysis still returns correct metrics
                         – endpoint function is not a coroutine (sync def)
  TestBackgroundTasks    – /chat passes BackgroundTasks to gene_chat
  TestGraphletModule     – graphlets.py: exact for small, sampled for large, K4=G10
"""
import concurrent.futures
import csv
import io
import inspect
import os
import sys
from typing import List
from unittest.mock import MagicMock, patch

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

def _make_csv(n_genes: int, *, edges_per_gene: int = 2) -> bytes:
    """Build a minimal CSV edge-list with n_genes distinct gene nodes."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["gene1", "gene2", "weight"])
    genes = [f"G{i:04d}" for i in range(n_genes)]
    for i in range(len(genes) - 1):
        w.writerow([genes[i], genes[(i + 1) % len(genes)], 1.0])
    return buf.getvalue().encode()


@pytest.fixture
def client():
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def small_graph(client):
    """Upload a 10-node graph into slot 0 and return the client."""
    csv_bytes = _make_csv(10)
    r = client.post(
        "/upload?graph_index=0",
        files={"file": ("graph.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 200
    return client


@pytest.fixture
def large_graph(client):
    """Upload a 51-node graph into slot 0 and return the client."""
    csv_bytes = _make_csv(51)
    r = client.post(
        "/upload?graph_index=0",
        files={"file": ("graph.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 200
    return client


# ===========================================================================
# TestFileSizeLimit
# ===========================================================================

class TestFileSizeLimit:
    MAX_BYTES = 10 * 1024 * 1024  # 10 MB

    def test_oversized_file_returns_413(self, client):
        oversized = b"A,B,1.0\n" * (self.MAX_BYTES // 8 + 1)
        r = client.post(
            "/upload?graph_index=0",
            files={"file": ("huge.csv", oversized, "text/csv")},
        )
        assert r.status_code == 413

    def test_413_body_contains_size_info(self, client):
        oversized = b"A,B,1.0\n" * (self.MAX_BYTES // 8 + 1)
        r = client.post(
            "/upload?graph_index=0",
            files={"file": ("huge.csv", oversized, "text/csv")},
        )
        body = r.json()
        assert "message" in body
        assert "10 MB" in body["message"] or "10" in body["message"]

    def test_normal_file_accepted(self, client):
        csv_bytes = _make_csv(5)
        r = client.post(
            "/upload?graph_index=0",
            files={"file": ("small.csv", csv_bytes, "text/csv")},
        )
        assert r.status_code == 200

    def test_exactly_at_limit_accepted(self, client):
        # Build a file just at the limit — should pass
        at_limit = b"A" * self.MAX_BYTES
        r = client.post(
            "/upload?graph_index=0",
            files={"file": ("limit.csv", at_limit, "text/csv")},
        )
        # The server reads it without 413; may return 200 (empty graph) or 200 with no edges
        assert r.status_code != 413

    def test_max_upload_size_constant_is_10mb(self):
        from routers.graph import MAX_UPLOAD_SIZE
        assert MAX_UPLOAD_SIZE == 10 * 1024 * 1024


# ===========================================================================
# TestGraphletModule
# ===========================================================================

class TestGraphletModule:
    """Unit-tests for the graphlets module (replaces the old orca_integration tests)."""

    def _make_graph(self, n: int):
        import networkx as nx
        return nx.path_graph(n)

    def test_analyze_4node_small_graph_returns_required_keys(self):
        from graphlets import analyze_4node
        import networkx as nx
        G = self._make_graph(8)
        result = analyze_4node(G)
        assert "counts" in result
        assert "frequencies" in result
        assert "total_graphlets" in result
        assert "exact" in result

    def test_analyze_4node_small_is_exact(self):
        from graphlets import analyze_4node
        import networkx as nx
        G = self._make_graph(10)
        assert analyze_4node(G)["exact"] is True

    def test_analyze_4node_large_is_sampled(self):
        from graphlets import analyze_4node, MAX_EXACT_4
        import networkx as nx
        G = nx.barabasi_albert_graph(MAX_EXACT_4 + 10, 2, seed=1)
        assert analyze_4node(G)["exact"] is False

    def test_analyze_4node_large_never_raises(self):
        from graphlets import analyze_4node
        import networkx as nx
        G = nx.barabasi_albert_graph(300, 2, seed=1)
        result = analyze_4node(G)  # must not raise
        assert result["total_graphlets"] > 0

    def test_k4_classified_as_G10(self):
        from graphlets import analyze_4node
        import networkx as nx
        G = nx.complete_graph(4)
        result = analyze_4node(G)
        assert result["counts"]["G10"] == 1

    def test_max_exact_4_constant(self):
        from graphlets import MAX_EXACT_4
        assert MAX_EXACT_4 >= 4


# ===========================================================================
# TestGraphletSizeGuard (via HTTP endpoint)
# ===========================================================================

class TestGraphletSizeGuard:
    def test_small_graph_size4_returns_200(self, small_graph):
        r = small_graph.get("/graphlet-analysis?graph_index=0&size=4")
        assert r.status_code == 200
        assert "counts" in r.json()

    def test_large_graph_size4_returns_200(self, large_graph):
        """Large graphs use sampling — must always return 200, never 400."""
        r = large_graph.get("/graphlet-analysis?graph_index=0&size=4")
        assert r.status_code == 200
        assert "counts" in r.json()

    def test_size3_always_works_regardless_of_node_count(self, large_graph):
        r = large_graph.get("/graphlet-analysis?graph_index=0&size=3")
        assert r.status_code == 200
        assert "counts" in r.json()

    def test_compare_graphlets_large_graphs_returns_200(self, client):
        """Large graphs should compare successfully via sampling."""
        csv_bytes = _make_csv(51)
        client.post("/upload?graph_index=0", files={"file": ("g.csv", csv_bytes, "text/csv")})
        client.post("/upload?graph_index=1", files={"file": ("g.csv", csv_bytes, "text/csv")})
        r = client.get("/compare-graphlets?size=4")
        assert r.status_code == 200

    def test_invalid_size_returns_400(self, small_graph):
        r = small_graph.get("/graphlet-analysis?graph_index=0&size=5")
        assert r.status_code == 400


# ===========================================================================
# TestKEGGTimeout
# ===========================================================================

class TestKEGGTimeout:
    def test_kegg_timeout_constant_default(self):
        from routers.genes import KEGG_TIMEOUT
        assert KEGG_TIMEOUT > 0

    def test_kegg_timeout_env_var(self, monkeypatch):
        monkeypatch.setenv("KEGG_TIMEOUT_SECONDS", "30")
        import importlib
        import routers.genes as genes_mod
        importlib.reload(genes_mod)
        assert genes_mod.KEGG_TIMEOUT == 30

    def test_kegg_timeout_returns_504(self, client, monkeypatch):
        """Simulate KEGG hanging by making the future raise TimeoutError."""
        import routers.genes as genes_mod

        class _TimeoutFuture:
            def result(self, timeout=None):
                raise concurrent.futures.TimeoutError()

        class _MockPool:
            def __enter__(self):
                return self
            def __exit__(self, *a):
                pass
            def submit(self, fn, *args, **kwargs):
                return _TimeoutFuture()

        monkeypatch.setattr(
            concurrent.futures,
            "ThreadPoolExecutor",
            lambda **kw: _MockPool(),
        )
        r = client.get("/gene-enrichment/TP53")
        assert r.status_code == 504
        assert "timed out" in r.json()["message"].lower()

    def test_kegg_success_caches_and_returns_200(self, client, monkeypatch):
        """Successful KEGG fetch should return 200 and save to cache."""
        import db
        import routers.genes as genes_mod

        fake_results = [{"source": "KEGG", "term_id": "hsa04110", "term_name": "Cell cycle"}]

        monkeypatch.setattr(genes_mod, "_fetch_kegg_results", lambda _: fake_results)
        monkeypatch.setattr(db, "get_kegg_cache", lambda gene: None)
        saved = []
        monkeypatch.setattr(db, "save_kegg_cache", lambda gene, data: saved.append(data))

        r = client.get("/gene-enrichment/TP53")
        assert r.status_code == 200
        assert r.json()["results"] == fake_results
        assert saved[0] == fake_results

    def test_kegg_cache_hit_skips_fetch(self, client, monkeypatch):
        """If cache has a valid entry, KEGG is never called."""
        import db
        fake = [{"source": "KEGG", "term_id": "hsa00001", "term_name": "Pathway A"}]
        monkeypatch.setattr(db, "get_kegg_cache", lambda gene: fake)

        called = []
        import routers.genes as genes_mod
        monkeypatch.setattr(genes_mod, "_fetch_kegg_results", lambda _: called.append(True) or [])

        r = client.get("/gene-enrichment/BRCA1")
        assert r.status_code == 200
        assert r.json()["cached"] is True
        assert not called, "KEGG should not have been called when cache hit"

    def test_kegg_fetch_helper_exists(self):
        from routers.genes import _fetch_kegg_results
        assert callable(_fetch_kegg_results)


# ===========================================================================
# TestComparativeSync
# ===========================================================================

class TestComparativeSync:
    def test_comparative_analysis_is_sync_function(self):
        from routers.graph import get_comparative_analysis
        assert not inspect.iscoroutinefunction(get_comparative_analysis), \
            "get_comparative_analysis must be a plain def, not async def"

    def test_comparative_analysis_returns_correct_keys(self, client):
        csv_bytes = _make_csv(10)
        client.post("/upload?graph_index=0", files={"file": ("g0.csv", csv_bytes, "text/csv")})
        client.post("/upload?graph_index=1", files={"file": ("g1.csv", _make_csv(8), "text/csv")})
        r = client.get("/comparative-analysis")
        assert r.status_code == 200
        data = r.json()
        assert "graph1_metrics" in data
        assert "graph2_metrics" in data
        assert "separation_score" in data

    def test_comparative_analysis_empty_graphs(self, client):
        r = client.get("/comparative-analysis")
        assert r.status_code == 200
        data = r.json()
        assert data["graph1_metrics"]["num_nodes"] == 0


# ===========================================================================
# TestBackgroundTasks
# ===========================================================================

class TestBackgroundTasks:
    def test_gene_chat_accepts_background_tasks_param(self):
        import inspect
        from services.chat import gene_chat
        sig = inspect.signature(gene_chat)
        assert "background_tasks" in sig.parameters

    def test_background_tasks_param_is_optional(self):
        import inspect
        from services.chat import gene_chat
        sig = inspect.signature(gene_chat)
        param = sig.parameters["background_tasks"]
        assert param.default is None

    def test_chat_route_injects_background_tasks(self):
        import inspect
        from routers.llm import chat_with_gene
        sig = inspect.signature(chat_with_gene)
        assert "background_tasks" in sig.parameters

    def test_gene_chat_returns_response_with_background_tasks(self, monkeypatch):
        """gene_chat returns a response dict regardless of whether background_tasks is set."""
        from services.chat import gene_chat

        monkeypatch.setattr(
            "services.chat.get_passages_unified",
            lambda gene, **kw: ["TP53 is a tumour suppressor."],
        )
        monkeypatch.setattr(
            "services.chat.call_llm",
            lambda **kw: "Test response.",
        )

        bg = MagicMock()
        result = gene_chat("TP53", "What does it do?", [], background_tasks=bg)
        assert result["response"] == "Test response."
        assert result["gene"] == "TP53"

    def test_gene_chat_returns_response_without_background_tasks(self, monkeypatch):
        """gene_chat works when background_tasks=None (MCP path)."""
        from services.chat import gene_chat

        monkeypatch.setattr(
            "services.chat.get_passages_unified",
            lambda gene, **kw: ["Gene info."],
        )
        monkeypatch.setattr("services.chat.call_llm", lambda **kw: "Response.")

        result = gene_chat("BRCA1", "Tell me about it.", [], background_tasks=None)
        assert result["response"] == "Response."
