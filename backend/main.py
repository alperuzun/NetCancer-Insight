from fastapi import FastAPI, File, UploadFile, Request, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
import sys
import os
from dotenv import load_dotenv
import threading

# Load environment variables from .env file
load_dotenv()

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from pydantic import BaseModel
from typing import Dict, Optional, List, Union

from file_utils import update_gene_data_dict, update_link_data_dict
import csv
import io
import os
import pandas as pd
import networkx as nx
import itertools
from collections import Counter
import numpy as np
from gprofiler import GProfiler # Import GProfiler
from bioservices import KEGG # Import BioServices KEGG
from services.retriever import get_passages
from services.prompts   import build_prompt
from services.llm       import call_llm
import json
import re
import ast

ANNOTATION_CACHE_FILE = "annotation_cache.json"
annotation_cache_lock = threading.Lock()

def load_annotation_cache():
    if not os.path.exists(ANNOTATION_CACHE_FILE):
        return {}
    try:
        with open(ANNOTATION_CACHE_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def save_annotation_cache(cache):
    with annotation_cache_lock:
        with open(ANNOTATION_CACHE_FILE, "w") as f:
            json.dump(cache, f, indent=2)

class NodeRequest(BaseModel):
    node_id: str
    graph_index: int = 0  # Default to first graph

class GraphIndexRequest(BaseModel):
    graph_index: int

class ChatRequest(BaseModel):
    gene: str
    message: str
    conversation_history: str

app = FastAPI()
# Allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_url = "https://netcancer-rh4m2e306-abhinavs-projects-599e34c1.vercel.app/"

# Store multiple graphs
original_graphs = [
    {"nodes": [], "links": []},  # First graph
    {"nodes": [], "links": []}   # Second graph
]

current_graphs = [
    {"nodes": [], "links": []},  # First graph
    {"nodes": [], "links": []}   # Second graph
]

# In-memory storage for expression data
expression_data_store: Dict[int, Dict[str, Dict[str, float]]] = {}

graph_theory_metrics = [
    {}, {}
]

# Load CSV gene annotation data into memory
gene_info_db = {}
data_dirs = ["gene_data/annotations", "gene_data/general"]
for data_dir in data_dirs:
    for fname in os.listdir(data_dir):
        if fname.endswith(".csv"):
            update_gene_data_dict(gene_info_db, data_dir, fname)
        elif fname.endswith(".tsv"):
            update_gene_data_dict(gene_info_db, data_dir, fname, sep="\t")

interaction_dir = "gene_data/interactions"
interaction_info_db = {}
for fname in os.listdir(interaction_dir):
    if fname.endswith(".csv"):
        update_link_data_dict(interaction_info_db, interaction_dir, fname)
    elif fname.endswith(".tsv"):
        update_link_data_dict(interaction_info_db, interaction_dir, fname)

# Add cache dictionary at the top level
graphlet_cache = {}
shared_genes_cache = None  # Will store the set of shared genes between graphs

# Load indexed genes at startup
INDEXED_GENE_FILE = "indexed_gene.txt"
NOT_INDEXED_GENE_FILE = "not_indexed_gene.txt"
indexed_genes = set()
if os.path.exists(INDEXED_GENE_FILE):
    with open(INDEXED_GENE_FILE, "r") as f:
        indexed_genes = set(line.strip().upper() for line in f if line.strip())
else:
    print(f"Warning: {INDEXED_GENE_FILE} not found. No genes will be considered indexed.")

def record_not_indexed_gene(gene):
    gene = gene.upper()
    with open(NOT_INDEXED_GENE_FILE, "a") as f:
        f.write(gene + "\n")

@app.get("/", response_class=HTMLResponse)
def read_root():
    return """
    <html>
        <head>
            <title>Net-CancerInsight Upload</title>
        </head>
        <body>
            <h1>Upload a Gene Interaction File</h1>
            <form action="/upload" enctype="multipart/form-data" method="post">
                <input name="file" type="file">
                <input type="submit">
            </form>
        </body>
    </html>
    """

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), graph_index: int = 0):
    global shared_genes_cache
    # Clear the shared genes cache when a graph is updated
    shared_genes_cache = None
    
    content = await file.read()
    decoded = content.decode("utf-8")
    reader = csv.reader(io.StringIO(decoded), delimiter=',' if file.filename.endswith(".csv") else '\t')

    nodes = set()
    links = []
    header_skipped = False
    for row in reader:
        if not header_skipped:
            header_skipped = True
            continue
        if len(row) < 3:
            continue
        gene1, gene2, weight = row[0], row[1], float(row[2])
        nodes.add(gene1)
        nodes.add(gene2)
        links.append({"source": gene1, "target": gene2, "weight": weight})

    # Calculate node degrees and get cancer driver info
    node_degrees = {}
    node_cancer_drivers = {}
    for link in links:
        source = link["source"]
        target = link["target"]
        node_degrees[source] = node_degrees.get(source, 0) + 1
        node_degrees[target] = node_degrees.get(target, 0) + 1
        
        # Get cancer driver info from gene_info_db
        for gene in [source, target]:
            if gene not in node_cancer_drivers:
                gene_info = gene_info_db.get(gene.upper(), {})
                cancer_drivers = gene_info.get('cancer', [])
                node_cancer_drivers[gene] = len(cancer_drivers) if isinstance(cancer_drivers, list) else 1 if cancer_drivers else 0

    node_list = [{
        "id": n,
        "val": node_degrees.get(n, 0),
        "cancer_drivers": node_cancer_drivers.get(n, 0)
    } for n in nodes]
    
    # Ensure graph_index is valid
    if graph_index < 0 or graph_index >= len(original_graphs):
        return JSONResponse(
            status_code=400,
            content={"message": f"Invalid graph index. Must be between 0 and {len(original_graphs)-1}"}
        )
    
    # Update both original and current graphs
    original_graphs[graph_index]["nodes"] = node_list.copy()
    original_graphs[graph_index]["links"] = links.copy()
    current_graphs[graph_index]["nodes"] = node_list.copy()
    current_graphs[graph_index]["links"] = links.copy()
    
    return {
        "message": f"File processed successfully for graph {graph_index}", 
        "node_count": len(nodes), 
        "nodes": list(nodes)
    }

@app.get("/graph-data/{graph_index}")
def get_graph(graph_index: int):
    if graph_index < 0 or graph_index >= len(current_graphs):
        return JSONResponse(
            status_code=400,
            content={"message": f"Invalid graph index. Must be between 0 and {len(current_graphs)-1}"}
        )
    return current_graphs[graph_index]

@app.get("/original-graph-data")
def get_original_graph(graph_index: int = 0):
    if graph_index < 0 or graph_index >= len(original_graphs):
        return JSONResponse(
            status_code=400,
            content={"message": f"Invalid graph index. Must be between 0 and {len(original_graphs)-1}"}
        )
    return original_graphs[graph_index]

@app.post("/remove-node")
def remove_nodes(node: NodeRequest):
    global shared_genes_cache
    # Clear the shared genes cache when a node is removed
    shared_genes_cache = None
    
    graph_index = node.graph_index
    node_id = node.node_id
    
    if graph_index < 0 or graph_index >= len(current_graphs):
        return JSONResponse(
            status_code=400,
            content={"message": f"Invalid graph index. Must be between 0 and {len(current_graphs)-1}"}
        )
    
    current_graphs[graph_index]["nodes"] = [n for n in current_graphs[graph_index]["nodes"] if n["id"] != node_id]
    current_graphs[graph_index]["links"] = [l for l in current_graphs[graph_index]["links"] if l["source"] != node_id and l["target"] != node_id]
    return current_graphs[graph_index]

@app.post("/reset-graph")
def reset_graph(request: GraphIndexRequest):
    global shared_genes_cache
    # Clear the shared genes cache when a graph is reset
    shared_genes_cache = None
    
    graph_index = request.graph_index
    
    if graph_index < 0 or graph_index >= len(original_graphs):
        return JSONResponse(
            status_code=400,
            content={"message": f"Invalid graph index. Must be between 0 and {len(original_graphs)-1}"}
        )
    
    current_graphs[graph_index]["nodes"] = original_graphs[graph_index]["nodes"].copy()
    current_graphs[graph_index]["links"] = original_graphs[graph_index]["links"].copy()
    return current_graphs[graph_index]

@app.post("/analyze-graph")
def analyze_graph(request: GraphIndexRequest):
    graph_index = request.graph_index
    
    if graph_index < 0 or graph_index >= len(current_graphs):
        return JSONResponse(
            status_code=400,
            content={"message": f"Invalid graph index. Must be between 0 and {len(current_graphs)-1}"}
        )
    
    # Dummy ML score for now
    return {"score": 0.76, "cancer_like": True, "method": "GCN (dummy)", "graph_index": graph_index}

def clean_gene_info(raw: dict) -> dict:
    """
    Normalize any list/np.ndarray/pd.Series into JSON‑serializable strings;
    turn pandas NA into None; cast everything else to str.
    """
    clean: dict = {}
    for k, v in raw.items():
        # list, numpy array, or pandas Series → JSONable list → string
        if isinstance(v, (list, np.ndarray, pd.Series)):
            array = v.tolist() if hasattr(v, "tolist") else list(v)
            clean[k] = ", ".join(str(x) for x in array)
        # pandas NA (or numpy NaN) → None
        elif pd.isna(v):
            clean[k] = None
        # otherwise → string
        else:
            clean[k] = str(v)
    return clean

@app.get("/search")
def search_genes(keyword: str = "", min_degree: int = 0, max_degree: int = 20, graph_index: int = 0):
    """
    Search for genes in the database based on a keyword.
    If keyword is empty, return all genes within the degree range.
    """
    results = set()
    for gene in current_graphs[graph_index]["nodes"]:
        # First check if the gene's degree is within range
        if gene["val"] >= min_degree and gene["val"] <= max_degree:
            # If keyword is empty, include all genes within degree range
            if not keyword:
                results.add(gene["id"])
                continue
                
            # Otherwise, check if gene matches the keyword
            if gene["id"] in gene_info_db:
                info = gene_info_db[gene["id"]]
                clean_info = clean_gene_info(info)
                for key, value in clean_info.items():
                    if keyword.lower() in value.lower():
                        results.add(gene["id"])
            if keyword.lower() in gene["id"].lower():
                results.add(gene["id"])
                
    return JSONResponse(
            content={"gene": list(results)},
            headers={"Access-Control-Allow-Origin": api_url}
        )

@app.get("/gene-enrichment/{gene_symbol}")
def get_gene_enrichment(gene_symbol: str):
    """
    Get the top 3 KEGG pathways for a given gene symbol using get_pathway_by_gene.
    """
    try:
        kegg = KEGG()
        
        # Use get_pathway_by_gene to find pathways containing this gene
        pathway_dict = kegg.get_pathway_by_gene(gene_symbol, "hsa")
        
        if not pathway_dict:
            return JSONResponse(
                content={"gene": gene_symbol, "results": [], "message": "No pathways found for this gene"},
                headers={"Access-Control-Allow-Origin": api_url}
            )
        
        # Get the top 3 pathways with their details
        results = []
        for pathway_id in list(pathway_dict.keys())[:3]:
            pathway_name = pathway_dict[pathway_id]
            
            # Get pathway information
            pathway_info = kegg.get(pathway_id)
            parsed_pathway = kegg.parse(pathway_info)
            description = parsed_pathway.get("DESCRIPTION", "No description available") if parsed_pathway else "No description available"
            
            results.append({
                "source": "KEGG",
                "term_id": pathway_id,
                "term_name": pathway_name,
                "description": description
            })
        
        return JSONResponse(
            content={"gene": gene_symbol, "results": results},
            headers={"Access-Control-Allow-Origin": api_url}
        )
        
    except Exception as e:
        print(f"Error fetching gene enrichment for {gene_symbol}: {e}")
        import traceback
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"message": f"Failed to fetch gene enrichment for {gene_symbol}: {str(e)}"}
        )

@app.get("/gene/{gene_name}")
def get_gene_details(gene_name: str):
    gene = gene_name.upper()
    info = gene_info_db.get(gene)
    if info is None:
        return JSONResponse(
            content={
                "gene": gene,
                "data": {"Information": None},
                "message": "Gene not found in database."
            },
            headers={"Access-Control-Allow-Origin": api_url}
        )

    try:
        cleaned = clean_gene_info(info)
        return JSONResponse(
            content={"gene": gene, "data": cleaned},
            headers={"Access-Control-Allow-Origin": api_url}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "gene": gene_name},
            headers={"Access-Control-Allow-Origin": api_url}
        )
    
@app.get("/interaction/{gene1}/{gene2}")
def get_interaction(gene1: str, gene2: str):
    if gene1 not in interaction_info_db or gene2 not in interaction_info_db[gene1]:
        return JSONResponse(
            content={"message": "No interaction found between the two genes"},
            headers={"Access-Control-Allow-Origin": api_url}
        )
    return JSONResponse(
            content={
                "sources": list(set(interaction_info_db[gene1][gene2]))
            },
            headers={"Access-Control-Allow-Origin": api_url}
        )


@app.get("/graphlet-analysis")
def perform_graphlet_analysis(graph_index: int = 0, size: int = 3):
    """
    Perform graphlet analysis on the specified graph.
    
    Args:
        graph_index: Index of the graph to analyze
        size: Size of graphlets to analyze (3 or 4)
        
    Returns:
        Dictionary containing graphlet counts and frequencies
    """
    print(f"\n=== Starting graphlet analysis ===")
    print(f"Graph index: {graph_index}")
    print(f"Size: {size}")
    print(f"Current graphs length: {len(current_graphs)}")
    
    if graph_index < 0 or graph_index >= len(current_graphs):
        print(f"Invalid graph index {graph_index}")
        return JSONResponse(
            status_code=400,
            content={"message": f"Invalid graph index. Must be between 0 and {len(current_graphs)-1}"}
        )
    
    if size not in [3, 4]:
        print(f"Invalid graphlet size {size}")
        return JSONResponse(
            status_code=400,
            content={"message": "Graphlet size must be 3 or 4"}
        )
    
    # Check cache first
    cache_key = f"{graph_index}_{size}"
    if cache_key in graphlet_cache:
        print(f"Using cached graphlet analysis for graph {graph_index} with size {size}")
        return graphlet_cache[cache_key]
    
    # Get the graph data
    graph_data = current_graphs[graph_index]
    print(f"\nGraph data for index {graph_index}:")
    print(f"Number of nodes: {len(graph_data['nodes'])}")
    print(f"Number of links: {len(graph_data['links'])}")
    print(f"First few nodes: {graph_data['nodes'][:3]}")
    print(f"First few links: {graph_data['links'][:3]}")
    
    # Create a NetworkX graph
    G = nx.Graph()
    
    # Add nodes
    for node in graph_data["nodes"]:
        G.add_node(node["id"])
    
    # Add edges
    for link in graph_data["links"]:
        G.add_edge(link["source"], link["target"])
    
    print(f"\nNetworkX graph created:")
    print(f"Number of nodes: {G.number_of_nodes()}")
    print(f"Number of edges: {G.number_of_edges()}")
    print(f"First few nodes: {list(G.nodes())[:3]}")
    print(f"First few edges: {list(G.edges())[:3]}")
    
    # Perform graphlet analysis
    if size == 3:
        print("\nAnalyzing 3-node graphlets...")
        result = analyze_graphlets_3(G)
    else:
        print("\nAnalyzing 4-node graphlets...")
        result = analyze_graphlets_4(G)
    
    # Cache the result
    graphlet_cache[cache_key] = result
    
    print(f"\nAnalysis result: {result}")
    print("=== End of graphlet analysis ===\n")
    return result

def analyze_graphlets_3(G):
    """
    Analyze 3-node graphlets in the graph.
    
    Returns:
        Dictionary with graphlet counts and frequencies
    """
    print("\n=== Starting 3-node graphlet analysis ===")
    
    # Define the 3-node graphlets
    # G0: Empty graph (3 isolated nodes)
    # G1: One edge
    # G2: Two edges (path)
    # G3: Three edges (triangle)
    
    # Initialize counters
    counts = {
        "G0": 0,  # 3 isolated nodes
        "G1": 0,  # 1 edge
        "G2": 0,  # 2 edges (path)
        "G3": 0   # 3 edges (triangle)
    }
    
    # Get all 3-node combinations
    node_combinations = list(itertools.combinations(G.nodes(), 3))
    print(f"Number of 3-node combinations: {len(node_combinations)}")
    
    for i, nodes in enumerate(node_combinations):
        # Get the subgraph induced by these nodes
        subgraph = G.subgraph(nodes)
        
        # Count edges in the subgraph
        edge_count = subgraph.number_of_edges()
        
        # Classify the graphlet
        if edge_count == 0:
            counts["G0"] += 1
        elif edge_count == 1:
            counts["G1"] += 1
        elif edge_count == 2:
            counts["G2"] += 1
        elif edge_count == 3:
            counts["G3"] += 1
            
        if i < 5:  # Print first 5 combinations for debugging
            print(f"Combination {i}: nodes={nodes}, edges={edge_count}")
    
    # Calculate frequencies
    total = sum(counts.values())
    frequencies = {k: v/total for k, v in counts.items()} if total > 0 else counts
    
    print(f"Final counts: {counts}")
    print(f"Final frequencies: {frequencies}")
    print("=== End of 3-node graphlet analysis ===\n")
    
    return {
        "counts": counts,
        "frequencies": frequencies,
        "total_graphlets": total
    }

def analyze_graphlets_4(G):
    """
    Analyze 4-node graphlets in the graph.
    
    Returns:
        Dictionary with graphlet counts and frequencies
    """
    print("\n=== Starting 4-node graphlet analysis ===")
    
    # Define the 4-node graphlets
    # G0: Empty graph (4 isolated nodes)
    # G1: One edge
    # G2: Two edges (disconnected)
    # G3: Two edges (path)
    # G4: Three edges (star)
    # G5: Three edges (path)
    # G6: Four edges (cycle)
    # G7: Five edges (claw)
    # G8: Six edges (complete)
    
    # Initialize counters
    counts = {
        "G0": 0,  # 4 isolated nodes
        "G1": 0,  # 1 edge
        "G2": 0,  # 2 edges (disconnected)
        "G3": 0,  # 2 edges (path)
        "G4": 0,  # 3 edges (star)
        "G5": 0,  # 3 edges (path)
        "G6": 0,  # 4 edges (cycle)
        "G7": 0,  # 5 edges (claw)
        "G8": 0   # 6 edges (complete)
    }
    
    # Get all 4-node combinations
    node_combinations = list(itertools.combinations(G.nodes(), 4))
    print(f"Number of 4-node combinations: {len(node_combinations)}")
    
    for i, nodes in enumerate(node_combinations):
        # Get the subgraph induced by these nodes
        subgraph = G.subgraph(nodes)
        
        # Count edges in the subgraph
        edge_count = subgraph.number_of_edges()
        
        # Classify the graphlet based on edge count and structure
        if edge_count == 0:
            counts["G0"] += 1
        elif edge_count == 1:
            counts["G1"] += 1
        elif edge_count == 2:
            # Check if the edges are connected or disconnected
            components = list(nx.connected_components(subgraph))
            if len(components) == 2:
                counts["G2"] += 1
            else:
                counts["G3"] += 1
        elif edge_count == 3:
            # Check if it's a star or a path
            degrees = [d for n, d in subgraph.degree()]
            if max(degrees) == 3:
                counts["G4"] += 1
            else:
                counts["G5"] += 1
        elif edge_count == 4:
            counts["G6"] += 1
        elif edge_count == 5:
            counts["G7"] += 1
        elif edge_count == 6:
            counts["G8"] += 1
            
        if i < 5:  # Print first 5 combinations for debugging
            print(f"Combination {i}: nodes={nodes}, edges={edge_count}")
    
    # Calculate frequencies
    total = sum(counts.values())
    frequencies = {k: v/total for k, v in counts.items()} if total > 0 else counts
    
    print(f"Final counts: {counts}")
    print(f"Final frequencies: {frequencies}")
    print("=== End of 4-node graphlet analysis ===\n")
    
    return {
        "counts": counts,
        "frequencies": frequencies,
        "total_graphlets": total
    }

@app.get("/compare-graphlets")
def compare_graphlets(graph_index1: int = 0, graph_index2: int = 1, size: int = 3):
    """
    Compare graphlet distributions between two graphs.
    
    Args:
        graph_index1: Index of the first graph
        graph_index2: Index of the second graph
        size: Size of graphlets to analyze (3 or 4)
        
    Returns:
        Dictionary containing comparison metrics
    """
    print(f"Comparing graphlets between graphs {graph_index1} and {graph_index2} with size {size}")
    
    if graph_index1 < 0 or graph_index1 >= len(current_graphs) or \
       graph_index2 < 0 or graph_index2 >= len(current_graphs):
        print(f"Invalid graph indices: {graph_index1}, {graph_index2}")
        return JSONResponse(
            status_code=400,
            content={"message": "Invalid graph index"}
        )
    
    if size not in [3, 4]:
        print(f"Invalid graphlet size: {size}")
        return JSONResponse(
            status_code=400,
            content={"message": "Graphlet size must be 3 or 4"}
        )
    
    # Get graphlet analysis for both graphs
    print(f"Getting analysis for graph {graph_index1}")
    analysis1 = perform_graphlet_analysis(graph_index1, size)
    print(f"Analysis for graph {graph_index1}: {analysis1}")
    
    print(f"Getting analysis for graph {graph_index2}")
    analysis2 = perform_graphlet_analysis(graph_index2, size)
    print(f"Analysis for graph {graph_index2}: {analysis2}")
    
    # Calculate similarity metrics
    frequencies1 = analysis1["frequencies"]
    frequencies2 = analysis2["frequencies"]
    
    # Calculate Euclidean distance between frequency distributions
    euclidean_distance = sum((frequencies1.get(k, 0) - frequencies2.get(k, 0))**2 
                            for k in set(frequencies1.keys()) | set(frequencies2.keys())) ** 0.5
    
    # Calculate Manhattan distance
    manhattan_distance = sum(abs(frequencies1.get(k, 0) - frequencies2.get(k, 0)) 
                           for k in set(frequencies1.keys()) | set(frequencies2.keys()))
    
    # Calculate cosine similarity
    dot_product = sum(frequencies1.get(k, 0) * frequencies2.get(k, 0) 
                     for k in set(frequencies1.keys()) & set(frequencies2.keys()))
    norm1 = sum(v**2 for v in frequencies1.values()) ** 0.5
    norm2 = sum(v**2 for v in frequencies2.values()) ** 0.5
    
    cosine_similarity = dot_product / (norm1 * norm2) if norm1 > 0 and norm2 > 0 else 0
    
    result = {
        "graph1_index": graph_index1,
        "graph2_index": graph_index2,
        "graphlet_size": size,
        "euclidean_distance": euclidean_distance,
        "manhattan_distance": manhattan_distance,
        "cosine_similarity": cosine_similarity,
        "graph1_analysis": analysis1,
        "graph2_analysis": analysis2
    }
    
    print(f"Comparison result: {result}")
    return result

@app.get("/shared-genes")
def get_shared_genes():
    """
    Get the set of genes that exist in both graphs.
    Returns empty set if either graph is empty.
    """
    global shared_genes_cache
    
    # If we have a cached result, return it
    if shared_genes_cache is not None:
        return JSONResponse(
            content={"genes": list(shared_genes_cache)},
            headers={"Access-Control-Allow-Origin": api_url}
        )
    
    # Check if both graphs have nodes
    if not current_graphs[0]["nodes"] or not current_graphs[1]["nodes"]:
        return JSONResponse(
            content={"genes": []},
            headers={"Access-Control-Allow-Origin": api_url}
        )
    
    # Get sets of genes from both graphs
    genes1 = {node["id"] for node in current_graphs[0]["nodes"]}
    genes2 = {node["id"] for node in current_graphs[1]["nodes"]}
    
    # Calculate intersection
    shared_genes_cache = genes1.intersection(genes2)
    
    return JSONResponse(
        content={"genes": list(shared_genes_cache)},
        headers={"Access-Control-Allow-Origin": api_url}
    )

# New function to calculate graph theory metrics
def calculate_graph_metrics(graph_data):
    if not graph_data or not graph_data["nodes"] or not graph_data["links"]:
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
    num_edges = G.number_of_edges()

    density = nx.density(G)
    avg_clustering_coefficient = nx.average_clustering(G)

    degree_centralities = nx.degree_centrality(G)
    avg_degree_centrality = sum(degree_centralities.values()) / num_nodes if num_nodes > 0 else 0.0
    
    return {
        "density": density,
        "avg_clustering_coefficient": avg_clustering_coefficient,
        "avg_degree_centrality": avg_degree_centrality,
        "num_nodes": num_nodes,
        "num_edges": num_edges,
    }

@app.get("/comparative-analysis")
async def get_comparative_analysis(graph_index1: int = 0, graph_index2: int = 1):
    graph_data1 = original_graphs[graph_index1]
    graph_data2 = original_graphs[graph_index2]

    metrics1 = calculate_graph_metrics(graph_data1)
    metrics2 = calculate_graph_metrics(graph_data2)

    max_density = 1.0
    max_avg_clustering = 1.0
    max_avg_degree_centrality = 1.0

    normalized_metrics1 = [
        metrics1["density"] / max_density,
        metrics1["avg_clustering_coefficient"] / max_avg_clustering,
        metrics1["avg_degree_centrality"] / max_avg_degree_centrality,
    ]
    normalized_metrics2 = [
        metrics2["density"] / max_density,
        metrics2["avg_clustering_coefficient"] / max_avg_clustering,
        metrics2["avg_degree_centrality"] / max_avg_degree_centrality,
    ]
    
    separation_score = float(np.linalg.norm(np.array(normalized_metrics1) - np.array(normalized_metrics2)))

    return {
        "graph1_metrics": metrics1,
        "graph2_metrics": metrics2,
        "separation_score": separation_score,
        "normalized_metrics1": normalized_metrics1,
        "normalized_metrics2": normalized_metrics2,
        "metric_labels": ["Density", "Clustering Coefficient", "Degree Centrality"],
    }

@app.post("/expression-data/{graph_index}")
async def upload_expression_data(graph_index: int, payload: Dict[str, Dict[str, float]]):
    if graph_index not in [0, 1]:
        raise HTTPException(status_code=400, detail="Invalid graph index. Must be 0 or 1.")

    print(f"Received expression data for graph {graph_index}")
    expression_data_store[graph_index] = payload
    return {"message": f"Expression data for graph {graph_index} stored successfully."}

@app.get("/expression-data/{graph_index}")
async def get_expression_data(graph_index: int):
    if graph_index not in expression_data_store:
        raise HTTPException(status_code=404, detail="Expression data not found for this graph.")
    return expression_data_store[graph_index]

VALID_VIEWS = {"function", "pathway", "disease"}

@app.get("/annotate")
async def annotate(
    gene: str = Query(..., description="Gene symbol, e.g. TP53"),
    view: str = Query(..., description="One of: function, pathway, disease"),
    k: int = Query(5, ge=1, le=20, description="Number of passages to retrieve")
) -> dict:
    # 1) Validate inputs
    view = view.lower()
    if view not in VALID_VIEWS:
        raise HTTPException(400, f"Invalid view '{view}'. Choose from {', '.join(VALID_VIEWS)}.")

    # 1.5) Check if gene is indexed
    if gene.upper() not in indexed_genes:
        record_not_indexed_gene(gene)
        raise HTTPException(404, f"Gene '{gene}' is not indexed. Added to not_indexed_gene.txt.")

    # 2) For pathway view, use KEGG instead of vector search
        # 2) Retrieve the top-k passages for function or disease view
    passages = get_passages(gene=gene, context=view, k=k)
    if not passages:
        raise HTTPException(404, f"No {view} passages found for gene '{gene}'.")

    # 3) Build the MCP prompt
    prompt = build_prompt(gene=gene, view=view, passages=passages, extra={})

    # 4) Call the LLM
    try:
        summary = call_llm(prompt)
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")

    # 5) Return a structured response
    return {
        "gene": gene,
        "view": view,
        "retrieved_passages": passages,            # optional: remove if you don't want to expose it
        "summary": summary
    }

@app.post("/annotate_all_views")
async def annotate_all_views(gene: str = Body(..., embed=True), k: int = Query(5, ge=1, le=20)):
    """
    Given a gene, return all annotation types (function, disease, pathway) for that gene, using a persistent cache.
    """
    gene = gene.upper()
    cache = load_annotation_cache()
    gene_result = {"gene": gene}
    cache_updated = False
    if gene in cache and all(view in cache[gene] for view in ["function", "disease", "pathway"]):
        # Return cached result
        for view in ["function", "disease", "pathway"]:
            gene_result[view] = cache[gene][view]
        return gene_result
    # Otherwise, compute missing views and update cache
    cache.setdefault(gene, {})
    for view in ["function", "disease", "pathway"]:
        if view in cache[gene]:
            gene_result[view] = cache[gene][view]
            continue
        try:
            if gene.upper() not in indexed_genes:
                record_not_indexed_gene(gene)
                gene_result[view] = {"error": f"Gene '{gene}' is not indexed."}
                cache[gene][view] = gene_result[view]
                cache_updated = True
                continue
            passages = get_passages(gene=gene, context=view, k=k)
            if not passages:
                gene_result[view] = {"error": f"No {view} passages found for gene '{gene}'."}
                cache[gene][view] = gene_result[view]
                cache_updated = True
                continue
            prompt = build_prompt(gene=gene, view=view, passages=passages, extra={})
            summary = call_llm(prompt)
            gene_result[view] = {
                "gene": gene,
                "view": view,
                "retrieved_passages": passages,
                "summary": summary
            }
            cache[gene][view] = gene_result[view]
            cache_updated = True
        except Exception as e:
            gene_result[view] = {"error": str(e)}
            cache[gene][view] = gene_result[view]
            cache_updated = True
    if cache_updated:
        save_annotation_cache(cache)
    return gene_result

@app.post("/multi-annotate")
async def multi_annotate(genes: List[str] = Body(..., embed=True)):
    """
    Given a list of genes, aggregate their pathways and diseases, and use the LLM to score and summarize the most important pathways and disease for the set.
    """
    # 1. Aggregate pathways for the selected genes
    pathway_file = "data/chunks/pathway.jsonl"
    pathway_entries = []
    try:
        with open(pathway_file, "r") as f:
            for line in f:
                entry = json.loads(line)
                if entry["gene"] in genes and entry["type"] == "pathway":
                    pathway_entries.append(entry)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to read pathway data: {e}"})

    # 2. Aggregate diseases for the selected genes
    disease_file = "gene_data/general/appic_gene_data.tsv"
    disease_entries = []
    try:
        import pandas as pd
        df = pd.read_csv(disease_file, sep="\t")
        for gene in genes:
            gene_rows = df[df["gene"].str.upper() == gene.upper()]
            for _, row in gene_rows.iterrows():
                disease_entries.append({
                    "gene": row["gene"],
                    "disease": row["cancer"] if "cancer" in row else row.get("subtype", ""),
                    "subtype": row.get("subtype", "")
                })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to read disease data: {e}"})

    # 3. Prepare prompt for LLM
    pathway_texts = [f"{entry['gene']}: {entry['text']}" for entry in pathway_entries]
    disease_texts = [f"{entry['gene']}: {entry['disease']} ({entry['subtype']})" for entry in disease_entries]
    prompt = f"""
You are a genomics expert. Given the following genes: {', '.join(genes)}, and their associated pathways and diseases, analyze and rank the 3 important pathways that all (or most) genes in the set are involved in. For each, provide a confidence score between 0 and 1, and a brief description.

Pathway candidates:
{chr(10).join(pathway_texts) if pathway_texts else 'None'}

Disease candidates:
{chr(10).join(disease_texts) if disease_texts else 'None'}

Output JSON in the following format:
{{
  "pathways": [
    {{"name": "<Pathway Name>", "description": "<desc>", "confidence": <float>}},
    ...
  ],
  "disease": {{"name": "<Disease Name>", "description": "<desc>", "confidence": <float>}}
}}
"""
    try:
        llm_response = call_llm(prompt, system="You are a genomics expert.", model="gpt-4o-mini", temperature=0.2, max_tokens=600)
        # Try to parse the LLM's JSON output
        match = re.search(r'\{[\s\S]*\}', llm_response)
        if match:
            result_json = match.group(0)
            try:
                result = json.loads(result_json)
            except Exception:
                # Try ast.literal_eval as fallback
                result = ast.literal_eval(result_json)
            return result
        else:
            return {"error": "LLM did not return valid JSON.", "raw": llm_response}
    except Exception as e:
        return {"error": f"LLM error: {e}"}

@app.post("/chat")
async def chat_with_gene(request: ChatRequest) -> dict:
    """
    Chat with the AI about a specific gene, maintaining conversation context.
    """
    try:
        # Get relevant passages for the gene
        passages = get_passages(gene=request.gene, context="general", k=3)
        
        # Build a conversational prompt
        system_prompt = f"""You are a helpful genomics assistant specializing in gene analysis. 
        You have access to information about the gene {request.gene}. 
        Answer questions conversationally and naturally, as if in a chat interface.
        Use the provided passages to inform your responses, but also draw from your general knowledge.
        Keep responses concise but informative."""
        
        user_prompt = f"""Gene: {request.gene}

Available information:
{chr(10).join(passages) if passages else "Limited specific information available."}

Conversation history:
{request.conversation_history}

User: {request.message}

Please provide a helpful, conversational response about {request.gene} based on the user's question."""

        # Call the LLM
        response = call_llm(
            prompt=user_prompt,
            system=system_prompt,
            temperature=0.7,
            max_tokens=500
        )
        
        return {
            "gene": request.gene,
            "response": response,
            "conversation_history": request.conversation_history
        }
        
    except Exception as e:
        raise HTTPException(502, f"Chat error: {e}")

