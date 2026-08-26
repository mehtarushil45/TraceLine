"""Synthetic payment-world enrichment pipeline for TraceLine.

Reads the raw SantanderAI account/transaction graph and produces a realistic
synthetic payment environment (merchants, devices, payment instruments, IP
addresses) around it, writing everything to
``data/processed/payment_network/``.

Key properties
--------------
* **Streaming**: the 1.3GB raw transaction file is read with pandas'
  ``chunksize`` iterator and the (very large, unused) ``embedding`` column is
  skipped via ``usecols``, so memory usage stays bounded.
* **Deterministic**: every decision is derived from SHA-256 hashes of stable
  identifiers plus a seed; identical inputs + seed give byte-identical output.
* **Leakage-safe**: observable transaction fields are computed *only* from raw
  transaction data and synthetic entity assignments. The evaluation-only
  columns ``pattern_id`` and ``is_ring_member`` are appended strictly at the
  end of each row and never influence any observable field.

Usage::

    python -m src.data.enrichment --limit 5000 --seed 42
"""

from __future__ import annotations

import argparse
from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pandas as pd

from src.data.entities import (
    PaymentWorld,
    RingProfile,
    generate_world,
    relationship_frames,
    stable_int,
)

# ---------------------------------------------------------------------------
# Column contracts
# ---------------------------------------------------------------------------

#: Fields a downstream model may observe / use as features.
OBSERVABLE_COLUMNS: tuple[str, ...] = (
    "transaction_id",
    "timestamp",
    "amount",
    "src_account_id",
    "dst_account_id",
    "merchant_id",
    "device_id",
    "payment_instrument_id",
    "ip_address",
    "payment_method",
    "account_age_days",
    "transaction_status",
)

#: Evaluation-only fields. NEVER use these as model features.
EVALUATION_COLUMNS: tuple[str, ...] = (
    "pattern_id",
    "is_ring_member",
)

#: Full output order: observables first, evaluation columns strictly last.
ENRICHED_COLUMNS: tuple[str, ...] = OBSERVABLE_COLUMNS + EVALUATION_COLUMNS

VALID_STATUSES: tuple[str, ...] = ("settled", "pending", "declined")

_REPO_ROOT = Path(__file__).resolve().parents[2]

# Transaction-time behaviour probabilities.
_P_LEGIT_DEVICE_CHANGE = 0.06   # legit users occasionally switch devices
_P_LEGIT_INSTR_CHANGE = 0.04
_RING_TX_DEVICE_REUSE = 0.15    # extra transient ring-entity reuse per tx
_RING_TX_IP_REUSE = 0.20
_RING_TX_INSTR_REUSE = 0.12
_PREFERRED_MERCHANT_P = 0.82    # loyalty effect for legit accounts

#: Rows per streaming chunk for raw transaction files.
_DEFAULT_CHUNK_SIZE = 50_000



# ---------------------------------------------------------------------------
# Raw-data loaders
# ---------------------------------------------------------------------------


def load_accounts(path: Path) -> pd.DataFrame:
    """Load raw accounts and parse ``creation_date`` as datetime."""
    df = pd.read_csv(path)
    df["account_id"] = df["account_id"].astype(str)
    df["creation_date"] = pd.to_datetime(df["creation_date"])
    return df


def load_fraud_cases(path: Path) -> tuple[pd.DataFrame, dict[str, str]]:
    """Load fraud patterns and build an account -> pattern-label mapping.

    Returns:
        A tuple of the fraud-case DataFrame and a dict mapping every involved
        account id to its sorted, pipe-joined pattern labels (an account can
        belong to several patterns). Accounts not in the dict are legitimate.
    """
    cases = pd.read_csv(path, dtype=str)
    account_to_patterns: dict[str, str] = {}
    for row in cases.itertuples(index=False):
        pid = str(row.pattern_id)
        for acc in str(row.involved_accounts).split("|"):
            acc = acc.strip()
            if not acc:
                continue
            existing = account_to_patterns.get(acc)
            account_to_patterns[acc] = (
                pid if existing is None else "|".join(sorted(set(existing.split("|")) | {pid}))
            )
    return cases, account_to_patterns


def _iter_raw_transactions(
    path: Path, chunk_size: int
) -> Iterator[pd.DataFrame]:
    """Yield chunks of raw transactions without loading the file into memory.

    The ``embedding`` column is intentionally excluded: it dominates the file
    size and is not needed by this layer.
    """
    reader = pd.read_csv(
        path,
        chunksize=chunk_size,
        usecols=lambda c: c != "embedding",
        dtype={
            "tx_id": str,
            "src_id": str,
            "dst_id": str,
            "amount": float,
            "timestamp": str,
            "description": str,
        },
    )
    yield from reader


# ---------------------------------------------------------------------------
# Enrichment context
# ---------------------------------------------------------------------------


class EnrichmentContext:
    """Precomputed lookup tables used to enrich transaction chunks.

    Holds only *observable* entity assignments. Fraud labels live in a
    separate mapping (``account_patterns``) that is consumed exclusively by
    :meth:`attach_evaluation_columns`, never by observable-field generation.
    """

    def __init__(self, world: PaymentWorld, account_creation_ns: dict[str, int]) -> None:
        self.world = world
        self.account_creation_ns = account_creation_ns
        self.device_of: dict[str, str] = world.account_device
        self.instrument_of: dict[str, str] = world.account_instrument
        self.ip_of: dict[str, str] = world.account_ip
        self.pref_merchant: dict[str, int] = world.pref_merchant
        self.alt_merchant: dict[str, int] = world.alt_merchant
        self.ring_profile_of: dict[str, RingProfile] = world.account_ring

    @property
    def n_shared_devices(self) -> int:
        """Size of the shared-device pool."""
        return max(4, len(self.world.accounts) // 30)


def attach_evaluation_columns(
    enriched: pd.DataFrame,
    src_ids: pd.Series,
    dst_ids: pd.Series,
    account_patterns: dict[str, str],
) -> pd.DataFrame:
    """Append evaluation-only columns to an enriched chunk.

    This is the ONLY place where fraud labels are touched. It runs after all
    observable fields are already fixed, which structurally prevents label
    leakage into features.
    """
    src_pat = src_ids.map(account_patterns).fillna("")
    dst_pat = dst_ids.map(account_patterns).fillna("")
    src_np = src_pat.to_numpy()
    dst_np = dst_pat.to_numpy()

    pattern_id = np.where(src_np != "", src_np, dst_np)

    # Rare case: both endpoints are labelled with different patterns - merge.
    diff = (src_np != "") & (dst_np != "") & (src_np != dst_np)
    if diff.any():
        for i in np.flatnonzero(diff):
            merged = "|".join(
                sorted(set(str(pattern_id[i]).split("|")) | set(str(dst_np[i]).split("|")))
            )
            pattern_id[i] = merged

    out = enriched.copy()
    out["pattern_id"] = pattern_id
    out["is_ring_member"] = out["pattern_id"] != ""
    return out



def enrich_chunk(chunk: pd.DataFrame, ctx: EnrichmentContext) -> pd.DataFrame:
    """Enrich one raw-transaction chunk with synthetic payment-world fields.

    All randomness comes from a per-transaction SHA-256 hash, so results do
    not depend on chunk boundaries or processing order. Only observable
    fields are produced here; labels are attached separately.

    Args:
        chunk: Raw transactions with columns ``tx_id, src_id, dst_id,
            amount, timestamp``.
        ctx: Precomputed entity assignments.

    Returns:
        A DataFrame with exactly :data:`OBSERVABLE_COLUMNS` (no labels).
    """
    world = ctx.world
    tx_id = chunk["tx_id"].astype(str)
    src = chunk["src_id"].astype(str)
    amount = chunk["amount"].astype(float).round(2)

    # One deterministic 64-bit hash per transaction; every per-tx decision is
    # a different bit-slice of it (single Python-level pass per chunk).
    h = tx_id.map(lambda t: stable_int(t, "tx")).to_numpy(dtype=np.uint64)
    u = h.astype(np.uint64)

    def ratio(shift: int) -> np.ndarray:
        """Uniform floats in [0, 1) from a 16-bit hash slice (vectorized)."""
        return ((u >> np.uint64(shift)) & np.uint64(0xFFFF)).astype(np.float64) / 65536.0

    def byte_ratio(shift: int) -> np.ndarray:
        """Uniform floats in [0, 1) from an 8-bit hash slice."""
        return ((u >> np.uint64(shift)) & np.uint64(0xFF)).astype(np.float64) / 256.0

    r_dev = ratio(0)
    r_ins = ratio(16)
    r_mch = ratio(32)
    r_status = ratio(48)
    r_ring_dev = byte_ratio(3)
    r_ring_ip = byte_ratio(11)
    r_ring_ins = byte_ratio(19)
    r_ring_mch = byte_ratio(27)

    # --- device: stable primary device, occasional legit switch ---
    device = src.map(ctx.device_of)
    n_shared_dev = ctx.n_shared_devices
    alt_idx = (h % np.uint64(max(n_shared_dev, 1))).astype("int64")
    alt_device = "dev_s" + pd.Series(alt_idx, index=chunk.index).astype(str).str.zfill(4)
    device = device.where(
        pd.Series(r_dev, index=chunk.index) >= _P_LEGIT_DEVICE_CHANGE, alt_device
    )

    # --- payment instrument ---
    instrument = src.map(ctx.instrument_of)
    n_shared_ins = max(4, len(world.accounts) // 22)
    alt_ins_idx = (h % np.uint64(max(n_shared_ins, 1))).astype("int64")
    alt_instrument = "ins_s" + pd.Series(alt_ins_idx, index=chunk.index).astype(str).str.zfill(4)
    instrument = instrument.where(
        pd.Series(r_ins, index=chunk.index) >= _P_LEGIT_INSTR_CHANGE, alt_instrument
    )

    # --- IP address (already heavily shared across accounts) ---
    ip_address = src.map(ctx.ip_of)

    # --- merchant: loyalty between a preferred and an alternate merchant ---
    pref = src.map(ctx.pref_merchant)
    altm = src.map(ctx.alt_merchant)
    r_mch_np = pd.Series(r_mch, index=chunk.index).to_numpy()
    mch_idx = np.where(r_mch_np < _PREFERRED_MERCHANT_P, pref.to_numpy(), altm.to_numpy())
    merchant = pd.Series(
        [f"mch_{int(i):05d}" for i in mch_idx], index=chunk.index, dtype="object"
    )

    # --- ring overlays: probabilistic transient reuse of shared entities ---
    profiles = src.map(ctx.ring_profile_of)
    ring_mask = profiles.notna()
    if ring_mask.any():
        ring_rows = list(profiles[ring_mask].index)
        profs = [profiles.at[i] for i in ring_rows]

        dev_pick = pd.Series(r_ring_dev, index=chunk.index)
        ip_pick = pd.Series(r_ring_ip, index=chunk.index)
        ins_pick = pd.Series(r_ring_ins, index=chunk.index)
        mch_pick = pd.Series(r_ring_mch, index=chunk.index)

        device = device.copy()
        ip_address = ip_address.copy()
        instrument = instrument.copy()
        merchant = merchant.copy()
        for i, p in zip(ring_rows, profs):
            if dev_pick.at[i] < p.p_device_use * 0.6 + _RING_TX_DEVICE_REUSE:
                device.at[i] = p.device_id
            if ip_pick.at[i] < p.p_ip_use * 0.6 + _RING_TX_IP_REUSE:
                ip_address.at[i] = p.ip_address
            if (
                p.instrument_id is not None
                and ins_pick.at[i] < p.p_instrument_use * 0.6 + _RING_TX_INSTR_REUSE
            ):
                instrument.at[i] = p.instrument_id
            if mch_pick.at[i] < p.p_merchant_use:
                pick = p.merchant_indices[
                    stable_int(str(tx_id.at[i]), "ring-mch") % len(p.merchant_indices)
                ]
                merchant.at[i] = f"mch_{pick:05d}"

    # --- payment method derives from the chosen instrument's type ---
    payment_method = instrument.map(world.instrument_type).fillna("card")

    # --- timestamps and account age (observable, from raw data) ---
    ts = pd.to_datetime(chunk["timestamp"])
    # pandas may parse as datetime64[s/us]; normalise to nanoseconds so the
    # subtraction shares units with the account creation timestamps.
    ts_ns = ts.astype("datetime64[ns]").astype("int64")
    creation_ns = src.map(ctx.account_creation_ns).astype("int64")
    age_days = ((ts_ns - creation_ns) // 86_400_000_000_000).clip(lower=0)

    # --- status: smooth probabilistic model, no hard fraud-amount threshold ---
    # Previously amount > 9000.0 was a hard sentinel that perfectly encoded the
    # fraud transaction range into transaction_status.  Replaced by a log-scale
    # ramp: p_declined rises from 2 % at ₹10 to 5 % at ₹50,000.  Large
    # *legitimate* transactions are also occasionally declined, so this feature
    # remains informative but is not a fraud oracle.
    amount_np = amount.to_numpy()
    r_status_np = pd.Series(r_status, index=chunk.index).to_numpy()
    status = np.full(len(chunk), "settled", dtype=object)

    # Log-scale ramp: 0.0 at ₹10 → 1.0 at ₹50,000 (clipped)
    amount_log_ratio = np.clip(
        np.log1p(amount_np) / np.log1p(50_000.0), 0.0, 1.0
    )
    p_declined = 0.02 + 0.03 * amount_log_ratio   # 2 % → 5 %
    p_pending = 0.03                               # flat 3 %

    status[r_status_np < p_declined] = "declined"
    status[
        (r_status_np >= p_declined) & (r_status_np < p_declined + p_pending)
    ] = "pending"

    return pd.DataFrame(
        {
            "transaction_id": tx_id,
            "timestamp": ts.dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "amount": amount,
            "src_account_id": src,
            "dst_account_id": chunk["dst_id"].astype(str),
            "merchant_id": merchant,
            "device_id": device,
            "payment_instrument_id": instrument,
            "ip_address": ip_address,
            "payment_method": payment_method,
            "account_age_days": age_days.astype("int64"),
            "transaction_status": status,
        },
        columns=list(OBSERVABLE_COLUMNS),
    )



# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def _build_context(
    accounts: pd.DataFrame, fraud_cases: pd.DataFrame, seed: int
) -> tuple[PaymentWorld, EnrichmentContext]:
    """Generate the payment world and wrap it in an enrichment context."""
    world = generate_world(accounts, fraud_cases, seed)
    creation_ns = {
        str(row.account_id): int(pd.Timestamp(row.creation_date).value)
        for row in accounts.itertuples(index=False)
    }
    return world, EnrichmentContext(world, creation_ns)


def _write_transaction_file(
    path: Path,
    out_handle_path: Path,
    ctx: EnrichmentContext,
    account_patterns: dict[str, str],
    header: bool,
    remaining_limit: int | None,
) -> int:
    """Stream one raw transaction file through enrichment and append it.

    Args:
        path: Raw CSV to read.
        out_handle_path: Output CSV to append to.
        ctx: Precomputed entity assignments.
        account_patterns: Account -> pattern-label mapping (evaluation only).
        header: Whether to write the CSV header (first file only).
        remaining_limit: Max rows to take from this file, or ``None``.

    Returns:
        Number of rows written by this file.
    """
    written = 0
    for chunk in _iter_raw_transactions(path, _DEFAULT_CHUNK_SIZE):
        if remaining_limit is not None and written >= remaining_limit:
            break
        if remaining_limit is not None:
            take = min(len(chunk), remaining_limit - written)
            chunk = chunk.iloc[:take]

        observable = enrich_chunk(chunk, ctx)
        enriched = attach_evaluation_columns(
            observable, chunk["src_id"], chunk["dst_id"], account_patterns
        )
        enriched = enriched[list(ENRICHED_COLUMNS)]

        enriched.to_csv(
            out_handle_path,
            mode="a",
            index=False,
            header=header and written == 0,
        )
        written += len(enriched)
    return written


def run_pipeline(
    raw_dir: Path,
    out_dir: Path,
    seed: int = 42,
    limit: int | None = None,
) -> dict[str, int]:
    """Run the full enrichment pipeline and write all outputs.

    Args:
        raw_dir: Directory containing ``data/raw`` (with subfolders
            ``accounts``, ``transactions``, ``fraud``).
        out_dir: Destination directory (created if missing).
        seed: Reproducibility seed.
        limit: If set, process at most this many main-file transactions
            (fraud/decoy files are always processed in full).

    Returns:
        Summary counts (rows written per source, entities generated).
    """
    accounts_path = raw_dir / "accounts" / "accounts_0_0.csv"
    tx_main_path = raw_dir / "transactions" / "transactions_0_0.csv"
    tx_fraud_path = raw_dir / "fraud" / "transactions_fraud.csv"
    tx_decoy_path = raw_dir / "transactions" / "transactions_decoy.csv"
    fraud_cases_path = raw_dir / "fraud" / "fraud_cases.csv"

    accounts = load_accounts(accounts_path)
    fraud_cases, account_patterns = load_fraud_cases(fraud_cases_path)
    world, ctx = _build_context(accounts, fraud_cases, seed)

    out_dir.mkdir(parents=True, exist_ok=True)

    # 1) Entity catalogs.
    world.merchants.to_csv(out_dir / "merchants.csv", index=False)
    world.devices.to_csv(out_dir / "devices.csv", index=False)
    world.instruments.to_csv(out_dir / "payment_instruments.csv", index=False)
    world.ips.to_csv(out_dir / "ip_addresses.csv", index=False)
    accounts_out = accounts.copy()
    accounts_out["creation_date"] = accounts_out["creation_date"].dt.strftime("%Y-%m-%d")
    accounts_out.to_csv(out_dir / "accounts.csv", index=False)

    # 2) Account-entity relationship tables.
    for name, frame in relationship_frames(world).items():
        frame.to_csv(out_dir / name, index=False)

    # 3) Enriched transactions, streamed file by file.
    enriched_path = out_dir / "enriched_transactions.csv"
    if enriched_path.exists():
        enriched_path.unlink()

    n_main = _write_transaction_file(
        tx_main_path, enriched_path, ctx, account_patterns, header=True, remaining_limit=limit
    )
    n_fraud = _write_transaction_file(
        tx_fraud_path, enriched_path, ctx, account_patterns, header=False, remaining_limit=None
    )
    n_decoy = _write_transaction_file(
        tx_decoy_path, enriched_path, ctx, account_patterns, header=False, remaining_limit=None
    )

    return {
        "main_transactions": n_main,
        "fraud_transactions": n_fraud,
        "decoy_transactions": n_decoy,
        "total_transactions": n_main + n_fraud + n_decoy,
        "accounts": len(world.accounts),
        "merchants": len(world.merchants),
        "devices": len(world.devices),
        "payment_instruments": len(world.instruments),
        "ip_addresses": len(world.ips),
        "patterns": len(world.ring_profiles),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    """CLI entry point for the enrichment pipeline."""
    parser = argparse.ArgumentParser(
        description="Build the TraceLine synthetic payment-world enrichment layer."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N transactions from the main transaction file "
        "(fraud/decoy files are always processed in full).",
    )
    parser.add_argument("--seed", type=int, default=42, help="Reproducibility seed.")
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "raw",
        help="Directory containing the raw SantanderAI export.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "processed" / "payment_network",
        help="Output directory.",
    )
    args = parser.parse_args(argv)

    summary = run_pipeline(
        raw_dir=args.raw_dir,
        out_dir=args.out_dir,
        seed=args.seed,
        limit=args.limit,
    )

    print("Enrichment complete:")
    for key, value in summary.items():
        print(f"  {key:>20}: {value}")
    print(f"  {'output_dir':>20}: {args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
