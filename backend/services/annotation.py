"""
Annotation service: gene-level RAG summaries for function, pathway, and disease views.

The primary path is annotate_all_views_unified() which:
  1. Fetches up to 12 passages with no view filter (one retrieval call).
  2. Optionally injects topology context from the user's loaded graph.
  3. Makes a single LLM call returning structured JSON {function, pathways, disease}.

The older per-view annotate() / annotate_all_views() are preserved for the MCP
tool registry and the single-view /annotate endpoint.
"""
import json
import os
import re
import ast
from typing import List, Optional

import pandas as pd

import db
import state
from models import AnnotateToolInput, AnnotateAllViewsInput, MultiAnnotateInput, ToolExecutionError
from services.retriever import get_passages, get_passages_unified, get_jsonl_contexts_for_gene
from services.prompts import build_prompt, build_unified_prompt
from services.llm import call_llm, LLMNotConfiguredError
from services.topology import build_topology_context

VALID_VIEWS = {"function", "pathway", "disease"}


def _normalize_gene(gene: str) -> str:
    return gene.strip().upper()


def _ensure_gene_is_indexed(gene: str) -> str:
    normalized = _normalize_gene(gene)
    if normalized not in state.indexed_genes:
        from services.ingestion import fetch_and_index_gene
        if not fetch_and_index_gene(normalized):
            state.record_not_indexed_gene(normalized)
            raise ToolExecutionError(
                f"Gene '{gene}' is not indexed and no UniProt entry was found.",
                status_code=404,
            )
    return normalized


def _format_jsonl_entries(entries: List[dict], max_chars: int = 350) -> str:
    blocks = []
    for entry in entries:
        text = entry.get("text", "").strip()
        if len(text) > max_chars:
            text = text[:max_chars].rsplit(".", 1)[0] + "."
        blocks.append(f"{entry.get('type', 'general').capitalize()} ({entry.get('source', 'unknown')}): {text}")
    return "\n".join(blocks)


def _create_gene_summary(gene: str, entries: List[dict]) -> str:
    if not entries:
        return ""
    prompt = f"""You are a concise genomics summarization assistant.
Summarize the information provided for the gene {gene} into a short, token-efficient summary.
Keep the summary focused on the gene's function, pathways, and disease associations where available.
Do not repeat details and keep it readable in no more than 120 words.

Context:
{_format_jsonl_entries(entries)}

Summary:"""
    return call_llm(prompt=prompt, system="You are a concise genomics assistant.", temperature=0.2, max_tokens=180)


def generate_gene_summary_background(gene: str, entries: List[dict]) -> None:
    try:
        summary = _create_gene_summary(gene, entries)
        if summary:
            db.save_gene_summary(gene, summary)
    except Exception:
        pass


def annotate(gene: str, view: str, k: int) -> dict:
    view = view.lower()
    if view not in VALID_VIEWS:
        raise ToolExecutionError(
            f"Invalid view '{view}'. Choose from {', '.join(VALID_VIEWS)}.", status_code=400
        )
    normalized_gene = _ensure_gene_is_indexed(gene)
    passages = get_passages(gene=normalized_gene, context=view, k=k)
    if not passages:
        raise ToolExecutionError(
            f"No {view} passages found for gene '{normalized_gene}'.", status_code=404
        )
    prompt = build_prompt(gene=normalized_gene, view=view, passages=passages, extra={})
    try:
        summary = call_llm(prompt)
    except LLMNotConfiguredError as exc:
        raise ToolExecutionError(str(exc), status_code=503) from exc
    except Exception as exc:
        raise ToolExecutionError(f"LLM error: {exc}", status_code=502) from exc
    return {"gene": normalized_gene, "view": view, "retrieved_passages": passages, "summary": summary}


def annotate_all_views_unified(gene: str, k: int = 12, graph_index: int = -1) -> dict:
    """
    Single-retrieval, single-LLM-call annotation covering all three views.

    Args:
        gene:        Gene symbol.
        k:           Number of passages to retrieve (default 12).
        graph_index: Index of the loaded graph to pull topology features from.
                     Use -1 (default) to skip topology injection.
    Returns:
        dict with keys: gene, function, pathway, disease — each a summary string or
        {"error": "..."} on failure.
    """
    normalized_gene = _normalize_gene(gene)
    try:
        normalized_gene = _ensure_gene_is_indexed(normalized_gene)
    except ToolExecutionError as exc:
        err = {"error": str(exc)}
        return {"gene": normalized_gene, "function": err, "pathway": err, "disease": err}

    cached = db.get_all_annotations_for_gene(normalized_gene, graph_index)
    if all(view in cached for view in VALID_VIEWS):
        return {"gene": normalized_gene, **{view: cached[view] for view in VALID_VIEWS}}

    passages = get_passages_unified(normalized_gene, k=k)
    if not passages:
        err = {"error": f"No passages found for gene '{normalized_gene}'."}
        return {"gene": normalized_gene, "function": err, "pathway": err, "disease": err}

    topology_context = ""
    if graph_index >= 0:
        topology_context = build_topology_context(normalized_gene, graph_index)

    prompt = build_unified_prompt(normalized_gene, passages, topology_context)

    try:
        raw = call_llm(prompt, max_tokens=1024)
    except LLMNotConfiguredError as exc:
        err = {"error": str(exc)}
        return {"gene": normalized_gene, "function": err, "pathway": err, "disease": err}
    except Exception as exc:
        err = {"error": f"LLM error: {exc}"}
        return {"gene": normalized_gene, "function": err, "pathway": err, "disease": err}

    # Extract JSON — try direct parse first, then regex extraction
    parsed: Optional[dict] = None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except Exception:
                pass

    if parsed is None:
        err = {"error": "LLM did not return valid JSON."}
        return {"gene": normalized_gene, "function": err, "pathway": err, "disease": err}

    def _wrap(view: str) -> dict:
        text = parsed.get(view) or parsed.get({"pathway": "pathways"}.get(view, view), "")
        if not text:
            return {"error": f"No {view} in LLM response."}
        return {"gene": normalized_gene, "view": view, "summary": str(text)}

    result = {
        "gene": normalized_gene,
        "function": _wrap("function"),
        "pathway": _wrap("pathway") if "pathway" in parsed else _wrap("pathways"),
        "disease": _wrap("disease"),
    }

    for view in VALID_VIEWS:
        if view in result and "summary" in result[view]:
            db.save_annotation(normalized_gene, view, result[view], graph_index)

    return result


def annotate_all_views(gene: str, k: int, graph_index: int = -1) -> dict:
    """
    Annotate all three views.  Delegates to the unified single-call path when
    all views are missing from cache; falls back to per-view calls only when
    the unified path fails (e.g. LLM returns malformed JSON).
    """
    normalized_gene = _normalize_gene(gene)
    try:
        normalized_gene = _ensure_gene_is_indexed(normalized_gene)
    except ToolExecutionError as exc:
        return {"gene": normalized_gene, **{view: {"error": str(exc)} for view in VALID_VIEWS}}

    cached = db.get_all_annotations_for_gene(normalized_gene, graph_index)
    if all(view in cached for view in VALID_VIEWS):
        return {"gene": normalized_gene, **{view: cached[view] for view in VALID_VIEWS}}

    # Use unified path for any gene that has at least one view missing
    unified = annotate_all_views_unified(normalized_gene, k=max(k, 12), graph_index=graph_index)

    # Per-view fallback only for views that came back with errors from the unified path
    result = {"gene": normalized_gene}
    for view in VALID_VIEWS:
        if view in cached:
            result[view] = cached[view]
        elif unified.get(view, {}).get("error"):
            try:
                result[view] = annotate(normalized_gene, view, k)
            except ToolExecutionError as exc:
                result[view] = {"error": str(exc)}
            db.save_annotation(normalized_gene, view, result[view], graph_index)
        else:
            result[view] = unified[view]

    return result


def multi_annotate(genes: List[str]) -> dict:
    if not genes:
        raise ToolExecutionError("At least one gene must be provided.", status_code=400)

    pathway_file = os.path.join(state.CHUNKS_DIR, "pathway.jsonl")
    pathway_entries = []
    try:
        with open(pathway_file) as f:
            for line in f:
                entry = json.loads(line)
                if entry["gene"] in genes and entry["type"] == "pathway":
                    pathway_entries.append(entry)
    except Exception as exc:
        raise ToolExecutionError(f"Failed to read pathway data: {exc}", status_code=500) from exc

    disease_file = os.path.join(state.BASE_DIR, "gene_data/general/appic_gene_data.tsv")
    disease_entries = []
    try:
        df = pd.read_csv(disease_file, sep="\t")
        for gene in genes:
            for _, row in df[df["gene"].str.upper() == gene.upper()].iterrows():
                disease_entries.append({
                    "gene": row["gene"],
                    "disease": row["cancer"] if "cancer" in row else row.get("subtype", ""),
                    "subtype": row.get("subtype", ""),
                })
    except Exception as exc:
        raise ToolExecutionError(f"Failed to read disease data: {exc}", status_code=500) from exc

    pathway_texts = [f"{e['gene']}: {e['text']}" for e in pathway_entries]
    disease_texts = [f"{e['gene']}: {e['disease']} ({e['subtype']})" for e in disease_entries]
    prompt = f"""You are a genomics expert. Given the following genes: {', '.join(genes)}, and their associated pathways and diseases, analyze and rank the 3 most important pathways that all (or most) genes in the set are involved in. For each, provide a confidence score between 0 and 1, and a brief description.

Pathway candidates:
{chr(10).join(pathway_texts) if pathway_texts else 'None'}

Disease candidates:
{chr(10).join(disease_texts) if disease_texts else 'None'}

Output JSON in the following format:
{{
  "pathways": [
    {{"name": "<Pathway Name>", "description": "<desc>", "confidence": <float>}},
    ...
  ],
  "disease": {{"name": "<Disease Name>", "description": "<desc>", "confidence": <float>}}
}}
"""
    try:
        llm_response = call_llm(prompt, system="You are a genomics expert.", temperature=0.2, max_tokens=600)
    except LLMNotConfiguredError as exc:
        raise ToolExecutionError(str(exc), status_code=503) from exc
    except Exception as exc:
        raise ToolExecutionError(f"LLM error: {exc}", status_code=502) from exc

    match = re.search(r"\{[\s\S]*\}", llm_response)
    if not match:
        raise ToolExecutionError("LLM did not return valid JSON.", status_code=502)
    try:
        return json.loads(match.group(0))
    except Exception:
        try:
            return ast.literal_eval(match.group(0))
        except Exception as exc:
            raise ToolExecutionError(f"Failed to parse LLM output: {exc}", status_code=502) from exc
