# Copyright (c) 2026 Santander Group
# SPDX-License-Identifier: Apache-2.0

"""Cases / Formal Investigation Dossiers Boundary & Integrity Tests.

Validates the architectural invariants of the TraceLine Cases surface:
1. Lifecycle boundary: Formal cases and SAR packages are NOT created or stored
   on the backend analytics server; they are managed client-side via the
   Forensic Workspace Decision boundary.
2. Endpoint boundary: Verifies no `/api/cases`, `/api/sar`, or `/api/dossiers`
   endpoints are exposed on the backend.
3. Referenced entity resolution: Verifies that accounts and transactions
   referenced by formal investigation cases can be hydrated via backend APIs
   with full fidelity without exposing ground-truth evaluation keys.
4. Strict zero-leakage contract: No ground truth evaluation labels (pattern_id,
   is_ring_member, fraud_cases, etc.) appear in any response.
"""

from __future__ import annotations

from typing import Any

import pytest
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
# 1. Backend Lifecycle Boundary Enforcement
# ---------------------------------------------------------------------------


class TestCasesBackendBoundary:
    """Enforces that cases and SAR records remain client-side and un-stored server-side."""

    def test_no_cases_endpoint_exists(self) -> None:
        """GET /api/cases must return 404/405 (no server-side cases CRUD)."""
        response = client.get("/api/cases")
        assert response.status_code == 404

    def test_no_case_creation_endpoint_exists(self) -> None:
        """POST /api/cases must return 404 (no server-side case creation)."""
        response = client.post("/api/cases", json={"title": "Test Case"})
        assert response.status_code == 404

    def test_no_sar_export_endpoint_exists(self) -> None:
        """GET /api/sar must return 404 (SAR is generated client-side from Decision view)."""
        response = client.get("/api/sar")
        assert response.status_code == 404

    def test_no_dossiers_endpoint_exists(self) -> None:
        """GET /api/dossiers must return 404."""
        response = client.get("/api/dossiers")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# 2. Entity Hydration for Linked Dossier Targets
# ---------------------------------------------------------------------------


class TestDossierEntityHydration:
    """Verifies backend hydration for entities referenced in case dossiers."""

    def test_community_hydration_for_case_source(self) -> None:
        """A source community referenced in a case can be retrieved and validated."""
        # Community 3 is high risk
        response = client.get("/api/communities/3")
        assert response.status_code == 200
        data = response.json()
        assert data["community_id"] == 3
        assert "risk_score" in data
        assert "risk_level" in data
        assert "member_count" in data
        assert "entity_sharing" in data
        assert "transaction_statistics" in data
        _assert_no_forbidden_keys(data)

    def test_community_evidence_hydration_for_case_source(self) -> None:
        """Evidence snapshot metrics correspond to observable community evidence."""
        response = client.get("/api/communities/3/evidence")
        assert response.status_code == 200
        data = response.json()
        assert data["community_id"] == 3
        assert "evidence_count" in data
        assert "evidence_score" in data
        assert "high_count" in data
        assert "medium_count" in data
        assert "low_count" in data
        assert isinstance(data["items"], list)
        _assert_no_forbidden_keys(data)

    def test_linked_account_hydration(self) -> None:
        """Account referenced in a dossier target list can be hydrated via /api/accounts/{id}."""
        # Get an account from community 3
        accounts_res = client.get("/api/communities/3/accounts?page=1&page_size=5")
        assert accounts_res.status_code == 200
        accounts_data = accounts_res.json()
        assert len(accounts_data["items"]) > 0

        target_acc_id = accounts_data["items"][0]["account_id"]
        acc_detail_res = client.get(f"/api/accounts/{target_acc_id}")
        assert acc_detail_res.status_code == 200
        acc_detail = acc_detail_res.json()
        assert acc_detail["account_id"] == target_acc_id
        assert "community_id" in acc_detail
        assert "balance" in acc_detail
        _assert_no_forbidden_keys(acc_detail)

    def test_linked_transaction_hydration(self) -> None:
        """Transaction referenced in a dossier target list can be hydrated via /api/transactions/{id}."""
        # Get a list of transactions
        tx_list_res = client.get("/api/transactions?page=1&page_size=5")
        assert tx_list_res.status_code == 200
        tx_items = tx_list_res.json()["items"]
        assert len(tx_items) > 0

        target_tx_id = tx_items[0]["transaction_id"]
        tx_detail_res = client.get(f"/api/transactions/{target_tx_id}")
        assert tx_detail_res.status_code == 200
        tx_detail = tx_detail_res.json()
        assert tx_detail["transaction_id"] == target_tx_id
        assert "amount" in tx_detail
        assert "transaction_status" in tx_detail
        assert "src_account_id" in tx_detail
        assert "dst_account_id" in tx_detail
        _assert_no_forbidden_keys(tx_detail)


# ---------------------------------------------------------------------------
# 3. Community Risk Scorer Consistency
# ---------------------------------------------------------------------------


class TestCasesScoringConsistency:
    """Verifies that risk levels and scores used in case metadata are consistent with API."""

    @pytest.mark.parametrize("community_id", [3, 4, 18, 22])
    def test_risk_score_in_bounds(self, community_id: int) -> None:
        """Risk score is always an integer in [0, 100] and risk_level matches tier."""
        res = client.get(f"/api/communities/{community_id}")
        if res.status_code == 200:
            data = res.json()
            score = data["risk_score"]
            level = data["risk_level"]
            assert 0 <= score <= 100
            if score >= 60:
                assert level == "HIGH"
            elif score >= 35:
                assert level == "MEDIUM"
            else:
                assert level == "LOW"
            _assert_no_forbidden_keys(data)
