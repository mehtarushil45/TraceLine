"""Tests for TraceLine's community feature engine.

Covers:
  1. Exact F1 graph-structure feature values on a hand-crafted community.
  2. Exact F2 entity-sharing calculations (union across edges).
  3. Exact F3 temporal-concentration calculations.
  4. Exact F4 transaction-behavior calculations including entropy.
  5. Community with no transactions: all F4 features are NaN.
  6. Singleton community: density=0, mean_edge_weight=NaN, temporal_overlap_mean=NaN.
  7. NaN for amount_cv with exactly one transaction (sample std undefined).
  8. Merchant_category_entropy = 0.0 for a single unique merchant category.
  9. No merchant_df supplied: merchant_category_entropy is NaN.
 10. Deterministic output: identical inputs produce byte-identical DataFrames.
 11. Output schema: correct index name, column order, dtype.
 12. Forbidden columns in tx_df raise ValueError.
 13. Empty community list returns correctly shaped empty DataFrame.
 14. Label-leakage source inspection: forbidden column names and ring-specific
     id prefixes never appear as feature-access expressions in the source.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.detection.communities import Community, CommunityTemporalStats
from src.features.community_features import (
    FEATURE_NAMES,
    FORBIDDEN_COLUMNS,
    compute_community_features,
)
from src.graph.projection import AccountEdge

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _make_account_edge(
    src: str,
    dst: str,
    *,
    shared_instruments: tuple[str, ...] = (),
    shared_devices: tuple[str, ...] = (),
    shared_ips: tuple[str, ...] = (),
    shared_merchants: tuple[str, ...] = (),
    temporal_overlap: int = 0,
    weight: float = 1.0,
) -> AccountEdge:
    """Build an AccountEdge, normalising src < dst."""
    key = (src, dst) if src < dst else (dst, src)
    return AccountEdge(
        src=key[0],
        dst=key[1],
        shared_instruments=tuple(sorted(shared_instruments)),
        shared_devices=tuple(sorted(shared_devices)),
        shared_ips=tuple(sorted(shared_ips)),
        shared_merchants=tuple(sorted(shared_merchants)),
        temporal_overlap=temporal_overlap,
        weight=weight,
    )


def _make_temporal_stats(
    tx_count: int = 0,
    active_hours: int = 0,
    median_gap: float | None = None,
    span: float = 0.0,
    compression: float = 0.0,
) -> CommunityTemporalStats:
    return CommunityTemporalStats(
        transaction_count=tx_count,
        unique_active_hours=active_hours,
        median_inter_transaction_gap_hours=median_gap,
        timestamp_span_hours=span,
        temporal_compression_score=compression,
    )


def _make_community(
    community_id: int,
    members: list[str],
    edges: Sequence[AccountEdge] = (),
    *,
    tx_count: int = 0,
    active_hours: int = 0,
    median_gap: float | None = None,
    span: float = 0.0,
    compression: float = 0.0,
    min_ts: str | None = None,
    max_ts: str | None = None,
    duration: float | None = None,
) -> Community:
    member_tuple = tuple(sorted(members))
    member_set = set(member_tuple)
    n = len(member_tuple)
    internal_edges = tuple(
        e for e in edges if e.src in member_set and e.dst in member_set
    )
    edge_count = len(internal_edges)
    total_w = round(sum(e.weight for e in internal_edges), 6)
    possible_pairs = n * (n - 1) / 2.0
    density = round(edge_count / possible_pairs, 6) if possible_pairs > 0 else 0.0
    return Community(
        community_id=community_id,
        member_account_ids=member_tuple,
        member_count=n,
        internal_edge_count=edge_count,
        total_internal_weight=total_w,
        density=density,
        min_timestamp=min_ts,
        max_timestamp=max_ts,
        duration_hours=duration,
        temporal_stats=_make_temporal_stats(
            tx_count, active_hours, median_gap, span, compression
        ),
        internal_edges=internal_edges,
    )


# ---------------------------------------------------------------------------
# Hand-crafted fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def community_a() -> Community:
    """3-member complete triangle with diverse shared entities.

    Edges:
      acc_a1 <-> acc_a2 : instruments={ins_1, ins_2}, devices={dev_1},
                           ips={ip_1}, merchants={mch_1}, overlap=2, w=6.0
      acc_a1 <-> acc_a3 : instruments={ins_1},         devices={dev_2},
                           ips={ip_2}, merchants={mch_1, mch_2}, overlap=1, w=4.0
      acc_a2 <-> acc_a3 : (no shared entities),       merchants={mch_2}, overlap=0, w=2.0

    Derived:
      member_count=3, density=1.0, total_weight=12.0
      unique_shared_instruments={ins_1, ins_2} → 2
      unique_shared_devices={dev_1, dev_2}    → 2
      unique_shared_ips={ip_1, ip_2}          → 2
      unique_shared_merchants={mch_1, mch_2}  → 2
      temporal_overlap_mean = (2+1+0)/3 = 1.0
    """
    e12 = _make_account_edge(
        "acc_a1", "acc_a2",
        shared_instruments=("ins_1", "ins_2"),
        shared_devices=("dev_1",),
        shared_ips=("ip_1",),
        shared_merchants=("mch_1",),
        temporal_overlap=2,
        weight=6.0,
    )
    e13 = _make_account_edge(
        "acc_a1", "acc_a3",
        shared_instruments=("ins_1",),
        shared_devices=("dev_2",),
        shared_ips=("ip_2",),
        shared_merchants=("mch_1", "mch_2"),
        temporal_overlap=1,
        weight=4.0,
    )
    e23 = _make_account_edge(
        "acc_a2", "acc_a3",
        shared_instruments=(),
        shared_devices=(),
        shared_ips=(),
        shared_merchants=("mch_2",),
        temporal_overlap=0,
        weight=2.0,
    )
    # tx_count=4, span=6h → compression = 4/(4+6) = 0.4
    return _make_community(
        0,
        ["acc_a1", "acc_a2", "acc_a3"],
        [e12, e13, e23],
        tx_count=4,
        active_hours=3,
        median_gap=1.0,
        span=6.0,
        compression=round(4 / (4 + 6), 6),
    )


@pytest.fixture(scope="module")
def community_b() -> Community:
    """Singleton community (acc_b1 only) with no activity."""
    return _make_community(1, ["acc_b1"])


@pytest.fixture(scope="module")
def community_c() -> Community:
    """2-member community with exactly 1 transaction (tests NaN amount_cv)."""
    edge = _make_account_edge(
        "acc_c1", "acc_c2",
        shared_instruments=(),
        shared_devices=(),
        shared_ips=(),
        shared_merchants=(),
        temporal_overlap=0,
        weight=1.0,
    )
    # 1 transaction, span=0 → compression = 1/(1+0) = 1.0
    return _make_community(
        2,
        ["acc_c1", "acc_c2"],
        [edge],
        tx_count=1,
        active_hours=1,
        median_gap=None,
        span=0.0,
        compression=1.0,
    )


@pytest.fixture(scope="module")
def tx_df() -> pd.DataFrame:
    """Observable-only transaction DataFrame touching communities A and C.

    Community A members: acc_a1, acc_a2, acc_a3
      tx_0: acc_a1 → acc_x (external)  amount=100  settled  card     mch_1
      tx_1: acc_a2 → acc_a3            amount=200  declined upi      mch_2
      tx_2: acc_a3 → acc_a1            amount=150  settled  card     mch_1

    Community C members: acc_c1, acc_c2
      tx_3: acc_c1 → acc_c2            amount=300  settled  card     mch_1

    Unrelated:
      tx_4: acc_x → acc_y              amount=999  settled  netbanking  mch_3
    """
    return pd.DataFrame(
        [
            {
                "src_account_id": "acc_a1",
                "dst_account_id": "acc_x",
                "amount": 100.0,
                "transaction_status": "settled",
                "payment_method": "card",
                "merchant_id": "mch_1",
            },
            {
                "src_account_id": "acc_a2",
                "dst_account_id": "acc_a3",
                "amount": 200.0,
                "transaction_status": "declined",
                "payment_method": "upi",
                "merchant_id": "mch_2",
            },
            {
                "src_account_id": "acc_a3",
                "dst_account_id": "acc_a1",
                "amount": 150.0,
                "transaction_status": "settled",
                "payment_method": "card",
                "merchant_id": "mch_1",
            },
            {
                "src_account_id": "acc_c1",
                "dst_account_id": "acc_c2",
                "amount": 300.0,
                "transaction_status": "settled",
                "payment_method": "card",
                "merchant_id": "mch_1",
            },
            {
                "src_account_id": "acc_x",
                "dst_account_id": "acc_y",
                "amount": 999.0,
                "transaction_status": "settled",
                "payment_method": "netbanking",
                "merchant_id": "mch_3",
            },
        ]
    )


@pytest.fixture(scope="module")
def merchant_df() -> pd.DataFrame:
    """Minimal observable merchant catalog (no forbidden columns)."""
    return pd.DataFrame(
        [
            {"merchant_id": "mch_1", "category": "grocery",     "name": "G Mart",   "country": "IN", "risk_tier": "low"},
            {"merchant_id": "mch_2", "category": "electronics", "name": "E World",  "country": "IN", "risk_tier": "low"},
            {"merchant_id": "mch_3", "category": "travel",      "name": "T Agency", "country": "IN", "risk_tier": "low"},
        ]
    )


# ---------------------------------------------------------------------------
# 1. F1 – Graph structure (exact values)
# ---------------------------------------------------------------------------


def test_f1_graph_structure_exact(community_a, tx_df, merchant_df) -> None:
    """F1 features on a complete triangle match hand-computed values."""
    df = compute_community_features([community_a], tx_df, merchant_df)
    row = df.loc[0]

    assert row["member_count"] == pytest.approx(3.0)
    assert row["density"] == pytest.approx(1.0)  # complete triangle → density 1

    # total_internal_weight = 6+4+2 = 12, edge_count = 3
    assert row["mean_edge_weight"] == pytest.approx(12.0 / 3)   # 4.0
    assert row["weight_per_member"] == pytest.approx(12.0 / 3)  # 4.0


def test_f1_singleton_density_zero(community_b, tx_df) -> None:
    """Singleton: density=0.0, mean_edge_weight=NaN, weight_per_member=0.0."""
    df = compute_community_features([community_b], tx_df)
    row = df.loc[1]

    assert row["member_count"] == pytest.approx(1.0)
    assert row["density"] == pytest.approx(0.0)
    assert math.isnan(row["mean_edge_weight"])
    assert row["weight_per_member"] == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# 2. F2 – Entity sharing (exact union calculations)
# ---------------------------------------------------------------------------


def test_f2_entity_sharing_exact(community_a, tx_df, merchant_df) -> None:
    """Union of shared entities across all internal edges matches exactly."""
    df = compute_community_features([community_a], tx_df, merchant_df)
    row = df.loc[0]

    # Instruments: edge12={ins_1,ins_2}, edge13={ins_1}, edge23={}
    # Union = {ins_1, ins_2} → 2
    assert row["unique_shared_instruments"] == pytest.approx(2.0)
    # Devices: edge12={dev_1}, edge13={dev_2}, edge23={}
    # Union = {dev_1, dev_2} → 2
    assert row["unique_shared_devices"] == pytest.approx(2.0)
    # IPs: edge12={ip_1}, edge13={ip_2}, edge23={}
    # Union = {ip_1, ip_2} → 2
    assert row["unique_shared_ips"] == pytest.approx(2.0)
    # Merchants: edge12={mch_1}, edge13={mch_1,mch_2}, edge23={mch_2}
    # Union = {mch_1, mch_2} → 2
    assert row["unique_shared_merchants"] == pytest.approx(2.0)
    # Ratios: 2 / 3
    assert row["instrument_sharing_ratio"] == pytest.approx(2 / 3)
    assert row["device_sharing_ratio"] == pytest.approx(2 / 3)


def test_f2_singleton_all_zero(community_b, tx_df) -> None:
    """Singleton has no shared entities; ratios are 0 (not NaN)."""
    df = compute_community_features([community_b], tx_df)
    row = df.loc[1]

    for feat in [
        "unique_shared_instruments", "unique_shared_devices",
        "unique_shared_ips", "unique_shared_merchants",
        "instrument_sharing_ratio", "device_sharing_ratio",
    ]:
        assert row[feat] == pytest.approx(0.0), f"{feat} should be 0 for singleton"


# ---------------------------------------------------------------------------
# 3. F3 – Temporal concentration (exact values)
# ---------------------------------------------------------------------------


def test_f3_temporal_exact(community_a, tx_df, merchant_df) -> None:
    """F3 temporal features match values set in the community fixture."""
    df = compute_community_features([community_a], tx_df, merchant_df)
    row = df.loc[0]

    # Stored directly from temporal_stats.
    assert row["temporal_compression_score"] == pytest.approx(4 / (4 + 6))  # 0.4
    assert row["unique_active_hours"] == pytest.approx(3.0)
    assert row["median_inter_transaction_gap_hours"] == pytest.approx(1.0)

    # tx_per_member = tx_count / N = 4 / 3
    assert row["tx_per_member"] == pytest.approx(4 / 3)

    # temporal_overlap_mean = mean(2, 1, 0) = 1.0
    assert row["temporal_overlap_mean"] == pytest.approx(1.0)


def test_f3_singleton_nans_and_zeros(community_b, tx_df) -> None:
    """Singleton: median_gap and temporal_overlap_mean are NaN; others are 0."""
    df = compute_community_features([community_b], tx_df)
    row = df.loc[1]

    assert row["temporal_compression_score"] == pytest.approx(0.0)
    assert row["unique_active_hours"] == pytest.approx(0.0)
    assert math.isnan(row["median_inter_transaction_gap_hours"])
    assert row["tx_per_member"] == pytest.approx(0.0)
    assert math.isnan(row["temporal_overlap_mean"])


# ---------------------------------------------------------------------------
# 4. F4 – Transaction behavior + financial exposure (exact values)
# ---------------------------------------------------------------------------


def test_f4_transaction_exact(community_a, tx_df, merchant_df) -> None:
    """F4 features on community A match hand-computed values.

    Transactions involving acc_a1, acc_a2, or acc_a3:
      tx_0: acc_a1→acc_x   amount=100  settled  card     mch_1 (grocery)
      tx_1: acc_a2→acc_a3  amount=200  declined upi      mch_2 (electronics)
      tx_2: acc_a3→acc_a1  amount=150  settled  card     mch_1 (grocery)

    Amounts [100, 200, 150]:
      mean = 150.0
      std(ddof=1) = sqrt(((100-150)²+(200-150)²+(150-150)²)/2) = sqrt(2500) = 50
      cv = 50/150 = 1/3

    declined_rate = 1/3
    unique_payment_methods: {card, upi} → 2
    total = 450

    merchant categories: [grocery, electronics, grocery] → [2/3, 1/3]
      H = -(2/3·log₂(2/3) + 1/3·log₂(1/3))
    """
    df = compute_community_features([community_a], tx_df, merchant_df)
    row = df.loc[0]

    assert row["total_transaction_amount"] == pytest.approx(450.0)
    assert row["mean_tx_amount"] == pytest.approx(150.0)
    assert row["amount_cv"] == pytest.approx(50.0 / 150.0)  # 1/3
    assert row["declined_rate"] == pytest.approx(1 / 3)
    assert row["unique_payment_methods"] == pytest.approx(2.0)

    # H([2/3, 1/3]) in bits
    expected_entropy = -(2 / 3 * math.log2(2 / 3) + 1 / 3 * math.log2(1 / 3))
    assert row["merchant_category_entropy"] == pytest.approx(expected_entropy, abs=1e-9)


def test_f4_no_transactions_all_nan(community_b, tx_df, merchant_df) -> None:
    """Community with no matching transactions: all F4 features are NaN."""
    df = compute_community_features([community_b], tx_df, merchant_df)
    row = df.loc[1]

    f4_features = [
        "mean_tx_amount", "amount_cv", "declined_rate",
        "unique_payment_methods", "merchant_category_entropy",
        "total_transaction_amount",
    ]
    for feat in f4_features:
        assert math.isnan(row[feat]), (
            f"Expected {feat} to be NaN for community with no transactions, "
            f"got {row[feat]}"
        )


def test_f4_single_tx_amount_cv_nan(community_c, tx_df, merchant_df) -> None:
    """With exactly 1 transaction, amount_cv is NaN (sample std undefined).

    Community C has 1 tx: acc_c1→acc_c2, amount=300, status=settled,
    payment_method=card, merchant_id=mch_1 (grocery).

    merchant_category_entropy with 1 category (grocery only): H=0.0.
    """
    df = compute_community_features([community_c], tx_df, merchant_df)
    row = df.loc[2]

    assert math.isnan(row["amount_cv"]), "amount_cv must be NaN with n_tx < 2"
    assert row["mean_tx_amount"] == pytest.approx(300.0)
    assert row["total_transaction_amount"] == pytest.approx(300.0)
    assert row["declined_rate"] == pytest.approx(0.0)
    assert row["unique_payment_methods"] == pytest.approx(1.0)
    # Single merchant category → entropy = 0.0 (not NaN)
    assert row["merchant_category_entropy"] == pytest.approx(0.0)
    # Median gap undefined with < 2 transactions
    assert math.isnan(row["median_inter_transaction_gap_hours"])


def test_f4_no_merchant_df_entropy_nan(community_a, tx_df) -> None:
    """merchant_category_entropy is NaN when no merchant catalog is supplied."""
    df = compute_community_features([community_a], tx_df, merchant_df=None)
    assert pd.isna(df.loc[0, "merchant_category_entropy"])


# ---------------------------------------------------------------------------
# 5. Deterministic output
# ---------------------------------------------------------------------------


def test_deterministic_output(community_a, community_b, community_c, tx_df, merchant_df) -> None:
    """Same inputs always produce byte-identical DataFrames."""
    communities = [community_a, community_b, community_c]
    df1 = compute_community_features(communities, tx_df, merchant_df)
    df2 = compute_community_features(communities, tx_df, merchant_df)
    pd.testing.assert_frame_equal(df1, df2)


# ---------------------------------------------------------------------------
# 6. Output schema
# ---------------------------------------------------------------------------


def test_output_schema(community_a, community_b, tx_df, merchant_df) -> None:
    """Output DataFrame has correct index name, column order, and dtype."""
    df = compute_community_features([community_a, community_b], tx_df, merchant_df)

    assert df.index.name == "community_id"
    assert list(df.columns) == FEATURE_NAMES
    assert len(df) == 2
    assert set(df.index) == {0, 1}

    # All feature columns must be float64 (NaN represented as float).
    for col in FEATURE_NAMES:
        assert df[col].dtype == np.float64, f"Column {col} should be float64"


def test_empty_communities_returns_correct_schema(tx_df) -> None:
    """Empty community list returns an empty DataFrame with correct columns."""
    df = compute_community_features([], tx_df)

    assert len(df) == 0
    assert list(df.columns) == FEATURE_NAMES
    assert df.index.name == "community_id"


# ---------------------------------------------------------------------------
# 7. Forbidden columns in tx_df raise ValueError
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("forbidden_col", sorted(FORBIDDEN_COLUMNS))
def test_forbidden_column_raises(community_a, forbidden_col: str) -> None:
    """Any forbidden column in tx_df raises ValueError with an informative message."""
    bad_tx = pd.DataFrame(
        {
            "src_account_id": ["acc_a1"],
            "amount": [100.0],
            forbidden_col: ["value"],
        }
    )
    with pytest.raises(ValueError, match="forbidden"):
        compute_community_features([community_a], bad_tx)


# ---------------------------------------------------------------------------
# 8. Label-leakage source inspection
# ---------------------------------------------------------------------------


def test_no_label_leakage_source_inspection() -> None:
    """community_features.py never accesses evaluation labels or ring-specific
    id prefixes as feature values.

    Checks:
    * forbidden columns are not accessed via bracket notation on tx_df.
    * ring-specific id prefixes (dev_ring*, ins_ring*, 10.66.*) never appear.
    * fraud-specific file names never appear.
    * The validation guard (_validate_tx_df and FORBIDDEN_COLUMNS) is present.
    """
    source_path = (
        Path(__file__).resolve().parents[1]
        / "src" / "features" / "community_features.py"
    )
    source = source_path.read_text(encoding="utf-8")

    # Guard must be present.
    assert "_validate_tx_df" in source, "Validation guard function must be present"
    assert "FORBIDDEN_COLUMNS" in source, "FORBIDDEN_COLUMNS constant must be present"

    # Forbidden columns must not be accessed as features (bracket notation).
    for col in ("pattern_id", "is_ring_member", "link_type"):
        assert f'tx_df["{col}"]' not in source, (
            f'Source must not feature-access tx_df["{col}"]'
        )
        assert f"tx_df['{col}']" not in source, (
            f"Source must not feature-access tx_df['{col}']"
        )

    # Ring-specific id prefixes must never appear (no id-prefix inspection).
    for ring_prefix in ("dev_ring", "ins_ring", "10.66."):
        assert ring_prefix not in source, (
            f"Source must not reference ring-specific id prefix '{ring_prefix}'"
        )

    # Evaluation file names must never appear.
    source_lower = source.lower()
    for eval_file in ("fraud_cases", "transactions_fraud"):
        assert eval_file not in source_lower, (
            f"Source must not reference evaluation file '{eval_file}'"
        )


# ---------------------------------------------------------------------------
# 9. Multi-community feature isolation
# ---------------------------------------------------------------------------


def test_communities_do_not_bleed_transactions(
    community_a, community_b, community_c, tx_df, merchant_df
) -> None:
    """Transactions belonging to community A do not count in communities B or C,
    and vice versa.

    Community B (acc_b1) has no transactions in tx_df → F4 all NaN.
    Community C (acc_c1, acc_c2) has exactly 1 transaction (300.0).
    Community A (acc_a1, acc_a2, acc_a3) has 3 transactions totalling 450.
    """
    df = compute_community_features(
        [community_a, community_b, community_c], tx_df, merchant_df
    )

    # Community A
    assert df.loc[0, "total_transaction_amount"] == pytest.approx(450.0)

    # Community B – no transactions
    assert pd.isna(df.loc[1, "total_transaction_amount"])

    # Community C – 1 transaction of 300
    assert df.loc[2, "total_transaction_amount"] == pytest.approx(300.0)
