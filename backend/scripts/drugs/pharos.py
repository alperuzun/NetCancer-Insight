"""
Pharos / IDG Target Development Level (TDL) client.

Endpoint: https://pharos.nih.gov/api/targets/{gene_symbol}
TDL labels (per the IDG project):
  Tclin  — has an approved drug with a known mechanism of action targeting it
  Tchem  — small molecules with potent activity but no approved drug
  Tbio   — well-studied biologically, no chemical probes
  Tdark  — minimally studied
"""
import json
import os
from typing import Optional

from scripts.drugs._http import http_get_json

PHAROS_ENDPOINT_TEMPLATE = os.getenv(
    "PHAROS_ENDPOINT_TEMPLATE",
    "https://pharos.nih.gov/api/targets/{gene}",
)
PHAROS_VERSION = "v1"

TDL_DESCRIPTIONS = {
    "Tclin": "drugs with FDA-approved mechanism of action target this gene",
    "Tchem": "small molecules with potent activity exist but no approved drug",
    "Tbio":  "well-studied biologically, lacks chemical probes",
    "Tdark": "minimally studied; little functional or chemical data",
}


def fetch_tdl(gene: str) -> Optional[str]:
    """
    Return the Target Development Level for a gene symbol, or None if Pharos
    has no entry. Returns None on transport errors as well; callers should
    treat None as "unknown" rather than "Tdark".
    """
    url = PHAROS_ENDPOINT_TEMPLATE.format(gene=gene.upper())
    body = http_get_json(url)
    if not isinstance(body, dict):
        return None
    tdl = body.get("tdl") or body.get("TDL")
    if not tdl:
        return None
    return str(tdl).strip()


def load_from_cache(gene: str, cache_dir: str) -> Optional[str]:
    path = os.path.join(cache_dir, f"{gene.upper()}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path) as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None
    if isinstance(data, dict):
        return data.get("tdl")
    return None


def save_to_cache(gene: str, tdl: Optional[str], cache_dir: str) -> None:
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, f"{gene.upper()}.json")
    try:
        with open(path, "w") as fh:
            json.dump({"tdl": tdl}, fh)
    except OSError:
        pass


def describe(tdl: Optional[str]) -> str:
    if not tdl:
        return "Target Development Level: unknown"
    return f"Target Development Level: {tdl} ({TDL_DESCRIPTIONS.get(tdl, 'see IDG documentation')})"
