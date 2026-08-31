"""Transactions router."""

from fastapi import APIRouter, HTTPException, Query, status

from src.api.schemas import (
    PaginatedTransactionListResponse,
    TransactionCounterpartyResponse,
    TransactionDetailResponse,
)
from src.api.service import service

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get(
    "",
    response_model=PaginatedTransactionListResponse,
    summary="List Transactions Registry",
)
def list_transactions(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    status: str | None = Query(
        None,
        pattern="^(settled|declined|pending)$",
        description="Filter by transaction status",
    ),
    payment_method: str | None = Query(
        None,
        pattern="^(card|upi|wallet|netbanking)$",
        description="Filter by payment method",
    ),
    min_amount: float | None = Query(None, ge=0.0, description="Minimum transaction amount"),
    max_amount: float | None = Query(None, ge=0.0, description="Maximum transaction amount"),
    search: str | None = Query(
        None, description="Search by transaction_id, src_account_id, or dst_account_id prefix"
    ),
    sort_by: str = Query(
        "timestamp",
        description="Sort field: timestamp, amount, transaction_status",
    ),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
) -> PaginatedTransactionListResponse:
    """Return a paginated, filterable, sortable investigator transaction registry.

    All filters map to real dataset fields in enriched_transactions.csv.
    No fabricated values are returned.
    """
    return service.get_transactions_list(
        page=page,
        page_size=page_size,
        status=status,
        payment_method=payment_method,
        min_amount=min_amount,
        max_amount=max_amount,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get(
    "/{transaction_id}",
    response_model=TransactionDetailResponse,
    summary="Get Transaction Details",
)
def get_transaction(transaction_id: str) -> TransactionDetailResponse:
    """Return observable transaction details including enriched merchant information."""
    tx = service.get_transaction(transaction_id)
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{transaction_id}' not found.",
        )
    return tx


@router.get(
    "/{transaction_id}/counterparty",
    response_model=TransactionCounterpartyResponse,
    summary="Get Transaction Counterparty Relationship",
)
def get_transaction_counterparty(transaction_id: str) -> TransactionCounterpartyResponse:
    """Return the observed relationship between the src and dst accounts of a transaction.

    Provides deterministic analytics derived exclusively from enriched_transactions.csv:
    - Total observed transactions between the account pair
    - Flow totals in each direction
    - First and last observed transaction timestamps between the pair
    - Declined transaction count between the pair
    - Community membership context
    - Preview of 5 most recent transactions between the pair

    No ML scores. No fabricated values.
    """
    result = service.get_transaction_counterparty(transaction_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{transaction_id}' not found.",
        )
    return result
