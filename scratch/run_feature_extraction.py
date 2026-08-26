import sys
import time
from pathlib import Path

# Ensure repository root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd

from src.data.enrichment import OBSERVABLE_COLUMNS
from src.detection.communities import detect_communities, extract_account_activity
from src.evaluation.labeler import (
    create_community_labels,
    get_binary_labels,
    load_fraud_rings,
)
from src.features.community_features import (
    FEATURE_GROUPS,
    FEATURE_NAMES,
    FORBIDDEN_COLUMNS,
    compute_community_features,
)
from src.graph.builder import build_evidence_graph
from src.graph.projection import project_account_graph


def main():
    print("=" * 70, flush=True)
    print("TRACELINE: COMMUNITY FEATURE EXTRACTION & LABELING (50k Dataset)", flush=True)
    print("=" * 70, flush=True)

    data_dir = Path("data")
    processed_dir = data_dir / "processed" / "payment_network"
    raw_dir = data_dir / "raw"

    # 1. Load Data
    t0 = time.perf_counter()
    print("\n[1/5] Loading processed observable transactions and merchant catalog...", flush=True)
    
    # Load observable columns only
    tx_df = pd.read_csv(processed_dir / "enriched_transactions.csv", usecols=OBSERVABLE_COLUMNS)
    print(f"Loaded {len(tx_df):,} observable transactions in {time.perf_counter()-t0:.2f}s", flush=True)
    
    # Check forbidden columns guard
    forbidden_present = FORBIDDEN_COLUMNS & set(tx_df.columns)
    assert not forbidden_present, f"FATAL: Forbidden columns in tx_df: {forbidden_present}"
    print("Verified tx_df has 0 forbidden columns (strictly observable)", flush=True)

    # Load merchant catalog
    merchant_path = processed_dir / "merchants.csv"
    if merchant_path.exists():
        merchant_df = pd.read_csv(merchant_path)
        print(f"Loaded {len(merchant_df):,} merchants from {merchant_path}", flush=True)
    else:
        merchant_df = None
        print("Merchant catalog not found, merchant_category_entropy will be NaN", flush=True)

    # Load fraud rings for ground-truth labeling only
    fraud_cases_path = raw_dir / "fraud" / "fraud_cases.csv"
    fraud_rings = load_fraud_rings(fraud_cases_path)
    print(f"Loaded {len(fraud_rings)} ground-truth fraud rings for evaluation labeling", flush=True)

    # 2. Build EvidenceGraph & Project AccountGraph
    print("\n[2/5] Building EvidenceGraph and projecting AccountGraph...", flush=True)
    t_graph = time.perf_counter()
    eg = build_evidence_graph(processed_dir)
    print(f"EvidenceGraph built: {eg.node_count():,} nodes, {eg.edge_count():,} edges in {time.perf_counter()-t_graph:.2f}s", flush=True)

    t_proj = time.perf_counter()
    ag = project_account_graph(eg)
    print(f"AccountGraph projected: {len(ag.nodes):,} nodes, {len(ag.edges):,} edges in {time.perf_counter()-t_proj:.2f}s", flush=True)

    # 3. Community Detection
    print("\n[3/5] Extracting account activity and running Louvain community detection (seed=42, resolution=1.0)...", flush=True)
    t_act = time.perf_counter()
    account_activity = extract_account_activity(eg)
    print(f"Extracted account activity for {len(account_activity):,} active accounts in {time.perf_counter()-t_act:.2f}s", flush=True)

    t_louv = time.perf_counter()
    communities = detect_communities(ag, seed=42, resolution=1.0, account_activity=account_activity)
    print(f"Detected {len(communities)} communities in {time.perf_counter()-t_louv:.2f}s", flush=True)

    # 4. Feature Extraction (Observable Only)
    print("\n[4/5] Computing community features (21 features across 4 groups)...", flush=True)
    t_feat = time.perf_counter()
    features_df = compute_community_features(communities, tx_df, merchant_df=merchant_df)
    feat_time = time.perf_counter() - t_feat
    print(f"Computed feature matrix for {len(features_df)} communities in {feat_time:.2f}s", flush=True)

    # 5. Labeling (Ground Truth theta=0.5)
    print("\n[5/5] Generating ground-truth labels under theta=0.5...", flush=True)
    t_lab = time.perf_counter()
    labels_df = create_community_labels(communities, fraud_rings, theta=0.5)
    y = get_binary_labels(communities, fraud_rings, theta=0.5)
    print(f"Generated labels in {time.perf_counter()-t_lab:.2f}s", flush=True)

    # Save artifact files
    feat_out_path = processed_dir / "community_features.csv"
    features_df.to_csv(feat_out_path)
    print(f"Saved feature matrix -> {feat_out_path}", flush=True)

    lab_out_path = processed_dir / "community_labels.csv"
    labels_df.to_csv(lab_out_path)
    print(f"Saved ground-truth labels -> {lab_out_path}", flush=True)

    # Verification & Quality Checks
    print("\n" + "=" * 70, flush=True)
    print("RESULTS & QUALITY AUDIT", flush=True)
    print("=" * 70, flush=True)

    print("\n1. FEATURE MATRIX SUMMARY:")
    print(f"   Shape: {features_df.shape[0]} communities x {features_df.shape[1]} features")
    print(f"   Feature Names ({len(FEATURE_NAMES)}):")
    for grp, feats in FEATURE_GROUPS.items():
        print(f"     * {grp} ({len(feats)}): {', '.join(feats)}")

    print("\n2. MISSING VALUES AUDIT:")
    nan_counts = features_df.isna().sum()
    if nan_counts.sum() == 0:
        print("   0 NaNs across all 21 features!")
    else:
        for col, cnt in nan_counts[nan_counts > 0].items():
            pct = (cnt / len(features_df)) * 100
            print(f"   - {col}: {cnt} NaNs ({pct:.1f}%)")

    print("\n3. LABEL DISTRIBUTION (theta=0.5):")
    pos_count = int((y == 1).sum())
    neg_count = int((y == 0).sum())
    total_count = len(y)
    pos_pct = (pos_count / total_count) * 100
    neg_pct = (neg_count / total_count) * 100
    imbalance_ratio = neg_count / pos_count if pos_count > 0 else float("inf")

    print(f"   Total Communities: {total_count}")
    print(f"   Positive (Fraud Ring >= 50% captured): {pos_count} ({pos_pct:.2f}%)")
    print(f"   Negative (Clean / Background):          {neg_count} ({neg_pct:.2f}%)")
    print(f"   Class Imbalance Ratio (Neg : Pos):      {imbalance_ratio:.2f} : 1")

    print("\n4. GROUND-TRUTH RING ATTRIBUTION DETAILS (Positive Communities):")
    pos_df = labels_df[labels_df["is_positive"] == 1]
    print(f"   {'Community':<10} {'Primary Ring':<15} {'Max Coverage':<14} {'Fraud Accts':<12} {'Fraud Purity':<12} {'Member Count':<12}")
    print(f"   {'-'*10} {'-'*15} {'-'*14} {'-'*12} {'-'*12} {'-'*12}")
    for cid, row in pos_df.iterrows():
        c_obj = next(c for c in communities if c.community_id == cid)
        print(f"   {cid:<10} {row['primary_ring_id']!s:<15} {row['max_ring_coverage']:<14.4f} {row['fraud_account_count']:<12} {row['fraud_purity']*100:<11.2f}% {c_obj.member_count:<12}")

    print("\n5. FEATURE CONTRAST: POSITIVE VS NEGATIVE COMMUNITIES (Means):")
    merged = features_df.copy()
    merged["label"] = y
    pos_means = merged[merged["label"] == 1].mean()
    neg_means = merged[merged["label"] == 0].mean()

    print(f"   {'Feature':<35} {'Positive Mean':<18} {'Negative Mean':<18} {'Ratio (Pos/Neg)':<15}")
    print(f"   {'-'*35} {'-'*18} {'-'*18} {'-'*15}")
    for col in FEATURE_NAMES:
        pm = pos_means[col]
        nm = neg_means[col]
        ratio = (pm / nm) if nm != 0 and not np.isnan(nm) and not np.isnan(pm) else np.nan
        print(f"   {col:<35} {pm:<18.4f} {nm:<18.4f} {ratio:<15.2f}")

    print("\n" + "=" * 70, flush=True)
    print("COMPLETE: Feature extraction and labeling pipeline validated successfully.", flush=True)
    print("=" * 70, flush=True)

if __name__ == "__main__":
    main()
