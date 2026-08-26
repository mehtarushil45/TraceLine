"""Run full ML risk scoring on the 59-community 50k dataset and produce output files."""
import sys
import time
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


from src.ml.risk_scorer import (
    RiskScorerConfig,
    get_feature_importance,
    load_feature_matrix,
    load_labels,
    score_communities,
    train_evaluate,
)

PROCESSED_DIR = Path("data/processed/payment_network")

def main():
    print("=" * 70)
    print("TRACELINE: ML RISK SCORING ON 59 COMMUNITIES (50k Dataset)")
    print("=" * 70)

    # --- Load pre-computed features and labels ---
    feat_path = PROCESSED_DIR / "community_features.csv"
    lab_path  = PROCESSED_DIR / "community_labels.csv"

    print(f"\nLoading feature matrix from {feat_path}...")
    X = load_feature_matrix(feat_path)
    print(f"  X shape: {X.shape} (communities × features)")

    print(f"Loading labels from {lab_path}...")
    y = load_labels(lab_path)
    print(f"  y shape: {y.shape}, positives={int(y.sum())}, negatives={int((y==0).sum())}")

    cfg = RiskScorerConfig(
        seed=42,
        n_splits=10,
        n_repeats=10,
        rf_n_estimators=200,
        rf_max_depth=6,
        class_weight="balanced",
    )

    # --- Cross-validation evaluation ---
    print("\n" + "=" * 70)
    print("CROSS-VALIDATION EVALUATION")
    print("(RepeatedStratifiedKFold: 10 folds × 10 repeats = 100 mini-experiments)")
    print("=" * 70)

    t0 = time.perf_counter()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        results = train_evaluate(X, y, cfg)
    cv_time = time.perf_counter() - t0
    print(f"CV completed in {cv_time:.1f}s")

    for name, res in results.items():
        warn = " [!] UNSTABLE (std>0.15)" if res.stability_warning else ""
        print(f"\n  Model: {name}{warn}")
        print(f"    ROC-AUC:           {res.mean_roc_auc:.4f} ± {res.std_roc_auc:.4f}")
        print(f"    Average Precision: {res.mean_average_precision:.4f} ± {res.std_average_precision:.4f}")
        print(f"    F1 (macro):        {res.mean_f1:.4f} ± {res.std_f1:.4f}")
        print(f"    Precision:         {res.mean_precision:.4f} ± {res.std_precision:.4f}")
        print(f"    Recall:            {res.mean_recall:.4f} ± {res.std_recall:.4f}")
        print(f"    N folds:           {res.n_folds}  (N={res.n_samples}, pos={res.n_positive})")

    # --- Feature importance ---
    print("\n" + "=" * 70)
    print("FEATURE IMPORTANCE (LR |coefficient| after StandardScaler)")
    print("=" * 70)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        imp = get_feature_importance(X, y, cfg)
    print(f"\n  {'Feature':<35} {'LR |coef|':>10}  LR# {'RF score':>10}  RF#")
    print(f"  {'-'*35} {'-'*10}  {'--':>3} {'-'*10}  {'--':>3}")
    for _, row in imp.iterrows():
        print(f"  {row['feature']:<35} {row['lr_importance']:>10.4f}  {row['lr_rank']:>3} {row['rf_importance']:>10.4f}  {row['rf_rank']:>3}")

    # --- Final scoring ---
    print("\n" + "=" * 70)
    print("FINAL RISK SCORES (LR fitted on all 59 communities)")
    print("=" * 70)
    t1 = time.perf_counter()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        scores = score_communities(X, y, cfg)
    print(f"Scored {len(scores)} communities in {time.perf_counter()-t1:.2f}s")

    # Save output
    out_path = PROCESSED_DIR / "community_risk_scores.csv"
    scores.to_csv(out_path)
    print(f"\nSaved risk scores -> {out_path}")

    # Display all scores sorted by risk_score descending
    print("\nAll 59 communities sorted by risk score:")
    print(f"\n  {'CID':>5}  {'Score':>5}  {'Level':<8}  {'Prob':>6}  Signal 1")
    print(f"  {'---':>5}  {'-----':>5}  {'-------':<8}  {'------':>6}  --------")
    for cid, row in scores.sort_values("risk_score", ascending=False).iterrows():
        print(f"  {cid:>5}  {row['risk_score']:>5}  {row['risk_level']:<8}  {row['risk_probability']:>6.4f}  {row['top_signal_1']}")

    # Tier summary
    tier_counts = scores["risk_level"].value_counts()
    print("\nRisk tier distribution:")
    for tier in ["HIGH", "MEDIUM", "LOW"]:
        n = tier_counts.get(tier, 0)
        pct = n / len(scores) * 100
        print(f"  {tier:<8}: {n:>2} communities ({pct:.1f}%)")

    print("\n" + "=" * 70)
    print("COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    main()
