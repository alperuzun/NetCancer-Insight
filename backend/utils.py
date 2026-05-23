"""Shared utility functions used across multiple routers."""
import numpy as np
import pandas as pd
import networkx as nx
from typing import Any, Dict


def clean_gene_info(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize gene info values to JSON-serializable strings."""
    clean: Dict[str, Any] = {}
    for k, v in raw.items():
        if isinstance(v, (list, np.ndarray, pd.Series)):
            array = v.tolist() if hasattr(v, "tolist") else list(v)
            clean[k] = ", ".join(str(x) for x in array)
        elif pd.isna(v):
            clean[k] = None
        else:
            clean[k] = str(v)
    return clean


def calculate_graph_metrics(graph_data: dict) -> dict:
    """Return basic network topology metrics for a graph dict."""
    if not graph_data or not graph_data.get("nodes") or not graph_data.get("links"):
        return {
            "density": 0.0,
            "avg_clustering_coefficient": 0.0,
            "avg_degree_centrality": 0.0,
            "num_nodes": 0,
            "num_edges": 0,
        }

    G = nx.Graph()
    for node in graph_data["nodes"]:
        G.add_node(node["id"])
    for link in graph_data["links"]:
        G.add_edge(link["source"], link["target"])

    num_nodes = G.number_of_nodes()
    degree_centralities = nx.degree_centrality(G)

    return {
        "density": nx.density(G),
        "avg_clustering_coefficient": nx.average_clustering(G),
        "avg_degree_centrality": sum(degree_centralities.values()) / num_nodes if num_nodes else 0.0,
        "num_nodes": num_nodes,
        "num_edges": G.number_of_edges(),
    }
