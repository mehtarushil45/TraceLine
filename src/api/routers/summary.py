"""Summary router."""

from fastapi import APIRouter

from src.api.schemas import SummaryResponse
from src.api.service import service

router = APIRouter(tags=["Summary"])


@router.get("/summary", response_model=SummaryResponse, summary="Network Summary Statistics")
def get_summary() -> SummaryResponse:
    """Return top-level network metrics, transaction volumes, and risk distribution."""
    return service.get_summary()
