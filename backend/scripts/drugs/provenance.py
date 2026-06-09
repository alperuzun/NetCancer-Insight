"""
Provenance tracker — writes a JSON manifest documenting which database
versions and filters were used in a given ingestion run.

This becomes a supplementary table in the paper: reviewers want to know
exactly which DGIdb / Open Targets / Pharos snapshot you queried.
"""
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_PROVENANCE_PATH = os.path.join(
    _BACKEND_DIR, "llm_data", "data_provenance.json"
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load(path: str = DEFAULT_PROVENANCE_PATH) -> Dict[str, Any]:
    """Return existing provenance JSON or an empty dict."""
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}


def record_drug_ingestion(
    *,
    genes_requested: int,
    genes_with_data: int,
    interactions_written: int,
    dgidb_endpoint: str,
    dgidb_version: str,
    opentargets_endpoint: str,
    opentargets_version: str,
    pharos_endpoint: str,
    pharos_version: str,
    min_interaction_score: float,
    output_path: str,
    path: str = DEFAULT_PROVENANCE_PATH,
) -> None:
    """Merge a new drug-ingestion run record into the provenance manifest."""
    existing = load(path)
    runs = existing.setdefault("drug_ingestion_runs", [])
    runs.append({
        "timestamp": _now_iso(),
        "genes_requested": genes_requested,
        "genes_with_data": genes_with_data,
        "chunks_written": interactions_written,
        "output_path": output_path,
        "sources": {
            "dgidb":        {"endpoint": dgidb_endpoint,       "version": dgidb_version},
            "opentargets":  {"endpoint": opentargets_endpoint, "version": opentargets_version},
            "pharos":       {"endpoint": pharos_endpoint,      "version": pharos_version},
        },
        "filters": {"min_interaction_score": min_interaction_score},
    })

    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(existing, fh, indent=2)
