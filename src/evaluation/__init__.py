"""TraceLine evaluation and ground-truth labeling package.

This package contains evaluation-only utilities:
- Ground-truth community labeling based on fraud ring coverage (theta threshold).
- Evaluation metrics and ring attribution.

Note: Code in this package is used strictly for offline evaluation and benchmark
labeling. Model feature extraction paths must NEVER import or depend on this
package to prevent label leakage.
"""

from src.evaluation.labeler import (
    DEFAULT_THETA,
    CommunityLabelResult,
    create_community_labels,
    get_binary_labels,
    load_fraud_rings,
)

__all__ = [
    "DEFAULT_THETA",
    "CommunityLabelResult",
    "create_community_labels",
    "get_binary_labels",
    "load_fraud_rings",
]
