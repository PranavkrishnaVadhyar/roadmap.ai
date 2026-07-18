from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from sqlalchemy import select

from app.api.deps import SessionDep
from app.models import TodoItem
from app.schemas import CustomTodoRequest, TodoOut, TodoPatch, TodosResponse
from app.services.roadmaps import get_roadmap, regenerate_todos

router = APIRouter(tags=["todos"])
RoadmapId = Annotated[str, Path(min_length=1)]


@router.post("/roadmaps/{roadmap_id}/todos/generate", response_model=TodosResponse)
async def generate(roadmap_id: RoadmapId, session: SessionDep) -> TodosResponse:
    return TodosResponse(todos=await regenerate_todos(session, roadmap_id))


@router.get("/roadmaps/{roadmap_id}/todos", response_model=TodosResponse)
async def list_todos(roadmap_id: RoadmapId, session: SessionDep) -> TodosResponse:
    roadmap = await get_roadmap(session, roadmap_id)
    return TodosResponse(todos=[TodoOut.model_validate(item) for item in sorted(roadmap.todos, key=lambda todo: todo.order_index)])


@router.post("/roadmaps/{roadmap_id}/todos", response_model=TodoOut, status_code=201)
async def add_todo(roadmap_id: RoadmapId, payload: CustomTodoRequest, session: SessionDep) -> TodoOut:
    roadmap = await get_roadmap(session, roadmap_id)
    next_order = max((todo.order_index for todo in roadmap.todos), default=-1) + 1
    todo = TodoItem(roadmap_id=roadmap.id, node_id=None, title=payload.title, order_index=next_order, source="manual")
    session.add(todo); await session.commit(); await session.refresh(todo)
    return TodoOut.model_validate(todo)


async def find_todo(session: SessionDep, todo_id: str) -> TodoItem:
    todo = (await session.execute(select(TodoItem).where(TodoItem.id == todo_id))).scalar_one_or_none()
    if todo is None: raise HTTPException(status_code=404, detail="Todo not found")
    return todo


@router.patch("/todos/{todo_id}", response_model=TodoOut)
async def update_todo(todo_id: str, payload: TodoPatch, session: SessionDep) -> TodoOut:
    todo = await find_todo(session, todo_id)
    for field, value in payload.model_dump(exclude_none=True).items(): setattr(todo, field, value)
    await session.commit(); await session.refresh(todo)
    return TodoOut.model_validate(todo)


@router.delete("/todos/{todo_id}", status_code=204)
async def remove_todo(todo_id: str, session: SessionDep) -> None:
    todo = await find_todo(session, todo_id)
    await session.delete(todo); await session.commit()
