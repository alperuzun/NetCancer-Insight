"""
Shared fixtures for all graph engine tests.
"""
import csv
import io
import sys
import os

import networkx as nx
import pytest
from fastapi.testclient import TestClient

# Ensure the backend directory is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import state
from main import app

client = TestClient(app)


# ── Graph generation helpers ──────────────────────────────────────────────────

def make_csv(G: nx.Graph, prefix: str = "GENE") -> bytes:
    """Serialise a NetworkX graph to the CSV format the upload endpoint expects."""
    names = {node: f"{prefix}{node:04d}" for node in G.nodes()}
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["gene1", "gene2", "weight"])
    for u, v in G.edges():
        writer.writerow([names[u], names[v], 1.0])
    return buf.getvalue().encode()


def scale_free_csv(n_nodes: int, m: int = 2, seed: int = 42, prefix: str = "GENE") -> bytes:
    """
    Barabasi-Albert scale-free graph — mimics protein interaction networks.
    All n_nodes are guaranteed to appear (no isolated nodes).
    Edge count ≈ m * (n_nodes - m).
    """
    G = nx.barabasi_albert_graph(n_nodes, m, seed=seed)
    return make_csv(G, prefix=prefix)


def upload(csv_bytes: bytes, graph_index: int = 0) -> dict:
    """POST /upload and assert success."""
    r = client.post(
        f"/upload?graph_index={graph_index}",
        files={"file": ("graph.csv", csv_bytes, "text/csv")},
    )
    assert r.status_code == 200, r.text
    return r.json()


# ── Auto-reset state between tests ───────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_state():
    """Wipe both graph slots and caches before every test."""
    for i in range(2):
        state.original_graphs[i] = {"nodes": [], "links": []}
        state.current_graphs[i]  = {"nodes": [], "links": []}
    state.graphlet_cache.clear()
    state.shared_genes_cache = None
    yield
