"""Timeline router."""

from fastapi import APIRouter, HTTPException, Query, status
from src.api.schemas import CommunityTimelineResponse
from src.api.service import service

router = APIRouter(prefix="/timeline", tags=["Timeline"])


@router.get(
    "/community/{community_id}",
    response_model=CommunityTimelineResponse,
    summary="Get Community Transaction Timeline",
)
def get_community_timeline(
    community_id: int,
    limit: int = Query(100, ge=1, le=1000, description="Max timeline events to return"),
    offset: int = Query(0, ge=0, description="Event offset for pagination"),
) -> CommunityTimelineResponse:
    """Return chronological stream of transaction events occurring within a community."""
    timeline = service.get_community_timeline(community_id, limit=limit, offset=offset)
    if timeline is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Community {community_id} not found.",
        )
    return timeline
