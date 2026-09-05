# TRACELINE

> **From risk signal to evidence-driven investigation.**

Submitted to **Razorpay AI Buildathon 2026 — Track 02 (AI Risk Manager)**.  
Repository: [https://github.com/mehtarushil45/TraceLine](https://github.com/mehtarushil45/TraceLine)  
🎬 **Demo Video**: [Watch the TraceLine End-to-End Walkthrough](https://drive.google.com/file/d/1SQOWNwXBkjDBwcQs4EttCpGgnNttrtdh/view?usp=drive_link)

---

## 1. Executive Summary

### The Problem
**Transaction-level risk scores alone are insufficient when coordinated fraud spans accounts, devices, instruments, IPs, merchants, transactions, and time.**

Modern payment gateways excel at evaluating transactions in isolation: checking card velocity, IP geolocation mismatches, or device anomalies in single-digit milliseconds. However, coordinated payment fraud rings—such as synthetic identity syndicates, card-testing rings, and money mule clusters—deliberately engineer every individual transaction to appear benign and pass point-in-time rules. 

An account executing two $45 transactions at standard retail merchants triggers zero alerts. Only when graph projection links that account to 8 other accounts sharing a single physical device hash and payment instrument within a compressed window does the coordinated syndicate emerge.

### Product Workflow
```
[Risk Queue]
      │ Prioritize communities by statistical triage score
      ▼
[Communities]
      │ Discover unsupervised topological fraud rings (Louvain)
      ▼
[Community Triage]
      │ Review convergent evidence signals & peer context
      ▼
[Forensic Workspace]
      │ Investigate via 5 relationship lenses, money flow & timeline
      ▼
[Accounts / Transactions]
      │ Drill down into exact observable entities & ledger rows
      ▼
[Decision]
      │ Record investigator formal disposition & rationale
      ▼
[SAR]
      │ Prepare regulatory Suspicious Activity Report draft
      ▼
[Formal Investigation Dossier]
      │ Immutable audit trail, evidence hashes & data lineage
```

### Key Product Differentiation
| Product Layer | Role in TraceLine | Why It Matters |
| :--- | :--- | :--- |
| **ML Risk Score** | **Prioritization** | Orders investigator triage queues so high-probability syndicates are reviewed first. Never acts as an autonomous judge. |
| **Deterministic Evidence** | **Observable Explanation** | 9 rule-based forensic detectors grounded strictly in raw CSV records (SHA-1 hashed, mathematically zero hallucination). |
| **Graph Intelligence** | **Relationship Investigation** | Bipartite graph projection and Louvain modularity reveal hidden collusive topologies without requiring fraud labels. |
| **Forensic Workspace** | **Deep Investigation** | Interactive SOC workbench featuring 5 lenses (Relationship, Flow of Funds, Shared Infrastructure, Temporal, Community). |
| **Decision + Dossier** | **Accountable Action** | Enforces investigator sign-off, case audit criteria, immutable snapshots, and regulatory SAR generation. |

---

## 2. "Why This Is Not Just a Risk Score"

### A high number is not a conclusion.

In compliance, legal proceedings, and financial risk operations, an investigator cannot submit a raw probability or an unexplainable model score to FinCEN, the RBI, or a judicial court. A probability score of `0.92` tells an investigator *where to look*, but it cannot explain *what happened*, *who was involved*, or *what evidence supports the finding*.

TraceLine strictly separates five distinct layers of analysis:

1. **Statistical Risk Prioritization**: Where machine learning ranks community volume based on observable topological and temporal feature anomalies.
2. **Observable Evidence**: Factual, deterministic rule triggers backed directly by timestamped raw ledger records, device fingerprints, and payment instruments.
3. **Network Context**: Topological graph structure exposing exact multi-hop connections, intermediary money mules, and primary hub accounts.
4. **Alternative Explanations**: Systematic hypothesis testing (e.g., evaluating shared corporate payment tokens or common payroll infrastructure versus deliberate collusive fraud).
5. **Investigator Judgment**: Human-in-the-loop formal decision-making, mandatory rationale capture, and accountability for adverse operational actions.

---

## 3. Why TraceLine Fits the Judging Criteria

### 1. Problem Taste
Coordinated payment fraud rings exploit a structural blind spot in modern payments infrastructure: evaluating transactions in isolation. TraceLine attacks the real, high-stakes operational problem faced by payment gateways, fintechs, and card networks—detecting and resolving coordinated multi-account syndicates before chargeback cascades occur—without requiring million-dollar enterprise software suites.

### 2. Build Quality
TraceLine is a production-grade, end-to-end operational software platform verified by **315 automated tests** (298 backend tests + 17 frontend tests):
- **Deterministic Pipeline**: Multi-entity bipartite projection, Louvain community detection (`seed=42`), and strict Pydantic v2 data models.
- **Enterprise Frontend Architecture**: Code-split React 19 SPA (initial shell 237 KB / 73 KB gzipped) with SWR client caching (<0.5ms instant re-hydration) and Cytoscape force-directed graph canvas.
- **Tested Zero-Leakage**: Source-code AST inspection tests verify that runtime scoring never accesses ground-truth evaluation labels.

### 3. AI Judgment
TraceLine enforces a principled, deliberate separation between statistical machine learning and deterministic evidence:
- **ML for Prioritization**: L2-penalized Logistic Regression trained on 21 observable features solely to rank review queues without autonomous black-box verdicts.
- **Deterministic Rules for Evidence**: 9 auditable forensic detectors producing SHA-1-hashed findings linked directly to raw ledger records.
- **Zero Generative LLM in the Evidence Path**: Eliminates non-deterministic prompt drift, hallucinated transactions, and legally indefensible regulatory filings.
- **Small-Sample Statistical Honesty**: Cross-validation via `RepeatedStratifiedKFold` (10 folds × 10 repeats = 100 experiments) with automated stability warning alerts (`std_roc_auc > 0.15`).

### 4. Failure Recovery
Demonstrated engineering ownership: we identified three major system failures during development, traced the root causes to their fundamental contracts, implemented robust structural fixes, and verified regression prevention across automated test suites.

---

## 4. Failure Recovery — What Broke and How We Got Out

For complete engineering incident logs, code diffs, and verification benchmarks, see [docs/failure-recovery.md](docs/failure-recovery.md).

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           THREE REAL INCIDENTS RESOLVED                       │
├────────────────────────┬─────────────────────────────┬────────────────────────┤
│ 1. API Contract Break  │ 2. Graph Focal Truncation   │ 3. 59-Request Stampede │
│ DataFrame NaN types    │ 500-edge cap dropped 43/56  │ Unthrottled fan-out    │
│ broke Pydantic models. │ edges of focal accounts.    │ choked backend server. │
│ Fixed with boundary    │ Fixed via focal edge        │ Fixed via in-memory    │
│ sanitization helper.   │ priority & slice tracking.  │ cache & SWR hydration. │
└────────────────────────┴─────────────────────────────┴────────────────────────┘
```

### Incident 1: API Service Contract Mismatch & DataFrame Serialization Failures
- **What Broke**: Community detail, accounts, and graph API endpoints threw unhandled HTTP 500 errors and Pydantic validation exceptions during integration testing.
- **What We Observed**: FastAPI logs reported `ValidationError` on numeric fields; raw Pandas extractions passed NumPy `np.nan` and non-standard float scalars where JSON-compliant `float | None` was required.
- **Root Cause**: Missing boundary sanitization between internal Pandas DataFrames and Pydantic v2 response schemas.
- **What Changed**: Implemented `_sanitize_float()` helper in `src/api/service.py` to normalize all numeric extractions, explicitly typed nullable floats in `src/api/schemas.py`, and added defensive `.get()` lookups.
- **How We Verified the Fix**: Executed `pytest tests/test_api.py tests/test_forensic_semantics.py -v` (24/24 passed).
- **What We Learned**: Data science pipelines must never pass raw DataFrame types directly across API boundaries without an explicit sanitization and validation layer.

### Incident 2: Forensic Graph Focal Edge Truncation & Stale Slice Sticking
- **What Broke**: Navigating from Accounts to Network (Relationship lens) caused focal accounts (e.g. `acc_44140`) to display only 13 edges, despite the accounts card stating "56 links" and the evidence citing 56 connections. Furthermore, switching accounts in the table reused stale graph slices.
- **What We Observed**: A critical contradiction in the UI: the Investigative Thread panel stated "acc_44140 has 13 directly observed relationships" while the evidence card stated "56 links". In addition, Cytoscape nodes jumped unpredictably on every mount.
- **Root Cause**: In `service.py`, `get_community_graph` broke edge collection at `max_edges=500` before reaching the remaining 43 edges of `acc_44140` in the 9,690-edge partition. In `ForensicWorkspacePage.tsx`, the client check `graphData.nodes.some(n => n.id === focusParam)` evaluated to `true` for top hubs, blocking the refetch of the focal-specific neighborhood. Additionally, Cytoscape ran with `randomize: true`.
- **What Changed**:
  1. In `service.py`, partitioned edges to prioritize ALL focal account edges before filling remaining capacity with top community edges.
  2. Deterministically sorted nodes (focal first, then degree, balance, ID) and edges.
  3. In `ForensicWorkspacePage.tsx`, introduced `loadedGraphFocal` state tracking to guarantee focal-tailored graph hydration.
  4. In `NetworkGraph.tsx`, set `randomize: false` in `coseOpts`.
- **How We Verified the Fix**: Automated script confirmed that `acc_44140` returns exactly 56 edges (100% link recovery), `acc_21371` returns 22 edges, and `acc_43865` returns 25 edges; all 17 frontend semantic tests and 24 backend tests passed.
- **What We Learned**: Graph sampling must never truncate ego-network edges of the active investigation subject; financial SOC analysts require 100% deterministic layout coordinates.

### Incident 3: The 59-Request Stampede & Destructive Route State Teardown
- **What Broke**: Initial website load was slow (>1MB bundle) and navigating between Dashboard and Communities fired an unthrottled burst of 59 concurrent requests to `/api/communities/{id}/evidence`, exhausting backend workers and stalling page transitions; returning to a page caused full data refetches with flashing empty skeletons.
- **What We Observed**: Browser network tab stalled under 59 parallel HTTP requests taking 0.5–1.5s each. React Router unmounted components on navigation, resetting `useState(true)` and triggering blank screens on return.
- **Root Cause**: Both `DashboardPage` and `CommunitiesPage` executed unthrottled `Promise.all` loops over all 59 communities; `loadData` had `summary` in its dependency array causing immediate duplicate fetch cycles; Cytoscape visualization library was bundled into the initial shell.
- **What Changed**:
  1. Added server-side in-memory caching and startup pre-warming in `service.py` (<0.5ms hit time).
  2. Limited client hydration to top priority items; eliminated duplicate fetch dependency loops.
  3. Implemented SWR client cache with synchronous hydration on mount (`loading: false` if cached), rendering previously visited pages at **0ms with zero skeleton flicker**.
  4. Code-split all routes with `React.lazy` to isolate heavy visualization chunks.
  5. Implemented per-route scroll restoration in `Layout.tsx`.
- **How We Verified the Fix**: Initial shell bundle dropped from >1MB to 237KB (73KB gzipped); cached API responses returned in <0.5ms; zero skeleton flicker on page return; frontend production build succeeded in 962ms.
- **What We Learned**: High-density SOC platforms require anticipatory prefetching and synchronous cache re-hydration; unbounded client concurrency will saturate single-worker backend servers.

---

## 5. Technical Architecture

The runtime dependency flow is strictly directed, acyclic, and governed by zero-leakage contracts:

```
┌────────────────────────────────────────────────────────────────────────┐
│               RAW PAYMENT STREAMS & ENTITY INGESTION                   │
│   450,546 enriched transactions · 50,000 accounts                      │
│   src/data/entities.py            src/data/enrichment.py               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    BIPARTITE GRAPH & PROJECTION                        │
│   Bipartite Graph (Accounts ↔ Devices, IPs, Instruments, Merchants)    │
│   src/graph/builder.py  ──►  src/graph/projection.py                   │
│   382,907 projected account-to-account weighted edges                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   UNSUPERVISED COMMUNITY DETECTION                     │
│   src/detection/communities.py (Louvain Modularity, seed=42)           │
│   59 discrete topological communities (zero fraud labels consumed)     │
└───────────┬────────────────────────────────────────────────┬───────────┘
            │                                                │
            ▼                                                ▼
┌───────────────────────────────────────┐   ┌────────────────────────────┐
│         FEATURE EXTRACTION            │   │ EVIDENCE INTELLIGENCE      │
│   src/features/community_features.py  │   │   src/intelligence/        │
│   21 Observable Features              │   │   - evidence_engine.py     │
│   (Strict: FORBIDDEN_COLUMNS Guard)   │   │   - evidence_rules.py      │
└───────────────────┬───────────────────┘   │   9 Deterministic Detectors│
                    │                       │   Auditable Score [0-100]  │
                    ▼                       │   SHA-1 Fingerprint Hashes │
┌───────────────────────────────────────┐   └─────────────┬──────────────┘
│         MACHINE LEARNING TRIAGE       │                 │
│   src/ml/risk_scorer.py               │                 │
│   StandardScaler + L2 Logistic Reg    │                 │
│   RepeatedStratifiedKFold (10x10)     │                 │
│   Triage Risk Score [0-100]           │                 │
└───────────────────┬───────────────────┘                 │
                    │                                     │
                    └───────────────────┬─────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          FASTAPI REST SERVICE                          │
│   src/api/service.py (In-Memory Prewarmed Cache, < 0.5ms response)     │
│   src/api/routers/ (communities, accounts, graph, timeline, health)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    FORENSIC SOC INVESTIGATION WORKSPACE                │
│   React 19 + TypeScript + Cytoscape Force-Directed Graph               │
│   frontend/src/pages/ForensicWorkspacePage.tsx                         │
│   frontend/src/components/graph/NetworkGraph.tsx (5 Lenses)            │
│   frontend/src/components/investigation/ (Storyline, Hypotheses)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     DECISION & CASE DOSSIER LAYER                      │
│   Formal Disposition (Escalate SAR / Monitor / Cleared / False Pos)   │
│   Audit Readiness Verification & Immutable SAR Export                  │
└────────────────────────────────────────────────────────────────────────┘

[OFFLINE EVALUATION LAYER (Completely Decoupled)]:
  src/evaluation/labeler.py (Ground-Truth Jaccard Ring Coverage Matching)
  Evaluated only during offline benchmarking; never imported by runtime.
```

---

## 6. Investigation Workflow Walkthrough

Here is the exact step-by-step workflow an investigator follows in TraceLine:

```
1. Risk Queue          ──►  Review triage-ranked communities (High / Medium / Low).
2. Communities         ──►  Inspect network-level metrics and member distribution.
3. Community Triage    ──►  Examine high-severity evidence signals and peer risk.
4. Forensic Workspace  ──►  Perform multi-lens investigation:
                            • Evidence: Review converging signal families.
                            • Accounts: Inspect Entity Role Matrix (Primary Hubs, Sources).
                            • Network: Explore 5 interactive graph lenses with focal ego-networks.
                            • Timeline: Correlate temporal burst transactions.
                            • Money Flow: Trace inter-account fund routing and velocity.
                            • Storyline & Hypotheses: Test alternative benign explanations.
5. Accounts & Txs      ──►  Drill down into individual account profiles and raw ledger entries.
6. Formal Decision     ──►  Record disposition (ESCALATE_SAR, MONITOR, CLEARED, FALSE_POSITIVE)
                            with mandatory rationale and investigator signature.
7. SAR & Dossier       ──►  Verify audit readiness criteria, compile immutable snapshot, and
                            export SAR narrative with cryptographic data lineage.
```

---

## 7. The Zero-Leakage Contract

To ensure that machine learning and evidence evaluation reflect authentic operational conditions where ground truth does not exist, TraceLine enforces a strict zero-leakage contract across four architectural layers:

1. **`FORBIDDEN_COLUMNS` Guard**: In `src/features/community_features.py`, `_validate_tx_df()` raises a `ValueError` if `pattern_id`, `is_ring_member`, or `link_type` are present in transaction data.
2. **`EVALUATION_FORBIDDEN_COLUMNS` Guard**: In `src/ml/risk_scorer.py`, loading and scoring functions reject matrices containing evaluation columns: `is_positive`, `max_ring_coverage`, `primary_ring_id`, `num_rings_intersected`, `fraud_account_count`, `fraud_purity`, or `label`.
3. **AST Source-Code Inspection Tests**:
   Automated tests read the Python source code to verify that evaluation logic is never referenced in runtime modules:
   - `tests/test_community_features.py::test_no_label_leakage_source_inspection`: Confirms `_validate_tx_df` and `FORBIDDEN_COLUMNS` are present, asserts forbidden columns are never accessed via bracket notation, confirms synthetic ring prefixes (`dev_ring`, `ins_ring`, `10.66.`) are absent, and confirms evaluation files (`fraud_cases`, `transactions_fraud`) are never loaded.
   - `tests/test_risk_scorer.py::test_t20_no_evaluation_import`: Asserts `src.evaluation` is never imported and `fraud_cases` never appears in executable code.
   - `tests/test_evaluation_labeler.py::test_no_leakage_between_features_and_labeler`: Verifies that `src.features` never imports `src.evaluation` and never references `LABEL_COLUMNS`.
   - `tests/test_communities.py::test_no_evaluation_label_access`: Asserts that `src/detection/communities.py` contains zero references to evaluation files or label columns.
   - `tests/test_evidence_engine.py::test_no_forbidden_fields`: Verifies that no `EvidenceItem` or engine output contains evaluation or ground-truth keys.

---

## 8. Dataset Baseline Metrics

All metrics and examples derive from the processed payment network dataset in `data/processed/payment_network/`:

| Dimension | Exact Count | Source Artifact |
| :--- | :--- | :--- |
| **Total Accounts** | `50,000` | `accounts.csv` / `community_members.csv` |
| **Enriched Transactions** | `450,546` | `enriched_transactions.csv` |
| **Projected Account-Account Edges** | `382,907` | `community_edges.json` |
| **Unique Physical Devices** | `51,716` | `devices.csv` |
| **Unique IP Addresses** | `25,050` | `ip_addresses.csv` |
| **Unique Payment Instruments** | `52,303` | `payment_instruments.csv` |
| **Unique Merchants** | `2,000` | `merchants.csv` |
| **Detected Louvain Communities** | `59` | `community_members.csv` / `community_risk_scores.csv` |
| **High-Risk Communities (Score ≥ 60)** | `17` | `community_risk_scores.csv` |
| **Medium-Risk Communities (Score 35–59)** | `13` | `community_risk_scores.csv` |
| **Low-Risk Communities (Score < 35)** | `29` | `community_risk_scores.csv` |

### Note on Dataset Size & Repository Exclusion
The raw and processed payment network dataset totals **~6.8 GB** (450,546 enriched transactions with complete multi-entity device, IP, instrument, and merchant graph topologies). In accordance with standard Git best practices and GitHub file size limits, the entire `data/` directory is excluded from version control via `.gitignore`. The data artifacts can be generated or loaded using the deterministic generation and enrichment pipeline scripts in `scripts/`.

---

## 9. Technology Stack & Versions

All dependencies and versions are verified directly from `requirements.txt` and `frontend/package.json`:

### Backend Environment (`requirements.txt`)
- **Python**: Version `3.10+` (developed and tested on Python `3.14.6`)
- **FastAPI**: `>=0.110.0` (High-performance asynchronous REST framework)
- **Uvicorn**: `[standard]>=0.28.0` (ASGI server implementation)
- **Pydantic**: `>=2.6.0` (Strict schema validation and settings enforcement)
- **Pandas**: `>=2.2.0` (DataFrame manipulation and tabular feature processing)
- **NumPy**: `>=1.26.0` (Vectorized numerical computations)
- **NetworkX**: `>=3.2.0` (Graph data structures and Louvain community algorithms)
- **SciPy**: `>=1.12.0` (Sparse matrices and entropy calculations)
- **Scikit-Learn**: `>=1.4.0` (`StandardScaler`, `LogisticRegression`, `RepeatedStratifiedKFold`)
- **Pytest**: `>=8.0.0` (Automated test runner)
- **HTTPX**: `>=0.27.0` (Asynchronous HTTP client for API integration testing)

### Frontend Environment (`frontend/package.json`)
- **React**: `^19.2.8` & **React DOM**: `^19.2.8`
- **React Router DOM**: `^7.18.2` (Client-side routing with code-splitting)
- **Cytoscape**: `^3.34.1` (Graph theory engine with native `cose` physics layout)
- **Lucide React**: `^1.34.0` (Financial SOC iconography)
- **TypeScript**: `~6.0.2` (Strict type safety)
- **Vite**: `^8.2.2` (Next-generation frontend tooling and bundler)
- **Oxlint**: `^1.79.0` (High-performance static code linter)

---

## 10. Working Condition & Quickstart

### Prerequisites
- Python `3.10` or higher
- Node.js `v20.0.0` or higher, npm `10.0.0` or higher

### 1. Clone Repository
```bash
git clone https://github.com/mehtarushil45/TraceLine.git
cd TraceLine
```

### 2. Backend Service Setup
```bash
# Create and activate virtual environment
python -m venv .venv

# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

# Install exact dependencies
pip install -r requirements.txt

# Start FastAPI backend server (listens on 0.0.0.0:8000)
uvicorn src.api.main:app --host 0.0.0.0 --port 8000
```

Verify backend health:
```bash
curl http://127.0.0.1:8000/api/health
# Returns: {"status":"healthy","version":"1.0.0","service":"TraceLine Investigator API",...}
```

Interactive OpenAPI documentation is accessible at: `http://127.0.0.1:8000/docs`

### 3. Frontend Application Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

Open your browser to: `http://localhost:5173` (Vite dev server proxies all `/api/*` requests directly to `http://127.0.0.1:8000`).

### 4. Running Automated Tests
```bash
# Run backend test suite (from repository root)
python -m pytest tests/ -v

# Run frontend semantic test suite
npm --prefix frontend test

# Run frontend production build validation
npm --prefix frontend run build
```

---

## 11. Automated Testing & Verification

TraceLine maintains **315 automated tests** across both backend and frontend environments:
- **Backend Test Suite (Pytest)**: **298 tests** across 15 test modules in `tests/`.
- **Frontend Test Suite (Node Test Runner)**: **17 tests** across 8 test suites in `frontend/src/__tests__/forensic_workspace_semantics.test.ts`.

### Test Coverage Breakdown
| Test Module | Tests | Scope & Invariants Tested |
| :--- | :---: | :--- |
| `tests/test_evidence_engine.py` | `83` | All 9 deterministic detectors, severity ordering, SHA-1 generation, zero forbidden field leakage. |
| `tests/test_transaction_integrity.py` | `38` | Transaction registry filtering, pagination, counterparty flow reconciliation, zero forbidden keys. |
| `tests/test_synthetic_data_fixes.py` | `30` | Amount distribution realism, timestamp compression, IP pool scaling, observable column separation. |
| `tests/test_risk_scorer.py` | `27` | Feature loading, `RepeatedStratifiedKFold`, class balancing, determinism (`seed=42`), forbidden column rejection. |
| `tests/test_account_integrity.py` | `24` | Account balances, multi-entity bindings, profile data schemas, 404 handlers. |
| `tests/test_api.py` | `20` | REST API routing, query parameter validation, response status codes, OpenAPI schema compliance. |
| `tests/test_community_features.py` | `18` | Mathematical formulas for all 21 features, group assignments, NaN handling, source code leakage guard. |
| `tests/test_cases_integrity.py` | `12` | Investigation case lifecycle, case-evidence linking, readiness audit criteria. |
| `tests/test_evaluation_labeler.py` | `9` | Jaccard ring coverage thresholding ($\theta=0.5$), source-code isolation between features and labeler. |
| `tests/test_graph.py` | `9` | Bipartite graph building, entity projection, edge weight calculations, temporal multipliers. |
| `tests/test_community_triage_audit.py` | `8` | Community triage ranking, signal explanations, risk distribution bounds. |
| `tests/test_communities.py` | `6` | Louvain community partitioning, temporal compression scoring, source-code label isolation. |
| `tests/test_graph_intelligence.py` | `6` | Focal account prioritization, BFS path traversal, edge flow reconciliation. |
| `tests/test_enrichment.py` | `5` | Transaction enrichment, device/IP entity resolution. |
| `tests/test_forensic_semantics.py` | `3` | Backend endpoint support for investigation focal vs evidence focus separation. |
| `frontend/src/__tests__/forensic_workspace_semantics.test.ts` | `17` | Strict separation of Investigation Focal from Evidence Focus, lens compatibility, empty state handling, timeline event matching, draft SAR readiness. |

---

## 12. Regulatory Isolation & Auditability

In anti-money laundering (AML) and financial crime operations, suspicious activity filings (FinCEN SAR, RBI STR) must withstand judicial and regulatory audit.

**TraceLine guarantees that ground-truth labels exist only for offline algorithmic benchmarking:**
- Ground-truth fraud rings (`fraud_cases.csv`, `transactions_fraud.csv`) and evaluation labels (`community_labels.csv`) are consumed exclusively by `src/evaluation/labeler.py`.
- Ground truth is **never loaded into memory** by the API service (`src/api/service.py`), **never accessed** by the feature extractor (`src/features/community_features.py`), **never accessed** by the evidence engine (`src/intelligence/evidence_engine.py`), and **never rendered** across any investigator screen or export.
- Every formal decision and SAR narrative compiled by TraceLine is derived exclusively from verifiable raw ledger entries, observable entity linkages, and deterministic rule violations.
