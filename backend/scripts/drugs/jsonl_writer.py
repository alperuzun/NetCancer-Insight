"""
Append-only JSONL writer for drug chunks, plus an idempotency tracker that
records which genes have already been written so re-runs can skip them.
"""
import json
import os
from typing import Iterable, List, Set


def write_chunks(path: str, chunks: Iterable[dict]) -> int:
    """Append chunks to the JSONL output file. Returns the count written."""
    if not chunks:
        return 0
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    written = 0
    with open(path, "a") as fh:
        for chunk in chunks:
            fh.write(json.dumps(chunk) + "\n")
            written += 1
    return written


def load_completed_genes(tracker_path: str) -> Set[str]:
    """Read the set of genes already ingested (one symbol per line)."""
    if not os.path.exists(tracker_path):
        return set()
    completed: Set[str] = set()
    with open(tracker_path) as fh:
        for line in fh:
            symbol = line.strip().upper()
            if symbol:
                completed.add(symbol)
    return completed


def mark_completed(tracker_path: str, gene: str) -> None:
    """Append a gene symbol to the tracker file (idempotency guard)."""
    os.makedirs(os.path.dirname(os.path.abspath(tracker_path)), exist_ok=True)
    with open(tracker_path, "a") as fh:
        fh.write(f"{gene.upper()}\n")


def validate_chunk(chunk: dict) -> List[str]:
    """
    Return a list of validation errors. Empty list means the chunk is valid.
    Used as a defensive guard before writing — never lose user data to a
    silent schema regression.
    """
    errors: List[str] = []
    if not isinstance(chunk, dict):
        return ["not a dict"]
    if not chunk.get("gene"):
        errors.append("missing 'gene'")
    if chunk.get("type") != "drug":
        errors.append("'type' must be 'drug'")
    if not chunk.get("source"):
        errors.append("missing 'source'")
    text = chunk.get("text") or ""
    if not isinstance(text, str) or len(text) < 30:
        errors.append("'text' too short (<30 chars)")
    if isinstance(text, str) and len(text) > 1200:
        errors.append("'text' too long (>1200 chars)")
    return errors
