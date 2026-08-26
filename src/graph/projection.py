"""Account-relationship projection of the heterogeneous evidence graph.

Collapses the typed evidence graph down to an account-to-account graph.
Two accounts are connected when they share at least one observable entity
(payment instrument, device, merchant via transactions, or IP address).

Evidence-specific base weights (strongest -> weakest)::

    shared payment instrument : 4.0
    shared device             : 3.0
    shared merchant           : 2.0
    shared IP                 : 1.0

Within one evidence kind, additional shared entities contribute with
diminishing returns (square-root scaling). The final edge weight is::

    weight = sum_t w_t * sqrt(count_t) * temporal_multiplier

where ``temporal_multiplier`` grows with the number of calendar days on which
*both* accounts have transactions (1.0 with no overlap, +0.25 per shared day,
capped at 2.0).

All construction is deterministic: entity indexes and pair accumulation run
over sorted ids only, and no evaluation label (``pattern_id`` /
``is_ring_member``) is read anywhere.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

from src.graph.builder import EdgeType, EvidenceGraph, NodeType

#: Base weights per evidence kind, strongest to weakest.
EVIDENCE_BASE_WEIGHTS: dict[str, float] = {
    "instrument": 4.0,
    "device": 3.0,
    "merchant": 2.0,
    "ip": 1.0,
}

#: Multiplier added per day of temporal overlap between two accounts.
TEMPORAL_STEP = 0.25

#: Upper bound of the temporal multiplier.
TEMPORAL_MAX_MULTIPLIER = 2.0


def temporal_multiplier(overlap_days: int) -> float:
    """Return the temporal-overlap multiplier for a number of shared days.

    Args:
        overlap_days: Calendar days on which both accounts were active.

    Returns:
        1.0 when there is no overlap; otherwise ``min(1 + 0.25 * days, 2.0)``.
    """
    if overlap_days <= 0:
        return 1.0
    return min(1.0 + TEMPORAL_STEP * overlap_days, TEMPORAL_MAX_MULTIPLIER)


def evidence_weight(
    *,
    instruments: int = 0,
    devices: int = 0,
    merchants: int = 0,
    ips: int = 0,
    temporal_overlap_days: int = 0,
) -> float:
    """Compute the deterministic account-pair weight from evidence counts.

    Args:
        instruments: Number of shared payment instruments (strongest).
        devices: Number of shared devices (strong).
        merchants: Number of shared merchants (moderate).
        ips: Number of shared IPs (weak).
        temporal_overlap_days: Days both accounts have transactions.

    Returns:
        Rounded float weight >= 0.
    """
    base = (
        EVIDENCE_BASE_WEIGHTS["instrument"] * math.sqrt(max(instruments, 0))
        + EVIDENCE_BASE_WEIGHTS["device"] * math.sqrt(max(devices, 0))
        + EVIDENCE_BASE_WEIGHTS["merchant"] * math.sqrt(max(merchants, 0))
        + EVIDENCE_BASE_WEIGHTS["ip"] * math.sqrt(max(ips, 0))
    )
    return round(base * temporal_multiplier(temporal_overlap_days), 6)


@dataclass(frozen=True)
class AccountEdge:
    """An account-account edge with the full evidence behind it.

    All shared-entity fields are sorted tuples of entity ids; ``weight`` is
    the evidence weight computed by :func:`evidence_weight`.
    """

    src: str
    dst: str
    shared_devices: tuple[str, ...]
    shared_instruments: tuple[str, ...]
    shared_ips: tuple[str, ...]
    shared_merchants: tuple[str, ...]
    temporal_overlap: int
    weight: float


class AccountGraph:
    """Undirected account-relationship graph with weighted evidence edges."""

    def __init__(
        self,
        nodes: tuple[str, ...],
        edges: dict[tuple[str, str], AccountEdge],
    ) -> None:
        self.nodes = nodes
        self.edges = edges

    def edge(self, a: str, b: str) -> AccountEdge | None:
        """Return the edge between accounts ``a`` and ``b`` if one exists."""
        return self.edges.get((a, b) if a < b else (b, a))

    def top_edges(self, n: int) -> list[AccountEdge]:
        """The ``n`` highest-weight edges (deterministic tie-break by ids)."""
        ordered = sorted(
            self.edges.values(), key=lambda e: (-e.weight, e.src, e.dst)
        )
        return ordered[:n]

    def to_dataframe(self):
        """Edges as a sorted pandas DataFrame (entity lists pipe-joined)."""
        import pandas as pd

        rows = [
            {
                "src_account_id": e.src,
                "dst_account_id": e.dst,
                "weight": e.weight,
                "temporal_overlap": e.temporal_overlap,
                "shared_devices": "|".join(e.shared_devices),
                "shared_instruments": "|".join(e.shared_instruments),
                "shared_merchants": "|".join(e.shared_merchants),
                "shared_ips": "|".join(e.shared_ips),
            }
            for e in sorted(self.edges.values(), key=lambda x: (x.src, x.dst))
        ]
        return pd.DataFrame(rows)

    def to_canonical(self) -> str:
        """Deterministic canonical JSON string of nodes and edges."""
        payload = {
            "nodes": list(self.nodes),
            "edges": [
                {
                    "src": e.src,
                    "dst": e.dst,
                    "shared_devices": list(e.shared_devices),
                    "shared_instruments": list(e.shared_instruments),
                    "shared_ips": list(e.shared_ips),
                    "shared_merchants": list(e.shared_merchants),
                    "temporal_overlap": e.temporal_overlap,
                    "weight": e.weight,
                }
                for e in sorted(self.edges.values(), key=lambda x: (x.src, x.dst))
            ],
        }
        return json.dumps(payload, sort_keys=True)


class _PairEvidence:
    """Compact memory-bounded evidence accumulator for one account pair."""

    __slots__ = ("devices", "instruments", "ips", "merchants")

    def __init__(self) -> None:
        self.instruments: set[str] = set()
        self.devices: set[str] = set()
        self.merchants: set[str] = set()
        self.ips: set[str] = set()


def _to_sorted_tuple(s: set[str]) -> tuple[str, ...]:
    """Convert a set of strings to a sorted tuple (fast paths for 0 and 1 items)."""
    n = len(s)
    if n == 0:
        return ()
    if n == 1:
        return (next(iter(s)),)
    return tuple(sorted(s))


def project_account_graph(evidence: EvidenceGraph) -> AccountGraph:
    """Project the heterogeneous evidence graph onto accounts.

    Candidate pairs are discovered via inverted indexes (entity -> accounts),
    never by all-pairs comparison. Merchant sharing is indexed temporally
    by (merchant_id, calendar_date) to capture coordinated same-day activity
    without materializing enormous O(N^2) merchant cliques.

    Args:
        evidence: The typed evidence graph from :func:`build_evidence_graph`.

    Returns:
        An :class:`AccountGraph` whose edges carry full evidence metadata.
    """
    accounts = {n.id for n in evidence.nodes(NodeType.ACCOUNT)}

    def _index_uses(edge_type: EdgeType) -> dict[str, set[str]]:
        """Inverted index entity -> accounts for one USES_* relation."""
        index: dict[str, set[str]] = {}
        for edge in evidence.edges(edge_type):
            index.setdefault(edge.dst_id, set()).add(edge.src_id)
        return index

    device_index = _index_uses(EdgeType.USES_DEVICE)
    instrument_index = _index_uses(EdgeType.USES_INSTRUMENT)
    ip_index = _index_uses(EdgeType.USES_IP)

    # Participant accounts per transaction.
    tx_accounts: dict[str, set[str]] = {}
    for edge_type in (EdgeType.FROM_ACCOUNT, EdgeType.TO_ACCOUNT):
        for edge in evidence.edges(edge_type):
            tx_accounts.setdefault(edge.src_id, set()).add(edge.dst_id)

    # Merchant co-occurrence indexed temporally: (merchant_id, date) -> accounts.
    # Same-day merchant co-occurrence captures coordinated bursts while preventing
    # unconstrained bipartite clique explosion.
    merchant_day_index: dict[tuple[str, str], set[str]] = {}
    for edge in evidence.edges(EdgeType.AT_MERCHANT):
        tx_id = edge.src_id
        merchant = edge.dst_id
        day = str(edge.attrs.get("timestamp", ""))[:10]
        if day:
            participants = tx_accounts.get(tx_id, set())
            merchant_day_index.setdefault((merchant, day), set()).update(participants)

    # Temporal activity: calendar days per account from transaction timestamps.
    account_days: dict[str, set[str]] = {}
    for edge_type in (EdgeType.FROM_ACCOUNT, EdgeType.TO_ACCOUNT):
        for edge in evidence.edges(edge_type):
            day = str(edge.attrs.get("timestamp", ""))[:10]
            if day:
                account_days.setdefault(edge.dst_id, set()).add(day)

    # Accumulate pair evidence over sorted ids (deterministic order).
    pair_evidence: dict[tuple[str, str], _PairEvidence] = {}

    # Primary entity indexes: instrument, device, IP
    for entity in sorted(instrument_index):
        participants = instrument_index[entity] & accounts
        if len(participants) < 2:
            continue
        for a, b in _pairs(sorted(participants)):
            pair_evidence.setdefault((a, b), _PairEvidence()).instruments.add(entity)

    for entity in sorted(device_index):
        participants = device_index[entity] & accounts
        if len(participants) < 2:
            continue
        for a, b in _pairs(sorted(participants)):
            pair_evidence.setdefault((a, b), _PairEvidence()).devices.add(entity)

    for entity in sorted(ip_index):
        participants = ip_index[entity] & accounts
        if len(participants) < 2:
            continue
        for a, b in _pairs(sorted(participants)):
            pair_evidence.setdefault((a, b), _PairEvidence()).ips.add(entity)

    # Temporal merchant co-occurrence: (merchant, day)
    for (merchant, day) in sorted(merchant_day_index):
        participants = merchant_day_index[(merchant, day)] & accounts
        if len(participants) < 2:
            continue
        for a, b in _pairs(sorted(participants)):
            pair_evidence.setdefault((a, b), _PairEvidence()).merchants.add(merchant)

    edges: dict[tuple[str, str], AccountEdge] = {}
    for (a, b) in sorted(pair_evidence.keys()):
        ev = pair_evidence[(a, b)]
        days_a = account_days.get(a)
        days_b = account_days.get(b)
        overlap_days = len(days_a & days_b) if (days_a is not None and days_b is not None) else 0
        weight = evidence_weight(
            instruments=len(ev.instruments),
            devices=len(ev.devices),
            merchants=len(ev.merchants),
            ips=len(ev.ips),
            temporal_overlap_days=overlap_days,
        )
        edges[(a, b)] = AccountEdge(
            src=a,
            dst=b,
            shared_devices=_to_sorted_tuple(ev.devices),
            shared_instruments=_to_sorted_tuple(ev.instruments),
            shared_ips=_to_sorted_tuple(ev.ips),
            shared_merchants=_to_sorted_tuple(ev.merchants),
            temporal_overlap=overlap_days,
            weight=weight,
        )

    return AccountGraph(nodes=tuple(sorted(accounts)), edges=edges)


def _pairs(sorted_ids: list[str]) -> list[tuple[str, str]]:
    """All unique pairs of a sorted id list, in lexicographic order."""
    return [
        (sorted_ids[i], sorted_ids[j])
        for i in range(len(sorted_ids))
        for j in range(i + 1, len(sorted_ids))
    ]

