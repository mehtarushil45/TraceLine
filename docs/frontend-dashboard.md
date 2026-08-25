# TraceLine AI | Razorpay Risk & Fraud Intelligence Hub

TraceLine is a next-generation graph-based payment fraud intelligence and investigation platform tailored for the **Razorpay Buildathon**. It combines unsupervised Louvain community detection and explainable ensemble ML over 50,000 payment accounts with an elite cyber-SOC investigator workspace.

---

## 1. System Architecture & Tech Stack

```
                          ┌────────────────────────────────────────────────────────┐
                          │   TraceLine AI | Razorpay Cyber Risk Hub (React 19)    │
                          │   - Plus Jakarta Sans & JetBrains Mono Fonts           │
                          │   - Glassmorphism & Cyber Grid Design System           │
                          │   - Omnisearch Modal [⌘K / Ctrl+K]                     │
                          │   - ISO-20022 Aligned SAR Forensic Dossier Generator   │
                          │   - Persistent Case Management & Target Watchlist      │
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

## 2. Elite Design Tokens & Visual Aesthetics

- **Color System**:
  - **Background**: Deep Obsidian `#030712` and `#050a18` with subtle cyber grid texture and ambient radial glow gradients.
  - **Razorpay Brand & Accents**: Electric Razorpay Blue (`#0C2340`, `#0284c7`, `#3395FF`), Neon Cyan (`#00F0FF`), Cyber Purple (`#8b5cf6`), Signal Crimson (`#f43f5e`), Signal Amber (`#fbbf24`), Signal Emerald (`#10b981`).
  - **Surface Treatment**: Glassmorphism cards (`backdrop-filter: blur(16px); background: rgba(11, 19, 41, 0.75); border: 1px solid rgba(56, 189, 248, 0.12);`).
  - **Typography**: Google Fonts **Plus Jakarta Sans** (clean, futuristic fintech headlines) + **JetBrains Mono** (hashes, transaction IDs, currencies, graph telemetry).

---

## 3. Workspaces & Key Capabilities

### A. Executive Security Operations Command (`/dashboard`)
- **Live Threat Radar HUD**: Highlights network threat concentration (17 High-Risk clusters identified across 50,000 accounts).
- **Flagship Quick Triage Shortcut**: Direct access to prioritize cluster **Community #3** (Risk Score 92/100, 1,231 members, heavy device & instrument reuse).
- **4 Glowing Glassmorphic KPI Cards**: Accounts (50k), Transactions (450.5k), Graph Evidence Edges (2.61M), Louvain Clusters (59).
- **Observable Fraud Typology Matrix**: 4 visual cards breaking down *Hardware & Device Clustering*, *Payment Instrument Collusion*, *Temporal Micro-Bursting*, and *Decline Velocity Spikes*.
- **Risk Spectrum Distribution Bar**: Multi-segmented progress bar for High (28.8%), Medium (22.0%), and Low (49.2%) clusters.
- **Top Flagged Communities Leaderboard**: Table with risk gauges, density metrics, mean edge weights, observable signal tags, and instant `Add to Investigation` buttons.

### B. Universal Omnisearch (`[⌘K]` / `[Ctrl+K]`) & SAR Export
- **Omnisearch Modal**: Instant fuzzy searching across Community IDs (`#0`–`#58`), Accounts (`acc_...`), Transactions (`tx_...`), and Cases.
- **Forensic SAR Dossier Generator**: One-click generation of formal **Suspicious Activity Reports** (ISO-20022 aligned) ready to copy or download as Markdown (`.md`).

### C. Community Investigation Workspace (`/communities/:communityId`)
- **Flagship Hero Banner**: Community ID, Louvain Cluster Index, ML Risk Score meter, Total Network Volume, Member Accounts.
- **Razorpay Explainable AI Evidence Panel**: Natural language forensic summary, top 3 observable signal cards with feature delta intensity bars.
- **4 Feature Dimension Cards (21 Observable Features)**: Graph Topology (4), Entity Sharing (6), Temporal Velocity (5), Transaction Analytics (6).
- **Interactive Network Topology Graph (Cytoscape)**:
  - Deep space cyber canvas with glowing cyan nodes and bezier evidence edges.
  - Layout engine selector: Force-Directed (Cose), Concentric (Degree), Circular.
  - Interactive side-drawers on node and edge click detailing degrees, balances, shared cards, devices, IPs, and temporal overlap.
- **Member Accounts Directory & Activity Timeline Stream**.

### D. Account Profile & Transaction Inspector (`/accounts/:id`, `/transactions/:id`)
- Customer KYC profile, outgoing vs incoming flow metrics, decline rates, connected peer matrix.
- Interactive **Payment Gateway Transfer Flow** diagram and observable digital footprint breakdown (hardware fingerprint, card token, IP address).

### E. Investigation Queue & Case Workspace (`/investigations`, `/investigations/:caseId`)
- Persistent case management across `OPEN` → `UNDER REVIEW` → `CLOSED` status workflows.
- Auto-saving **Investigator Notes** editor.
- Multi-entity target watchlist categorized by Communities, Accounts, and Transactions with one-click navigation and quick ID attach.

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
