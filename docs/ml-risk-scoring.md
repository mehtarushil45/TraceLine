# ML Risk Scoring — TraceLine Community Baseline

**Status**: Baseline v1.0 · `seed=42` · sklearn 1.9.0

---

## Overview

This document describes the TraceLine ML risk-scoring baseline that assigns an
observable-evidence-based risk score to every detected Louvain community.  It
covers the feature contract, leakage safeguards, validation methodology,
metrics, limitations, and score interpretation.

> [!IMPORTANT]
> With only **59 community samples** (the natural output of Louvain at `resolution=1.0`
> on the 50 k-account graph), no ML metric reported here can be treated as a
> production-calibrated fraud-detection probability.  All scores are **ranked
> ordinal indicators** for investigator prioritisation.  Re-evaluate thresholds
> and retrain when community count exceeds ~200 labelled samples.

---

## Feature Contract

The model uses **exactly 21 observable features** from `community_features.csv`,
grouped into four families:

| # | Family | Features |
|---|--------|----------|
| F1 | **Graph structure** (4) | `member_count`, `density`, `mean_edge_weight`, `weight_per_member` |
| F2 | **Entity sharing** (6) | `unique_shared_instruments`, `unique_shared_devices`, `unique_shared_ips`, `unique_shared_merchants`, `instrument_sharing_ratio`, `device_sharing_ratio` |
| F3 | **Temporal concentration** (5) | `temporal_compression_score`, `unique_active_hours`, `median_inter_transaction_gap_hours`, `tx_per_member`, `temporal_overlap_mean` |
| F4 | **Transaction behavior** (6) | `mean_tx_amount`, `amount_cv`, `declined_rate`, `unique_payment_methods`, `merchant_category_entropy`, `total_transaction_amount` |

All features are derived solely from the observable payment-network graph and
enriched transaction records.  None depend on fraud labels, ring membership,
or any ground-truth data file.

---

## Leakage Safeguards

Three independent, overlapping mechanisms prevent label leakage:

### 1. Structural module isolation
`src/ml/risk_scorer.py` **never imports `src.evaluation`** or reads
`fraud_cases.csv`.  This is enforced at the source level (verified by T20 in
`tests/test_risk_scorer.py`).

### 2. Runtime column guard (`EVALUATION_FORBIDDEN_COLUMNS`)
`load_feature_matrix()` and `train_evaluate()` / `score_communities()` each
raise `ValueError` at runtime if `X` contains any of:

```
pattern_id  is_ring_member  link_type
is_positive  max_ring_coverage  primary_ring_id
num_rings_intersected  fraud_account_count  fraud_purity  label
```

### 3. Feature-engine validation guard (upstream)
`src/features/community_features.py` independently rejects any transaction
DataFrame containing `pattern_id`, `is_ring_member`, or `link_type`
(via `FORBIDDEN_COLUMNS` in `_validate_tx_df()`).

Ground-truth labels (`y`) **only enter the model as the `y` parameter** in
`train_evaluate()`.  They never touch the feature matrix `X`.

---

## Models Evaluated

| Model | Role | Preprocessing |
|-------|------|---------------|
| **Logistic Regression (L2)** | Primary, interpretable baseline | `StandardScaler` → `LogisticRegression(C=1.0, class_weight='balanced', solver='lbfgs')` |
| **Random Forest** | Non-linear comparison | `RandomForestClassifier(n_estimators=200, max_depth=6, class_weight='balanced')` |

`class_weight='balanced'` compensates for the 3.92:1 negative-to-positive class
imbalance (47 negative / 12 positive communities).

---

## Validation Methodology

### Why not a train/test split?

With N=59 samples a single 80/20 train-test split produces a test set of ≈12
communities — far too small for stable estimates (a single misclassification
swings accuracy by ~8%).

### RepeatedStratifiedKFold

We use **10 folds × 10 repeats = 100 cross-validation experiments**
(`RepeatedStratifiedKFold(n_splits=10, n_repeats=10, random_state=42)`).

- Each fold has ≈53 train / 6 test communities.
- Stratification ensures each fold preserves the 20.3% positive rate.
- 100 estimates allow stable mean ± std reporting.
- `StandardScaler` is fitted **inside each fold** on train data only
  (test fold never touches the scaler fit).

> [!NOTE]
> Mean ± std ROC-AUC across 100 folds is still affected by the small
> per-fold test size.  A std > 0.15 triggers a `stability_warning` flag.

---

## Metrics (Cross-Validation Estimates, 100 Folds)

*From the actual run on the 59-community full dataset (100 CV folds, seed=42).*

| Metric | Logistic Regression | Random Forest | Notes |
|--------|--------------------:|-------------:|-------|
| **ROC-AUC** | 0.6940 ± 0.2299 [!] | **0.8570** ± 0.1962 [!] | Wide std expected at N=59 |
| **Avg Precision** | 0.5387 ± 0.2605 | **0.7758** ± 0.2689 | Better-than-chance baseline: random = 0.203 |
| **F1 macro** | 0.2891 ± 0.3345 | **0.4633** ± 0.3846 | High std from tiny per-fold test sets |
| **Precision** | 0.2397 ± 0.3016 | **0.4233** ± 0.3861 | |
| **Recall** | 0.4200 ± 0.4699 | **0.5850** ± 0.4663 | |
| Stability warning | **YES** (std > 0.15) | **YES** (std > 0.15) | Both unstable; see Limitations |

> [!WARNING]
> Both models carry a **stability warning**: std of ROC-AUC exceeds 0.15 for
> both models.  This is expected given per-fold test sizes of ≈6 communities.
> The Random Forest achieves meaningfully higher mean AUC (0.857 vs 0.694) and
> higher average precision (0.776 vs 0.539), suggesting that non-linear
> interactions between shared-entity features and graph-structure features are
> present.  However, neither estimate is reliable enough to rank models
> definitively at this sample size.

### Top Feature Importances

| Rank | Feature | LR \|coef\| (standardised) | RF importance |
|------|---------|------------------------:|----------:|
| 1 | `weight_per_member` | **1.127** | 0.113 |
| 2 | `instrument_sharing_ratio` | **1.004** | 0.032 |
| 3 | `declined_rate` | 0.558 | 0.046 |
| 4 | `median_inter_transaction_gap_hours` | 0.542 | 0.083 |
| 5 | `unique_shared_instruments` | 0.534 | 0.040 |
| 6 | `temporal_compression_score` | 0.478 | 0.051 |
| 7 | `mean_edge_weight` | 0.439 | 0.063 |
| 8 | `density` | 0.432 | 0.044 |
| — | `unique_active_hours` | 0.000 | 0.000 |
| — | `unique_payment_methods` | 0.000 | 0.000 |

The top two LR signals — `weight_per_member` (evidence intensity per account)
and `instrument_sharing_ratio` (payment-instrument reuse density) — are the
most consistent discriminators.  `unique_active_hours` and
`unique_payment_methods` carry **zero LR weight** in this dataset (all
communities max out at 24 hours and 4 payment methods respectively, making
these features constant and uninformative).

---

## Risk Score Interpretation

### Formula
```
risk_probability = LR.predict_proba(X_standardised)[:, 1]  # float [0, 1]
risk_score       = round(risk_probability × 100)            # int  [0, 100]
```

### Risk Tiers

| Tier | Minimum Probability | Meaning |
|------|-------------------:|---------|
| **HIGH** | ≥ 0.60 | Strong observable signals; flag for priority investigator review |
| **MEDIUM** | ≥ 0.35 | Moderate signals; include in secondary review queue |
| **LOW** | < 0.35 | Weak signals; monitor passively |

> [!WARNING]
> These thresholds are **NOT calibrated probabilities**.  The LR output is a
> raw Platt-scaled score from a balanced-weighted model trained on 59 samples.
> It should be interpreted as a relative risk rank, not an empirical probability
> that a community is fraudulent.  Calibration (e.g. Platt scaling on a held-out
> set) requires far more data.

### Observable Signal Explanation

Each community in `community_risk_scores.csv` contains three `top_signal_*`
columns describing the observable features that most strongly drove the score
upward, based on the LR coefficient × standardised feature value (log-odds
contribution).  Signals are written without fraud-certainty language.

**Example (Community #40 — Risk Score 87, Level HIGH):**
```
Top observable signals:
- elevated shared-device count
- elevated shared payment-instrument count
- high payment-instrument sharing ratio
```

> [!NOTE]
> A HIGH risk tier does **not** assert that the community is fraudulent.  It
> means the community's observable network structure resembles those that
> historically co-occurred with fraud ring membership at ≥50% coverage under
> the θ=0.5 evaluation rule.

---

## Output Files

| File | Description |
|------|-------------|
| [`data/processed/payment_network/community_features.csv`](file:///c:/Users/mehta/OneDrive/Desktop/TraceLine/data/processed/payment_network/community_features.csv) | 59 × 21 observable feature matrix |
| [`data/processed/payment_network/community_labels.csv`](file:///c:/Users/mehta/OneDrive/Desktop/TraceLine/data/processed/payment_network/community_labels.csv) | Ground-truth binary labels (evaluation only) |
| [`data/processed/payment_network/community_risk_scores.csv`](file:///c:/Users/mehta/OneDrive/Desktop/TraceLine/data/processed/payment_network/community_risk_scores.csv) | Scored communities: risk_probability, risk_score, risk_level, top_signal_1–3 |

### `community_risk_scores.csv` Schema

| Column | Type | Description |
|--------|------|-------------|
| `community_id` | int | Louvain community identifier (index) |
| `risk_probability` | float | LR class-1 probability [0, 1] |
| `risk_score` | int | round(probability × 100) ∈ [0, 100] |
| `risk_level` | str | "LOW" / "MEDIUM" / "HIGH" |
| `top_signal_1` | str | Strongest observable signal driving the score |
| `top_signal_2` | str | Second strongest signal |
| `top_signal_3` | str | Third strongest signal |

> [!IMPORTANT]
> `community_risk_scores.csv` contains **NO ground-truth columns**.
> `is_positive`, `fraud_account_count`, `primary_ring_id`, etc. are deliberately
> absent.  This file is safe for the investigator dashboard.

---

## Source Modules

| File | Role |
|------|------|
| [`src/ml/__init__.py`](file:///c:/Users/mehta/OneDrive/Desktop/TraceLine/src/ml/__init__.py) | Package entry point |
| [`src/ml/risk_scorer.py`](file:///c:/Users/mehta/OneDrive/Desktop/TraceLine/src/ml/risk_scorer.py) | Core: loading, CV evaluation, scoring, explanations |
| [`tests/test_risk_scorer.py`](file:///c:/Users/mehta/OneDrive/Desktop/TraceLine/tests/test_risk_scorer.py) | 27 focused tests (T01–T23) |

---

## Deterministic Behaviour

All random state is controlled by `seed=42`:
- `RepeatedStratifiedKFold(random_state=42)`
- `LogisticRegression(random_state=42)`
- `RandomForestClassifier(random_state=42)`

Identical inputs produce **byte-identical** risk probabilities and scores
across Python process restarts.  Verified by T10 (CV determinism) and T15
(score determinism) in `tests/test_risk_scorer.py`.

---

## Limitations

1. **N=59 is very small**.  All metrics have wide confidence intervals.  The
   standard deviation of ROC-AUC across folds (expected ~0.15–0.25) represents
   genuine uncertainty, not model instability.
2. **Communities are not independent**.  Louvain communities share accounts
   with the same underlying graph; CV fold metrics are not strictly i.i.d.
3. **No probability calibration**.  LR probabilities are uncalibrated on
   balanced-weighted loss.  Do not use the raw probability as a fraud rate.
4. **Risk tiers are heuristic**.  HIGH/MEDIUM/LOW thresholds (0.60/0.35) were
   chosen conservatively for initial investigator triage.  They require
   empirical calibration from investigator feedback.
5. **Feature signal is weak at community level**.  The 21 features show modest
   discriminative power (Pos/Neg mean ratios of 1.4–1.7× for entity-sharing
   features).  Individual account-level features and temporal burst analysis
   could improve discrimination in future iterations.

---

## Recommended Next Step

**Investigator Dashboard (Frontend → API → UI)**

The `community_risk_scores.csv` is the data contract for the dashboard.  The
recommended next milestone is:

1. Create a FastAPI or Flask REST endpoint that serves `community_risk_scores.csv`
   rows filtered/sorted by `risk_level` and `risk_score`.
2. Build the investigator dashboard frontend that displays:
   - Community risk heatmap
   - Per-community signal cards showing top_signal_1/2/3
   - Account membership tables per community
3. Add investigator feedback (confirm / dismiss) loop to accumulate calibration
   data for the next model iteration.
