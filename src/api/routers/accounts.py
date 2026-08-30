"""Accounts router."""

from fastapi import APIRouter, HTTPException, Query, status

from src.api.schemas import (
    AccountConnectionsResponse,
    AccountDetailResponse,
    AccountEvidenceResponse,
    AccountPeerStatsResponse,
    PaginatedAccountsRegistryResponse,
    PaginatedTransactionsResponse,
)
from src.api.service import service

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.get("", response_model=PaginatedAccountsRegistryResponse, summary="List Accounts Registry")
def list_accounts(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    community_id: int | None = Query(None, description="Filter by assigned community ID"),
    risk_tier: str | None = Query(None, pattern="^(HIGH|MEDIUM|LOW|all)$", description="Filter by risk tier"),
    min_risk_score: float | None = Query(None, ge=0.0, le=1.0, description="Minimum risk score (0-1)"),
    max_risk_score: float | None = Query(None, ge=0.0, le=1.0, description="Maximum risk score (0-1)"),
    search: str | None = Query(None, description="Search account ID or customer name"),
    sort_by: str = Query("risk_score", description="Sort by field: risk_score, community_risk, tx_count, tx_volume, connections, balance, account_id"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order: asc or desc"),
) -> PaginatedAccountsRegistryResponse:
    """Return a paginated, filterable, sortable index of accounts."""
    tier_filter = None if (risk_tier is None or risk_tier.lower() == "all") else risk_tier
    return service.get_accounts_registry(
        page=page,
        page_size=page_size,
        community_id=community_id,
        risk_tier=tier_filter,
        min_risk_score=min_risk_score,
        max_risk_score=max_risk_score,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/{account_id}", response_model=AccountDetailResponse, summary="Get Account Details")
def get_account(account_id: str) -> AccountDetailResponse:
    """Return account profile, community assignment, risk metrics, and transaction stats."""
    account = service.get_account(account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )
    return account


@router.get(
    "/{account_id}/peer-stats",
    response_model=AccountPeerStatsResponse,
    summary="Get Account Peer Comparison Stats",
)
def get_account_peer_stats(account_id: str) -> AccountPeerStatsResponse:
    """Return peer comparison statistics for an account against its assigned community peer group."""
    stats = service.get_account_peer_stats(account_id)
    if stats is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )
    return stats



@router.get(
    "/{account_id}/transactions",
    response_model=PaginatedTransactionsResponse,
    summary="Get Account Transactions",
)
def get_account_transactions(
    account_id: str,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    direction: str = Query("all", pattern="^(all|sent|received)$", description="Transaction direction: all, sent, or received"),
) -> PaginatedTransactionsResponse:
    """Return paginated transaction history for an account."""
    txs = service.get_account_transactions(
        account_id, page=page, page_size=page_size, direction=direction
    )
    if txs is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )
    return txs


@router.get(
    "/{account_id}/connections",
    response_model=AccountConnectionsResponse,
    summary="Get Account Evidence Connections",
)
def get_account_connections(account_id: str) -> AccountConnectionsResponse:
    """Return observable connections and shared evidence (devices, instruments, IPs, merchants)."""
    conns = service.get_account_connections(account_id)
    if conns is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )
    return conns


@router.get(
    "/{account_id}/evidence",
    response_model=AccountEvidenceResponse,
    summary="Get Account Evidence Intelligence",
)
def get_account_evidence(account_id: str) -> AccountEvidenceResponse:
    """Return observable-only evidence analysis for an account.

    Runs deterministic rule-based evidence detectors to explain WHY an
    account requires investigator attention based on its graph relationships,
    infrastructure sharing, and transaction behavior.

    Evidence Score is DISTINCT from Risk Score:
      - risk_score     = ML-derived ensemble prioritization
      - evidence_score = deterministic observable rule strength

    No ground-truth evaluation data is ever returned.
    """
    result = service.get_account_evidence(account_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account '{account_id}' not found.",
        )
    return result
