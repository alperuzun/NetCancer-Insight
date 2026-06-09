"""
DGIdb v5 GraphQL client.

Endpoint: https://dgidb.org/api/graphql
Docs:     https://www.dgidb.org/api

The GraphQL schema is subject to upstream change. If the script returns
empty results across the board, re-verify the query against the current
DGIdb schema before assuming the gene set has no drug data.
"""
import json
import os
from typing import Any, Dict, List, Optional

from scripts.drugs._http import http_post_json

DGIDB_ENDPOINT = os.getenv("DGIDB_ENDPOINT", "https://dgidb.org/api/graphql")
DGIDB_VERSION = "v5"

# Captured 2026-06. If DGIdb changes its schema, edit this query first.
_QUERY = """
query GetInteractions($genes: [String!]!) {
  genes(names: $genes) {
    nodes {
      name
      conceptId
      interactions {
        drug { name conceptId approved }
        interactionTypes { type directionality }
        interactionScore
        sources { sourceDbName }
        publications { pmid }
      }
    }
  }
}
"""


def fetch_interactions(gene: str) -> Optional[List[Dict[str, Any]]]:
    """
    Fetch drug-gene interactions for a single gene symbol.

    Returns:
        - list of interaction dicts (possibly empty) on success
        - None on network/decode error so the caller can distinguish
          "no drugs known" from "failed to fetch"
    """
    payload = {"query": _QUERY, "variables": {"genes": [gene.upper()]}}
    body = http_post_json(DGIDB_ENDPOINT, payload)
    if body is None:
        return None
    try:
        nodes = body["data"]["genes"]["nodes"]
    except (KeyError, TypeError):
        return None
    if not nodes:
        return []
    return nodes[0].get("interactions", []) or []


def load_from_cache(gene: str, cache_dir: str) -> Optional[List[Dict[str, Any]]]:
    """Load a previously-saved raw response from disk."""
    path = os.path.join(cache_dir, f"{gene.upper()}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def save_to_cache(gene: str, interactions: List[Dict[str, Any]], cache_dir: str) -> None:
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, f"{gene.upper()}.json")
    try:
        with open(path, "w") as fh:
            json.dump(interactions, fh)
    except OSError:
        pass


def normalise_interaction(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Reduce a raw DGIdb interaction dict to the shape used downstream.

    Defensive: every field has a default so format_chunks never sees KeyError.
    """
    drug = raw.get("drug") or {}
    sources = raw.get("sources") or []
    publications = raw.get("publications") or []
    interaction_types = raw.get("interactionTypes") or []

    mechanism = ", ".join(
        sorted({(it.get("type") or "").strip() for it in interaction_types if it.get("type")})
    ) or "unspecified mechanism"

    return {
        "drug_name": (drug.get("name") or "").strip(),
        "drug_concept_id": drug.get("conceptId") or "",
        "approved": bool(drug.get("approved")),
        "mechanism": mechanism,
        "score": float(raw.get("interactionScore") or 0.0),
        "sources": sorted({(s.get("sourceDbName") or "").strip() for s in sources if s.get("sourceDbName")}),
        "pmids": sorted({str(p.get("pmid")) for p in publications if p.get("pmid")}),
    }
