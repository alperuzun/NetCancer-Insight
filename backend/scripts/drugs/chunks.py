"""
Chunk text construction.

Produces JSONL records in the same {gene, type, source, text} schema as
llm_data/chunks/{function,pathway,disease}.jsonl, where type="drug".

Granularity rule: one chunk per (gene, drug) interaction — NOT one
mega-chunk per gene. This keeps BM25 + dense embeddings discriminative.
"""
from typing import Any, Dict, List, Optional

from scripts.drugs import pharos

# Constants tuned to keep chunks comparable to existing function/pathway sizes
MIN_INTERACTION_SCORE = 0.5      # DGIdb interactions below this are dropped unless approved
MIN_CHUNK_CHARS = 30
MAX_CHUNK_CHARS = 1000


def _trim(text: str, limit: int = MAX_CHUNK_CHARS) -> str:
    text = " ".join(text.split())  # collapse whitespace
    if len(text) <= limit:
        return text
    cut = text[:limit]
    bp = cut.rfind(". ")
    return (cut[: bp + 1] if bp > limit // 2 else cut).rstrip()


def _dgidb_chunk(gene: str, interaction: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Build one chunk for a single DGIdb drug-gene interaction."""
    drug_name = interaction["drug_name"]
    if not drug_name or drug_name.lower() == "unknown":
        return None

    score = interaction["score"]
    approved = interaction["approved"]
    if score < MIN_INTERACTION_SCORE and not approved:
        return None

    status_phrase = "FDA-approved" if approved else "investigational"
    sources_phrase = ", ".join(interaction["sources"]) or "DGIdb-aggregated sources"
    pubs_phrase = ""
    if interaction["pmids"]:
        first_pmid = interaction["pmids"][0]
        pubs_phrase = f" Supported by {len(interaction['pmids'])} publications including PMID:{first_pmid}."

    text = (
        f"{gene} is targeted by {drug_name} "
        f"({interaction['mechanism']}, {status_phrase}). "
        f"Interaction evidence: {sources_phrase}. "
        f"Confidence score: {score:.2f}.{pubs_phrase}"
    )
    text = _trim(text)
    if len(text) < MIN_CHUNK_CHARS:
        return None

    return {
        "gene": gene,
        "type": "drug",
        "source": "DGIdb",
        "text": text,
        "drug_concept_id": interaction["drug_concept_id"],
        "fda_approved": approved,
    }


def _opentargets_chunk(gene: str, summary: Dict[str, Any], tdl: Optional[str]) -> Optional[Dict[str, Any]]:
    """Build one chunk summarising tractability + TDL for the gene."""
    parts: List[str] = []

    tract_by_modality: Dict[str, List[str]] = {}
    for t in summary["tractability"]:
        if t["value"] is True or (isinstance(t["value"], (int, float)) and t["value"] >= 1):
            tract_by_modality.setdefault(t["modality"] or "other", []).append(
                t["label"] or "tractable"
            )

    if tract_by_modality:
        modality_phrases = [
            f"{modality.lower()}: {', '.join(sorted(set(labels)))}"
            for modality, labels in sorted(tract_by_modality.items())
        ]
        parts.append(f"{gene} druggability assessment — " + "; ".join(modality_phrases) + ".")
    elif summary["tractability"]:
        parts.append(f"{gene} has been assessed for druggability with no tractable modalities flagged.")

    if summary["max_phase"] > 0:
        parts.append(
            f"Highest clinical trial phase reached by any known drug targeting {gene}: phase {summary['max_phase']}."
        )

    parts.append(pharos.describe(tdl) + ".")

    text = _trim(" ".join(parts))
    if len(text) < MIN_CHUNK_CHARS:
        return None

    return {
        "gene": gene,
        "type": "drug",
        "source": "OpenTargets+Pharos",
        "text": text,
        "drug_concept_id": "",
        "fda_approved": False,
    }


def _opentargets_known_drug_chunk(gene: str, drug: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """One chunk per known-drug row from Open Targets (when DGIdb missed it)."""
    name = drug["name"]
    if not name:
        return None
    status_phrase = "FDA-approved" if drug["approved"] else f"clinical phase {drug['phase']}"
    mechanism = drug["mechanism"] or "mechanism not specified"
    disease_phrase = f" Indication: {drug['disease']}." if drug["disease"] else ""
    text = _trim(
        f"{gene} is targeted by {name} ({mechanism}, {status_phrase})."
        f"{disease_phrase} Source: Open Targets known-drugs catalogue."
    )
    if len(text) < MIN_CHUNK_CHARS:
        return None
    return {
        "gene": gene,
        "type": "drug",
        "source": "OpenTargets",
        "text": text,
        "drug_concept_id": "",
        "fda_approved": drug["approved"],
    }


def format_chunks(
    gene: str,
    dgidb_interactions: Optional[List[Dict[str, Any]]],
    opentargets_summary: Optional[Dict[str, Any]],
    tdl: Optional[str],
) -> List[Dict[str, Any]]:
    """
    Compose the full set of chunks for one gene across the three sources.

    Behaviour when sources are missing:
      - If only the tractability/TDL summary exists (no DGIdb interactions),
        we still emit one chunk so the gene is searchable.
      - If literally nothing is known (all three sources empty), returns [].
    """
    chunks: List[Dict[str, Any]] = []
    seen_drug_keys = set()

    for raw in (dgidb_interactions or []):
        chunk = _dgidb_chunk(gene, raw)
        if not chunk:
            continue
        key = (chunk["drug_concept_id"] or chunk["text"][:60]).lower()
        if key in seen_drug_keys:
            continue
        seen_drug_keys.add(key)
        chunks.append(chunk)

    if opentargets_summary is not None:
        summary_chunk = _opentargets_chunk(gene, opentargets_summary, tdl)
        if summary_chunk:
            chunks.append(summary_chunk)

        for drug in opentargets_summary.get("known_drugs", []):
            chunk = _opentargets_known_drug_chunk(gene, drug)
            if not chunk:
                continue
            key = chunk["text"][:60].lower()
            if key in seen_drug_keys:
                continue
            seen_drug_keys.add(key)
            chunks.append(chunk)
    elif tdl:
        # No Open Targets data but we have a TDL — emit a minimal chunk.
        text = _trim(f"{gene}: {pharos.describe(tdl)}.")
        if len(text) >= MIN_CHUNK_CHARS:
            chunks.append({
                "gene": gene,
                "type": "drug",
                "source": "Pharos",
                "text": text,
                "drug_concept_id": "",
                "fda_approved": False,
            })

    return chunks
