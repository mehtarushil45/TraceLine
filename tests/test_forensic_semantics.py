"""Tests for Forensic Workspace Semantics & Evidence Traceability Contracts.

Verifies:
1. Supporting entities taxonomy:
   - TEMPORAL_BURST produces transaction IDs in supporting_entities.
   - HUB_ACCOUNT produces account IDs in supporting_entities.
   - Community-level evidence (HIGH_EVIDENCE_DENSITY) produces empty supporting_entities.
2. Temporal metrics structure (transaction_count, window_minutes, start_timestamp, end_timestamp).
"""

from __future__ import annotations

import pandas as pd
import pytest

from src.intelligence.evidence_engine import (
    _detect_temporal_burst,
    _detect_hub_accounts,
    _detect_high_evidence_density,
)
from src.intelligence.evidence_rules import EvidenceSeverity, EvidenceType


def test_temporal_burst_supporting_entities_are_transaction_ids():
    """Verify that TEMPORAL_BURST evidence items emit transaction IDs as supporting entities,
    not account IDs, so the frontend must distinguish signal focus from investigation focal.
    """
    timestamps = [
        pd.Timestamp("2026-03-01 10:00:00"),
        pd.Timestamp("2026-03-01 10:05:00"),
        pd.Timestamp("2026-03-01 10:10:00"),
        pd.Timestamp("2026-03-01 10:15:00"),
        pd.Timestamp("2026-03-01 10:20:00"),
        pd.Timestamp("2026-03-01 10:25:00"),
        pd.Timestamp("2026-03-01 10:30:00"),
        pd.Timestamp("2026-03-01 10:35:00"),
        pd.Timestamp("2026-03-01 10:40:00"),
        pd.Timestamp("2026-03-01 10:45:00"),
        pd.Timestamp("2026-03-01 10:50:00"),
        pd.Timestamp("2026-03-01 10:55:00"),
    ]
    tx_ids = [f"tx_10368{i}" for i in range(len(timestamps))]
    tx_df = pd.DataFrame({
        "transaction_id": tx_ids,
        "src_account_id": ["acc_001"] * len(timestamps),
        "dst_account_id": ["acc_002"] * len(timestamps),
        "timestamp": timestamps,
        "amount": [100.0] * len(timestamps),
    })
    sent_idx = {"acc_001": list(range(len(timestamps)))}
    recv_idx = {"acc_002": list(range(len(timestamps)))}

    items = _detect_temporal_burst(
        ["acc_001", "acc_002"], tx_df, sent_idx, recv_idx, "COMMUNITY", "42"
    )

    assert len(items) > 0
    burst_item = items[0]
    assert burst_item.type == EvidenceType.TEMPORAL_BURST

    # Check metrics
    assert "transaction_count" in burst_item.metrics
    assert "window_minutes" in burst_item.metrics
    assert burst_item.metrics["transaction_count"] == len(timestamps)

    # Verify supporting entities are transaction IDs
    assert len(burst_item.supporting_entities) > 0
    for entity_id in burst_item.supporting_entities:
        assert entity_id.startswith("tx_"), f"Expected transaction ID, got: {entity_id}"
        assert not entity_id.startswith("acc_")


def test_hub_account_supporting_entities_are_account_ids():
    """Verify that HUB_ACCOUNT evidence items emit account IDs, which CAN serve as
    an investigation focal.
    """
    accounts = [f"acc_{i:03d}" for i in range(20)]
    hub_account = "acc_000"
    edges = []
    # hub connects to all 19 other accounts
    for acc in accounts[1:]:
        edges.append({"source": hub_account, "target": acc})
    # other accounts have 0 or 1 edge
    edges.append({"source": accounts[1], "target": accounts[2]})

    items = _detect_hub_accounts(
        community_accounts=accounts,
        community_edges=edges,
        entity_type="COMMUNITY",
        entity_id="42",
    )

    assert len(items) > 0
    hub_item = items[0]
    assert hub_item.type == EvidenceType.HUB_ACCOUNT
    assert hub_item.supporting_entities == [hub_account]
    for entity_id in hub_item.supporting_entities:
        assert entity_id.startswith("acc_")
        assert not entity_id.startswith("tx_")


def test_community_level_evidence_has_no_transaction_mapping():
    """Verify that community topology density evidence items emit empty supporting entities,
    confirming they are genuinely community-level signals with no individual transaction mapping.
    """
    features_df = pd.DataFrame(
        [
            {
                "weight_per_member": 15.0,
                "mean_edge_weight": 5.0,
                "density": 0.45,
                "member_count": 25,
            }
        ],
        index=[42],
    )

    items = _detect_high_evidence_density(
        community_id=42,
        features_df=features_df,
        entity_type="COMMUNITY",
        entity_id="42",
    )

    assert len(items) > 0
    density_item = items[0]
    assert density_item.type == EvidenceType.HIGH_EVIDENCE_DENSITY
    assert density_item.supporting_entities == []
