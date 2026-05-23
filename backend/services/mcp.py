# services/mcp.py
"""
Lightweight Model Context Protocol style server used to expose the project's
analysis capabilities as discoverable tools. This module does not implement the
wire protocol (e.g. JSON-RPC transport) but provides the core abstractions that
can be wired into FastAPI endpoints now and a real MCP transport later.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Type, Union

from pydantic import BaseModel, ValidationError


Payload = Union[BaseModel, Dict[str, Any]]
Handler = Callable[[BaseModel], Any]


@dataclass
class MCPTool:
    """Represents a callable MCP tool and its schema."""

    name: str
    description: str
    input_model: Type[BaseModel]
    handler: Handler
    output_example: Optional[Dict[str, Any]] = None

    def run(self, payload: Payload) -> Any:
        """Validate the payload against the schema and invoke the handler."""
        if isinstance(payload, BaseModel):
            model_instance = payload
        else:
            try:
                model_instance = self.input_model(**payload)
            except ValidationError as exc:
                raise ValueError(f"Invalid payload for tool '{self.name}': {exc}") from exc
        return self.handler(model_instance)


class MCPServer:
    """Registers and invokes tools similarly to an MCP server."""

    def __init__(self, name: str):
        self.name = name
        self._tools: Dict[str, MCPTool] = {}

    def register_tool(self, tool: MCPTool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool '{tool.name}' already registered.")
        self._tools[tool.name] = tool

    def list_tools(self) -> List[Dict[str, Any]]:
        """Return metadata about available tools."""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "schema": tool.input_model.model_json_schema(),
                "output_example": tool.output_example,
            }
            for tool in self._tools.values()
        ]

    def invoke(self, tool_name: str, payload: Payload) -> Any:
        if tool_name not in self._tools:
            raise ValueError(f"Tool '{tool_name}' is not registered.")
        return self._tools[tool_name].run(payload)


__all__ = ["MCPServer", "MCPTool"]
