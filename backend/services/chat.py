"""
Gene chat service: conversational Q&A grounded in retrieved genomics passages.

Both gene_chat (blocking) and gene_chat_stream (SSE generator) use
get_passages_unified for retrieval — same ChromaDB + BM25 hybrid pipeline
as annotation, no JSONL scan.
"""
import json as _json
from typing import Generator, List, Optional

from fastapi import BackgroundTasks

import db
from models import ToolExecutionError
from services.retriever import get_passages_unified
from services.llm import call_llm, call_llm_stream, LLMNotConfiguredError


def _build_chat_prompts(gene: str, passages: List[str], message: str):
    context = "\n\n".join(passages) if passages else "Limited specific information available."
    system = f"""You are an expert genomics researcher specializing in cancer biology, gene function, and molecular pathways.
You are assisting researchers analyzing gene interaction networks in the NetCancer-Insight platform.
Your role is strictly to answer questions about {gene} and related genomics topics such as gene function, cancer relevance, molecular pathways, protein interactions, and expression patterns.
Ground your answers in the reference information provided when relevant, and supplement with your scientific knowledge.
If asked something unrelated to genomics, molecular biology, or cancer biology, politely decline and redirect to the topic at hand.
Be precise, use scientific terminology, and keep responses focused and concise."""

    user = f"""Gene: {gene}

Reference information:
{context}

Question: {message}"""
    return system, user


def gene_chat(
    gene: str,
    message: str,
    conversation_history: List[dict],
    background_tasks: Optional[BackgroundTasks] = None,
) -> dict:
    normalized_gene = gene.strip().upper()
    passages = get_passages_unified(normalized_gene, k=8)
    system_prompt, user_prompt = _build_chat_prompts(normalized_gene, passages, message)

    try:
        response = call_llm(
            prompt=user_prompt,
            system=system_prompt,
            history=conversation_history,
            temperature=0.3,
            max_tokens=512,
        )
    except LLMNotConfiguredError as exc:
        raise ToolExecutionError(str(exc), status_code=503) from exc
    except Exception as exc:
        raise ToolExecutionError(f"Chat error: {exc}", status_code=502) from exc

    return {"gene": normalized_gene, "response": response}


def gene_chat_stream(
    gene: str,
    message: str,
    conversation_history: List[dict],
) -> Generator[str, None, None]:
    """
    Streaming variant.  Yields SSE-formatted strings:
      data: {"chunk": "<token>"}\n\n   — for each text token
      data: [DONE]\n\n                  — when the stream ends
      data: {"error": "...", ...}\n\n   — on failure (LLM or retrieval)
    """
    normalized_gene = gene.strip().upper()
    try:
        passages = get_passages_unified(normalized_gene, k=8)
        system_prompt, user_prompt = _build_chat_prompts(normalized_gene, passages, message)

        for chunk in call_llm_stream(
            prompt=user_prompt,
            system=system_prompt,
            history=conversation_history,
            temperature=0.3,
            max_tokens=512,
        ):
            yield f"data: {_json.dumps({'chunk': chunk})}\n\n"

        yield "data: [DONE]\n\n"

    except LLMNotConfiguredError as exc:
        yield f"data: {_json.dumps({'error': str(exc), 'not_configured': True})}\n\n"
    except Exception as exc:
        yield f"data: {_json.dumps({'error': str(exc)})}\n\n"
