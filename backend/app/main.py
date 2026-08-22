"""CFOx CFO — FastAPI Backend"""

import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import treasury, proposals, agent
from .workers.indexer import start_indexer


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start blockchain indexer as background task
    treasury_id = os.getenv("DEFAULT_TREASURY_ID")
    indexer_task = None
    if treasury_id:
        indexer_task = asyncio.create_task(start_indexer(treasury_id))

    yield

    if indexer_task:
        indexer_task.cancel()
        try:
            await indexer_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="CFOx CFO API",
    version="1.0.0",
    description="AI-powered treasury management with equity-weighted governance",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(treasury.router,  prefix="/api/treasuries", tags=["treasury"])
app.include_router(proposals.router, prefix="/api/proposals",  tags=["proposals"])
app.include_router(agent.router,     prefix="/api/agent",      tags=["agent"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "CFOx-cfo"}
