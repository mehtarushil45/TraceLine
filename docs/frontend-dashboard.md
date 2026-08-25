# TraceLine Investigator Dashboard & Case Management

TraceLine is an explainable graph-based payment fraud intelligence platform built on **React 19**, **TypeScript**, **Vite**, and **Cytoscape.js**, communicating with a **FastAPI** backend with local case triage and watchlist persistence.

---

## 1. System Architecture

```
                       ┌─────────────────────────────────────────┐
                       │     TraceLine React Investigator UI     │
                       │          (http://127.0.0.1:5173)         │
                       └──────────────┬──────────────────┬───────┘
                                      │                  │ LocalStorage Case Engine
                                      │                  ▼
                                      │       ┌──────────────────────────────┐
                                      │       │ Investigation Case & Targets │
                                      │       │ Open/Review/Closed Workflows │
                                      │       └──────────────────────────────┘
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

## 2. Risk Score & Anti-Leakage Calibration

- **Score Interpretation**: ML risk scores are displayed as `Risk Score: X/100` with the explicit subtitle:
  > *"Model risk score derived from observable network evidence"*
- **Strict Compliance**: The UI never describes scores as calibrated probabilities of fraud or likelihood of fraud.
- **Zero Leakage**: Ground-truth fields (`pattern_id`, `is_ring_member`, `link_type`, `fraud_cases.csv`, `community_labels.csv`, `fraud_purity`, `max_ring_coverage`) are never exposed or rendered.

---

## 3. Application Routes & Workspaces

| Route | Workspace | Description |
| :--- | :--- | :--- |
| `/dashboard` (or `/`) | **Overview Dashboard** | Network KPIs (50k accounts, 450.5k transactions, 59 communities, 2.6M edges), risk distribution bar (17 HIGH / 13 MEDIUM / 29 LOW), and top flagged priority queue. |
| `/communities` | **Community Explorer** | Searchable, filterable, and sortable table of all 59 Louvain communities with density, mean weights, tx/member, and top signals. |
| `/communities/:communityId` | **Community Investigation Workspace** | Flagged reasons, top 3 observable signals, 4 feature breakdown cards, member accounts, Cytoscape graph canvas, timeline stream, and `[ + Add to Investigation ]` action. |
| `/accounts/:accountId` | **Account Inspector** | Customer balance, creation date, assigned community context, transaction history, observable graph connections, and `[ + Add to Investigation ]` action. |
| `/transactions/:transactionId` | **Transaction Detail** | Complete transaction record, origin/destination cards, merchant details, digital footprint, and `[ + Add to Investigation ]` action. |
| `/investigations` | **Investigation Queue** | Case management dashboard with Open, Under Review, and Closed case counters, priority filters, case creation modal, and target badges. |
| `/investigations/:caseId` | **Case Detail & Watchlist** | Case title editor, Status workflow (`OPEN` → `REVIEW` → `CLOSED`), Priority selector (`HIGH`/`MEDIUM`/`LOW`), Investigator Notes editor, and attached Communities, Accounts, and Transactions. |

---

## 4. How to Run Locally

### Start Backend (FastAPI):
```bash
python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8000
```

### Start Frontend (Vite Dev Server):
```bash
cd frontend
npm install
npm run dev
```
*Frontend UI: `http://127.0.0.1:5173`*
