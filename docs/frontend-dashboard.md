# TraceLine Investigator Dashboard

TraceLine is an explainable graph-based payment fraud intelligence dashboard built on **React 19**, **TypeScript**, **Vite**, and **Cytoscape.js**, communicating with a **FastAPI** REST backend.

---

## 1. System Architecture

```
                       ┌─────────────────────────────────────────┐
                       │     TraceLine React Investigator UI     │
                       │          (http://127.0.0.1:5173)         │
                       └────────────────────┬────────────────────┘
                                            │ Vite Proxy / Direct REST
                                            ▼
                       ┌─────────────────────────────────────────┐
                       │         FastAPI Intelligence API        │
                       │          (http://127.0.0.1:8000)         │
                       └────────────────────┬────────────────────┘
                                            │ Observable In-Memory Indices
                                            ▼
 ┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
 │ 50,000 Observable Accounts│  450,546 Transactions     │  59 Louvain Communities   │
 │ 2,617,094 Graph Edges     │  21 Observable Features   │  ML Risk Scorer (LR + RF) │
 └───────────────────────────┴───────────────────────────┴───────────────────────────┘
```

---

## 2. Security Design & Aesthetics

The UI adheres strictly to a **Dark Security Operations** aesthetic:
- **Palette**: Slate-950 obsidian background (`#080c14`), slate-900 card containers (`#0f172a`), subtle slate-800 borders (`#1e293b`).
- **Typography**: Inter for crisp UI hierarchy and JetBrains Mono for account IDs, transaction hashes, timestamps, and metric values.
- **Risk Indicator Tiers**:
  - 🔴 **HIGH (Score ≥ 60)**: Vivid coral red (`#ef4444`, `rgba(239, 68, 68, 0.15)`), active pulse badge.
  - 🟡 **MEDIUM (35 ≤ Score < 60)**: Warm amber (`#f59e0b`, `rgba(245, 158, 11, 0.15)`).
  - 🟢 **LOW (Score < 35)**: Emerald green (`#10b981`, `rgba(16, 185, 129, 0.15)`).
- **Strict Leakage Isolation**: The frontend exclusively uses observable network metrics, entity sharing features, and explainable ML risk scores. Ground-truth evaluation attributes (`pattern_id`, `is_ring_member`, `fraud_cases.csv`, `link_type`) are never exposed or rendered.

---

## 3. Application Routes & Workspaces

| Route | Workspace | Description |
| :--- | :--- | :--- |
| `/dashboard` (or `/`) | **Overview Dashboard** | Network KPIs (50k accounts, 450.5k transactions, 59 communities, 2.6M edges), risk distribution bar (17 HIGH / 13 MEDIUM / 29 LOW), and top flagged priority queue. |
| `/communities` | **Community Explorer** | Searchable, filterable, and sortable table of all 59 Louvain communities with density, mean weights, tx/member, and top signals. |
| `/communities/:communityId` | **Community Investigation Workspace** | Deep cluster inspection: risk score breakdown, *"Why is this community flagged?"* top signals, 4 feature family breakdown cards, member accounts table, interactive Cytoscape network graph, and chronological activity stream. |
| `/accounts` | **Account Lookup** | Quick search bar to look up any account profile by ID. |
| `/accounts/:accountId` | **Account Inspector** | Customer balance, creation date, assigned community context, financial statistics (sent/received/declined), transaction history table, and observable graph evidence connections. |
| `/transactions` | **Transaction Lookup** | Search bar to look up any transaction by ID. |
| `/transactions/:transactionId` | **Transaction Detail** | Complete transaction record: source/destination account cards, merchant catalog details, and digital footprint (device, payment instrument, IP address). |

---

## 4. How to Run Locally

### Start Backend (FastAPI):
```bash
python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```
*API Base: `http://127.0.0.1:8000/api` | Swagger: `http://127.0.0.1:8000/docs`*

### Start Frontend (Vite Dev Server):
```bash
cd frontend
npm install
npm run dev
```
*Frontend UI: `http://127.0.0.1:5173`*

### Build Production Bundle:
```bash
cd frontend
npm run build
```
