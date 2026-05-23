"""Program comments and ratings routes."""
import uuid
from typing import Dict, List

import pandas as pd
from fastapi import APIRouter

from models import Comment

router = APIRouter(prefix="/programs", tags=["programs"])

_comments: Dict[str, List[dict]] = {}
_ratings: Dict[str, dict] = {}


@router.get("/{program_id}/comments")
def get_comments(program_id: str):
    return {"comments": _comments.get(program_id, [])}


@router.post("/{program_id}/comments")
def add_comment(program_id: str, comment: Comment):
    comment_data = {
        "id": str(uuid.uuid4()),
        "program_id": program_id,
        "content": comment.content,
        "rating": comment.rating,
        "created_at": str(pd.Timestamp.now()),
    }
    _comments.setdefault(program_id, []).append(comment_data)
    r = _ratings.setdefault(program_id, {"total": 0, "sum": 0})
    r["total"] += 1
    r["sum"] += comment.rating
    return {"message": "Comment added successfully", "comment": comment_data}


@router.get("/{program_id}/rating")
def get_rating(program_id: str):
    r = _ratings.get(program_id)
    if not r:
        return {"program_id": program_id, "average_rating": 0.0, "total_ratings": 0}
    return {
        "program_id": program_id,
        "average_rating": round(r["sum"] / r["total"], 2),
        "total_ratings": r["total"],
    }
