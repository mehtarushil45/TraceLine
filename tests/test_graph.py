"""Tests for TraceLine's graph construction layer.

The fixtures build a tiny ``data/processed/payment_network``-style directory
with hand-crafted shared entities, so every expected relationship is known
exactly. Graph construction never reads evaluation labels; one test proves
that removing the label columns changes nothing.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from src.graph.builder import (
    EdgeType,
    EvidenceGraph,
    NodeType,
    build_evidence_graph,
)
from src.graph.projection import (
    evidence_weight,
    project_account_graph,
    temporal_multiplier,
)


# ---------------------------------------------------------------------------
# Fixture: small processed dataset with crafted evidence
# ---------------------------------------------------------------------------


def _write_csv(path: Path, header: list[str], rows: list[list[object]]) -> None:
    """Write a CSV file with the given header and rows."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [",".join(header)]
    for row in rows:
        lines.append(",".join(str(v) for v in row))
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture(scope="module")
def processed_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Build a tiny processed dataset with precisely-known shared entities."""
    root = tmp_path_factory.mktemp("processed")

    accounts = [
        ["account_id", "customer_name", "balance", "risk_score", "creation_date"],
        *[[f"acc_{i}", f"C{i}", 1000.0 + i, i / 100, "2023-01-01"] for i in range(13)],
    ]
    _write_csv(root / "accounts.csv", accounts[0], accounts[1:])

    merchants = [
        ["merchant_id", "name", "category", "country", "risk_tier"],
        *[[f"mch_{s}", f"Shop {s}", "retail", "IN", "low"] for s in ["M", "N", "P", "Q", "R"]],
    ]
    _write_csv(root / "merchants.csv", merchants[0], merchants[1:])

    device_ids = ["dev_sh1", "dev_st1", "dev_su1"] + [f"dev_u{i}" for i in range(1, 8)]
    devices = [
        ["device_id", "os", "device_type", "first_seen"],
        *[[d, "android-14", "mobile", "2023-01-01"] for d in device_ids],
    ]
    _write_csv(root / "devices.csv", devices[0], devices[1:])

    instrument_ids = ["ins_sh1"] + [f"ins_u{i}" for i in range(1, 14)]
    instruments = [
        ["instrument_id", "instrument_type", "network", "last4", "expiry"],
        *[[i_, "card", "visa", "1234", "12/29"] for i_ in instrument_ids],
    ]
    _write_csv(root / "payment_instruments.csv", instruments[0], instruments[1:])

    ip_map = {i: f"10.0.0.{i}" for i in range(13)}
    ip_map[5] = "10.9.9.9"  # shared between acc_5 and acc_6
    ip_map[6] = "10.9.9.9"
    ips = [
        ["ip_address", "isp", "country", "is_mobile_isp"],
        *[[ip, "isp-x", "IN", False] for ip in sorted(set(ip_map.values()))],
    ]
    _write_csv(root / "ip_addresses.csv", ips[0], ips[1:])

    # Account assignments:
    #   pair A (acc_1, acc_2): share instrument ONLY
    #   pair B (acc_3, acc_4): share device ONLY
    #   pair C (acc_5, acc_6): share IP ONLY
    #   pair D (acc_9, acc_10): share device + temporal overlap
    #   pair E (acc_11, acc_12): share device, NO temporal overlap
    _write_csv(
        root / "account_device.csv",
        ["account_id", "device_id", "link_type"],
        [
            ["acc_1", "dev_u1", "primary"],
            ["acc_2", "dev_u2", "primary"],
            ["acc_3", "dev_sh1", "shared-pool"],
            ["acc_4", "dev_sh1", "shared-pool"],
            ["acc_5", "dev_u3", "primary"],
            ["acc_6", "dev_u4", "primary"],
            ["acc_7", "dev_u5", "primary"],
            ["acc_8", "dev_u6", "primary"],
            ["acc_9", "dev_st1", "shared-pool"],
            ["acc_10", "dev_st1", "shared-pool"],
            ["acc_11", "dev_su1", "shared-pool"],
            ["acc_12", "dev_su1", "shared-pool"],
            ["acc_0", "dev_u7", "primary"],
        ],
    )
    _write_csv(
        root / "account_payment_instrument.csv",
        ["account_id", "payment_instrument_id", "link_type"],
        [
            ["acc_1", "ins_sh1", "shared-pool"],
            ["acc_2", "ins_sh1", "shared-pool"],
            ["acc_3", "ins_u3", "primary"],
            ["acc_4", "ins_u4", "primary"],
            ["acc_5", "ins_u5", "primary"],
            ["acc_6", "ins_u6", "primary"],
            ["acc_7", "ins_u7", "primary"],
            ["acc_8", "ins_u8", "primary"],
            ["acc_9", "ins_u9", "primary"],
            ["acc_10", "ins_u10", "primary"],
            ["acc_11", "ins_u11", "primary"],
            ["acc_12", "ins_u12", "primary"],
            ["acc_0", "ins_u13", "primary"],
        ],
    )
    _write_csv(
        root / "account_ip.csv",
        ["account_id", "ip_address", "link_type"],
        [[f"acc_{i}", ip_map[i], "primary"] for i in range(13)],
    )

    # Transactions:
    #   acc_7 & acc_8 both touch mch_M on 2024-01-05 (shared merchant + overlap)
    #   acc_9 & acc_10 both active on 2024-03-03
    #   acc_11 on 2024-01-01 vs acc_12 on 2024-02-01 (no overlap)
    #   acc_5/acc_6 transact on different days via different merchants
    tx_header = [
        "transaction_id", "timestamp", "amount", "src_account_id",
        "dst_account_id", "merchant_id", "device_id",
        "payment_instrument_id", "ip_address", "payment_method",
        "account_age_days", "transaction_status", "pattern_id",
        "is_ring_member",
    ]

    def tx(tx_id: str, ts: str, amount: float, src: str, dst: str, mch: str) -> list[object]:
        return [tx_id, ts, amount, src, dst, mch, "", "", "", "card", 365, "settled", "", "False"]

    transactions = [
        tx("tx_1", "2024-01-05T10:00:00", 100.0, "acc_7", "acc_0", "mch_M"),
        tx("tx_2", "2024-01-05T11:00:00", 120.0, "acc_0", "acc_8", "mch_M"),
        tx("tx_3", "2024-03-03T09:00:00", 140.0, "acc_9", "acc_0", "mch_N"),
        tx("tx_4", "2024-03-03T10:00:00", 160.0, "acc_0", "acc_10", "mch_N"),
        tx("tx_5", "2024-01-01T08:00:00", 180.0, "acc_11", "acc_0", "mch_P"),
        tx("tx_6", "2024-02-01T08:00:00", 200.0, "acc_0", "acc_12", "mch_P"),
        tx("tx_7", "2024-01-02T08:00:00", 220.0, "acc_5", "acc_0", "mch_Q"),
        tx("tx_8", "2024-01-03T08:00:00", 240.0, "acc_6", "acc_0", "mch_R"),
    ]
    _write_csv(root / "enriched_transactions.csv", tx_header, transactions)
    return root


@pytest.fixture(scope="module")
def evidence(processed_dir: Path) -> EvidenceGraph:
    """Build the heterogeneous evidence graph once for the module."""
    return build_evidence_graph(processed_dir)


@pytest.fixture(scope="module")
def account_graph(evidence: EvidenceGraph):
    """Derive the account projection from the module's evidence graph."""
    return project_account_graph(evidence)


# ---------------------------------------------------------------------------
# 1. Typed nodes exist
# ---------------------------------------------------------------------------


def test_typed_nodes_exist(evidence: EvidenceGraph) -> None:
    """All six node types are present with expected cardinality."""
    for node_type in NodeType:
        assert evidence.node_count(node_type) > 0, f"missing {node_type} nodes"

    assert evidence.node_count(NodeType.ACCOUNT) == 13
    assert evidence.node_count(NodeType.TRANSACTION) == 8
    assert evidence.node_count(NodeType.MERCHANT) == 5

    # Node/edge types are preserved on access.
    node = evidence.get_node("acc_1")
    assert node is not None and node.type is NodeType.ACCOUNT

    # Typed transaction edges carry timestamps.
    edge = evidence.get_node("tx_1")
    assert edge is not None and edge.attrs["timestamp"] == "2024-01-05T10:00:00"
    assert evidence.has_edge("tx_1", "acc_7", EdgeType.FROM_ACCOUNT)
    assert evidence.has_edge("tx_1", "acc_0", EdgeType.TO_ACCOUNT)
    assert evidence.has_edge("tx_1", "mch_M", EdgeType.AT_MERCHANT)
    assert evidence.has_edge("acc_3", "dev_sh1", EdgeType.USES_DEVICE)


# ---------------------------------------------------------------------------
# 2. Known shared entities create account relationships
# ---------------------------------------------------------------------------


def test_shared_entities_create_relationships(
    evidence: EvidenceGraph, account_graph
) -> None:
    """Every crafted shared-entity pair yields an edge with exact metadata."""
    pair_a = account_graph.edge("acc_1", "acc_2")
    assert pair_a is not None
    assert pair_a.shared_instruments == ("ins_sh1",)
    assert pair_a.shared_devices == ()
    assert pair_a.shared_ips == ()
    assert pair_a.temporal_overlap == 0
    assert pair_a.weight == pytest.approx(4.0)

    pair_b = account_graph.edge("acc_3", "acc_4")
    assert pair_b is not None
    assert pair_b.shared_devices == ("dev_sh1",)

    pair_c = account_graph.edge("acc_5", "acc_6")
    assert pair_c is not None
    assert pair_c.shared_ips == ("10.9.9.9",)

    pair_f = account_graph.edge("acc_7", "acc_8")
    assert pair_f is not None
    assert pair_f.shared_merchants == ("mch_M",)
    assert pair_f.temporal_overlap == 1

    # Unrelated accounts must not be connected.
    assert account_graph.edge("acc_1", "acc_5") is None


# ---------------------------------------------------------------------------
# 3. Stronger evidence produces higher weight
# ---------------------------------------------------------------------------


def test_stronger_evidence_produces_higher_weight(
    evidence: EvidenceGraph, account_graph
) -> None:
    """Instrument > device > IP; temporal overlap acts as a multiplier."""
    w_instrument_pair = account_graph.edge("acc_1", "acc_2").weight  # type: ignore[union-attr]
    w_device_pair = account_graph.edge("acc_3", "acc_4").weight  # type: ignore[union-attr]
    w_ip_pair = account_graph.edge("acc_5", "acc_6").weight  # type: ignore[union-attr]

    assert w_instrument_pair > w_device_pair > w_ip_pair

    # Temporal multiplier: pair D (device + shared active day) must outweigh
    # the identical-evidence pair E (device, disjoint days).
    pair_d = account_graph.edge("acc_9", "acc_10")
    pair_e = account_graph.edge("acc_11", "acc_12")
    assert pair_d is not None and pair_e is not None
    assert pair_d.temporal_overlap == 1
    assert pair_e.temporal_overlap == 0
    assert pair_d.weight > pair_e.weight

    # Unit checks of the pure scoring function.
    assert temporal_multiplier(0) == 1.0
    assert temporal_multiplier(2) == pytest.approx(1.5)
    assert temporal_multiplier(100) == pytest.approx(2.0)  # capped
    assert evidence_weight(instruments=1) == pytest.approx(4.0)
    assert evidence_weight(devices=1) == pytest.approx(3.0)
    assert evidence_weight(ips=1) == pytest.approx(1.0)
    assert evidence_weight(instruments=4) > evidence_weight(instruments=1)
    assert evidence_weight(devices=1, temporal_overlap_days=2) == pytest.approx(4.5)


# ---------------------------------------------------------------------------
# 4. Evaluation labels never enter graph construction
# ---------------------------------------------------------------------------


def test_labels_never_enter_graph_construction(
    processed_dir: Path, evidence: EvidenceGraph, account_graph, tmp_path: Path
) -> None:
    """Building from label-stripped data yields an identical graph."""
    # The canonical serialization contains no trace of evaluation labels.
    canon = evidence.to_canonical() + account_graph.to_canonical()
    assert "pattern" not in canon.lower()
    assert "is_ring_member" not in canon.lower()
    for node in evidence.nodes():
        assert not any(k.startswith("pattern") or k.startswith("is_ring") for k in node.attrs)

    # Rebuild from a copy of the input with the label columns removed:
    # the graphs must be identical, proving labels are never consulted.
    stripped_dir = tmp_path / "stripped"
    stripped_dir.mkdir()
    for csv_file in processed_dir.iterdir():
        frame = pd.read_csv(csv_file)
        frame = frame.drop(
            columns=[c for c in ("pattern_id", "is_ring_member") if c in frame.columns]
        )
        frame.to_csv(stripped_dir / csv_file.name, index=False)

    evidence_stripped = build_evidence_graph(stripped_dir)
    account_graph_stripped = project_account_graph(evidence_stripped)
    assert evidence_stripped.to_canonical() == evidence.to_canonical()
    assert account_graph_stripped.to_canonical() == account_graph.to_canonical()


# ---------------------------------------------------------------------------
# 5. Deterministic output
# ---------------------------------------------------------------------------


def test_deterministic_output(processed_dir: Path) -> None:
    """Two builds of the same input produce byte-identical serializations."""
    evidence_a = build_evidence_graph(processed_dir)
    evidence_b = build_evidence_graph(processed_dir)
    accounts_a = project_account_graph(evidence_a)
    accounts_b = project_account_graph(evidence_b)

    assert evidence_a.to_canonical() == evidence_b.to_canonical()
    assert accounts_a.to_canonical() == accounts_b.to_canonical()

    # Sorted accessors are stable as well.
    assert [n.id for n in evidence_a.nodes()] == [n.id for n in evidence_b.nodes()]
    assert [
        (e.src, e.dst) for e in accounts_a.top_edges(5)
    ] == [(e.src, e.dst) for e in accounts_b.top_edges(5)]


# ---------------------------------------------------------------------------
# 6. Same-day merchant co-occurrence
# ---------------------------------------------------------------------------


def test_same_day_merchant_cooccurrence_creates_edge(tmp_path: Path) -> None:
    """Accounts transacting at the same merchant on the same day create a merchant edge."""
    d = tmp_path / "same_day_mch"
    _write_csv(d / "accounts.csv", ["account_id", "customer_name", "balance", "risk_score", "creation_date"], [
        ["acc_A", "CA", 1000.0, 0.1, "2023-01-01"],
        ["acc_B", "CB", 1000.0, 0.1, "2023-01-01"],
        ["acc_Z", "CZ", 1000.0, 0.1, "2023-01-01"],
    ])
    _write_csv(d / "merchants.csv", ["merchant_id", "name", "category", "country", "risk_tier"], [
        ["mch_1", "Shop 1", "retail", "IN", "low"],
    ])
    _write_csv(d / "devices.csv", ["device_id", "os", "device_type", "first_seen"], [
        ["dev_A", "ios", "mobile", "2023-01-01"],
        ["dev_B", "android", "mobile", "2023-01-01"],
        ["dev_Z", "desktop", "desktop", "2023-01-01"],
    ])
    _write_csv(d / "payment_instruments.csv", ["instrument_id", "instrument_type", "network", "last4", "expiry"], [
        ["ins_A", "card", "visa", "1111", "12/28"],
        ["ins_B", "card", "mastercard", "2222", "12/28"],
        ["ins_Z", "upi", "upi", "3333", "12/28"],
    ])
    _write_csv(d / "ip_addresses.csv", ["ip_address", "isp", "country", "is_mobile_isp"], [
        ["10.1.1.1", "isp1", "IN", False],
        ["10.2.2.2", "isp2", "IN", False],
        ["10.3.3.3", "isp3", "IN", False],
    ])
    _write_csv(d / "account_device.csv", ["account_id", "device_id", "link_type"], [
        ["acc_A", "dev_A", "primary"], ["acc_B", "dev_B", "primary"], ["acc_Z", "dev_Z", "primary"],
    ])
    _write_csv(d / "account_payment_instrument.csv", ["account_id", "payment_instrument_id", "link_type"], [
        ["acc_A", "ins_A", "primary"], ["acc_B", "ins_B", "primary"], ["acc_Z", "ins_Z", "primary"],
    ])
    _write_csv(d / "account_ip.csv", ["account_id", "ip_address", "link_type"], [
        ["acc_A", "10.1.1.1", "primary"], ["acc_B", "10.2.2.2", "primary"], ["acc_Z", "10.3.3.3", "primary"],
    ])
    _write_csv(d / "enriched_transactions.csv", [
        "transaction_id", "timestamp", "amount", "src_account_id", "dst_account_id",
        "merchant_id", "device_id", "payment_instrument_id", "ip_address", "payment_method",
        "account_age_days", "transaction_status", "pattern_id", "is_ring_member"
    ], [
        ["tx_1", "2024-02-10T10:00:00", 500.0, "acc_A", "acc_Z", "mch_1", "dev_A", "ins_A", "10.1.1.1", "card", 100, "settled", "", "False"],
        ["tx_2", "2024-02-10T14:30:00", 600.0, "acc_B", "acc_Z", "mch_1", "dev_B", "ins_B", "10.2.2.2", "card", 100, "settled", "", "False"],
    ])

    ev = build_evidence_graph(d)
    ag = project_account_graph(ev)
    edge = ag.edge("acc_A", "acc_B")
    assert edge is not None
    assert edge.shared_merchants == ("mch_1",)
    assert edge.temporal_overlap == 1
    assert edge.weight == pytest.approx(2.0 * 1.25)


# ---------------------------------------------------------------------------
# 7. Different-day merchant activity does not create edge by itself
# ---------------------------------------------------------------------------


def test_different_day_merchant_activity_no_edge_created(tmp_path: Path) -> None:
    """Accounts transacting at the same merchant on different days do NOT connect without primary evidence."""
    d = tmp_path / "diff_day_mch"
    _write_csv(d / "accounts.csv", ["account_id", "customer_name", "balance", "risk_score", "creation_date"], [
        ["acc_A", "CA", 1000.0, 0.1, "2023-01-01"],
        ["acc_B", "CB", 1000.0, 0.1, "2023-01-01"],
        ["acc_Z", "CZ", 1000.0, 0.1, "2023-01-01"],
    ])
    _write_csv(d / "merchants.csv", ["merchant_id", "name", "category", "country", "risk_tier"], [
        ["mch_1", "Shop 1", "retail", "IN", "low"],
    ])
    _write_csv(d / "devices.csv", ["device_id", "os", "device_type", "first_seen"], [
        ["dev_A", "ios", "mobile", "2023-01-01"], ["dev_B", "android", "mobile", "2023-01-01"], ["dev_Z", "desktop", "desktop", "2023-01-01"],
    ])
    _write_csv(d / "payment_instruments.csv", ["instrument_id", "instrument_type", "network", "last4", "expiry"], [
        ["ins_A", "card", "visa", "1111", "12/28"], ["ins_B", "card", "mastercard", "2222", "12/28"], ["ins_Z", "upi", "upi", "3333", "12/28"],
    ])
    _write_csv(d / "ip_addresses.csv", ["ip_address", "isp", "country", "is_mobile_isp"], [
        ["10.1.1.1", "isp1", "IN", False], ["10.2.2.2", "isp2", "IN", False], ["10.3.3.3", "isp3", "IN", False],
    ])
    _write_csv(d / "account_device.csv", ["account_id", "device_id", "link_type"], [
        ["acc_A", "dev_A", "primary"], ["acc_B", "dev_B", "primary"], ["acc_Z", "dev_Z", "primary"],
    ])
    _write_csv(d / "account_payment_instrument.csv", ["account_id", "payment_instrument_id", "link_type"], [
        ["acc_A", "ins_A", "primary"], ["acc_B", "ins_B", "primary"], ["acc_Z", "ins_Z", "primary"],
    ])
    _write_csv(d / "account_ip.csv", ["account_id", "ip_address", "link_type"], [
        ["acc_A", "10.1.1.1", "primary"], ["acc_B", "10.2.2.2", "primary"], ["acc_Z", "10.3.3.3", "primary"],
    ])
    # acc_A transacts on 2024-01-15, acc_B transacts on 2024-03-20 (different days)
    _write_csv(d / "enriched_transactions.csv", [
        "transaction_id", "timestamp", "amount", "src_account_id", "dst_account_id",
        "merchant_id", "device_id", "payment_instrument_id", "ip_address", "payment_method",
        "account_age_days", "transaction_status", "pattern_id", "is_ring_member"
    ], [
        ["tx_1", "2024-01-15T10:00:00", 500.0, "acc_A", "acc_Z", "mch_1", "dev_A", "ins_A", "10.1.1.1", "card", 100, "settled", "", "False"],
        ["tx_2", "2024-03-20T14:30:00", 600.0, "acc_B", "acc_Z", "mch_1", "dev_B", "ins_B", "10.2.2.2", "card", 100, "settled", "", "False"],
    ])

    ev = build_evidence_graph(d)
    ag = project_account_graph(ev)
    assert ag.edge("acc_A", "acc_B") is None


# ---------------------------------------------------------------------------
# 8. Preservation of primary evidence (device, instrument, IP)
# ---------------------------------------------------------------------------


def test_preservation_of_all_evidence_kinds(tmp_path: Path) -> None:
    """Primary entities (device, instrument, IP) create relationships with exact base weights."""
    d = tmp_path / "primary_evidence"
    _write_csv(d / "accounts.csv", ["account_id", "customer_name", "balance", "risk_score", "creation_date"], [
        ["acc_1", "C1", 1000.0, 0.1, "2023-01-01"],
        ["acc_2", "C2", 1000.0, 0.1, "2023-01-01"],
        ["acc_3", "C3", 1000.0, 0.1, "2023-01-01"],
        ["acc_4", "C4", 1000.0, 0.1, "2023-01-01"],
        ["acc_5", "C5", 1000.0, 0.1, "2023-01-01"],
        ["acc_6", "C6", 1000.0, 0.1, "2023-01-01"],
    ])
    _write_csv(d / "merchants.csv", ["merchant_id", "name", "category", "country", "risk_tier"], [])
    _write_csv(d / "devices.csv", ["device_id", "os", "device_type", "first_seen"], [
        ["dev_sh", "android", "mobile", "2023-01-01"],
        ["dev_u1", "ios", "mobile", "2023-01-01"],
        ["dev_u2", "desktop", "desktop", "2023-01-01"],
    ])
    _write_csv(d / "payment_instruments.csv", ["instrument_id", "instrument_type", "network", "last4", "expiry"], [
        ["ins_sh", "card", "visa", "1111", "12/28"],
        ["ins_u1", "card", "mastercard", "2222", "12/28"],
        ["ins_u2", "upi", "upi", "3333", "12/28"],
    ])
    _write_csv(d / "ip_addresses.csv", ["ip_address", "isp", "country", "is_mobile_isp"], [
        ["10.99.99.99", "isp", "IN", False],
        ["10.1.1.1", "isp1", "IN", False],
        ["10.2.2.2", "isp2", "IN", False],
    ])
    _write_csv(d / "account_device.csv", ["account_id", "device_id", "link_type"], [
        ["acc_1", "dev_sh", "shared"], ["acc_2", "dev_sh", "shared"],
        ["acc_3", "dev_u1", "primary"], ["acc_4", "dev_u2", "primary"],
        ["acc_5", "dev_u1", "primary"], ["acc_6", "dev_u2", "primary"],
    ])
    _write_csv(d / "account_payment_instrument.csv", ["account_id", "payment_instrument_id", "link_type"], [
        ["acc_1", "ins_u1", "primary"], ["acc_2", "ins_u2", "primary"],
        ["acc_3", "ins_sh", "shared"], ["acc_4", "ins_sh", "shared"],
        ["acc_5", "ins_u1", "primary"], ["acc_6", "ins_u2", "primary"],
    ])
    _write_csv(d / "account_ip.csv", ["account_id", "ip_address", "link_type"], [
        ["acc_1", "10.1.1.1", "primary"], ["acc_2", "10.2.2.2", "primary"],
        ["acc_3", "10.1.1.1", "primary"], ["acc_4", "10.2.2.2", "primary"],
        ["acc_5", "10.99.99.99", "shared"], ["acc_6", "10.99.99.99", "shared"],
    ])
    _write_csv(d / "enriched_transactions.csv", [
        "transaction_id", "timestamp", "amount", "src_account_id", "dst_account_id",
        "merchant_id", "device_id", "payment_instrument_id", "ip_address", "payment_method",
        "account_age_days", "transaction_status", "pattern_id", "is_ring_member"
    ], [])

    ev = build_evidence_graph(d)
    ag = project_account_graph(ev)

    # Shared device (acc_1, acc_2) -> weight 3.0
    e_dev = ag.edge("acc_1", "acc_2")
    assert e_dev is not None
    assert e_dev.shared_devices == ("dev_sh",)
    assert e_dev.weight == pytest.approx(3.0)

    # Shared instrument (acc_3, acc_4) -> weight 4.0
    e_ins = ag.edge("acc_3", "acc_4")
    assert e_ins is not None
    assert e_ins.shared_instruments == ("ins_sh",)
    assert e_ins.weight == pytest.approx(4.0)

    # Shared IP (acc_5, acc_6) -> weight 1.0
    e_ip = ag.edge("acc_5", "acc_6")
    assert e_ip is not None
    assert e_ip.shared_ips == ("10.99.99.99",)
    assert e_ip.weight == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# 9. Large merchant bucket memory safety
# ---------------------------------------------------------------------------


def test_large_merchant_bucket_memory_safe(tmp_path: Path) -> None:
    """500 accounts transacting across 100 days do not explode into 124,750 pairs."""
    import time
    d = tmp_path / "large_mch"
    n_accounts = 500
    _write_csv(d / "accounts.csv", ["account_id", "customer_name", "balance", "risk_score", "creation_date"], [
        [f"acc_{i}", f"C{i}", 1000.0, 0.1, "2023-01-01"] for i in range(n_accounts)
    ])
    _write_csv(d / "merchants.csv", ["merchant_id", "name", "category", "country", "risk_tier"], [
        ["mch_big", "Superstore", "retail", "IN", "low"]
    ])
    _write_csv(d / "devices.csv", ["device_id", "os", "device_type", "first_seen"], [
        [f"dev_{i}", "android", "mobile", "2023-01-01"] for i in range(n_accounts)
    ])
    _write_csv(d / "payment_instruments.csv", ["instrument_id", "instrument_type", "network", "last4", "expiry"], [
        [f"ins_{i}", "card", "visa", "1111", "12/28"] for i in range(n_accounts)
    ])
    _write_csv(d / "ip_addresses.csv", ["ip_address", "isp", "country", "is_mobile_isp"], [
        [f"10.0.{(i >> 8) % 256}.{i % 256}", "isp", "IN", False] for i in range(n_accounts)
    ])
    _write_csv(d / "account_device.csv", ["account_id", "device_id", "link_type"], [
        [f"acc_{i}", f"dev_{i}", "primary"] for i in range(n_accounts)
    ])
    _write_csv(d / "account_payment_instrument.csv", ["account_id", "payment_instrument_id", "link_type"], [
        [f"acc_{i}", f"ins_{i}", "primary"] for i in range(n_accounts)
    ])
    _write_csv(d / "account_ip.csv", ["account_id", "ip_address", "link_type"], [
        [f"acc_{i}", f"10.0.{(i >> 8) % 256}.{i % 256}", "primary"] for i in range(n_accounts)
    ])
    # 5 accounts per day across 100 days (10 pairs per day * 100 days = ~1,000 pairs, NOT 124,750)
    tx_rows = []
    for day_idx in range(100):
        date_str = f"2024-01-{(day_idx % 28) + 1:02d}"
        for acc_offset in range(5):
            acc_num = day_idx * 5 + acc_offset
            tx_rows.append([
                f"tx_{acc_num}", f"{date_str}T10:00:00", 100.0, f"acc_{acc_num}", "acc_0",
                "mch_big", f"dev_{acc_num}", f"ins_{acc_num}", "10.0.0.1", "card", 50, "settled", "", "False"
            ])
    _write_csv(d / "enriched_transactions.csv", [
        "transaction_id", "timestamp", "amount", "src_account_id", "dst_account_id",
        "merchant_id", "device_id", "payment_instrument_id", "ip_address", "payment_method",
        "account_age_days", "transaction_status", "pattern_id", "is_ring_member"
    ], tx_rows)

    t0 = time.time()
    ev = build_evidence_graph(d)
    ag = project_account_graph(ev)
    elapsed = time.time() - t0

    assert elapsed < 2.0, f"Projection took {elapsed:.2f}s, expected < 2s"
    # Unbounded clique would be 500*499/2 = 124,750 edges; temporal co-occurrence produces ~1,000-2,000 edges
    assert len(ag.edges) < 5_000, f"Edges {len(ag.edges)} should be bounded, not unbounded clique"

