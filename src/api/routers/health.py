"""Health check router."""

from datetime import datetime, timezone
from fastapi import APIRouter
from src.api.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse, summary="API Health Check")
def health_check() -> HealthResponse:
    """Return current service health and timestamp."""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
