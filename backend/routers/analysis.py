"""Graphlet analysis and graph clustering routes."""
import networkx as nx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

import state
from models import ClusterRequest
from orca_integration import analyze_graphlets_3_orca, analyze_graphlets_4_orca

try:
    import community as community_louvain
except ImportError:
    community_louvain = None

try:
    import igraph as ig
    import leidenalg
except ImportError:
    ig = None
    leidenalg = None

router = APIRouter()


def _build_nx_graph(graph_data: dict) -> nx.Graph:
    G = nx.Graph()
    for node in graph_data["nodes"]:
        G.add_node(node["id"])
    for link in graph_data["links"]:
        G.add_edge(link["source"], link["target"])
    return G


def _run_graphlet_analysis(graph_index: int, size: int) -> dict:
    """Core analysis logic. Raises ValueError if the graph is too large for brute-force."""
    cache_key = f"{graph_index}_{size}"
    if cache_key in state.graphlet_cache:
        return state.graphlet_cache[cache_key]

    G = _build_nx_graph(state.current_graphs[graph_index])
    result = analyze_graphlets_4_orca(G) if size == 4 else analyze_graphlets_3_orca(G)
    state.graphlet_cache[cache_key] = result
    return result


@router.get("/graphlet-analysis")
def perform_graphlet_analysis(graph_index: int = 0, size: int = 3):
    if not (0 <= graph_index < len(state.current_graphs)):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})
    if size not in (3, 4):
        return JSONResponse(status_code=400, content={"message": "Graphlet size must be 3 or 4"})

    try:
        return _run_graphlet_analysis(graph_index, size)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc)})


@router.get("/compare-graphlets")
def compare_graphlets(graph_index1: int = 0, graph_index2: int = 1, size: int = 3):
    if not all(0 <= i < len(state.current_graphs) for i in (graph_index1, graph_index2)):
        return JSONResponse(status_code=400, content={"message": "Invalid graph index"})
    if size not in (3, 4):
        return JSONResponse(status_code=400, content={"message": "Graphlet size must be 3 or 4"})

    try:
        a1 = _run_graphlet_analysis(graph_index1, size)
        a2 = _run_graphlet_analysis(graph_index2, size)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"message": str(exc)})

    f1 = a1.get("frequencies", {})
    f2 = a2.get("frequencies", {})
    keys = set(f1) | set(f2)

    euclidean = sum((f1.get(k, 0) - f2.get(k, 0)) ** 2 for k in keys) ** 0.5
    manhattan = sum(abs(f1.get(k, 0) - f2.get(k, 0)) for k in keys)
    dot = sum(f1.get(k, 0) * f2.get(k, 0) for k in set(f1) & set(f2))
    norm1 = sum(v ** 2 for v in f1.values()) ** 0.5
    norm2 = sum(v ** 2 for v in f2.values()) ** 0.5
    cosine = dot / (norm1 * norm2) if norm1 and norm2 else 0.0

    return {
        "graph1_index": graph_index1,
        "graph2_index": graph_index2,
        "graphlet_size": size,
        "euclidean_distance": euclidean,
        "manhattan_distance": manhattan,
        "cosine_similarity": cosine,
        "graph1_analysis": a1,
        "graph2_analysis": a2,
    }


@router.post("/cluster")
def cluster_graph(request: ClusterRequest):
    if not (0 <= request.graph_index < len(state.current_graphs)):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})

    graph_data = state.current_graphs[request.graph_index]
    if not graph_data["nodes"] or not graph_data["links"]:
        return JSONResponse(status_code=400, content={"message": "Graph is empty."})

    G = _build_nx_graph(graph_data)
    algorithm = request.algorithm.lower()

    if algorithm == "louvain":
        if community_louvain is None:
            return JSONResponse(status_code=500, content={"message": "python-louvain is not installed."})
        return {"clusters": community_louvain.best_partition(G, random_state=42)}

    if algorithm == "leiden":
        if ig is None or leidenalg is None:
            return JSONResponse(status_code=500, content={"message": "leidenalg or igraph is not installed."})
        node_list = list(G.nodes())
        node_index = {n: i for i, n in enumerate(node_list)}
        ig_graph = ig.Graph(
            edges=[(node_index[u], node_index[v]) for u, v in G.edges()],
            n=len(node_list),
        )
        ig_graph.vs["name"] = node_list
        partition = leidenalg.find_partition(ig_graph, leidenalg.ModularityVertexPartition, seed=42)
        return {"clusters": {node_list[i]: cid for cid, cluster in enumerate(partition) for i in cluster}}

    return JSONResponse(status_code=400, content={"message": f"Unknown algorithm: {request.algorithm}"})
