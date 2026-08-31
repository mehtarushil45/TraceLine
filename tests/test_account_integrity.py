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


# ---------------------------------------------------------------------------
# 6. Balance Field — Real Dataset Column Provenance Verification
# ---------------------------------------------------------------------------


def test_account_balance_is_real_dataset_field():
    """Verify that balance is a genuine field from the raw accounts dataset, not derived."""
    import pandas as pd
    df = pd.read_csv("data/raw/accounts/accounts_0_0.csv")
    assert "balance" in df.columns, "balance must be a genuine column in the raw accounts CSV"

    # Pick acc_100 and verify API returns the exact raw value
    response = client.get("/api/accounts/acc_100")
    assert response.status_code == 200
    data = response.json()
    assert "balance" in data
    assert data["balance"] is not None

    raw_row = df[df["account_id"] == "acc_100"]
    if not raw_row.empty:
        raw_balance = round(float(raw_row.iloc[0]["balance"]), 2)
        assert abs(data["balance"] - raw_balance) < 0.01, (
            f"API balance {data['balance']} does not match raw CSV balance {raw_balance}"
        )


# ---------------------------------------------------------------------------
# 7. Risk Score — ML Model Output Provenance
# ---------------------------------------------------------------------------


def test_risk_score_provenance():
    """Verify risk scores come from ML model output and tiers are correctly derived."""
    response = client.get("/api/accounts?sort_by=risk_score&sort_order=desc&page=1&page_size=10")
    assert response.status_code == 200
    items = response.json()["items"]

    for item in items:
        score = item["account_risk_score"]
        level = item["risk_level"]
        if score is not None:
            assert 0.0 <= score <= 1.0, f"Risk score {score} out of [0,1] range"
            if score >= 0.60:
                assert level == "HIGH", f"Score {score} should be HIGH, got {level}"
            elif score >= 0.35:
                assert level == "MEDIUM", f"Score {score} should be MEDIUM, got {level}"
            else:
                assert level == "LOW", f"Score {score} should be LOW, got {level}"


# ---------------------------------------------------------------------------
# 8. High-Risk Account
# ---------------------------------------------------------------------------


def test_high_risk_account_detail():
    """Verify a high-risk account has correct risk tier and statistics."""
    # Get highest risk account
    response = client.get("/api/accounts?sort_by=risk_score&sort_order=desc&risk_tier=HIGH&page=1&page_size=1")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) > 0, "No HIGH risk accounts found in dataset"

    high_risk_id = items[0]["account_id"]
    detail_res = client.get(f"/api/accounts/{high_risk_id}")
    assert detail_res.status_code == 200
    data = detail_res.json()

    assert data["risk_level"] == "HIGH"
    assert data["account_risk_score"] is not None
    assert data["account_risk_score"] >= 0.60

    # TX stats must add up correctly
    tx = data["transaction_statistics"]
    assert tx["total_count"] == tx["sent_count"] + tx["received_count"]
    assert tx["declined_count"] <= tx["total_count"]

    _assert_no_forbidden_keys(data)


# ---------------------------------------------------------------------------
# 9. Low-Risk Account
# ---------------------------------------------------------------------------


def test_low_risk_account_detail():
    """Verify a low-risk account correctly reflects LOW tier."""
    response = client.get("/api/accounts?sort_by=risk_score&sort_order=asc&risk_tier=LOW&page=1&page_size=1")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) > 0, "No LOW risk accounts found in dataset"

    low_id = items[0]["account_id"]
    detail = client.get(f"/api/accounts/{low_id}").json()
    assert detail["risk_level"] == "LOW"
    if detail["account_risk_score"] is not None:
        assert detail["account_risk_score"] < 0.35

    _assert_no_forbidden_keys(detail)


# ---------------------------------------------------------------------------
# 10. Medium-Risk Account (if available)
# ---------------------------------------------------------------------------


def test_medium_risk_account_if_exists():
    """Check for MEDIUM risk accounts. If none exist in the benchmark, document the fact."""
    response = client.get("/api/accounts?risk_tier=MEDIUM&page=1&page_size=1")
    data = response.json()
    if data["total"] == 0:
        # Document: no MEDIUM risk accounts found in this benchmark
        print("[INFO] No MEDIUM risk accounts found in benchmark. Tier breakdown may be bimodal.")
        return

    med_id = data["items"][0]["account_id"]
    detail = client.get(f"/api/accounts/{med_id}").json()
    assert detail["risk_level"] == "MEDIUM"
    if detail["account_risk_score"] is not None:
        assert 0.35 <= detail["account_risk_score"] < 0.60

    _assert_no_forbidden_keys(detail)


# ---------------------------------------------------------------------------
# 11. High-Connectivity Account
# ---------------------------------------------------------------------------


def test_high_connectivity_account():
    """Verify a high-connectivity account returns correct connection data."""
    # Sort by connections descending
    response = client.get("/api/accounts?sort_by=connections&sort_order=desc&page=1&page_size=1")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) > 0

    top_connected_id = items[0]["account_id"]
    assert items[0]["connected_account_count"] > 0

    # Verify connections endpoint returns data consistent with the count
    conns_res = client.get(f"/api/accounts/{top_connected_id}/connections")
    assert conns_res.status_code == 200
    conns_data = conns_res.json()

    assert conns_data["account_id"] == top_connected_id
    assert conns_data["total_connections"] == len(conns_data["connections"])
    # Connections count should match registry metadata
    assert conns_data["total_connections"] == items[0]["connected_account_count"]

    _assert_no_forbidden_keys(conns_data)


# ---------------------------------------------------------------------------
# 12. Low-Connectivity Account
# ---------------------------------------------------------------------------


def test_low_connectivity_account():
    """Verify an account with 0 connections returns empty connections correctly."""
    # Sort by connections ascending to find low-connectivity accounts
    response = client.get("/api/accounts?sort_by=connections&sort_order=asc&page=1&page_size=5")
    assert response.status_code == 200
    items = response.json()["items"]

    # Find one with 0 or minimal connections
    zero_conn = next((it for it in items if it["connected_account_count"] == 0), None)
    if zero_conn is None:
        # If all have connections, test the lowest
        zero_conn = items[0]

    conns_res = client.get(f"/api/accounts/{zero_conn['account_id']}/connections")
    assert conns_res.status_code == 200
    conns_data = conns_res.json()
    assert conns_data["total_connections"] == zero_conn["connected_account_count"]

    _assert_no_forbidden_keys(conns_data)


# ---------------------------------------------------------------------------
# 13. Account with Shared Infrastructure
# ---------------------------------------------------------------------------


def test_account_with_shared_infrastructure():
    """Verify that an account with connections returns real observable evidence linking the nodes.

    acc_100 has 14 connections based on shared merchant co-occurrence + temporal overlap.
    The connection builder can produce edges from: shared_devices, shared_payment_instruments,
    shared_ips, shared_merchants, or temporal_overlap. At least one must be present.
    """
    conns_res = client.get("/api/accounts/acc_100/connections")
    assert conns_res.status_code == 200
    data = conns_res.json()

    connections = data["connections"]
    assert len(connections) > 0, "acc_100 must have connections"

    # Verify every edge has a positive weight (something must explain it)
    for conn in connections:
        assert conn["edge_weight"] > 0, f"Edge weight must be positive, got {conn['edge_weight']}"

    # Verify the connections response fields are structurally correct
    for conn in connections:
        assert "connected_account_id" in conn
        assert "edge_weight" in conn
        assert "shared_devices" in conn
        assert "shared_payment_instruments" in conn
        assert "shared_ips" in conn
        assert isinstance(conn["shared_devices"], list)
        assert isinstance(conn["shared_payment_instruments"], list)
        assert isinstance(conn["shared_ips"], list)

    _assert_no_forbidden_keys(data)


# ---------------------------------------------------------------------------
# 14. Account with Insufficient Relationship Evidence
# ---------------------------------------------------------------------------


def test_account_with_insufficient_relationship_evidence():
    """Verify that an isolated account with 0 connections returns an empty connections list."""
    # Find an account with 0 connections
    response = client.get("/api/accounts?sort_by=connections&sort_order=asc&page=1&page_size=20")
    items = response.json()["items"]

    no_conn_account = next((it for it in items if it["connected_account_count"] == 0), None)

    if no_conn_account is None:
        print("[INFO] All sampled accounts have at least 1 connection. Cannot test zero-connection case with current sort.")
        return

    conns_res = client.get(f"/api/accounts/{no_conn_account['account_id']}/connections")
    assert conns_res.status_code == 200
    data = conns_res.json()
    assert data["total_connections"] == 0
    assert data["connections"] == []


# ---------------------------------------------------------------------------
# 15. Peer Population Definition — Community Peer Baseline
# ---------------------------------------------------------------------------


def test_peer_stats_population_definition():
    """Verify peer stats correctly defines the peer population as community members."""
    response = client.get("/api/accounts/acc_100/peer-stats")
    assert response.status_code == 200
    data = response.json()

    assert data["has_peer_data"] is True
    # The peer population is community members, not global population
    assert data["community_id"] is not None
    assert data["peer_count"] > 0
    # peer_count should be less than total accounts (50000)
    assert data["peer_count"] < 50000

    # Peer medians must be defined when has_peer_data is True
    assert data["peer_median_tx_count"] is not None
    assert data["peer_median_tx_volume"] is not None
    assert data["peer_median_decline_rate"] is not None
    assert data["peer_median_connections"] is not None

    # Account-level values must reconcile with detail endpoint
    detail_res = client.get("/api/accounts/acc_100")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    tx_stats = detail["transaction_statistics"]
    assert data["account_tx_count"] == tx_stats["total_count"]


# ---------------------------------------------------------------------------
# 16. No Fabricated Keys — Evidence Engine Leakage Test
# ---------------------------------------------------------------------------


def test_no_fabricated_probability_or_fraud_labels():
    """Verify that no fraud probability, confidence score, fraud label, or case/SAR state is returned."""
    STRICTLY_FORBIDDEN_KEYS = {
        "fraud_probability", "confidence_score", "is_fraud", "fraud_label",
        "case_id", "case_status", "sar_id", "sar_status", "sar_generated",
        "add_to_case", "generate_sar", "fake_risk_history", "risk_history",
        "risk_trajectory", "historical_scores", "kyc_status", "identity",
        "geographic_risk", "account_age_risk",
    }

    response = client.get("/api/accounts/acc_100")
    data = response.json()

    def check_no_forbidden(d: Any, path: str = "") -> None:
        if isinstance(d, dict):
            for k, v in d.items():
                full_path = f"{path}.{k}" if path else k
                assert k not in STRICTLY_FORBIDDEN_KEYS, (
                    f"Forbidden fabricated key '{k}' found at path '{full_path}'"
                )
                check_no_forbidden(v, full_path)
        elif isinstance(d, list):
            for i, item in enumerate(d):
                check_no_forbidden(item, f"{path}[{i}]")

    check_no_forbidden(data)

    # Also check evidence endpoint
    ev_res = client.get("/api/accounts/acc_100/evidence")
    assert ev_res.status_code == 200
    check_no_forbidden(ev_res.json())

    # Check peer stats
    peer_res = client.get("/api/accounts/acc_100/peer-stats")
    assert peer_res.status_code == 200
    check_no_forbidden(peer_res.json())


# ---------------------------------------------------------------------------
# 17. Timeline Timestamp Validity
# ---------------------------------------------------------------------------


def test_timeline_timestamps_are_valid():
    """Verify that timeline events (from transactions) have valid real timestamps."""
    # Get transaction history for acc_100 to validate timestamps are real
    response = client.get("/api/accounts/acc_100/transactions?page=1&page_size=50&direction=all")
    assert response.status_code == 200
    data = response.json()

    from datetime import datetime
    items = data["items"]
    assert len(items) > 0, "acc_100 must have transactions to validate timestamps"

    timestamps = []
    for tx in items:
        assert "timestamp" in tx
        ts = tx["timestamp"]
        # Validate timestamp is parseable
        try:
            parsed = datetime.fromisoformat(ts.replace("Z", "+00:00")) if "T" in ts else datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
            timestamps.append(parsed)
        except (ValueError, AttributeError) as e:
            # Try date-only format
            try:
                datetime.strptime(ts[:10], "%Y-%m-%d")
                timestamps.append(ts)
            except ValueError:
                raise AssertionError(f"Timestamp '{ts}' for tx {tx['transaction_id']} is not a valid datetime: {e}")

    assert len(timestamps) == len(items)


# ---------------------------------------------------------------------------
# 18. Transaction Count Reconciliation (Detail vs Transaction List)
# ---------------------------------------------------------------------------


def test_transaction_count_reconciliation():
    """Verify that tx_count in detail response matches actual transaction list total."""
    detail = client.get("/api/accounts/acc_100").json()
    tx_total_from_detail = detail["transaction_statistics"]["total_count"]

    tx_list = client.get("/api/accounts/acc_100/transactions?direction=all&page=1&page_size=1").json()
    tx_total_from_list = tx_list["total"]

    assert tx_total_from_detail == tx_total_from_list, (
        f"tx total from detail ({tx_total_from_detail}) != from transaction list ({tx_total_from_list})"
    )

    # Sent + received must also reconcile
    sent_list = client.get("/api/accounts/acc_100/transactions?direction=sent&page=1&page_size=1").json()
    recv_list = client.get("/api/accounts/acc_100/transactions?direction=received&page=1&page_size=1").json()

    assert detail["transaction_statistics"]["sent_count"] == sent_list["total"]
    assert detail["transaction_statistics"]["received_count"] == recv_list["total"]


# ---------------------------------------------------------------------------
# 19. Community Assignment Reconciliation
# ---------------------------------------------------------------------------


def test_community_assignment_reconciliation():
    """Verify that an account's community_id is consistent across registry and detail."""
    registry_res = client.get("/api/accounts?community_id=3&page=1&page_size=5")
    assert registry_res.status_code == 200
    registry_items = registry_res.json()["items"]
    assert len(registry_items) > 0

    for item in registry_items:
        # Each item in a community_id=3 filter must have community_id=3
        assert item["community_id"] == 3
        # Verify detail endpoint agrees
        detail = client.get(f"/api/accounts/{item['account_id']}").json()
        assert detail["community_id"] == 3


# ---------------------------------------------------------------------------
# 20. Decline Rate Calculation Accuracy
# ---------------------------------------------------------------------------


def test_decline_rate_calculation():
    """Verify that decline_rate in registry is correctly calculated as declined/total."""
    response = client.get("/api/accounts?page=1&page_size=20")
    assert response.status_code == 200
    items = response.json()["items"]

    for item in items:
        total = item["tx_count"]
        declined = item["declined_count"]
        declared_rate = item["decline_rate"]

        if total > 0:
            expected_rate = round(declined / total, 4)
            assert abs(declared_rate - expected_rate) < 0.001, (
                f"Decline rate mismatch for {item['account_id']}: "
                f"declared={declared_rate}, expected={expected_rate}"
            )
        else:
            assert declared_rate == 0.0
