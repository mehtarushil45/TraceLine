"""Tests for TraceLine's community detection layer.

The fixture hand-crafts an ``AccountGraph`` with two dense clusters joined by
one weak bridge plus an isolated account, so the expected partition is known
exactly without any evaluation labels.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from src.detection.communities import (
    Community,
    compute_temporal_stats,
    detect_communities,
    extract_account_activity,
    summarize_communities,
)
from src.graph.projection import AccountEdge, AccountGraph


# ---------------------------------------------------------------------------
# Fixture builders
# ---------------------------------------------------------------------------


def _edge(src: str, dst: str, weight: float) -> AccountEdge:
    """Build a symmetric evidence edge with only a device shared."""
    key = (src, dst) if src < dst else (dst, src)
    return AccountEdge(
        src=key[0],
        dst=key[1],
        shared_devices=(f"dev_{key[0]}_{key[1]}",),
        shared_instruments=(),
        shared_ips=(),
        shared_merchants=(),
        temporal_overlap=0,
        weight=weight,
    )


@pytest.fixture(scope="module")
def account_graph() -> AccountGraph:
    """Two dense clusters (triangle each) + weak bridge + isolated account."""
    nodes = (
        "acc_a1",
        "acc_a2",
        "acc_a3",
        "acc_b1",
        "acc_b2",
        "acc_b3",
        "acc_solo",
    )
    edges_list = [
        # Cluster A: complete triangle, strong weights.
        _edge("acc_a1", "acc_a2", 10.0),
        _edge("acc_a1", "acc_a3", 10.0),
        _edge("acc_a2", "acc_a3", 10.0),
        # Cluster B: complete triangle, strong weights.
        _edge("acc_b1", "acc_b2", 8.0),
        _edge("acc_b1", "acc_b3", 8.0),
        _edge("acc_b2", "acc_b3", 8.0),
        # Single weak cross-cluster bridge.
        _edge("acc_a1", "acc_b1", 0.5),
    ]
    edges = {(e.src, e.dst): e for e in edges_list}
    return AccountGraph(nodes=nodes, edges=edges)


COMPRESSED_ACTIVITY = {
    "acc_a1": ("2024-01-05T10:00:00",),
    "acc_a2": ("2024-01-05T10:20:00",),
    "acc_a3": ("2024-01-05T10:40:00",),
}

SPREAD_ACTIVITY = {
    "acc_b1": ("2024-01-01T09:00:00",),
    "acc_b2": ("2024-01-03T15:00:00",),
    "acc_b3": ("2024-01-07T11:00:00",),
}


@pytest.fixture(scope="module")
def communities(account_graph: AccountGraph) -> list[Community]:
    """Detect communities with combined activity data (module scope)."""
    activity = {**COMPRESSED_ACTIVITY, **SPREAD_ACTIVITY}
    return detect_communities(account_graph, seed=42, account_activity=activity)


def _find_community(
    communities: list[Community], *members: str
) -> Community | None:
    """Return the community containing all given members, else None."""
    wanted = set(members)
    for community in communities:
        if wanted <= set(community.member_account_ids):
            return community
    return None


# ---------------------------------------------------------------------------
# 1. A known hand-crafted community is detected with correct statistics
# ---------------------------------------------------------------------------


def test_known_hand_crafted_community(account_graph: AccountGraph) -> None:
    """The dense triangle forms one community; its stats are exact."""
    activity = {**COMPRESSED_ACTIVITY, **SPREAD_ACTIVITY}
    detected = detect_communities(account_graph, seed=42, account_activity=activity)

    community_a = _find_community(detected, "acc_a1", "acc_a2", "acc_a3")
    assert community_a is not None, "dense triangle must stay in one community"

    assert community_a.member_count == 3
    assert set(community_a.member_account_ids) == {"acc_a1", "acc_a2", "acc_a3"}
    assert community_a.internal_edge_count == 3
    assert community_a.total_internal_weight == pytest.approx(30.0)
    assert community_a.density == pytest.approx(1.0)  # complete subgraph

    # Original edge evidence preserved verbatim.
    assert len(community_a.internal_edges) == 3
    evidence_pairs = {(e.src, e.dst) for e in community_a.internal_edges}
    assert ("acc_a1", "acc_a2") in evidence_pairs
    for e in community_a.internal_edges:
        assert e.shared_devices, "preserved edges keep their evidence"

    # Compressed temporal signature of cluster A.
    assert community_a.min_timestamp == "2024-01-05T10:00:00"
    assert community_a.max_timestamp == "2024-01-05T10:40:00"
    assert community_a.duration_hours == pytest.approx(2 / 3)

    # Every account appears exactly once across the partition.
    all_members = [m for c in detected for m in c.member_account_ids]
    assert sorted(all_members) == sorted(account_graph.nodes)


def test_temporal_contrast_between_communities(
    account_graph: AccountGraph,
) -> None:
    """The compressed cluster scores higher than the spread-out cluster."""
    activity = {**COMPRESSED_ACTIVITY, **SPREAD_ACTIVITY}
    detected = detect_communities(account_graph, seed=42, account_activity=activity)
    community_a = _find_community(detected, "acc_a1", "acc_a2", "acc_a3")
    community_b = _find_community(detected, "acc_b1", "acc_b2", "acc_b3")
    assert community_a is not None and community_b is not None

    ta, tb = community_a.temporal_stats, community_b.temporal_stats
    assert ta.temporal_compression_score > tb.temporal_compression_score
    assert ta.unique_active_hours == 1
    assert tb.unique_active_hours == 3

    summary = summarize_communities(detected)
    assert summary["total_communities"] == len(detected)
    assert summary["accounts_covered"] == len(account_graph.nodes)


# ---------------------------------------------------------------------------
# 2. Isolated accounts are handled safely
# ---------------------------------------------------------------------------


def test_isolated_accounts_handled(account_graph: AccountGraph) -> None:
    """An isolated account becomes a safe singleton community."""
    detected = detect_communities(account_graph, seed=42)

    solo = _find_community(detected, "acc_solo")
    assert solo is not None, "isolated account must appear as its own community"
    assert solo.member_count == 1
    assert solo.member_account_ids == ("acc_solo",)
    assert solo.internal_edge_count == 0
    assert solo.total_internal_weight == 0.0
    assert solo.density == 0.0
    assert solo.min_timestamp is None
    assert solo.max_timestamp is None
    assert solo.duration_hours is None
    assert solo.internal_edges == ()
    assert solo.temporal_stats.transaction_count == 0
    assert solo.temporal_stats.median_inter_transaction_gap_hours is None
    assert solo.temporal_stats.temporal_compression_score == 0.0

    # An empty graph degenerates to singletons without errors.
    empty = AccountGraph(nodes=("x1", "x2"), edges={})
    empty_communities = detect_communities(empty, seed=42)
    assert {c.member_count for c in empty_communities} == {1}


# ---------------------------------------------------------------------------
# 3. Deterministic community output
# ---------------------------------------------------------------------------


def test_deterministic_community_output(account_graph: AccountGraph) -> None:
    """Same graph + seed produce identical communities and ids."""
    activity = {**COMPRESSED_ACTIVITY, **SPREAD_ACTIVITY}
    run_a = detect_communities(account_graph, seed=42, account_activity=activity)
    run_b = detect_communities(account_graph, seed=42, account_activity=activity)

    canon_a = [c.to_canonical() for c in run_a]
    canon_b = [c.to_canonical() for c in run_b]
    assert canon_a == canon_b

    ids_a = [c.community_id for c in run_a]
    assert ids_a == sorted(ids_a)  # ids are sequential from zero
    assert ids_a == [c.community_id for c in run_b]

    # Same partition regardless of insertion order of the same edges.
    reversed_edges = dict(reversed(list(account_graph.edges.items())))
    mirrored = AccountGraph(nodes=tuple(sorted(account_graph.nodes)), edges=reversed_edges)
    run_c = detect_communities(mirrored, seed=42, account_activity=activity)
    assert [c.to_canonical() for c in run_c] == canon_a


# ---------------------------------------------------------------------------
# 4. Temporal compression calculation
# ---------------------------------------------------------------------------


def test_temporal_compression_calculation() -> None:
    """Exact values for the temporal statistics on crafted timestamps."""
    # Compressed: three transactions within ~40 minutes.
    stats, min_ts, max_ts, duration = compute_temporal_stats(
        ["a", "b", "c"],
        {
            "a": ("2024-01-05T10:00:00",),
            "b": ("2024-01-05T10:20:00",),
            "c": ("2024-01-05T10:40:00",),
        },
    )
    assert stats.transaction_count == 3
    assert stats.unique_active_hours == 1
    assert stats.median_inter_transaction_gap_hours == pytest.approx(1 / 3)
    assert stats.timestamp_span_hours == pytest.approx(2 / 3)
    assert stats.temporal_compression_score == pytest.approx(3 / (3 + 2 / 3))
    assert min_ts == "2024-01-05T10:00:00"
    assert max_ts == "2024-01-05T10:40:00"
    assert duration == pytest.approx(2 / 3)

    # Sparse: two transactions a full day apart.
    sparse, _, _, _ = compute_temporal_stats(
        ["x", "y"],
        {"x": ("2024-01-01T00:00:00",), "y": ("2024-01-02T12:00:00",)},
    )
    assert sparse.timestamp_span_hours == 36.0
    assert sparse.median_inter_transaction_gap_hours == 36.0
    assert sparse.unique_active_hours == 2
    assert sparse.temporal_compression_score == pytest.approx(2 / (2 + 36), abs=1e-6)
    assert sparse.temporal_compression_score < stats.temporal_compression_score

    # Single transaction: gap undefined, span zero, score one.
    single, mn, mx, dur = compute_temporal_stats(
        ["z"], {"z": ("2024-06-01T08:30:00",)}
    )
    assert single.transaction_count == 1
    assert single.median_inter_transaction_gap_hours is None
    assert single.timestamp_span_hours == 0.0
    assert single.temporal_compression_score == pytest.approx(1.0)
    assert mn == mx and dur == 0.0

    # No activity at all degrades safely.
    empty, mn_e, mx_e, dur_e = compute_temporal_stats(["n1", "n2"], None)
    assert empty.transaction_count == 0
    assert empty.median_inter_transaction_gap_hours is None
    assert empty.temporal_compression_score == 0.0
    assert (mn_e, mx_e, dur_e) == (None, None, None)


# ---------------------------------------------------------------------------
# 5. No evaluation-label access anywhere in the detection layer
# ---------------------------------------------------------------------------


def test_no_evaluation_label_access() -> None:
    """The detector source never references evaluation labels or fraud files."""
    source_path = Path(__file__).resolve().parents[1] / "src" / "detection" / "communities.py"
    source = source_path.read_text(encoding="utf-8").lower()

    for forbidden in (
        "pattern_id",
        "is_ring_member",
        "fraud_cases",
        "transactions_fraud",
    ):
        assert forbidden not in source, (
            f"detection layer must never reference '{forbidden}'"
        )

    # Communities built from observable evidence carry no label attributes.
    activity = {**COMPRESSED_ACTIVITY, **SPREAD_ACTIVITY}
    edge = _edge("p", "q", 5.0)
    graph = AccountGraph(nodes=("p", "q"), edges={(edge.src, edge.dst): edge})
    detected = detect_communities(graph, seed=42, account_activity=activity)
    canon = "".join(c.to_canonical() for c in detected).lower()
    for forbidden in ("pattern_id", "is_ring_member"):
        assert forbidden not in canon
