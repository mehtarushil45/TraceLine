"""Tests for TraceLine's ML risk-scoring module (src/ml/risk_scorer.py).

Test coverage:
  T01 – load_feature_matrix: correct index, columns, dtype.
  T02 – load_feature_matrix: raises on missing file.
  T03 – load_feature_matrix: raises on forbidden column in CSV.
  T04 – load_labels: correct dtype, name, index.
  T05 – load_labels: raises on missing file.
  T06 – load_labels: raises when 'is_positive' column is absent.
  T07 – train_evaluate: returns EvaluationResult for both models.
  T08 – train_evaluate: raises on forbidden column in X.
  T09 – train_evaluate: ROC-AUC in [0, 1] for both models.
  T10 – train_evaluate: deterministic across repeated calls (seed=42).
  T11 – score_communities: output schema (index, columns, dtypes).
  T12 – score_communities: risk_score in [0, 100].
  T13 – score_communities: risk_level is one of {LOW, MEDIUM, HIGH}.
  T14 – score_communities: raises on forbidden column in X.
  T15 – score_communities: deterministic (identical output on repeated calls).
  T16 – score_communities: top_signal_* columns are non-empty strings for positive communities.
  T17 – score_communities: no ground-truth columns in output.
  T18 – get_feature_importance: returns correct schema.
  T19 – load_feature_matrix: handles NaN values in features gracefully.
  T20 – leakage isolation: risk_scorer.py never imports src.evaluation.
  T21 – risk_tier_thresholds: HIGH >= MEDIUM >= LOW monotonicity.
  T22 – score_communities: scores increase monotonically with probability.
  T23 – train_evaluate: handles minimum 2-class degenerate CV without crashing.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.features.community_features import FEATURE_NAMES
from src.ml.risk_scorer import (
    EVALUATION_FORBIDDEN_COLUMNS,
    RISK_TIER_THRESHOLDS,
    EvaluationResult,
    RiskScorerConfig,
    get_feature_importance,
    load_feature_matrix,
    load_labels,
    score_communities,
    train_evaluate,
)

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_N_COMMUNITIES = 20  # enough for stratified CV with 10 folds


@pytest.fixture(scope="module")
def cfg() -> RiskScorerConfig:
    """Fast config for unit tests: fewer repeats to keep suite under 30 s."""
    return RiskScorerConfig(
        seed=42,
        n_splits=5,
        n_repeats=3,
        rf_n_estimators=50,
    )


def _make_X(n: int = _N_COMMUNITIES, seed: int = 42) -> pd.DataFrame:
    """Create a synthetic observable feature matrix with community_id index."""
    rng = np.random.RandomState(seed)
    data = rng.randn(n, len(FEATURE_NAMES))
    df = pd.DataFrame(data, columns=FEATURE_NAMES)
    df.index = pd.RangeIndex(n)
    df.index.name = "community_id"
    return df.astype(np.float64)


def _make_y(n: int = _N_COMMUNITIES, n_positive: int = 5, seed: int = 42) -> pd.Series:
    """Create binary labels (5 positives out of n communities)."""
    rng = np.random.RandomState(seed)
    labels = np.zeros(n, dtype=np.int64)
    pos_idx = rng.choice(n, size=n_positive, replace=False)
    labels[pos_idx] = 1
    s = pd.Series(labels, name="label")
    s.index = pd.RangeIndex(n)
    s.index.name = "community_id"
    return s


@pytest.fixture(scope="module")
def X() -> pd.DataFrame:
    return _make_X()


@pytest.fixture(scope="module")
def y() -> pd.Series:
    return _make_y()


# ---------------------------------------------------------------------------
# CSV fixtures (written to tmp_path per test when needed)
# ---------------------------------------------------------------------------


def _write_feature_csv(path: Path, n: int = _N_COMMUNITIES) -> None:
    """Write a valid feature CSV to path."""
    df = _make_X(n)
    df.to_csv(path)


def _write_labels_csv(path: Path, n: int = _N_COMMUNITIES) -> None:
    """Write a valid labels CSV to path."""
    y_df = pd.DataFrame({"is_positive": _make_y(n).values}, index=_make_X(n).index)
    y_df.index.name = "community_id"
    y_df.to_csv(path)


# ---------------------------------------------------------------------------
# T01 – load_feature_matrix: correct index, columns, dtype
# ---------------------------------------------------------------------------


def test_t01_load_feature_matrix_schema(tmp_path: Path) -> None:
    """load_feature_matrix returns correct index, columns, and float64 dtype."""
    feat_path = tmp_path / "community_features.csv"
    _write_feature_csv(feat_path)

    df = load_feature_matrix(feat_path)

    assert df.index.name == "community_id"
    assert list(df.columns) == FEATURE_NAMES
    assert len(df) == _N_COMMUNITIES
    for col in FEATURE_NAMES:
        assert df[col].dtype == np.float64, f"{col} should be float64"


# ---------------------------------------------------------------------------
# T02 – load_feature_matrix: raises on missing file
# ---------------------------------------------------------------------------


def test_t02_load_feature_matrix_missing_file(tmp_path: Path) -> None:
    """load_feature_matrix raises FileNotFoundError when file is absent."""
    with pytest.raises(FileNotFoundError):
        load_feature_matrix(tmp_path / "nonexistent.csv")


# ---------------------------------------------------------------------------
# T03 – load_feature_matrix: raises on forbidden column
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("forbidden_col", sorted(EVALUATION_FORBIDDEN_COLUMNS)[:5])
def test_t03_load_feature_matrix_forbidden_column(
    tmp_path: Path, forbidden_col: str
) -> None:
    """load_feature_matrix raises ValueError when a forbidden column is in the CSV."""
    df = _make_X()
    df[forbidden_col] = 0  # inject forbidden column
    path = tmp_path / f"feat_{forbidden_col}.csv"
    df.to_csv(path)

    with pytest.raises(ValueError, match="evaluation-forbidden"):
        load_feature_matrix(path)


# ---------------------------------------------------------------------------
# T04 – load_labels: correct dtype, name, index
# ---------------------------------------------------------------------------


def test_t04_load_labels_schema(tmp_path: Path) -> None:
    """load_labels returns a binary int64 Series named 'label'."""
    lab_path = tmp_path / "community_labels.csv"
    _write_labels_csv(lab_path)

    s = load_labels(lab_path)

    assert isinstance(s, pd.Series)
    assert s.name == "label"
    assert s.dtype == np.int64
    assert s.index.name == "community_id"
    assert set(s.unique()).issubset({0, 1})


# ---------------------------------------------------------------------------
# T05 – load_labels: raises on missing file
# ---------------------------------------------------------------------------


def test_t05_load_labels_missing_file(tmp_path: Path) -> None:
    """load_labels raises FileNotFoundError when file is absent."""
    with pytest.raises(FileNotFoundError):
        load_labels(tmp_path / "no_labels.csv")


# ---------------------------------------------------------------------------
# T06 – load_labels: raises when 'is_positive' column absent
# ---------------------------------------------------------------------------


def test_t06_load_labels_missing_is_positive(tmp_path: Path) -> None:
    """load_labels raises ValueError when 'is_positive' column is absent."""
    df = pd.DataFrame({"wrong_col": [0, 1, 0]})
    df.index.name = "community_id"
    path = tmp_path / "bad_labels.csv"
    df.to_csv(path)

    with pytest.raises(ValueError, match="is_positive"):
        load_labels(path)


# ---------------------------------------------------------------------------
# T07 – train_evaluate: returns EvaluationResult for both models
# ---------------------------------------------------------------------------


def test_t07_train_evaluate_returns_results(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """train_evaluate returns a dict with LR and RF EvaluationResult objects."""
    results = train_evaluate(X, y, cfg)

    assert "LogisticRegression" in results
    assert "RandomForest" in results
    for name, res in results.items():
        assert isinstance(res, EvaluationResult), f"{name} should be EvaluationResult"
        assert res.n_samples == _N_COMMUNITIES
        assert res.n_positive == 5


# ---------------------------------------------------------------------------
# T08 – train_evaluate: raises on forbidden column in X
# ---------------------------------------------------------------------------


def test_t08_train_evaluate_forbidden_column(y: pd.Series, cfg: RiskScorerConfig) -> None:
    """train_evaluate raises ValueError when X contains a forbidden column."""
    bad_X = _make_X()
    bad_X["is_positive"] = 0  # inject evaluation label as feature

    with pytest.raises(ValueError, match="evaluation-forbidden"):
        train_evaluate(bad_X, y, cfg)


# ---------------------------------------------------------------------------
# T09 – train_evaluate: ROC-AUC in [0, 1]
# ---------------------------------------------------------------------------


def test_t09_train_evaluate_roc_auc_range(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """Cross-validated ROC-AUC is in [0, 1] for both models."""
    results = train_evaluate(X, y, cfg)
    for name, res in results.items():
        assert 0.0 <= res.mean_roc_auc <= 1.0, f"{name} ROC-AUC out of range: {res.mean_roc_auc}"
        assert 0.0 <= res.std_roc_auc, f"{name} ROC-AUC std should be non-negative"


# ---------------------------------------------------------------------------
# T10 – train_evaluate: deterministic across repeated calls
# ---------------------------------------------------------------------------


def test_t10_train_evaluate_deterministic(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """train_evaluate returns identical metrics on repeated calls with same seed."""
    r1 = train_evaluate(X, y, cfg)
    r2 = train_evaluate(X, y, cfg)

    assert r1["LogisticRegression"].mean_roc_auc == pytest.approx(
        r2["LogisticRegression"].mean_roc_auc, abs=1e-10
    ), "LR ROC-AUC must be deterministic"
    assert r1["RandomForest"].mean_roc_auc == pytest.approx(
        r2["RandomForest"].mean_roc_auc, abs=1e-10
    ), "RF ROC-AUC must be deterministic"


# ---------------------------------------------------------------------------
# T11 – score_communities: output schema
# ---------------------------------------------------------------------------


def test_t11_score_communities_schema(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """score_communities output has correct index, columns, and dtypes."""
    scores = score_communities(X, y, cfg)

    assert scores.index.name == "community_id"
    required_cols = {
        "risk_probability",
        "risk_score",
        "risk_level",
        "top_signal_1",
        "top_signal_2",
        "top_signal_3",
    }
    assert required_cols.issubset(set(scores.columns)), (
        f"Missing columns: {required_cols - set(scores.columns)}"
    )
    assert len(scores) == len(X)
    assert scores["risk_probability"].dtype == np.float64 or scores["risk_probability"].dtype == float
    assert scores["risk_score"].dtype in (np.int64, np.int32, int, object) or scores["risk_score"].between(0, 100).all()


# ---------------------------------------------------------------------------
# T12 – score_communities: risk_score in [0, 100]
# ---------------------------------------------------------------------------


def test_t12_risk_score_range(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """Every risk_score value is an integer in [0, 100]."""
    scores = score_communities(X, y, cfg)
    assert (scores["risk_score"] >= 0).all(), "risk_score must be >= 0"
    assert (scores["risk_score"] <= 100).all(), "risk_score must be <= 100"


# ---------------------------------------------------------------------------
# T13 – score_communities: valid risk tiers
# ---------------------------------------------------------------------------


def test_t13_valid_risk_tiers(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """Every risk_level is one of {LOW, MEDIUM, HIGH}."""
    scores = score_communities(X, y, cfg)
    valid = {"LOW", "MEDIUM", "HIGH"}
    invalid = set(scores["risk_level"].unique()) - valid
    assert not invalid, f"Invalid risk tiers found: {invalid}"


# ---------------------------------------------------------------------------
# T14 – score_communities: raises on forbidden column
# ---------------------------------------------------------------------------


def test_t14_score_communities_forbidden_column(y: pd.Series, cfg: RiskScorerConfig) -> None:
    """score_communities raises ValueError when X contains a forbidden column."""
    bad_X = _make_X()
    bad_X["fraud_purity"] = 0.5

    with pytest.raises(ValueError, match="evaluation-forbidden"):
        score_communities(bad_X, y, cfg)


# ---------------------------------------------------------------------------
# T15 – score_communities: deterministic
# ---------------------------------------------------------------------------


def test_t15_score_communities_deterministic(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """score_communities produces byte-identical outputs on repeated calls."""
    s1 = score_communities(X, y, cfg)
    s2 = score_communities(X, y, cfg)

    pd.testing.assert_frame_equal(s1, s2, check_exact=False, rtol=1e-10)


# ---------------------------------------------------------------------------
# T16 – score_communities: top_signal_* non-empty for positive communities
# ---------------------------------------------------------------------------


def test_t16_signals_non_empty(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """top_signal_1 is a non-empty string for every community in the output."""
    scores = score_communities(X, y, cfg)
    # At minimum, every row should have a non-empty top_signal_1
    assert (scores["top_signal_1"].str.len() > 0).all(), (
        "top_signal_1 must be non-empty for all communities"
    )


# ---------------------------------------------------------------------------
# T17 – score_communities: no ground-truth columns in output
# ---------------------------------------------------------------------------


def test_t17_no_ground_truth_in_output(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """score_communities output never contains evaluation-derived columns."""
    scores = score_communities(X, y, cfg)
    gt_cols = {
        "is_positive", "max_ring_coverage", "primary_ring_id",
        "num_rings_intersected", "fraud_account_count", "fraud_purity",
        "pattern_id", "is_ring_member", "link_type", "label",
    }
    leaked = gt_cols & set(scores.columns)
    assert not leaked, f"Ground-truth columns found in score output: {leaked}"


# ---------------------------------------------------------------------------
# T18 – get_feature_importance: schema
# ---------------------------------------------------------------------------


def test_t18_feature_importance_schema(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """get_feature_importance returns a DataFrame with expected columns."""
    imp = get_feature_importance(X, y, cfg)

    assert list(imp.columns) == ["feature", "lr_importance", "rf_importance", "lr_rank", "rf_rank"]
    assert len(imp) == len(FEATURE_NAMES)
    assert set(imp["feature"]) == set(FEATURE_NAMES)
    assert (imp["lr_importance"] >= 0).all()
    assert (imp["rf_importance"] >= 0).all()


# ---------------------------------------------------------------------------
# T19 – NaN handling: feature matrix with NaN values
# ---------------------------------------------------------------------------


def test_t19_nan_imputation(y: pd.Series, cfg: RiskScorerConfig) -> None:
    """score_communities handles NaN values in X without errors."""
    X_with_nan = _make_X()
    # Inject NaN into a few cells
    X_with_nan.iloc[0, 0] = np.nan
    X_with_nan.iloc[3, 5] = np.nan
    X_with_nan.iloc[7, 10] = np.nan

    scores = score_communities(X_with_nan, y, cfg)
    # Should complete without error and produce valid scores
    assert len(scores) == _N_COMMUNITIES
    assert not scores["risk_probability"].isna().any(), (
        "NaN should be imputed; risk_probability must be fully defined"
    )


# ---------------------------------------------------------------------------
# T20 – Leakage isolation: risk_scorer.py never imports src.evaluation
# ---------------------------------------------------------------------------


def test_t20_no_evaluation_import() -> None:
    """risk_scorer.py source code never imports src.evaluation."""
    source_path = Path("src/ml/risk_scorer.py")
    source = source_path.read_text(encoding="utf-8")

    # Check for actual import statements (not docstring references)
    import_lines = [ln.strip() for ln in source.splitlines() if ln.strip().startswith(("import ", "from "))]
    for line in import_lines:
        assert "src.evaluation" not in line, (
            f"risk_scorer.py must NEVER import src.evaluation (leakage isolation). Found: {line!r}"
        )

    assert "fraud_cases" not in source.lower() or "fraud_cases" not in "".join(
        ln for ln in source.splitlines() if not ln.strip().startswith("#") and '"""' not in ln and "'''" not in ln
    ), (
        "risk_scorer.py must never reference fraud_cases data in executable code"
    )
    assert "is_ring_member" not in source, (
        "risk_scorer.py must never access is_ring_member"
    )


# ---------------------------------------------------------------------------
# T21 – Risk tier threshold monotonicity
# ---------------------------------------------------------------------------


def test_t21_risk_tier_thresholds_monotonic() -> None:
    """HIGH >= MEDIUM >= LOW thresholds and all in [0, 1]."""
    thresholds = RISK_TIER_THRESHOLDS
    assert 0.0 <= thresholds["LOW"] <= 1.0
    assert thresholds["LOW"] <= thresholds["MEDIUM"] <= thresholds["HIGH"] <= 1.0


# ---------------------------------------------------------------------------
# T22 – risk_score monotonically reflects risk_probability
# ---------------------------------------------------------------------------


def test_t22_risk_score_reflects_probability(X: pd.DataFrame, y: pd.Series, cfg: RiskScorerConfig) -> None:
    """risk_score = round(risk_probability * 100) for all communities."""
    scores = score_communities(X, y, cfg)
    expected = (scores["risk_probability"] * 100).round().astype(int)
    pd.testing.assert_series_equal(
        scores["risk_score"].astype(int),
        expected,
        check_names=False,
        rtol=0,
    )


# ---------------------------------------------------------------------------
# T23 – Minimal 2-class data doesn't crash train_evaluate
# ---------------------------------------------------------------------------


def test_t23_minimal_two_class_data(cfg: RiskScorerConfig) -> None:
    """train_evaluate doesn't crash with minimal 2-class data (n=12, n_pos=2)."""
    # 12 communities, 2 positive – smallest realistic case
    X_small = _make_X(n=12, seed=99)
    y_small = _make_y(n=12, n_positive=2, seed=99)

    # Use minimal CV to avoid single-class folds
    small_cfg = RiskScorerConfig(seed=42, n_splits=2, n_repeats=2, rf_n_estimators=20)
    results = train_evaluate(X_small, y_small, small_cfg)

    for name, res in results.items():
        assert isinstance(res, EvaluationResult), f"{name} should be EvaluationResult"
        assert 0.0 <= res.mean_roc_auc <= 1.0
