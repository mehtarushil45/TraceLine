# TraceLine Investigator API Documentation

**Version:** `1.0.0`  
**Base URL:** `http://localhost:8000/api`  
**Interactive Docs (Swagger UI):** `http://localhost:8000/docs`  
**Alternative Docs (ReDoc):** `http://localhost:8000/redoc`

---

## 1. Architecture Overview

The TraceLine API layer provides a high-performance, strictly observable RESTful interface designed to power the investigator dashboard frontend.

```
┌────────────────────────────────────────────────────────┐
│                   React Frontend / UI                  │
└───────────────────────────▲────────────────────────────┘
                            │ HTTP / JSON (CORS enabled)
┌───────────────────────────▼────────────────────────────┐
│                    FastAPI Layer                       │
│  src/api/routers/                                      │
│    ├── health.py        (System health & liveness)     │
│    ├── summary.py       (Network-wide metrics)         │
│    ├── communities.py   (Community list, detail, accts)│
│    ├── accounts.py      (Account profile, txs, conns)  │
│    ├── transactions.py  (Transaction inspection)       │
│    ├── graph.py         (Community topology for D3/viz)│
│    └── timeline.py      (Chronological activity stream)│
└───────────────────────────▲────────────────────────────┘
                            │ In-memory queries & indexing
┌───────────────────────────▼────────────────────────────┐
│                 TraceLineService Layer                 │
│  src/api/service.py                                    │
│  • In-memory indexing on server startup (<1s response) │
│  • Pydantic v2 schemas with strong typing              │
│  • Strict leakage prevention guard                     │
└───────────────────────────▲────────────────────────────┘
                            │ Observable Data Only
┌───────────────────────────▼────────────────────────────┐
│         data/processed/payment_network/ CSVs           │
│  (accounts, transactions, features, risk scores)       │
└────────────────────────────────────────────────────────┘
```

---

## 2. Strict Data-Leakage Protection

The TraceLine API strictly isolates observable evidence from evaluation ground truth.

### Guarantee:
- The API **NEVER exposes**:
  - `pattern_id`
  - `is_ring_member`
  - `fraud_cases.csv` contents
  - `link_type`
  - Ground-truth evaluation labels (`is_positive`, `fraud_purity`, `max_ring_coverage`, `primary_ring_id`)
- All endpoints return only **observable payment network evidence** and **ML risk scores** (`risk_score`, `risk_probability`, `risk_level`, `top_signal_1..3`).

---

## 3. Endpoints

### 3.1 Health & Summary

#### `GET /api/health`
Checks API status and server liveness.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-08-25T10:30:00Z"
}
```

---

#### `GET /api/summary`
Returns global network metrics, transaction volumes, and risk distribution.

**Response `200 OK`:**
```json
{
  "account_count": 50000,
  "transaction_count": 450546,
  "community_count": 59,
  "high_risk_count": 17,
  "medium_risk_count": 13,
  "low_risk_count": 29,
  "graph_edge_count": 2617094
}
```

---

### 3.2 Communities

#### `GET /api/communities`
Returns all 59 detected Louvain communities sorted by `risk_score` descending.

**Response `200 OK`:**
```json
{
  "total": 59,
  "items": [
    {
      "community_id": 3,
      "member_count": 1231,
      "risk_score": 92,
      "risk_probability": 0.9207,
      "risk_level": "HIGH",
      "top_signal_1": "high payment-instrument sharing ratio",
      "top_signal_2": "high evidence weight per member",
      "top_signal_3": "elevated transaction declined rate",
      "density": 0.012543,
      "mean_edge_weight": 3.7541,
      "tx_per_member": 17.82,
      "total_transaction_amount": 20451230.5
    }
  ]
}
```

---

#### `GET /api/communities/{community_id}`
Returns comprehensive metrics, observable features, and risk breakdown for a single community.

**Parameters:**
- `community_id` (path, int, required): Unique community ID (e.g. `3`).

**Response `200 OK`:**
```json
{
  "community_id": 3,
  "member_count": 1231,
  "risk_score": 92,
  "risk_probability": 0.9207,
  "risk_level": "HIGH",
  "top_signal_1": "high payment-instrument sharing ratio",
  "top_signal_2": "high evidence weight per member",
  "top_signal_3": "elevated transaction declined rate",
  "features": {
    "member_count": 1231.0,
    "density": 0.012543,
    "mean_edge_weight": 3.7541,
    "weight_per_member": 31.42,
    "unique_shared_instruments": 4.0,
    "unique_shared_devices": 9.0,
    "unique_shared_ips": 31.0,
    "unique_shared_merchants": 612.0,
    "instrument_sharing_ratio": 0.00325,
    "device_sharing_ratio": 0.00731,
    "temporal_compression_score": 0.912,
    "unique_active_hours": 24.0,
    "median_inter_transaction_gap_hours": 0.0542,
    "tx_per_member": 17.82,
    "temporal_overlap_mean": 3.84,
    "mean_tx_amount": 932.14,
    "amount_cv": 2.54,
    "declined_rate": 0.038,
    "unique_payment_methods": 4.0,
    "merchant_category_entropy": 3.56,
    "total_transaction_amount": 20451230.5
  },
  "density": 0.012543,
  "mean_edge_weight": 3.7541,
  "total_internal_weight": 38678.02,
  "internal_edge_count": 9492,
  "transaction_statistics": {
    "total_transaction_amount": 20451230.5,
    "mean_tx_amount": 932.14,
    "amount_cv": 2.54,
    "declined_rate": 0.038,
    "tx_per_member": 17.82,
    "unique_payment_methods": 4.0,
    "merchant_category_entropy": 3.56
  },
  "temporal_statistics": {
    "temporal_compression_score": 0.912,
    "unique_active_hours": 24.0,
    "median_inter_transaction_gap_hours": 0.0542,
    "timestamp_span_hours": null,
    "min_timestamp": null,
    "max_timestamp": null
  },
  "entity_sharing": {
    "unique_shared_instruments": 4.0,
    "unique_shared_devices": 9.0,
    "unique_shared_ips": 31.0,
    "unique_shared_merchants": 612.0,
    "instrument_sharing_ratio": 0.00325,
    "device_sharing_ratio": 0.00731
  }
}
```

**Errors:**
- `404 Not Found`: If `community_id` is invalid or out of range.

---

#### `GET /api/communities/{community_id}/accounts`
Returns a paginated list of member accounts in the specified community.

**Parameters:**
- `community_id` (path, int, required)
- `page` (query, int, default: `1`): Page number (1-indexed).
- `page_size` (query, int, default: `50`, max: `100`): Items per page.

**Response `200 OK`:**
```json
{
  "community_id": 3,
  "total": 1231,
  "page": 1,
  "page_size": 50,
  "total_pages": 25,
  "items": [
    {
      "account_id": "acc_00014",
      "customer_name": "Eleanor Vance",
      "balance": 4821.5,
      "account_risk_score": 72,
      "creation_date": "2023-01-15",
      "community_id": 3
    }
  ]
}
```

---

### 3.3 Accounts

#### `GET /api/accounts/{account_id}`
Returns account profile, assigned community context, and activity metrics.

**Parameters:**
- `account_id` (path, str, required): e.g. `acc_00014`.

**Response `200 OK`:**
```json
{
  "account_id": "acc_00014",
  "customer_name": "Eleanor Vance",
  "balance": 4821.5,
  "account_risk_score": 72,
  "creation_date": "2023-01-15",
  "community_id": 3,
  "community_risk_score": 92,
  "community_risk_level": "HIGH",
  "connected_account_count": 8,
  "transaction_statistics": {
    "sent_count": 12,
    "received_count": 7,
    "total_count": 19,
    "total_amount_sent": 14250.0,
    "total_amount_received": 8100.0,
    "declined_count": 1
  }
}
```

**Errors:**
- `404 Not Found`: If `account_id` does not exist.

---

#### `GET /api/accounts/{account_id}/transactions`
Returns paginated transaction history for an account.

**Parameters:**
- `account_id` (path, str, required)
- `page` (query, int, default: `1`)
- `page_size` (query, int, default: `50`, max: `100`)
- `direction` (query, str, default: `"all"`): `"all"`, `"sent"`, or `"received"`.

**Response `200 OK`:**
```json
{
  "account_id": "acc_00014",
  "total": 19,
  "page": 1,
  "page_size": 50,
  "total_pages": 1,
  "items": [
    {
      "transaction_id": "tx_0008412",
      "timestamp": "2024-03-12T14:22:10",
      "amount": 1250.0,
      "src_account_id": "acc_00014",
      "dst_account_id": "acc_00891",
      "merchant_id": "mch_0142",
      "device_id": "dev_04192",
      "payment_instrument_id": "ins_08129",
      "ip_address": "192.168.1.10",
      "payment_method": "card",
      "account_age_days": 421,
      "transaction_status": "settled"
    }
  ]
}
```

---

#### `GET /api/accounts/{account_id}/connections`
Returns graph connections and shared evidence linking this account to other accounts.

**Parameters:**
- `account_id` (path, str, required)

**Response `200 OK`:**
```json
{
  "account_id": "acc_00014",
  "total_connections": 2,
  "connections": [
    {
      "connected_account_id": "acc_00891",
      "edge_weight": 4.5,
      "shared_devices": ["dev_04192"],
      "shared_payment_instruments": ["ins_08129"],
      "shared_ips": ["192.168.1.10"],
      "shared_merchants": ["mch_0142", "mch_0812"],
      "temporal_overlap": 3
    }
  ]
}
```

---

### 3.4 Transactions

#### `GET /api/transactions/{transaction_id}`
Returns details for a specific transaction with merchant catalog enrichment.

**Parameters:**
- `transaction_id` (path, str, required): e.g. `tx_0008412`.

**Response `200 OK`:**
```json
{
  "transaction_id": "tx_0008412",
  "timestamp": "2024-03-12T14:22:10",
  "amount": 1250.0,
  "src_account_id": "acc_00014",
  "dst_account_id": "acc_00891",
  "merchant_id": "mch_0142",
  "merchant_name": "Apex Electronics",
  "merchant_category": "electronics",
  "device_id": "dev_04192",
  "payment_instrument_id": "ins_08129",
  "ip_address": "192.168.1.10",
  "payment_method": "card",
  "account_age_days": 421,
  "transaction_status": "settled"
}
```

---

### 3.5 Graph & Timeline

#### `GET /api/graph/community/{community_id}`
Returns nodes and edges formatted for frontend network visualizers (D3, Cytoscape, Vis.js).

**Parameters:**
- `community_id` (path, int, required)
- `max_nodes` (query, int, default: `200`, max: `1000`): Maximum nodes to return.
- `max_edges` (query, int, default: `500`, max: `2000`): Maximum edges to return.

**Response `200 OK`:**
```json
{
  "community_id": 3,
  "total_nodes": 1231,
  "total_edges": 9492,
  "nodes": [
    {
      "id": "acc_00014",
      "label": "Eleanor Vance",
      "customer_name": "Eleanor Vance",
      "balance": 4821.5,
      "degree": 8
    }
  ],
  "edges": [
    {
      "source": "acc_00014",
      "target": "acc_00891",
      "weight": 4.5,
      "shared_instruments": ["ins_08129"],
      "shared_devices": ["dev_04192"],
      "shared_ips": ["192.168.1.10"],
      "shared_merchants": ["mch_0142"],
      "temporal_overlap": 3
    }
  ]
}
```

---

#### `GET /api/timeline/community/{community_id}`
Returns chronological transaction events for accounts in the community.

**Parameters:**
- `community_id` (path, int, required)
- `limit` (query, int, default: `100`, max: `1000`)
- `offset` (query, int, default: `0`)

**Response `200 OK`:**
```json
{
  "community_id": 3,
  "total_events": 21940,
  "events": [
    {
      "transaction_id": "tx_0000012",
      "timestamp": "2024-01-01T08:15:00",
      "src_account_id": "acc_00014",
      "dst_account_id": "acc_00891",
      "amount": 250.0,
      "transaction_status": "settled",
      "merchant_id": "mch_0012",
      "payment_method": "card"
    }
  ]
}
```

---

## 4. Running the API Locally

### Start Development Server:
```bash
uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

### Access Points:
- **API Root:** `http://localhost:8000/api`
- **Interactive Swagger UI:** `http://localhost:8000/docs`
- **ReDoc UI:** `http://localhost:8000/redoc`
- **OpenAPI Schema JSON:** `http://localhost:8000/openapi.json`
