import os
import sys
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

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
_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    os.getenv("FRONTEND_ORIGIN", ""),
]
allowed_origins = [o.rstrip("/") for o in _origins if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
