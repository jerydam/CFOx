"""
Agent API — AI CFO chat interface.
Supports both standard and streaming (SSE) responses.
"""

import json
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator

from ..models.schemas import AgentChatRequest, AgentChatResponse
from ..agents.cfo_agent import CFOAgent

router = APIRouter()


def _get_agent(treasury_id: str) -> CFOAgent:
    return CFOAgent(
        backend_url=os.getenv("BACKEND_URL", "http://localhost:8000"),
        backend_api_key=os.getenv("BACKEND_API_KEY", ""),
        treasury_id=treasury_id,
    )


@router.post("/chat", response_model=AgentChatResponse)
async def chat(request: AgentChatRequest):
    """Non-streaming chat."""
    agent = _get_agent(request.treasury_id)
    response = await agent.chat(request.message, request.history)
    return AgentChatResponse(
        message=response.text,
        proposals_created=response.proposals_created,
        risk_flags=response.risk_flags,
        tool_calls_made=len(response.tool_calls),
    )


@router.post("/chat/stream")
async def chat_stream(request: AgentChatRequest):
    """Streaming SSE chat."""
    agent = _get_agent(request.treasury_id)

    async def event_stream() -> AsyncGenerator[str, None]:
        async for chunk in agent.stream_chat(request.message, request.history):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
