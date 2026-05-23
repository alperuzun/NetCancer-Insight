import os
from typing import Dict, List, Optional

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "prompts")


def build_prompt(gene: str, view: str, passages: List[str], extra: Optional[Dict] = None) -> str:
    """Build an LLM prompt for the given gene and view using a view-specific text template."""
    path = os.path.join(TEMPLATE_DIR, f"{view}.txt")
    with open(path) as f:
        template = f.read()

    data: Dict = {"gene": gene, "passages": "\n\n".join(passages)}
    if extra:
        data.update(extra)
    return template.format(**data)


def build_unified_prompt(gene: str, passages: List[str], topology_context: str = "") -> str:
    """
    Build a single structured prompt that returns JSON covering function, pathways, and disease.
    Optionally injects topology_context as a network role section.
    """
    path = os.path.join(TEMPLATE_DIR, "annotation.txt")
    with open(path) as f:
        template = f.read()

    topology_section = (
        f"\n[Network topology — see below]\n{topology_context}\n"
        if topology_context.strip()
        else ""
    )
    return template.format(
        gene=gene,
        passages="\n\n".join(passages),
        topology_section=topology_section,
    )
