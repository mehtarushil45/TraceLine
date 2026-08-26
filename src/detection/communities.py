"""Louvain community detection over TraceLine's weighted account graph.

Runs NetworkX's Louvain community detection on the account-relationship
projection produced by :func:`src.graph.projection.project_account_graph`
and enriches every detected community with structural and temporal
statistics.

Guarantees
----------
* Deterministic: the NetworkX graph is built from sorted node/edge lists and
  Louvain runs with a fixed ``seed``; community ids are assigned by sorting
  members, so identical input always yields identical output.
* Label-free: detection uses only observable account-graph evidence.
  Evaluation-only label columns and fraud ground-truth files are never
  read anywhere in this module.
* Safe on small/isolated communities: singleton and low-activity communities
  get well-defined zero/None statistics instead of errors.

Temporal metric definitions
---------------------------
* ``transaction_count``: transactions whose accounts belong to the community.
* ``unique_active_hours``: distinct clock hours (00-23) across those
  transactions.
* ``median_inter_transaction_gap_hours``: median gap between consecutive
  community-wide transaction timestamps; ``None`` when fewer than two.
* ``timestamp_span_hours``: hours between first and last transaction.
* ``temporal_compression_score``:
  ``count / (count + span_hours)`` -- a bounded score in ``(0, 1]`` that
  approaches 1 when many transactions are packed into a short time window
  and falls toward 0 for temporally spread-out activity.
"""

from __future__ import annotations

import argparse
import itertools
import statistics
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import networkx as nx

from src.graph.builder import _REPO_ROOT, EdgeType, EvidenceGraph
from src.graph.projection import AccountEdge, AccountGraph

__all__ = [
    "Community",
    "CommunityTemporalStats",
    "detect_communities",
    "extract_account_activity",
    "summarize_communities",
]


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CommunityTemporalStats:
    """Temporal concentration statistics for one community."""

    transaction_count: int
    unique_active_hours: int
    median_inter_transaction_gap_hours: float | None
    timestamp_span_hours: float
    temporal_compression_score: float


@dataclass(frozen=True)
class Community:
    """A detected community with structure, evidence and temporal statistics."""

    community_id: int
    member_account_ids: tuple[str, ...]
    member_count: int
    internal_edge_count: int
    total_internal_weight: float
    density: float
    min_timestamp: str | None
    max_timestamp: str | None
    duration_hours: float | None
    temporal_stats: CommunityTemporalStats
    # Original account-edge evidence preserved verbatim (sorted by ids).
    internal_edges: tuple[AccountEdge, ...]

    def to_canonical(self) -> str:
        """Deterministic canonical JSON string of this community."""
        import json

        payload = {
            "community_id": self.community_id,
            "member_account_ids": list(self.member_account_ids),
            "member_count": self.member_count,
            "internal_edge_count": self.internal_edge_count,
            "total_internal_weight": self.total_internal_weight,
            "density": self.density,
            "min_timestamp": self.min_timestamp,
            "max_timestamp": self.max_timestamp,
            "duration_hours": self.duration_hours,
            "temporal_stats": {
                "transaction_count": self.temporal_stats.transaction_count,
                "unique_active_hours": self.temporal_stats.unique_active_hours,
                "median_gap": self.temporal_stats.median_inter_transaction_gap_hours,
                "span": self.temporal_stats.timestamp_span_hours,
                "compression": self.temporal_stats.temporal_compression_score,
            },
        }
        return json.dumps(payload, sort_keys=True)


# ---------------------------------------------------------------------------
# Temporal helpers
# ---------------------------------------------------------------------------


def extract_account_activity(
    evidence: EvidenceGraph,
) -> dict[str, tuple[str, ...]]:
    """Build account -> sorted unique ISO-timestamp tuples from the graph.

    An account's activity includes every transaction it sends or receives;
    timestamps come verbatim from observable transaction edges.
    """
    tx_accounts: dict[str, set[str]] = {}
    for edge_type in (EdgeType.FROM_ACCOUNT, EdgeType.TO_ACCOUNT):
        for edge in evidence.edges(edge_type):
            tx_accounts.setdefault(edge.src_id, set()).add(edge.dst_id)

    activity: dict[str, set[str]] = {}
    for edge in evidence.edges(EdgeType.FROM_ACCOUNT) + evidence.edges(
        EdgeType.TO_ACCOUNT
    ):
        timestamp = str(edge.attrs.get("timestamp", ""))
        if timestamp:
            activity.setdefault(edge.dst_id, set()).add(timestamp)

    return {acc: tuple(sorted(stamps)) for acc, stamps in sorted(activity.items())}


def _hours_between(start: datetime, end: datetime) -> float:
    """Hours between two datetimes as a non-negative float."""
    return (end - start).total_seconds() / 3600.0


def compute_temporal_stats(
    member_account_ids: Iterable[str],
    account_activity: Mapping[str, Sequence[str]] | None,
) -> tuple[CommunityTemporalStats, str | None, str | None, float | None]:
    """Compute temporal concentration statistics for a set of accounts.

    Returns:
        ``(stats, min_timestamp, max_timestamp, duration_hours)``. All values
        degrade safely to zero/``None`` when there is no activity.
    """
    stamps: list[str] = []
    if account_activity:
        seen: set[str] = set()
        for account in member_account_ids:
            for stamp in account_activity.get(account, ()):
                if stamp not in seen:
                    seen.add(stamp)
                    stamps.append(stamp)
        stamps.sort()

    count = len(stamps)
    if count == 0:
        stats = CommunityTemporalStats(
            transaction_count=0,
            unique_active_hours=0,
            median_inter_transaction_gap_hours=None,
            timestamp_span_hours=0.0,
            temporal_compression_score=0.0,
        )
        return stats, None, None, None

    unique_hours = len({s[11:13] for s in stamps})
    parsed = [datetime.fromisoformat(s) for s in stamps]
    span_hours = _hours_between(parsed[0], parsed[-1])
    median_gap: float | None = None
    if count >= 2:
        gaps = [_hours_between(a, b) for a, b in itertools.pairwise(parsed)]
        median_gap = round(statistics.median(gaps), 6)
    compression = (
        round(count / (count + span_hours), 6) if (count + span_hours) > 0 else 0.0
    )

    stats = CommunityTemporalStats(
        transaction_count=count,
        unique_active_hours=unique_hours,
        median_inter_transaction_gap_hours=median_gap,
        timestamp_span_hours=round(span_hours, 6),
        temporal_compression_score=compression,
    )
    return stats, stamps[0], stamps[-1], round(span_hours, 6)


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------


def _to_networkx(account_graph: AccountGraph) -> nx.Graph:
    """Convert the account projection into a deterministic NetworkX graph."""
    graph = nx.Graph()
    graph.add_nodes_from(sorted(account_graph.nodes))
    for edge in sorted(account_graph.edges.values(), key=lambda e: (e.src, e.dst)):
        graph.add_edge(edge.src, edge.dst, weight=edge.weight)
    return graph


def detect_communities(
    account_graph: AccountGraph,
    *,
    seed: int = 42,
    resolution: float = 1.0,
    account_activity: Mapping[str, Sequence[str]] | None = None,
) -> list[Community]:
    """Run Louvain community detection on the weighted account graph.

    Community ids are deterministic: raw Louvain partitions are re-ordered by
    their sorted member lists and numbered sequentially from zero, so the
    same graph + seed always yields identical ids regardless of dict ordering.

    Args:
        account_graph: Weighted account projection.
        seed: Random seed forwarded to Louvain.
        resolution: Louvain resolution parameter (higher -> more communities).
        account_activity: Optional map of account -> sorted ISO timestamps;
            when provided, temporal statistics are populated per community.

    Returns:
        A deterministic list of :class:`Community` objects.
    """
    nx_graph = _to_networkx(account_graph)
    raw_partitions = nx.community.louvain_communities(
        nx_graph, weight="weight", resolution=resolution, seed=seed
    )

    # Deterministic id assignment: order partitions by sorted members.
    ordered: list[list[str]] = sorted(
        (sorted(members) for members in raw_partitions), key=tuple
    )

    communities: list[Community] = []
    for community_id, members in enumerate(ordered):
        member_set = set(members)

        internal_edges = tuple(
            edge
            for _, edge in sorted(account_graph.edges.items())
            if edge.src in member_set and edge.dst in member_set
        )

        n_members = len(members)
        internal_edge_count = len(internal_edges)
        total_weight = sum(edge.weight for edge in internal_edges)
        possible_pairs = n_members * (n_members - 1) / 2.0
        density = (
            round(internal_edge_count / possible_pairs, 6)
            if possible_pairs > 0
            else 0.0
        )

        stats, min_ts, max_ts, duration = compute_temporal_stats(
            members, account_activity
        )

        communities.append(
            Community(
                community_id=community_id,
                member_account_ids=tuple(members),
                member_count=n_members,
                internal_edge_count=internal_edge_count,
                total_internal_weight=round(total_weight, 6),
                density=density,
                min_timestamp=min_ts,
                max_timestamp=max_ts,
                duration_hours=duration,
                temporal_stats=stats,
                internal_edges=internal_edges,
            )
        )
    return communities


def summarize_communities(communities: Sequence[Community]) -> dict[str, object]:
    """Aggregate summary statistics over a list of communities."""
    sizes = [c.member_count for c in communities]
    compressions = [
        c.temporal_stats.temporal_compression_score
        for c in communities
        if c.temporal_stats.transaction_count > 0
    ]
    return {
        "total_communities": len(communities),
        "accounts_covered": sum(sizes),
        "size_distribution": {
            str(size): sizes.count(size) for size in sorted(set(sizes))
        },
        "communities_size_ge_3": sum(1 for s in sizes if s >= 3),
        "largest_communities": [
            {"community_id": c.community_id, "member_count": c.member_count}
            for c in sorted(
                communities, key=lambda x: (-x.member_count, x.community_id)
            )[:10]
        ],
        "temporal": {
            "communities_with_activity": len(compressions),
            "mean_compression": (
                round(sum(compressions) / len(compressions), 6)
                if compressions
                else 0.0
            ),
            "max_compression": max(compressions) if compressions else 0.0,
            "total_transactions_in_communities": sum(
                c.temporal_stats.transaction_count for c in communities
            ),
            "multi_member_communities": sum(1 for s in sizes if s >= 2),
        },
    }


def main(argv: list[str] | None = None) -> int:
    """CLI entry point: build graphs, run detection, print a report."""
    import json
    import time

    parser = argparse.ArgumentParser(
        description="Run Louvain community detection on the TraceLine account graph."
    )
    parser.add_argument(
        "--processed-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "processed" / "payment_network",
        help="Directory with enrichment outputs.",
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Max transactions to load."
    )
    parser.add_argument("--seed", type=int, default=42, help="Louvain random seed.")
    parser.add_argument("--resolution", type=float, default=1.0)
    parser.add_argument("--top", type=int, default=10)
    args = parser.parse_args(argv)

    from src.graph.builder import build_evidence_graph
    from src.graph.projection import project_account_graph

    started = time.perf_counter()
    evidence = build_evidence_graph(args.processed_dir, limit=args.limit)
    account_graph = project_account_graph(evidence)
    activity = extract_account_activity(evidence)
    build_seconds = time.perf_counter() - started

    detect_started = time.perf_counter()
    communities = detect_communities(
        account_graph,
        seed=args.seed,
        resolution=args.resolution,
        account_activity=activity,
    )
    detect_seconds = time.perf_counter() - detect_started

    summary = summarize_communities(communities)
    print("=== TraceLine community detection report ===")
    print(json.dumps(summary, indent=2, sort_keys=True))
    print(f"\nGraph+projection build time : {build_seconds:.3f}s")
    print(f"Louvain + enrichment runtime: {detect_seconds:.3f}s")

    print(f"\nTop {args.top} communities by size:")
    ranked = sorted(
        communities,
        key=lambda c: (-c.member_count, -c.total_internal_weight, c.community_id),
    )
    for community in ranked[: args.top]:
        t = community.temporal_stats
        print(
            f"  id={community.community_id:>4}  size={community.member_count:>5}  "
            f"weight={community.total_internal_weight:>10.2f}  "
            f"density={community.density:.4f}  tx={t.transaction_count:>6}  "
            f"active_h={t.unique_active_hours:>3}  "
            f"gap_h={t.median_inter_transaction_gap_hours}  "
            f"span_h={t.timestamp_span_hours:>9.2f}  "
            f"compression={t.temporal_compression_score}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
