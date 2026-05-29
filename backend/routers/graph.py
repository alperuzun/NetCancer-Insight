"""Graph management routes: upload, fetch, mutate, reset, search, and comparison."""
import copy
import csv
import io

import networkx as nx
import numpy as np
from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse

import db
import state
from models import NodeRequest, GraphIndexRequest
from services.topology import clear_topology_cache
from utils import clean_gene_info, calculate_graph_metrics

router = APIRouter()

MAX_GRAPHS = 2
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


def _validate_index(index: int) -> bool:
    return 0 <= index < MAX_GRAPHS


@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), graph_index: int = 0):
    if not _validate_index(graph_index):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})

    # Reject oversized uploads before reading the body
    cl = request.headers.get("content-length")
    if cl and int(cl) > MAX_UPLOAD_SIZE:
        return JSONResponse(
            status_code=413,
            content={"message": f"File too large. Maximum allowed size is {MAX_UPLOAD_SIZE // (1024 * 1024)} MB."},
        )

    content = await file.read()

    if len(content) > MAX_UPLOAD_SIZE:
        return JSONResponse(
            status_code=413,
            content={"message": f"File too large ({len(content) // 1024} KB). Maximum allowed size is {MAX_UPLOAD_SIZE // (1024 * 1024)} MB."},
        )

    delimiter = "," if (file.filename or "").endswith(".csv") else "\t"
    reader = csv.reader(io.StringIO(content.decode("utf-8")), delimiter=delimiter)

    nodes: set = set()
    links = []
    header_skipped = False
    for row in reader:
        if not header_skipped:
            header_skipped = True
            continue
        if len(row) < 3:
            continue
        try:
            gene1, gene2, weight = row[0].strip().upper(), row[1].strip().upper(), float(row[2])
        except ValueError:
            continue
        nodes.add(gene1)
        nodes.add(gene2)
        links.append({"source": gene1, "target": gene2, "weight": weight})

    node_degrees: dict = {}
    node_cancer_drivers: dict = {}
    for link in links:
        for gene in (link["source"], link["target"]):
            node_degrees[gene] = node_degrees.get(gene, 0) + 1
            if gene not in node_cancer_drivers:
                info = state.gene_info_db.get(gene.upper(), {})
                drivers = info.get("cancer", [])
                node_cancer_drivers[gene] = len(drivers) if isinstance(drivers, list) else (1 if drivers else 0)

    node_list = [
        {"id": n, "val": node_degrees.get(n, 0), "cancer_drivers": node_cancer_drivers.get(n, 0)}
        for n in nodes
    ]

    with state.graph_locks[graph_index]:
        state.shared_genes_cache = None
        state.original_graphs[graph_index] = {"nodes": node_list.copy(), "links": links.copy()}
        state.current_graphs[graph_index]  = {"nodes": node_list.copy(), "links": links.copy()}
        db.save_graph(graph_index, "original", state.original_graphs[graph_index])
        db.save_graph(graph_index, "current",  state.current_graphs[graph_index])
        db.save_expression_data(graph_index, {})
        state.graphlet_cache = {k: v for k, v in state.graphlet_cache.items()
                                if not k.startswith(f"{graph_index}_")}
        clear_topology_cache(graph_index)

    return {"message": f"File processed for graph {graph_index}", "node_count": len(nodes), "nodes": list(nodes)}


@router.get("/graph-data/{graph_index}")
def get_graph(graph_index: int):
    if not _validate_index(graph_index):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})
    return state.current_graphs[graph_index]


@router.get("/original-graph-data")
def get_original_graph(graph_index: int = 0):
    if not _validate_index(graph_index):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})
    return state.original_graphs[graph_index]


@router.post("/remove-node")
def remove_node(node: NodeRequest):
    if not _validate_index(node.graph_index):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})
    with state.graph_locks[node.graph_index]:
        state.shared_genes_cache = None
        g = state.current_graphs[node.graph_index]
        g["nodes"] = [n for n in g["nodes"] if n["id"] != node.node_id]
        g["links"] = [l for l in g["links"] if node.node_id not in (l["source"], l["target"])]
        db.save_graph(node.graph_index, "current", g)
        clear_topology_cache(node.graph_index)
    return g


@router.post("/reset-graph")
def reset_graph(request: GraphIndexRequest):
    if not _validate_index(request.graph_index):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})
    idx = request.graph_index
    with state.graph_locks[idx]:
        state.shared_genes_cache = None
        state.current_graphs[idx] = {
            "nodes": state.original_graphs[idx]["nodes"].copy(),
            "links": state.original_graphs[idx]["links"].copy(),
        }
        db.save_graph(idx, "current", state.current_graphs[idx])
        clear_topology_cache(idx)
    return state.current_graphs[idx]


@router.post("/promote-graph")
def promote_graph():
    """Move graph slot 1 into slot 0, clearing slot 1. Called when the user closes Panel 1."""
    # Acquire both locks in index order to avoid deadlock
    with state.graph_locks[0], state.graph_locks[1]:
        state.current_graphs[0]  = copy.deepcopy(state.current_graphs[1])
        state.original_graphs[0] = copy.deepcopy(state.original_graphs[1])
        state.current_graphs[1]  = {"nodes": [], "links": []}
        state.original_graphs[1] = {"nodes": [], "links": []}

        db.save_graph(0, "current",  state.current_graphs[0])
        db.save_graph(0, "original", state.original_graphs[0])
        db.save_graph(1, "current",  state.current_graphs[1])
        db.save_graph(1, "original", state.original_graphs[1])

        expr = db.get_expression_data(1)
        if expr:
            db.save_expression_data(0, expr)
        db.save_expression_data(1, {})

        state.graphlet_cache.clear()
        state.shared_genes_cache = None
        clear_topology_cache()

    return {"message": "Graph promoted from slot 1 to slot 0"}


@router.get("/search")
def search_genes(keyword: str = "", min_degree: int = 0, max_degree: int = 100, graph_index: int = 0):
    if not _validate_index(graph_index):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})
    results = set()
    for gene in state.current_graphs[graph_index]["nodes"]:
        degree = gene["val"]
        if not (min_degree <= degree <= max_degree):
            continue
        if not keyword:
            results.add(gene["id"])
            continue
        kw = keyword.lower()
        if kw in gene["id"].lower():
            results.add(gene["id"])
            continue
        info = state.gene_info_db.get(gene["id"].upper())
        if info:
            for value in clean_gene_info(info).values():
                if value and kw in str(value).lower():
                    results.add(gene["id"])
                    break
    return {"gene": list(results)}


@router.get("/shared-genes")
def get_shared_genes():
    if state.shared_genes_cache is not None:
        return {"genes": list(state.shared_genes_cache)}
    if not state.current_graphs[0]["nodes"] or not state.current_graphs[1]["nodes"]:
        return {"genes": []}
    genes0 = {n["id"] for n in state.current_graphs[0]["nodes"]}
    genes1 = {n["id"] for n in state.current_graphs[1]["nodes"]}
    state.shared_genes_cache = genes0 & genes1
    return {"genes": list(state.shared_genes_cache)}


def _build_nx(graph_data: dict) -> nx.Graph:
    G = nx.Graph()
    for node in graph_data.get("nodes", []):
        G.add_node(node["id"])
    for link in graph_data.get("links", []):
        G.add_edge(link["source"], link["target"])
    return G


# Graphs larger than this skip O(n²) and O(n·d²) metrics to avoid blocking.
_MAX_EXPENSIVE_NODES = 2000

def _extended_topology(G: nx.Graph, graph_data: dict) -> dict:
    n = G.number_of_nodes()
    empty = {
        "num_nodes": 0, "num_edges": 0, "density": 0.0,
        "avg_clustering_coefficient": 0.0, "avg_degree_centrality": 0.0,
        "avg_degree": 0.0, "max_degree": 0, "num_components": 0,
        "avg_path_length": None, "assortativity": None,
        "cancer_driver_count": 0, "cancer_driver_fraction": 0.0,
    }
    if n == 0:
        return empty

    large = n > _MAX_EXPENSIVE_NODES
    degrees = [d for _, d in G.degree()]
    centrality = nx.degree_centrality(G)  # O(n) — always safe

    avg_clustering = round(nx.average_clustering(G), 4) if not large else None
    avg_path_length = None
    if not large and nx.is_connected(G) and n <= 500:
        try:
            avg_path_length = round(float(nx.average_shortest_path_length(G)), 4)
        except Exception:
            avg_path_length = None

    assortativity = None
    if not large:
        try:
            assortativity = round(float(nx.degree_assortativity_coefficient(G)), 4)
        except Exception:
            assortativity = None

    cancer_driver_count = sum(
        1 for node in graph_data.get("nodes", []) if node.get("cancer_drivers", 0) > 0
    )

    return {
        "num_nodes": n,
        "num_edges": G.number_of_edges(),
        "density": round(nx.density(G), 6),
        "avg_clustering_coefficient": avg_clustering,
        "avg_degree_centrality": round(sum(centrality.values()) / n, 4),
        "avg_degree": round(sum(degrees) / n, 2),
        "max_degree": max(degrees) if degrees else 0,
        "num_components": nx.number_connected_components(G),
        "avg_path_length": avg_path_length,
        "assortativity": assortativity,
        "cancer_driver_count": cancer_driver_count,
        "cancer_driver_fraction": round(cancer_driver_count / n, 4),
    }


def _hub_genes(G: nx.Graph, graph_data: dict, n: int = 15) -> list:
    if G.number_of_nodes() == 0:
        return []
    centrality = nx.degree_centrality(G)
    degree_map = dict(G.degree())
    cancer_map = {nd["id"]: nd.get("cancer_drivers", 0) for nd in graph_data.get("nodes", [])}
    top = sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:n]
    return [
        {
            "gene": gene,
            "degree": degree_map.get(gene, 0),
            "centrality": round(c, 4),
            "cancer_drivers": cancer_map.get(gene, 0),
            "is_cancer_driver": cancer_map.get(gene, 0) > 0,
        }
        for gene, c in top
    ]


def _ks_statistic(dist1: list, dist2: list) -> float:
    """KS test D-statistic between two empirical distributions (no scipy needed)."""
    if not dist1 or not dist2:
        return 0.0
    all_vals = sorted(set(dist1) | set(dist2))
    n1, n2 = len(dist1), len(dist2)
    d = 0.0
    for v in all_vals:
        c1 = sum(1 for x in dist1 if x <= v) / n1
        c2 = sum(1 for x in dist2 if x <= v) / n2
        d = max(d, abs(c1 - c2))
    return round(d, 4)


@router.get("/comparative-analysis")
def get_comparative_analysis(graph_index1: int = 0, graph_index2: int = 1):
    from graphlets import analyze_4node

    g1_data = state.original_graphs[graph_index1]
    g2_data = state.original_graphs[graph_index2]
    G1 = _build_nx(g1_data)
    G2 = _build_nx(g2_data)

    t1 = _extended_topology(G1, g1_data)
    t2 = _extended_topology(G2, g2_data)
    hubs1 = _hub_genes(G1, g1_data)
    hubs2 = _hub_genes(G2, g2_data)

    # Gene-set analysis
    nodes1 = {n["id"] for n in g1_data.get("nodes", [])}
    nodes2 = {n["id"] for n in g2_data.get("nodes", [])}
    cancer_map1 = {n["id"]: n.get("cancer_drivers", 0) for n in g1_data.get("nodes", [])}
    cancer_map2 = {n["id"]: n.get("cancer_drivers", 0) for n in g2_data.get("nodes", [])}
    degree_map1 = dict(G1.degree())
    degree_map2 = dict(G2.degree())
    shared = nodes1 & nodes2
    unique1 = nodes1 - nodes2
    unique2 = nodes2 - nodes1
    union = nodes1 | nodes2
    node_jaccard = round(len(shared) / len(union), 4) if union else 0.0

    edges1 = {tuple(sorted([l["source"], l["target"]])) for l in g1_data.get("links", [])}
    edges2 = {tuple(sorted([l["source"], l["target"]])) for l in g2_data.get("links", [])}
    edge_shared = edges1 & edges2
    edge_union = edges1 | edges2
    edge_jaccard = round(len(edge_shared) / len(edge_union), 4) if edge_union else 0.0

    def _gene_list(gene_set: set, cancer_map: dict, degree_map: dict) -> list:
        return sorted(
            [{"gene": g, "degree": degree_map.get(g, 0), "cancer_drivers": cancer_map.get(g, 0)}
             for g in gene_set],
            key=lambda x: (-x["cancer_drivers"], -x["degree"])
        )

    shared_genes_list = _gene_list(shared, {**cancer_map1, **cancer_map2}, {**degree_map1, **degree_map2})
    unique1_list = _gene_list(unique1, cancer_map1, degree_map1)
    unique2_list = _gene_list(unique2, cancer_map2, degree_map2)

    # Hub overlap
    top_hub_set1 = {h["gene"] for h in hubs1}
    top_hub_set2 = {h["gene"] for h in hubs2}
    hub_overlap = list(top_hub_set1 & top_hub_set2)

    # KS statistic on degree distributions
    deg1 = [d for _, d in G1.degree()]
    deg2 = [d for _, d in G2.degree()]
    degree_ks = _ks_statistic(deg1, deg2)

    # Divergence (euclidean on 3 normalized metrics, kept for backward compat)
    keys = ["density", "avg_clustering_coefficient", "avg_degree_centrality"]
    separation = float(np.linalg.norm(
        np.array([t1[k] for k in keys]) - np.array([t2[k] for k in keys])
    ))

    # Graphlet frequencies (3-node always exact; 4-node samples for large graphs)
    from graphlets import analyze_4node, analyze_3node
    glet4_1 = analyze_4node(G1)
    glet4_2 = analyze_4node(G2)
    glet3_1 = analyze_3node(G1)
    glet3_2 = analyze_3node(G2)

    return {
        # Rich per-network data
        "network1": {
            "topology": t1,
            "hub_genes": hubs1,
            "graphlet_frequencies_4node": glet4_1["frequencies"],
            "graphlet_frequencies_3node": glet3_1["frequencies"],
            "graphlet_exact": glet4_1["exact"],
        },
        "network2": {
            "topology": t2,
            "hub_genes": hubs2,
            "graphlet_frequencies_4node": glet4_2["frequencies"],
            "graphlet_frequencies_3node": glet3_2["frequencies"],
            "graphlet_exact": glet4_2["exact"],
        },
        # Cross-network comparison
        "comparison": {
            "node_jaccard": node_jaccard,
            "edge_jaccard": edge_jaccard,
            "shared_node_count": len(shared),
            "unique_node_count_1": len(unique1),
            "unique_node_count_2": len(unique2),
            "shared_edge_count": len(edge_shared),
            "unique_edge_count_1": len(edges1 - edges2),
            "unique_edge_count_2": len(edges2 - edges1),
            "divergence_score": round(separation, 4),
            "hub_overlap": hub_overlap,
            "degree_ks_statistic": degree_ks,
            "shared_genes": shared_genes_list,
            "unique_to_1": unique1_list,
            "unique_to_2": unique2_list,
        },
        # Backward compat
        "graph1_metrics": t1,
        "graph2_metrics": t2,
        "separation_score": round(separation, 4),
    }
