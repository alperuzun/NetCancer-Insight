# services/prompts.py
import os

TEMPLATE_DIR = "services/prompts"

def build_prompt(gene: str, view: str, passages: list[str], extra: dict = None) -> str:
    """
    - view: one of "function", "disease", "pathway"
    - passages: list of text snippets
    - extra: optional dict for additional template variables (e.g. {"disease": "ovarian cancer"})
    """
    # 1) Load the template file
    path = os.path.join(TEMPLATE_DIR, f"{view}.txt")
    template = open(path).read()

    # 2) Prepare replacements
    joined = "\n\n".join(passages)
    data = {"gene": gene, "passages": joined}
    if extra:
        data.update(extra)

    # 3) Fill it in
    return template.format(**data)
