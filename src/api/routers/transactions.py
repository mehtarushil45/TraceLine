"""Transactions router."""

from fastapi import APIRouter, HTTPException, status
from src.api.schemas import TransactionDetailResponse
from src.api.service import service

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("/{transaction_id}", response_model=TransactionDetailResponse, summary="Get Transaction Details")
def get_transaction(transaction_id: str) -> TransactionDetailResponse:
    """Return observable transaction details including enriched merchant information."""
    tx = service.get_transaction(transaction_id)
    if tx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction '{transaction_id}' not found.",
        )
    return tx
