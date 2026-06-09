"""
HGNC symbol → Ensembl gene ID resolution for the Open Targets API.

Expects a TSV at backend/llm_data/reference/hgnc_to_ensembl.tsv with two
columns: hgnc_symbol, ensembl_gene_id (tab separated, with header).
Download from https://www.genenames.org/download/custom/ — record the
download date in data_provenance.json.
"""
import os
from typing import Dict, Optional

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_MAPPING_PATH = os.path.join(
    _BACKEND_DIR, "llm_data", "reference", "hgnc_to_ensembl.tsv"
)


def load_mapping(path: Optional[str] = None) -> Dict[str, str]:
    """
    Load the HGNC→Ensembl TSV into a dict keyed by upper-case symbol.
    Returns an empty dict (rather than raising) when the file is absent —
    callers should treat missing mapping as "skip Open Targets for this run".
    """
    src = path or DEFAULT_MAPPING_PATH
    if not os.path.exists(src):
        return {}
    mapping: Dict[str, str] = {}
    with open(src) as fh:
        header_skipped = False
        for line in fh:
            if not header_skipped:
                header_skipped = True
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 2:
                continue
            symbol, ensembl = parts[0].strip().upper(), parts[1].strip()
            if symbol and ensembl:
                mapping[symbol] = ensembl
    return mapping


def resolve(gene: str, mapping: Dict[str, str]) -> Optional[str]:
    """Return the Ensembl gene ID for an HGNC symbol, or None if unmapped."""
    return mapping.get(gene.upper())
