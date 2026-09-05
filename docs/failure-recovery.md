# TraceLine — Failure Recovery: What Broke and How We Got Out

This document provides complete, transparent documentation of real engineering failures encountered during the development of TraceLine, the root causes identified, the architectural remedies implemented, and the verification proving stability.

---

## Incident 1: API Service Contract Mismatch & DataFrame Serialization Failures

### What Broke
Under initial integration testing, several core FastAPI endpoints (`/api/communities/{id}`, `/api/communities/{id}/accounts`, and `/api/graph/community/{id}`) threw unhandled HTTP 500 errors and Pydantic validation failures when serving real community payloads.

### What We Observed
FastAPI logs reported `pydantic_core._pydantic_core.ValidationError` exceptions stating:
- Input should be a valid number, unable to parse string as a number
- Value is not a valid float (encountered `NaN` / `None` from Pandas Series)
- Missing required fields when returning account summaries and evidence finding dictionaries.

Client requests received HTTP 500 Internal Server Error, preventing the frontend from rendering community dossiers.

### Root Cause Analysis
In `src/api/service.py`, data was loaded directly from underlying Pandas DataFrames (`accounts_df`, `transactions_df`, `community_risk_scores_df`). When an account had missing telemetry (e.g. `balance=NaN` or `account_risk_score=None`), raw Pandas extraction produced NumPy `np.nan` values and non-standard scalar types. 

Pydantic v2 strict models in `src/api/schemas.py` correctly rejected `np.nan` where strict JSON-compliant `float | None` types were expected. Furthermore, dictionary key lookups for member mappings lacked defensive fallback defaults.

### What Changed
1. **Sanitization Boundary**: Implemented the `_sanitize_float(val, default=0.0)` helper in `src/api/service.py` to intercept all numeric extractions from DataFrames, converting `NaN`, `inf`, and `-inf` to standard Python `float` or fallback defaults before passing to Pydantic models.
2. **Explicit Schema Bounds**: Updated `AccountSummary`, `CommunityDetailResponse`, and `GraphNode` in `src/api/schemas.py` to allow nullable floats (`float | None = None`) where telemetry may be legitimately sparse.
3. **Defensive Lookups**: Added safe `.get()` fallbacks for community membership, edge dictionaries, and transaction indices.

### How We Verified the Fix
- Executed `pytest tests/test_api.py -v` (20 passed).
- Executed `pytest tests/test_forensic_semantics.py -v` (3 passed).
- Executed live API query suite across all endpoints for multiple communities, verifying zero HTTP 500 errors and strict schema adherence.

### What We Learned
Data science pipelines and REST API services must never share raw DataFrame types across boundaries. A deterministic sanitization and validation layer at the service interface is mandatory to preserve API contract guarantees.

---

## Incident 2: Forensic Graph Focal Edge Truncation & Stale Slice Sticking

### What Broke
When an investigator navigated from the **Accounts** view to the **Network** graph in the **Relationship** lens by clicking "Focus In Graph" on a primary hub (e.g. `acc_44140`), the graph and the Investigative Thread showed only **13 relationships**, directly contradicting the **56 links** explicitly stated on the Accounts card and community evidence. 

Furthermore, clicking different accounts in the table reused stale graph slices, causing different or incomplete topologies to appear on each visit.

### What We Observed
1. The **Entity Role Matrix** card displayed: `acc_44140 · 56 links · $19,629.3 balance`.
2. The **Investigative Thread** panel inside Network displayed:
   - `DETERMINISTIC OBSERVATION: acc_44140 has 13 directly observed relationships within this community partition.`
   - `DETERMINISTIC OBSERVATION: Account acc_44140 is connected to 56 other accounts within this community...`
   A glaring, unacceptable contradiction in the forensic investigation surface.
3. The Cytoscape canvas scattered nodes into different positions on every mount, making the graph rotate and jump randomly.

### Root Cause Analysis
1. **Edge Truncation Under Cap**: Community #3 contains 9,690 internal edges. In `src/api/service.py::get_community_graph`, edge collection looped through `all_edges` and broke immediately when `len(edges) >= max_edges` (500). Because background community edges filled the 500-edge quota first, the remaining 43 edges connected to `acc_44140` (located later in `all_edges`) were dropped.
2. **Stale Client Slice Guard**: In `ForensicWorkspacePage.tsx`, the graph refetch effect checked:
   ```typescript
   if (graphData) {
     if (!focusParam || graphData.nodes.some((n) => n.id === focusParam)) {
       return;
     }
   }
   ```
   Because `acc_44140` was already present as a top hub in the generic un-focalized 200-node slice, the client assumed the graph was up-to-date and refused to fetch the focal-specific slice, locking the investigator into the truncated 13-edge graph.
3. **Random Physics Initialization**: In `NetworkGraph.tsx`, Cytoscape's `cose` layout ran with `randomize: true` by default, scattering nodes with `Math.random()` on every layout run.
4. **Unordered Set Iteration**: In `service.py`, `selected_nodes_set` was iterated as an unordered Python set, producing non-deterministic node ordering across restarts.

### What Changed
1. **Focal Edge Prioritization (`src/api/service.py`)**:
   - Partitioned candidate edges into `focal_edges` (touching `focal_account_id`) and `other_edges`.
   - Sorted both lists deterministically by weight descending.
   - Prioritized **all focal edges first**, guaranteeing that 100% of the active subject's ego-network is included before filling remaining capacity with top community edges.
   - Deterministically sorted nodes (focal first, then degree, balance, ID) and edges.
2. **Guaranteed Focal Hydration (`ForensicWorkspacePage.tsx`)**:
   - Replaced the flawed `some()` check with `loadedGraphFocal` state tracking. Navigating with an active account guarantees that the exact focal neighborhood is fetched and rendered.
   - Defaulted lens to `relationship` whenever a focal account is active.
   - Synchronized `focusedNodeId` with URL `focusParam`.
3. **Deterministic Physics Coordinates (`NetworkGraph.tsx`)**:
   - Set `randomize: false` in `coseOpts`, ensuring that the physics engine converges identically without random rotation.
4. **Stable Primary Hub Ranking (`EntityRoleMatrix.tsx`)**:
   - Explicitly sorted nodes by degree, balance, and ID before taking `slice(0, 6)`.

### How We Verified the Fix
- Live API verification script confirmed exact edge counts:
  - `acc_44140`: Exactly **56 edges** (100% link recovery).
  - `acc_21371`: Exactly **22 edges** (100% link recovery).
  - `acc_43865`: Exactly **25 edges** (100% link recovery).
  - `acc_9953`: Exactly **19 edges** (100% link recovery).
- Ran frontend semantic test suite (`npm --prefix frontend test`): all 17 tests passed.
- Ran backend test suite (`pytest tests/test_forensic_semantics.py tests/test_api.py -v`): all 24 tests passed.

### What We Learned
Graph sampling algorithms must never truncate edges belonging to the primary entity under active investigation. In financial forensics, investigators rely on mathematical consistency; showing contradictory link counts erodes trust immediately.

---

## Incident 3: The 59-Request Stampede & Destructive Route State Teardown

### What Broke
On initial website load, navigating between pages (e.g. Dashboard → Communities → Forensic Workspace → Dashboard) felt sluggish. Returning to a previously visited page destroyed the user's view state, triggering full data refetches with flashing empty skeleton screens.

### What We Observed
- Browser DevTools revealed that mounting `DashboardPage` and `CommunitiesPage` triggered **59 concurrent HTTP requests** to `/api/communities/{id}/evidence`.
- Each request took 0.5s–1.5s on the single-worker backend, saturating the Python server and creating a 3–8 second request queue.
- Initial JavaScript bundle size was >1MB, forcing the browser to download and parse Cytoscape and heavy canvas modules even on simple table views.
- Navigating back to a page reset React state (`useState(true)`), causing jarring UI flicker.

### Root Cause Analysis
1. **Unthrottled Fan-Out**: Both pages executed `Promise.all` over all 59 Louvain communities to fetch evidence summaries simultaneously.
2. **Duplicate Fetch Loop**: In `DashboardPage.tsx`, the `loadData` function had `summary` in its dependency array. Updating `summary` immediately triggered a duplicate fetch cycle.
3. **Monolithic Bundle**: All 12 page routes and visualization dependencies were bundled into a single entry file (`index.js`).
4. **State Destruction**: React Router unmounted page components upon route transitions, discarding local state without a client caching layer.

### What Changed
1. **Server-Side In-Memory Cache & Pre-Warming (`src/api/service.py`, `src/api/main.py`)**:
   - Added thread-safe in-memory caching to `get_summary`, `get_communities`, `get_community_detail`, `get_community_evidence`, and `get_community_graph` (<0.5ms response time on cache hit).
   - Added `prewarm_cache()` connected to FastAPI's startup lifespan, computing top summary metrics and Community #3 intelligence during boot.
2. **Elimination of the 59-Request Stampede (`DashboardPage.tsx`, `CommunitiesPage.tsx`)**:
   - Replaced unthrottled bursts with priority hydration of only the top 5 highest-risk communities via `Promise.allSettled`.
   - Removed `summary` from `loadData` dependencies to eliminate duplicate fetches.
3. **SWR Client Cache & Synchronous Hydration (`client.ts`, `useApiQuery.ts`)**:
   - Implemented an SWR client cache allowing pages to initialize state directly from cache:
     `const [evidence, setEvidence] = useState(cached || null); const [loading, setLoading] = useState(!cached);`
   - Returning to a visited page renders data at **0ms with zero skeleton flicker**, while quiet background revalidation keeps data fresh.
4. **Route Code-Splitting (`App.tsx`, `Sidebar.tsx`)**:
   - Code-split all 12 page routes using `React.lazy()` wrapped in `<Suspense>`.
   - Initial shell bundle dropped from **>1,000 kB** down to **237 kB (73 kB gzipped)**.
   - Cytoscape engine isolated to `ForensicWorkspacePage` chunk (568 kB) and loaded only when needed.
   - Added anticipatory hover prefetching in `Sidebar.tsx`.
5. **State & Scroll Restoration (`Layout.tsx`)**:
   - Persisted active investigation community and tab in `sessionStorage`.
   - Implemented per-route scroll position tracking and restoration on back/forward browser navigation.

### How We Verified the Fix
- Production build benchmark (`npm --prefix frontend run build`): built in 962ms; initial bundle 237 kB (73 kB gzipped).
- Latency benchmark: repeated API calls dropped from 500–1200ms to <0.5ms.
- Verified zero skeleton flash on back/forward navigation across all routes.
- Frontend test suite (17 tests) and backend test suite (24 tests) passed cleanly.

### What We Learned
Modern financial SOC consoles require sub-second responsiveness. High client-side concurrency easily chokes API workers; separating critical path data from background enrichment and utilizing SWR caching is essential for professional-grade stability.
