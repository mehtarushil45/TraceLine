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
from typing import Any

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
        if bool(pd.isna(inv)):
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
    """Evaluate detected communities against ground-truth fraud rings.

    Computes for every community:
    - ``is_positive``: 1 if max_ring_coverage >= theta, else 0.
    - ``max_ring_coverage``: max_{r} |C ∩ r| / |r| across all known fraud rings r.
    - ``primary_ring_id``: ID of the ring that yields max_ring_coverage (or None).
    - ``num_rings_intersected``: Number of distinct rings with |C ∩ r| > 0.
    - ``fraud_account_count``: Total number of member accounts belonging to any ring.
    - ``fraud_purity``: |C ∩ all_fraud_accounts| / |C|.

    Args:
        communities: Detected communities from Louvain.
        fraud_cases: Ground-truth fraud rings as DataFrame, file path, or pre-loaded dict.
        theta: Threshold on max_ring_coverage for assigning is_positive=1 (default: 0.5).

    Returns:
        DataFrame with index ``community_id`` and columns :data:`LABEL_COLUMNS`.
    """
    if not (0.0 < theta <= 1.0):
        raise ValueError(f"theta must be in range (0.0, 1.0], got {theta}")

    if isinstance(fraud_cases, (str, Path)):
        rings = load_fraud_rings(fraud_cases)
    elif isinstance(fraud_cases, dict):
        rings = {k: set(v) for k, v in fraud_cases.items()}
    elif isinstance(fraud_cases, pd.DataFrame):
        rings = load_fraud_rings(fraud_cases)
    else:
        raise TypeError(
            f"fraud_cases must be DataFrame, Path, str, or dict; got {type(fraud_cases).__name__}"
        )

    all_fraud_accounts: set[str] = set()
    for ring_members in rings.values():
        all_fraud_accounts |= ring_members

    records: list[dict[str, Any]] = []
    community_ids: list[int] = []

    for c in communities:
        members = set(c.member_account_ids)
        size = len(members)

        if size == 0:
            records.append(
                {
                    "is_positive": 0,
                    "max_ring_coverage": 0.0,
                    "primary_ring_id": None,
                    "num_rings_intersected": 0,
                    "fraud_account_count": 0,
                    "fraud_purity": 0.0,
                }
            )
            community_ids.append(c.community_id)
            continue

        best_ring_id: str | None = None
        best_coverage: float = 0.0
        rings_intersected: int = 0

        for ring_id, ring_members in rings.items():
            if not ring_members:
                continue
            intersection_size = len(members & ring_members)
            if intersection_size > 0:
                rings_intersected += 1
                coverage = intersection_size / len(ring_members)
                if coverage > best_coverage:
                    best_coverage = coverage
                    best_ring_id = ring_id

        fraud_members = members & all_fraud_accounts
        fraud_count = len(fraud_members)
        purity = fraud_count / size if size > 0 else 0.0
        is_pos = 1 if best_coverage >= theta else 0

        records.append(
            {
                "is_positive": int(is_pos),
                "max_ring_coverage": round(best_coverage, 6),
                "primary_ring_id": best_ring_id,
                "num_rings_intersected": int(rings_intersected),
                "fraud_account_count": int(fraud_count),
                "fraud_purity": round(purity, 6),
            }
        )
        community_ids.append(c.community_id)

    df = pd.DataFrame(records, index=community_ids)
    df.index.name = "community_id"
    return pd.DataFrame(df.reindex(columns=LABEL_COLUMNS))


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
    return pd.Series(labels_df["is_positive"].astype(np.int64).values, index=labels_df.index, name="label")
