# Data Enrichment Layer (Synthetic Payment World)

This document describes TraceLine's synthetic payment-world enrichment layer,
which surrounds the raw SantanderAI (`gen-fraud-graph`) account/transaction
graph with a realistic payment environment.

## Why this layer exists

The raw dataset only contains bare money movements between accounts:

```
tx_id, src_id, dst_id, amount, timestamp, description, embedding
```

Real payment-fraud detection does not operate on transfers alone. It reasons
about the *context* of a transaction: which device was used, which card/UPI
instrument, from which IP address, at which merchant. Without that context,
graph models can only see one edge type.

The enrichment layer fabricates that context deterministically:

* **Merchants** — every transaction is attributed to a merchant; accounts show
  loyalty behaviour (a preferred + an alternate merchant), and fraud rings
  cluster around ring-specific merchant groups.
* **Devices** — accounts are assigned stable personal devices (~88% unique);
  ~12% share small household pools; ring members probabilistically adopt a
  shared ring device.
* **Payment instruments** — cards / UPI / wallet / netbanking instruments,
  mostly personal, with occasional shared "family" instruments.
* **IP addresses** — a deliberately small IP pool so IPs are heavily shared
  (household / ISP effect). Shared IPs are therefore far more common than
  shared devices.

The result is a multi-entity payment network with realistic co-occurrence
structure: legitimate accounts overlap enough to produce natural false
positives, while fraud rings reuse entities in a correlated but *probabilistic*
way — no single feature separates a ring member from a legitimate neighbour.

## Outputs

Written to `data/processed/payment_network/`:

| File | Contents |
| --- | --- |
| `accounts.csv` | Raw accounts carried through unchanged |
| `merchants.csv` | Merchant catalog (id, name, category, risk tier) |
| `devices.csv` | Device catalog (id, OS, type) |
| `payment_instruments.csv` | Instrument catalog (type, network, last4, expiry) |
| `ip_addresses.csv` | IP pool (ISP, country, mobile flag) |
| `account_device.csv` | Account → Device edges (`link_type`: primary/shared-pool/ring-shared) |
| `account_payment_instrument.csv` | Account → Instrument edges |
| `account_ip.csv` | Account → IP edges |
| `enriched_transactions.csv` | All transactions (main + fraud + decoy), enriched |

Account → Merchant relationships emerge from the transactions themselves
(`src_account_id` × `merchant_id`) rather than being materialised separately.

## Observable fields

These are the fields any downstream model may use as features
(`OBSERVABLE_COLUMNS`):

```
transaction_id, timestamp, amount, src_account_id, dst_account_id,
merchant_id, device_id, payment_instrument_id, ip_address,
payment_method, account_age_days, transaction_status
```

## Evaluation-only fields

Exactly two columns, always last in the output (`EVALUATION_COLUMNS`):

* `pattern_id` — the fraud pattern(s) touching either endpoint of the
  transaction (empty string if none).
* `is_ring_member` — boolean derived from `pattern_id != ""`.

**These must never be used as model features.** They exist solely to score
detection quality during evaluation.

## How label leakage is prevented

1. **Structural separation.** Observable fields are computed by
   `enrich_chunk()` from raw transaction data plus synthetic entity
   assignments only. That function has no access whatsoever to labels.
2. **Late label attachment.** Labels are appended by a single dedicated
   function, `attach_evaluation_columns()`, which runs *after* all observable
   values are already fixed and only ever appends the two evaluation columns.
3. **Column contract.** `OBSERVABLE_COLUMNS` and `EVALUATION_COLUMNS` are
   disjoint constants, asserted by tests, and the enriched CSV stores
   observables first, labels last.
4. **Tests enforce it.** `tests/test_enrichment.py` verifies that
   `enrich_chunk()` never emits label columns and that attaching labels does
   not alter any observable value.

Note: pattern membership is used when *generating* the synthetic world (that
is how correlated ring behaviour is injected into a synthetic dataset); it is
never written into observable fields.

## Reproducibility & scale

* Every decision is derived from SHA-256 hashes of stable identifiers plus a
  seed (`--seed`, default 42): identical inputs + seed produce byte-identical
  outputs, independent of chunk boundaries or processing order.
* The 1.3GB raw transaction file is processed with pandas' `chunksize`
  streaming iterator; the huge unused `embedding` column is skipped via
  `usecols`, keeping memory bounded regardless of file size.

## Usage

```bash
# Development run (first N main-file transactions; fraud/decoy always full):
python -m src.data.enrichment --limit 5000 --seed 42

# Full production run:
python -m src.data.enrichment --seed 42
```

Optional flags: `--raw-dir` (default `data/raw`) and `--out-dir`
(default `data/processed/payment_network`). Nothing under `data/raw/` is ever
modified or regenerated.

## Tests

```bash
python -m pytest tests/test_enrichment.py -v
```

Covers: determinism for a fixed seed, referential validity of all entity
references, correlated-but-non-identical ring signals, label/feature
separation, and the `--limit` fast path.
