"""Comprehensive tests for Accounts Intelligence Workspace backend endpoints and data integrity.

Tests:
1. Account Registry (GET /api/accounts) pagination, filtering, search, and sorting.
2. Account Detail (GET /api/accounts/{id}) reconciliation with raw dataset.
3. Account Peer Stats (GET /api/accounts/{id}/peer-stats) calculation accuracy and medians.
4. Account Evidence (GET /api/accounts/{id}/evidence) deterministic rule execution.
5. Strict Leakage Prevention (no ground-truth keys).
6. Error handling and 404 responses.
"""

from __future__ import annotations

from typing import Any
import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.service import service

client = TestClient(app)

FORBIDDEN_EVALUATION_KEYS: set[str] = {
    "pattern_id",
    "is_ring_member",
    "link_type",
    "is_positive",
    "fraud_purity",
    "max_ring_coverage",
    "primary_ring_id",
    "num_rings_intersected",
    "fraud_account_count",
    "fraud_cases",
}


def _assert_no_forbidden_keys(data: Any) -> None:
    """Recursively verify that no forbidden ground-truth keys exist in JSON data."""
    if isinstance(data, dict):
        for k, v in data.items():
            assert (
                k not in FORBIDDEN_EVALUATION_KEYS
            ), f"Leaked forbidden key '{k}' found in response!"
            _assert_no_forbidden_keys(v)
    elif isinstance(data, list):
        for item in data:
            _assert_no_forbidden_keys(item)


@pytest.fixture(autouse=True, scope="module")
def ensure_data_loaded():
    """Ensure service data is loaded before running tests."""
    service.load_data()


# ---------------------------------------------------------------------------
# 1. Accounts Registry Endpoint (GET /api/accounts)
# ---------------------------------------------------------------------------


def test_accounts_registry_listing_and_pagination():
    """Test standard listing and pagination of the accounts registry."""
    response = client.get("/api/accounts?page=1&page_size=20")
    assert response.status_code == 200
    data = response.json()

    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert "total_pages" in data
    assert "items" in data

    assert data["total"] == 50000
    assert data["page"] == 1
    assert data["page_size"] == 20
    assert len(data["items"]) == 20
    assert data["total_pages"] == 2500

    item = data["items"][0]
    assert "account_id" in item
    assert "customer_name" in item
    assert "balance" in item
    assert "account_risk_score" in item
    assert "risk_level" in item
    assert item["risk_level"] in {"HIGH", "MEDIUM", "LOW"}
    assert "connected_account_count" in item
    assert "tx_count" in item
    assert "tx_volume" in item
    assert "declined_count" in item
    assert "decline_rate" in item

    _assert_no_forbidden_keys(data)


def test_accounts_registry_search_filter():
    """Test searching accounts by ID prefix or substring."""
    response = client.get("/api/accounts?search=acc_100&page=1&page_size=10")
    assert response.status_code == 200
    data = response.json()

    assert data["total"] > 0
    for item in data["items"]:
        assert "acc_100" in item["account_id"].lower() or "acc_100" in item["customer_name"].lower()


def test_accounts_registry_community_filter():
    """Test filtering accounts by assigned community ID."""
    response = client.get("/api/accounts?community_id=3&page=1&page_size=50")
    assert response.status_code == 200
    data = response.json()

    assert data["total"] > 0
    for item in data["items"]:
        assert item["community_id"] == 3


def test_accounts_registry_risk_tier_filter():
    """Test filtering accounts by derived risk tier (HIGH, MEDIUM, LOW)."""
    response_high = client.get("/api/accounts?risk_tier=HIGH&page=1&page_size=10")
    assert response_high.status_code == 200
    data_high = response_high.json()

    for item in data_high["items"]:
        assert item["risk_level"] == "HIGH"
        if item["account_risk_score"] is not None:
            assert item["account_risk_score"] >= 0.60

    response_low = client.get("/api/accounts?risk_tier=LOW&page=1&page_size=10")
    assert response_low.status_code == 200
    data_low = response_low.json()

    for item in data_low["items"]:
        assert item["risk_level"] == "LOW"
        if item["account_risk_score"] is not None:
            assert item["account_risk_score"] < 0.35


def test_accounts_registry_sorting():
    """Test sorting accounts by transaction count, risk score, and balance."""
    # Descending risk score
    res_desc = client.get("/api/accounts?sort_by=risk_score&sort_order=desc&page=1&page_size=10")
    assert res_desc.status_code == 200
    items_desc = res_desc.json()["items"]
    scores = [item["account_risk_score"] for item in items_desc if item["account_risk_score"] is not None]
    assert scores == sorted(scores, reverse=True)

    # Descending tx count
    res_tx = client.get("/api/accounts?sort_by=tx_count&sort_order=desc&page=1&page_size=10")
    assert res_tx.status_code == 200
    items_tx = res_tx.json()["items"]
    tx_counts = [item["tx_count"] for item in items_tx]
    assert tx_counts == sorted(tx_counts, reverse=True)


# ---------------------------------------------------------------------------
# 2. Account Detail Endpoint (GET /api/accounts/{id})
# ---------------------------------------------------------------------------


def test_account_detail_reconciliation():
    """Test account detail against raw CSV values for acc_100."""
    response = client.get("/api/accounts/acc_100")
    assert response.status_code == 200
    data = response.json()

    assert data["account_id"] == "acc_100"
    assert data["community_id"] == 3
    assert data["first_observed_activity"] is not None
    assert data["last_observed_activity"] is not None
    assert data["first_observed_activity"] <= data["last_observed_activity"]

    tx_stats = data["transaction_statistics"]
    assert tx_stats["total_count"] == tx_stats["sent_count"] + tx_stats["received_count"]
    assert tx_stats["total_count"] == 18
    assert tx_stats["sent_count"] == 7
    assert tx_stats["received_count"] == 11
    assert tx_stats["declined_count"] == 1

    _assert_no_forbidden_keys(data)


# ---------------------------------------------------------------------------
# 3. Account Peer Stats Endpoint (GET /api/accounts/{id}/peer-stats)
# ---------------------------------------------------------------------------


def test_account_peer_stats():
    """Test peer comparison metrics for an account."""
    response = client.get("/api/accounts/acc_100/peer-stats")
    assert response.status_code == 200
    data = response.json()

    assert data["account_id"] == "acc_100"
    assert data["community_id"] == 3
    assert data["has_peer_data"] is True
    assert data["peer_count"] > 1000
    assert data["peer_sample_size"] > 0

    assert data["account_tx_count"] == 18
    assert data["account_decline_rate"] > 0
    assert data["account_connections"] == 14

    assert data["peer_median_tx_count"] is not None
    assert data["peer_median_tx_volume"] is not None
    assert data["peer_median_decline_rate"] is not None
    assert data["peer_median_connections"] is not None

    _assert_no_forbidden_keys(data)


# ---------------------------------------------------------------------------
# 4. Account Evidence Endpoint (GET /api/accounts/{id}/evidence)
# ---------------------------------------------------------------------------


def test_account_evidence():
    """Test deterministic rule-based evidence for an account."""
    response = client.get("/api/accounts/acc_100/evidence")
    assert response.status_code == 200
    data = response.json()

    assert data["account_id"] == "acc_100"
    assert "evidence_score" in data
    assert "evidence_count" in data
    assert "items" in data
    assert len(data["items"]) == data["evidence_count"]

    for item in data["items"]:
        assert item["severity"] in {"HIGH", "MEDIUM", "LOW"}
        assert "title" in item
        assert "description" in item
        assert "score_contribution" in item

    _assert_no_forbidden_keys(data)


# ---------------------------------------------------------------------------
# 5. Nonexistent Account 404
# ---------------------------------------------------------------------------


def test_nonexistent_account_returns_404():
    """Verify that looking up a missing account returns 404."""
    response = client.get("/api/accounts/acc_nonexistent_999999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

    res_peer = client.get("/api/accounts/acc_nonexistent_999999/peer-stats")
    assert res_peer.status_code == 404
