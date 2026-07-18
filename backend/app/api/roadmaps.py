import secrets
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from sqlalchemy import delete, select

from app import ai_service
from app.api.deps import SessionDep
from app.core.config import get_settings
from app.models import Edge, Material, Node, Roadmap, TodoItem
from app.schemas import (CreateRoadmapRequest, EditRoadmapRequest, GeneratedEdge, GeneratedNode, GeneratedRoadmap,
                         MaterialOut, NodePatch, RoadmapListItem, RoadmapOut, ShareResponse)
from app.services.roadmaps import (as_out, attach_discovered_materials, create_roadmap, get_roadmap, provider_error,
                                   regenerate_todos, replace_ai_todos, roadmap_dict, validate_graph)

router = APIRouter(prefix="/roadmaps", tags=["roadmaps"])
RoadmapId = Annotated[str, Path(min_length=1)]


@router.post("", response_model=RoadmapOut, status_code=201)
async def create(payload: CreateRoadmapRequest, session: SessionDep) -> RoadmapOut:
    try:
        generated = await ai_service.generate_roadmap(payload.chat_history)
        roadmap = await create_roadmap(session, generated)
        await attach_discovered_materials(session, roadmap.id)
        await regenerate_todos(session, roadmap.id)
        return as_out(await get_roadmap(session, roadmap.id))
    except (ai_service.AIServiceError, ValueError) as exc:
        await session.rollback()
        raise provider_error(exc)


@router.get("", response_model=list[RoadmapListItem])
async def list_roadmaps(session: SessionDep) -> list[RoadmapListItem]:
    rows = (await session.execute(select(Roadmap).order_by(Roadmap.created_at.desc()))).scalars().all()
    return [RoadmapListItem.model_validate(row) for row in rows]


@router.get("/{roadmap_id}", response_model=RoadmapOut)
async def fetch(roadmap_id: RoadmapId, session: SessionDep) -> RoadmapOut:
    return as_out(await get_roadmap(session, roadmap_id))


@router.delete("/{roadmap_id}", status_code=204)
async def remove(roadmap_id: RoadmapId, session: SessionDep) -> None:
    roadmap = await get_roadmap(session, roadmap_id)
    await session.delete(roadmap); await session.commit()


@router.post("/{roadmap_id}/edit", response_model=RoadmapOut)
async def edit(roadmap_id: RoadmapId, payload: EditRoadmapRequest, session: SessionDep) -> RoadmapOut:
    roadmap = await get_roadmap(session, roadmap_id)
    try:
        change = await ai_service.edit_roadmap(roadmap_dict(roadmap), payload.query)
        existing = {node.id: node for node in roadmap.nodes}
        unknown = set(change.remove_node_ids) | {node.temp_id for node in change.update_nodes}
        if not unknown.issubset(existing): raise ValueError("Diff references an unknown node")
        for node_id in change.remove_node_ids:
            await session.execute(delete(TodoItem).where(TodoItem.node_id == node_id, TodoItem.source == "ai"))
            await session.execute(TodoItem.__table__.update().where(TodoItem.node_id == node_id, TodoItem.source == "manual").values(node_id=None))
            await session.delete(existing[node_id])
        for item in change.update_nodes:
            target = existing[item.temp_id]; target.title = item.title; target.description = item.description
        added: dict[str, str] = {}
        max_x = max((node.position_x for node in roadmap.nodes), default=0)
        for index, item in enumerate(change.add_nodes, start=1):
            node = Node(roadmap_id=roadmap.id, title=item.title, description=item.description, position_x=max_x + index * 280, position_y=0)
            session.add(node); await session.flush(); added[item.temp_id] = node.id
        removed = set(change.remove_node_ids)
        for edge in change.remove_edges:
            await session.execute(delete(Edge).where(Edge.roadmap_id == roadmap.id, Edge.source_node_id == edge.source_temp_id,
                Edge.target_node_id == edge.target_temp_id))
        available = (set(existing) - removed) | set(added.values())
        for edge in change.add_edges:
            source = added.get(edge.source_temp_id, edge.source_temp_id); target = added.get(edge.target_temp_id, edge.target_temp_id)
            if source not in available or target not in available: raise ValueError("Diff edge references unknown node")
            session.add(Edge(roadmap_id=roadmap.id, source_node_id=source, target_node_id=target))
        await session.flush(); session.expire_all()
        refreshed = await get_roadmap(session, roadmap_id)
        validate_graph(GeneratedRoadmap(title=refreshed.title, nodes=[GeneratedNode(temp_id=node.id, title=node.title)
            for node in refreshed.nodes], edges=[GeneratedEdge(source_temp_id=edge.source_node_id, target_temp_id=edge.target_node_id)
            for edge in refreshed.edges]))
        await replace_ai_todos(session, refreshed)
        await session.commit(); session.expire_all()
        return as_out(await get_roadmap(session, roadmap_id))
    except (ai_service.AIServiceError, ValueError) as exc:
        await session.rollback()
        raise provider_error(exc)


@router.patch("/{roadmap_id}/nodes/{node_id}", response_model=RoadmapOut)
async def update_node(roadmap_id: RoadmapId, node_id: str, payload: NodePatch, session: SessionDep) -> RoadmapOut:
    roadmap = await get_roadmap(session, roadmap_id)
    node = next((item for item in roadmap.nodes if item.id == node_id), None)
    if node is None: raise HTTPException(status_code=404, detail="Node not found")
    for field, value in payload.model_dump(exclude_none=True).items(): setattr(node, field, value)
    await session.commit(); session.expire_all()
    return as_out(await get_roadmap(session, roadmap_id))


@router.post("/{roadmap_id}/nodes/{node_id}/materials", response_model=list[MaterialOut])
async def regenerate_materials(roadmap_id: RoadmapId, node_id: str, session: SessionDep) -> list[MaterialOut]:
    roadmap = await get_roadmap(session, roadmap_id)
    node = next((item for item in roadmap.nodes if item.id == node_id), None)
    if node is None: raise HTTPException(status_code=404, detail="Node not found")
    try:
        materials = await ai_service.search_materials(node.title, roadmap.title)
    except ai_service.AIServiceError as exc:
        raise provider_error(exc)
    await session.execute(delete(Material).where(Material.node_id == node_id, Material.source == "ai_search"))
    session.add_all([Material(node_id=node_id, title=item.title, url=item.url, resource_type=item.resource_type, source="ai_search") for item in materials])
    await session.commit(); session.expire_all()
    refreshed = await get_roadmap(session, roadmap_id)
    refreshed_node = next(item for item in refreshed.nodes if item.id == node_id)
    return [MaterialOut.model_validate(item) for item in refreshed_node.materials]


@router.post("/{roadmap_id}/share", response_model=ShareResponse)
async def share(roadmap_id: RoadmapId, session: SessionDep) -> ShareResponse:
    roadmap = await get_roadmap(session, roadmap_id)
    roadmap.share_token = secrets.token_urlsafe(24); roadmap.is_public = True
    await session.commit()
    base = get_settings().public_share_base_url.rstrip("/")
    return ShareResponse(share_token=roadmap.share_token, share_url=f"{base}/share/{roadmap.share_token}")


@router.delete("/{roadmap_id}/share", status_code=204)
async def revoke_share(roadmap_id: RoadmapId, session: SessionDep) -> None:
    roadmap = await get_roadmap(session, roadmap_id)
    roadmap.share_token = None; roadmap.is_public = False
    await session.commit()
