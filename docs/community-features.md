# Community Feature Engine

**Module**: `src/features/community_features.py`  
**Public function**: `compute_community_features(communities, tx_df, merchant_df=None) → pd.DataFrame`

---

## Purpose

The Community Feature Engine transforms a list of detected communities (output
of Louvain community detection) into a flat, typed feature matrix. Each row
represents one community; each column is an explainable numerical feature. The
matrix is the direct input to the downstream ML ring scorer.

All features are computed from **observable evidence only**: the `Community`
object (which itself is derived from the account-relationship graph, built
exclusively from observable transaction and entity data) and an
observable-only transaction `DataFrame`. No fraud labels, enrichment-internal
fields, or ring-specific identifier patterns are ever accessed.

---

## Input Contract

### `communities: List[Community]`

Detected communities from `src.detection.communities.detect_communities`.
Each `Community` carries:
- graph-structure fields (`member_count`, `density`, `internal_edges`, …)
- `CommunityTemporalStats` (transaction count, hour spread, compression score, …)
- `internal_edges: Tuple[AccountEdge]` — each edge carries `shared_instruments`,
  `shared_devices`, `shared_ips`, `shared_merchants`, `temporal_overlap`, `weight`

### `tx_df: pd.DataFrame`

Observable-only transaction data. **Must NOT** contain any column in
`FORBIDDEN_COLUMNS` (see §Leakage Protections below).

Expected columns used by the engine:

| Column | Type | Used by |
|--------|------|---------|
| `src_account_id` | str | community membership filter |
| `dst_account_id` | str | community membership filter |
| `amount` | float | F4 amount features |
| `transaction_status` | str | F4 declined_rate |
| `payment_method` | str | F4 unique_payment_methods |
| `merchant_id` | str | F4 merchant_category_entropy |

The engine tolerates missing optional columns by returning `NaN` for the
corresponding features.

### `merchant_df: pd.DataFrame` (optional)

Observable merchant catalog. Required columns: `merchant_id`, `category`.
If absent, `merchant_category_entropy` is `NaN` for all communities.

### Transaction membership rule

A transaction is counted for community *C* if `src_account_id` **or**
`dst_account_id` belongs to *C*. When both endpoints are in *C*, the
transaction is counted once. This matches the definition used by
`extract_account_activity` in the detection layer.

---

## Output Contract

```python
pd.DataFrame(
    index   = "community_id"   # int, one row per community
    columns = FEATURE_NAMES    # 21 features in canonical order (see below)
    dtype   = np.float64       # throughout; NaN for undefined values
)
```

**NaN semantics**: `NaN` is returned for any feature that is mathematically
undefined given the available data (e.g. sample standard deviation with fewer
than 2 observations). Downstream ML should handle missingness explicitly rather
than zero-filling.

---

## Feature Reference

### F1 — Graph Structure (4 features)

These measure the internal connectivity and evidence weight of the community.

---

#### `member_count`

$$N$$

Number of accounts in the community.

**Defined**: always (N ≥ 1, Louvain invariant).  
**NaN**: never.

---

#### `density`

$$d = \frac{E}{\binom{N}{2}} = \frac{E}{N(N-1)/2}$$

where $E$ = number of internal account-to-account edges.

Fraction of possible account pairs that share at least one observable entity
(device, instrument, IP, or merchant via transactions). 0.0 for singletons
(no possible pairs, no edges).

**Defined**: always.  
**NaN**: never. Returns 0.0 for singletons.

---

#### `mean_edge_weight`

$$\bar{w} = \frac{\text{total\_internal\_weight}}{E}$$

Average evidence weight across internal edges. The weight formula (from the
projection layer) is:

$$w = \left(4\sqrt{|\text{instruments}|} + 3\sqrt{|\text{devices}|} + 2\sqrt{|\text{merchants}|} + 1\sqrt{|\text{ips}|}\right) \cdot m(t)$$

where $m(t) = \min(1 + 0.25 \cdot \text{temporal\_overlap\_days},\ 2.0)$.

**Defined**: when E > 0.  
**NaN**: when E = 0 (singleton or isolated community with no shared entities).

---

#### `weight_per_member`

$$\frac{\text{total\_internal\_weight}}{N}$$

Total evidence weight normalised by community size. 0.0 for singletons.

**Defined**: always (N ≥ 1).  
**NaN**: never.

---

### F2 — Entity Sharing (6 features)

Measure shared infrastructure by unioning each entity type across all internal
edges.

---

#### `unique_shared_instruments`

$$\left|\bigcup_{e \in \text{internal\_edges}} \text{shared\_instruments}(e)\right|$$

Count of distinct payment instruments shared by at least one account pair in
the community.

**Defined**: always (0 when no internal edges).  
**NaN**: never.

---

#### `unique_shared_devices`

$$\left|\bigcup_{e \in \text{internal\_edges}} \text{shared\_devices}(e)\right|$$

Count of distinct devices shared by at least one account pair.

**Defined**: always.  
**NaN**: never.

---

#### `unique_shared_ips`

$$\left|\bigcup_{e \in \text{internal\_edges}} \text{shared\_ips}(e)\right|$$

Count of distinct IP addresses shared by at least one account pair.

**Defined**: always.  
**NaN**: never.

---

#### `unique_shared_merchants`

$$\left|\bigcup_{e \in \text{internal\_edges}} \text{shared\_merchants}(e)\right|$$

Count of distinct merchants visited by at least one account pair (derived via
the transaction graph, not direct assignment).

**Defined**: always.  
**NaN**: never.

---

#### `instrument_sharing_ratio`

$$\frac{\text{unique\_shared\_instruments}}{N}$$

Normalises shared instrument count for community size.

**Defined**: always (N ≥ 1).  
**NaN**: never. Returns 0.0 for singletons.

---

#### `device_sharing_ratio`

$$\frac{\text{unique\_shared\_devices}}{N}$$

Normalises shared device count for community size.

**Defined**: always.  
**NaN**: never.

---

### F3 — Temporal Concentration (5 features)

Derived from `Community.temporal_stats` (computed during detection) and the
`temporal_overlap` field of internal edges.

---

#### `temporal_compression_score`

$$\frac{T}{T + S}$$

where $T$ = `transaction_count` and $S$ = `timestamp_span_hours` (hours
between first and last community transaction). Range: $(0, 1]$ when $T > 0$,
approaching 1 when many transactions are packed into a short window. 0.0 for
communities with no transactions.

**Defined**: always.  
**NaN**: never.

---

#### `unique_active_hours`

Count of distinct clock-hours (0–23) across all community transactions. 1 if
all transactions occur within the same clock-hour; max 24.

**Defined**: always (0 for no transactions).  
**NaN**: never.

---

#### `median_inter_transaction_gap_hours`

Median of pairwise consecutive gaps between sorted community-wide transaction
timestamps:

$$\text{median}\left(\{t_{i+1} - t_i \mid i = 1 \ldots T-1\}\right)$$

**Defined**: when $T \geq 2$.  
**NaN**: when $T < 2$.

> **Note**: `tx_per_member` uses the deduplicated transaction count from
> `Community.temporal_stats` (identical timestamps counted once across members).
> F4 features count actual `tx_df` rows, which may differ if two members share
> a timestamp.

---

#### `tx_per_member`

$$\frac{\text{transaction\_count}}{N}$$

Transactions per community member, using the deduplicated count from
`Community.temporal_stats`. 0.0 for communities with no transactions.

**Defined**: always (N ≥ 1).  
**NaN**: never.

---

#### `temporal_overlap_mean`

$$\frac{1}{E}\sum_{e \in \text{internal\_edges}} \text{temporal\_overlap}(e)$$

Mean calendar-day overlap across internal edges. `temporal_overlap` for an
edge is the number of calendar days on which *both* endpoint accounts had
transactions.

**Defined**: when E > 0.  
**NaN**: when E = 0 (singleton or no internal edges).

---

### F4 — Transaction Behavior + Financial Exposure (6 features)

Computed from `tx_df` rows whose `src_account_id` or `dst_account_id` is a
community member. All features are `NaN` when no such transactions exist.

---

#### `mean_tx_amount`

$$\frac{1}{T'}\sum_{i=1}^{T'} \text{amount}_i$$

Arithmetic mean of transaction amounts for community member transactions,
where $T'$ = number of matching rows in `tx_df`.

**Defined**: when $T' \geq 1$.  
**NaN**: when $T' = 0$.

---

#### `amount_cv`

$$\frac{s}{\bar{x}}$$

Sample coefficient of variation: sample standard deviation ($\text{ddof}=1$)
divided by the mean.

$$s = \sqrt{\frac{\sum_{i=1}^{T'}(\text{amount}_i - \bar{x})^2}{T'-1}}$$

**Defined**: when $T' \geq 2$ and $\bar{x} \neq 0$.  
**NaN**: when $T' < 2$, or $\bar{x} = 0$.

---

#### `declined_rate`

$$\frac{\#\{\text{transaction\_status} = \text{`declined'}\}}{T'}$$

Proportion of community member transactions that were declined.

**Defined**: when $T' \geq 1$ and `transaction_status` column is present.  
**NaN**: when $T' = 0$ or column absent.

---

#### `unique_payment_methods`

$$\left|\{\text{payment\_method}_i \mid i = 1 \ldots T'\}\right|$$

Count of distinct payment method labels (e.g. `card`, `upi`, `netbanking`,
`wallet`) used across community member transactions.

**Defined**: when $T' \geq 1$ and `payment_method` column is present.  
**NaN**: when $T' = 0$ or column absent.

---

#### `merchant_category_entropy`

$$H = -\sum_{k=1}^{K} p_k \log_2 p_k \quad \text{(bits)}$$

Shannon entropy of the merchant-category distribution across community member
transactions. $p_k$ = fraction of transactions at category $k$.

With 12 merchant categories, the theoretical maximum is $\log_2(12) \approx 3.58$ bits.
Returns 0.0 for a single unique category (deterministic distribution).

**Defined**: when $T' \geq 1$, `merchant_id` column present, and `merchant_df`
supplied with matching `merchant_id` → `category` rows.  
**NaN**: when any of the above conditions are unmet.

---

#### `total_transaction_amount`

$$\sum_{i=1}^{T'} \text{amount}_i$$

Sum of all transaction amounts for community member transactions.

**Defined**: when $T' \geq 1$.  
**NaN**: when $T' = 0$.

---

## Leakage Protections

The engine enforces two complementary leakage barriers:

### Runtime validation

`_validate_tx_df(tx_df)` raises `ValueError` if `tx_df` contains any column
from `FORBIDDEN_COLUMNS`:

| Forbidden column | Reason |
|---|---|
| `pattern_id` | Evaluation-only ground-truth fraud label |
| `is_ring_member` | Evaluation-only ground-truth fraud label |
| `link_type` | Enrichment-internal field; value `ring-shared` directly reveals ring membership |

### Source-level test

`tests/test_community_features.py::test_no_label_leakage_source_inspection`
reads `community_features.py` as a string and asserts:

- `pattern_id`, `is_ring_member`, `link_type` are never accessed via bracket
  notation on `tx_df` (the validation guard lists them, but only to reject them).
- Ring-specific id prefixes (`dev_ring`, `ins_ring`, `10.66.`) never appear
  in source (no id-prefix inspection).
- Evaluation file names (`fraud_cases`, `transactions_fraud`) never appear.

---

## Usage Example

```python
from pathlib import Path
import pandas as pd
from src.graph.builder import build_evidence_graph
from src.graph.projection import project_account_graph
from src.detection.communities import detect_communities, extract_account_activity
from src.features import compute_community_features

processed_dir = Path("data/processed/payment_network")

# Build graphs and detect communities (no fraud labels involved).
evidence = build_evidence_graph(processed_dir)
account_graph = project_account_graph(evidence)
activity = extract_account_activity(evidence)
communities = detect_communities(account_graph, seed=42, account_activity=activity)

# Load observable-only transactions (exclude evaluation columns).
tx_df = pd.read_csv(
    processed_dir / "enriched_transactions.csv",
    usecols=lambda c: c not in {"pattern_id", "is_ring_member"},
)
merchant_df = pd.read_csv(processed_dir / "merchants.csv")

# Compute features.
features = compute_community_features(communities, tx_df, merchant_df)
print(features.shape)       # (n_communities, 21)
print(features.head())
```

---

## NaN Summary Table

| Feature | NaN when |
|---|---|
| `mean_edge_weight` | No internal edges (singleton or no shared entities) |
| `temporal_overlap_mean` | No internal edges |
| `median_inter_transaction_gap_hours` | Fewer than 2 community transactions |
| `mean_tx_amount` | No matching transactions in tx_df |
| `amount_cv` | Fewer than 2 transactions, or mean = 0 |
| `declined_rate` | No transactions, or column absent |
| `unique_payment_methods` | No transactions, or column absent |
| `merchant_category_entropy` | No transactions, merchant_df absent, or no matching merchant ids |
| `total_transaction_amount` | No matching transactions in tx_df |

All other features are always defined (never NaN).
