# TraceLine — Payment Network Fraud Detection & Investigation Platform

> **Live Forensic SOC Console for Payment Network Risk Ring Detection, Entity Resolution, and Observable Evidence Intelligence.**

TraceLine is a production-grade fraud investigation platform designed to analyze multi-account payment networks, detect collusive fraud rings using graph algorithms (Louvain community detection), explain risk through an ensemble of 21 observable topological features, and provide guided forensic workflows for financial crime investigators.

---

## 🌟 Key Capabilities

- **Observable-Only Evidence Intelligence Engine**: 9 deterministic rule detectors analyzing device reuse, shared funding instruments, temporal burst velocities, and gateway decline spikes with **zero ground-truth label leakage**.
- **Evidence-to-Graph Interactive Workflow**: Topology graph powered by Cytoscape.js with dynamic evidence focus highlighting, community cluster resolution, and neighborhood dimming.
- **Entity Resolution & Account Profiles**: Forensic breakdown of individual account balances, hardware footprints, IP telemetry, and money flow connections.
- **7-Step Guided Investigation Playbook**: Linear forensic path linking Community Triage $\rightarrow$ Evidence Intelligence $\rightarrow$ Network Graph $\rightarrow$ Account Profile $\rightarrow$ Transaction Audit $\rightarrow$ Case Dossier $\rightarrow$ Print Export.
- **Print-Ready Case Dossier & Markdown Export**: Generate structured, printable forensic investigation reports (`TraceLine Investigation Dossier`) with compliance attestations via `window.print()` and `.md` downloads.

---

## 🏗️ Architecture & Technology Stack

```
TraceLine Platform Architecture
┌────────────────────────────────────────────────────────┐
│  React 19 + TypeScript + Cytoscape.js Frontend         │
│  (Dark Financial SOC Console / Vite / React Router 7)  │
└─────────────────────────┬──────────────────────────────┘
                          │ HTTP REST / JSON
┌─────────────────────────▼──────────────────────────────┐
│  FastAPI + Uvicorn Asynchronous Backend                │
│  (Configurable CORS / In-Memory Indexed Data Service)  │
└─────────────────────────┬──────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────┐
│  Evidence Intelligence Engine & ML Risk Models         │
│  (9 Observable Detectors / 21 Observable Features)     │
└─────────────────────────┬──────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────┐
│  Graph & Partition Topology (Louvain / NetworkX)       │
│  data/processed/payment_network/                       │
└────────────────────────────────────────────────────────┘
```

- **Backend**: FastAPI 0.110+, Python 3.10+, NetworkX, Scikit-Learn, XGBoost, Pandas, Numpy, Pydantic v2.
- **Frontend**: React 19, TypeScript, Vite 8, Cytoscape.js, Lucide Icons, Vanilla CSS Design System.

---

## 🚀 Quickstart & Local Development

### Prerequisites
- **Python**: 3.10 or higher (Python 3.11+ recommended)
- **Node.js**: 18.0 or higher (Node 20+ recommended)
- **npm**: 9.0 or higher

---

### 1. Backend Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd TraceLine

# 2. Create and activate a virtual environment
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# 3. Install backend dependencies
pip install -r requirements.txt

# 4. (Optional) Configure environment variables
cp .env.example .env

# 5. Start the FastAPI development server
uvicorn src.api.main:app --host 127.0.0.1 --port 8000 --reload
```

* API Root: `http://127.0.0.1:8000/api`
* Interactive API Documentation (Swagger UI): `http://127.0.0.1:8000/docs`
* Alternative Documentation (ReDoc): `http://127.0.0.1:8000/redoc`
* API Health Check: `http://127.0.0.1:8000/api/health`

---

### 2. Frontend Setup

```bash
# In a new terminal window:
cd frontend

# 1. Install frontend dependencies
npm install

# 2. Start Vite development server
npm run dev
```

* Frontend Application Console: `http://localhost:5173/`

---

## ⚙️ Environment Variables Reference

### Backend Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind host for the Uvicorn server |
| `PORT` | `8000` | Bind port for the Uvicorn server |
| `TRACELINE_DATA_DIR` | `data/processed/payment_network` | Path to pre-indexed payment network dataset |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173,...` | Comma-separated list of allowed CORS origins (or `*`) |

### Frontend Configuration (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Base URL for API requests (e.g. `https://traceline-api.onrender.com`) |
| `VITE_DEV_API_TARGET` | `http://127.0.0.1:8000` | Target URL used by the local Vite dev proxy |

---

## 📦 Production Build & Deployment

### Production Startup Commands

#### Backend (Production)
```bash
# Run with Uvicorn in production mode
uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2
```

#### Frontend (Production Build)
```bash
cd frontend
npm run build
npm run preview
```

---

### Deployment Guide

#### 1. Frontend: Deploy to Vercel / Netlify
- **Framework Preset**: Vite
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL`: `https://<your-backend-domain>`
- *Note: `frontend/vercel.json` and `frontend/public/_redirects` are pre-configured for client-side React Router navigation.*

#### 2. Backend: Deploy to Render / Railway
- **Environment**: Python 3.10+
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn src.api.main:app --host 0.0.0.0 --port $PORT`
- **Environment Variables**:
  - `TRACELINE_DATA_DIR`: `data/processed/payment_network`
  - `CORS_ORIGINS`: `https://<your-frontend-domain>,http://localhost:5173`

---

## 📊 Data Pipeline & Generation

TraceLine operates on an enriched synthetic payment network derived from the SantanderAI schema with zero leakage of evaluation labels to investigator endpoints.

To regenerate the processed payment network dataset from raw files:

```bash
# 1. Synthesize multi-layer entities (devices, IPs, payment instruments, transactions)
python -m src.data.enrichment --raw-dir data/raw --out-dir data/processed/payment_network

# 2. Extract the 21 observable community graph features
python scratch/run_feature_extraction.py

# 3. Score communities with the explainable ML model
python scratch/run_risk_scoring.py
```

---

## 🧪 Testing & Verification

```bash
# Run full backend test suite (207 tests across graph, ML, API, and evidence rules)
python -m pytest tests/ -q

# Run frontend typecheck and production bundle build
cd frontend && npm run build
```

---

## 🛡️ Leakage Contract

TraceLine strictly prohibits the exposure of ground-truth evaluation artifacts (`pattern_id`, `is_ring_member`, `fraud_cases.csv`, `community_labels.csv`, `fraud_purity`, `max_ring_coverage`, `primary_ring_id`) through any user-facing API or UI view. All scores represent **observable ML risk triage priorities**, not calibrated fraud probabilities.
