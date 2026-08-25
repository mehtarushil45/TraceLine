"""Accounts router."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from src.api.schemas import (
    AccountConnectionsResponse,
    AccountDetailResponse,
    PaginatedTransactionsResponse,
)
from src.api.service import service

router = APIRouter(prefix="/accounts", tags=["Accounts"])


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
