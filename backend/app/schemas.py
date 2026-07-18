from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Status = Literal["not_started", "in_progress", "done"]
Role = Literal["user", "assistant"]


class Message(BaseModel):
    role: Role
    content: str = Field(min_length=1, max_length=20_000)


class ChatHistory(BaseModel):
    """Client-owned, non-persistent conversation passed between chat and creation."""
    chat_history: list[Message] = Field(min_length=1)


class ChatRequest(ChatHistory):
    ready_to_generate: bool = False


class ChatResponse(ChatHistory):
    ready_to_generate: bool


class GeneratedNode(BaseModel):
    temp_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None


class GeneratedEdge(BaseModel):
    source_temp_id: str
    target_temp_id: str


class GeneratedRoadmap(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    goal_description: str | None = None
    nodes: list[GeneratedNode] = Field(min_length=1)
    edges: list[GeneratedEdge] = []


class CreateRoadmapRequest(ChatHistory):
    pass


class MaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    url: str
    resource_type: str
    source: str


class NodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    description: str | None
    position_x: float
    position_y: float
    status: Status
    materials: list[MaterialOut] = []


class EdgeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    source_node_id: str
    target_node_id: str


class RoadmapOut(BaseModel):
    id: str
    title: str
    goal_description: str | None
    nodes: list[NodeOut]
    edges: list[EdgeOut]
    share_token: str | None
    created_at: datetime


class RoadmapListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    created_at: datetime


class EditRoadmapRequest(BaseModel):
    query: str = Field(min_length=1, max_length=10_000)


class NodePatch(BaseModel):
    position_x: float | None = None
    position_y: float | None = None
    status: Status | None = None


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    node_id: str | None
    title: str
    is_complete: bool
    order_index: int


class TodosResponse(BaseModel):
    todos: list[TodoOut]


class CustomTodoRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)


class TodoPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    is_complete: bool | None = None
    order_index: int | None = Field(default=None, ge=0)


class ShareResponse(BaseModel):
    share_token: str
    share_url: str


class PublicRoadmapOut(RoadmapOut):
    todos: list[TodoOut]


class MaterialCandidate(BaseModel):
    title: str
    url: str = Field(pattern=r"^https?://")
    resource_type: Literal["article", "video", "course", "doc", "other"] = "other"


class GeneratedTodo(BaseModel):
    node_id: str
    title: str = Field(min_length=1, max_length=500)


class RoadmapEdit(BaseModel):
    remove_node_ids: list[str] = []
    add_nodes: list[GeneratedNode] = []
    update_nodes: list[GeneratedNode] = []
    add_edges: list[GeneratedEdge] = []
    remove_edges: list[GeneratedEdge] = []
