"""
OPT-IN ChromaDB bulk loader.

Importing this module is fine; calling load_chunks_into_chromadb() is what
mutates the live index. The CLI gates this behind --load-chromadb so the
default ingestion run leaves the running app untouched.

When the user reaches Phase 2 of the roadmap (view restructure), they
opt-in here and the drug chunks become discoverable to retrieval under
the metadata key context="drug".
"""
import uuid
from typing import Iterable, List, Sequence


def load_chunks_into_chromadb(chunks: Sequence[dict]) -> int:
    """
    Add chunks to the existing ChromaDB collection used by the retriever.

    Metadata uses the existing `context` key (not `type`) so the chunks
    line up with how retriever.get_passages filters today. They will sit
    inert under context="drug" because no current view requests that
    context — but they are immediately discoverable once Phase 2 ships
    the new view mapping.

    Returns the number of documents added.
    """
    if not chunks:
        return 0

    # Lazy import so importing this module never triggers a ChromaDB client
    # connection (and so the unit tests don't need a live Chroma).
    from services.retriever import _get_collection, invalidate_bm25_cache

    docs: List[str] = []
    metas: List[dict] = []
    ids: List[str] = []

    for chunk in chunks:
        docs.append(chunk["text"])
        metas.append({
            "gene": chunk["gene"],
            "context": "drug",
            "source": chunk.get("source", "unknown"),
            "drug_concept_id": chunk.get("drug_concept_id", "") or "",
            "fda_approved": bool(chunk.get("fda_approved", False)),
        })
        ids.append(str(uuid.uuid4()))

    collection = _get_collection()
    collection.add(documents=docs, metadatas=metas, ids=ids)
    invalidate_bm25_cache()
    return len(docs)


def chunk_iter_from_jsonl(path: str) -> Iterable[dict]:
    """Yield chunks from a JSONL file — used by the CLI to load after writing."""
    import json
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue
