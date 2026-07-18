from fastapi import APIRouter

from app.api.deps import SessionDep
from app.schemas import PublicRoadmapOut
from app.services.roadmaps import public_roadmap

router = APIRouter(prefix="/share", tags=["sharing"])


@router.get("/{share_token}", response_model=PublicRoadmapOut)
async def fetch_shared(share_token: str, session: SessionDep) -> PublicRoadmapOut:
    return await public_roadmap(session, share_token)
