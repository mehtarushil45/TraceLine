# TraceLine — Payment Network Fraud Ring Investigation Platform

> **TraceLine sits in the operational gap between real-time per-transaction fraud scoring engines (such as Razorpay Thirdwatch/Mitra) and enterprise-tier financial crime investigation platforms (such as Quantexa or NICE Actimize) that are economically and operationally accessible only to Tier-1 global banks.**

Submitted to **Razorpay AI Buildathon 2026 — Track 02 (AI Risk Manager)**.

---

## 1. Positioning & Scope

Modern payment gateways excel at point-in-time transaction evaluation: assessing card velocity, IP geolocation mismatches, or device fingerprint anomalies in single-digit milliseconds. However, coordinated fraud rings operate across multiple distributed accounts where every individual transaction is deliberately engineered to pass point-in-time scoring rules.

TraceLine provides the missing network-level investigation layer:
- **Upstream Integration**: Ingests payment streams, authorizations, and entity bindings after real-time scoring.
- **Topology Resolution**: Builds multi-entity bipartite graphs and projects account-to-account relationships based on shared devices, payment instruments, IP subnets, and merchants.
- **Unsupervised Ring Discovery**: Partitions the network via Louvain modularity optimization into discrete communities without requiring fraud labels.
- **Dual-Track Evaluation**: Evaluates communities through two strictly decoupled paths:
  1. An **Auditable Evidence Engine** (100% deterministic, rule-based, zero hallucination risk).
  2. A **Triage Risk Scorer** (L2-penalized Logistic Regression for queue prioritization, not autonomous verdicts).
- **Forensic Workspace**: Delivers an interactive investigation workbench featuring 5 relationship lenses, timeline correlation, and audit-ready case dossier generation.

---

## 2. The Problem: Coordinated Fraud Rings

Coordinated payment fraud rings — including synthetic identity syndicates, card-testing networks, and money mule clusters — exploit a structural blind spot in single-transaction monitoring: **each individual transaction appears benign in isolation**.

The syndicates coordinate across multiple dimensions:
- **Shared Hardware & Payment Tokens**: Multiple distinct account holders bind identical physical devices (`device_id`) or share digital payment instruments (`payment_instrument_id`).
- **Subnet Concentration**: Distributed accounts originate transactions from tightly clustered IP subnets or proxy infrastructure (`ip_address`).
- **Timing-Compressed Bursts**: Conspirators execute coordinated, sub-hour payment runs across multiple merchant categories to extract value before chargebacks or velocity blocks trigger.
- **Smurfing & Fund Dispersion**: Low-value transactions are dispersed across seemingly unrelated consumer accounts to evade regulatory threshold reporting.

### Dataset Baseline Metrics
All metrics and examples in TraceLine derive from the payment network dataset processed in `data/processed/payment_network/`:

| Dimension | Exact Count | Storage / Source Artifact |
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

Under single-transaction evaluation, an account executing two $45 transactions at standard retail merchants triggers zero alerts. Only when graph projection links that account to 8 other accounts sharing a single MAC address hash and payment instrument within a 48-hour window does the coordinated syndicate emerge.

---

## 3. What TraceLine Does: Pipeline Architecture

Data flows through TraceLine in a strictly defined, unidirectional 9-stage pipeline:

```
[1. Payment Stream & Entity Ingestion]
                │
                ▼
[2. Bipartite Heterogeneous Graph Construction]
                │
                ▼
[3. Monopartite Account-Account Weighted Projection]
                │
                ▼
[4. Unsupervised Louvain Modularity Partitioning]
                │
        ┌───────┴────────────────────────┐
        ▼                                ▼
[5. 21 Observable Feature Extractor]   [6. Deterministic Evidence Engine]
        │                                │  (9 Observable Rule Detectors)
        ▼                                │
[7. L2 Logistic Regression Scorer]       │  (Auditable Evidence Score 0-100)
   (Triage Probability 0.0 - 1.0)        │
        │                                │
        └───────┬────────────────────────┘
                ▼
[8. FastAPI In-Memory REST Service]
                │
                ▼
[9. Forensic SOC Investigation Workspace]
```

### 1. Multi-Entity Bipartite Ingestion (`src/data/`)
Ingests raw transaction logs and normalizes account bindings across four entity types: `devices`, `ip_addresses`, `payment_instruments`, and `merchants`. Entity resolution binds each account to observable physical and network identifiers.

### 2. Graph Construction & Monopartite Projection (`src/graph/`)
- `builder.py`: Constructs a heterogeneous bipartite graph connecting accounts to shared entities.
- `projection.py`: Collapses the bipartite graph onto an undirected, weighted Account-Account projection. Two accounts are joined by an edge if they share at least one physical entity.
- Edge weights use diminishing-returns square-root scaling with temporal reinforcement:
  $$\text{Weight} = \sum_{\text{type}} \left( w_{\text{base}} \times \sqrt{\text{count}_{\text{type}}} \right) \times \text{multiplier}_{\text{temporal}}$$
  where base weights are strictly ordered by signal strength:
  - Shared Payment Instrument: `4.0`
  - Shared Device: `3.0`
  - Shared Merchant: `2.0`
  - Shared IP: `1.0`
  $$\text{multiplier}_{\text{temporal}} = \min(1.0 + 0.25 \times \text{shared\_calendar\_days}, 2.0)$$

### 3. Unsupervised Community Detection (`src/detection/communities.py`)
Applies the Louvain modularity optimization algorithm (`seed=42`, deterministic member sorting) on the projected account graph. Partitions the 50,000 accounts into **59 discrete topological communities** without consuming any fraud labels.

### 4. Observable Community Feature Extraction (`src/features/community_features.py`)
Extracts **21 explainable, observable features** per community across 4 distinct families:
- **Graph Structure (4 features)**: `member_count`, `density`, `mean_edge_weight`, `weight_per_member`.
- **Entity Sharing (6 features)**: `unique_shared_instruments`, `unique_shared_devices`, `unique_shared_ips`, `unique_shared_merchants`, `instrument_sharing_ratio`, `device_sharing_ratio`.
- **Temporal Concentration (5 features)**: `temporal_compression_score` ($count / [count + span\_hours]$), `unique_active_hours`, `median_inter_transaction_gap_hours`, `tx_per_member`, `temporal_overlap_mean`.
- **Transaction Behavior & Exposure (6 features)**: `mean_tx_amount`, `amount_cv` (coefficient of variation), `declined_rate`, `unique_payment_methods`, `merchant_category_entropy`, `total_transaction_amount`.

### 5. Deterministic Evidence Intelligence Engine (`src/intelligence/`)
Executes **9 rule-based forensic detectors** directly against graph topology and raw transaction records:
1. `SHARED_INSTRUMENT_CONCENTRATION` (shared cards/tokens across accounts)
2. `DEVICE_REUSE` (shared hardware identifiers)
3. `IP_CONCENTRATION` (shared subnet/IP infrastructure)
4. `TEMPORAL_BURST` (compressed transaction bursts within short windows)
5. `RAPID_INTERACTION` (sub-hour inter-transaction pacing)
6. `MERCHANT_TEMPORAL_OVERLAP` (same-merchant multi-account velocity)
7. `HIGH_EVIDENCE_DENSITY` (elevated edge-to-node connectivity ratios)
8. `HUB_ACCOUNT` (high-degree centralized dispersion accounts)
9. `MULTI_LAYER_EVIDENCE` (confluent sharing across 2+ distinct entity layers)

Outputs an auditable, bounded `evidence_score` [0–100], structured forensic descriptions, and deterministic SHA-1 `evidence_id` hashes.

### 6. Triage Community Risk Scoring (`src/ml/risk_scorer.py`)
Fits an L2-penalized Logistic Regression model on the 21 observable features:
- Standardized inputs via `StandardScaler()`.
- Model configuration: `LogisticRegression(C=1.0, solver="lbfgs", class_weight="balanced", random_state=42)`.
- Baseline comparator: `RandomForestClassifier(n_estimators=200, max_depth=6, class_weight="balanced", random_state=42)`.
- Produces an uncalibrated triage probability $[0.0, 1.0]$ mapped to an integer score $[0, 100]$:
  - **HIGH**: Probability $\ge 0.60$ (score 60–100) $\rightarrow$ Priority investigation queue.
  - **MEDIUM**: Probability $\ge 0.35$ (score 35–59) $\rightarrow$ Secondary supervisory review.
  - **LOW**: Probability $< 0.35$ (score 0–34) $\rightarrow$ Background monitoring.

### 7. Offline Evaluation Layer (`src/evaluation/labeler.py`)
Computes Jaccard ring coverage against ground-truth synthetic rings ($\theta = 0.5$ threshold: positive if community captures $\ge 50\%$ of any ring). **Used strictly for offline cross-validation and benchmarking; never loaded into runtime memory or exposed to investigators.**

### 8. API Layer (`src/api/`)
FastAPI REST backend serving in-memory indexes, streaming graph topologies, timeline correlations, account dossiers, and evidence findings.

### 9. Forensic Investigation Workspace (`frontend/`)
React 19 + TypeScript + Cytoscape single-page application providing a high-density SOC console with 5 graph lenses, bullet-bar risk indicators, and audit-ready case dossier generation.

---

## 4. Technical Design Choices & Evaluation Alignment

This section directly addresses Razorpay's four core evaluation criteria: **Problem Taste**, **Build Quality**, **AI Judgment**, and **Failure Recovery**.

### AI Judgment: Deterministic Evidence Engine vs. ML Triage

A prevailing trend in compliance technology is deploying Large Language Model (LLM) agentic workflows (e.g., Lucinity's generative case narratives, recently licensed into enterprise suites like Oracle FCCM) to synthesize investigation notes and propose verdicts. 

TraceLine deliberately rejects generative LLMs in the evidence path based on core compliance principles:

| Capability Dimension | Generative LLM Approach | TraceLine Dual-Track Architecture |
| :--- | :--- | :--- |
| **Auditability** | Non-deterministic; prompt drift and temperature variation produce varying explanations for identical data. | **Deterministic**: Evidence items are generated by explicit mathematical rules and hashed with SHA-1 fingerprints. |
| **Hallucination Risk** | May fabricate causal links, merge transactions, or invent device bindings under complex prompts. | **Mathematically Zero**: An edge or evidence item cannot exist unless backed by raw CSV transaction rows. |
| **Regulatory Defensibility** | Challenging to defend an LLM-generated narrative under judicial cross-examination or FinCEN/RBI regulatory audit. | **Fully Defensible**: Every claim maps to an explicit rule, threshold, and timestamped raw ledger entry. |
| **Role of Machine Learning** | Often conflated with the factual source of truth. | **Strictly Constrained**: ML (Logistic Regression) is used exclusively for **triage prioritization** (sorting queues), not as a factual determination of fraud. |

In TraceLine, `evidence_score` (rule-based strength of observable connections) and `risk_score` (statistical ranking) are intentionally separated. A community can have high evidence density (e.g., a shared corporate payroll account) but low risk score due to lack of temporal compression or declined authorization bursts.

### The Zero-Leakage Contract
To ensure the ML model and evidence engine reflect real-world production conditions where fraud ground truth does not exist, TraceLine enforces a strict zero-leakage contract across four layers:

1. **`FORBIDDEN_COLUMNS` Guard**: In `src/features/community_features.py`, the validation guard `_validate_tx_df()` raises a `ValueError` if `pattern_id`, `is_ring_member`, or `link_type` are present in transaction data.
2. **`EVALUATION_FORBIDDEN_COLUMNS` Guard**: In `src/ml/risk_scorer.py`, loading or scoring functions reject feature matrices containing evaluation columns: `is_positive`, `max_ring_coverage`, `primary_ring_id`, `num_rings_intersected`, `fraud_account_count`, `fraud_purity`, or `label`.
3. **AST and Source-Code Inspection Tests**:
   Unlike standard unit tests that only inspect runtime output, TraceLine includes tests that read the Python source code itself to prove evaluation logic is never referenced:
   - `tests/test_community_features.py::test_no_label_leakage_source_inspection`: Reads `community_features.py` source text via `read_text()`. Confirms `_validate_tx_df` and `FORBIDDEN_COLUMNS` are present, asserts that forbidden columns are never accessed via bracket notation (`tx_df["..."]` or `tx_df['...']`), confirms ring-specific synthetic ID prefixes (`dev_ring`, `ins_ring`, `10.66.`) do not appear in feature logic, and confirms evaluation file names (`fraud_cases`, `transactions_fraud`) are absent.
   - `tests/test_risk_scorer.py::test_t20_no_evaluation_import`: Reads `risk_scorer.py` source text. Asserts `src.evaluation` is never imported, asserts `fraud_cases` never appears in executable code, and asserts `is_ring_member` is never accessed.
   - `tests/test_evaluation_labeler.py::test_no_leakage_between_features_and_labeler`: Verifies that `src.features` never imports `src.evaluation` and never references `LABEL_COLUMNS`.
   - `tests/test_communities.py::test_no_evaluation_label_access`: Asserts that `src/detection/communities.py` contains no references to evaluation files or label columns.

### Small-Sample Statistical Honesty (N=59 Communities)
In production fraud graph analysis, the fundamental unit of investigation is the **community**, not the raw transaction. In our 50,000-account graph, Louvain partitioning yields **N=59 communities** (12 positive fraud rings, 47 negative background communities; a ~3.92:1 class imbalance).

As documented in the `src/ml/risk_scorer.py` module docstring:
- **Sample Size Constraint**: With N=59, a single held-out test split (e.g., 80/20) places only ~12 samples in the test partition, containing only 2 or 3 positive fraud rings. Evaluation metrics on a single split are statistically unstable and oscillate wildly depending on random seeds.
- **Cross-Validation Strategy**: Rather than claiming uncalibrated performance from a single split, TraceLine implements `RepeatedStratifiedKFold` (10 folds × 10 repeats = **100 mini-experiments**). Every metric is reported as `mean ± standard deviation`.
- **Automated Stability Warning**: `EvaluationResult` computes an automated flag:
  $$\text{stability\_warning} = \text{True} \quad \text{if} \quad \text{std\_roc\_auc} > 0.15$$
- **Uncalibrated Triage Indicators**: The code explicitly avoids claiming calibrated Bayesian posterior probabilities. The risk score [0–100] is an **ordinal triage rank** designed to order investigator review queues, not a certified mathematical likelihood of guilt. Thresholds (60 for HIGH, 35 for MEDIUM) are conservative operational separations that must be re-calibrated when community volume exceeds ~200 samples.

---

## 5. Architecture & Module Structure

The runtime dependency flow is strictly directed and acyclic:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION & BINDING                        │
│   src/data/entities.py            src/data/enrichment.py               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      GRAPH CONSTRUCTION & PROJECTION                   │
│   src/graph/builder.py  ──►  src/graph/projection.py                   │
│   (Bipartite Graph)          (Account-Account Weighted Projection)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       UNSUPERVISED DETECTION                           │
│   src/detection/communities.py (Louvain Modularity Partitioning)       │
└───────────┬────────────────────────────────────────────────┬───────────┘
            │                                                │
            ▼                                                ▼
┌───────────────────────────────────────┐   ┌────────────────────────────┐
│         FEATURE EXTRACTION            │   │ EVIDENCE INTELLIGENCE      │
│   src/features/community_features.py  │   │   src/intelligence/        │
│   (21 Observable Features)            │   │   - evidence_engine.py     │
│   (Guards: FORBIDDEN_COLUMNS)         │   │   - evidence_rules.py      │
└───────────────────┬───────────────────┘   │   (9 Deterministic Rules)  │
                    │                       │   (Auditable Evidence 0-100│
                    ▼                       └─────────────┬──────────────┘
┌───────────────────────────────────────┐                 │
│         MACHINE LEARNING TRIAGE       │                 │
│   src/ml/risk_scorer.py               │                 │
│   (StandardScaler + L2 Logistic Reg)  │                 │
│   (RepeatedStratifiedKFold, 10x10)    │                 │
│   (Output: Triage Risk Score 0-100)   │                 │
└───────────────────┬───────────────────┘                 │
                    │                                     │
                    └───────────────────┬─────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          FASTAPI REST SERVICE                          │
│   src/api/service.py (In-Memory Data & Topology Indexes)               │
│   src/api/routers/ (communities, accounts, graph, timeline, health)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    FORENSIC WORKSPACE FRONTEND                         │
│   frontend/src/pages/ForensicWorkspacePage.tsx                         │
│   frontend/src/components/graph/NetworkGraph.tsx (5 Cytoscape Lenses)  │
│   frontend/src/components/investigation/ (Storyline, Hypotheses, Dossier│
└────────────────────────────────────────────────────────────────────────┘

[OFFLINE EVALUATION LAYER (Completely Decoupled)]:
  src/evaluation/labeler.py (Ground-Truth Jaccard Ring Coverage Matching)
  Evaluated only during offline benchmarking; never imported by runtime.
```

### Architectural Pipeline Shift
*Note on architectural evolution:* In earlier conceptual drafts, the Evidence Intelligence Engine was conceived as a downstream consumer of ML risk classifications. During implementation, this was restructured to run **in parallel directly on observable graph telemetry and raw transactions**. The ML risk score does not gate, filter, or inform the evidence engine. This ensures that even if an ML model misclassifies a community, the deterministic evidence engine surfaces all hardware, instrument, and IP overlaps with complete audit integrity.

---

## 6. Failure Recovery: Real Engineering Incidents

Razorpay's Buildathon evaluation explicitly grades **Failure Recovery**. Below are two concrete technical failures encountered during development and how they were resolved.

### Incident 1: Network Graph Visualization Defeated by Circular Perimeter Layout
- **Observed Symptom**: In the early implementation of `frontend/src/components/graph/NetworkGraph.tsx`, the Cytoscape graph canvas defaulted to a `circle` layout. While the graph rendered without JavaScript exceptions, all accounts were arranged along the perimeter of an equidistant circle regardless of edge weights or multi-entity connectivity. Dense, collusive fraud rings were visually indistinguishable from sparse, peripheral account chains. The visualization failed its primary functional purpose: allowing an investigator to visually spot a tight fraud cluster in under two seconds.
- **Root Cause Analysis**: The choice of a circular layout was a cognitive error prioritizing predictable geometric dimensions over topological semantics. A circular layout ignores edge weights and spring-force dynamics entirely.
- **Engineering Remedy**: Replaced the default layout with Cytoscape's native `cose` (Compound Spring Embedder) force-directed physics engine. Calibrated node repulsion, gravity, and edge elasticity parameters so that accounts sharing multiple evidence layers (high edge weight) are pulled into dense, tightly clustered visual islands, while unconnected accounts are repelled to the visual periphery. Retained `concentric` and `circle` only as secondary manual toggles.
- **Result**: Dense fraud rings immediately resolve into visually separated topological clusters upon community load.

### Incident 2: High Metric Variance Under Small-Sample Community Splits
- **Observed Symptom**: During initial model evaluation in `src/ml/risk_scorer.py`, community classification performance was evaluated using a standard single 80/20 train/test split. Test ROC-AUC fluctuated erratically between `0.64` and `0.96` across different random split seeds.
- **Root Cause Analysis**: The effective sample size at the community level is N=59. With 12 positive fraud communities, an 80/20 split left only 11 or 12 test samples, containing only 2 or 3 positive instances. A single misclassified community caused an 8–15% swing in test metrics, producing an illusory assessment of model stability.
- **Engineering Remedy**: Eliminated single-split holdout evaluation. Replaced it with `RepeatedStratifiedKFold(n_splits=10, n_repeats=10, random_state=42)`, generating 100 stratified evaluation runs. Implemented mean ± standard deviation reporting for all metrics (ROC-AUC, PR-AUC, F1, Precision, Recall) and added an automated code flag (`stability_warning = True` when `std_roc_auc > 0.15`).
- **Result**: Provided honest, bounded statistical estimates and established the architectural requirement that ML outputs represent ordinal triage priority rankings rather than calibrated probabilities.

---

## 7. UI & Visual Language

The TraceLine investigator interface adheres to strict financial SOC design rules:

- **Bullet-Style Risk Indicator (No Dials or Gauges)**: Risk scores are displayed via `frontend/src/components/common/RiskScore.tsx` as a crisp monospace numerical value (`{score}/100`) coupled with a horizontal 4px bullet progress bar (track `#1e293b`). Radial dials, speedometer gauges, and skeuomorphic meters are excluded to preserve screen real estate and avoid false impressions of continuous probability precision.
- **Force-Directed Community Topology**: The graph canvas (`frontend/src/components/graph/NetworkGraph.tsx`) renders accounts using force-directed physics (`cose`). Highly connected fraud rings form tight visual knots separated from background accounts. Node size scales with degree; edge thickness scales with evidence weight.
- **Strict Color Semantics (Zero Decorative Color)**: Color is strictly reserved for risk severity and functional relationship types:
  - **Risk Severity**: Red (`#ef4444` / HIGH), Amber (`#f59e0b` / MEDIUM), Emerald (`#10b981` / LOW).
  - **Edge Relationship Semantics**: Emerald for direct transaction flow (`#10b981`), Orange for shared devices (`#fb923c`), Amber for shared instruments (`#fbbf24`), Blue for shared IPs (`#60a5fa`), Purple for multi-layer evidence (`#c084fc`), Gray for baseline weight (`#4b5563`).
- **Five Investigation Lenses**: Allows investigators to filter graph topologies dynamically:
  1. *Relationship Lens*: 1-hop observed neighborhood centered on the focal account.
  2. *Flow of Funds Lens*: Direct transaction movement and transfer velocity.
  3. *Shared Infrastructure Lens*: Hardware tokens, cards, and IP subnets common across accounts.
  4. *Temporal Convergence Lens*: Calendar-day transaction concurrency.
  5. *Community Structure Lens*: Full topological Louvain partition structure.
- **Strict State Separation**: Graph semantics strictly decouple the **Investigation Focal** (the account/entity currently under active review) from the **Evidence Focus** (the specific transaction, burst, or telemetry anomaly being inspected). Selecting a transaction in the timeline or evidence drawer highlights the supporting link without mutating the primary account subject.

---

## 8. Technology Stack & Versions

All dependencies and versions are verified directly from `requirements.txt` and `frontend/package.json`:

### Backend Environment (`requirements.txt`)
- **Python**: Version `3.10+` (developed and tested on Python `3.14.6`)
- **FastAPI**: `>=0.110.0` (High-performance asynchronous REST framework)
- **Uvicorn**: `[standard]>=0.28.0` (ASGI server implementation)
- **Pydantic**: `>=2.6.0` (Type validation and settings schema enforcement)
- **Pandas**: `>=2.2.0` (DataFrame manipulation and tabular feature processing)
- **NumPy**: `>=1.26.0` (Vectorized numerical computations)
- **NetworkX**: `>=3.2.0` (Graph data structures and Louvain community algorithms)
- **SciPy**: `>=1.12.0` (Scientific computing, sparse matrices, and entropy metrics)
- **Scikit-Learn**: `>=1.4.0` (Pipelines, `StandardScaler`, `LogisticRegression`, `RepeatedStratifiedKFold`)
- **Pytest**: `>=8.0.0` (Automated unit and integration test runner)
- **HTTPX**: `>=0.27.0` (Asynchronous HTTP client for API testing)
- *Note on XGBoost*: `xgboost>=2.0.0` is present in `requirements.txt` for evaluation benchmarking, but the core active runtime pipeline in `src/ml/risk_scorer.py` utilizes L2-penalized Logistic Regression for auditable linear interpretability alongside Random Forest.

### Frontend Environment (`frontend/package.json`)
- **React**: `^19.2.8` & **React DOM**: `^19.2.8`
- **React Router DOM**: `^7.18.2` (Client-side route navigation)
- **Cytoscape**: `^3.34.1` (Graph theory visualization engine using native `cose`, `concentric`, and `circle` layouts)
- **Lucide React**: `^1.34.0` (Standardized financial SOC iconography)
- **TypeScript**: `~6.0.2` (Strict type safety)
- **Vite**: `^8.2.2` (Next-generation frontend tooling and bundler)
- **Oxlint**: `^1.79.0` (High-performance static code linter)

---

## 9. Quickstart & Verification

### Prerequisites
- Python `3.10` or higher
- Node.js `v20.0.0` or higher, npm `10.0.0` or higher

### 1. Backend Service Setup

```bash
# From repository root
python -m venv venv

# Activate virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install exact dependencies
pip install -r requirements.txt

# Start FastAPI backend (listens on 0.0.0.0:8000)
uvicorn src.api.main:app --reload --port 8000
```

Verify backend health:
```bash
curl http://127.0.0.1:8000/api/health
# Returns: {"status":"healthy","version":"1.0.0","service":"TraceLine Investigator API",...}
```

Interactive OpenAPI documentation is accessible at: `http://127.0.0.1:8000/docs`

### 2. Frontend Application Setup

```bash
# Navigate to frontend directory
cd frontend

# Install exact npm packages
npm install

# Start Vite development server with API proxy
npm run dev
```

Open your browser to: `http://localhost:5173` (Vite proxies all `/api/*` requests directly to `http://127.0.0.1:8000`).

### Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `TRACELINE_DATA_DIR` | `data/processed/payment_network` | Path to directory containing processed CSVs and `community_edges.json`. |
| `PORT` / `TRACELINE_PORT` | `8000` | HTTP port for the FastAPI uvicorn runner. |
| `HOST` / `TRACELINE_HOST` | `0.0.0.0` | Binding IP address for the API server. |
| `TRACELINE_CORS_ORIGINS`| `http://localhost:5173,...` | Comma-separated allowed HTTP CORS origins. |
| `VITE_DEV_API_TARGET` | `http://127.0.0.1:8000` | Frontend dev proxy destination for API routing. |

---

## 10. Automated Testing & Quality Verification

TraceLine maintains **315 automated tests** across both backend and frontend environments:
- **Backend Test Suite (Pytest)**: **298 tests** across 15 test files in `tests/`.
- **Frontend Test Suite (Node Test Runner)**: **17 tests** across 8 test suites in `frontend/src/__tests__/forensic_workspace_semantics.test.ts`.

### Test Suite Execution Commands

```bash
# Run all 298 backend tests
python -m pytest tests/ -q

# Run frontend forensic workspace semantic tests
node --test frontend/src/__tests__/forensic_workspace_semantics.test.ts

# Execute TypeScript production build validation
npm --prefix frontend run build
```

### Test Coverage Breakdown

| Module / Test File | Test Count | Scope & Invariants Tested |
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

### Core Named Tests Enforcing System Contracts
- `tests/test_community_features.py::test_no_label_leakage_source_inspection`: Enforces that `src/features/community_features.py` contains `_validate_tx_df` and `FORBIDDEN_COLUMNS`, and never references `pattern_id`, `is_ring_member`, `link_type`, synthetic ring ID prefixes (`dev_ring`, `ins_ring`, `10.66.`), or evaluation files.
- `tests/test_risk_scorer.py::test_t20_no_evaluation_import`: Enforces that `src/ml/risk_scorer.py` never imports `src.evaluation`, never references `fraud_cases` in executable code, and never accesses `is_ring_member`.
- `tests/test_evaluation_labeler.py::test_no_leakage_between_features_and_labeler`: Verifies via source inspection that `src/features/` never imports `src.evaluation` and never references `LABEL_COLUMNS`.
- `tests/test_communities.py::test_no_evaluation_label_access`: Verifies via source inspection that `src/detection/communities.py` contains zero references to evaluation files or label columns.
- `tests/test_evidence_engine.py::test_no_forbidden_fields`: Verifies that no `EvidenceItem` or engine output contains evaluation or ground-truth keys.

---

## 11. Compliance & Regulatory Isolation Note

In compliance and anti-money laundering investigations (FinCEN Suspicious Activity Reports, RBI suspicious transaction filings), decisions must withstand regulatory audit and evidentiary scrutiny. 

**TraceLine guarantees that ground-truth labels exist only for offline algorithmic validation:**
- Ground-truth fraud rings (`data/raw/fraud/fraud_cases.csv`, `transactions_fraud.csv`) and evaluation labels (`data/processed/payment_network/community_labels.csv`) are consumed exclusively by `src/evaluation/labeler.py`.
- Ground truth is **never loaded into memory** by the API service (`src/api/service.py`), **never accessed** by the feature extractor (`src/features/community_features.py`), **never accessed** by the evidence engine (`src/intelligence/evidence_engine.py`), and **never rendered** across any investigator screen or report.
- The forensic case dossier and SAR narrative generated by TraceLine are compiled solely from timestamped transaction logs, observable entity links, and deterministic rule violations.
