# Community Detection Layer

This document describes TraceLine's community detection layer
(`src/detection/communities.py`), which runs Louvain over the weighted
account-relationship graph and enriches each detected community with
structural, evidence and temporal statistics.

## What it does

1. Converts the `AccountGraph` (from `src.graph.projection`) into a NetworkX
   graph with edge attribute `weight`.
2. Runs **NetworkX's Louvain implementation**
   (`nx.community.louvain_communities`) with a fixed `seed` and optional
   `resolution`.
3. Assigns stable community ids: raw partitions are re-ordered by their
   sorted member lists and numbered sequentially from zero.
4. Enriches every community with structural statistics, the original
   account-edge evidence, and temporal concentration metrics.

No fraud classification happens here: the layer only discovers structure.
Scoring/modeling is explicitly out of scope.

## The Community object

| Field | Meaning |
| --- | --- |
| `community_id` | Deterministic sequential id (sorted-member ordering) |
| `member_account_ids` | Sorted tuple of account ids |
| `member_count` | Number of accounts |
| `internal_edge_count` | Account edges with both endpoints inside |
| `total_internal_weight` | Sum of internal edge weights |
| `density` | `internal_edge_count / C(n, 2)`; 0.0 for singletons |
| `min_timestamp` / `max_timestamp` | First/last member transaction (None if no activity) |
| `duration_hours` | `max_timestamp - min_timestamp` in hours |
| `temporal_stats` | Temporal concentration bundle (below) |
| `internal_edges` | The original `AccountEdge` evidence objects, verbatim |

## Temporal concentration metrics

Computed from all transactions of member accounts (timestamps come from the
evidence graph via `extract_account_activity`; callers may also pass their own
activity map):

* **transaction_count** - number of distinct community-wide transaction
  timestamps.
* **unique_active_hours** - distinct clock hours (00-23).
* **median_inter_transaction_gap_hours** - median gap between consecutive
  timestamps; `None` when fewer than two exist.
* **timestamp_span_hours** - first-to-last span.
* **temporal_compression_score** = `count / (count + timestamp_span_hours)`

The compression score is bounded in `(0, 1]`: it approaches 1 when many
transactions are packed into a short window (a structurally tight community
that transacts in a burst) and falls toward 0 for activity spread over long
periods.

## Label-leakage prevention

Detection uses only observable account-graph evidence. Evaluation-only
label columns (`pattern_id`, `is_ring_member`) and fraud ground-truth files
(`fraud_cases.csv`, `transactions_fraud.csv`) are never read or referenced
anywhere in this module; a test scans the detector source for these tokens
and verifies that serialized communities carry none of them. No community is
labelled as fraudulent at this stage.

## Determinism

* The NetworkX graph is built from sorted node/edge lists.
* Louvain receives an explicit `seed`.
* Partition -> id assignment sorts members lexicographically, so ids are a
  pure function of (graph, seed, resolution).

Identical input therefore always produces identical output, verified by
tests including one that shuffles the edge insertion order.

## Small/isolated communities

Singletons and inactive communities are first-class results: density 0.0,
empty evidence tuples, and zero/`None` temporal fields instead of errors.
An edgeless graph degenerates safely to one singleton per account.

## Usage

```bash
# Real-data run with report:
python -m src.detection.communities --top 10 --seed 42
```

```python
from pathlib import Path
from src.graph.builder import build_evidence_graph
from src.graph.projection import project_account_graph
from src.detection.communities import (
    detect_communities, extract_account_activity, summarize_communities,
)

evidence = build_evidence_graph(Path("data/processed/payment_network"))
account_graph = project_account_graph(evidence)
activity = extract_account_activity(evidence)
communities = detect_communities(account_graph, seed=42, account_activity=activity)
print(summarize_communities(communities))
```

## Tests

```bash
python -m pytest tests/test_communities.py -v
```

Covers: hand-crafted community detection with exact statistics, isolated
accounts/edgeless graphs, deterministic output under reordering, exact
temporal compression values, and absence of evaluation-label access.

Out of scope: fraud classification (XGBoost/models), API/serving layers.
