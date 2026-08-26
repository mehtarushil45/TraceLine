"""Ground-truth community labeling engine for TraceLine.

Evaluates detected communities against ground-truth fraud rings to generate
evaluation labels for downstream machine learning and benchmark evaluation.

Labeling Rule (theta threshold)
-------------------------------
For a detected community C and a set of ground-truth fraud rings {R_1, ..., R_K}:
- Ring coverage: coverage(C, R_k) = |C ∩ R_k| / |R_k|
- Maximum ring coverage: max_coverage(C) = max_k coverage(C, R_k)
- Binary label: y(C) = 1 if max_coverage(C) >= theta else 0

Under the benchmark contract (default theta = 0.5), a community is labeled
Positive (1) if it captures at least 50% of the accounts of at least one
ground-truth fraud ring. Otherwise, it is labeled Negative (0).

Public API
----------
create_community_labels(communities, fraud_cases_df, theta=0.5) -> pd.DataFrame
    Computes binary labels and detailed ring-attribution metrics for each community.

get_binary_labels(communities, fraud_cases_df, theta=0.5) -> pd.Series
    Returns a binary 0/1 Series indexed by community_id.

load_fraud_rings(fraud_cases_df_or_path) -> Dict[str, Set[str]]
    Parses fraud_cases into a mapping of pattern_id -> set of account IDs.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from src.detection.communities import Community

#: Default threshold for positive community labeling: at least 50% of a ring.
DEFAULT_THETA: float = 0.5

LABEL_COLUMNS: list[str] = [
    "is_positive",
    "max_ring_coverage",
    "primary_ring_id",
    "num_rings_intersected",
    "fraud_account_count",
    "fraud_purity",
]


@dataclass(frozen=True)
class CommunityLabelResult:
    """Detailed ground-truth attribution for a single community."""

    community_id: int
    is_positive: int
    max_ring_coverage: float
    primary_ring_id: str | None
    num_rings_intersected: int
    fraud_account_count: int
    fraud_purity: float
    ring_coverages: dict[str, float]


def load_fraud_rings(
    fraud_cases: pd.DataFrame | str | Path,
) -> dict[str, set[str]]:
    """Parse fraud ring definitions from a DataFrame or CSV file path.

    Args:
        fraud_cases: DataFrame with ``pattern_id`` and ``involved_accounts``
            columns, or file path to ``fraud_cases.csv``.

    Returns:
        Dict mapping ``pattern_id`` (str) -> set of member account IDs (str).

    Raises:
        ValueError: If required columns are missing or file does not exist.
    """
    if isinstance(fraud_cases, (str, Path)):
        path = Path(fraud_cases)
        if not path.exists():
            raise FileNotFoundError(f"Fraud cases file not found: {path}")
        df = pd.read_csv(path)
    elif isinstance(fraud_cases, pd.DataFrame):
        df = fraud_cases
    else:
        raise TypeError(
            f"Expected pd.DataFrame, str, or Path, got {type(fraud_cases).__name__}"
        )

    if df.empty:
        return {}

    if "pattern_id" not in df.columns or "involved_accounts" not in df.columns:
        raise ValueError(
            "fraud_cases DataFrame must contain 'pattern_id' and 'involved_accounts' columns. "
            f"Found: {list(df.columns)}"
        )

    rings: dict[str, set[str]] = {}
    for _, row in df.iterrows():
        pid = str(row["pattern_id"])
        inv = row["involved_accounts"]
        if pd.isna(inv):
            rings[pid] = set()
            continue
        if isinstance(inv, (list, tuple, set)):
            rings[pid] = {str(acc).strip() for acc in inv if str(acc).strip()}
        else:
            rings[pid] = {
                acc.strip()
                for acc in str(inv).split("|")
                if acc.strip()
            }
    return rings


def create_community_labels(
    communities: list[Community],
    fraud_cases: pd.DataFrame | str | Path | dict[str, set[str]],
    theta: float = DEFAULT_THETA,
) -> pd.DataFrame:
    """Compute ground-truth binary labels and ring attribution for communities.

    Args:
        communities: Detected communities from Louvain community detection.
        fraud_cases: Ground-truth fraud rings DataFrame, CSV path, or pre-parsed dict.
        theta: Minimum ring coverage threshold for positive label (default 0.5).
            Must satisfy 0.0 < theta <= 1.0.

    Returns:
        DataFrame indexed by ``community_id`` with columns:
        - ``is_positive`` (int: 0 or 1)
        - ``max_ring_coverage`` (float: [0.0, 1.0])
        - ``primary_ring_id`` (str or None: ring with highest coverage in this community)
        - ``num_rings_intersected`` (int: count of rings with >= 1 account in C)
        - ``fraud_account_count`` (int: count of distinct fraud accounts in C)
        - ``fraud_purity`` (float: fraud_account_count / member_count)

    Raises:
        ValueError: If theta is not in (0.0, 1.0].
    """
    if not (0.0 < theta <= 1.0):
        raise ValueError(f"theta must be in range (0.0, 1.0], got {theta}")

    if not communities:
        empty = pd.DataFrame(columns=LABEL_COLUMNS)
        empty.index.name = "community_id"
        return empty

    if isinstance(fraud_cases, dict):
        rings = fraud_cases
    else:
        rings = load_fraud_rings(fraud_cases)

    # Pre-collect all fraud accounts across all rings for rapid purity checks.
    all_fraud_accounts: set[str] = set()
    for accs in rings.values():
        all_fraud_accounts.update(accs)

    records: list[dict[str, int | float | str | None]] = []
    community_ids: list[int] = []

    for c in communities:
        members_set = set(c.member_account_ids)
        c_fraud_accounts = members_set & all_fraud_accounts
        fraud_count = len(c_fraud_accounts)
        purity = fraud_count / c.member_count if c.member_count > 0 else 0.0

        max_cov = 0.0
        primary_ring: str | None = None
        rings_touched = 0

        for pid, ring_accs in rings.items():
            if not ring_accs:
                continue
            overlap = len(members_set & ring_accs)
            if overlap > 0:
                rings_touched += 1
                cov = overlap / len(ring_accs)
                if cov > max_cov:
                    max_cov = cov
                    primary_ring = pid

        is_pos = 1 if max_cov >= theta else 0

        records.append(
            {
                "is_positive": int(is_pos),
                "max_ring_coverage": round(max_cov, 6),
                "primary_ring_id": primary_ring,
                "num_rings_intersected": int(rings_touched),
                "fraud_account_count": int(fraud_count),
                "fraud_purity": round(purity, 6),
            }
        )
        community_ids.append(c.community_id)

    df = pd.DataFrame(records, index=community_ids)
    df.index.name = "community_id"
    return df[LABEL_COLUMNS]


def get_binary_labels(
    communities: list[Community],
    fraud_cases: pd.DataFrame | str | Path | dict[str, set[str]],
    theta: float = DEFAULT_THETA,
) -> pd.Series:
    """Return a binary 0/1 Series indexed by community_id.

    Args:
        communities: Detected communities.
        fraud_cases: Ground-truth fraud rings DataFrame, path, or dict.
        theta: Coverage threshold for positive label (default 0.5).

    Returns:
        ``pd.Series`` of dtype ``int64`` named ``label``, indexed by ``community_id``.
    """
    labels_df = create_community_labels(communities, fraud_cases, theta=theta)
    if labels_df.empty:
        s = pd.Series(dtype=np.int64, name="label")
        s.index.name = "community_id"
        return s
    s = labels_df["is_positive"].astype(np.int64)
    s.name = "label"
    return s
