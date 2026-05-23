"""LLM-powered routes: annotation, multi-annotation, gene chat, and MCP discovery."""
from typing import List

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse

from models import (
    AnnotateAllViewsInput,
    AnnotateToolInput,
    ChatRequest,
    GeneChatToolInput,
    MultiAnnotateInput,
    ToolExecutionError,
)
from services import annotation as annotation_svc
from services import chat as chat_svc
from services.llm import call_llm, LLMNotConfiguredError
from services.mcp import MCPServer, MCPTool

router = APIRouter()

# ── MCP tool registry ────────────────────────────────────────────────────────
mcp_server = MCPServer(name="netcancer-mcp")

mcp_server.register_tool(MCPTool(
    name="annotate",
    description="Generate a view-specific summary for a gene using retrieved passages.",
    input_model=AnnotateToolInput,
    handler=lambda p: annotation_svc.annotate(p.gene, p.view, p.k),
    output_example={"gene": "TP53", "view": "function", "summary": "..."},
))
mcp_server.register_tool(MCPTool(
    name="annotate_all_views",
    description="Return function, pathway, and disease summaries for a gene with caching.",
    input_model=AnnotateAllViewsInput,
    handler=lambda p: annotation_svc.annotate_all_views(p.gene, p.k, p.graph_index),
))
mcp_server.register_tool(MCPTool(
    name="multi_annotate",
    description="Aggregate pathways and diseases for multiple genes and rank them via LLM.",
    input_model=MultiAnnotateInput,
    handler=lambda p: annotation_svc.multi_annotate(p.genes),
))
mcp_server.register_tool(MCPTool(
    name="gene_chat",
    description="Chat about a specific gene while grounding responses in retrieved passages.",
    input_model=GeneChatToolInput,
    handler=lambda p: chat_svc.gene_chat(p.gene, p.message, p.conversation_history),
))


# ── HTTP routes ──────────────────────────────────────────────────────────────

@router.get("/mcp/tools")
def list_mcp_tools():
    return {"server": mcp_server.name, "tools": mcp_server.list_tools()}


@router.get("/annotate")
async def annotate(
    gene: str = Query(..., description="Gene symbol, e.g. TP53"),
    view: str = Query(..., description="One of: function, pathway, disease"),
    k: int = Query(5, ge=1, le=20),
):
    try:
        return mcp_server.invoke("annotate", AnnotateToolInput(gene=gene, view=view, k=k))
    except ToolExecutionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("/annotate_all_views")
async def annotate_all_views(
    gene: str = Body(..., embed=True),
    k: int = Query(5, ge=1, le=20),
    graph_index: int = Query(-1, ge=-1, le=1, description="Graph panel index for topology context (-1 = none)"),
):
    try:
        return mcp_server.invoke(
            "annotate_all_views",
            AnnotateAllViewsInput(gene=gene, k=k, graph_index=graph_index),
        )
    except ToolExecutionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("/multi-annotate")
async def multi_annotate(genes: List[str] = Body(..., embed=True)):
    try:
        return mcp_server.invoke("multi_annotate", MultiAnnotateInput(genes=genes))
    except ToolExecutionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("/chat")
async def chat_with_gene(request: ChatRequest, background_tasks: BackgroundTasks):
    try:
        return chat_svc.gene_chat(
            gene=request.gene,
            message=request.message,
            conversation_history=request.conversation_history,
            background_tasks=background_tasks,
        )
    except ToolExecutionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    return StreamingResponse(
        chat_svc.gene_chat_stream(
            gene=request.gene,
            message=request.message,
            conversation_history=request.conversation_history,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/llm-test")
async def llm_test():
    try:
        response = call_llm(
            prompt="Say 'LLM connected' and nothing else.",
            system="You are a simple diagnostics assistant.",
            temperature=0.0,
            max_tokens=16,
        )
        return {"success": True, "response": response}
    except LLMNotConfiguredError as exc:
        return JSONResponse(status_code=503, content={"success": False, "error": str(exc), "not_configured": True})
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})
