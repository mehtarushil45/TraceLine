"""Tests for the TraceLine synthetic payment-world enrichment layer.

The tests run against small hermetic fixtures that mimic the real
SantanderAI raw schemas, so no 1.3GB file is needed and nothing under
``data/raw`` is ever touched.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from src.data.enrichment import (
    ENRICHED_COLUMNS,
    EVALUATION_COLUMNS,
    OBSERVABLE_COLUMNS,
    VALID_STATUSES,
    enrich_chunk,
    attach_evaluation_columns,
    run_pipeline,
)

SEED = 42


# ---------------------------------------------------------------------------
# Fixture builders (mimic data/raw schemas exactly)
# ---------------------------------------------------------------------------


def _write_accounts(raw_dir: Path, n_accounts: int) -> None:
    """Write ``n_accounts`` accounts with the real raw schema."""
    folder = raw_dir / "accounts"
    folder.mkdir(parents=True)
    rows = ["account_id,customer_name,balance,risk_score,creation_date"]
    for i in range(n_accounts):
        day = 1 + (i % 28)
        month = 1 + (i % 12)
        rows.append(
            f"acc_{i},Customer_{i},{1000 + i * 13.37:.2f},{(i % 100) / 100:.2f},"
            f"2023-{month:02d}-{day:02d}"
        )
    (folder / "accounts_0_0.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")


def _embedding(i: int, dim: int = 8) -> str:
    """Tiny deterministic stand-in for the huge raw embedding column."""
    return "|".join(f"{((i * 7 + j * 13) % 97) / 97:.4f}" for j in range(dim))


def _write_transactions(
    path: Path, rows: list[tuple[str, str, str, float, str]]
) -> None:
    """Write a transaction CSV with the real raw schema (incl. embedding)."""
    lines = ["tx_id,src_id,dst_id,amount,timestamp,description,embedding"]
    for tx_id, src, dst, amount, ts in rows:
        idx = int(tx_id.rsplit("_", 1)[-1])
        lines.append(f"{tx_id},{src},{dst},{amount:.2f},{ts},payment,{_embedding(idx)}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


@pytest.fixture(scope="module")
def raw_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Build a small raw dataset: 200 accounts, 3 fraud patterns."""
    root = tmp_path_factory.mktemp("raw")
    n_accounts = 200

    _write_accounts(root, n_accounts)

    # Main transactions among legitimate accounts acc_0..acc_179.
    main_rows = []
    for i in range(600):
        src = f"acc_{(i * 7) % 180}"
        dst = f"acc_{(i * 11 + 3) % 180}"
        amount = 50.0 + (i % 400) * 25.5
        hour = 6 + (i % 12)
        ts = f"2024-01-{1 + (i % 20):02d}T{hour:02d}:00:00"
        main_rows.append((f"tx_{i}", src, dst, amount, ts))
    _write_transactions(root / "transactions" / "transactions_0_0.csv", main_rows)

    # Two fraud patterns with overlapping-free members.
    pat_a = [f"acc_{180 + k}" for k in range(10)]
    pat_b = [f"acc_{190 + k}" for k in range(10)]
    cases = [
        ("pat_0", "acc_180", "cycle", "5", "|".join(pat_a)),
        ("pat_1", "acc_190", "fan_out", "4", "|".join(pat_b)),
    ]
    fraud_dir = root / "fraud"
    fraud_dir.mkdir(parents=True)
    case_lines = ["pattern_id,start_acc_id,pattern_type,depth,involved_accounts"]
    for pid, start, ptype, depth, members in cases:
        case_lines.append(f"{pid},{start},{ptype},{depth},{members}")
    (fraud_dir / "fraud_cases.csv").write_text("\n".join(case_lines) + "\n", encoding="utf-8")

    # Fraud transactions inside pattern rings (compressed timing).
    fraud_rows = []
    for i in range(40):
        members = pat_a if i < 30 else pat_b
        src = members[i % len(members)]
        dst = members[(i + 1) % len(members)]
        amount = 8000.0 + i * 111.0
        ts = "2024-01-05T12:00:00" if i < 30 else "2024-01-06T03:00:00"
        fraud_rows.append((f"tx_fraud_{i}", src, dst, amount, ts))
    _write_transactions(fraud_dir / "transactions_fraud.csv", fraud_rows)

    # Decoy chain over non-ring accounts (legitimate-looking).
    decoy_rows = []
    for i in range(8):
        src = f"acc_{60 + i}"
        dst = f"acc_{61 + i}"
        decoy_rows.append(
            (f"tx_decoy_{i}", src, dst, 5000.0 + i * 250.0, "2024-01-07T13:00:00")
        )
    _write_transactions(root / "transactions" / "transactions_decoy.csv", decoy_rows)
    return root


@pytest.fixture(scope="module")
def runs(tmp_path_factory: pytest.TempPathFactory, raw_dir: Path) -> dict[str, Path]:
    """Run the pipeline twice with seed 42 and once with a different seed."""
    base = tmp_path_factory.mktemp("runs")
    out_same_a = base / "same_a"
    out_same_b = base / "same_b"
    out_diff_seed = base / "diff_seed"
    run_pipeline(raw_dir, out_same_a, seed=SEED)
    run_pipeline(raw_dir, out_same_b, seed=SEED)
    run_pipeline(raw_dir, out_diff_seed, seed=SEED + 1)
    return {"same_a": out_same_a, "same_b": out_same_b, "diff_seed": out_diff_seed}


# ---------------------------------------------------------------------------
# 1. Deterministic output with the same seed
# ---------------------------------------------------------------------------


def test_deterministic_output_with_same_seed(runs: dict[str, Path]) -> None:
    """Same seed -> byte-identical outputs; different seed -> different data."""
    a = (runs["same_a"] / "enriched_transactions.csv").read_bytes()
    b = (runs["same_b"] / "enriched_transactions.csv").read_bytes()
    assert a == b, "Same seed must produce byte-identical enriched transactions"

    for entity_file in (
        "merchants.csv",
        "devices.csv",
        "payment_instruments.csv",
        "ip_addresses.csv",
        "account_device.csv",
    ):
        ea = (runs["same_a"] / entity_file).read_bytes()
        eb = (runs["same_b"] / entity_file).read_bytes()
        assert ea == eb, f"{entity_file} must be deterministic for the same seed"

    c = (runs["diff_seed"] / "enriched_transactions.csv").read_bytes()
    assert c != a, "Different seed must produce different enrichment"


# ---------------------------------------------------------------------------
# 2. Every transaction references valid entities
# ---------------------------------------------------------------------------


def test_every_transaction_references_valid_entities(runs: dict[str, Path]) -> None:
    """All foreign keys in enriched transactions resolve to real entities."""
    out = runs["same_a"]
    txs = pd.read_csv(out / "enriched_transactions.csv", keep_default_na=False)

    accounts = set(pd.read_csv(out / "accounts.csv")["account_id"])
    merchants = set(pd.read_csv(out / "merchants.csv")["merchant_id"])
    devices = set(pd.read_csv(out / "devices.csv")["device_id"])
    instruments = set(pd.read_csv(out / "payment_instruments.csv")["instrument_id"])
    ips = set(pd.read_csv(out / "ip_addresses.csv")["ip_address"])

    assert set(txs["src_account_id"]).issubset(accounts)
    assert set(txs["dst_account_id"]).issubset(accounts)
    assert set(txs["merchant_id"]).issubset(merchants)
    assert set(txs["device_id"]).issubset(devices)
    assert set(txs["payment_instrument_id"]).issubset(instruments)
    assert set(txs["ip_address"]).issubset(ips)

    assert set(txs["transaction_status"]).issubset(set(VALID_STATUSES))
    assert list(txs.columns) == list(ENRICHED_COLUMNS)
    assert (txs["account_age_days"] >= 0).all(), "account_age_days must be non-negative"
    assert (txs["amount"] >= 0).all()


# ---------------------------------------------------------------------------
# 3. Ring members get correlated but non-identical signals
# ---------------------------------------------------------------------------


def test_ring_members_correlated_but_not_identical(runs: dict[str, Path]) -> None:
    """Ring accounts reuse shared entities more than baseline, but not always."""
    out = runs["same_a"]
    txs = pd.read_csv(out / "enriched_transactions.csv", keep_default_na=False)
    ring_txs = txs[txs["is_ring_member"]]
    legit_mask = ~txs["is_ring_member"]
    pat0 = ring_txs[ring_txs["pattern_id"] == "pat_0"]

    assert len(pat0) > 0, "Expected pattern-labelled transactions in the fixture"

    # Correlation: the pattern-shared device/IP is used far more often inside
    # the ring than any single device/IP is used across legitimate traffic.
    ring_dev_rate = float((pat0["device_id"] == "dev_ring_pat_0").mean())
    ring_ip_rate = float(pat0["ip_address"].str.startswith("10.66.").mean())

    legit_df = txs[legit_mask]
    top_legit_device_rate = float(legit_df.groupby("device_id").size().max()) / max(
        len(legit_df), 1
    )
    top_legit_ip_rate = float(legit_df.groupby("ip_address").size().max()) / max(
        len(legit_df), 1
    )

    assert ring_dev_rate > top_legit_device_rate * 3, (
        "Ring members should correlate on the pattern device"
    )
    assert ring_ip_rate > top_legit_ip_rate * 3, (
        "Ring members should correlate on the pattern IP"
    )

    # Non-identical: no single feature separates rings perfectly.
    assert ring_dev_rate < 1.0, "Not every ring transaction may use the ring device"
    mixed_signals = (
        (pat0["device_id"] != "dev_ring_pat_0")
        | (~pat0["ip_address"].str.startswith("10.66."))
        | (pat0["merchant_id"] != pat0["merchant_id"].mode().iloc[0])
    )
    assert mixed_signals.any(), (
        "Ring signals must be probabilistic, never uniform across all members"
    )

    # Legitimate overlap exists too (realistic false positives).
    shared_devices = legit_df.groupby("device_id").size()
    shared_ips = legit_df.groupby("ip_address").size()
    assert (shared_devices > 1).any(), "Legit accounts should sometimes share devices"

    # Shared IPs must be more common than shared devices: measured on the
    # Account->entity relationship tables (the ground truth of assignment).
    acc_dev = pd.read_csv(out / "account_device.csv")
    acc_ip = pd.read_csv(out / "account_ip.csv")
    dev_counts = acc_dev.groupby("device_id")["account_id"].nunique()
    ip_counts = acc_ip.groupby("ip_address")["account_id"].nunique()
    n_shared_dev_entities = int((dev_counts > 1).sum())
    n_shared_ip_entities = int((ip_counts > 1).sum())
    assert n_shared_ip_entities > n_shared_dev_entities, (
        "More distinct IPs should be shared across accounts than devices"
    )

    # Sharing *degree*: total co-occurrence pairs through IPs must exceed
    # those through devices (household/ISP effect).
    def _pairs(counts: pd.Series) -> int:
        return int(((counts * (counts - 1)) // 2).sum())

    assert _pairs(ip_counts) > _pairs(dev_counts), (
        "Accounts should co-occur through shared IPs more than shared devices"
    )


# ---------------------------------------------------------------------------
# 4. Labels are kept separate from observable features
# ---------------------------------------------------------------------------


def test_labels_kept_separate_from_features(
    runs: dict[str, Path], raw_dir: Path
) -> None:
    """Observable fields are produced without ever touching label columns."""
    from src.data.enrichment import EnrichmentContext
    from src.data.entities import generate_world

    # Structural separation of the column contracts.
    assert set(OBSERVABLE_COLUMNS).isdisjoint(set(EVALUATION_COLUMNS))
    assert list(ENRICHED_COLUMNS) == list(OBSERVABLE_COLUMNS) + list(EVALUATION_COLUMNS)

    out = runs["same_a"]
    txs = pd.read_csv(out / "enriched_transactions.csv", keep_default_na=False)

    # Evaluation columns come last and contain only the two agreed labels.
    assert list(txs.columns[-2:]) == list(EVALUATION_COLUMNS)
    assert set(txs["pattern_id"]) <= {"", "pat_0", "pat_1"}
    assert set(txs["is_ring_member"].unique().tolist()) <= {True, False}

    # enrich_chunk itself never emits label columns.
    accounts = pd.read_csv(raw_dir / "accounts" / "accounts_0_0.csv")
    cases = pd.read_csv(raw_dir / "fraud" / "fraud_cases.csv")
    world = generate_world(accounts, cases, SEED)
    creation_ns = {
        str(row.account_id): int(pd.Timestamp(row.creation_date).value)
        for row in accounts.itertuples(index=False)
    }
    ctx = EnrichmentContext(world, creation_ns)
    chunk = pd.read_csv(raw_dir / "transactions" / "transactions_decoy.csv", nrows=5)
    observable_only = enrich_chunk(chunk, ctx)
    assert set(observable_only.columns) == set(OBSERVABLE_COLUMNS)

    # attach_evaluation_columns changes nothing in the observable block.
    labelled = attach_evaluation_columns(
        observable_only, chunk["src_id"], chunk["dst_id"], {"acc_60": "pat_x"}
    )
    pd.testing.assert_frame_equal(
        labelled[list(OBSERVABLE_COLUMNS)], observable_only[list(OBSERVABLE_COLUMNS)]
    )


# ---------------------------------------------------------------------------
# 5. Processing a small transaction limit works
# ---------------------------------------------------------------------------


def test_small_transaction_limit(raw_dir: Path, tmp_path: Path) -> None:
    """--limit truncates the main file but keeps fraud/decoy complete."""
    out = tmp_path / "limited"
    n_fraud = sum(1 for _ in open(raw_dir / "fraud" / "transactions_fraud.csv")) - 1
    n_decoy = sum(1 for _ in open(raw_dir / "transactions" / "transactions_decoy.csv")) - 1

    summary = run_pipeline(raw_dir, out, seed=SEED, limit=25)

    txs = pd.read_csv(out / "enriched_transactions.csv", keep_default_na=False)
    assert len(txs) == 25 + n_fraud + n_decoy
    assert summary["main_transactions"] == 25
    assert summary["total_transactions"] == len(txs)

    # All output files are still produced and internally consistent.
    for name in (
        "accounts.csv",
        "merchants.csv",
        "devices.csv",
        "payment_instruments.csv",
        "ip_addresses.csv",
        "account_device.csv",
        "account_payment_instrument.csv",
        "account_ip.csv",
        "enriched_transactions.csv",
    ):
        assert (out / name).exists(), f"{name} must be written even with --limit"
