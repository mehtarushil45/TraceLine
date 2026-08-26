# TraceLine Evidence Intelligence Engine

## Overview

The Evidence Intelligence Engine (`src/intelligence/`) provides deterministic, observable-only evidence analysis for communities and accounts in the TraceLine payment network. It answers:

> **"WHY is this entity worth investigating?"**

rather than merely:

> **"WHAT is its risk score?"**

---

## Evidence Score vs. Risk Score

These are **two entirely separate metrics** and must never be conflated:

| Metric | Source | Nature |
|---|---|---|
| `risk_score` | ML ensemble (logistic regression + random forest) | Probabilistic, model-learned |
| `evidence_score` | Deterministic observable rules | Rule-based, fully explainable |

The evidence score is **not** a probability of fraud. It is an aggregate weight of observable patterns that an investigator should consider when prioritizing review.

---

## Architecture

### Data Flow

```
TraceLineService (in-memory)
    ├── transactions_df
    ├── community_to_accounts
    ├── account_connections_map     ← shared instruments/devices/IPs/merchants
    ├── community_edges_map
    └── community_features_df
           │
           ▼
    EvidenceEngine
           │
    9 Detectors → List[EvidenceItem]
           │
    sort_evidence() → deterministic ordering
           │
    compute_evidence_score() → int [0, 100]
           │
    CommunityEvidenceSummary / AccountEvidenceSummary
           │
    FastAPI Response (JSON)
```

### Key Design Principles

1. **No new I/O** — all data is already indexed in `TraceLineService`
2. **Inverted-index patterns** — no O(N²) scans
3. **Deterministic** — same input always produces byte-identical output
4. **Leakage-free** — never imports `src.evaluation`, never reads `fraud_cases.csv` or `community_labels.csv`

---

## Leakage Contract

The following fields **never appear** in any evidence output:

```
pattern_id        is_ring_member      link_type
fraud_purity      max_ring_coverage   primary_ring_id
is_positive       fraud_account_count fraud_cases
```

---

## Evidence Detectors

### A. SHARED_INSTRUMENT_CONCENTRATION

Detects payment instruments reused across multiple accounts.

**Input:** `account_connections_map → shared_payment_instruments`  
**Thresholds (heuristic, not calibrated):**

| Severity | Condition |
|---|---|
| HIGH | ≥ 5 accounts share one instrument |
| MEDIUM | ≥ 3 accounts share one instrument |
| LOW | ≥ 2 accounts share one instrument |

**Example description:**
> "Payment instrument instr_X is used by 7 accounts within this community. Shared payment credentials across distinct customer profiles represent observable infrastructure overlap."

---

### B. DEVICE_REUSE

Detects hardware device fingerprints shared across multiple accounts.

**Input:** `account_connections_map → shared_devices`  
**Thresholds:**

| Severity | Condition |
|---|---|
| HIGH | ≥ 5 accounts share one device |
| MEDIUM | ≥ 3 accounts share one device |
| LOW | ≥ 2 accounts share one device |

---

### C. IP_CONCENTRATION

Detects IP addresses associated with many accounts. Higher thresholds than device/instrument sharing because IP sharing is a weaker signal (VPNs, NAT, corporate networks can legitimately share IPs).

**Input:** `account_connections_map → shared_ips`  
**Thresholds:**

| Severity | Condition |
|---|---|
| HIGH | ≥ 8 accounts share one IP |
| MEDIUM | ≥ 4 accounts share one IP |
| LOW | ≥ 2 accounts share one IP |

---

### D. TEMPORAL_BURST

Detects unusually dense transaction activity within short time windows using a sliding window algorithm.

**Input:** `transactions_df` — community member transactions only  
**Algorithm:** Two-pointer O(N) sliding window on sorted timestamps  
**Windows:**

| Window | Severity Thresholds |
|---|---|
| 60-minute window | HIGH ≥ 15 tx, MEDIUM ≥ 8 tx |
| 24-hour window (fallback) | LOW ≥ 4 tx (only if no 60-min evidence) |

**Metrics returned:** `transaction_count`, `window_minutes/hours`, `start_timestamp`, `end_timestamp`

---

### E. RAPID_INTERACTION

Detects unusually small inter-transaction gaps. Complements TEMPORAL_BURST by measuring the typical pace, not just peak density.

**Input:** `transactions_df` — sorted timestamps  
**Algorithm:** Compute all consecutive gaps, return median  
**Thresholds:**

| Severity | Condition |
|---|---|
| HIGH | Median gap < 0.5 hours |
| MEDIUM | Median gap < 2.0 hours |
| LOW | Median gap < 6.0 hours |

**Metrics returned:** `median_gap_hours`, `transaction_count`, `min_gap_hours`, `max_gap_hours`

---

### F. MERCHANT_TEMPORAL_OVERLAP

Detects merchants visited by many accounts in the same community. Uses the same temporal-safe (merchant-day) co-occurrence logic established in `projection.py` — the `shared_merchants` field in connection data already captures this constraint.

**Input:** `account_connections_map → shared_merchants`  
**Thresholds:**

| Severity | Condition |
|---|---|
| HIGH | ≥ 6 accounts at same merchant |
| MEDIUM | ≥ 3 accounts at same merchant |
| LOW | ≥ 2 accounts at same merchant |

---

### G. HIGH_EVIDENCE_DENSITY

Detects communities with high observable relationship evidence concentration using pre-computed community features.

**Input:** `community_features_df → weight_per_member, mean_edge_weight, density`  
**Thresholds:**

| Severity | Condition |
|---|---|
| HIGH | `weight_per_member` > 10.0 |
| MEDIUM | `weight_per_member` > 3.0 |
| LOW | `weight_per_member` > 0.5 |

---

### H. HUB_ACCOUNT

Detects accounts with unusually high graph degree relative to other community members.

**Input:** `community_edges_map` — per-community edges  
**Algorithm:** Compute all member degrees, calculate percentiles using NumPy  
**Thresholds:**

| Severity | Condition |
|---|---|
| HIGH | degree ≥ 95th percentile **AND** degree ≥ 10 |
| MEDIUM | degree ≥ 75th percentile **AND** degree ≥ 5 |
| LOW | degree ≥ 50th percentile **AND** degree ≥ 3 |

**Metrics returned:** `degree`, `percentile_rank`, `community_p50`, `community_p75`, `community_p95`

---

### I. MULTI_LAYER_EVIDENCE

Detects account pairs where multiple independent evidence dimensions simultaneously converge. This is typically the strongest observable evidence because it requires coincidental agreement across independent data sources.

**Input:** `account_connections_map` — all four sharing fields  
**Algorithm:** For each community-member account pair, count non-zero evidence dimensions (instruments, devices, IPs, merchants)  
**Thresholds:**

| Severity | Condition |
|---|---|
| HIGH | ≥ 3 evidence dimensions converge |
| MEDIUM | ≥ 2 evidence dimensions converge |

**Example description:**
> "Accounts acc_100 and acc_200 share 3 independent observable evidence dimensions simultaneously: devices, ips, instruments. When multiple distinct infrastructure signals — such as shared hardware, shared payment credentials, and shared network origin — all converge on the same account pair, this represents particularly strong observable relationship evidence."

---

## Evidence Score Calculation

```python
evidence_score = min(100, sum(item.score_contribution for item in items))
```

Score contributions per severity:

| Severity | Points |
|---|---|
| HIGH | 25 |
| MEDIUM | 12 |
| LOW | 5 |

Maximum evidence score: **100**.

---

## Sort Order

Evidence items are always sorted:
1. Severity: HIGH → MEDIUM → LOW
2. Within tier: `score_contribution` descending
3. Tie-break: `evidence_id` alphabetical (deterministic)

---

## API Endpoints

### GET /api/communities/{id}/evidence

```json
{
  "community_id": 3,
  "evidence_score": 87,
  "evidence_count": 7,
  "high_count": 3,
  "medium_count": 3,
  "low_count": 1,
  "items": [
    {
      "evidence_id": "ev_a1b2c3d4e5f6",
      "entity_type": "COMMUNITY",
      "entity_id": "3",
      "type": "MULTI_LAYER_EVIDENCE",
      "severity": "HIGH",
      "title": "Multi-layer evidence: 3 independent signals converge on acc_100 ↔ acc_200",
      "description": "...",
      "score_contribution": 25.0,
      "observed_at": null,
      "supporting_entities": ["acc_100", "acc_200"],
      "metrics": {
        "account_a": "acc_100",
        "account_b": "acc_200",
        "layer_count": 3,
        "dimensions": {"instruments": 2, "devices": 1, "ips": 3},
        "layer_names": ["devices", "instruments", "ips"]
      }
    }
  ],
  "runtime_ms": 24.5
}
```

### GET /api/accounts/{id}/evidence

Same structure but with `account_id` and `community_id` fields.

---

## EvidenceItem Schema

```python
@dataclass
class EvidenceItem:
    evidence_id: str          # SHA-1 deterministic identifier: "ev_" + 12 hex chars
    entity_type: str          # "COMMUNITY" or "ACCOUNT"
    entity_id: str            # community_id (str) or account_id
    type: str                 # EvidenceType value
    severity: str             # "HIGH" | "MEDIUM" | "LOW"
    title: str                # Short investigator-facing title
    description: str          # Full natural-language explanation
    score_contribution: float # Points added to evidence_score
    observed_at: Optional[str] # ISO 8601 timestamp or None
    supporting_entities: List[str]  # Sorted entity IDs
    metrics: Dict[str, Any]   # Observable measurement values only
```

### Deterministic evidence_id

```python
def make_evidence_id(entity_type, entity_id, ev_type, subkey=""):
    raw = f"{entity_type}:{entity_id}:{ev_type}:{subkey}"
    return "ev_" + sha1(raw.encode()).hexdigest()[:12]
```

---

## Investigator Language

The engine strictly avoids:

- "confirmed fraud"
- "fraudster"
- "this account is fraudulent"
- "probability of fraud"

It uses:

- "observable evidence"
- "requires investigator review"
- "risk indicator"
- "suspicious"
- "shared infrastructure evidence"
- "relationship evidence"

---

## Performance

Against the full dataset (50,000 accounts, 450,546 transactions, 2,617,094 edges):

- Community evidence extraction: **< 50ms** per community
- Account evidence extraction: **< 10ms** per account

All detectors use inverted-index patterns (entity → accounts) rather than O(N²) all-pairs scans. Community-scoped detectors only iterate accounts in the target community.

---

## Files

```
src/intelligence/
    __init__.py           — Package exports
    evidence_rules.py     — EvidenceItem, EvidenceSeverity, EvidenceType,
                            classify_* helpers, sort_evidence, compute_evidence_score
    evidence_engine.py    — EvidenceEngine class, 9 detector functions,
                            CommunityEvidenceSummary, AccountEvidenceSummary

tests/
    test_evidence_engine.py — 15 test groups, 83 tests

src/api/
    schemas.py            — EvidenceItemSchema, CommunityEvidenceResponse,
                            AccountEvidenceResponse (Pydantic models)
    service.py            — get_community_evidence(), get_account_evidence()
    routers/
        communities.py    — GET /api/communities/{id}/evidence
        accounts.py       — GET /api/accounts/{id}/evidence

frontend/src/
    types/api.ts          — EvidenceItem, CommunityEvidenceResponse,
                            AccountEvidenceResponse TypeScript types
    api/communities.ts    — getCommunityEvidence()
    api/accounts.ts       — getAccountEvidence()
    components/community/
        EvidenceIntelligencePanel.tsx  — React component replacing EvidencePanel
    pages/
        CommunityDetailPage.tsx  — Wired to EvidenceIntelligencePanel
```
