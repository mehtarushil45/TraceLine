"""TraceLine community feature engine.

Public API
----------
compute_community_features(communities, tx_df, merchant_df=None) -> pd.DataFrame
    Transform a list of detected communities into a per-community feature matrix
    suitable for downstream ML ring scoring.

FEATURE_NAMES   – canonical ordered list of all 21 feature column names.
FEATURE_GROUPS  – dict mapping family name -> list of feature names in that family.
FORBIDDEN_COLUMNS – frozenset of column names that must never appear in tx_df.
"""

from src.features.community_features import (
    FEATURE_GROUPS,
    FEATURE_NAMES,
    FORBIDDEN_COLUMNS,
    compute_community_features,
)

__all__ = [
    "FEATURE_GROUPS",
    "FEATURE_NAMES",
    "FORBIDDEN_COLUMNS",
    "compute_community_features",
]
