"""
Global application state: in-memory graph store and static gene databases.
Mutable per-upload data (graphs, caches, expression) is persisted via db.py.
"""
import os
from typing import Dict, Optional, Set

from file_utils import update_gene_data_dict, update_link_data_dict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CHUNKS_DIR = os.getenv(
    "JSONL_CHUNKS_DIR",
    os.path.join(os.path.dirname(BASE_DIR), "llm_data", "chunks"),
)
INDEXED_GENE_FILE = os.path.join(BASE_DIR, "indexed_gene.txt")

# ── In-memory graph store ─────────────────────────────────────────────────────
# Populated at startup from SQLite (via main.py lifespan) and kept in sync on
# every mutation so reads stay fast.
original_graphs = [{"nodes": [], "links": []}, {"nodes": [], "links": []}]
current_graphs  = [{"nodes": [], "links": []}, {"nodes": [], "links": []}]

graphlet_cache: Dict[str, dict] = {}
shared_genes_cache: Optional[Set[str]] = None

# ── Static gene & interaction databases ──────────────────────────────────────
# Loaded once at import time from the read-only gene_data/ files.
gene_info_db: dict        = {}
interaction_info_db: dict = {}
indexed_genes: Set[str]   = set()


def record_not_indexed_gene(gene: str) -> None:
    """Persist a failed gene lookup to the not_indexed_genes table."""
    import db  # local import avoids circular dependency at module load
    db.add_not_indexed_gene(gene)


# ── Database initialisation (runs once at import time) ───────────────────────

def _init() -> None:
    for data_dir in [
        os.path.join(BASE_DIR, "gene_data/annotations"),
        os.path.join(BASE_DIR, "gene_data/general"),
    ]:
        if not os.path.isdir(data_dir):
            continue
        for fname in os.listdir(data_dir):
            if fname.endswith(".csv"):
                update_gene_data_dict(gene_info_db, data_dir, fname)
            elif fname.endswith(".tsv"):
                update_gene_data_dict(gene_info_db, data_dir, fname, sep="\t")

    interaction_dir = os.path.join(BASE_DIR, "gene_data/interactions")
    if os.path.isdir(interaction_dir):
        for fname in os.listdir(interaction_dir):
            if fname.endswith((".csv", ".tsv")):
                update_link_data_dict(interaction_info_db, interaction_dir, fname)

    if os.path.exists(INDEXED_GENE_FILE):
        with open(INDEXED_GENE_FILE) as f:
            indexed_genes.update(line.strip().upper() for line in f if line.strip())
    else:
        print(f"Warning: {INDEXED_GENE_FILE} not found. No genes will be considered indexed.")


_init()
