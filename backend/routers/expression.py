"""Expression data upload and retrieval routes."""
from typing import Dict

from fastapi import APIRouter, HTTPException

import db

router = APIRouter()


@router.post("/expression-data/{graph_index}")
async def upload_expression_data(graph_index: int, payload: Dict[str, Dict[str, float]]):
    try:
        db.save_expression_data(graph_index, payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to store expression data: {exc}")
    return {"message": f"Expression data for graph {graph_index} stored successfully."}


@router.get("/expression-data/{graph_index}")
async def get_expression_data(graph_index: int):
    data = db.get_expression_data(graph_index)
    if data is None:
        raise HTTPException(status_code=404, detail="Expression data not found for this graph.")
    return data
