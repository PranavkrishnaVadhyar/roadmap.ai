"""All provider prompts and structured OpenAI calls live in this module."""
import json
from typing import TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.schemas import ChatResponse, GeneratedRoadmap, GeneratedTodo, MaterialCandidate, Message, RoadmapEdit

T = TypeVar("T", bound=BaseModel)


class AIServiceError(RuntimeError):
    pass


def _strict_schema(schema: dict) -> dict:
    """Make Pydantic's schema compatible with OpenAI strict structured outputs."""
    if isinstance(schema, dict):
        if schema.get("type") == "object":
            schema["additionalProperties"] = False
            if "properties" in schema:
                schema["required"] = list(schema["properties"])
        for value in schema.values():
            _strict_schema(value)
    elif isinstance(schema, list):
        for item in schema:
            _strict_schema(item)
    return schema


def _client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise AIServiceError("OpenAI is not configured")
    return AsyncOpenAI(api_key=settings.openai_api_key)


async def _structured(instructions: str, input_items: list[dict[str, str]], schema: type[T]) -> T:
    client = _client()
    for attempt in range(2):
        try:
            response = await client.responses.create(
                model=get_settings().openai_model,
                instructions=instructions + ("\nReturn only JSON matching the schema." if attempt else ""),
                input=input_items,
                text={"format": {"type": "json_schema", "name": schema.__name__.lower(), "strict": True,
                                  "schema": _strict_schema(schema.model_json_schema())}},
            )
            return schema.model_validate_json(response.output_text)
        except Exception as exc:
            last_error = exc
    raise AIServiceError("AI response could not be validated") from last_error


def _conversation_input(messages: list[Message]) -> list[dict[str, str]]:
    return [{"role": message.role, "content": message.content} for message in messages]


async def continue_chat(chat_history: list[Message]) -> ChatResponse:
    instructions = """You are RoadmapAI's intake assistant. The client owns the full conversation history and sends it with every request. Gather exactly: (1) a specific learning goal, (2) current experience, and (3) timeframe or urgency. Ask one concise clarifying question at a time. When and only when all three are clear, append a short confirmation and set ready_to_generate to true. Otherwise append one assistant question and set it false. Never create a roadmap in this step. Return the complete history, including your new assistant message."""
    return await _structured(instructions, _conversation_input(chat_history), ChatResponse)


async def generate_roadmap(chat_history: list[Message]) -> GeneratedRoadmap:
    instructions = "Create a personalized learning-roadmap DAG. Include concise nodes, descriptions, and prerequisite edges using node temp_id values. Do not create cyclic edges."
    return await _structured(instructions, _conversation_input(chat_history), GeneratedRoadmap)


async def edit_roadmap(current: dict, query: str) -> RoadmapEdit:
    instructions = "Return an edit diff. Existing IDs must be used in remove_node_ids and update_nodes.temp_id. New nodes need temp IDs. Preserve anything not mentioned."
    return await _structured(instructions, [{"role": "user", "content": "Roadmap:\n" + json.dumps(current) + "\nUser change:\n" + query}], RoadmapEdit)


async def generate_todos(roadmap: dict) -> list[GeneratedTodo]:
    class TodoPayload(BaseModel):
        todos: list[GeneratedTodo] = Field(min_length=1)
    instructions = "Generate one to three practical learning actions for every roadmap node. Use only existing node IDs, respect prerequisite edges, cover every node at least once, and never return an empty todos list."
    return (await _structured(instructions, [{"role": "user", "content": json.dumps(roadmap)}], TodoPayload)).todos


async def search_materials(node_title: str, roadmap_title: str) -> list[MaterialCandidate]:
    class MaterialPayload(BaseModel):
        materials: list[MaterialCandidate]
    try:
        response = await _client().responses.create(
            model=get_settings().openai_model, tools=[{"type": "web_search"}],
            instructions="Use web search to find current, direct, high-quality learning resources. Return only resources that are likely relevant and publicly accessible.",
            input=[{"role": "user", "content": f"Find up to five learning resources for {node_title} in the roadmap {roadmap_title}."}],
            text={"format": {"type": "json_schema", "name": "materials", "strict": True,
                              "schema": _strict_schema(MaterialPayload.model_json_schema())}},
        )
        return MaterialPayload.model_validate_json(response.output_text).materials
    except Exception as exc:
        raise AIServiceError("Material search failed") from exc
