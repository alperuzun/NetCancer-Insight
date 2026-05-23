"""Graph management routes: upload, fetch, mutate, reset, search, and comparison."""
import copy
import csv
import io

import numpy as np
from fastapi import APIRouter, File, UploadFile
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
async def upload_file(file: UploadFile = File(...), graph_index: int = 0):
    if not _validate_index(graph_index):
        return JSONResponse(status_code=400, content={"message": "graph_index must be 0 or 1"})

    state.shared_genes_cache = None

    content = await file.read()

    if len(content) > MAX_UPLOAD_SIZE:
        return JSONResponse(
            status_code=413,
            content={
                "message": (
                    f"File too large ({len(content) // 1024} KB). "
                    f"Maximum allowed size is {MAX_UPLOAD_SIZE // (1024 * 1024)} MB."
                )
            },
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
            gene1, gene2, weight = row[0].strip(), row[1].strip(), float(row[2])
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

    state.original_graphs[graph_index] = {"nodes": node_list.copy(), "links": links.copy()}
    state.current_graphs[graph_index]  = {"nodes": node_list.copy(), "links": links.copy()}

    db.save_graph(graph_index, "original", state.original_graphs[graph_index])
    db.save_graph(graph_index, "current",  state.current_graphs[graph_index])

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
    state.shared_genes_cache = None
    idx = request.graph_index
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


@router.get("/comparative-analysis")
def get_comparative_analysis(graph_index1: int = 0, graph_index2: int = 1):
    m1 = calculate_graph_metrics(state.original_graphs[graph_index1])
    m2 = calculate_graph_metrics(state.original_graphs[graph_index2])

    keys = ["density", "avg_clustering_coefficient", "avg_degree_centrality"]
    norm1 = [m1[k] for k in keys]
    norm2 = [m2[k] for k in keys]
    separation = float(np.linalg.norm(np.array(norm1) - np.array(norm2)))

    return {
        "graph1_metrics": m1,
        "graph2_metrics": m2,
        "separation_score": separation,
        "normalized_metrics1": norm1,
        "normalized_metrics2": norm2,
        "metric_labels": ["Density", "Clustering Coefficient", "Degree Centrality"],
    }
