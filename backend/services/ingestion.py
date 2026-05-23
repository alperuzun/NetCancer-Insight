"""
On-demand gene ingestion from UniProt.

When a gene is requested for annotation but is not yet in the local ChromaDB
index, fetch_and_index_gene() pulls its data from the UniProt REST API, chunks
the text, embeds the chunks into the local ChromaDB collection, and registers
the gene as indexed so subsequent requests hit the cache without another fetch.

This keeps the local index self-healing for any human gene with a UniProt entry.
"""
import json
import os
import urllib.request
import uuid
from typing import List, Optional

import state
from services.retriever import _get_collection, invalidate_bm25_cache

_UNIPROT_BASE = "https://rest.uniprot.org/uniprotkb/search"
_FIELDS = "accession,gene_names,protein_name,cc_function,cc_pathway,cc_disease,go"
_MAX_GO_TERMS = 25  # cap to avoid thousands of tiny GO chunks


def _fetch_uniprot(gene: str) -> Optional[dict]:
    """Return the first UniProt human entry for the gene symbol, or None."""
    url = (
        f"{_UNIPROT_BASE}"
        f"?query=gene_exact:{gene}+AND+organism_id:9606"
        f"&fields={_FIELDS}&format=json&size=1"
    )
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        results = data.get("results", [])
        return results[0] if results else None
    except Exception:
        return None


def _extract_items(entry: dict, gene: str) -> List[dict]:
    """
    Pull text from a UniProt entry and return a list of
    {text, context} dicts ready for chunking.
    context is one of: "function", "pathway", "disease".
    """
    items: List[dict] = []

    # Protein name as a brief function intro
    protein_desc = entry.get("proteinDescription", {})
    full_name = (
        protein_desc.get("recommendedName", {})
        .get("fullName", {})
        .get("value", "")
    )
    if full_name:
        items.append({"text": f"{gene} encodes {full_name}.", "context": "function"})

    # Free-text comments (FUNCTION, PATHWAY, DISEASE)
    for comment in entry.get("comments", []):
        ctype = comment.get("commentType", "").upper()
        texts = [t.get("value", "") for t in comment.get("texts", []) if t.get("value")]
        for text in texts:
            if ctype == "FUNCTION":
                items.append({"text": text, "context": "function"})
            elif ctype == "PATHWAY":
                items.append({"text": text, "context": "pathway"})
            elif ctype in ("DISEASE", "INVOLVEMENT IN DISEASE"):
                items.append({"text": text, "context": "disease"})

    # GO cross-references
    # GoTerm property value format: "<aspect_code>:<term label>"
    # P = Biological Process → pathway, F = Molecular Function → function
    go_count = 0
    for xref in entry.get("uniProtKBCrossReferences", []):
        if xref.get("database") != "GO" or go_count >= _MAX_GO_TERMS:
            continue
        props = {p["key"]: p["value"] for p in xref.get("properties", [])}
        go_term = props.get("GoTerm", "")
        if ":" not in go_term:
            continue
        aspect_code, term_label = go_term.split(":", 1)
        term_label = term_label.strip()
        if aspect_code == "P":
            items.append({"text": f"Biological process: {term_label}", "context": "pathway"})
            go_count += 1
        elif aspect_code == "F":
            items.append({"text": f"Molecular function: {term_label}", "context": "function"})
            go_count += 1

    return items


def _chunk(text: str, size: int = 300, overlap: int = 50) -> List[str]:
    """
    Split text into overlapping windows of ~size chars, preferring sentence
    boundaries.  Filters out chunks shorter than 20 chars.
    """
    if len(text) <= size:
        return [text] if len(text) > 20 else []
    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        segment = text[start:end]
        # Try to break at the last sentence boundary within the window
        if end < len(text):
            bp = segment.rfind(". ")
            if bp > size // 2:
                segment = segment[:bp + 1]
                end = start + bp + 1
        chunk = segment.strip()
        if len(chunk) > 20:
            chunks.append(chunk)
        start = end - overlap
    return chunks


def fetch_and_index_gene(gene: str) -> bool:
    """
    Fetch a gene's data from UniProt, chunk and embed it into ChromaDB,
    and register the gene as indexed in the local state.

    Returns True if data was found and indexed, False if UniProt returned
    no results (the gene is genuinely unknown or non-human).
    """
    gene = gene.upper().strip()

    entry = _fetch_uniprot(gene)
    if not entry:
        return False

    items = _extract_items(entry, gene)
    if not items:
        return False

    # Build flat lists for ChromaDB bulk add
    docs: List[str] = []
    metas: List[dict] = []
    ids: List[str] = []

    for item in items:
        for chunk in _chunk(item["text"]):
            docs.append(chunk)
            metas.append({
                "gene": gene,
                "context": item["context"],
                "source": "uniprot_live",
            })
            ids.append(str(uuid.uuid4()))

    if not docs:
        return False

    try:
        collection = _get_collection()
        collection.add(documents=docs, metadatas=metas, ids=ids)
    except Exception:
        return False

    # Register in memory so the current session doesn't re-fetch
    state.indexed_genes.add(gene)

    # Persist to indexed_gene.txt so future startups include this gene
    try:
        with open(state.INDEXED_GENE_FILE, "a") as fh:
            fh.write(f"{gene}\n")
    except Exception:
        pass  # In-memory registration is enough for this session

    # Rebuild BM25 on next retrieval — drop the stale in-memory index and pickle
    invalidate_bm25_cache()

    return True
