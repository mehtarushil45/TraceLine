"""Communities router."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from src.api.schemas import (
    CommunityDetailResponse,
    CommunityListResponse,
    PaginatedAccountsResponse,
)
from src.api.service import service

router = APIRouter(prefix="/communities", tags=["Communities"])


@router.get("", response_model=CommunityListResponse, summary="List All Communities")
def list_communities() -> CommunityListResponse:
    """Return all detected Louvain communities sorted by risk score descending."""
    return service.get_communities()


@router.get("/{community_id}", response_model=CommunityDetailResponse, summary="Get Community Details")
def get_community(community_id: int) -> CommunityDetailResponse:
    """Return detailed structural, temporal, entity-sharing, and risk metrics for a community."""
    comm = service.get_community_detail(community_id)
    if comm is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Community {community_id} not found.",
        )
    return comm


@router.get(
    "/{community_id}/accounts",
    response_model=PaginatedAccountsResponse,
    summary="List Community Accounts",
)
def get_community_accounts(
    community_id: int,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
) -> PaginatedAccountsResponse:
    """Return paginated list of member accounts belonging to a community."""
    res = service.get_community_accounts(community_id, page=page, page_size=page_size)
    if res is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Community {community_id} not found.",
        )
    return res
