"""TraceLine ML risk-scoring package.

This package provides community-level risk scoring based exclusively on the 21
observable community features computed by ``src.features.community_features``.

Leakage contract
----------------
* No code in this package may import ``src.evaluation`` or read
  ``fraud_cases.csv``.
* Ground-truth labels (y) enter only as the ``y`` argument to
  :func:`src.ml.risk_scorer.train_evaluate`, never as features.
* The scoring path (:func:`src.ml.risk_scorer.score_communities`) operates
  without any labels.

Public API
----------
RiskScorerConfig
    Named-tuple of hyper-parameters and thresholds (all documented).
train_evaluate(X, y, cfg) -> EvaluationResult
    Cross-validated training & evaluation; returns metrics summary.
score_communities(X, community_ids, cfg) -> pd.DataFrame
    Fit a final model on all labelled data, produce deterministic risk scores.
load_feature_matrix(path) -> pd.DataFrame
    Load and validate the feature CSV; rejects forbidden columns.
load_labels(path) -> pd.Series
    Load the labels CSV and return a binary Series indexed by community_id.
RISK_TIER_THRESHOLDS
    Documented probability-to-tier mapping; not calibrated probabilities.
"""

from src.ml.risk_scorer import (
    EVALUATION_FORBIDDEN_COLUMNS,
    RISK_TIER_THRESHOLDS,
    EvaluationResult,
    RiskScorerConfig,
    load_feature_matrix,
    load_labels,
    score_communities,
    train_evaluate,
)

__all__ = [
    "EVALUATION_FORBIDDEN_COLUMNS",
    "RISK_TIER_THRESHOLDS",
    "EvaluationResult",
    "RiskScorerConfig",
    "load_feature_matrix",
    "load_labels",
    "score_communities",
    "train_evaluate",
]
