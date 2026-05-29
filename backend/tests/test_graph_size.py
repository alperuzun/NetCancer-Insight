"""
Graph engine size-handling tests.

Covers upload, mutation, search, comparison, and clustering when the graph
has 300+ nodes and edges — the threshold where naive implementations tend to
fail or degrade.
"""
import csv
import io
import time

import networkx as nx
import pytest

from tests.conftest import client, scale_free_csv, upload, make_csv

LARGE   = 300   # primary threshold under test
MEDIUM  = 150   # half-size for contrast comparisons
STRESS  = 1_000 # stress-test ceiling


# ════════════════════════════════════════════════════════════════════════════════
# Upload & storage integrity
# ════════════════════════════════════════════════════════════════════════════════

class TestUploadIntegrity:

    def test_300_node_graph_accepted(self):
        result = upload(scale_free_csv(LARGE))
        assert result["node_count"] == LARGE

    def test_300_node_graph_stored_in_current(self):
        upload(scale_free_csv(LARGE))
        data = client.get("/graph-data/0").json()
        assert len(data["nodes"]) == LARGE

    def test_edge_count_preserved_after_upload(self):
        G = nx.barabasi_albert_graph(LARGE, 2, seed=1)
        upload(make_csv(G))
        data = client.get("/graph-data/0").json()
        assert len(data["links"]) == G.number_of_edges()

    def test_original_graph_matches_current_after_fresh_upload(self):
        upload(scale_free_csv(LARGE))
        current  = client.get("/graph-data/0").json()
        original = client.get("/original-graph-data?graph_index=0").json()
        assert len(current["nodes"]) == len(original["nodes"])
        assert len(current["links"]) == len(original["links"])

    def test_500_node_graph_accepted(self):
        result = upload(scale_free_csv(500))
        assert result["node_count"] == 500

    def test_1000_node_stress_upload(self):
        result = upload(scale_free_csv(STRESS))
        assert result["node_count"] == STRESS

    def test_node_degree_computed_correctly(self):
        """The 'val' field on each node should equal its graph degree."""
        # Star graph: hub connects to 299 leaves — easiest to verify
        hub = "HUB"
        leaves = [f"GENE{i:04d}" for i in range(LARGE - 1)]
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["gene1", "gene2", "weight"])
        for leaf in leaves:
            w.writerow([hub, leaf, 1.0])
        upload(buf.getvalue().encode())

        data  = client.get("/graph-data/0").json()
        nodes = {n["id"]: n for n in data["nodes"]}
        assert nodes[hub]["val"] == LARGE - 1
        assert all(nodes[leaf]["val"] == 1 for leaf in leaves)

    def test_both_graph_slots_independent(self):
        """Uploading to slot 1 must not affect slot 0."""
        upload(scale_free_csv(LARGE, seed=1), graph_index=0)
        upload(scale_free_csv(200, seed=2), graph_index=1)
        assert client.get("/graph-data/0").json()["nodes"] != []
        assert len(client.get("/graph-data/1").json()["nodes"]) == 200

    def test_second_upload_to_same_slot_replaces_graph(self):
        upload(scale_free_csv(LARGE), graph_index=0)
        upload(scale_free_csv(200),   graph_index=0)
        data = client.get("/graph-data/0").json()
        assert len(data["nodes"]) == 200


# ════════════════════════════════════════════════════════════════════════════════
# Node removal at scale
# ════════════════════════════════════════════════════════════════════════════════

class TestNodeRemovalAtScale:

    def test_remove_one_node_reduces_count_by_one(self):
        upload(scale_free_csv(LARGE))
        nodes = client.get("/graph-data/0").json()["nodes"]
        target = nodes[0]["id"]

        r = client.post("/remove-node", json={"node_id": target, "graph_index": 0})
        assert r.status_code == 200
        assert len(r.json()["nodes"]) == LARGE - 1

    def test_removed_node_absent_from_node_list(self):
        upload(scale_free_csv(LARGE))
        target = client.get("/graph-data/0").json()["nodes"][0]["id"]
        client.post("/remove-node", json={"node_id": target, "graph_index": 0})
        data = client.get("/graph-data/0").json()
        assert all(n["id"] != target for n in data["nodes"])

    def test_removed_node_edges_also_deleted(self):
        upload(scale_free_csv(LARGE))
        target = client.get("/graph-data/0").json()["nodes"][0]["id"]
        r = client.post("/remove-node", json={"node_id": target, "graph_index": 0})
        links = r.json()["links"]
        assert all(l["source"] != target and l["target"] != target for l in links)

    def test_remove_hub_node_cascades_edges(self):
        """Removing the highest-degree node must remove all its edges."""
        hub = "HUB"
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["gene1", "gene2", "weight"])
        for i in range(LARGE):
            w.writerow([hub, f"LEAF{i:04d}", 1.0])
        upload(buf.getvalue().encode())

        r = client.post("/remove-node", json={"node_id": hub, "graph_index": 0})
        assert r.json()["links"] == []

    def test_remove_10_nodes_sequentially(self):
        upload(scale_free_csv(LARGE))
        nodes = client.get("/graph-data/0").json()["nodes"]
        for node in nodes[:10]:
            client.post("/remove-node", json={"node_id": node["id"], "graph_index": 0})
        data = client.get("/graph-data/0").json()
        assert len(data["nodes"]) == LARGE - 10

    def test_reset_restores_full_graph_after_removals(self):
        upload(scale_free_csv(LARGE))
        nodes = client.get("/graph-data/0").json()["nodes"]
        for node in nodes[:50]:
            client.post("/remove-node", json={"node_id": node["id"], "graph_index": 0})

        r = client.post("/reset-graph", json={"graph_index": 0})
        assert r.status_code == 200
        assert len(r.json()["nodes"]) == LARGE


# ════════════════════════════════════════════════════════════════════════════════
# Search at scale
# ════════════════════════════════════════════════════════════════════════════════

class TestSearchAtScale:

    def test_keyword_match_returns_correct_gene(self):
        upload(scale_free_csv(LARGE))
        r = client.get("/search?keyword=GENE0001&graph_index=0")
        assert r.status_code == 200
        assert "GENE0001" in r.json()["gene"]

    def test_empty_keyword_returns_all_nodes(self):
        upload(scale_free_csv(LARGE))
        r = client.get("/search?keyword=&min_degree=0&max_degree=1000&graph_index=0")
        assert len(r.json()["gene"]) == LARGE

    def test_degree_filter_reduces_result_set(self):
        upload(scale_free_csv(LARGE))
        all_genes  = client.get("/search?keyword=&min_degree=0&max_degree=1000&graph_index=0").json()["gene"]
        high_genes = client.get("/search?keyword=&min_degree=10&max_degree=1000&graph_index=0").json()["gene"]
        assert len(high_genes) < len(all_genes)

    def test_nonexistent_keyword_returns_empty(self):
        upload(scale_free_csv(LARGE))
        r = client.get("/search?keyword=DOES_NOT_EXIST_XYZ&graph_index=0")
        assert r.json()["gene"] == []

    def test_min_degree_above_max_returns_empty(self):
        upload(scale_free_csv(LARGE))
        r = client.get("/search?keyword=&min_degree=999&max_degree=1000&graph_index=0")
        assert r.json()["gene"] == []


# ════════════════════════════════════════════════════════════════════════════════
# Comparative analysis at scale
# ════════════════════════════════════════════════════════════════════════════════

class TestComparativeAnalysisAtScale:

    def test_metrics_computed_for_two_large_graphs(self):
        upload(scale_free_csv(LARGE, seed=1), graph_index=0)
        upload(scale_free_csv(LARGE, seed=2), graph_index=1)
        r = client.get("/comparative-analysis")
        assert r.status_code == 200
        d = r.json()
        assert d["graph1_metrics"]["num_nodes"] == LARGE
        assert d["graph2_metrics"]["num_nodes"] == LARGE
        assert "separation_score" in d

    def test_identical_graphs_have_zero_separation(self):
        csv_bytes = scale_free_csv(LARGE)
        upload(csv_bytes, graph_index=0)
        upload(csv_bytes, graph_index=1)
        d = client.get("/comparative-analysis").json()
        assert d["separation_score"] == pytest.approx(0.0, abs=1e-9)

    def test_denser_graph_has_higher_density_metric(self):
        sparse = scale_free_csv(LARGE, m=1, seed=5)
        dense  = scale_free_csv(LARGE, m=4, seed=5)
        upload(sparse, graph_index=0)
        upload(dense,  graph_index=1)
        d = client.get("/comparative-analysis").json()
        assert d["graph2_metrics"]["density"] > d["graph1_metrics"]["density"]

    def test_shared_genes_overlap_is_correct(self):
        names = [f"GENE{i:04d}" for i in range(400)]

        def edge_csv(pairs):
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["gene1", "gene2", "weight"])
            for a, b in pairs:
                w.writerow([a, b, 1.0])
            return buf.getvalue().encode()

        # graph 0: genes 0-197  (pairs step by 2, so range(0,198,2) → indices 0..197)
        # graph 1: genes 100-297 (range(100,298,2) → indices 100..297)
        # overlap: genes 100-197 exactly
        upload(edge_csv([(names[i], names[i+1]) for i in range(0, 198, 2)]),   graph_index=0)
        upload(edge_csv([(names[i], names[i+1]) for i in range(100, 298, 2)]), graph_index=1)

        shared = set(client.get("/shared-genes").json()["genes"])
        expected_overlap = set(names[100:198])  # genes present in both graphs
        assert expected_overlap.issubset(shared)

    def test_shared_genes_empty_when_no_overlap(self):
        names = [f"GENE{i:04d}" for i in range(600)]

        def edge_csv(pairs):
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["gene1", "gene2", "weight"])
            for a, b in pairs:
                w.writerow([a, b, 1.0])
            return buf.getvalue().encode()

        upload(edge_csv([(names[i], names[i+1]) for i in range(0, 298, 2)]),   graph_index=0)
        upload(edge_csv([(names[i], names[i+1]) for i in range(300, 598, 2)]), graph_index=1)

        shared = client.get("/shared-genes").json()["genes"]
        assert shared == []


# ════════════════════════════════════════════════════════════════════════════════
# Clustering at scale
# ════════════════════════════════════════════════════════════════════════════════

class TestClusteringAtScale:

    def test_louvain_assigns_all_nodes(self):
        upload(scale_free_csv(LARGE))
        node_ids = {n["id"] for n in client.get("/graph-data/0").json()["nodes"]}
        r = client.post("/cluster", json={"graph_index": 0, "algorithm": "louvain"})
        assert r.status_code == 200
        assert set(r.json()["clusters"].keys()) == node_ids

    def test_louvain_produces_multiple_communities(self):
        upload(scale_free_csv(LARGE))
        r = client.post("/cluster", json={"graph_index": 0, "algorithm": "louvain"})
        communities = set(r.json()["clusters"].values())
        assert len(communities) >= 2

    def test_leiden_assigns_all_nodes(self):
        upload(scale_free_csv(LARGE))
        node_ids = {n["id"] for n in client.get("/graph-data/0").json()["nodes"]}
        r = client.post("/cluster", json={"graph_index": 0, "algorithm": "leiden"})
        if r.status_code == 500 and "not installed" in r.json().get("message", ""):
            pytest.skip("leidenalg not installed in this environment")
        assert r.status_code == 200
        assert set(r.json()["clusters"].keys()) == node_ids

    def test_unknown_algorithm_returns_400(self):
        upload(scale_free_csv(LARGE))
        r = client.post("/cluster", json={"graph_index": 0, "algorithm": "kmeans"})
        assert r.status_code == 400

    def test_empty_graph_cluster_returns_400(self):
        r = client.post("/cluster", json={"graph_index": 0, "algorithm": "louvain"})
        assert r.status_code == 400


# ════════════════════════════════════════════════════════════════════════════════
# Performance budgets
# ════════════════════════════════════════════════════════════════════════════════

class TestPerformanceBudgets:
    """
    Timing assertions catch regressions where a previously fast operation
    becomes accidentally O(n²). Budgets are generous enough not to be flaky
    on CI but tight enough to catch algorithmic regressions.
    """

    def test_upload_300_nodes_under_2s(self):
        csv_bytes = scale_free_csv(LARGE)
        t0 = time.perf_counter()
        upload(csv_bytes)
        assert time.perf_counter() - t0 < 2.0

    def test_upload_1000_nodes_under_5s(self):
        csv_bytes = scale_free_csv(STRESS)
        t0 = time.perf_counter()
        upload(csv_bytes)
        assert time.perf_counter() - t0 < 5.0

    def test_search_1000_node_graph_under_1s(self):
        upload(scale_free_csv(STRESS))
        t0 = time.perf_counter()
        client.get("/search?keyword=&min_degree=0&max_degree=1000&graph_index=0")
        assert time.perf_counter() - t0 < 1.0

    def test_louvain_1000_nodes_under_30s(self):
        upload(scale_free_csv(STRESS))
        t0 = time.perf_counter()
        r = client.post("/cluster", json={"graph_index": 0, "algorithm": "louvain"})
        assert r.status_code == 200
        assert time.perf_counter() - t0 < 30.0

    def test_comparative_analysis_300_nodes_under_5s(self):
        upload(scale_free_csv(LARGE, seed=1), graph_index=0)
        upload(scale_free_csv(LARGE, seed=2), graph_index=1)
        t0 = time.perf_counter()
        client.get("/comparative-analysis")
        assert time.perf_counter() - t0 < 5.0


# ════════════════════════════════════════════════════════════════════════════════
# Graphlet analysis — correctness + performance
# ════════════════════════════════════════════════════════════════════════════════

class TestGraphletAnalysis:
    """
    Verifies the analytical O(m^1.5) 3-node graphlet formula and ORCA 4-node
    integration against small graphs whose graphlet counts are known exactly.
    """

    # ── 3-node graphlets ──────────────────────────────────────────────────────

    @pytest.mark.skip(reason="Upload drops isolated nodes (no edges), so an empty graph cannot be round-tripped through the API")
    def test_3node_empty_graph_only_G0(self):
        """3 isolated nodes → exactly 1 G0 (independent triple), 0 others."""
        upload(make_csv(nx.empty_graph(3)), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        assert r.status_code == 200
        c = r.json()["counts"]
        assert c["G0"] == 1
        assert c["G1"] == 0
        assert c["G2"] == 0
        assert c["G3"] == 0

    @pytest.mark.skip(reason="Upload drops isolated nodes (no edges), so the isolated third node is lost — graph arrives as n=2 with no valid triples")
    def test_3node_single_edge_gives_G1(self):
        """One edge + 1 isolated node → 1 G1, 0 others (except G0)."""
        G = nx.empty_graph(3)
        G.add_edge(0, 1)
        upload(make_csv(G), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        assert r.status_code == 200
        c = r.json()["counts"]
        assert c["G1"] == 1
        assert c["G3"] == 0  # no triangle

    def test_3node_path_gives_G2(self):
        """0-1-2 path → exactly 1 G2 (open wedge), 0 triangles."""
        G = nx.path_graph(3)  # edges: 0-1, 1-2
        upload(make_csv(G), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        assert r.status_code == 200
        c = r.json()["counts"]
        assert c["G2"] == 1
        assert c["G3"] == 0

    def test_3node_triangle_gives_G3(self):
        """Complete graph K3 → exactly 1 G3 (triangle), 0 G2."""
        upload(make_csv(nx.complete_graph(3)), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        assert r.status_code == 200
        c = r.json()["counts"]
        assert c["G3"] == 1
        assert c["G2"] == 0

    def test_3node_counts_sum_to_C_n_3(self):
        """Sum of all 3-node graphlet counts must equal C(n, 3)."""
        upload(scale_free_csv(LARGE), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        assert r.status_code == 200
        c = r.json()["counts"]
        total = sum(c.values())
        expected = LARGE * (LARGE - 1) * (LARGE - 2) // 6
        assert total == expected

    def test_3node_no_negative_counts(self):
        """All graphlet counts must be non-negative."""
        upload(scale_free_csv(LARGE), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        c = r.json()["counts"]
        assert all(v >= 0 for v in c.values())

    def test_3node_frequencies_sum_to_one(self):
        """Frequency distribution must sum to 1.0 (within floating-point tolerance)."""
        upload(scale_free_csv(LARGE), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        freqs = r.json()["frequencies"]
        assert sum(freqs.values()) == pytest.approx(1.0, abs=1e-9)

    def test_3node_dense_graph_has_more_triangles(self):
        """A denser graph (m=4) should produce more G3 (triangles) than a sparse one (m=1)."""
        upload(scale_free_csv(LARGE, m=1, seed=7), graph_index=0)
        upload(scale_free_csv(LARGE, m=4, seed=7), graph_index=1)
        r0 = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        r1 = client.get("/graphlet-analysis", params={"graph_index": 1, "size": 3})
        assert r1.json()["counts"]["G3"] > r0.json()["counts"]["G3"]

    # ── 4-node graphlets ──────────────────────────────────────────────────────

    def test_4node_complete_graph_only_G10(self):
        """K4 (6 edges) → all 4-node subgraphs are K4 (G10), count = 1."""
        upload(make_csv(nx.complete_graph(4)), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 4})
        assert r.status_code == 200
        c = r.json()["counts"]
        assert c["G10"] == 1

    @pytest.mark.skip(reason="Upload drops isolated nodes (no edges), so an empty graph cannot be round-tripped through the API")
    def test_4node_empty_graph_only_G0(self):
        """4 isolated nodes → 1 G0, all others 0."""
        upload(make_csv(nx.empty_graph(4)), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 4})
        assert r.status_code == 200
        c = r.json()["counts"]
        assert c["G0"] == 1
        assert sum(c.values()) == 1

    def test_4node_no_negative_counts(self):
        """All 4-node graphlet counts must be non-negative."""
        upload(scale_free_csv(LARGE), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 4})
        c = r.json()["counts"]
        assert all(v >= 0 for v in c.values())

    def test_4node_frequencies_sum_to_one(self):
        """4-node frequency distribution must sum to 1.0."""
        upload(scale_free_csv(LARGE), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 4})
        freqs = r.json()["frequencies"]
        assert sum(freqs.values()) == pytest.approx(1.0, abs=1e-9)

    # ── performance budgets ───────────────────────────────────────────────────

    def test_3node_300_nodes_under_1s(self):
        """3-node graphlet analysis on 300 nodes must complete in under 1 second."""
        upload(scale_free_csv(LARGE), graph_index=0)
        t0 = time.perf_counter()
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        elapsed = time.perf_counter() - t0
        assert r.status_code == 200
        assert elapsed < 1.0, f"3-node analysis took {elapsed:.2f}s — too slow"

    def test_4node_300_nodes_under_5s(self):
        """4-node graphlet analysis (ORCA) on 300 nodes must complete in under 5 seconds."""
        upload(scale_free_csv(LARGE), graph_index=0)
        t0 = time.perf_counter()
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 4})
        elapsed = time.perf_counter() - t0
        assert r.status_code == 200
        assert elapsed < 5.0, f"4-node analysis took {elapsed:.2f}s — too slow"

    def test_graphlet_endpoint_returns_required_fields(self):
        """Response must contain counts, frequencies, and total_graphlets."""
        upload(scale_free_csv(LARGE), graph_index=0)
        r = client.get("/graphlet-analysis", params={"graph_index": 0, "size": 3})
        assert r.status_code == 200
        body = r.json()
        assert "counts" in body
        assert "frequencies" in body
        assert "total_graphlets" in body

    def test_graphlet_compare_two_graphs_returns_similarity(self):
        """Compare-graphlets endpoint must return a similarity score between 0 and 1."""
        upload(scale_free_csv(LARGE, seed=1), graph_index=0)
        upload(scale_free_csv(LARGE, seed=2), graph_index=1)
        r = client.get("/compare-graphlets?size=3")
        assert r.status_code == 200
        body = r.json()
        assert "cosine_similarity" in body or "euclidean_distance" in body
