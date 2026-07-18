from collections import defaultdict, deque

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import ai_service
from app.models import Edge, Node, Roadmap, TodoItem
from app.schemas import EdgeOut, GeneratedRoadmap, MaterialOut, NodeOut, PublicRoadmapOut, RoadmapOut, TodoOut


def provider_error(_: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="AI assistant is unavailable, try again")


async def get_roadmap(session: AsyncSession, roadmap_id: str) -> Roadmap:
    result = await session.execute(select(Roadmap).where(Roadmap.id == roadmap_id).options(
        selectinload(Roadmap.nodes).selectinload(Node.materials), selectinload(Roadmap.edges), selectinload(Roadmap.todos)))
    roadmap = result.scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return roadmap


def roadmap_dict(roadmap: Roadmap) -> dict:
    return {"id": roadmap.id, "title": roadmap.title, "goal_description": roadmap.goal_description,
            "nodes": [{"id": n.id, "title": n.title, "description": n.description, "position_x": n.position_x,
                       "position_y": n.position_y, "status": n.status} for n in roadmap.nodes],
            "edges": [{"source_node_id": e.source_node_id, "target_node_id": e.target_node_id} for e in roadmap.edges]}


def as_out(roadmap: Roadmap) -> RoadmapOut:
    return RoadmapOut(id=roadmap.id, title=roadmap.title, goal_description=roadmap.goal_description,
        share_token=roadmap.share_token, created_at=roadmap.created_at,
        nodes=[NodeOut(id=n.id, title=n.title, description=n.description, position_x=n.position_x, position_y=n.position_y,
                       status=n.status, materials=[MaterialOut.model_validate(m) for m in n.materials]) for n in roadmap.nodes],
        edges=[EdgeOut.model_validate(e) for e in roadmap.edges])


def validate_graph(data: GeneratedRoadmap) -> None:
    ids = [node.temp_id for node in data.nodes]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate node identifiers")
    known, graph, degree = set(ids), defaultdict(list), {identifier: 0 for identifier in ids}
    for edge in data.edges:
        if edge.source_temp_id not in known or edge.target_temp_id not in known:
            raise ValueError("Edge references an unknown node")
        graph[edge.source_temp_id].append(edge.target_temp_id); degree[edge.target_temp_id] += 1
    queue, visited = deque(identifier for identifier, value in degree.items() if value == 0), 0
    while queue:
        current = queue.popleft(); visited += 1
        for target in graph[current]:
            degree[target] -= 1
            if degree[target] == 0: queue.append(target)
    if visited != len(known):
        raise ValueError("Roadmap graph must be acyclic")


async def create_roadmap(session: AsyncSession, generated: GeneratedRoadmap) -> RoadmapOut:
    validate_graph(generated)
    roadmap = Roadmap(title=generated.title, goal_description=generated.goal_description)
    session.add(roadmap); await session.flush()
    identifiers: dict[str, str] = {}
    for index, item in enumerate(generated.nodes):
        node = Node(roadmap_id=roadmap.id, title=item.title, description=item.description, position_x=index * 280, position_y=0)
        session.add(node); await session.flush(); identifiers[item.temp_id] = node.id
    session.add_all([Edge(roadmap_id=roadmap.id, source_node_id=identifiers[e.source_temp_id], target_node_id=identifiers[e.target_temp_id]) for e in generated.edges])
    await session.commit()
    return as_out(await get_roadmap(session, roadmap.id))


async def replace_ai_todos(session: AsyncSession, roadmap: Roadmap) -> None:
    try:
        generated = await ai_service.generate_todos(roadmap_dict(roadmap))
    except ai_service.AIServiceError as exc:
        raise provider_error(exc)
    node_ids = {node.id for node in roadmap.nodes}
    if any(todo.node_id not in node_ids for todo in generated):
        raise provider_error(ValueError("AI referenced unknown node"))
    await session.execute(delete(TodoItem).where(TodoItem.roadmap_id == roadmap.id, TodoItem.source == "ai"))
    session.add_all([TodoItem(roadmap_id=roadmap.id, node_id=item.node_id, title=item.title, order_index=index, source="ai") for index, item in enumerate(generated)])


async def regenerate_todos(session: AsyncSession, roadmap_id: str) -> list[TodoOut]:
    roadmap = await get_roadmap(session, roadmap_id)
    await replace_ai_todos(session, roadmap); await session.commit()
    refreshed = await get_roadmap(session, roadmap_id)
    return [TodoOut.model_validate(item) for item in sorted(refreshed.todos, key=lambda todo: todo.order_index)]


async def public_roadmap(session: AsyncSession, token: str) -> PublicRoadmapOut:
    roadmap = (await session.execute(select(Roadmap).where(Roadmap.share_token == token, Roadmap.is_public.is_(True)))).scalar_one_or_none()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Shared roadmap not found")
    full = await get_roadmap(session, roadmap.id)
    return PublicRoadmapOut(**as_out(full).model_dump(), todos=[TodoOut.model_validate(todo) for todo in full.todos])
