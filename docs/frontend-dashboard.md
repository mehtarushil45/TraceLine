# TraceLine — Financial Crime Investigation Workstation

TraceLine is a graph-based payment fraud investigation platform and anti-money laundering (AML) intelligence system. It combines unsupervised Louvain community detection and explainable risk scoring over 50,000 payment accounts with a high-density, professional Dark Graphite investigation workstation.

---

## 1. System Architecture & Tech Stack

```
                          ┌────────────────────────────────────────────────────────┐
                          │   TraceLine — Financial Crime Console (React 19)       │
                          │   - Plus Jakarta Sans & JetBrains Mono Fonts           │
                          │   - High-Density Dark Graphite Design System           │
                          │   - Omnisearch Modal [⌘K / Ctrl+K]                     │
                          │   - ISO-20022 Aligned SAR Forensic Dossier Generator   │
                          │   - Persistent Multi-Entity Case Management            │
                          └──────────────┬───────────────────────────┬─────────────┘
                                         │                           │
                                         │ Local Storage             │ HTTP / JSON API (Proxy)
                                         ▼                           ▼
                         ┌─────────────────────────────┐   ┌─────────────────────────────┐
                         │   Investigation Case Store  │   │  FastAPI Intelligence Engine│
                         │   - Open / Review / Closed  │   │  (http://127.0.0.1:8000)    │
                         │   - Persistent Analyst Log  │   └──────────────┬──────────────┘
                         └─────────────────────────────┘                  │
                                                                          │ Observable Indices
                                                                          ▼
 ┌──────────────────────────────────────┬──────────────────────────────────────┬──────────────────────────────────────┐
 │  50,000 Observable Payment Accounts  │  450,546 Verified Network Tx Events  │  59 Louvain Communities (Res=1.0)    │
 │  2,617,094 Multi-Layer Evidence Edges│  21 Observable Explainable Features  │  Ensemble ML Risk Scorer (LR + RF)   │
 └──────────────────────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Design Tokens & Visual Language (Phase 1 Foundation)

- **Canvas & Surfaces**:
  - Background Canvas: `#111214`
  - Sidebar & Headers: `#151719`
  - Surface Panels / Cards: `#1a1c1f`
  - Subtle Surface: `#22252a`
  - Borders: `#282b30` / `#33373e`
- **Typography**:
  - Text Main: `#e6e7e9`
  - Text Secondary: `#9a9da3`
  - Text Dim: `#666a72`
  - Fonts: **Plus Jakarta Sans** (UI and headings) + **JetBrains Mono** (financial amounts, hashes, IDs)
- **Accents & Risk Semantics**:
  - Cold Blue Accent: `#3b82f6`
  - High Risk: `#ef4444`
  - Medium Risk: `#f59e0b`
  - Low Risk: `#10b981`

---

## 3. Workspaces & Key Capabilities

### A. Risk Queue & Triage (`/`)
- **Network Scope Metrics**: Summary cards displaying total network accounts (50k), verified transactions (450.5k), graph evidence edges (2.61M), and Louvain clusters (59).
- **Cluster Triage Queue**: Sortable, filterable `DataTable` displaying risk scores, cluster sizes, top observable signals, and quick-action buttons (`Add to Case`, `Investigate →`).
- **Real-Time Search & Tier Filters**: Filter by `HIGH`, `MEDIUM`, `LOW` risk tiers with instant text search across cluster IDs.

### B. Universal Omnisearch (`[⌘K]` / `[Ctrl+K]`) & SAR Export
- **Omnisearch Modal**: Instant search across Communities (`#0`–`#58`), Accounts (`acc_...`), Transactions (`tx_...`), and Investigation Cases.
- **Forensic SAR Dossier Generator**: One-click generation of formal **Suspicious Activity Reports** (ISO-20022 aligned) ready to copy or download as Markdown.

### C. Community Investigation Workspace (`/communities/:communityId`)
- **Cluster Overview**: Community ID, member count, ML risk score priority, and risk level.
- **Model vs. Observable Evidence Analysis**: Feature group comparisons against network baselines.
- **Deterministic Evidence Rules Table**: Severity-ranked observable evidence items with supporting entity links.
- **Interactive Cytoscape.js Network Graph**: Evidence-driven node focus, degree layouts (cose/concentric/circle), and node selection inspector.
- **Member Accounts Directory & Activity Timeline Stream**.

### D. Account Profile & Transaction Inspector (`/accounts/:id`, `/transactions/:id`)
- Customer profile, directional transaction flows (sent vs received), decline rates, and peer connections table.
- Interactive **Payment Gateway Transfer Flow** diagram ($src \rightarrow dst$) and digital footprint hardware matrix (device fingerprint, payment instrument token, IP address).

### E. Investigation Queue & Case Dossier (`/investigations`, `/investigations/:caseId`)
- Persistent case management across `OPEN` → `REVIEW` → `CLOSED` lifecycle states.
- Debounced auto-saving **Investigator Notes** editor.
- Multi-entity target attachments (Communities, Accounts, Transactions) with duplicate prevention and quick ID attachment.
- Aggregated observable evidence matrix and printable Case Dossier modal with clean `@media print` formatting.

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
*Frontend URL: `http://127.0.0.1:5173`*
