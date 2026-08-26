"""Tests for the TraceLine FastAPI API Layer.

Covers:
  1. Health endpoint (GET /api/health)
  2. Summary endpoint (GET /api/summary)
  3. Community list (GET /api/communities)
  4. Community detail (GET /api/communities/{id})
  5. Nonexistent community -> 404
  6. Account lookup (GET /api/accounts/{id})
  7. Nonexistent account -> 404
  8. Account transactions with pagination (GET /api/accounts/{id}/transactions)
  9. Account connections (GET /api/accounts/{id}/connections)
 10. Transaction lookup (GET /api/transactions/{id})
 11. Nonexistent transaction -> 404
 12. Community graph endpoint (GET /api/graph/community/{id})
 13. Community timeline endpoint (GET /api/timeline/community/{id})
 14. Pagination behavior (page, page_size, total_pages)
 15. Strict Leakage Prevention: responses never contain forbidden evaluation fields
 16. CORS headers configuration
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from src.api.main import app

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


# ---------------------------------------------------------------------------
# 1. Health Endpoint
# ---------------------------------------------------------------------------


def test_api_health() -> None:
    """GET /api/health returns status ok and ISO timestamp."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "1.0.0"
    assert "timestamp" in data
    _assert_no_forbidden_keys(data)


# ---------------------------------------------------------------------------
# 2. Summary Endpoint
# ---------------------------------------------------------------------------


def test_api_summary() -> None:
    """GET /api/summary returns correct network counts and risk tier distributions."""
    response = client.get("/api/summary")
    assert response.status_code == 200
    data = response.json()

    assert data["account_count"] == 50000
    assert data["transaction_count"] == 450546
    assert data["community_count"] == 59
    assert data["high_risk_count"] == 17
    assert data["medium_risk_count"] == 13
    assert data["low_risk_count"] == 29
    assert data["high_risk_count"] + data["medium_risk_count"] + data["low_risk_count"] == 59
    assert data["graph_edge_count"] == 2617094
    _assert_no_forbidden_keys(data)


# ---------------------------------------------------------------------------
# 3. Community List Endpoint
# ---------------------------------------------------------------------------


def test_api_communities_list() -> None:
    """GET /api/communities returns 59 communities sorted by risk score descending."""
    response = client.get("/api/communities")
    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 59
    assert len(data["items"]) == 59

    # Verify descending sort by risk_score
    scores = [item["risk_score"] for item in data["items"]]
    assert scores == sorted(scores, reverse=True)

    first = data["items"][0]
    required_fields = {
        "community_id",
        "member_count",
        "risk_score",
        "risk_probability",
        "risk_level",
        "top_signal_1",
        "top_signal_2",
        "top_signal_3",
        "density",
        "mean_edge_weight",
        "tx_per_member",
        "total_transaction_amount",
    }
    assert required_fields.issubset(set(first.keys()))
    assert first["risk_level"] in {"LOW", "MEDIUM", "HIGH"}
    _assert_no_forbidden_keys(data)


# ---------------------------------------------------------------------------
# 4. Community Detail Endpoint
# ---------------------------------------------------------------------------


def test_api_community_detail_success() -> None:
    """GET /api/communities/{id} returns comprehensive detail for valid community."""
    response = client.get("/api/communities/3")
    assert response.status_code == 200
    data = response.json()

    assert data["community_id"] == 3
    assert data["member_count"] > 0
    assert 0 <= data["risk_score"] <= 100
    assert data["risk_level"] == "HIGH"
    assert "features" in data
    assert len(data["features"]) == 21
    assert "transaction_statistics" in data
    assert "temporal_statistics" in data
    assert "entity_sharing" in data
    _assert_no_forbidden_keys(data)


def test_api_community_detail_not_found() -> None:
    """GET /api/communities/{id} returns 404 for invalid community ID."""
    response = client.get("/api/communities/99999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 5. Community Accounts Endpoint
# ---------------------------------------------------------------------------


def test_api_community_accounts_pagination() -> None:
    """GET /api/communities/{id}/accounts returns paginated member accounts."""
    response = client.get("/api/communities/3/accounts?page=1&page_size=10")
    assert response.status_code == 200
    data = response.json()

    assert data["community_id"] == 3
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert len(data["items"]) == 10
    assert data["total"] > 10
    assert data["total_pages"] == (data["total"] + 9) // 10

    first_acc = data["items"][0]
    assert "account_id" in first_acc
    assert "customer_name" in first_acc
    assert "balance" in first_acc
    assert first_acc["community_id"] == 3
    _assert_no_forbidden_keys(data)


def test_api_community_accounts_not_found() -> None:
    """GET /api/communities/{id}/accounts returns 404 for invalid community ID."""
    response = client.get("/api/communities/99999/accounts")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 6. Account Lookup Endpoint
# ---------------------------------------------------------------------------


def test_api_account_detail_success() -> None:
    """GET /api/accounts/{id} returns account details, community context, and stats."""
    # Find a valid account ID from community 3
    comm_resp = client.get("/api/communities/3/accounts?page=1&page_size=1")
    acc_id = comm_resp.json()["items"][0]["account_id"]

    response = client.get(f"/api/accounts/{acc_id}")
    assert response.status_code == 200
    data = response.json()

    assert data["account_id"] == acc_id
    assert "customer_name" in data
    assert "balance" in data
    assert data["community_id"] == 3
    assert data["community_risk_score"] is not None
    assert data["community_risk_level"] is not None
    assert "transaction_statistics" in data
    assert "total_count" in data["transaction_statistics"]
    _assert_no_forbidden_keys(data)


def test_api_account_detail_not_found() -> None:
    """GET /api/accounts/{id} returns 404 for invalid account ID."""
    response = client.get("/api/accounts/nonexistent_account_999999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 7. Account Transactions Endpoint
# ---------------------------------------------------------------------------


def test_api_account_transactions_pagination() -> None:
    """GET /api/accounts/{id}/transactions returns paginated transactions."""
    comm_resp = client.get("/api/communities/3/accounts?page=1&page_size=1")
    acc_id = comm_resp.json()["items"][0]["account_id"]

    response = client.get(f"/api/accounts/{acc_id}/transactions?page=1&page_size=5")
    assert response.status_code == 200
    data = response.json()

    assert data["page"] == 1
    assert data["page_size"] == 5
    assert len(data["items"]) <= 5

    if data["items"]:
        tx = data["items"][0]
        assert "transaction_id" in tx
        assert "amount" in tx
        assert "timestamp" in tx
        assert tx["src_account_id"] == acc_id or tx["dst_account_id"] == acc_id
    _assert_no_forbidden_keys(data)


def test_api_account_transactions_not_found() -> None:
    """GET /api/accounts/{id}/transactions returns 404 for invalid account."""
    response = client.get("/api/accounts/nonexistent_acc/transactions")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 8. Account Connections Endpoint
# ---------------------------------------------------------------------------


def test_api_account_connections() -> None:
    """GET /api/accounts/{id}/connections returns observable graph connections."""
    comm_resp = client.get("/api/communities/3/accounts?page=1&page_size=1")
    acc_id = comm_resp.json()["items"][0]["account_id"]

    response = client.get(f"/api/accounts/{acc_id}/connections")
    assert response.status_code == 200
    data = response.json()

    assert data["account_id"] == acc_id
    assert "total_connections" in data
    assert isinstance(data["connections"], list)
    _assert_no_forbidden_keys(data)


def test_api_account_connections_not_found() -> None:
    """GET /api/accounts/{id}/connections returns 404 for invalid account."""
    response = client.get("/api/accounts/nonexistent_acc/connections")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 9. Transaction Lookup Endpoint
# ---------------------------------------------------------------------------


def test_api_transaction_detail_success() -> None:
    """GET /api/transactions/{id} returns enriched observable transaction details."""
    comm_resp = client.get("/api/communities/3/accounts?page=1&page_size=1")
    acc_id = comm_resp.json()["items"][0]["account_id"]
    tx_resp = client.get(f"/api/accounts/{acc_id}/transactions?page=1&page_size=1")
    
    if tx_resp.json()["items"]:
        tx_id = tx_resp.json()["items"][0]["transaction_id"]
        response = client.get(f"/api/transactions/{tx_id}")
        assert response.status_code == 200
        data = response.json()

        assert data["transaction_id"] == tx_id
        assert "amount" in data
        assert "timestamp" in data
        assert "transaction_status" in data
        _assert_no_forbidden_keys(data)


def test_api_transaction_detail_not_found() -> None:
    """GET /api/transactions/{id} returns 404 for invalid transaction ID."""
    response = client.get("/api/transactions/tx_nonexistent_99999999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 10. Community Graph Endpoint
# ---------------------------------------------------------------------------


def test_api_community_graph_success() -> None:
    """GET /api/graph/community/{id} returns nodes and edges for visualization."""
    response = client.get("/api/graph/community/3?max_nodes=50&max_edges=100")
    assert response.status_code == 200
    data = response.json()

    assert data["community_id"] == 3
    assert "nodes" in data
    assert "edges" in data
    assert len(data["nodes"]) <= 50
    assert len(data["edges"]) <= 100

    if data["nodes"]:
        node = data["nodes"][0]
        assert "id" in node
        assert "label" in node
        assert "degree" in node

    if data["edges"]:
        edge = data["edges"][0]
        assert "source" in edge
        assert "target" in edge
        assert "weight" in edge
    _assert_no_forbidden_keys(data)


def test_api_community_graph_not_found() -> None:
    """GET /api/graph/community/{id} returns 404 for invalid community ID."""
    response = client.get("/api/graph/community/99999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 11. Community Timeline Endpoint
# ---------------------------------------------------------------------------


def test_api_community_timeline_success() -> None:
    """GET /api/timeline/community/{id} returns chronological events."""
    response = client.get("/api/timeline/community/3?limit=20")
    assert response.status_code == 200
    data = response.json()

    assert data["community_id"] == 3
    assert "total_events" in data
    assert "events" in data
    assert len(data["events"]) <= 20

    if len(data["events"]) >= 2:
        # Verify chronological ordering
        timestamps = [e["timestamp"] for e in data["events"]]
        assert timestamps == sorted(timestamps)
    _assert_no_forbidden_keys(data)


def test_api_community_timeline_not_found() -> None:
    """GET /api/timeline/community/{id} returns 404 for invalid community ID."""
    response = client.get("/api/timeline/community/99999")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 12. CORS Configuration Check
# ---------------------------------------------------------------------------


def test_api_cors_headers() -> None:
    """Verify CORS headers allow cross-origin requests from React dashboard."""
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") in {
        "*",
        "http://localhost:3000",
    }
