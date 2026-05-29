import logging
import os
import sys
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

load_dotenv()

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import db
import state
from routers import analysis, expression, genes, graph, llm, programs


class LLMConfigUpdate(BaseModel):
    provider: str
    api_key: str
    model: str
    base_url: str = ""


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    all_graphs = db.load_all_graphs()
    for (graph_index, graph_type), data in all_graphs.items():
        if graph_type == "original":
            state.original_graphs[graph_index] = data
        else:
            state.current_graphs[graph_index] = data
    yield


app = FastAPI(title="NetCancer-Insight API", lifespan=lifespan)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# ── Optional API key auth ─────────────────────────────────────────────────────
# Set API_KEY in .env to require all requests to include X-API-Key header.
# Leave unset for local single-user use (no auth required).
_API_KEY = os.getenv("API_KEY", "").strip()

if _API_KEY:
    _UNPROTECTED = {"/", "/docs", "/openapi.json", "/redoc"}

    class _APIKeyMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            if request.url.path not in _UNPROTECTED:
                if request.headers.get("X-API-Key") != _API_KEY:
                    return JSONResponse(status_code=401, content={"message": "Unauthorized"})
            return await call_next(request)

    app.add_middleware(_APIKeyMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(graph.router)
app.include_router(genes.router)
app.include_router(analysis.router)
app.include_router(expression.router)
app.include_router(llm.router)
app.include_router(programs.router)


# ── LLM settings ─────────────────────────────────────────────────────────────

@app.get("/settings/llm")
def get_llm_settings():
    config = db.get_config()
    if config is None:
        return JSONResponse(status_code=404, content={"message": "LLM not configured yet."})
    safe = {k: v for k, v in config.items() if k != "api_key"}
    safe["has_api_key"] = bool(config.get("api_key"))
    return safe


@app.post("/settings/llm")
def save_llm_settings(body: LLMConfigUpdate):
    db.set_config(
        provider=body.provider,
        api_key=body.api_key,
        model=body.model,
        base_url=body.base_url,
    )
    return {"message": "LLM configuration saved."}


# ── Root ──────────────────────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def read_root():
    return """
    <html>
      <head><title>NetCancer-Insight API</title></head>
      <body>
        <h1>NetCancer-Insight API</h1>
        <p>Interactive docs: <a href="/docs">/docs</a></p>
      </body>
    </html>
    """
