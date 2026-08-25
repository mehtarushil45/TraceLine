"""Graph router."""

from fastapi import APIRouter, HTTPException, Query, status
from src.api.schemas import CommunityGraphResponse
from src.api.service import service

router = APIRouter(prefix="/graph", tags=["Graph"])


@router.get(
    "/community/{community_id}",
    response_model=CommunityGraphResponse,
    summary="Get Community Graph Data",
)
def get_community_graph(
    community_id: int,
    max_nodes: int = Query(200, ge=1, le=1000, description="Max nodes to return for visualization"),
    max_edges: int = Query(500, ge=1, le=2000, description="Max edges to return for visualization"),
) -> CommunityGraphResponse:
    """Return nodes and edges formatted for frontend network graph visualization."""
    graph = service.get_community_graph(community_id, max_nodes=max_nodes, max_edges=max_edges)
    if graph is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Community {community_id} not found.",
        )
    return graph
