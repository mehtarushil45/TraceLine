"""Community feature engine for TraceLine.

Transforms each detected community into a flat, explainable feature vector.
All features are derived exclusively from observable evidence: the Community
object (graph structure + temporal statistics already computed by the detection
layer) and an observable-only transaction DataFrame.  Evaluation-only columns
(``pattern_id``, ``is_ring_member``) and enrichment-internal columns
(``link_type``) are structurally excluded via a validation guard and are never
accessed anywhere in this module.

Public API
----------
compute_community_features(communities, tx_df, merchant_df=None) -> pd.DataFrame
    Returns a DataFrame with ``community_id`` as the index and one column per
    feature.  NaN is used for any mathematically undefined value (e.g. sample
    standard deviation with a single observation, mean with no observations).

FEATURE_NAMES   – canonical ordered list of all 21 feature names.
FEATURE_GROUPS  – dict mapping family name -> list of feature names.
FORBIDDEN_COLUMNS – frozenset of column names prohibited in tx_df.

Mathematical definitions for every feature are documented in
``docs/community-features.md`` and inline in this module.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.detection.communities import Community

# ---------------------------------------------------------------------------
# Column contracts
# ---------------------------------------------------------------------------

#: Columns that must NEVER appear in the tx_df argument.  The validation guard
#: :func:`_validate_tx_df` rejects any DataFrame that carries these columns.
FORBIDDEN_COLUMNS: frozenset[str] = frozenset(
    {
        "pattern_id",    # evaluation-only ground-truth label
        "is_ring_member",  # evaluation-only ground-truth label
        "link_type",     # enrichment-internal assignment (leaks ring structure)
    }
)

#: Observable transaction columns consumed by the feature engine.
#: tx_df must contain at minimum ``src_account_id`` and ``amount``.
_OBSERVABLE_TX_COLUMNS: list[str] = [
    "src_account_id",
    "dst_account_id",
    "amount",
    "transaction_status",
    "payment_method",
    "merchant_id",
]

# ---------------------------------------------------------------------------
# Feature name registry
# ---------------------------------------------------------------------------

#: Canonical column order for the output DataFrame.
FEATURE_NAMES: list[str] = [
    # F1 – Graph structure (4 features)
    "member_count",
    "density",
    "mean_edge_weight",
    "weight_per_member",
    # F2 – Entity sharing (6 features)
    "unique_shared_instruments",
    "unique_shared_devices",
    "unique_shared_ips",
    "unique_shared_merchants",
    "instrument_sharing_ratio",
    "device_sharing_ratio",
    # F3 – Temporal concentration (5 features)
    "temporal_compression_score",
    "unique_active_hours",
    "median_inter_transaction_gap_hours",
    "tx_per_member",
    "temporal_overlap_mean",
    # F4 – Transaction behavior + financial exposure (6 features)
    "mean_tx_amount",
    "amount_cv",
    "declined_rate",
    "unique_payment_methods",
    "merchant_category_entropy",
    "total_transaction_amount",
]

#: Feature names grouped by family.
FEATURE_GROUPS: dict[str, list[str]] = {
    "graph_structure": FEATURE_NAMES[0:4],
    "entity_sharing": FEATURE_NAMES[4:10],
    "temporal_concentration": FEATURE_NAMES[10:15],
    "transaction_behavior": FEATURE_NAMES[15:21],
}

_NAN: float = float("nan")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _validate_tx_df(tx_df: pd.DataFrame) -> None:
    """Raise ValueError if tx_df contains any evaluation-only or forbidden column.

    This is the structural guard that prevents evaluation labels from
    accidentally entering the feature computation path.  It complements the
    source-level guarantee enforced by the label-leakage test in
    ``tests/test_community_features.py``.

    Args:
        tx_df: Transaction DataFrame to validate.

    Raises:
        ValueError: If any column in FORBIDDEN_COLUMNS is present in tx_df.
    """
    bad_cols = FORBIDDEN_COLUMNS & set(tx_df.columns)
    if bad_cols:
        raise ValueError(
            "tx_df contains forbidden column(s) that must never be used as "
            f"features: {sorted(bad_cols)}.  Load transactions with observable "
            "columns only (see src.data.enrichment.OBSERVABLE_COLUMNS)."
        )


# ---------------------------------------------------------------------------
# F1 – Graph structure
# ---------------------------------------------------------------------------


def _compute_f1_graph(community: Community) -> dict[str, float]:
    """Compute F1 graph-structure features from the Community object.

    Definitions
    -----------
    member_count  (N)
        Number of accounts in the community.

    density
        Fraction of possible account pairs that share at least one observable
        entity.  ``density = E / (N * (N-1) / 2)`` where ``E`` is the number
        of internal account-to-account edges.  0.0 for singletons (no
        possible pairs).

    mean_edge_weight
        ``total_internal_weight / E``.  NaN when E = 0 (no internal edges).

    weight_per_member
        ``total_internal_weight / N``.  Always defined; 0.0 for singletons.
    """
    n = community.member_count
    n_edges = community.internal_edge_count
    total_w = community.total_internal_weight

    return {
        "member_count": float(n),
        "density": float(community.density),
        "mean_edge_weight": total_w / n_edges if n_edges > 0 else _NAN,
        "weight_per_member": total_w / n,  # n >= 1 always (Louvain invariant)
    }


# ---------------------------------------------------------------------------
# F2 – Entity sharing
# ---------------------------------------------------------------------------


def _compute_f2_entity_sharing(community: Community) -> dict[str, float]:
    """Compute F2 entity-sharing features from internal AccountEdge evidence.

    Each internal edge carries sets of entities shared between exactly one
    account pair.  We union those sets across all internal edges to measure
    community-level shared infrastructure.

    Definitions
    -----------
    unique_shared_instruments
        |⋃_{e ∈ internal_edges} shared_instruments(e)|

    unique_shared_devices
        |⋃_{e ∈ internal_edges} shared_devices(e)|

    unique_shared_ips
        |⋃_{e ∈ internal_edges} shared_ips(e)|

    unique_shared_merchants
        |⋃_{e ∈ internal_edges} shared_merchants(e)|

    instrument_sharing_ratio
        unique_shared_instruments / N.  Normalises for community size.

    device_sharing_ratio
        unique_shared_devices / N.
    """
    instruments: set[str] = set()
    devices: set[str] = set()
    ips: set[str] = set()
    merchants: set[str] = set()

    for edge in community.internal_edges:
        instruments.update(edge.shared_instruments)
        devices.update(edge.shared_devices)
        ips.update(edge.shared_ips)
        merchants.update(edge.shared_merchants)

    n = community.member_count
    ui = len(instruments)
    ud = len(devices)

    return {
        "unique_shared_instruments": float(ui),
        "unique_shared_devices": float(ud),
        "unique_shared_ips": float(len(ips)),
        "unique_shared_merchants": float(len(merchants)),
        "instrument_sharing_ratio": ui / n,  # n >= 1
        "device_sharing_ratio": ud / n,
    }


# ---------------------------------------------------------------------------
# F3 – Temporal concentration
# ---------------------------------------------------------------------------


def _compute_f3_temporal(community: Community) -> dict[str, float]:
    """Compute F3 temporal-concentration features from Community temporal stats.

    Definitions
    -----------
    temporal_compression_score
        ``T / (T + span_hours)`` where T = transaction_count and span_hours is
        the elapsed hours between the community's first and last transaction.
        Range: (0, 1] when T > 0, approaching 1 when many transactions occur
        in a short window.  0.0 when T = 0.

    unique_active_hours
        Count of distinct clock-hours (0–23) across all community transactions.
        1 if all transactions occur within the same hour; max 24.

    median_inter_transaction_gap_hours
        Median of the pairwise consecutive gaps between sorted community-wide
        transaction timestamps.  NaN when T < 2 (undefined for < 2 events).

    tx_per_member
        ``transaction_count / N``.  Uses the deduplicated transaction count from
        ``Community.temporal_stats`` (identical timestamps counted once).
        Always defined; 0.0 for communities with no transactions.

    temporal_overlap_mean
        Mean of ``AccountEdge.temporal_overlap`` (calendar days on which both
        accounts had transactions) across all internal edges.  NaN when there
        are no internal edges.
    """
    ts = community.temporal_stats
    edges = community.internal_edges

    median_gap = (
        float(ts.median_inter_transaction_gap_hours)
        if ts.median_inter_transaction_gap_hours is not None
        else _NAN
    )

    temporal_overlap_mean: float
    if edges:
        temporal_overlap_mean = float(
            sum(e.temporal_overlap for e in edges) / len(edges)
        )
    else:
        temporal_overlap_mean = _NAN

    return {
        "temporal_compression_score": float(ts.temporal_compression_score),
        "unique_active_hours": float(ts.unique_active_hours),
        "median_inter_transaction_gap_hours": median_gap,
        "tx_per_member": float(ts.transaction_count) / community.member_count,
        "temporal_overlap_mean": temporal_overlap_mean,
    }


# ---------------------------------------------------------------------------
# F4 – Transaction behavior + financial exposure
# ---------------------------------------------------------------------------


def _shannon_entropy_bits(categories: pd.Series) -> float:
    """Shannon entropy in bits of a categorical frequency distribution.

    Definition
    ----------
    H = -Σ_k  p_k * log2(p_k)

    where p_k = count_k / total is the observed frequency of category k.
    Returns 0.0 for a single unique category (deterministic distribution).
    Returns NaN for an empty series.

    Args:
        categories: Series of category labels (strings or ints).

    Returns:
        Entropy in bits as a float, or NaN.
    """
    if categories.empty:
        return _NAN
    counts = categories.value_counts().values.astype(np.float64)
    total = counts.sum()
    if total == 0.0:
        return _NAN
    probs = counts / total
    # Restrict to positive probabilities to avoid log2(0).
    nonzero = probs[probs > 0.0]
    return float(-np.sum(nonzero * np.log2(nonzero)))


def _compute_f4_transaction(
    member_txs: pd.DataFrame,
    merchant_cat: dict[str, str] | None,
) -> dict[str, float]:
    """Compute F4 transaction-behavior and financial-exposure features.

    Args:
        member_txs: Rows of tx_df whose ``src_account_id`` or
            ``dst_account_id`` belongs to the community.  Must contain
            only observable columns.
        merchant_cat: Optional dict mapping merchant_id (str) -> category
            label (str).  When None, ``merchant_category_entropy`` is NaN.

    Definitions
    -----------
    mean_tx_amount
        Arithmetic mean of transaction amounts for community member
        transactions.  NaN when no transactions.

    amount_cv
        Sample coefficient of variation: ``std(amounts, ddof=1) / mean(amounts)``.
        NaN when fewer than 2 transactions (sample std undefined for n < 2).
        NaN when mean is zero.

    declined_rate
        ``count(transaction_status == 'declined') / total_tx_count``.
        NaN when no transactions.

    unique_payment_methods
        Count of distinct payment method labels used by community members.
        NaN when no transactions.

    merchant_category_entropy
        Shannon entropy in bits of the merchant-category distribution across
        community member transactions.  H = -Σ p_k log2(p_k).  0.0 for a
        single merchant category.  NaN when merchant data unavailable or no
        transactions.

    total_transaction_amount
        Sum of all transaction amounts for community member transactions.
        NaN when no transactions.
    """
    _empty: dict[str, float] = {
        "mean_tx_amount": _NAN,
        "amount_cv": _NAN,
        "declined_rate": _NAN,
        "unique_payment_methods": _NAN,
        "merchant_category_entropy": _NAN,
        "total_transaction_amount": _NAN,
    }

    if member_txs.empty:
        return _empty

    amounts = member_txs["amount"].astype(np.float64)
    n_tx = len(amounts)
    mean_amt = float(amounts.mean())
    total_amt = float(amounts.sum())

    # amount_cv: sample standard deviation requires n >= 2.
    if n_tx >= 2:
        std_amt = float(amounts.std(ddof=1))
        amount_cv = std_amt / mean_amt if mean_amt != 0.0 else _NAN
    else:
        amount_cv = _NAN

    # declined_rate
    if "transaction_status" in member_txs.columns:
        n_declined = int((member_txs["transaction_status"] == "declined").sum())
        declined_rate = n_declined / n_tx
    else:
        declined_rate = _NAN

    # unique_payment_methods
    if "payment_method" in member_txs.columns:
        unique_pm = float(member_txs["payment_method"].nunique())
    else:
        unique_pm = _NAN

    # merchant_category_entropy
    mce: float = _NAN
    if merchant_cat is not None and "merchant_id" in member_txs.columns:
        categories = (
            member_txs["merchant_id"].astype(str).map(merchant_cat).dropna()
        )
        mce = _shannon_entropy_bits(categories)

    return {
        "mean_tx_amount": mean_amt,
        "amount_cv": amount_cv,
        "declined_rate": declined_rate,
        "unique_payment_methods": unique_pm,
        "merchant_category_entropy": mce,
        "total_transaction_amount": total_amt,
    }


# ---------------------------------------------------------------------------
# Main public API
# ---------------------------------------------------------------------------


def compute_community_features(
    communities: list[Community],
    tx_df: pd.DataFrame,
    merchant_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Compute the feature matrix for a list of detected communities.

    Args:
        communities: Communities from :func:`src.detection.communities.detect_communities`.
        tx_df: Observable-only transaction DataFrame.  Must NOT contain
            ``pattern_id``, ``is_ring_member``, or ``link_type`` columns.
            Expected columns: ``src_account_id``, ``dst_account_id``, ``amount``,
            ``transaction_status``, ``payment_method``, ``merchant_id``.
        merchant_df: Optional merchant catalog with at minimum ``merchant_id``
            and ``category`` columns.  Required to compute
            ``merchant_category_entropy``; if absent the feature is NaN.

    Returns:
        ``pd.DataFrame`` with:
        - Index named ``community_id`` (int), one row per community.
        - Columns matching :data:`FEATURE_NAMES` in canonical order.
        - ``float`` dtype throughout; ``NaN`` for mathematically undefined
          values (see per-feature docstrings for precise undefined conditions).

    Raises:
        ValueError: If ``tx_df`` contains any column from :data:`FORBIDDEN_COLUMNS`.
    """
    _validate_tx_df(tx_df)

    if not communities:
        empty = pd.DataFrame(columns=FEATURE_NAMES, dtype=np.float64)
        empty.index.name = "community_id"
        return empty

    # Build merchant_id -> category lookup (observable catalog columns only).
    merchant_cat: dict[str, str] | None = None
    if (
        merchant_df is not None
        and not merchant_df.empty
        and "merchant_id" in merchant_df.columns
        and "category" in merchant_df.columns
    ):
        merchant_cat = dict(
            zip(
                merchant_df["merchant_id"].astype(str),
                merchant_df["category"].astype(str),
            )
        )

    # ------------------------------------------------------------------
    # Index transactions by community membership in a single pass.
    #
    # Each account belongs to exactly one community (Louvain produces a
    # partition).  A transaction is included in a community's member_txs
    # when its src_account_id OR dst_account_id is a community member.
    # When both endpoints are in the same community the transaction is
    # counted once (seen_comm guard below).
    # ------------------------------------------------------------------
    community_tx_rows: dict[int, list[int]] = {
        c.community_id: [] for c in communities
    }
    account_to_cid: dict[str, int] = {
        acc: c.community_id
        for c in communities
        for acc in c.member_account_ids
    }

    if not tx_df.empty and "src_account_id" in tx_df.columns:
        src_col = tx_df["src_account_id"].astype(str).values
        has_dst = "dst_account_id" in tx_df.columns
        dst_col = tx_df["dst_account_id"].astype(str).values if has_dst else None

        for row_idx, src in enumerate(src_col):
            seen_cid: set[int] = set()
            for acct in (src,) + ((dst_col[row_idx],) if dst_col is not None else ()):
                cid = account_to_cid.get(acct)
                if cid is not None and cid not in seen_cid:
                    community_tx_rows[cid].append(row_idx)
                    seen_cid.add(cid)

    # ------------------------------------------------------------------
    # Compute per-community feature rows.
    # ------------------------------------------------------------------
    records: list[dict[str, float]] = []
    community_ids: list[int] = []

    for community in communities:
        row_indices = community_tx_rows[community.community_id]
        member_txs = (
            tx_df.iloc[row_indices] if row_indices else tx_df.iloc[0:0]
        )

        row: dict[str, float] = {}
        row.update(_compute_f1_graph(community))
        row.update(_compute_f2_entity_sharing(community))
        row.update(_compute_f3_temporal(community))
        row.update(_compute_f4_transaction(member_txs, merchant_cat))
        records.append(row)
        community_ids.append(community.community_id)

    df = pd.DataFrame(records, index=community_ids)
    df.index.name = "community_id"

    # Enforce canonical column order defined in FEATURE_NAMES.
    return df[FEATURE_NAMES].astype(np.float64)
