"""TraceLine FastAPI Application Entry Point.

Exposes RESTful API endpoints for the TraceLine payment network risk detection
and investigation platform.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.config import settings
from src.api.routers import (
    accounts,
    communities,
    graph,
    health,
    summary,
    timeline,
    transactions,
)
from src.api.service import service

logger = logging.getLogger("traceline.api")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Lifespan event handler to preload and index data on startup."""
    try:
        service.load_data()
    except (FileNotFoundError, ValueError, KeyError, OSError, RuntimeError) as e:
        logger.error("Failed to preload datasets during startup: %s", e)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Production-grade RESTful API for TraceLine payment network fraud ring "
        "detection and entity-resolution investigation. Exposes strictly observable "
        "evidence and ML community risk scores."
    ),
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS Configuration from environment or defaults
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers under /api
app.include_router(health.router, prefix="/api")
app.include_router(summary.router, prefix="/api")
app.include_router(communities.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(timeline.router, prefix="/api")


@app.get("/", include_in_schema=False)
def root_redirect():
    """Root redirect message with API status."""
    return {
        "status": "online",
        "service": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "api_root": "/api",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.api.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
    )
