"""
Hybrid retrieval: ChromaDB (dense vector) + BM25 (sparse keyword), merged via
Reciprocal Rank Fusion (RRF).

Environment variables
---------------------
CHROMA_DIR       Local path for PersistentClient (default: <project_root>/llm_data/chroma)
CHROMA_HOST      Hostname for HttpClient; when set, uses HTTP instead of local files
CHROMA_PORT      Port for HttpClient (default: 8001)
EMBEDDING_MODEL  sentence-transformers model name (default: all-MiniLM-L6-v2)
JSONL_CHUNKS_DIR Fallback JSONL directory for get_jsonl_contexts_for_gene
BM25_CACHE_PATH  Path to persist the BM25 index (default: <chroma_dir>/bm25_index.pkl)
"""
import glob
import json
import os
import re
from functools import lru_cache
from typing import List, Optional

import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from rank_bm25 import BM25Okapi

# ── Config ────────────────────────────────────────────────────────────────────

_THIS_FILE = os.path.abspath(__file__)
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_THIS_FILE)))

CHROMA_DIR = os.getenv("CHROMA_DIR", os.path.join(_PROJECT_ROOT, "llm_data", "chroma"))
CHROMA_HOST = os.getenv("CHROMA_HOST", "")
CHROMA_PORT = int(os.getenv("CHROMA_PORT", "8001"))
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
COLLECTION_NAME = "gene-chunks"
RRF_K = 60  # Cormack et al. 2009 default

CHUNKS_DIR = os.getenv(
    "JSONL_CHUNKS_DIR",
    os.path.join(_PROJECT_ROOT, "llm_data", "chunks"),
)
BM25_CACHE_PATH = os.getenv(
    "BM25_CACHE_PATH",
    os.path.join(CHROMA_DIR, "bm25_index.json"),
)


# ── ChromaDB client + collection ─────────────────────────────────────────────

@lru_cache(maxsize=1)
def _get_collection():
    ef = SentenceTransformerEmbeddingFunction(model_name=EMBEDDING_MODEL_NAME)
    if CHROMA_HOST:
        client = chromadb.HttpClient(host=CHROMA_HOST, port=CHROMA_PORT)
    else:
        client = chromadb.PersistentClient(path=CHROMA_DIR)
    return client.get_collection(name=COLLECTION_NAME, embedding_function=ef)


# ── BM25 corpus — built from ChromaDB, persisted to disk ─────────────────────

@lru_cache(maxsize=1)
def _build_bm25():
    """
    Load or build a BM25Okapi index over every document in ChromaDB.

    On first run the index is built from ChromaDB and pickled to BM25_CACHE_PATH.
    On subsequent startups the pickle is loaded directly, skipping the O(N) build.
    """
    collection = _get_collection()

    # Try to load from disk first (JSON cache — no pickle, no arbitrary code execution)
    if os.path.exists(BM25_CACHE_PATH):
        try:
            with open(BM25_CACHE_PATH) as fh:
                cached = json.load(fh)
            if cached.get("count") == collection.count():
                bm25 = BM25Okapi(cached["tokenized"])
                return bm25, cached["ids"], cached["docs"], cached["metas"]
        except Exception:
            pass  # Corrupt cache — rebuild below

    result = collection.get(include=["documents", "metadatas"])
    all_ids: List[str] = result["ids"]
    all_docs: List[str] = result["documents"]
    all_metas: List[dict] = result["metadatas"]
    tokenized = [_tokenize(d) for d in all_docs]
    bm25 = BM25Okapi(tokenized)

    # Persist so future startups skip the ChromaDB fetch + tokenize step
    try:
        os.makedirs(os.path.dirname(BM25_CACHE_PATH), exist_ok=True)
        with open(BM25_CACHE_PATH, "w") as fh:
            json.dump(
                {"ids": all_ids, "docs": all_docs, "metas": all_metas,
                 "tokenized": tokenized, "count": collection.count()},
                fh,
            )
    except Exception:
        pass  # Non-fatal — the in-memory index is still valid

    return bm25, all_ids, all_docs, all_metas


# ── Cache management ─────────────────────────────────────────────────────────

def invalidate_bm25_cache() -> None:
    """
    Drop the in-memory BM25 index and delete the on-disk JSON cache.
    Call after adding new documents to ChromaDB so the next retrieval
    rebuilds the index with the new data included.
    """
    _build_bm25.cache_clear()
    for path in (BM25_CACHE_PATH, BM25_CACHE_PATH.replace(".json", ".pkl")):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tokenize(text: str) -> List[str]:
    return re.findall(r"\b[a-zA-Z0-9]+\b", text.lower())


def _rrf_merge(ranked_lists: List[List[str]], k: int = RRF_K) -> List[str]:
    """Reciprocal Rank Fusion over multiple ranked document-ID lists."""
    scores: dict = {}
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.keys(), key=lambda d: -scores[d])


# ── Public API ────────────────────────────────────────────────────────────────

@lru_cache(maxsize=256)
def get_jsonl_contexts_for_gene(
    gene: str,
    context: Optional[str] = None,
    max_entries_per_type: int = 2,
) -> List[dict]:
    """Direct JSONL scan — used for chat context and as a ChromaDB fallback."""
    gene = gene.upper().strip()
    context = context.lower().strip() if context else None
    entries: List[dict] = []

    for filepath in sorted(glob.glob(os.path.join(CHUNKS_DIR, "*.jsonl"))):
        entry_count = 0
        with open(filepath, "r") as f:
            for line in f:
                try:
                    meta = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if meta.get("gene", "").upper() != gene:
                    continue
                if context and meta.get("type", "").lower() != context:
                    continue
                entries.append(meta)
                entry_count += 1
                if entry_count >= max_entries_per_type:
                    break

    return entries


def get_passages(gene: str, context: str, k: int = 5) -> List[str]:
    """
    Hybrid retrieval via vector search (ChromaDB) + BM25, merged with RRF.
    Falls back to raw JSONL scan if ChromaDB is unavailable.
    """
    gene = gene.upper()
    context = context.lower()
    query_text = f"{context} of {gene}"
    n_candidates = max(k * 4, 20)

    try:
        collection = _get_collection()
        bm25, all_ids, all_docs, all_metas = _build_bm25()

        # ── Dense vector search ───────────────────────────────────────────────
        n_query = min(n_candidates, collection.count())
        vec_results = collection.query(
            query_texts=[query_text],
            n_results=max(1, n_query),
            include=["documents", "metadatas"],
        )
        vec_ids: List[str] = vec_results["ids"][0]

        # ── BM25 sparse search ────────────────────────────────────────────────
        bm25_scores = bm25.get_scores(_tokenize(query_text))
        bm25_ranked_indices = sorted(range(len(all_ids)), key=lambda i: -bm25_scores[i])
        bm25_ids = [all_ids[i] for i in bm25_ranked_indices[:n_candidates]]

        # ── RRF merge ─────────────────────────────────────────────────────────
        merged_ids = _rrf_merge([vec_ids, bm25_ids])

        # Build lookup: id → (text, meta)
        id_to_entry = {
            doc_id: (all_docs[i], all_metas[i])
            for i, doc_id in enumerate(all_ids)
        }

        snippets: List[str] = []
        seen: set = set()

        def _try_add(text: str) -> bool:
            if text and text not in seen:
                snippets.append(text)
                seen.add(text)
                return True
            return False

        # Pass 1: strict gene + context match
        for doc_id in merged_ids:
            if len(snippets) >= k:
                break
            doc, meta = id_to_entry.get(doc_id, (None, None))
            if doc is None:
                continue
            if meta.get("gene", "").upper() != gene:
                continue
            if meta.get("context", "").lower() != context:
                continue
            _try_add(doc)

        # Pass 2: relax context — same gene, any context
        if len(snippets) < k:
            for doc_id in merged_ids:
                if len(snippets) >= k:
                    break
                doc, meta = id_to_entry.get(doc_id, (None, None))
                if doc is None:
                    continue
                if meta.get("gene", "").upper() != gene:
                    continue
                _try_add(doc)

        # Pass 3: fully relaxed — any passage from merged ranking
        if len(snippets) < k:
            for doc_id in merged_ids:
                if len(snippets) >= k:
                    break
                doc, _ = id_to_entry.get(doc_id, (None, None))
                if doc is not None:
                    _try_add(doc)

        return snippets

    except Exception:
        # Graceful fallback: scan JSONL files directly
        entries = get_jsonl_contexts_for_gene(gene, context, max_entries_per_type=k)
        return [e.get("text", "") for e in entries if e.get("text")]


def get_passages_unified(gene: str, k: int = 12) -> List[str]:
    """
    Hybrid retrieval without view filtering.

    Queries with a general "gene function pathways disease" prompt so dense
    search covers all annotation aspects in a single call.  Keeps only passages
    for the requested gene (strict pass), then falls back to any passage if
    needed.  Used by the unified annotation flow to power one LLM call instead
    of three.
    """
    gene = gene.upper()
    query_text = f"function pathways disease associations of {gene}"
    n_candidates = max(k * 4, 20)

    try:
        collection = _get_collection()
        bm25, all_ids, all_docs, all_metas = _build_bm25()

        n_query = min(n_candidates, collection.count())
        vec_results = collection.query(
            query_texts=[query_text],
            n_results=max(1, n_query),
            include=["documents", "metadatas"],
        )
        vec_ids: List[str] = vec_results["ids"][0]

        bm25_scores = bm25.get_scores(_tokenize(query_text))
        bm25_ranked_indices = sorted(range(len(all_ids)), key=lambda i: -bm25_scores[i])
        bm25_ids = [all_ids[i] for i in bm25_ranked_indices[:n_candidates]]

        merged_ids = _rrf_merge([vec_ids, bm25_ids])

        id_to_entry = {
            doc_id: (all_docs[i], all_metas[i])
            for i, doc_id in enumerate(all_ids)
        }

        snippets: List[str] = []
        seen: set = set()

        def _try_add(text: str) -> bool:
            if text and text not in seen:
                snippets.append(text)
                seen.add(text)
                return True
            return False

        # Pass 1: same gene, any context
        for doc_id in merged_ids:
            if len(snippets) >= k:
                break
            doc, meta = id_to_entry.get(doc_id, (None, None))
            if doc is None:
                continue
            if meta.get("gene", "").upper() != gene:
                continue
            _try_add(doc)

        # Pass 2: any passage from merged ranking
        if len(snippets) < k:
            for doc_id in merged_ids:
                if len(snippets) >= k:
                    break
                doc, _ = id_to_entry.get(doc_id, (None, None))
                if doc is not None:
                    _try_add(doc)

        return snippets

    except Exception:
        entries = get_jsonl_contexts_for_gene(gene, max_entries_per_type=k)
        return [e.get("text", "") for e in entries if e.get("text")]
