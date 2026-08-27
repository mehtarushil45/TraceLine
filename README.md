# TraceLine — Payment Network Fraud Detection & Investigation Platform

> **Live Forensic SOC Console for Payment Network Risk Ring Detection, Entity Resolution, and Observable Evidence Intelligence.**

---

## 📖 Table of Contents

1. [Executive Summary & Motivation](#-executive-summary--motivation)
   - [What is TraceLine?](#what-is-traceline)
   - [Why was it Built? (The Problem Space)](#why-was-it-built-the-problem-space)
   - [How It Works (High-Level Architecture)](#how-it-works-high-level-architecture)
   - [Observable-Only & Zero-Leakage Guarantee](#observable-only--zero-leakage-guarantee)
2. [Key Capabilities & Forensic Features](#-key-capabilities--forensic-features)
   - [7-Step Guided Investigation Playbook](#7-step-guided-investigation-playbook)
   - [9 Deterministic Evidence Detectors](#9-deterministic-evidence-detectors)
   - [21 Observable Topological Features](#21-observable-topological-features)
   - [Interactive Cytoscape.js Topology Graph](#interactive-cytoscapejs-topology-graph)
   - [Forensic Case Dossier & Print Export](#forensic-case-dossier--print-export)
3. [Technology Stack & Tools Used](#-technology-stack--tools-used)
4. [Complete Project Structure & File Reference](#-complete-project-structure--file-reference)
5. [Data Pipeline & Generation](#-data-pipeline--generation)
6. [Local Quickstart & Development](#-local-quickstart--development)
7. [Environment Variables Reference](#-environment-variables-reference)
8. [Production Build & Deployment](#-production-build--deployment)
9. [API Endpoints Reference](#-api-endpoints-reference)
10. [Testing, Quality & Static Analysis](#-testing-quality--static-analysis)

---

## 🎯 Executive Summary & Motivation

### What is TraceLine?
**TraceLine** is an enterprise-grade financial crime investigation console and anti-money laundering (AML) graph analytics engine. It transforms raw, fragmented payment transactions into multi-layered entity graphs, partitions account networks into structural communities using Louvain community detection, computes 21 observable graph features, scores communities via an explainable machine learning risk model, and provides a dark-mode Security Operations Center (SOC) dashboard with guided investigation playbooks.

### Why was it Built? (The Problem Space)
Traditional fraud engines analyze transactions in isolation (e.g., checking if a single transaction amount exceeds a threshold or happens at an odd hour). However, organized financial crime syndicates, synthetic identity rings, and money mule networks operate through **coordinated, distributed graphs**:
- **Shared Infrastructure**: Multiple accounts accessed through identical mobile hardware IDs (`device_id`) or subnet IP addresses (`ip_address`).
- **Collusive Funding**: Shared debit cards, bank accounts, or digital wallets (`payment_instrument_id`) funneling illicit funds across distinct accounts.
- **Temporal Velocity Bursts**: Coordinated transaction bursts across clusters of accounts within short 60-minute or 24-hour windows.
- **Gateway Velocity & Decline Spikes**: High-frequency card testing resulting in elevated authorization decline rates.
- **Smurfing & Fund Cycling**: Dispersing funds across circular paths to obscure money trails.

Point-in-time transaction monitoring fails against these topologies. **TraceLine was built to give financial crime investigators the ability to visualize, understand, and document these multi-entity relationships with full explainability.**

### How It Works (High-Level Architecture)

```
                                TraceLine System Flow
                                
   ┌──────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
   │  Raw Payment Stream  │ ───► │ Multi-Entity Enrichment │ ───► │  Bipartite Evidence     │
   │  (Santander Schema)  │      │ (Devices, IPs, Cards)   │      │  Graph (Nodes & Edges)  │
   └──────────────────────┘      └─────────────────────────┘      └────────────┬────────────┘
                                                                               │
                                 ┌─────────────────────────┐                   │ Account Projection
                                 │ Louvain Partitioning    │ ◄─────────────────┘
                                 │ & Community Detection   │
                                 └────────────┬────────────┘
                                              │
                                 ┌────────────▼────────────┐
                                 │ 21 Observable Features  │
                                 │ Extraction & Metrics    │
                                 └────────────┬────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
           ┌──────────▼──────────┐                         ┌──────────▼──────────┐
           │ Explainable ML Model│                         │ Observable Evidence │
           │ (Risk Score 0-100)  │                         │ Intelligence Engine │
           └──────────┬──────────┘                         └──────────┬──────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              │
                                 ┌────────────▼────────────┐
                                 │ FastAPI REST API Server │
                                 │ (In-Memory Data Service)│
                                 └────────────┬────────────┘
                                              │ HTTP / JSON
                                 ┌────────────▼────────────┐
                                 │ React 19 + Cytoscape.js │
                                 │ Forensic SOC Console    │
                                 └─────────────────────────┘
```

### Observable-Only & Zero-Leakage Guarantee
In synthetic and historical data environments, datasets often contain ground-truth labels (e.g., `pattern_id`, `is_ring_member`, `fraud_cases.csv`, `fraud_purity`). 

**TraceLine strictly enforces a Zero-Label-Leakage Contract**:
- Ground-truth evaluation labels are used **only** in offline benchmarking and synthetic validation tests.
- Ground-truth columns are **never loaded, stored, or exposed** through investigator-facing API endpoints or frontend user interfaces.
- The machine learning risk model and evidence engine operate **exclusively on observable topological and behavioral features** (shared entities, degrees, timestamps, amounts, decline codes).
- The calculated `risk_score` represents **observable risk triage priority**, not a calibrated fraud probability.

---

## ⚡ Key Capabilities & Forensic Features

### 1. 7-Step Guided Investigation Playbook
TraceLine features an interactive linear workflow designed to onboard investigators and guide complex cases from initial network triage to finished intelligence reports:
1. **Triage (`/`)**: Discover top-risk communities ranked by ML risk score and observable anomaly flags.
2. **Evidence (`/communities/:id`)**: Inspect deterministic rule detector firings with severity metrics and supporting entities.
3. **Graph (`/communities/:id`)**: Launch interactive Cytoscape network topology with dynamic evidence focus and neighborhood dimming.
4. **Account (`/accounts/:id`)**: Drill down into individual account profiles, hardware footprints, IP telemetry, and money flows.
5. **Transaction (`/transactions/:id`)**: Audit transaction velocities, merchant risk tiers, and gateway decline codes.
6. **Case (`/investigations/:caseId`)**: Aggregate multiple targets, maintain forensic notes, and filter risk indicators.
7. **Dossier (`/investigations/:caseId` Modal)**: Export print-ready investigation dossiers with formal regulatory attestations.

### 2. 9 Deterministic Evidence Detectors
The **Evidence Intelligence Engine** (`src/intelligence/evidence_engine.py`) runs 9 deterministic rule detectors:
- **`SHARED_INSTRUMENT_CONCENTRATION`**: Detects 2+ accounts sharing the same payment card or bank instrument.
- **`SHARED_DEVICE_CLUSTER`**: Flags multiple accounts logging in from identical hardware device fingerprints.
- **`SHARED_IP_SUBNET_POOL`**: Identifies dense account clusters operating through shared IP addresses.
- **`TEMPORAL_BURST`**: Detects dense transaction clustering in 60-minute sliding windows (HIGH/MEDIUM) and 24-hour windows (LOW).
- **`HIGH_DECLINE_RATE`**: Flags elevated transaction authorization failure rates ($\ge 30\%$ HIGH, $\ge 15\%$ MEDIUM).
- **`HIGH_VALUE_VELOCITY`**: Detects abnormal cumulative transaction volumes ($\ge \$100\text{k}$ HIGH, $\ge \$25\text{k}$ MEDIUM).
- **`DENSE_INTERNAL_TOPOLOGY`**: Flags tightly-knit account clusters with high internal graph density ($\ge 0.50$).
- **`HIGH_DEGREE_HUB`**: Identifies central hub accounts routing transactions or sharing entities with multiple peers.
- **`MERCHANT_CONCENTRATION`**: Flags unnatural routing concentration where transactions target narrow merchant categories.

### 3. 21 Observable Topological Features
The **Community Feature Engine** (`src/features/community_features.py`) extracts 21 quantitative graph features grouped across four topological families:
- **F1: Graph Topology** (5 features): `member_count`, `internal_edge_count`, `density`, `mean_edge_weight`, `weight_per_member`.
- **F2: Entity Sharing** (8 features): `shared_device_count`, `shared_device_per_member`, `shared_ip_count`, `shared_ip_per_member`, `shared_instrument_count`, `shared_instrument_per_member`, `shared_merchant_count`, `shared_merchant_per_member`.
- **F3: Temporal Dynamics** (4 features): `temporal_overlap_mean`, `unique_active_hours`, `median_inter_tx_gap_hours`, `temporal_compression_score`.
- **F4: Transaction Behavior** (4 features): `total_transaction_amount`, `mean_tx_amount`, `amount_cv` (coefficient of variation), `declined_rate`.

### 4. Interactive Cytoscape.js Topology Graph
- **Cyberpunk Dark-Mode SOC Theme**: Custom Cytoscape rendering engine with glowing neon accents and responsive canvas zooming.
- **Evidence-to-Graph Focus**: Clicking an evidence card instantly focuses on supporting entities in the network graph while dimming unlinked background nodes.
- **Cluster & Partition Highlighting**: Visualizes Louvain community partitions, high-degree hubs, and weighted transaction flows.

### 5. Forensic Case Dossier & Print Export
- **Multi-Target Dossier**: Manage complex investigations combining communities, accounts, and transactions into a unified dossier.
- **Compliance SAR Export**: Generates FinCEN-compliant Suspicious Activity Report (SAR) XML / Markdown templates.
- **Clean Print & PDF Formatting**: Custom `@media print` styles ensure clean, paginated, and watermark-free reports via browser printing.

---

## 🛠 Technology Stack & Tools Used

### Backend Architecture
- **Language**: Python 3.10+ (tested across Python 3.10, 3.11, 3.12, 3.14)
- **Web Framework**: [FastAPI](https://fastapi.tiangolo.com/) (0.110+) for async REST API endpoints
- **ASGI Server**: [Uvicorn](https://www.uvicorn.org/) (0.28+) with standard uvloop and httptools workers
- **Data Validation & Settings**: [Pydantic v2](https://docs.pydantic.dev/) for request/response schemas and environment settings
- **Graph Algorithms**: [NetworkX](https://networkx.org/) (3.2+) for bipartite evidence graphs, projection, and Louvain community detection
- **Data Manipulation**: [Pandas](https://pandas.pydata.org/) (2.2+) and [NumPy](https://numpy.org/) (1.26+) for vectorized data structures
- **Machine Learning**: [Scikit-learn](https://scikit-learn.org/) (1.4+) for feature scaling, logistic regression baseline, and metrics
- **Gradient Boosting**: [XGBoost](https://xgboost.readthedocs.io/) (2.0+) for non-linear community risk scoring
- **Scientific Computing**: [SciPy](https://scipy.org/) (1.12+) for statistical entropy and distribution calculations

### Frontend Architecture
- **Framework**: [React 19](https://react.dev/) with [TypeScript 5.8](https://www.typescriptlang.org/)
- **Build Tool & Dev Server**: [Vite 8](https://vite.dev/) with Rolldown bundler integration
- **Client-Side Routing**: [React Router v7](https://reactrouter.com/) for single-page routing
- **Graph Visualization**: [Cytoscape.js](https://js.cytoscape.org/) (3.30+) with `cytoscape-cose-bilkent` and `cytoscape-dagre`
- **Iconography**: [Lucide React](https://lucide.dev/) (0.475+) for financial and security iconography
- **Styling**: Tailored Vanilla CSS design system with HSL dark-mode palettes, glassmorphism, glowing borders, and print stylesheets

### Testing, Linters & Quality Assurance
- **Test Runner**: [Pytest](https://docs.pytest.org/) (8.0+) with 207 automated tests across graph, ML, API, and evidence rules
- **Fast Linter**: [Ruff](https://astral.sh/ruff) (0.16+) for PEP 8, import sorting, and code modernization
- **Static Type Checker**: [Mypy](https://mypy.readthedocs.io/) (2.3+) verifying type safety across 42 source files
- **Frontend Linter**: [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) for fast static analysis of TypeScript and React components
- **HTTP Test Client**: [HTTPX](https://www.python-httpx.org/) (0.27+) for async endpoint testing

---

## 📁 Complete Project Structure & File Reference

Below is the complete directory tree of TraceLine with an explanation of every file's role in the system:

```
TraceLine/
├── .env.example                               # Template for backend environment variables
├── .gitignore                                 # Git ignore rules for Python, Node, data, and environment
├── pyproject.toml                             # Packaging metadata, pytest configuration, and mypy/ruff settings
├── requirements.txt                           # Production and testing Python dependency manifest
├── README.md                                  # Comprehensive project documentation
│
├── data/                                      # Data directory for raw and processed datasets
│   ├── raw/                                   # Raw input transactions (Santander AI generator output)
│   └── processed/                             # Enriched multi-entity payment network data
│       └── payment_network/                   # Pre-indexed payment network dataset
│           ├── accounts.csv                   # 50,000 synthetic account profiles with balances
│           ├── account_device.csv             # Account-to-device mapping table
│           ├── account_ip.csv                 # Account-to-IP address mapping table
│           ├── account_payment_instrument.csv # Account-to-card/instrument mapping table
│           ├── community_edges.json           # Graph projection edge list with weights & shared entities
│           ├── community_features.csv         # 21 computed topological features per community
│           ├── community_labels.csv           # Evaluation-only ground-truth labels (Zero-Leakage protected)
│           ├── community_members.csv          # Account-to-community Louvain partition map
│           ├── community_risk_scores.csv      # Pre-calculated ML risk scores and explainable top signals
│           ├── devices.csv                    # Device hardware catalog (mobile/desktop OS, fingerprints)
│           ├── enriched_transactions.csv      # Multi-entity enriched transaction ledger
│           ├── ip_addresses.csv               # IP address registry with ISP metadata and mobile flags
│           ├── merchants.csv                  # Merchant catalog with categories and risk tiers
│           └── payment_instruments.csv        # Cards and funding instruments with brand and last4
│
├── docs/                                      # Technical architecture specifications and documentation
│   ├── api.md                                 # REST API endpoint specifications and data models
│   ├── community-detection.md                 # Louvain modularity algorithm design and determinism
│   ├── community-features.md                  # Detailed definitions of the 21 observable graph features
│   ├── data-enrichment.md                     # Synthetic data enrichment and multi-entity generation pipeline
│   ├── evidence-intelligence.md               # Evidence Intelligence Engine architecture and 9 rule detectors
│   ├── frontend-dashboard.md                  # Frontend design system, pages, and interactive workflows
│   ├── graph-model.md                         # Bipartite evidence graph and weighted projection methodology
│   └── ml-risk-scoring.md                     # Machine learning risk scoring and logistic regression pipeline
│
├── frontend/                                  # React 19 + TypeScript + Vite Frontend Application
│   ├── .env.example                           # Frontend environment configuration template
│   ├── .gitignore                             # Frontend-specific build and node_modules exclusions
│   ├── .oxlintrc.json                         # Oxlint static linter configuration
│   ├── index.html                             # Single Page Application HTML root entry
│   ├── package.json                           # Frontend npm dependencies and build scripts
│   ├── tsconfig.json                          # TypeScript project root configuration
│   ├── tsconfig.app.json                      # TypeScript compiler settings for frontend application
│   ├── tsconfig.node.json                     # TypeScript compiler settings for Vite config
│   ├── vercel.json                            # Vercel SPA client rewrite routing configuration
│   ├── vite.config.ts                         # Vite configuration with proxy and dev server settings
│   ├── public/                                # Static public assets
│   │   └── _redirects                         # Netlify SPA redirect rules
│   └── src/                                   # Frontend TypeScript/React source code
│       ├── App.css                            # Global application layout styles
│       ├── App.tsx                            # Root React router and navigation routes definition
│       ├── index.css                          # Design tokens, cyber cards, glow borders, and print styles
│       ├── main.tsx                           # React DOM application mount entry point
│       │
│       ├── api/                               # Typed REST API client layer
│       │   ├── accounts.ts                    # Account endpoints client (details, txs, connections, evidence)
│       │   ├── client.ts                      # Base HTTP fetch client with dynamic URL normalization
│       │   ├── communities.ts                 # Community endpoints client (list, detail, graph, evidence)
│       │   ├── index.ts                       # Unified API exports barrel
│       │   ├── summary.ts                     # System summary KPI endpoint client
│       │   └── transactions.ts                # Transaction detail endpoint client
│       │
│       ├── components/                        # Modular React UI components
│       │   ├── account/                       # Account-specific UI components
│       │   │   ├── AccountTable.tsx           # Paginated table of accounts with risk badges
│       │   │   └── ConnectionsTable.tsx       # Table of shared entity connections for an account
│       │   ├── common/                        # Shared, reusable UI components
│       │   │   ├── AddToInvestigationButton.tsx # Quick-action button to attach target to a case
│       │   │   ├── EmptyState.tsx             # Empty state placeholder with iconography
│       │   │   ├── ErrorState.tsx             # Error state fallback component with retry triggers
│       │   │   ├── KpiCard.tsx                # Metric HUD card with trend badges and glow effects
│       │   │   ├── LoadingSkeleton.tsx        # Shimmer loading skeleton placeholder
│       │   │   ├── Pagination.tsx             # Paginated navigation bar control
│       │   │   ├── RiskBadge.tsx              # HIGH/MEDIUM/LOW risk level pill badge
│       │   │   ├── RiskScore.tsx              # Numerical risk score dial with color progression
│       │   │   └── SignalBadge.tsx            # Top contributing risk signal badge
│       │   ├── community/                     # Community investigation UI components
│       │   │   ├── CommunityTable.tsx         # Sortable table of detected risk communities
│       │   │   ├── EvidenceIntelligencePanel.tsx # Comprehensive Evidence Intelligence panel with filters
│       │   │   ├── EvidencePanel.tsx          # Lightweight summary evidence drawer
│       │   │   └── FeatureBreakdown.tsx       # 21-feature radar and breakdown comparison chart
│       │   ├── graph/                         # Topology graph components
│       │   │   └── NetworkGraph.tsx           # Cytoscape.js interactive graph canvas with evidence focus
│       │   ├── layout/                        # Layout, navigation, and modal components
│       │   │   ├── CaseDossierModal.tsx       # Printable Case Dossier modal with Markdown export
│       │   │   ├── Header.tsx                 # Top navigation header with status indicators and search
│       │   │   ├── InvestigationPlaybookBanner.tsx # 7-Step guided investigation workflow stepper
│       │   │   ├── Layout.tsx                 # Main layout wrapper with sidebar and header
│       │   │   ├── OmnisearchModal.tsx        # Global search modal (Ctrl+K) for accounts and communities
│       │   │   ├── SarExportModal.tsx         # FinCEN SAR XML/JSON compliance export modal
│       │   │   └── Sidebar.tsx                # Left navigation sidebar with live case counters
│       │   ├── timeline/                      # Temporal activity components
│       │   │   └── TimelineView.tsx           # Chronological transaction timeline stream
│       │   └── transaction/                   # Transaction UI components
│       │       └── TransactionTable.tsx       # Paginated table of transaction records
│       │
│       ├── pages/                             # Full-page route views
│       │   ├── AccountDetailPage.tsx          # Account 360 profile, hardware footprint, and connections
│       │   ├── AccountsListPage.tsx           # Searchable directory of all network accounts
│       │   ├── CaseDetailPage.tsx             # Comprehensive Case Dossier investigation workspace
│       │   ├── CommunitiesPage.tsx            # Directory of detected Louvain communities
│       │   ├── CommunityDetailPage.tsx        # Deep-dive community console (Graph, Evidence, Accounts)
│       │   ├── DashboardPage.tsx              # Executive SOC Dashboard with KPI HUD and Playbook launcher
│       │   ├── InvestigationsPage.tsx         # Investigation cases management and triage dashboard
│       │   ├── TransactionDetailPage.tsx      # Deep transaction audit, gateway telemetry, and risk flags
│       │   └── TransactionsListPage.tsx       # Searchable ledger of payment transactions
│       │
│       ├── types/                             # TypeScript data model definitions
│       │   ├── api.ts                         # REST API response interfaces, metrics, and evidence models
│       │   └── cases.ts                       # Investigation case, target, and status types
│       │
│       └── utils/                             # Client-side utility functions and state managers
│           ├── caseManager.ts                 # LocalStorage investigation case manager and event dispatcher
│           └── playbookManager.ts             # 7-Step Guided Playbook state machine and synchronizer
│
├── gen-fraud-graph/                           # Submodule for Santander synthetic fraud graph generator
│
├── scratch/                                   # Developer utility scripts and standalone validation runners
│   ├── run_feature_extraction.py              # Script to extract 21 features across Louvain communities
│   ├── run_risk_scoring.py                    # Script to train logistic regression & score communities
│   └── test_api_endpoints.py                  # Quick HTTPX smoke test script for API endpoints
│
├── src/                                       # Core Backend Python Package
│   ├── __init__.py                            # Package initialization
│   │
│   ├── api/                                   # FastAPI REST API implementation
│   │   ├── __init__.py                        # API package exports
│   │   ├── config.py                          # Dynamic Settings (HOST, PORT, DATA_DIR, CORS_ORIGINS)
│   │   ├── main.py                            # FastAPI application entry point, lifespan, and CORS setup
│   │   ├── schemas.py                         # Pydantic v2 data models for requests and responses
│   │   ├── service.py                         # In-memory indexed data service with query caches
│   │   └── routers/                           # Modular API endpoint routers
│   │       ├── __init__.py                    # Routers package initialization
│   │       ├── accounts.py                    # GET /api/accounts, /connections, /evidence endpoints
│   │       ├── communities.py                 # GET /api/communities, /evidence, /accounts endpoints
│   │       ├── graph.py                       # GET /api/graph/community/{id} topology endpoint
│   │       ├── health.py                      # GET /api/health server status endpoint
│   │       ├── summary.py                     # GET /api/summary platform KPI metrics endpoint
│   │       ├── timeline.py                    # GET /api/timeline/community/{id} chronological stream
│   │       └── transactions.py                # GET /api/transactions/{id} transaction detail endpoint
│   │
│   ├── data/                                  # Data enrichment and entity synthesis layer
│   │   ├── __init__.py                        # Data package initialization
│   │   ├── enrichment.py                      # Pipeline enriching transactions with device and IP entities
│   │   └── entities.py                        # Multi-layer entity generation (devices, IPs, instruments)
│   │
│   ├── detection/                             # Graph partition and community detection layer
│   │   ├── __init__.py                        # Detection package initialization
│   │   └── communities.py                     # Louvain community detection and temporal stats extraction
│   │
│   ├── evaluation/                            # Offline evaluation & label attribution (Zero-Leakage)
│   │   ├── __init__.py                        # Evaluation package initialization
│   │   └── labeler.py                         # Offline community ground-truth labeler & ring attribution
│   │
│   ├── features/                              # Feature engineering layer
│   │   ├── __init__.py                        # Features package initialization
│   │   └── community_features.py              # Extraction of 21 observable community graph features
│   │
│   ├── graph/                                 # Network construction and projection layer
│   │   ├── __init__.py                        # Graph package initialization
│   │   ├── builder.py                         # Bipartite Evidence Graph construction from data tables
│   │   └── projection.py                      # Weighted Account-Account relationship projection
│   │
│   ├── intelligence/                          # Evidence Intelligence Engine layer
│   │   ├── __init__.py                        # Intelligence package initialization
│   │   ├── evidence_engine.py                 # 9 deterministic evidence rule detectors and scoring
│   │   └── evidence_rules.py                  # Formal evidence schemas, severities, and text templates
│   │
│   └── ml/                                    # Machine learning risk scoring layer
│       ├── __init__.py                        # ML package initialization
│       └── risk_scorer.py                     # Logistic regression community risk scoring & signal ranking
│
└── tests/                                     # Automated Pytest Test Suite (207 Tests)
    ├── test_api.py                            # End-to-end FastAPI endpoint and response schema tests
    ├── test_communities.py                    # Louvain community detection determinism and stats tests
    ├── test_community_features.py             # Exact calculation tests for all 21 community features
    ├── test_enrichment.py                     # Data enrichment and entity generation tests
    ├── test_evaluation_labeler.py             # Offline ground-truth labeling and purity metric tests
    ├── test_evidence_engine.py                # Comprehensive test suite for all 9 evidence detectors
    ├── test_graph.py                          # Bipartite graph and weighted projection construction tests
    ├── test_risk_scorer.py                    # ML model training, scoring, calibration, and signal tests
    └── test_synthetic_data_fixes.py           # Verification of synthetic data integrity and zero-leakage
```

---

## 🔬 Data Pipeline & Generation

TraceLine operates on an enriched synthetic payment network derived from the SantanderAI transaction schema with strict zero-leakage separation.

To generate or reproduce the processed payment network dataset from raw transactions:

```bash
# 1. Synthesize multi-layer entities (devices, IPs, payment instruments, transactions)
python -m src.data.enrichment --raw-dir data/raw --out-dir data/processed/payment_network

# 2. Extract the 21 observable community graph features
python scratch/run_feature_extraction.py

# 3. Score communities with the explainable ML model
python scratch/run_risk_scoring.py
```

---

## 🚀 Local Quickstart & Development

### Prerequisites
- **Python**: 3.10 or higher
- **Node.js**: 18.0 or higher
- **npm**: 9.0 or higher

---

### Step 1: Backend Setup & Startup

```bash
# 1. Clone the repository
git clone <repo-url>
cd TraceLine

# 2. Create and activate a Python virtual environment
python -m venv .venv

# On Linux / macOS:
source .venv/bin/activate

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# 3. Install backend dependencies
pip install -r requirements.txt

# 4. (Optional) Install generator submodule in editable mode
pip install -e ./gen-fraud-graph

# 5. Start the FastAPI backend server
uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
```

* **API Root**: `http://127.0.0.1:8000/api`
* **Swagger Interactive Docs**: `http://127.0.0.1:8000/docs`
* **ReDoc Documentation**: `http://127.0.0.1:8000/redoc`
* **Health Endpoint**: `http://127.0.0.1:8000/api/health`

---

### Step 2: Frontend Setup & Startup

```bash
# In a second terminal window:
cd frontend

# 1. Install frontend npm dependencies
npm install

# 2. Start the Vite development server
npm run dev
```

* **Frontend SOC Console**: `http://localhost:5173/`

---

## ⚙️ Environment Variables Reference

### Backend Configuration (`.env`)

| Variable | Type | Default | Description |
|---|---|---|---|
| `HOST` | string | `0.0.0.0` | Bind host address for the Uvicorn server |
| `PORT` | integer | `8000` | Bind port number for the Uvicorn server |
| `TRACELINE_DATA_DIR` | string | `data/processed/payment_network` | Path to the indexed payment network dataset |
| `CORS_ORIGINS` | string | `http://localhost:3000,http://localhost:5173,...` | Allowed CORS origins (comma-separated, or `*`) |

### Frontend Configuration (`frontend/.env`)

| Variable | Type | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | string | `/api` | Base URL for API requests (e.g. `https://api.traceline.com`) |
| `VITE_DEV_API_TARGET` | string | `http://127.0.0.1:8000` | Target URL used by the local Vite dev proxy |

---

## 📦 Production Build & Deployment

### Production Startup Commands

#### Backend (Render / Railway / Docker)
```bash
uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
```

#### Frontend (Static Hosting / Vercel / Netlify)
```bash
cd frontend
npm run build
npm run preview
```

### Cloud Deployment Guide

#### 1. Frontend: Deploy to Vercel / Netlify
- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL`: `https://<your-backend-url>`
- *Note: `frontend/vercel.json` and `frontend/public/_redirects` are pre-configured for client-side single-page routing.*

#### 2. Backend: Deploy to Render / Railway
- **Environment**: Python 3.10+
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `TRACELINE_DATA_DIR`: `data/processed/payment_network`
  - `CORS_ORIGINS`: `https://<your-frontend-domain>,http://localhost:5173`

---

## 📡 API Endpoints Reference

All endpoints are served under `/api` and adhere to strict zero-leakage observable contracts:

| HTTP Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status, API version, and timestamp |
| `GET` | `/api/summary` | High-level platform KPIs (total accounts, transactions, communities, risk counts) |
| `GET` | `/api/communities` | Paginated list of detected Louvain communities with ML risk scores and signals |
| `GET` | `/api/communities/{id}` | Detailed metrics, 21-feature breakdown, and stats for a specific community |
| `GET` | `/api/communities/{id}/accounts` | Paginated member accounts belonging to a community |
| `GET` | `/api/communities/{id}/evidence` | Observable evidence items and total evidence score for a community |
| `GET` | `/api/graph/community/{id}` | Cytoscape-compatible node and edge list for a community's network topology |
| `GET` | `/api/timeline/community/{id}` | Chronological transaction event stream for a community |
| `GET` | `/api/accounts` | Paginated search and directory of network accounts |
| `GET` | `/api/accounts/{id}` | Account 360 profile, hardware/IP entities, and balance information |
| `GET` | `/api/accounts/{id}/transactions` | Paginated transaction history for an account (sent, received, or all) |
| `GET` | `/api/accounts/{id}/connections` | Direct shared-entity connections and edge weights with peer accounts |
| `GET` | `/api/accounts/{id}/evidence` | Observable evidence intelligence items specific to an account |
| `GET` | `/api/transactions/{id}` | Transaction details, merchant metadata, and gateway authorization status |

---

## 🧪 Testing, Quality & Static Analysis

```bash
# 1. Run Python compilation check (0 syntax errors)
python -m compileall src tests scratch

# 2. Run Ruff static linter (0 errors)
ruff check src tests scratch

# 3. Run Mypy static type checker across all source modules (0 errors)
mypy src tests scratch

# 4. Run Pytest backend test suite (207 tests passing)
python -m pytest tests/ -q

# 5. Run Frontend linter (0 errors)
cd frontend && npm run lint

# 6. Run Frontend production TypeScript build (0 errors)
cd frontend && npm run build
```

---

## 🛡️ License & Compliance Note

TraceLine is designed for financial crime intelligence, anti-money laundering investigations, and security operations center research. Ground-truth labels are strictly quarantined from production investigation workflows. All risk metrics represent observable priority triage signals.
