"""
Open Targets Platform GraphQL client.

Endpoint: https://api.platform.opentargets.org/api/v4/graphql
Docs:     https://platform-docs.opentargets.org/data-access/graphql-api

Requires Ensembl gene IDs (not HGNC symbols). Pair with symbol_mapping.
"""
import json
import os
from typing import Any, Dict, Optional

from scripts.drugs._http import http_post_json

OPENTARGETS_ENDPOINT = os.getenv(
    "OPENTARGETS_ENDPOINT",
    "https://api.platform.opentargets.org/api/v4/graphql",
)
OPENTARGETS_VERSION = "v4"

# Captured 2026-06. The `tractability` and `knownDrugs` shapes have changed
# multiple times across Open Targets releases — re-verify before bulk runs.
_QUERY = """
query GetTarget($ensemblId: String!) {
  target(ensemblId: $ensemblId) {
    id
    approvedSymbol
    tractability { modality value label }
    knownDrugs {
      count
      rows {
        drug { name maximumClinicalTrialPhase isApproved }
        disease { name }
        phase
        status
        mechanismOfAction
      }
    }
  }
}
"""


def fetch_target(ensembl_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch tractability + known drugs for a single Ensembl gene ID.

    Returns None on transport error; returns an empty dict if Open Targets
    has the ID but no payload (rare but possible for retired entries).
    """
    payload = {"query": _QUERY, "variables": {"ensemblId": ensembl_id}}
    body = http_post_json(OPENTARGETS_ENDPOINT, payload)
    if body is None:
        return None
    try:
        target = body["data"]["target"]
    except (KeyError, TypeError):
        return None
    return target or {}


def load_from_cache(ensembl_id: str, cache_dir: str) -> Optional[Dict[str, Any]]:
    path = os.path.join(cache_dir, f"{ensembl_id}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def save_to_cache(ensembl_id: str, payload: Dict[str, Any], cache_dir: str) -> None:
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, f"{ensembl_id}.json")
    try:
        with open(path, "w") as fh:
            json.dump(payload, fh)
    except OSError:
        pass


def summarise(target: Dict[str, Any]) -> Dict[str, Any]:
    """
    Distil a raw Open Targets payload into the fields used by chunks.py.

    Output keys:
      tractability:  list of {modality, value, label}
      max_phase:     int — highest clinical trial phase across known drugs
      known_drugs:   list of {name, phase, status, mechanism, disease}
    """
    tractability = target.get("tractability") or []
    known_drugs_rows = ((target.get("knownDrugs") or {}).get("rows")) or []

    distilled_drugs = []
    max_phase = 0
    for row in known_drugs_rows:
        drug = row.get("drug") or {}
        phase = int(row.get("phase") or 0)
        if phase > max_phase:
            max_phase = phase
        distilled_drugs.append({
            "name": (drug.get("name") or "").strip(),
            "phase": phase,
            "status": (row.get("status") or "").strip(),
            "mechanism": (row.get("mechanismOfAction") or "").strip(),
            "disease": ((row.get("disease") or {}).get("name") or "").strip(),
            "approved": bool(drug.get("isApproved")),
        })

    return {
        "tractability": [
            {
                "modality": (t.get("modality") or "").strip(),
                "value": t.get("value"),
                "label": (t.get("label") or "").strip(),
            }
            for t in tractability
        ],
        "max_phase": max_phase,
        "known_drugs": distilled_drugs,
    }
