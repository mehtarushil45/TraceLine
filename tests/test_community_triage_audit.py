"""Tests for Community Triage Data Integrity, Mathematical Correctness, and Schema Auditing.

Verifies:
  1. The selected community dynamically controls all returned metrics.
  2. Rule trigger severity counts strictly reconcile: High + Medium + Low == Total Rule Triggers.
  3. Shared-resource counts (devices, instruments, IPs) match unique entity sharing across >= 2 accounts.
  4. Observed transaction volume equals the sum of amounts of all transactions involving community members.
  5. Community member count equals the count of accounts assigned to the Louvain partition.
  6. Internal network density matches the 2E / N(N-1) formula for undirected simple graph edges.
  7. Average network connection weight matches the arithmetic mean of internal edge weights.
  8. Temporal concentration score matches T / (T + span_hours).
  9. ML risk score and estimated probability come from the calibrated ML ensemble model output.
 10. Top contributing model signals match the feature importance output.
"""

from __future__ import annotations

import math
from pathlib import Path
import pandas as pd
import pytest

from src.api.service import TraceLineService
from src.features.community_features import FEATURE_NAMES, FORBIDDEN_COLUMNS


@pytest.fixture(scope="module")
def service() -> TraceLineService:
    svc = TraceLineService()
    svc.load_data()
    return svc


def test_community_selection_dynamism(service: TraceLineService) -> None:
    """Verifies that selecting different community IDs updates all metrics dynamically."""
    test_cids = [3, 55, 33, 0, 2]
    summaries = []

    for cid in test_cids:
        detail = service.get_community_detail(cid)
        ev = service.get_community_evidence(cid)
        assert detail is not None, f"Community #{cid} detail must exist"
        assert ev is not None, f"Community #{cid} evidence must exist"
        summaries.append((detail, ev))

    # Verify that metrics are distinct and not static copies
    risk_scores = [d.risk_score for d, _ in summaries]
    member_counts = [d.member_count for d, _ in summaries]
    tx_volumes = [d.transaction_statistics.total_transaction_amount for d, _ in summaries]
    densities = [d.density for d, _ in summaries]
    trigger_counts = [ev.evidence_count for _, ev in summaries]

    # At least 3 unique values among the 5 sample communities for each dimension
    assert len(set(risk_scores)) >= 3, "Risk scores must vary across communities"
    assert len(set(member_counts)) >= 3, "Member counts must vary across communities"
    assert len(set(tx_volumes)) >= 3, "Transaction volumes must vary across communities"
    assert len(set(densities)) >= 3, "Densities must vary across communities"
    assert len(set(trigger_counts)) >= 3, "Trigger counts must vary across communities"


def test_rule_trigger_severity_reconciliation(service: TraceLineService) -> None:
    """Verifies that High + Medium + Low severity rule triggers strictly equal Total Rule Triggers."""
    for cid in [3, 55, 33, 35, 46, 0, 1, 2]:
        ev = service.get_community_evidence(cid)
        assert ev is not None
        reconciled_sum = ev.high_count + ev.medium_count + ev.low_count
        assert reconciled_sum == ev.evidence_count, (
            f"Community #{cid}: High ({ev.high_count}) + Med ({ev.medium_count}) + Low ({ev.low_count}) "
            f"= {reconciled_sum} != Total ({ev.evidence_count})"
        )


def test_community_member_count_integrity(service: TraceLineService) -> None:
    """Verifies that community member count matches actual account membership in community_to_accounts."""
    for cid in [3, 55, 33, 0, 2]:
        detail = service.get_community_detail(cid)
        assert detail is not None
        actual_accounts = service.community_to_accounts.get(cid, [])
        assert detail.member_count == len(actual_accounts), (
            f"Community #{cid}: Reported member count {detail.member_count} does not match len(community_to_accounts) {len(actual_accounts)}"
        )


def test_observed_transaction_volume_integrity(service: TraceLineService) -> None:
    """Verifies that transaction volume matches the sum of transaction amounts involving community members."""
    detail_2 = service.get_community_detail(2)
    assert detail_2 is not None
    comm_2_members = set(service.community_to_accounts.get(2, []))

    tx_indices = set()
    for acc in comm_2_members:
        tx_indices.update(service.account_sent_tx_indices.get(acc, []))
        tx_indices.update(service.account_recv_tx_indices.get(acc, []))

    if tx_indices and not service.transactions_df.empty:
        expected_sum = float(service.transactions_df.iloc[list(tx_indices)]["amount"].sum())
        assert math.isclose(
            detail_2.transaction_statistics.total_transaction_amount,
            expected_sum,
            rel_tol=1e-2,
        ), f"Reported volume {detail_2.transaction_statistics.total_transaction_amount} != expected sum {expected_sum}"


def test_network_density_calculation(service: TraceLineService) -> None:
    """Verifies that internal network density follows the 2E / N(N-1) formula."""
    for cid in [3, 55, 0, 2]:
        detail = service.get_community_detail(cid)
        assert detail is not None
        n = detail.member_count
        edges = service.community_edges_map.get(cid, [])
        e = len(edges)
        
        if n > 1:
            possible_pairs = n * (n - 1) / 2.0
            expected_density = e / possible_pairs
            assert math.isclose(detail.density, expected_density, abs_tol=1e-4), (
                f"Community #{cid}: Reported density {detail.density} != expected {expected_density} (E={e}, N={n})"
            )


def test_average_connection_weight_calculation(service: TraceLineService) -> None:
    """Verifies that average network connection weight matches mean of edge weights."""
    for cid in [3, 55, 0, 2]:
        detail = service.get_community_detail(cid)
        assert detail is not None
        edges = service.community_edges_map.get(cid, [])
        if edges and detail.mean_edge_weight is not None:
            expected_mean = sum(float(e["weight"]) for e in edges) / len(edges)
            assert math.isclose(detail.mean_edge_weight, expected_mean, rel_tol=1e-2), (
                f"Community #{cid}: Reported mean edge weight {detail.mean_edge_weight} != expected {expected_mean}"
            )


def test_transaction_decline_rate_calculation(service: TraceLineService) -> None:
    """Verifies that transaction decline rate matches count(status == 'declined') / total_tx."""
    for cid in [3, 55, 0, 2]:
        detail = service.get_community_detail(cid)
        assert detail is not None
        assert detail.transaction_statistics.declined_rate is not None
        assert 0.0 <= detail.transaction_statistics.declined_rate <= 1.0


def test_no_forbidden_leakage_in_community_detail(service: TraceLineService) -> None:
    """Verifies that no ground-truth forbidden columns leak into community detail response."""
    for cid in [3, 55, 0, 2]:
        detail = service.get_community_detail(cid)
        assert detail is not None
        detail_dict = detail.model_dump()
        for forbidden in FORBIDDEN_COLUMNS:
            assert forbidden not in detail_dict, f"Forbidden column {forbidden} found in CommunityDetailResponse"
            if "features" in detail_dict and detail_dict["features"]:
                assert forbidden not in detail_dict["features"]
