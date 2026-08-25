"""TraceLine FastAPI Application Entry Point.

Exposes RESTful API endpoints for the TraceLine payment network risk detection
and investigation platform.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Lifespan event handler to preload and index data on startup."""
    service.load_data()
    yield


app = FastAPI(
    title="TraceLine Investigator API",
    description=(
        "Production-grade RESTful API for TraceLine payment network fraud ring "
        "detection and entity-resolution investigation. Exposes strictly observable "
        "evidence and ML community risk scores."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS Configuration for local React / Vite frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*",
    ],
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
    """Root redirect to OpenAPI documentation."""
    return {"message": "TraceLine API is running. Access interactive documentation at /docs"}
