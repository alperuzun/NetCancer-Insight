from pydantic import BaseModel
from typing import List


class NodeRequest(BaseModel):
    node_id: str
    graph_index: int = 0


class GraphIndexRequest(BaseModel):
    graph_index: int


class ChatRequest(BaseModel):
    gene: str
    message: str
    conversation_history: List[dict] = []


class ClusterRequest(BaseModel):
    graph_index: int
    algorithm: str = "louvain"


class AnnotateToolInput(BaseModel):
    gene: str
    view: str
    k: int = 5


class AnnotateAllViewsInput(BaseModel):
    gene: str
    k: int = 5
    graph_index: int = -1


class MultiAnnotateInput(BaseModel):
    genes: List[str]


class GeneChatToolInput(BaseModel):
    gene: str
    message: str
    conversation_history: List[dict] = []


class Comment(BaseModel):
    content: str
    rating: int


class ToolExecutionError(Exception):
    """Raised when a service layer encounters a domain-specific failure."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code
