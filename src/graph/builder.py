"""Heterogeneous evidence-graph construction for TraceLine.

Builds a typed property graph from the enriched payment network produced by
``src.data.enrichment``:

Nodes:      Account, Merchant, Device, PaymentInstrument, IP, Transaction
Edge types:
    (account)     -[USES_DEVICE]->     (device)
    (account)     -[USES_INSTRUMENT]-> (payment instrument)
    (account)     -[USES_IP]->         (ip address)
    (transaction) -[FROM_ACCOUNT]->    (source account)
    (transaction) -[TO_ACCOUNT]->      (destination account)
    (transaction) -[AT_MERCHANT]->     (merchant)

Guarantees
----------
* Deterministic: node/edge iteration is always in sorted id order.
* Label-free: only observable columns are read; ``pattern_id`` and
  ``is_ring_member`` are never loaded into the graph.
* Timestamps are preserved on transaction nodes and their incident edges.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import pandas as pd

#: Observable transaction columns loaded into the graph. Evaluation-only
#: columns (``pattern_id``, ``is_ring_member``) are deliberately absent.
_OBSERVABLE_TX_COLUMNS: list[str] = [
    "transaction_id",
    "timestamp",
    "amount",
    "src_account_id",
    "dst_account_id",
    "merchant_id",
    "device_id",
    "payment_instrument_id",
    "ip_address",
    "payment_method",
    "transaction_status",
]

_REPO_ROOT = Path(__file__).resolve().parents[2]



class NodeType(str, Enum):
    """Typed node kinds of the heterogeneous evidence graph."""

    ACCOUNT = "Account"
    MERCHANT = "Merchant"
    DEVICE = "Device"
    PAYMENT_INSTRUMENT = "PaymentInstrument"
    IP = "IP"
    TRANSACTION = "Transaction"


class EdgeType(str, Enum):
    """Typed relationship kinds of the heterogeneous evidence graph."""

    USES_DEVICE = "USES_DEVICE"
    USES_INSTRUMENT = "USES_INSTRUMENT"
    USES_IP = "USES_IP"
    FROM_ACCOUNT = "FROM_ACCOUNT"
    TO_ACCOUNT = "TO_ACCOUNT"
    AT_MERCHANT = "AT_MERCHANT"


@dataclass
class Node:
    """A typed node with arbitrary attributes."""

    id: str
    type: NodeType
    attrs: dict[str, object] = field(default_factory=dict)


@dataclass
class Edge:
    """A typed directed edge with attributes."""

    src_id: str
    dst_id: str
    type: EdgeType
    attrs: dict[str, object] = field(default_factory=dict)


class EvidenceGraph:
    """In-memory typed property graph.

    Nodes and edges are stored in dictionaries keyed by id / (src, dst,
    edge-type); iteration helpers always return sorted results so any
    serialization of the graph is byte-deterministic.
    """

    def __init__(self) -> None:
        self._nodes: dict[str, Node] = {}
        self._edges: dict[tuple[str, str, str], Edge] = {}

    # -- mutation -----------------------------------------------------------

    def add_node(self, node_id: str, node_type: NodeType, **attrs: object) -> None:
        """Add a node if absent; existing nodes keep their attributes."""
        if node_id not in self._nodes:
            self._nodes[node_id] = Node(node_id, node_type, dict(attrs))

    def add_edge(
        self, src_id: str, dst_id: str, edge_type: EdgeType, **attrs: object
    ) -> None:
        """Add an edge if absent; repeated evidence merges its attributes."""
        key = (src_id, dst_id, edge_type.value)
        existing = self._edges.get(key)
        if existing is None:
            self._edges[key] = Edge(src_id, dst_id, edge_type, dict(attrs))
        else:
            existing.attrs.update(attrs)

    # -- access --------------------------------------------------------------

    def has_node(self, node_id: str) -> bool:
        """Return True if ``node_id`` exists."""
        return node_id in self._nodes

    def get_node(self, node_id: str) -> Node | None:
        """Return the node with ``node_id`` or ``None``."""
        return self._nodes.get(node_id)

    def has_edge(self, src_id: str, dst_id: str, edge_type: EdgeType) -> bool:
        """Return True if the typed edge exists."""
        return (src_id, dst_id, edge_type.value) in self._edges

    def nodes(self, node_type: NodeType | None = None) -> list[Node]:
        """All nodes (optionally of one type), sorted by id."""
        selected = [
            n for n in self._nodes.values() if node_type is None or n.type == node_type
        ]
        return sorted(selected, key=lambda n: n.id)

    def edges(self, edge_type: EdgeType | None = None) -> list[Edge]:
        """All edges (optionally of one type), sorted by (src, dst, type)."""
        selected = [
            e
            for e in self._edges.values()
            if edge_type is None or e.type == edge_type
        ]
        return sorted(selected, key=lambda e: (e.src_id, e.dst_id, e.type.value))

    def node_count(self, node_type: NodeType | None = None) -> int:
        """Number of nodes, optionally restricted to one type."""
        if node_type is None:
            return len(self._nodes)
        return sum(1 for n in self._nodes.values() if n.type == node_type)

    def edge_count(self, edge_type: EdgeType | None = None) -> int:
        """Number of edges, optionally restricted to one type."""
        if edge_type is None:
            return len(self._edges)
        return sum(1 for e in self._edges.values() if e.type == edge_type)

    # -- serialization ---------------------------------------------------------

    def to_canonical(self) -> str:
        """Deterministic canonical JSON string of the whole graph."""
        payload = {
            "nodes": [
                {"id": n.id, "type": n.type.value, "attrs": n.attrs}
                for n in self.nodes()
            ],
            "edges": [
                {
                    "src": e.src_id,
                    "dst": e.dst_id,
                    "type": e.type.value,
                    "attrs": e.attrs,
                }
                for e in self.edges()
            ],
        }
        return json.dumps(payload, sort_keys=True, default=str)


# ---------------------------------------------------------------------------
# Loaders (data/processed/payment_network -> graph)
# ---------------------------------------------------------------------------


def _add_table_nodes(
    graph: EvidenceGraph,
    csv_path: Path,
    id_column: str,
    node_type: NodeType,
    attr_columns: list[str],
) -> int:
    """Load a catalog CSV into typed nodes. Returns number of rows read."""
    frame = pd.read_csv(csv_path)
    for row in frame.itertuples(index=False):
        attrs = {col: getattr(row, col) for col in attr_columns}
        graph.add_node(str(getattr(row, id_column)), node_type, **attrs)
    return len(frame)


def _target_node_type(edge_type: EdgeType) -> NodeType:
    """Map a USES_* edge type to the node type of its target entity."""
    return {
        EdgeType.USES_DEVICE: NodeType.DEVICE,
        EdgeType.USES_INSTRUMENT: NodeType.PAYMENT_INSTRUMENT,
        EdgeType.USES_IP: NodeType.IP,
    }[edge_type]


def _add_relation_edges(
    graph: EvidenceGraph,
    csv_path: Path,
    source_column: str,
    target_column: str,
    edge_type: EdgeType,
) -> int:
    """Load Account->entity relationship edges from a CSV.

    The ``link_type`` column present in these files is intentionally NOT
    imported: it is derived from enrichment internals and must not influence
    graph structure or attributes.
    """
    frame = pd.read_csv(csv_path)
    target_type = _target_node_type(edge_type)
    for row in frame.itertuples(index=False):
        src = str(getattr(row, source_column))
        dst = str(getattr(row, target_column))
        graph.add_node(src, NodeType.ACCOUNT)
        if not graph.has_node(dst):  # defensive referential integrity
            graph.add_node(dst, target_type)
        graph.add_edge(src, dst, edge_type)
    return len(frame)


def _add_transactions(
    graph: EvidenceGraph, csv_path: Path, limit: int | None, chunk_size: int
) -> int:
    """Stream enriched transactions into transaction/account/merchant nodes.

    Only observable columns are read; evaluation columns never reach the
    graph. Timestamps are preserved on nodes and edges.
    """
    count = 0
    reader = pd.read_csv(
        csv_path, chunksize=chunk_size, usecols=_OBSERVABLE_TX_COLUMNS
    )
    for chunk in reader:
        if limit is not None and count >= limit:
            break
        if limit is not None:
            chunk = chunk.iloc[: limit - count]
        for row in chunk.itertuples(index=False):
            tx_id = str(row.transaction_id)
            timestamp = str(row.timestamp)
            src = str(row.src_account_id)
            dst = str(row.dst_account_id)
            merchant_id = str(row.merchant_id)

            graph.add_node(
                tx_id,
                NodeType.TRANSACTION,
                timestamp=timestamp,
                amount=float(row.amount),
                payment_method=str(row.payment_method),
                transaction_status=str(row.transaction_status),
            )
            graph.add_node(src, NodeType.ACCOUNT)
            graph.add_node(dst, NodeType.ACCOUNT)
            graph.add_node(merchant_id, NodeType.MERCHANT)

            graph.add_edge(tx_id, src, EdgeType.FROM_ACCOUNT, timestamp=timestamp)
            graph.add_edge(tx_id, dst, EdgeType.TO_ACCOUNT, timestamp=timestamp)
            graph.add_edge(tx_id, merchant_id, EdgeType.AT_MERCHANT, timestamp=timestamp)
            count += 1
    return count


def build_evidence_graph(
    processed_dir: Path, limit: int | None = None, chunk_size: int = 100_000
) -> EvidenceGraph:
    """Build the heterogeneous evidence graph from processed payment data.

    Args:
        processed_dir: Directory written by ``src.data.enrichment``
            (catalogs, account-entity relationships, enriched transactions).
        limit: If set, load at most this many transactions (dev fast path).
        chunk_size: Transactions per streaming chunk.

    Returns:
        The fully populated :class:`EvidenceGraph`.
    """
    processed_dir = Path(processed_dir)
    graph = EvidenceGraph()

    _add_table_nodes(
        graph,
        processed_dir / "accounts.csv",
        "account_id",
        NodeType.ACCOUNT,
        ["customer_name", "balance", "risk_score", "creation_date"],
    )
    _add_table_nodes(
        graph,
        processed_dir / "merchants.csv",
        "merchant_id",
        NodeType.MERCHANT,
        ["name", "category", "country", "risk_tier"],
    )
    _add_table_nodes(
        graph,
        processed_dir / "devices.csv",
        "device_id",
        NodeType.DEVICE,
        ["os", "device_type", "first_seen"],
    )
    _add_table_nodes(
        graph,
        processed_dir / "payment_instruments.csv",
        "instrument_id",
        NodeType.PAYMENT_INSTRUMENT,
        ["instrument_type", "network", "last4", "expiry"],
    )
    _add_table_nodes(
        graph,
        processed_dir / "ip_addresses.csv",
        "ip_address",
        NodeType.IP,
        ["isp", "country", "is_mobile_isp"],
    )

    _add_relation_edges(
        graph,
        processed_dir / "account_device.csv",
        "account_id",
        "device_id",
        EdgeType.USES_DEVICE,
    )
    _add_relation_edges(
        graph,
        processed_dir / "account_payment_instrument.csv",
        "account_id",
        "payment_instrument_id",
        EdgeType.USES_INSTRUMENT,
    )
    _add_relation_edges(
        graph,
        processed_dir / "account_ip.csv",
        "account_id",
        "ip_address",
        EdgeType.USES_IP,
    )

    _add_transactions(
        graph, processed_dir / "enriched_transactions.csv", limit, chunk_size
    )
    return graph


def main(argv: list[str] | None = None) -> int:
    """CLI entry point: build both graphs and print summaries."""
    parser = argparse.ArgumentParser(
        description="Build TraceLine evidence and account graphs."
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
    parser.add_argument(
        "--top", type=int, default=10, help="How many top account edges to show."
    )
    args = parser.parse_args(argv)

    from src.graph.projection import project_account_graph

    graph = build_evidence_graph(args.processed_dir, limit=args.limit)
    print("Evidence graph:")
    for node_type in NodeType:
        print(f"  nodes   {node_type.value:<20} {graph.node_count(node_type)}")
    for edge_type in EdgeType:
        print(f"  edges   {edge_type.value:<20} {graph.edge_count(edge_type)}")

    account_graph = project_account_graph(graph)
    print(
        f"\nAccount graph: {len(account_graph.nodes)} nodes, "
        f"{len(account_graph.edges)} edges"
    )
    print(f"\nTop {args.top} account pairs by weight:")
    for edge in account_graph.top_edges(args.top):
        print(
            f"  {edge.src} <-> {edge.dst}  weight={edge.weight:.3f}  "
            f"instr={len(edge.shared_instruments)} "
            f"dev={len(edge.shared_devices)} "
            f"mch={len(edge.shared_merchants)} ip={len(edge.shared_ips)} "
            f"days={edge.temporal_overlap}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
