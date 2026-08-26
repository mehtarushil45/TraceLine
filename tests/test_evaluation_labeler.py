"""Tests for TraceLine's evaluation labeling engine.

Covers:
  1. Exact label computation under theta=0.5 on hand-crafted communities.
  2. Sub-threshold ring overlap (e.g. 1/4 = 0.25 < 0.5 -> label 0).
  3. Super-threshold ring overlap (e.g. 3/5 = 0.6 >= 0.5 -> label 1).
  4. Exact boundary condition (e.g. 2/4 = 0.5 == 0.5 -> label 1).
  5. Multi-ring overlap: primary ring attribution and maximum coverage selection.
  6. Pure negative community (0 fraud accounts -> max_cov=0.0, label=0, primary_ring=None).
  7. get_binary_labels returns a binary pd.Series indexed by community_id.
  8. load_fraud_rings parses pipe-separated accounts and raises on invalid schema.
  9. Invalid theta raises ValueError (theta <= 0, theta > 1).
 10. Empty community list returns empty DataFrame with correct schema.
 11. Deterministic output across repeated calls.
 12. Strict isolation test: features module never imports or accesses evaluation labeler.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.detection.communities import Community, CommunityTemporalStats
from src.evaluation.labeler import (
    LABEL_COLUMNS,
    create_community_labels,
    get_binary_labels,
    load_fraud_rings,
)

# ---------------------------------------------------------------------------
# Fixtures & Helpers
# ---------------------------------------------------------------------------


def _make_dummy_community(
    community_id: int,
    members: list[str],
) -> Community:
    """Construct a minimal Community object for labeling tests."""
    member_tuple = tuple(sorted(members))
    n = len(member_tuple)
    return Community(
        community_id=community_id,
        member_account_ids=member_tuple,
        member_count=n,
        internal_edge_count=0,
        total_internal_weight=0.0,
        density=0.0,
        min_timestamp=None,
        max_timestamp=None,
        duration_hours=None,
        temporal_stats=CommunityTemporalStats(
            transaction_count=0,
            unique_active_hours=0,
            median_inter_transaction_gap_hours=None,
            timestamp_span_hours=0.0,
            temporal_compression_score=0.0,
        ),
        internal_edges=(),
    )


@pytest.fixture
def fraud_rings_dict() -> dict[str, set[str]]:
    """Hand-crafted fraud rings:
    - ring_1: 4 accounts {acc_f1, acc_f2, acc_f3, acc_f4}
    - ring_2: 5 accounts {acc_g1, acc_g2, acc_g3, acc_g4, acc_g5}
    - ring_3: 6 accounts {acc_h1, acc_h2, acc_h3, acc_h4, acc_h5, acc_h6}
    """
    return {
        "ring_1": {"acc_f1", "acc_f2", "acc_f3", "acc_f4"},
        "ring_2": {"acc_g1", "acc_g2", "acc_g3", "acc_g4", "acc_g5"},
        "ring_3": {"acc_h1", "acc_h2", "acc_h3", "acc_h4", "acc_h5", "acc_h6"},
    }


@pytest.fixture
def fraud_cases_df() -> pd.DataFrame:
    """DataFrame version matching fraud_cases.csv format."""
    return pd.DataFrame(
        [
            {
                "pattern_id": "ring_1",
                "start_acc_id": "acc_f1",
                "pattern_type": "cycle",
                "depth": 4,
                "involved_accounts": "acc_f1|acc_f2|acc_f3|acc_f4",
            },
            {
                "pattern_id": "ring_2",
                "start_acc_id": "acc_g1",
                "pattern_type": "cycle",
                "depth": 5,
                "involved_accounts": "acc_g1|acc_g2|acc_g3|acc_g4|acc_g5",
            },
            {
                "pattern_id": "ring_3",
                "start_acc_id": "acc_h1",
                "pattern_type": "cycle",
                "depth": 6,
                "involved_accounts": "acc_h1|acc_h2|acc_h3|acc_h4|acc_h5|acc_h6",
            },
        ]
    )


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------


def test_load_fraud_rings_from_df(fraud_cases_df: pd.DataFrame) -> None:
    """load_fraud_rings correctly parses pipe-delimited account IDs."""
    rings = load_fraud_rings(fraud_cases_df)
    assert len(rings) == 3
    assert rings["ring_1"] == {"acc_f1", "acc_f2", "acc_f3", "acc_f4"}
    assert len(rings["ring_2"]) == 5
    assert len(rings["ring_3"]) == 6


def test_load_fraud_rings_missing_columns() -> None:
    """load_fraud_rings raises ValueError when required columns are absent."""
    bad_df = pd.DataFrame([{"invalid_col": 123}])
    with pytest.raises(ValueError, match="must contain 'pattern_id'"):
        load_fraud_rings(bad_df)


def test_labeling_threshold_cases(fraud_rings_dict: dict[str, set[str]]) -> None:
    """Test sub-threshold, exact threshold, and super-threshold labeling under theta=0.5."""
    # c0: contains 1/4 of ring_1 -> cov = 0.25 < 0.5 -> label 0
    c0 = _make_dummy_community(0, ["acc_f1", "acc_clean_1", "acc_clean_2"])

    # c1: contains 2/4 of ring_1 -> cov = 0.50 >= 0.5 -> label 1 (exact boundary)
    c1 = _make_dummy_community(1, ["acc_f1", "acc_f2", "acc_clean_3"])

    # c2: contains 4/5 of ring_2 -> cov = 0.80 >= 0.5 -> label 1 (super-threshold)
    c2 = _make_dummy_community(2, ["acc_g1", "acc_g2", "acc_g3", "acc_g4", "acc_clean_4"])

    # c3: pure clean community -> cov = 0.0 -> label 0
    c3 = _make_dummy_community(3, ["acc_clean_5", "acc_clean_6", "acc_clean_7"])

    communities = [c0, c1, c2, c3]
    df = create_community_labels(communities, fraud_rings_dict, theta=0.5)

    assert list(df.columns) == LABEL_COLUMNS
    assert len(df) == 4

    # c0 checks
    assert df.loc[0, "is_positive"] == 0
    assert df.loc[0, "max_ring_coverage"] == pytest.approx(0.25)
    assert df.loc[0, "primary_ring_id"] == "ring_1"
    assert df.loc[0, "fraud_account_count"] == 1
    assert df.loc[0, "fraud_purity"] == pytest.approx(1 / 3)

    # c1 checks
    assert df.loc[1, "is_positive"] == 1
    assert df.loc[1, "max_ring_coverage"] == pytest.approx(0.50)
    assert df.loc[1, "primary_ring_id"] == "ring_1"
    assert df.loc[1, "fraud_account_count"] == 2
    assert df.loc[1, "fraud_purity"] == pytest.approx(2 / 3)

    # c2 checks
    assert df.loc[2, "is_positive"] == 1
    assert df.loc[2, "max_ring_coverage"] == pytest.approx(0.80)
    assert df.loc[2, "primary_ring_id"] == "ring_2"
    assert df.loc[2, "fraud_account_count"] == 4
    assert df.loc[2, "fraud_purity"] == pytest.approx(4 / 5)

    # c3 checks
    assert df.loc[3, "is_positive"] == 0
    assert df.loc[3, "max_ring_coverage"] == pytest.approx(0.0)
    assert pd.isna(df.loc[3, "primary_ring_id"]) or df.loc[3, "primary_ring_id"] is None
    assert df.loc[3, "fraud_account_count"] == 0
    assert df.loc[3, "fraud_purity"] == pytest.approx(0.0)


def test_multi_ring_primary_attribution(fraud_rings_dict: dict[str, set[str]]) -> None:
    """Community touching multiple rings attributes primary_ring_id to the max coverage ring."""
    # c: contains 1/4 of ring_1 (cov=0.25) and 3/5 of ring_2 (cov=0.60)
    c = _make_dummy_community(
        10,
        ["acc_f1", "acc_g1", "acc_g2", "acc_g3", "acc_clean_10"],
    )
    df = create_community_labels([c], fraud_rings_dict, theta=0.5)

    assert df.loc[10, "is_positive"] == 1
    assert df.loc[10, "max_ring_coverage"] == pytest.approx(0.60)
    assert df.loc[10, "primary_ring_id"] == "ring_2"
    assert df.loc[10, "num_rings_intersected"] == 2
    assert df.loc[10, "fraud_account_count"] == 4  # 1 from ring_1 + 3 from ring_2
    assert df.loc[10, "fraud_purity"] == pytest.approx(4 / 5)


def test_get_binary_labels_series(fraud_rings_dict: dict[str, set[str]]) -> None:
    """get_binary_labels returns a pd.Series named 'label'."""
    c0 = _make_dummy_community(0, ["acc_clean_1"])
    c1 = _make_dummy_community(1, ["acc_f1", "acc_f2", "acc_f3"])  # 3/4 = 0.75 >= 0.5 -> 1

    labels = get_binary_labels([c0, c1], fraud_rings_dict, theta=0.5)
    assert isinstance(labels, pd.Series)
    assert labels.name == "label"
    assert labels.loc[0] == 0
    assert labels.loc[1] == 1
    assert labels.dtype == np.int64


def test_invalid_theta_raises() -> None:
    """theta <= 0 or theta > 1 raises ValueError."""
    c = _make_dummy_community(0, ["acc_1"])
    with pytest.raises(ValueError, match="theta must be in range"):
        create_community_labels([c], {}, theta=0.0)
    with pytest.raises(ValueError, match="theta must be in range"):
        create_community_labels([c], {}, theta=1.5)


def test_empty_communities_returns_schema() -> None:
    """Empty communities list returns an empty DataFrame with LABEL_COLUMNS."""
    df = create_community_labels([], {})
    assert len(df) == 0
    assert list(df.columns) == LABEL_COLUMNS
    assert df.index.name == "community_id"

    s = get_binary_labels([], {})
    assert len(s) == 0
    assert s.name == "label"
    assert s.index.name == "community_id"


def test_deterministic_labeling(fraud_cases_df: pd.DataFrame) -> None:
    """Repeated labeling runs produce identical DataFrames."""
    c0 = _make_dummy_community(0, ["acc_f1", "acc_f2"])
    c1 = _make_dummy_community(1, ["acc_clean_1"])
    df1 = create_community_labels([c0, c1], fraud_cases_df, theta=0.5)
    df2 = create_community_labels([c0, c1], fraud_cases_df, theta=0.5)
    pd.testing.assert_frame_equal(df1, df2)


def test_no_leakage_between_features_and_labeler() -> None:
    """Verify feature module never imports evaluation or uses label columns."""
    features_code = Path("src/features/community_features.py").read_text(encoding="utf-8")

    assert "src.evaluation" not in features_code, (
        "src.features.community_features must never import src.evaluation"
    )
    assert "evaluation" not in features_code.lower() or "evaluation-only" in features_code.lower(), (
        "src.features must not use evaluation logic"
    )
    for col in LABEL_COLUMNS:
        assert f'"{col}"' not in features_code, (
            f"Feature engine must not reference label column '{col}'"
        )
