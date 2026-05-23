"""
ORCA integration for graphlet analysis.
Uses the orca-graphlets Python package for fast graphlet counting.
"""

import numpy as np
import networkx as nx
import itertools
from typing import Dict, Any

try:
    import orca
    ORCA_AVAILABLE = True
except ImportError:
    ORCA_AVAILABLE = False
    print("Warning: orca-graphlets package not installed. Using NetworkX fallback.")

MAX_NODES_FALLBACK = 50  # C(50,4) ≈ 230k combinations — manageable upper bound


def nx_to_orca_edges(nx_graph):
    """Convert NetworkX graph to ORCA edge format (0-based node IDs)."""
    nodes = list(nx_graph.nodes())
    node_mapping = {node: i for i, node in enumerate(nodes)}
    edges = []
    for edge in nx_graph.edges():
        edges.append([node_mapping[edge[0]], node_mapping[edge[1]]])
    return np.array(edges), node_mapping


def count_graphlets_orca(nx_graph, size=4):
    """Use ORCA Python package to count graphlets of given size."""
    if not ORCA_AVAILABLE:
        raise Exception("ORCA package not available. Please install with: pip install orca-graphlets")

    if size not in [4, 5]:
        raise Exception(f"ORCA only supports graphlet sizes 4 and 5, got {size}")

    try:
        edges, node_mapping = nx_to_orca_edges(nx_graph)
        result = orca.run_orca(
            edges,
            num_nodes=len(nx_graph.nodes()),
            mode="node",
            graphlet_size=size,
        )
        total_counts = np.sum(result, axis=0)
        return total_counts.tolist()
    except Exception as e:
        raise Exception(f"ORCA error: {str(e)}")


def analyze_graphlets_3_orca(G):
    """
    Count 3-node graphlets analytically in O(m^1.5) time.

    G0: 3 independent nodes   G1: 1 edge + 1 isolated node
    G2: open wedge (path)     G3: triangle

    Uses triangle counting + degree sequence — no brute-force enumeration.
    """
    n = G.number_of_nodes()
    m = G.number_of_edges()

    T = sum(nx.triangles(G).values()) // 3
    W = sum(d * (d - 1) // 2 for _, d in G.degree())

    g3 = T
    g2 = W - 3 * T
    g1 = m * (n - 2) - 2 * W + 3 * T
    g0 = n * (n - 1) * (n - 2) // 6 - g1 - g2 - g3

    counts = {"G0": g0, "G1": g1, "G2": g2, "G3": g3}
    total = sum(counts.values())
    frequencies = {k: v / total for k, v in counts.items()} if total else counts
    return {"counts": counts, "frequencies": frequencies, "total_graphlets": total}


def analyze_graphlets_4_orca(G):
    """Analyze 4-node graphlets using ORCA, with fallback to brute-force for small graphs."""
    try:
        counts = count_graphlets_orca(G, size=4)

        result = {
            "counts": {
                "G0": counts[0] if len(counts) > 0 else 0,
                "G1": counts[1] if len(counts) > 1 else 0,
                "G2": counts[2] if len(counts) > 2 else 0,
                "G3": counts[3] if len(counts) > 3 else 0,
                "G4": counts[4] if len(counts) > 4 else 0,
                "G5": counts[5] if len(counts) > 5 else 0,
                "G6": counts[6] if len(counts) > 6 else 0,
                "G7": counts[7] if len(counts) > 7 else 0,
                "G8": counts[8] if len(counts) > 8 else 0,
            }
        }

        total = sum(result["counts"].values())
        result["frequencies"] = (
            {k: v / total for k, v in result["counts"].items()} if total > 0 else result["counts"]
        )
        result["total_graphlets"] = total
        return result

    except Exception:
        # ORCA unavailable or failed — fall through to brute-force.
        # analyze_graphlets_4_fallback raises ValueError if G is too large.
        return analyze_graphlets_4_fallback(G)


def analyze_graphlets_4_fallback(G):
    """
    Brute-force NetworkX fallback for 4-node graphlets.
    Raises ValueError for graphs with more than MAX_NODES_FALLBACK nodes to prevent
    O(n^4) hangs (C(n,4) grows rapidly: C(100,4) ≈ 3.9M, C(200,4) ≈ 64.7M).
    """
    n = G.number_of_nodes()
    if n > MAX_NODES_FALLBACK:
        raise ValueError(
            f"Graph has {n} nodes — brute-force 4-node graphlet analysis requires "
            f"≤{MAX_NODES_FALLBACK} nodes. Install orca-graphlets for large-graph support."
        )

    counts = {"G0": 0, "G1": 0, "G2": 0, "G3": 0, "G4": 0, "G5": 0, "G6": 0, "G7": 0, "G8": 0}

    for nodes in itertools.combinations(G.nodes(), 4):
        subgraph = G.subgraph(nodes)
        edge_count = subgraph.number_of_edges()

        if edge_count == 0:
            counts["G0"] += 1
        elif edge_count == 1:
            counts["G1"] += 1
        elif edge_count == 2:
            if len(list(nx.connected_components(subgraph))) == 2:
                counts["G2"] += 1
            else:
                counts["G3"] += 1
        elif edge_count == 3:
            if max(d for _, d in subgraph.degree()) == 3:
                counts["G4"] += 1
            else:
                counts["G5"] += 1
        elif edge_count == 4:
            counts["G6"] += 1
        elif edge_count == 5:
            counts["G7"] += 1
        elif edge_count == 6:
            counts["G8"] += 1

    total = sum(counts.values())
    frequencies = {k: v / total for k, v in counts.items()} if total > 0 else counts

    return {"counts": counts, "frequencies": frequencies, "total_graphlets": total}
