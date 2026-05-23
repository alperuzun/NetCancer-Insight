"""
Topology feature extraction for gene annotations.

Computes per-gene network features from the in-memory graph and formats them as a
short context string injected into the LLM annotation prompt.

Cache is keyed by (graph_index, gene) and invalidated via clear_topology_cache()
which should be called whenever a graph is uploaded or replaced.
"""
from typing import Dict, List, Optional

import networkx as nx

import state

_topology_cache: Dict[tuple, dict] = {}


def clear_topology_cache(graph_index: Optional[int] = None) -> None:
    """Invalidate cached topology data. Call after graph upload or replacement."""
    if graph_index is None:
        _topology_cache.clear()
    else:
        for key in [k for k in list(_topology_cache) if k[0] == graph_index]:
            del _topology_cache[key]


def _build_nx_graph(graph_data: dict) -> nx.Graph:
    G = nx.Graph()
    for node in graph_data["nodes"]:
        G.add_node(node["id"])
    for link in graph_data["links"]:
        G.add_edge(link["source"], link["target"])
    return G


def _classify_role(degree: int, max_degree: int, betweenness: float, clustering: float) -> str:
    if max_degree == 0:
        return "isolated"
    pct = degree / max_degree
    if pct >= 0.8:
        return "hub"
    if betweenness > 0.1 and clustering < 0.3:
        return "bridge"
    if degree <= 2:
        return "peripheral"
    return "connector"


def get_topology_features(gene: str, graph_index: int) -> Optional[dict]:
    """
    Compute topology features for `gene` in `graph_index`.
    Returns None if the gene is absent from the graph or the graph is empty.
    """
    gene = gene.upper()
    cache_key = (graph_index, gene)
    if cache_key in _topology_cache:
        return _topology_cache[cache_key]

    if not (0 <= graph_index < len(state.current_graphs)):
        return None

    graph_data = state.current_graphs[graph_index]
    if not graph_data["nodes"]:
        return None

    G = _build_nx_graph(graph_data)
    if gene not in G:
        return None

    n = G.number_of_nodes()
    degree = G.degree(gene)
    max_degree = max(d for _, d in G.degree()) if n > 0 else 1

    # Approximate betweenness for large graphs to keep annotation latency low
    k_sample = min(50, n) if n > 500 else None
    betweenness_map = nx.betweenness_centrality(G, k=k_sample, normalized=True)
    betweenness = betweenness_map.get(gene, 0.0)

    clustering = nx.clustering(G, gene)

    neighbors: List[str] = list(G.neighbors(gene))
    top_neighbors = [nb for nb, _ in sorted(
        [(nb, G.degree(nb)) for nb in neighbors], key=lambda x: -x[1]
    )[:5]]

    features = {
        "degree": degree,
        "betweenness": round(betweenness, 4),
        "clustering": round(clustering, 4),
        "top_neighbors": top_neighbors,
        "role": _classify_role(degree, max_degree, betweenness, clustering),
        "n_nodes": n,
    }
    _topology_cache[cache_key] = features
    return features


def build_topology_context(gene: str, graph_index: int) -> str:
    """
    Format topology features as a compact natural-language block for the LLM prompt.
    Returns an empty string when the gene is not present in the specified graph.
    """
    feats = get_topology_features(gene, graph_index)
    if feats is None:
        return ""

    role_labels = {
        "hub":        "highly-connected hub",
        "bridge":     "bridging gene connecting distinct modules",
        "peripheral": "peripheral gene with few connections",
        "connector":  "moderately connected gene",
        "isolated":   "isolated gene with no connections",
    }
    role_label = role_labels.get(feats["role"], feats["role"])
    top_nb = ", ".join(feats["top_neighbors"]) if feats["top_neighbors"] else "none"

    return (
        f"[Network topology — Graph {graph_index + 1}]\n"
        f"- Role: {role_label} (degree {feats['degree']} in a {feats['n_nodes']}-node network)\n"
        f"- Betweenness centrality: {feats['betweenness']:.4f}\n"
        f"- Clustering coefficient: {feats['clustering']:.4f}\n"
        f"- Top interacting partners: {top_nb}"
    )
