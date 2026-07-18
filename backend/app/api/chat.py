from fastapi import APIRouter, HTTPException

from app import ai_service
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest) -> ChatResponse:
    if payload.ready_to_generate:
        return ChatResponse(ready_to_generate=True, chat_history=payload.chat_history)
    try:
        return await ai_service.continue_chat(payload.chat_history)
    except ai_service.AIServiceError as exc:
        raise HTTPException(status_code=502, detail="Assistant is unavailable, try again") from exc
