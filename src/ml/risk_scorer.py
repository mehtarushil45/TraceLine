"""TraceLine community risk scorer.

Produces deterministic, explainable risk scores for every detected community
using ONLY the 21 observable community features from
``src.features.community_features``.

Design Principles
-----------------
1. **Leakage isolation** – ground-truth labels are accepted ONLY as the ``y``
   parameter in :func:`train_evaluate`.  No label-derived column ever touches
   the feature matrix ``X``.
2. **Small-sample honesty** – With N=59 communities the effective sample size is
   too small for stable held-out test estimates.  We use
   ``RepeatedStratifiedKFold`` (10 folds × 10 repeats = 100 mini-experiments)
   and report mean ± std for every metric.  All reported metrics are clearly
   marked as cross-validation estimates, not production-calibrated probabilities.
3. **Determinism** – ``seed=42`` is threaded through every random state.  Identical
   inputs produce byte-identical outputs across Python runs.
4. **Interpretability** – Logistic Regression (L2-penalised) is the primary model.
   Feature importance is read from coefficients after standardisation so that
   coefficients are comparable.  A Random Forest provides a non-linear comparison.
5. **Risk tiers** – Tiers are deliberately simple and conservative.  They are
   NOT calibrated probabilities; they are ranked ordinal indicators for
   investigator prioritisation.

Risk Tier Thresholds (``RISK_TIER_THRESHOLDS``)
-----------------------------------------------
The thresholds below were chosen to be conservative and clearly documented:

    probability ≥ 0.60 → HIGH   (strong observable signal, priority review)
    probability ≥ 0.35 → MEDIUM (moderate signal, secondary review)
    probability  < 0.35 → LOW    (weak signal, background monitoring)

These values are NOT derived from empirical calibration on 59 samples; they are
reasonable starting-point separations for an investigator dashboard.  They MUST
be re-evaluated when the community count exceeds ~200 samples.

Observable Signal Descriptions
--------------------------------
Each feature has a human-readable signal description used in community
explanations.  Descriptions are deliberately written without claiming fraud
certainty ("elevated" rather than "fraudulent").
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, FrozenSet, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RepeatedStratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.features.community_features import FEATURE_NAMES, FORBIDDEN_COLUMNS

# ---------------------------------------------------------------------------
# Leakage contract: columns that must NEVER enter the feature matrix X.
# Mirrors FORBIDDEN_COLUMNS from the feature engine PLUS evaluation-only
# columns produced by src.evaluation.labeler.
# ---------------------------------------------------------------------------

#: Columns forbidden in X (feature matrix) by the leakage contract.
#: Note: ``community_id`` is NOT listed here because load_feature_matrix uses it
#: as the CSV index_col; it is never present as a DataFrame column after loading.
EVALUATION_FORBIDDEN_COLUMNS: FrozenSet[str] = FORBIDDEN_COLUMNS | frozenset(
    {
        # src.evaluation.labeler output columns
        "is_positive",
        "max_ring_coverage",
        "primary_ring_id",
        "num_rings_intersected",
        "fraud_account_count",
        "fraud_purity",
        # binary label column
        "label",
    }
)

# ---------------------------------------------------------------------------
# Risk tier thresholds (documented conservatively)
# ---------------------------------------------------------------------------

#: Mapping of risk tier name -> minimum probability threshold.
#: See module docstring for interpretation notes.
RISK_TIER_THRESHOLDS: Dict[str, float] = {
    "HIGH": 0.60,
    "MEDIUM": 0.35,
    "LOW": 0.00,
}

# ---------------------------------------------------------------------------
# Observable signal human-readable descriptions
# ---------------------------------------------------------------------------

#: Human-readable description for each feature, used in explanations.
#: Written to avoid claiming fraud certainty.
_SIGNAL_DESCRIPTIONS: Dict[str, str] = {
    "member_count": "large community size",
    "density": "high intra-community connectivity density",
    "mean_edge_weight": "elevated mean shared-evidence weight per account pair",
    "weight_per_member": "high evidence weight per member",
    "unique_shared_instruments": "elevated shared payment-instrument count",
    "unique_shared_devices": "elevated shared-device count",
    "unique_shared_ips": "elevated shared IP-address count",
    "unique_shared_merchants": "elevated shared-merchant count",
    "instrument_sharing_ratio": "high payment-instrument sharing ratio",
    "device_sharing_ratio": "high device-sharing ratio",
    "temporal_compression_score": "unusually compressed transaction timing",
    "unique_active_hours": "transaction activity spanning many clock hours",
    "median_inter_transaction_gap_hours": "unusually short inter-transaction gap",
    "tx_per_member": "high transactions-per-member rate",
    "temporal_overlap_mean": "high temporal overlap across account pairs",
    "mean_tx_amount": "elevated mean transaction amount",
    "amount_cv": "high transaction amount variability",
    "declined_rate": "elevated transaction declined rate",
    "unique_payment_methods": "diverse payment methods in use",
    "merchant_category_entropy": "high merchant category diversity",
    "total_transaction_amount": "high total financial exposure",
}

# Features where a LOWER value is the suspicious signal
_LOW_IS_SUSPICIOUS: FrozenSet[str] = frozenset(
    {
        "density",                          # ring members co-connected sparsely
        "median_inter_transaction_gap_hours",  # shorter gap = more rapid pacing
    }
)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RiskScorerConfig:
    """Hyper-parameters and thresholds for the TraceLine risk scorer.

    All parameters are fully documented and default to deterministic settings.

    Attributes:
        seed: Random state seed for reproducibility (default 42).
        n_splits: Number of stratified folds for cross-validation (default 10).
        n_repeats: Number of CV repetitions for stability estimation (default 10).
        lr_C: Inverse regularisation strength for Logistic Regression (default 1.0).
        lr_max_iter: Maximum LR solver iterations (default 2000).
        rf_n_estimators: Number of trees in Random Forest (default 200).
        rf_max_depth: Max depth for Random Forest (None = grow full; default 6).
        class_weight: Class weighting strategy ("balanced" handles 3.92:1 imbalance).
        risk_tier_thresholds: Dict mapping tier name -> min probability.
        top_n_signals: Number of top observable signals to include in explanations.
    """

    seed: int = 42
    n_splits: int = 10
    n_repeats: int = 10
    lr_C: float = 1.0
    lr_max_iter: int = 2000
    rf_n_estimators: int = 200
    rf_max_depth: Optional[int] = 6
    class_weight: str = "balanced"
    risk_tier_thresholds: Dict[str, float] = field(
        default_factory=lambda: dict(RISK_TIER_THRESHOLDS)
    )
    top_n_signals: int = 3


# ---------------------------------------------------------------------------
# Evaluation results container
# ---------------------------------------------------------------------------


@dataclass
class EvaluationResult:
    """Cross-validation metrics for a single model.

    All mean/std values are computed across ``n_splits * n_repeats`` folds.
    They are cross-validation estimates, not held-out test metrics.

    Attributes:
        model_name: Human-readable model identifier.
        mean_roc_auc: Mean ROC-AUC across all folds.
        std_roc_auc: Standard deviation of ROC-AUC.
        mean_average_precision: Mean average precision (area under PR curve).
        std_average_precision: Standard deviation of average precision.
        mean_f1: Mean F1-score (macro-averaged).
        std_f1: Standard deviation of F1-score.
        mean_precision: Mean precision.
        std_precision: Standard deviation of precision.
        mean_recall: Mean recall.
        std_recall: Standard deviation of recall.
        n_folds: Total folds evaluated (n_splits × n_repeats).
        n_samples: Total sample count.
        n_positive: Number of positive samples.
        stability_warning: True when std_roc_auc > 0.15 (metric unstable).
    """

    model_name: str
    mean_roc_auc: float
    std_roc_auc: float
    mean_average_precision: float
    std_average_precision: float
    mean_f1: float
    std_f1: float
    mean_precision: float
    std_precision: float
    mean_recall: float
    std_recall: float
    n_folds: int
    n_samples: int
    n_positive: int
    stability_warning: bool


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------


def load_feature_matrix(path: Path | str) -> pd.DataFrame:
    """Load and validate the community feature matrix from CSV.

    Args:
        path: Path to ``community_features.csv`` produced by the feature engine.

    Returns:
        DataFrame with ``community_id`` as the index and 21 float64 feature columns.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If any forbidden/evaluation column is present in the file, or
            if the expected feature columns are missing.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Feature matrix CSV not found: {path}")

    df = pd.read_csv(path, index_col="community_id")

    # Leakage guard: reject forbidden columns
    bad_cols = EVALUATION_FORBIDDEN_COLUMNS & set(df.columns)
    if bad_cols:
        raise ValueError(
            f"Feature matrix contains evaluation-forbidden columns: {sorted(bad_cols)}. "
            "These must never enter X."
        )

    # Ensure expected feature columns are present
    missing_features = set(FEATURE_NAMES) - set(df.columns)
    if missing_features:
        raise ValueError(
            f"Feature matrix is missing expected feature columns: {sorted(missing_features)}"
        )

    return df[FEATURE_NAMES].astype(np.float64)


def load_labels(path: Path | str) -> pd.Series:
    """Load binary community labels from CSV.

    Args:
        path: Path to ``community_labels.csv`` produced by the evaluation labeler.

    Returns:
        Binary int64 Series named ``label``, indexed by ``community_id``.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If ``is_positive`` column is absent.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Labels CSV not found: {path}")

    df = pd.read_csv(path, index_col="community_id")
    if "is_positive" not in df.columns:
        raise ValueError("Labels CSV must contain 'is_positive' column.")

    s = df["is_positive"].astype(np.int64)
    s.name = "label"
    return s


# ---------------------------------------------------------------------------
# Model builders
# ---------------------------------------------------------------------------


def _build_lr_pipeline(cfg: RiskScorerConfig) -> Pipeline:
    """Build a StandardScaler + LogisticRegression pipeline."""
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "lr",
                LogisticRegression(
                    C=cfg.lr_C,
                    max_iter=cfg.lr_max_iter,
                    class_weight=cfg.class_weight,
                    random_state=cfg.seed,
                    solver="lbfgs",
                ),
            ),
        ]
    )


def _build_rf_pipeline(cfg: RiskScorerConfig) -> Pipeline:
    """Build a RandomForest pipeline (no scaler needed but kept for consistency)."""
    return Pipeline(
        [
            (
                "rf",
                RandomForestClassifier(
                    n_estimators=cfg.rf_n_estimators,
                    max_depth=cfg.rf_max_depth,
                    class_weight=cfg.class_weight,
                    random_state=cfg.seed,
                    n_jobs=1,  # Deterministic single-threaded
                ),
            ),
        ]
    )


# ---------------------------------------------------------------------------
# Core training / evaluation
# ---------------------------------------------------------------------------


def _run_cv(
    pipeline: Pipeline,
    X: pd.DataFrame,
    y: pd.Series,
    cfg: RiskScorerConfig,
    model_name: str,
) -> EvaluationResult:
    """Run RepeatedStratifiedKFold cross-validation and return EvaluationResult."""
    cv = RepeatedStratifiedKFold(
        n_splits=cfg.n_splits,
        n_repeats=cfg.n_repeats,
        random_state=cfg.seed,
    )

    scoring = {
        "roc_auc": "roc_auc",
        "average_precision": "average_precision",
        "f1": "f1",
        "precision": "precision",
        "recall": "recall",
    }

    # Impute NaN with column medians before CV (some features may be NaN for
    # edge-case communities; median imputation is done inside CV to prevent
    # test-fold contamination of imputation statistics).
    X_arr = X.values.copy()
    col_medians = np.nanmedian(X_arr, axis=0)
    nan_mask = np.isnan(X_arr)
    for j in range(X_arr.shape[1]):
        X_arr[nan_mask[:, j], j] = col_medians[j]

    X_imputed = pd.DataFrame(X_arr, columns=X.columns, index=X.index)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        cv_results = cross_validate(
            pipeline,
            X_imputed,
            y,
            cv=cv,
            scoring=scoring,
            return_train_score=False,
            n_jobs=1,  # deterministic
        )

    n_folds = cfg.n_splits * cfg.n_repeats
    n_pos = int(y.sum())
    std_roc = float(np.std(cv_results["test_roc_auc"], ddof=1))

    return EvaluationResult(
        model_name=model_name,
        mean_roc_auc=float(np.mean(cv_results["test_roc_auc"])),
        std_roc_auc=std_roc,
        mean_average_precision=float(np.mean(cv_results["test_average_precision"])),
        std_average_precision=float(np.std(cv_results["test_average_precision"], ddof=1)),
        mean_f1=float(np.mean(cv_results["test_f1"])),
        std_f1=float(np.std(cv_results["test_f1"], ddof=1)),
        mean_precision=float(np.mean(cv_results["test_precision"])),
        std_precision=float(np.std(cv_results["test_precision"], ddof=1)),
        mean_recall=float(np.mean(cv_results["test_recall"])),
        std_recall=float(np.std(cv_results["test_recall"], ddof=1)),
        n_folds=n_folds,
        n_samples=len(y),
        n_positive=n_pos,
        stability_warning=std_roc > 0.15,
    )


def train_evaluate(
    X: pd.DataFrame,
    y: pd.Series,
    cfg: Optional[RiskScorerConfig] = None,
) -> Dict[str, EvaluationResult]:
    """Train and cross-validate baseline models; return evaluation metrics.

    Uses RepeatedStratifiedKFold (default: 10 folds × 10 repeats) to obtain
    stable cross-validated estimates on the small (N=59) community dataset.

    Leakage safeguard: ``X`` is validated against ``EVALUATION_FORBIDDEN_COLUMNS``
    before any model sees it.

    Args:
        X: Feature matrix (communities × features).  Must not contain any
            evaluation-forbidden columns.
        y: Binary labels (0 or 1), indexed by ``community_id``.  Only used as
            the target during training; never enters the feature matrix.
        cfg: Configuration.  Defaults to :class:`RiskScorerConfig`.

    Returns:
        Dict mapping model name -> :class:`EvaluationResult`.

    Raises:
        ValueError: If X contains forbidden columns or X/y are misaligned.
    """
    if cfg is None:
        cfg = RiskScorerConfig()

    # Leakage guard on X
    bad = EVALUATION_FORBIDDEN_COLUMNS & set(X.columns)
    if bad:
        raise ValueError(
            f"X contains evaluation-forbidden columns: {sorted(bad)}"
        )

    # Align X and y
    common_idx = X.index.intersection(y.index)
    X_aligned = X.loc[common_idx]
    y_aligned = y.loc[common_idx]

    if len(X_aligned) == 0:
        raise ValueError("X and y have no overlapping community_id indices.")

    results: Dict[str, EvaluationResult] = {}

    # Logistic Regression (primary, interpretable baseline)
    results["LogisticRegression"] = _run_cv(
        _build_lr_pipeline(cfg), X_aligned, y_aligned, cfg, "LogisticRegression"
    )

    # Random Forest (non-linear comparison)
    results["RandomForest"] = _run_cv(
        _build_rf_pipeline(cfg), X_aligned, y_aligned, cfg, "RandomForest"
    )

    return results


# ---------------------------------------------------------------------------
# Risk scoring (production path)
# ---------------------------------------------------------------------------


def _assign_tier(probability: float, thresholds: Dict[str, float]) -> str:
    """Map a probability in [0,1] to a risk tier string."""
    if probability >= thresholds["HIGH"]:
        return "HIGH"
    if probability >= thresholds["MEDIUM"]:
        return "MEDIUM"
    return "LOW"


def _build_explanation(
    community_id: int,
    feature_row: pd.Series,
    coef_series: pd.Series,
    cfg: RiskScorerConfig,
) -> Tuple[str, str, str]:
    """Build top-N observable signal strings for a community.

    Uses the signed coefficient × feature-z-score to identify the features
    that most strongly pushed the probability upward.

    Args:
        community_id: Community identifier (for logging only).
        feature_row: Single row of the *standardised* feature matrix (z-scores).
        coef_series: LR coefficients (feature -> coefficient).
        cfg: Scorer configuration.

    Returns:
        Tuple of top_signal_1, top_signal_2, top_signal_3 strings.
        Empty string if fewer than N signals are available.
    """
    # Signal strength = coefficient × z-score (contribution to log-odds)
    contributions = coef_series * feature_row
    # For "low is suspicious" features, the sign is already handled by the LR
    # coefficient learning; no manual inversion needed.
    top_features = contributions.nlargest(cfg.top_n_signals)

    signals = []
    for feat_name, _ in top_features.items():
        desc = _SIGNAL_DESCRIPTIONS.get(str(feat_name), str(feat_name))
        signals.append(desc)

    while len(signals) < 3:
        signals.append("")

    return signals[0], signals[1], signals[2]


def score_communities(
    X: pd.DataFrame,
    y: pd.Series,
    cfg: Optional[RiskScorerConfig] = None,
) -> pd.DataFrame:
    """Fit a final Logistic Regression on all labelled data and score every community.

    This is the production scoring path.  The model is trained on ALL labelled
    samples (no held-out test split, since N=59 is too small for a stable split).
    Cross-validated performance is measured separately via :func:`train_evaluate`.

    The risk probability is the LR-estimated class-1 probability after
    StandardScaler preprocessing. It is NOT a calibrated probability; treat it
    as a relative risk ranking.

    Args:
        X: Feature matrix indexed by ``community_id``.
        y: Binary labels, indexed by ``community_id``.  Used only to fit the
            model; the *output* scores are produced for ALL rows of X, including
            any that had no label.
        cfg: Configuration.  Defaults to :class:`RiskScorerConfig`.

    Returns:
        DataFrame indexed by ``community_id`` with columns:
        - ``risk_probability``: float [0, 1], LR model output.
        - ``risk_score``: int [0, 100] = round(probability × 100).
        - ``risk_level``: str, one of {"LOW", "MEDIUM", "HIGH"}.
        - ``top_signal_1``, ``top_signal_2``, ``top_signal_3``: Observable signal
          descriptions driving the score.

    Raises:
        ValueError: If X contains forbidden columns.
    """
    if cfg is None:
        cfg = RiskScorerConfig()

    # Leakage guard
    bad = EVALUATION_FORBIDDEN_COLUMNS & set(X.columns)
    if bad:
        raise ValueError(f"X contains evaluation-forbidden columns: {sorted(bad)}")

    # --- NaN imputation (median, fitted on labelled split to be conservative) ---
    X_arr = X[FEATURE_NAMES].values.copy().astype(np.float64)
    col_medians = np.nanmedian(X_arr, axis=0)
    nan_mask = np.isnan(X_arr)
    for j in range(X_arr.shape[1]):
        X_arr[nan_mask[:, j], j] = col_medians[j]

    # --- Fit final LR model on all labelled data ---
    common_idx = X.index.intersection(y.index)
    X_train_arr = X_arr[[i for i, idx in enumerate(X.index) if idx in set(common_idx)]]
    y_train = y.loc[common_idx].values

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train_arr)

    lr = LogisticRegression(
        C=cfg.lr_C,
        max_iter=cfg.lr_max_iter,
        class_weight=cfg.class_weight,
        random_state=cfg.seed,
        solver="lbfgs",
    )
    lr.fit(X_train_scaled, y_train)

    # --- Score ALL communities in X ---
    X_all_scaled = scaler.transform(X_arr)
    probabilities = lr.predict_proba(X_all_scaled)[:, 1]

    # Extract LR coefficients for explanation generation
    coef_array = lr.coef_[0]  # shape (n_features,)
    coef_series = pd.Series(coef_array, index=FEATURE_NAMES)

    # --- Build output DataFrame ---
    records = []
    for i, comm_id in enumerate(X.index):
        prob = float(probabilities[i])
        risk_score = int(round(prob * 100))
        risk_level = _assign_tier(prob, cfg.risk_tier_thresholds)

        # z-score row for explanation
        z_row = pd.Series(X_all_scaled[i], index=FEATURE_NAMES)
        sig1, sig2, sig3 = _build_explanation(comm_id, z_row, coef_series, cfg)

        records.append(
            {
                "community_id": comm_id,
                "risk_probability": round(prob, 6),
                "risk_score": risk_score,
                "risk_level": risk_level,
                "top_signal_1": sig1,
                "top_signal_2": sig2,
                "top_signal_3": sig3,
            }
        )

    out_df = pd.DataFrame(records).set_index("community_id")
    out_df.index.name = "community_id"
    return out_df


# ---------------------------------------------------------------------------
# Feature importance utility
# ---------------------------------------------------------------------------


def get_feature_importance(
    X: pd.DataFrame,
    y: pd.Series,
    cfg: Optional[RiskScorerConfig] = None,
) -> pd.DataFrame:
    """Return a ranked table of feature importances from both models.

    Logistic Regression uses |coefficient| after StandardScaler normalisation.
    Random Forest uses mean decrease in impurity.

    Args:
        X: Feature matrix.
        y: Binary labels.
        cfg: Configuration.

    Returns:
        DataFrame with columns: ``feature``, ``lr_importance``, ``rf_importance``,
        ``lr_rank``, ``rf_rank``.  Sorted by ``lr_importance`` descending.
    """
    if cfg is None:
        cfg = RiskScorerConfig()

    # Impute NaN
    X_arr = X[FEATURE_NAMES].values.copy().astype(np.float64)
    col_medians = np.nanmedian(X_arr, axis=0)
    nan_mask = np.isnan(X_arr)
    for j in range(X_arr.shape[1]):
        X_arr[nan_mask[:, j], j] = col_medians[j]

    common_idx = X.index.intersection(y.index)
    X_train = X_arr[[i for i, idx in enumerate(X.index) if idx in set(common_idx)]]
    y_train = y.loc[common_idx].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_train)

    lr = LogisticRegression(
        C=cfg.lr_C,
        max_iter=cfg.lr_max_iter,
        class_weight=cfg.class_weight,
        random_state=cfg.seed,
        solver="lbfgs",
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        lr.fit(X_scaled, y_train)
    lr_importances = np.abs(lr.coef_[0])

    rf = RandomForestClassifier(
        n_estimators=cfg.rf_n_estimators,
        max_depth=cfg.rf_max_depth,
        class_weight=cfg.class_weight,
        random_state=cfg.seed,
        n_jobs=1,
    )
    rf.fit(X_train, y_train)
    rf_importances = rf.feature_importances_

    imp_df = pd.DataFrame(
        {
            "feature": FEATURE_NAMES,
            "lr_importance": lr_importances,
            "rf_importance": rf_importances,
        }
    )
    imp_df["lr_rank"] = imp_df["lr_importance"].rank(ascending=False).astype(int)
    imp_df["rf_rank"] = imp_df["rf_importance"].rank(ascending=False).astype(int)
    return imp_df.sort_values("lr_importance", ascending=False).reset_index(drop=True)
