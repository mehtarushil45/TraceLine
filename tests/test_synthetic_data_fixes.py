"""Tests for the three synthetic-data fixes applied to TraceLine.

Covers all 13 testing requirements from the implementation spec:

 1.  Legitimate amount generation is deterministic (same seed -> same values).
 2.  Legitimate amounts are no longer restricted to [Rs10, Rs500].
 3.  Legitimate and fraud amounts overlap.
 4.  Transaction status is NOT deterministically derived from a fraud-sized amount.
 5.  Legitimate timestamps are not constant.
 6.  Fraud ring timestamps are not constant.
 7.  Transactions within a ring have compressed but non-identical timestamps.
 8.  Different fraud rings can have different burst windows.
 9.  Decoy timestamps are not constant.
10.  Timestamps are deterministic with the same seed.
11.  IP pool / sharing density is reduced.
12.  Existing label-leakage guarantees remain intact.
13.  All existing TraceLine tests still pass (run full suite separately).
"""

from __future__ import annotations

import datetime
import random
import statistics
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Path setup -- make gen_fraud_graph importable if not installed as a package.
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parents[1]
_GFG_SRC = _REPO_ROOT / "gen-fraud-graph" / "src"
if str(_GFG_SRC) not in sys.path:
    sys.path.insert(0, str(_GFG_SRC))

from gen_fraud_graph.generator import (
    _LEGIT_AMOUNT_MAX,
    _LEGIT_AMOUNT_MIN,
    _LEGIT_AMOUNT_MU,
    _LEGIT_AMOUNT_SIGMA,
    _TX_WINDOW_DAYS,
    _legit_amount,
    _legit_timestamp,
)
from gen_fraud_graph.typologies import (
    _TS_WINDOW_DAYS,
    _decoy_burst_timestamps,
    _ring_burst_timestamps,
)

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_N_SAMPLES = 10_000
_FRAUD_SENTINEL = 9_999.0
_FRAUD_JITTER_HIGH = 0.5
_FRAUD_LOW = _FRAUD_SENTINEL * (1.0 - _FRAUD_JITTER_HIGH)
_FRAUD_HIGH = _FRAUD_SENTINEL * (1.0 + _FRAUD_JITTER_HIGH)


def _sample_legit_amounts(n: int = _N_SAMPLES, seed: int = 42) -> list:
    random.seed(seed)
    return [_legit_amount() for _ in range(n)]


def _sample_legit_timestamps(n: int = 500, seed: int = 42) -> list:
    random.seed(seed)
    return [_legit_timestamp() for _ in range(n)]


def _fraud_amounts_at_high_hardness(n: int = 500) -> list:
    rng = random.Random(99)
    return [round(rng.uniform(_FRAUD_LOW, _FRAUD_HIGH), 2) for _ in range(n)]


# ===========================================================================
# 1. Deterministic
# ===========================================================================


def test_legit_amount_deterministic() -> None:
    s1 = _sample_legit_amounts(seed=42)
    s2 = _sample_legit_amounts(seed=42)
    assert s1 == s2
    s3 = _sample_legit_amounts(seed=99)
    assert s1 != s3


# ===========================================================================
# 2. Legit amounts exceed old ceiling
# ===========================================================================


def test_legit_amount_range_exceeds_old_ceiling() -> None:
    amounts = _sample_legit_amounts()
    above_500 = sum(1 for a in amounts if a > 500.0) / len(amounts)
    assert above_500 >= 0.05, f"Only {above_500:.1%} above Rs500"


def test_legit_amount_min_preserved() -> None:
    amounts = _sample_legit_amounts()
    assert all(a >= _LEGIT_AMOUNT_MIN for a in amounts)


def test_legit_amount_max_clipped() -> None:
    amounts = _sample_legit_amounts()
    assert all(a <= _LEGIT_AMOUNT_MAX for a in amounts)


def test_legit_amount_median_reasonable() -> None:
    amounts = _sample_legit_amounts()
    med = statistics.median(amounts)
    assert 120.0 <= med <= 480.0, f"Median {med:.0f} far from expected ~Rs300"


def test_legit_amount_p95_reasonable() -> None:
    amounts = _sample_legit_amounts()
    p95 = float(np.percentile(amounts, 95))
    assert 2_000.0 <= p95 <= 8_000.0, f"p95={p95:.0f} outside expected band"


# ===========================================================================
# 3. Overlap
# ===========================================================================


def test_legit_fraud_amount_overlap() -> None:
    amounts = _sample_legit_amounts(n=_N_SAMPLES)
    overlap = sum(1 for a in amounts if _FRAUD_LOW <= a <= _FRAUD_HIGH) / len(amounts)
    assert overlap >= 0.005, f"Only {overlap:.2%} overlap with fraud range"


def test_fraud_amount_does_not_fully_separate() -> None:
    legit = _sample_legit_amounts(n=_N_SAMPLES)
    fraud = _fraud_amounts_at_high_hardness(n=500)
    best_f1 = 0.0
    for threshold in [3_000, 5_000, 7_000, 9_000, 12_000]:
        tp = sum(1 for a in fraud if a >= threshold)
        fp = sum(1 for a in legit if a >= threshold)
        fn = sum(1 for a in fraud if a < threshold)
        p = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        r = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * p * r / (p + r) if (p + r) > 0 else 0.0
        best_f1 = max(best_f1, f1)
    assert best_f1 < 1.0, f"Best threshold F1={best_f1:.4f} -- no overlap"


# ===========================================================================
# 4. Status not a hard-threshold fraud oracle
# ===========================================================================


def test_status_not_hard_threshold_fraud_oracle() -> None:
    from src.data.enrichment import enrich_chunk, EnrichmentContext
    from src.data.entities import generate_world

    accounts_df = pd.DataFrame(
        [{"account_id": f"acc_{i}", "customer_name": f"C{i}",
          "balance": 5000.0, "risk_score": 0.1, "creation_date": "2023-01-01"}
         for i in range(10)]
    )
    cases_df = pd.DataFrame(
        columns=["pattern_id", "start_acc_id", "pattern_type", "depth", "involved_accounts"]
    )
    world = generate_world(accounts_df, cases_df, seed=42)
    creation_ns = {f"acc_{i}": int(pd.Timestamp("2023-01-01").value) for i in range(10)}
    ctx = EnrichmentContext(world, creation_ns)

    n = 200
    rng = random.Random(7)
    chunk = pd.DataFrame({
        "tx_id": [f"tx_s{k}" for k in range(n)],
        "src_id": [f"acc_{k % 10}" for k in range(n)],
        "dst_id": [f"acc_{(k + 1) % 10}" for k in range(n)],
        "amount": [round(rng.uniform(9_001, 14_000), 2) for _ in range(n)],
        "timestamp": ["2024-02-15T14:00:00"] * n,
        "description": ["high-value transfer"] * n,
    })
    enriched = enrich_chunk(chunk, ctx)
    settled_rate = (enriched["transaction_status"] == "settled").mean()
    assert settled_rate >= 0.85, f"Only {settled_rate:.1%} settled for large legit txs"
    declined_rate = (enriched["transaction_status"] == "declined").mean()
    assert declined_rate > 0.0, "Some large-amount txs should be declined"


# ===========================================================================
# 5. Legit timestamps vary
# ===========================================================================


def test_legit_timestamps_not_constant() -> None:
    timestamps = _sample_legit_timestamps()
    assert len(set(timestamps)) >= 450, "Timestamps must be nearly all unique"


def test_legit_timestamps_span_multiple_days() -> None:
    timestamps = _sample_legit_timestamps()
    dates = {ts[:10] for ts in timestamps}
    assert len(dates) >= 60, f"Only {len(dates)} unique dates -- not spread enough"


def test_legit_timestamps_business_hours_weighted() -> None:
    timestamps = _sample_legit_timestamps(n=2000)
    hours = [int(ts[11:13]) for ts in timestamps]
    business = sum(1 for h in hours if 8 <= h <= 21) / len(hours)
    assert business >= 0.75, f"Only {business:.1%} in business hours"


# ===========================================================================
# 6 & 7. Fraud ring timestamps: non-constant and compressed
# ===========================================================================


def test_fraud_timestamps_not_constant() -> None:
    for ring_id in range(5):
        ts = _ring_burst_timestamps(ring_id, depth=5)
        assert len(set(ts)) == len(ts), f"Ring {ring_id}: duplicate timestamps"


def test_fraud_ring_timestamps_compressed() -> None:
    for ring_id in range(10):
        depth = 6
        ts = _ring_burst_timestamps(ring_id, depth)
        dts = [datetime.datetime.fromisoformat(t) for t in ts]
        span = (max(dts) - min(dts)).total_seconds() / 60.0
        assert span <= (depth - 1) * 20.0, f"Ring {ring_id} span {span:.1f} min too wide"
        assert span >= (depth - 1) * 5.0, f"Ring {ring_id} span {span:.1f} min too narrow"


def test_fraud_ring_timestamps_ascending() -> None:
    for ring_id in range(10):
        ts = _ring_burst_timestamps(ring_id, depth=7)
        dts = [datetime.datetime.fromisoformat(t) for t in ts]
        assert dts == sorted(dts), f"Ring {ring_id}: timestamps not ascending"


# ===========================================================================
# 8. Different rings, different base times
# ===========================================================================


def test_different_rings_different_base_times() -> None:
    first_timestamps = [_ring_burst_timestamps(r, depth=4)[0] for r in range(20)]
    assert len(set(first_timestamps)) >= 15


def test_rings_span_simulation_window() -> None:
    dates = {_ring_burst_timestamps(r, depth=4)[0][:10] for r in range(50)}
    assert len(dates) >= 20, f"Only {len(dates)} unique dates among 50 rings"


# ===========================================================================
# 9. Decoy timestamps non-constant
# ===========================================================================


def test_decoy_timestamps_not_constant() -> None:
    for decoy_idx in range(5):
        ts = _decoy_burst_timestamps(decoy_idx, depth=5)
        assert len(set(ts)) == len(ts), f"Decoy {decoy_idx}: duplicate timestamps"


def test_decoy_timestamps_different_from_fraud() -> None:
    fraud_bases = {_ring_burst_timestamps(r, depth=4)[0] for r in range(20)}
    decoy_bases = {_decoy_burst_timestamps(d, depth=4)[0] for d in range(20)}
    assert fraud_bases != decoy_bases


def test_decoy_timestamps_broader_burst() -> None:
    ring_spans = []
    decoy_spans = []
    depth = 5
    for idx in range(50):
        ring_ts = [datetime.datetime.fromisoformat(t) for t in _ring_burst_timestamps(idx, depth)]
        decoy_ts = [datetime.datetime.fromisoformat(t) for t in _decoy_burst_timestamps(idx, depth)]
        ring_spans.append((max(ring_ts) - min(ring_ts)).total_seconds() / 60)
        decoy_spans.append((max(decoy_ts) - min(decoy_ts)).total_seconds() / 60)
    assert statistics.mean(decoy_spans) >= statistics.mean(ring_spans)


# ===========================================================================
# 10. Deterministic timestamps
# ===========================================================================


def test_timestamps_deterministic_same_seed() -> None:
    assert _sample_legit_timestamps(seed=7) == _sample_legit_timestamps(seed=7)


def test_ring_timestamps_deterministic() -> None:
    assert _ring_burst_timestamps(42, depth=6) == _ring_burst_timestamps(42, depth=6)


def test_decoy_timestamps_deterministic() -> None:
    assert _decoy_burst_timestamps(17, depth=5) == _decoy_burst_timestamps(17, depth=5)


# ===========================================================================
# 11. IP pool density reduced
# ===========================================================================


def test_ip_pool_size_is_n_over_2() -> None:
    from src.data.entities import _ip_pool
    for n_accounts in [100, 500, 1_000]:
        expected = max(8, n_accounts // 2)
        pool = _ip_pool(expected, seed=42)
        assert len(pool) == expected


def test_ip_sharing_density_reduced() -> None:
    from src.data.entities import generate_world
    from collections import Counter

    n_accounts = 1_000
    accounts_df = pd.DataFrame(
        [{"account_id": f"acc_{i}", "customer_name": f"C{i}",
          "balance": 5000.0, "risk_score": 0.1, "creation_date": "2023-01-01"}
         for i in range(n_accounts)]
    )
    cases_df = pd.DataFrame(
        columns=["pattern_id", "start_acc_id", "pattern_type", "depth", "involved_accounts"]
    )
    world = generate_world(accounts_df, cases_df, seed=42)
    ip_counts = Counter(world.account_ip.values())
    avg = sum(ip_counts.values()) / len(ip_counts)
    # Pool = 500 for 1000 accounts -> avg ~2.0; allow [1.5, 3.5]
    assert 1.5 <= avg <= 3.5, f"avg accounts/IP = {avg:.2f}, expected ~2.0"


def test_ip_pool_larger_than_old_size() -> None:
    from src.data.entities import generate_world

    n_accounts = 400
    accounts_df = pd.DataFrame(
        [{"account_id": f"acc_{i}", "customer_name": f"C{i}",
          "balance": 5000.0, "risk_score": 0.1, "creation_date": "2023-01-01"}
         for i in range(n_accounts)]
    )
    cases_df = pd.DataFrame(
        columns=["pattern_id", "start_acc_id", "pattern_type", "depth", "involved_accounts"]
    )
    world = generate_world(accounts_df, cases_df, seed=42)
    unique_ips = len(set(world.account_ip.values()))
    old_pool = max(8, n_accounts // 4)  # 100
    assert unique_ips > old_pool, f"unique IPs {unique_ips} should exceed old pool {old_pool}"


def test_ip_pool_large_scale_determinism() -> None:
    """Regression test: _ip_pool handles collisions across 25,000 IPs without hanging."""
    from src.data.entities import _ip_pool

    pool_a = _ip_pool(25_000, seed=42)
    assert len(pool_a) == 25_000, f"Expected 25,000 IPs, got {len(pool_a)}"
    assert len(set(pool_a)) == 25_000, "All 25,000 generated IPs must be unique"

    # Determinism with same seed
    pool_b = _ip_pool(25_000, seed=42)
    assert pool_a == pool_b, "IP pool must be deterministic with same seed"

    # Different seed produces different pool
    pool_c = _ip_pool(25_000, seed=99)
    assert pool_a != pool_c, "Different seeds must produce different IP pools"

    # Check format of samples
    for ip in pool_a[:50]:
        assert ip.startswith("10."), f"Invalid IP prefix: {ip}"
        parts = [int(p) for p in ip.split(".")]
        assert len(parts) == 4 and all(0 <= p <= 255 for p in parts)


# ===========================================================================
# 12. Label-leakage guarantees intact
# ===========================================================================


def test_enrich_chunk_produces_only_observable_columns() -> None:
    from src.data.enrichment import OBSERVABLE_COLUMNS, EVALUATION_COLUMNS, enrich_chunk, EnrichmentContext
    from src.data.entities import generate_world

    accounts_df = pd.DataFrame(
        [{"account_id": f"acc_{i}", "customer_name": f"C{i}",
          "balance": 5000.0, "risk_score": 0.1, "creation_date": "2023-01-01"}
         for i in range(20)]
    )
    cases_df = pd.DataFrame(
        columns=["pattern_id", "start_acc_id", "pattern_type", "depth", "involved_accounts"]
    )
    world = generate_world(accounts_df, cases_df, seed=42)
    creation_ns = {f"acc_{i}": int(pd.Timestamp("2023-01-01").value) for i in range(20)}
    ctx = EnrichmentContext(world, creation_ns)
    chunk = pd.DataFrame({
        "tx_id": ["tx_0", "tx_1", "tx_2"],
        "src_id": ["acc_0", "acc_1", "acc_2"],
        "dst_id": ["acc_1", "acc_2", "acc_3"],
        "amount": [150.0, 8500.0, 320.0],
        "timestamp": ["2024-01-15T10:30:00", "2024-02-20T14:00:00", "2024-03-01T09:00:00"],
        "description": ["payment", "transfer", "bill payment"],
    })
    observable = enrich_chunk(chunk, ctx)
    assert set(observable.columns) == set(OBSERVABLE_COLUMNS)
    assert not any(c in observable.columns for c in EVALUATION_COLUMNS)


def test_observable_and_evaluation_columns_disjoint() -> None:
    from src.data.enrichment import OBSERVABLE_COLUMNS, EVALUATION_COLUMNS, ENRICHED_COLUMNS
    assert set(OBSERVABLE_COLUMNS).isdisjoint(set(EVALUATION_COLUMNS))
    assert list(ENRICHED_COLUMNS) == list(OBSERVABLE_COLUMNS) + list(EVALUATION_COLUMNS)


def test_transaction_status_is_valid() -> None:
    from src.data.enrichment import VALID_STATUSES, enrich_chunk, EnrichmentContext
    from src.data.entities import generate_world

    accounts_df = pd.DataFrame(
        [{"account_id": f"acc_{i}", "customer_name": f"C{i}",
          "balance": 5000.0, "risk_score": 0.1, "creation_date": "2023-01-01"}
         for i in range(10)]
    )
    cases_df = pd.DataFrame(
        columns=["pattern_id", "start_acc_id", "pattern_type", "depth", "involved_accounts"]
    )
    world = generate_world(accounts_df, cases_df, seed=42)
    creation_ns = {f"acc_{i}": int(pd.Timestamp("2023-01-01").value) for i in range(10)}
    ctx = EnrichmentContext(world, creation_ns)
    rng = random.Random(55)
    n = 300
    chunk = pd.DataFrame({
        "tx_id": [f"tx_{k}" for k in range(n)],
        "src_id": [f"acc_{k % 10}" for k in range(n)],
        "dst_id": [f"acc_{(k + 3) % 10}" for k in range(n)],
        "amount": [rng.choice([50.0, 300.0, 5_000.0, 11_000.0, 30_000.0]) for _ in range(n)],
        "timestamp": ["2024-02-10T11:00:00"] * n,
        "description": ["payment"] * n,
    })
    enriched = enrich_chunk(chunk, ctx)
    invalid = set(enriched["transaction_status"]) - set(VALID_STATUSES)
    assert not invalid, f"Invalid statuses: {invalid}"
