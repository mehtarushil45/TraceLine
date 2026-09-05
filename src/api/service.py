"""TraceLine Data Access and Service Layer.

Provides high-performance, in-memory indexed access to observable payment network
data, community detection structures, and ML risk scores for the FastAPI layer.

Leakage Contract
----------------
This service strictly enforces that no ground-truth or evaluation data
(e.g., pattern_id, is_ring_member, fraud_cases.csv, ground-truth community labels)
is ever stored, indexed, or returned to callers.
"""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any

import pandas as pd

from src.api.config import settings
from src.api.schemas import (
    AccountConnectionsResponse,
    AccountDetailResponse,
    AccountEvidenceResponse,
    AccountPeerStatsResponse,
    AccountRegistryItem,
    AccountSummary,
    AccountTransactionStats,
    CommunityDetailResponse,
    CommunityEvidenceResponse,
    CommunityGraphResponse,
    CommunityListResponse,
    CommunitySummary,
    CommunityTimelineResponse,
    ConnectionItem,
    CounterpartyTransactionItem,
    EntitySharingStats,
    EvidenceItemSchema,
    GraphEdge,
    GraphNode,
    PaginatedAccountsRegistryResponse,
    PaginatedAccountsResponse,
    PaginatedTransactionListResponse,
    PaginatedTransactionsResponse,
    SummaryResponse,
    TemporalStats,
    TimelineEvent,
    TransactionCounterpartyResponse,
    TransactionDetailResponse,
    TransactionItem,
    TransactionListItem,
    TransactionStats,
)
from src.features.community_features import FEATURE_NAMES, FORBIDDEN_COLUMNS

logger = logging.getLogger("traceline.service")


def _sanitize_float(val: Any) -> float | None:
    """Convert float value, returning None for NaN or Inf."""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (ValueError, TypeError):
        return None


def _to_float(val: Any, default: float = 0.0) -> float:
    """Convert float value with a guaranteed non-None fallback."""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


def _to_int(val: Any, default: int = 0) -> int:
    """Convert int value with a guaranteed non-None fallback."""
    if val is None:
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


class TraceLineService:
    """Singleton service providing fast in-memory query capabilities."""

    def __init__(self, data_dir: Path | str | None = None) -> None:
        self.data_dir = Path(data_dir) if data_dir is not None else settings.DATA_DIR
        self._is_loaded = False

        # In-memory datasets
        self.accounts_df: pd.DataFrame = pd.DataFrame()
        self.transactions_df: pd.DataFrame = pd.DataFrame()
        self.merchants_df: pd.DataFrame = pd.DataFrame()
        self.community_features_df: pd.DataFrame = pd.DataFrame()
        self.community_risk_scores_df: pd.DataFrame = pd.DataFrame()

        # Indexes & lookup tables
        self.community_to_accounts: dict[int, list[str]] = {}
        self.account_to_community: dict[str, int] = {}
        self.account_sent_tx_indices: dict[str, list[int]] = {}
        self.account_recv_tx_indices: dict[str, list[int]] = {}
        self.account_tx_aggregates: dict[str, list[Any]] = {}
        self.tx_id_to_index: dict[str, int] = {}
        self.account_connections_map: dict[str, list[dict[str, Any]]] = {}
        self.community_edges_map: dict[int, list[dict[str, Any]]] = {}

        # System counts
        self.total_accounts: int = 0
        self.total_transactions: int = 0
        self.total_communities: int = 0
        self.total_graph_edges: int = 2617094  # Total AccountGraph projected edges

        # In-memory response caches (microsecond retrieval)
        self._summary_cache: SummaryResponse | None = None
        self._communities_cache: CommunityListResponse | None = None
        self._community_detail_cache: dict[int, CommunityDetailResponse] = {}
        self._evidence_cache: dict[int, CommunityEvidenceResponse] = {}
        self._graph_cache: dict[str, CommunityGraphResponse] = {}

    def load_data(self) -> None:
        """Load and index all observable datasets into memory."""
        if self._is_loaded:
            return

        logger.info("Loading TraceLine datasets from %s...", self.data_dir)

        # 1. Accounts
        acc_path = self.data_dir / "accounts.csv"
        if acc_path.exists():
            self.accounts_df = pd.read_csv(acc_path)
            self.accounts_df["account_id"] = self.accounts_df["account_id"].astype(str)
            self.accounts_df.set_index("account_id", drop=False, inplace=True)
            self.total_accounts = len(self.accounts_df)
        else:
            logger.warning("accounts.csv not found at %s", acc_path)

        # 2. Merchants
        mch_path = self.data_dir / "merchants.csv"
        if mch_path.exists():
            self.merchants_df = pd.read_csv(mch_path)
            self.merchants_df["merchant_id"] = self.merchants_df["merchant_id"].astype(str)
            self.merchants_df.set_index("merchant_id", drop=False, inplace=True)

        # 3. Community features & risk scores
        feat_path = self.data_dir / "community_features.csv"
        if feat_path.exists():
            self.community_features_df = pd.read_csv(feat_path, index_col="community_id")

        risk_path = self.data_dir / "community_risk_scores.csv"
        if risk_path.exists():
            self.community_risk_scores_df = pd.read_csv(risk_path, index_col="community_id")
            self.total_communities = len(self.community_risk_scores_df)

        # 4. Community memberships
        mem_path = self.data_dir / "community_members.csv"
        if mem_path.exists():
            mem_df = pd.read_csv(mem_path)
            for _, row in mem_df.iterrows():
                acc = str(row.get("account_id") or "")
                cid = _to_int(row.get("community_id"), 0)
                self.account_to_community[acc] = cid
                self.community_to_accounts.setdefault(cid, []).append(acc)
        else:
            logger.info("community_members.csv not found on disk; building from community IDs if available")

        # 5. Transactions (strictly observable columns only)
        tx_path = self.data_dir / "enriched_transactions.csv"
        if tx_path.exists():
            # Load with observable columns only to prevent any label leakage
            use_cols = [
                "transaction_id",
                "timestamp",
                "amount",
                "src_account_id",
                "dst_account_id",
                "merchant_id",
                "device_id",
                "payment_instrument_id",
                "ip_address",
                "payment_method",
                "account_age_days",
                "transaction_status",
            ]
            self.transactions_df = pd.read_csv(tx_path, usecols=lambda c: c in use_cols)
            
            # Ensure forbidden columns are completely excluded
            for col in FORBIDDEN_COLUMNS:
                if col in self.transactions_df.columns:
                    self.transactions_df.drop(columns=[col], inplace=True)

            self.transactions_df["transaction_id"] = self.transactions_df["transaction_id"].astype(str)
            self.transactions_df["src_account_id"] = self.transactions_df["src_account_id"].astype(str)
            self.transactions_df["dst_account_id"] = self.transactions_df["dst_account_id"].astype(str)

            self.total_transactions = len(self.transactions_df)

            # Build fast lookup indices for transactions
            src_col = self.transactions_df["src_account_id"].values
            dst_col = self.transactions_df["dst_account_id"].values
            tx_id_col = self.transactions_df["transaction_id"].values
            amount_col = self.transactions_df["amount"].values
            status_col = self.transactions_df["transaction_status"].values

            for idx, (src, dst, tx_id, amt, st) in enumerate(
                zip(src_col, dst_col, tx_id_col, amount_col, status_col)
            ):
                self.account_sent_tx_indices.setdefault(src, []).append(idx)
                self.account_recv_tx_indices.setdefault(dst, []).append(idx)
                self.tx_id_to_index[tx_id] = idx

                is_dec = 1 if st == "declined" else 0
                if src not in self.account_tx_aggregates:
                    self.account_tx_aggregates[src] = [0, 0, 0.0, 0.0, 0]
                s = self.account_tx_aggregates[src]
                s[0] += 1
                s[2] += float(amt)
                if is_dec:
                    s[4] += 1

                if dst not in self.account_tx_aggregates:
                    self.account_tx_aggregates[dst] = [0, 0, 0.0, 0.0, 0]
                r = self.account_tx_aggregates[dst]
                r[1] += 1
                r[3] += float(amt)
                if is_dec:
                    r[4] += 1


        # 6. Community edges / connections
        # Try loading precomputed community edges if present
        edges_path = self.data_dir / "community_edges.json"
        if edges_path.exists():
            try:
                with open(edges_path, "r", encoding="utf-8") as f:
                    edges_data = json.load(f)
                    for cid_str, edge_list in edges_data.items():
                        cid = int(cid_str)
                        self.community_edges_map[cid] = edge_list
                        for e in edge_list:
                            src = e["source"]
                            dst = e["target"]
                            self.account_connections_map.setdefault(src, []).append(
                                {
                                    "connected_account_id": dst,
                                    "edge_weight": e["weight"],
                                    "shared_devices": e.get("shared_devices", []),
                                    "shared_payment_instruments": e.get("shared_instruments", []),
                                    "shared_ips": e.get("shared_ips", []),
                                    "shared_merchants": e.get("shared_merchants", []),
                                    "temporal_overlap": e.get("temporal_overlap", 0),
                                }
                            )
                            self.account_connections_map.setdefault(dst, []).append(
                                {
                                    "connected_account_id": src,
                                    "edge_weight": e["weight"],
                                    "shared_devices": e.get("shared_devices", []),
                                    "shared_payment_instruments": e.get("shared_instruments", []),
                                    "shared_ips": e.get("shared_ips", []),
                                    "shared_merchants": e.get("shared_merchants", []),
                                    "temporal_overlap": e.get("temporal_overlap", 0),
                                }
                            )
            except (json.JSONDecodeError, OSError, KeyError, TypeError, ValueError) as e:
                logger.warning("Could not load community_edges.json: %s", e)

        self._is_loaded = True
        logger.info(
            "TraceLineService successfully initialized (%d accounts, %d transactions, %d communities)",
            self.total_accounts,
            self.total_transactions,
            self.total_communities,
        )

    # -----------------------------------------------------------------------
    # API Methods
    # -----------------------------------------------------------------------

    def get_summary(self) -> SummaryResponse:
        """Return system-wide summary metrics."""
        self.load_data()
        if self._summary_cache is not None:
            return self._summary_cache
        
        tier_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
        if not self.community_risk_scores_df.empty and "risk_level" in self.community_risk_scores_df.columns:
            counts = self.community_risk_scores_df["risk_level"].value_counts().to_dict()
            tier_counts["HIGH"] = counts.get("HIGH", 0)
            tier_counts["MEDIUM"] = counts.get("MEDIUM", 0)
            tier_counts["LOW"] = counts.get("LOW", 0)

        res = SummaryResponse(
            account_count=self.total_accounts,
            transaction_count=self.total_transactions,
            community_count=self.total_communities,
            high_risk_count=tier_counts["HIGH"],
            medium_risk_count=tier_counts["MEDIUM"],
            low_risk_count=tier_counts["LOW"],
            graph_edge_count=self.total_graph_edges,
        )
        self._summary_cache = res
        return res

    def get_communities(self) -> CommunityListResponse:
        """Return all communities sorted by risk_score descending."""
        self.load_data()
        if self._communities_cache is not None:
            return self._communities_cache

        if self.community_risk_scores_df.empty:
            return CommunityListResponse(total=0, items=[])

        # Merge risk scores with features
        merged = self.community_risk_scores_df.join(self.community_features_df, how="left")
        merged.sort_values(by=["risk_score", "risk_probability"], ascending=[False, False], inplace=True)

        items: list[CommunitySummary] = []
        for cid, row in merged.iterrows():
            cid_int = _to_int(cid, 0)
            items.append(
                CommunitySummary(
                    community_id=cid_int,
                    member_count=_to_int(row.get("member_count"), len(self.community_to_accounts.get(cid_int, []))),
                    risk_score=_to_int(row.get("risk_score"), 0),
                    risk_probability=round(_to_float(row.get("risk_probability"), 0.0), 4),
                    risk_level=str(row.get("risk_level") or "LOW"),
                    top_signal_1=str(row.get("top_signal_1") or ""),
                    top_signal_2=str(row.get("top_signal_2") or ""),
                    top_signal_3=str(row.get("top_signal_3") or ""),
                    density=round(_to_float(row.get("density"), 0.0), 6),
                    mean_edge_weight=_sanitize_float(row.get("mean_edge_weight")),
                    tx_per_member=round(_to_float(row.get("tx_per_member"), 0.0), 2),
                    total_transaction_amount=round(_to_float(row.get("total_transaction_amount"), 0.0), 2),
                )
            )

        res = CommunityListResponse(total=len(items), items=items)
        self._communities_cache = res
        return res

    def get_community_detail(self, community_id: int) -> CommunityDetailResponse | None:
        """Return detailed metrics and features for a single community."""
        self.load_data()
        if community_id in self._community_detail_cache:
            return self._community_detail_cache[community_id]

        if (
            self.community_risk_scores_df.empty
            or community_id not in self.community_risk_scores_df.index
        ):
            return None

        risk_row = self.community_risk_scores_df.loc[community_id]
        feat_row = (
            self.community_features_df.loc[community_id]
            if community_id in self.community_features_df.index
            else pd.Series()
        )

        # Build feature dict
        features: dict[str, float | None] = {}
        for feat in FEATURE_NAMES:
            features[feat] = _sanitize_float(feat_row.get(feat))

        member_count = _to_int(feat_row.get("member_count"), len(self.community_to_accounts.get(community_id, [])))
        density = _to_float(feat_row.get("density"), 0.0)
        mean_edge_weight = _sanitize_float(feat_row.get("mean_edge_weight"))
        weight_per_member = _to_float(feat_row.get("weight_per_member"), 0.0)
        total_internal_weight = weight_per_member * member_count

        possible_pairs = member_count * (member_count - 1) / 2.0 if member_count > 1 else 0
        internal_edge_count = round(density * possible_pairs)

        # Build detailed responses
        tx_stats = TransactionStats(
            total_transaction_amount=_to_float(feat_row.get("total_transaction_amount"), 0.0),
            mean_tx_amount=_sanitize_float(feat_row.get("mean_tx_amount")),
            amount_cv=_sanitize_float(feat_row.get("amount_cv")),
            declined_rate=_sanitize_float(feat_row.get("declined_rate")),
            tx_per_member=_to_float(feat_row.get("tx_per_member"), 0.0),
            unique_payment_methods=_sanitize_float(feat_row.get("unique_payment_methods")),
            merchant_category_entropy=_sanitize_float(feat_row.get("merchant_category_entropy")),
        )

        temp_stats = TemporalStats(
            temporal_compression_score=_to_float(feat_row.get("temporal_compression_score"), 0.0),
            unique_active_hours=_to_float(feat_row.get("unique_active_hours"), 0.0),
            median_inter_transaction_gap_hours=_sanitize_float(feat_row.get("median_inter_transaction_gap_hours")),
            timestamp_span_hours=None,
            min_timestamp=None,
            max_timestamp=None,
        )

        entity_sharing = EntitySharingStats(
            unique_shared_instruments=_to_float(feat_row.get("unique_shared_instruments"), 0.0),
            unique_shared_devices=_to_float(feat_row.get("unique_shared_devices"), 0.0),
            unique_shared_ips=_to_float(feat_row.get("unique_shared_ips"), 0.0),
            unique_shared_merchants=_to_float(feat_row.get("unique_shared_merchants"), 0.0),
            instrument_sharing_ratio=_to_float(feat_row.get("instrument_sharing_ratio"), 0.0),
            device_sharing_ratio=_to_float(feat_row.get("device_sharing_ratio"), 0.0),
        )

        res = CommunityDetailResponse(
            community_id=community_id,
            member_count=member_count,
            risk_score=int(risk_row["risk_score"]),
            risk_probability=round(float(risk_row["risk_probability"]), 4),
            risk_level=str(risk_row["risk_level"]),
            top_signal_1=str(risk_row.get("top_signal_1", "")),
            top_signal_2=str(risk_row.get("top_signal_2", "")),
            top_signal_3=str(risk_row.get("top_signal_3", "")),
            features=features,
            density=round(density, 6),
            mean_edge_weight=mean_edge_weight,
            total_internal_weight=round(total_internal_weight, 4),
            internal_edge_count=internal_edge_count,
            transaction_statistics=tx_stats,
            temporal_statistics=temp_stats,
            entity_sharing=entity_sharing,
        )
        self._community_detail_cache[community_id] = res
        return res

    def get_community_accounts(
        self,
        community_id: int,
        page: int = 1,
        page_size: int = 50,
        risk_level: str | None = None,
        sort_by: str = "created_desc",
        search: str | None = None,
    ) -> PaginatedAccountsResponse | None:
        """Return paginated list of accounts in a community with filtering and sorting."""
        self.load_data()

        if (
            self.community_risk_scores_df.empty
            or community_id not in self.community_risk_scores_df.index
        ):
            return None

        account_ids = list(self.community_to_accounts.get(community_id, []))

        # Filter by search (case-insensitive substring of account_id or customer_name)
        if search:
            s_clean = search.strip().lower()
            filtered_ids = []
            for aid in account_ids:
                if s_clean in aid.lower():
                    filtered_ids.append(aid)
                else:
                    cname = str(self.accounts_df.loc[aid, "customer_name"] if aid in self.accounts_df.index else "").lower()
                    if s_clean in cname:
                        filtered_ids.append(aid)
            account_ids = filtered_ids

        # Filter by risk_level (HIGH, MEDIUM, LOW)
        if risk_level and risk_level.strip().upper() not in ("ALL", ""):
            lvl_upper = risk_level.strip().upper()
            filtered_ids = []
            for aid in account_ids:
                acc_row = self.accounts_df.loc[aid] if aid in self.accounts_df.index else None
                rscore = float(acc_row.get("risk_score", 0.0)) if acc_row is not None and pd.notna(acc_row.get("risk_score")) else 0.0
                if rscore >= 0.60:
                    tier = "HIGH"
                elif rscore >= 0.35:
                    tier = "MEDIUM"
                else:
                    tier = "LOW"
                if tier == lvl_upper:
                    filtered_ids.append(aid)
            account_ids = filtered_ids

        # Deterministic sorting
        if sort_by in ("risk_asc", "risk_low"):
            account_ids.sort(
                key=lambda aid: (
                    float(self.accounts_df.loc[aid, "risk_score"]) if aid in self.accounts_df.index and pd.notna(self.accounts_df.loc[aid, "risk_score"]) else 0.0,
                    aid
                ),
                reverse=False,
            )
        elif sort_by in ("risk_desc", "risk_high"):
            account_ids.sort(
                key=lambda aid: (
                    float(self.accounts_df.loc[aid, "risk_score"]) if aid in self.accounts_df.index and pd.notna(self.accounts_df.loc[aid, "risk_score"]) else 0.0,
                    aid
                ),
                reverse=True,
            )
        elif sort_by in ("balance_asc", "bal_low"):
            account_ids.sort(
                key=lambda aid: (
                    float(self.accounts_df.loc[aid, "balance"]) if aid in self.accounts_df.index and pd.notna(self.accounts_df.loc[aid, "balance"]) else 0.0,
                    aid
                ),
                reverse=False,
            )
        elif sort_by in ("balance_desc", "bal_high"):
            account_ids.sort(
                key=lambda aid: (
                    float(self.accounts_df.loc[aid, "balance"]) if aid in self.accounts_df.index and pd.notna(self.accounts_df.loc[aid, "balance"]) else 0.0,
                    aid
                ),
                reverse=True,
            )
        elif sort_by in ("created_asc", "date_asc", "oldest"):
            account_ids.sort(
                key=lambda aid: (
                    str(self.accounts_df.loc[aid, "creation_date"]) if aid in self.accounts_df.index and pd.notna(self.accounts_df.loc[aid, "creation_date"]) else "",
                    aid
                ),
                reverse=False,
            )
        else:  # "created_desc", "date_desc", "newest"
            account_ids.sort(
                key=lambda aid: (
                    str(self.accounts_df.loc[aid, "creation_date"]) if aid in self.accounts_df.index and pd.notna(self.accounts_df.loc[aid, "creation_date"]) else "",
                    aid
                ),
                reverse=True,
            )

        total = len(account_ids)
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_account_ids = account_ids[start_idx:end_idx]

        items: list[AccountSummary] = []
        for acc_id in page_account_ids:
            acc_row = (
                self.accounts_df.loc[acc_id]
                if acc_id in self.accounts_df.index
                else None
            )
            if acc_row is not None:
                items.append(
                    AccountSummary(
                        account_id=acc_id,
                        customer_name=str(acc_row.get("customer_name", "Unknown")),
                        balance=round(float(acc_row.get("balance", 0.0)), 2),
                        account_risk_score=_sanitize_float(acc_row.get("risk_score")),
                        creation_date=str(acc_row.get("creation_date", "")) if pd.notna(acc_row.get("creation_date")) else None,
                        community_id=community_id,
                    )
                )
            else:
                items.append(
                    AccountSummary(
                        account_id=acc_id,
                        customer_name=f"Customer {acc_id}",
                        balance=0.0,
                        account_risk_score=None,
                        creation_date=None,
                        community_id=community_id,
                    )
                )

        return PaginatedAccountsResponse(
            community_id=community_id,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            items=items,
        )

    def get_accounts_registry(
        self,
        page: int = 1,
        page_size: int = 50,
        community_id: int | None = None,
        risk_tier: str | None = None,
        min_risk_score: float | None = None,
        max_risk_score: float | None = None,
        search: str | None = None,
        sort_by: str = "risk_score",
        sort_order: str = "desc",
    ) -> PaginatedAccountsRegistryResponse:
        """Return paginated, filterable, sortable global account registry."""
        self.load_data()

        if self.accounts_df.empty:
            return PaginatedAccountsRegistryResponse(
                total=0, page=page, page_size=page_size, total_pages=1, items=[]
            )

        # Start with all account IDs
        account_ids = list(self.accounts_df.index)

        # Filter by search (case-insensitive substring of account_id or customer_name)
        if search:
            s_clean = search.strip().lower()
            filtered_ids = []
            for aid in account_ids:
                if s_clean in aid.lower():
                    filtered_ids.append(aid)
                else:
                    cname = str(self.accounts_df.loc[aid, "customer_name"] if aid in self.accounts_df.index else "").lower()
                    if s_clean in cname:
                        filtered_ids.append(aid)
            account_ids = filtered_ids

        # Filter by community_id
        if community_id is not None:
            account_ids = [aid for aid in account_ids if self.account_to_community.get(aid) == community_id]

        # Filter by risk_tier (HIGH, MEDIUM, LOW)
        if risk_tier:
            tier_upper = risk_tier.strip().upper()
            filtered_ids = []
            for aid in account_ids:
                acc_row = self.accounts_df.loc[aid] if aid in self.accounts_df.index else None
                rscore = float(acc_row.get("risk_score", 0.0)) if acc_row is not None and pd.notna(acc_row.get("risk_score")) else 0.0
                if rscore >= 0.60:
                    tier = "HIGH"
                elif rscore >= 0.35:
                    tier = "MEDIUM"
                else:
                    tier = "LOW"
                if tier == tier_upper:
                    filtered_ids.append(aid)
            account_ids = filtered_ids

        # Filter by min_risk_score / max_risk_score
        if min_risk_score is not None or max_risk_score is not None:
            min_s = min_risk_score if min_risk_score is not None else 0.0
            max_s = max_risk_score if max_risk_score is not None else 1.0
            filtered_ids = []
            for aid in account_ids:
                acc_row = self.accounts_df.loc[aid] if aid in self.accounts_df.index else None
                rscore = float(acc_row.get("risk_score", 0.0)) if acc_row is not None and pd.notna(acc_row.get("risk_score")) else 0.0
                if min_s <= rscore <= max_s:
                    filtered_ids.append(aid)
            account_ids = filtered_ids

        # Sorting
        def get_sort_key(aid: str):
            acc_row = self.accounts_df.loc[aid] if aid in self.accounts_df.index else None
            cid = self.account_to_community.get(aid)
            tx_stat = self.account_tx_aggregates.get(aid, [0, 0, 0.0, 0.0, 0])
            tot_cnt = tx_stat[0] + tx_stat[1]
            tot_vol = tx_stat[2] + tx_stat[3]
            
            if sort_by == "risk_score":
                return float(acc_row.get("risk_score", 0.0)) if acc_row is not None and pd.notna(acc_row.get("risk_score")) else 0.0
            elif sort_by == "community_risk":
                if cid is not None and cid in self.community_risk_scores_df.index:
                    return _to_float(self.community_risk_scores_df.loc[cid, "risk_score"], 0.0)
                return 0.0
            elif sort_by == "tx_count":
                return tot_cnt
            elif sort_by == "tx_volume":
                return tot_vol
            elif sort_by == "connections":
                return len(self.account_connections_map.get(aid, []))
            elif sort_by == "balance":
                return float(acc_row.get("balance", 0.0)) if acc_row is not None and pd.notna(acc_row.get("balance")) else 0.0
            elif sort_by == "declined":
                return tx_stat[4]
            elif sort_by == "account_id":
                return aid
            return float(acc_row.get("risk_score", 0.0)) if acc_row is not None and pd.notna(acc_row.get("risk_score")) else 0.0

        reverse_order = (sort_order.lower() == "desc")
        account_ids.sort(key=get_sort_key, reverse=reverse_order)

        total = len(account_ids)
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        total_pages = max(1, math.ceil(total / page_size))

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_slice = account_ids[start_idx:end_idx]

        items: list[AccountRegistryItem] = []
        for aid in page_slice:
            acc_row = self.accounts_df.loc[aid] if aid in self.accounts_df.index else None
            cid = self.account_to_community.get(aid)
            comm_risk_score = None
            comm_risk_level = None
            if cid is not None and cid in self.community_risk_scores_df.index:
                c_row = self.community_risk_scores_df.loc[cid]
                comm_risk_score = int(c_row["risk_score"])
                comm_risk_level = str(c_row["risk_level"])

            tx_stat = self.account_tx_aggregates.get(aid, [0, 0, 0.0, 0.0, 0])
            tot_cnt = tx_stat[0] + tx_stat[1]
            tot_vol = round(tx_stat[2] + tx_stat[3], 2)
            dec_cnt = tx_stat[4]
            dec_rate = round(dec_cnt / max(1, tot_cnt), 4)

            rscore = _sanitize_float(acc_row.get("risk_score")) if acc_row is not None else None
            if rscore is not None:
                if rscore >= 0.60:
                    rlevel = "HIGH"
                elif rscore >= 0.35:
                    rlevel = "MEDIUM"
                else:
                    rlevel = "LOW"
            else:
                rlevel = "LOW"

            items.append(
                AccountRegistryItem(
                    account_id=aid,
                    customer_name=str(acc_row.get("customer_name", f"Customer {aid}")) if acc_row is not None else f"Customer {aid}",
                    balance=round(float(acc_row.get("balance", 0.0)), 2) if acc_row is not None else 0.0,
                    account_risk_score=rscore,
                    risk_level=rlevel,
                    creation_date=str(acc_row.get("creation_date", "")) if acc_row is not None and pd.notna(acc_row.get("creation_date")) else None,
                    community_id=cid,
                    community_risk_score=comm_risk_score,
                    community_risk_level=comm_risk_level,
                    connected_account_count=len(self.account_connections_map.get(aid, [])),
                    tx_count=tot_cnt,
                    tx_volume=tot_vol,
                    declined_count=dec_cnt,
                    decline_rate=dec_rate,
                )
            )

        return PaginatedAccountsRegistryResponse(
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            items=items,
        )

    def get_account(self, account_id: str) -> AccountDetailResponse | None:
        """Return detail information for an account."""
        self.load_data()

        if self.accounts_df.empty or account_id not in self.accounts_df.index:
            return None

        acc_row = self.accounts_df.loc[account_id]
        cid = self.account_to_community.get(account_id)

        comm_risk_score = None
        comm_risk_level = None
        if cid is not None and cid in self.community_risk_scores_df.index:
            c_row = self.community_risk_scores_df.loc[cid]
            comm_risk_score = int(c_row["risk_score"])
            comm_risk_level = str(c_row["risk_level"])

        # Compute transaction stats for this account
        sent_indices = self.account_sent_tx_indices.get(account_id, [])
        recv_indices = self.account_recv_tx_indices.get(account_id, [])

        sent_count = len(sent_indices)
        recv_count = len(recv_indices)
        total_count = sent_count + recv_count

        total_amount_sent = 0.0
        total_amount_recv = 0.0
        declined_count = 0
        first_observed = None
        last_observed = None

        all_indices = sent_indices + recv_indices
        if all_indices and not self.transactions_df.empty:
            sub_df = self.transactions_df.iloc[all_indices]
            ts_series = sub_df["timestamp"]
            first_observed = str(ts_series.min()) if not ts_series.empty else None
            last_observed = str(ts_series.max()) if not ts_series.empty else None

        if sent_indices and not self.transactions_df.empty:
            sent_df = self.transactions_df.iloc[sent_indices]
            total_amount_sent = float(sent_df["amount"].sum())
            declined_count += int((sent_df["transaction_status"] == "declined").sum())

        if recv_indices and not self.transactions_df.empty:
            recv_df = self.transactions_df.iloc[recv_indices]
            total_amount_recv = float(recv_df["amount"].sum())
            declined_count += int((recv_df["transaction_status"] == "declined").sum())

        conn_count = len(self.account_connections_map.get(account_id, []))
        rscore = _sanitize_float(acc_row.get("risk_score"))
        if rscore is not None:
            if rscore >= 0.60:
                rlevel = "HIGH"
            elif rscore >= 0.35:
                rlevel = "MEDIUM"
            else:
                rlevel = "LOW"
        else:
            rlevel = "LOW"

        return AccountDetailResponse(
            account_id=account_id,
            customer_name=str(acc_row.get("customer_name", "Unknown")),
            balance=round(float(acc_row.get("balance", 0.0)), 2),
            account_risk_score=rscore,
            risk_level=rlevel,
            creation_date=str(acc_row.get("creation_date", "")) if pd.notna(acc_row.get("creation_date")) else None,
            first_observed_activity=first_observed,
            last_observed_activity=last_observed,
            community_id=cid,
            community_risk_score=comm_risk_score,
            community_risk_level=comm_risk_level,
            connected_account_count=conn_count,
            transaction_statistics=AccountTransactionStats(
                sent_count=sent_count,
                received_count=recv_count,
                total_count=total_count,
                total_amount_sent=round(total_amount_sent, 2),
                total_amount_received=round(total_amount_recv, 2),
                declined_count=declined_count,
            ),
        )

    def get_account_peer_stats(self, account_id: str) -> AccountPeerStatsResponse | None:
        """Return peer comparison statistics against the account's community peer group."""
        self.load_data()

        if self.accounts_df.empty or account_id not in self.accounts_df.index:
            return None

        import numpy as np

        cid = self.account_to_community.get(account_id)
        acc_tx = self.account_tx_aggregates.get(account_id, [0, 0, 0.0, 0.0, 0])
        acc_tot_cnt = acc_tx[0] + acc_tx[1]
        acc_tot_vol = round(acc_tx[2] + acc_tx[3], 2)
        acc_dec_cnt = acc_tx[4]
        acc_dec_rate = round(acc_dec_cnt / max(1, acc_tot_cnt), 4)
        acc_conns = len(self.account_connections_map.get(account_id, []))
        acc_avg_amount = round(acc_tot_vol / max(1, acc_tot_cnt), 2)

        if cid is None:
            return AccountPeerStatsResponse(
                account_id=account_id,
                community_id=None,
                peer_count=0,
                peer_sample_size=0,
                has_peer_data=False,
                account_tx_count=acc_tot_cnt,
                account_tx_volume=acc_tot_vol,
                account_decline_rate=acc_dec_rate,
                account_connections=acc_conns,
                account_avg_tx_amount=acc_avg_amount,
                peer_median_tx_count=None,
                peer_median_tx_volume=None,
                peer_median_decline_rate=None,
                peer_median_connections=None,
                peer_median_avg_tx_amount=None,
            )

        members = [m for m in self.community_to_accounts.get(cid, []) if m != account_id]
        peer_count = len(members)

        if peer_count == 0:
            return AccountPeerStatsResponse(
                account_id=account_id,
                community_id=cid,
                peer_count=0,
                peer_sample_size=0,
                has_peer_data=False,
                account_tx_count=acc_tot_cnt,
                account_tx_volume=acc_tot_vol,
                account_decline_rate=acc_dec_rate,
                account_connections=acc_conns,
                account_avg_tx_amount=acc_avg_amount,
                peer_median_tx_count=None,
                peer_median_tx_volume=None,
                peer_median_decline_rate=None,
                peer_median_connections=None,
                peer_median_avg_tx_amount=None,
            )

        # Sample up to 150 peers for instant calculation
        sample_size = min(len(members), 150)
        peer_sample = members[:sample_size]

        peer_tx_counts: list[int] = []
        peer_tx_vols: list[float] = []
        peer_decline_rates: list[float] = []
        peer_conns: list[int] = []
        peer_avg_amounts: list[float] = []

        for p in peer_sample:
            p_tx = self.account_tx_aggregates.get(p, [0, 0, 0.0, 0.0, 0])
            p_cnt = p_tx[0] + p_tx[1]
            p_vol = p_tx[2] + p_tx[3]
            p_dec = p_tx[4]
            peer_tx_counts.append(p_cnt)
            peer_tx_vols.append(p_vol)
            peer_decline_rates.append(p_dec / max(1, p_cnt))
            peer_conns.append(len(self.account_connections_map.get(p, [])))
            peer_avg_amounts.append(p_vol / max(1, p_cnt))

        return AccountPeerStatsResponse(
            account_id=account_id,
            community_id=cid,
            peer_count=peer_count,
            peer_sample_size=sample_size,
            has_peer_data=True,
            account_tx_count=acc_tot_cnt,
            account_tx_volume=acc_tot_vol,
            account_decline_rate=acc_dec_rate,
            account_connections=acc_conns,
            account_avg_tx_amount=acc_avg_amount,
            peer_median_tx_count=round(float(np.median(peer_tx_counts)), 1),
            peer_median_tx_volume=round(float(np.median(peer_tx_vols)), 2),
            peer_median_decline_rate=round(float(np.median(peer_decline_rates)), 4),
            peer_median_connections=round(float(np.median(peer_conns)), 1),
            peer_median_avg_tx_amount=round(float(np.median(peer_avg_amounts)), 2),
        )


    def get_account_transactions(
        self,
        account_id: str,
        page: int = 1,
        page_size: int = 50,
        direction: str = "all",
    ) -> PaginatedTransactionsResponse | None:
        """Return paginated transaction history for an account."""
        self.load_data()

        if self.accounts_df.empty or account_id not in self.accounts_df.index:
            return None

        sent_idx = self.account_sent_tx_indices.get(account_id, [])
        recv_idx = self.account_recv_tx_indices.get(account_id, [])

        if direction == "sent":
            all_indices = sent_idx
        elif direction == "received":
            all_indices = recv_idx
        else:
            all_indices = sorted(set(sent_idx + recv_idx))

        total = len(all_indices)
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        total_pages = max(1, math.ceil(total / page_size))

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_indices = all_indices[start_idx:end_idx]

        items: list[TransactionItem] = []
        if page_indices and not self.transactions_df.empty:
            sub_df = self.transactions_df.iloc[page_indices]
            for _, row in sub_df.iterrows():
                items.append(
                    TransactionItem(
                        transaction_id=str(row["transaction_id"]),
                        timestamp=str(row["timestamp"]),
                        amount=round(float(row["amount"]), 2),
                        src_account_id=str(row["src_account_id"]),
                        dst_account_id=str(row["dst_account_id"]),
                        merchant_id=str(row["merchant_id"]) if pd.notna(row.get("merchant_id")) else None,
                        device_id=str(row["device_id"]) if pd.notna(row.get("device_id")) else None,
                        payment_instrument_id=str(row["payment_instrument_id"]) if pd.notna(row.get("payment_instrument_id")) else None,
                        ip_address=str(row["ip_address"]) if pd.notna(row.get("ip_address")) else None,
                        payment_method=str(row["payment_method"]) if pd.notna(row.get("payment_method")) else None,
                        account_age_days=int(row["account_age_days"]) if pd.notna(row.get("account_age_days")) else None,
                        transaction_status=str(row["transaction_status"]),
                    )
                )

        return PaginatedTransactionsResponse(
            account_id=account_id,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            items=items,
        )

    def get_account_connections(self, account_id: str) -> AccountConnectionsResponse | None:
        """Return observable connections and shared evidence for an account."""
        self.load_data()

        if self.accounts_df.empty or account_id not in self.accounts_df.index:
            return None

        raw_conns = self.account_connections_map.get(account_id, [])
        items: list[ConnectionItem] = []
        for c in raw_conns:
            items.append(
                ConnectionItem(
                    connected_account_id=c["connected_account_id"],
                    edge_weight=round(float(c["edge_weight"]), 4),
                    shared_devices=list(c.get("shared_devices", [])),
                    shared_payment_instruments=list(c.get("shared_payment_instruments", [])),
                    shared_ips=list(c.get("shared_ips", [])),
                    shared_merchants=list(c.get("shared_merchants", [])),
                    temporal_overlap=int(c.get("temporal_overlap", 0)),
                )
            )

        return AccountConnectionsResponse(
            account_id=account_id,
            total_connections=len(items),
            connections=items,
        )

    def get_transaction(self, transaction_id: str) -> TransactionDetailResponse | None:
        """Return detail information for a single transaction."""
        self.load_data()

        if transaction_id not in self.tx_id_to_index or self.transactions_df.empty:
            return None

        idx = self.tx_id_to_index[transaction_id]
        row = self.transactions_df.iloc[idx]

        mch_id = str(row["merchant_id"]) if pd.notna(row.get("merchant_id")) else None
        mch_name = None
        mch_cat = None

        if mch_id and not self.merchants_df.empty and mch_id in self.merchants_df.index:
            mch_row = self.merchants_df.loc[mch_id]
            mch_name = str(mch_row.get("name", ""))
            mch_cat = str(mch_row.get("category", ""))

        return TransactionDetailResponse(
            transaction_id=str(row["transaction_id"]),
            timestamp=str(row["timestamp"]),
            amount=round(float(row["amount"]), 2),
            src_account_id=str(row["src_account_id"]),
            dst_account_id=str(row["dst_account_id"]),
            merchant_id=mch_id,
            merchant_name=mch_name,
            merchant_category=mch_cat,
            device_id=str(row["device_id"]) if pd.notna(row.get("device_id")) else None,
            payment_instrument_id=str(row["payment_instrument_id"]) if pd.notna(row.get("payment_instrument_id")) else None,
            ip_address=str(row["ip_address"]) if pd.notna(row.get("ip_address")) else None,
            payment_method=str(row["payment_method"]) if pd.notna(row.get("payment_method")) else None,
            account_age_days=int(row["account_age_days"]) if pd.notna(row.get("account_age_days")) else None,
            transaction_status=str(row["transaction_status"]),
        )

    def get_transactions_list(
        self,
        page: int = 1,
        page_size: int = 50,
        status: str | None = None,
        payment_method: str | None = None,
        min_amount: float | None = None,
        max_amount: float | None = None,
        search: str | None = None,
        sort_by: str = "timestamp",
        sort_order: str = "desc",
    ) -> PaginatedTransactionListResponse:
        """Return a paginated, filterable, sortable investigator transaction registry.

        All filters and sort fields map directly to real dataset columns.
        No fabricated values are returned.
        """
        self.load_data()

        if self.transactions_df.empty:
            return PaginatedTransactionListResponse(
                total=0, page=1, page_size=page_size, total_pages=0,
                items=[], filtered_declined_count=0, filtered_total_amount=0.0,
            )

        df = self.transactions_df.copy()

        # Apply filters — all real dataset fields
        if status:
            df = df[df["transaction_status"] == status]
        if payment_method:
            df = df[df["payment_method"] == payment_method]
        if min_amount is not None:
            df = df[df["amount"] >= min_amount]
        if max_amount is not None:
            df = df[df["amount"] <= max_amount]
        if search:
            s = search.strip().lower()
            mask = (
                df["transaction_id"].str.lower().str.startswith(s)
                | df["src_account_id"].str.lower().str.startswith(s)
                | df["dst_account_id"].str.lower().str.startswith(s)
            )
            df = df[mask]

        # Compute aggregate stats from the filtered set before slicing
        filtered_total = len(df)
        filtered_declined = int((df["transaction_status"] == "declined").sum())
        filtered_amount = round(float(df["amount"].sum()), 2)

        # Sort — only real dataset columns allowed
        valid_sort_fields = {"timestamp", "amount", "transaction_status"}
        if sort_by not in valid_sort_fields:
            sort_by = "timestamp"
        ascending = sort_order == "asc"
        df = df.sort_values(sort_by, ascending=ascending, na_position="last")

        # Paginate
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        total_pages = max(1, math.ceil(filtered_total / page_size))
        start = (page - 1) * page_size
        end = start + page_size
        page_df = df.iloc[start:end]

        items: list[TransactionListItem] = []
        for _, row in page_df.iterrows():
            items.append(
                TransactionListItem(
                    transaction_id=str(row["transaction_id"]),
                    timestamp=str(row["timestamp"]),
                    amount=round(float(row["amount"]), 2),
                    src_account_id=str(row["src_account_id"]),
                    dst_account_id=str(row["dst_account_id"]),
                    transaction_status=str(row["transaction_status"]),
                    payment_method=str(row["payment_method"]) if pd.notna(row.get("payment_method")) else None,
                    merchant_id=str(row["merchant_id"]) if pd.notna(row.get("merchant_id")) else None,
                )
            )

        return PaginatedTransactionListResponse(
            total=filtered_total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            items=items,
            filtered_declined_count=filtered_declined,
            filtered_total_amount=filtered_amount,
        )

    def get_transaction_counterparty(
        self, transaction_id: str
    ) -> TransactionCounterpartyResponse | None:
        """Return the observed relationship between the src and dst accounts of a transaction.

        Computes deterministically from enriched_transactions:
        - Total transaction count between this pair (both directions)
        - Flow totals in each direction
        - First and last observed timestamp between the pair
        - Declined transaction count between the pair
        - Community membership of each account
        - Preview of 5 most recent transactions between the pair
        """
        self.load_data()

        if transaction_id not in self.tx_id_to_index or self.transactions_df.empty:
            return None

        idx = self.tx_id_to_index[transaction_id]
        focal_row = self.transactions_df.iloc[idx]
        src = str(focal_row["src_account_id"])
        dst = str(focal_row["dst_account_id"])

        # Find all transactions between this exact pair (both directions) using fast indices
        src_sent = set(self.account_sent_tx_indices.get(src, []))
        dst_recv = set(self.account_recv_tx_indices.get(dst, []))
        fwd_idx = sorted(src_sent.intersection(dst_recv))

        dst_sent = set(self.account_sent_tx_indices.get(dst, []))
        src_recv = set(self.account_recv_tx_indices.get(src, []))
        rev_idx = sorted(dst_sent.intersection(src_recv))

        fwd_df = self.transactions_df.iloc[fwd_idx] if fwd_idx else pd.DataFrame()
        rev_df = self.transactions_df.iloc[rev_idx] if rev_idx else pd.DataFrame()

        # Forward flow (src -> dst)
        n_fwd = len(fwd_df)
        total_flow_fwd = round(float(fwd_df["amount"].sum()), 2) if n_fwd > 0 else 0.0

        # Reverse flow (dst -> src)
        n_rev = len(rev_df)
        total_flow_rev = round(float(rev_df["amount"].sum()), 2) if n_rev > 0 else 0.0

        # Combined pair
        pair_indices = sorted(set(fwd_idx + rev_idx))
        n_total = len(pair_indices)

        first_obs: str | None = None
        last_obs: str | None = None
        declined_between = 0

        if n_total > 0:
            pair_df = self.transactions_df.iloc[pair_indices]
            pair_df_sorted = pair_df.sort_values("timestamp")
            first_obs = str(pair_df_sorted.iloc[0]["timestamp"])
            last_obs = str(pair_df_sorted.iloc[-1]["timestamp"])
            declined_between = int((pair_df["transaction_status"] == "declined").sum())

            # Most recent 5
            recent_rows = pair_df_sorted.tail(5).iloc[::-1]
            recent: list[CounterpartyTransactionItem] = []
            for _, rrow in recent_rows.iterrows():
                recent.append(
                    CounterpartyTransactionItem(
                        transaction_id=str(rrow["transaction_id"]),
                        timestamp=str(rrow["timestamp"]),
                        amount=round(float(rrow["amount"]), 2),
                        transaction_status=str(rrow["transaction_status"]),
                        payment_method=str(rrow["payment_method"]) if pd.notna(rrow.get("payment_method")) else None,
                    )
                )
        else:
            recent = []

        # Community membership from the existing community data
        src_cid = self.account_to_community.get(src)
        dst_cid = self.account_to_community.get(dst)
        same_community = (src_cid is not None) and (dst_cid is not None) and (src_cid == dst_cid)

        return TransactionCounterpartyResponse(
            transaction_id=transaction_id,
            src_account_id=src,
            dst_account_id=dst,
            total_transactions_between=n_total,
            transactions_src_to_dst=n_fwd,
            transactions_dst_to_src=n_rev,
            total_flow_src_to_dst=total_flow_fwd,
            total_flow_dst_to_src=total_flow_rev,
            first_observed_between=first_obs,
            last_observed_between=last_obs,
            declined_between=declined_between,
            src_community_id=src_cid,
            dst_community_id=dst_cid,
            same_community=same_community,
            recent_transactions=recent,
        )

    def get_community_graph(
        self,
        community_id: int,
        max_nodes: int = 200,
        max_edges: int = 500,
        focal_account_id: str | None = None,
    ) -> CommunityGraphResponse | None:
        """Return graph nodes and edges for community visualization."""
        self.load_data()

        cache_key = f"{community_id}:{max_nodes}:{max_edges}:{focal_account_id}"
        if cache_key in self._graph_cache:
            return self._graph_cache[cache_key]

        if (
            self.community_risk_scores_df.empty
            or community_id not in self.community_risk_scores_df.index
        ):
            return None

        member_accounts = self.community_to_accounts.get(community_id, [])
        all_edges = self.community_edges_map.get(community_id, [])

        # Calculate degrees within community
        degrees: dict[str, int] = {acc: 0 for acc in member_accounts}
        for e in all_edges:
            src = e["source"]
            dst = e["target"]
            if src in degrees:
                degrees[src] += 1
            if dst in degrees:
                degrees[dst] += 1

        # Select nodes (sorted by degree descending if truncated)
        sorted_members = sorted(member_accounts, key=lambda a: degrees.get(a, 0), reverse=True)
        selected_nodes_set = set(sorted_members[:max_nodes])

        # If a focal account is requested, guarantee inclusion of focal and its direct neighbors / counterparties
        if focal_account_id and focal_account_id in self.accounts_df.index:
            selected_nodes_set.add(focal_account_id)
            # 1. Direct neighbors from internal community edges
            focal_internal_neighbors = [
                e["target"] if e["source"] == focal_account_id else e["source"]
                for e in all_edges
                if e["source"] == focal_account_id or e["target"] == focal_account_id
            ]
            for nbr in focal_internal_neighbors:
                selected_nodes_set.add(nbr)

            # 2. Direct counterparties from transaction flow involving members of this community
            member_set = set(member_accounts)
            sent_txs = self.account_sent_tx_indices.get(focal_account_id, [])
            recv_txs = self.account_recv_tx_indices.get(focal_account_id, [])
            for idx in sent_txs:
                dst = str(self.transactions_df.iloc[idx]["dst_account_id"])
                if dst in member_set:
                    selected_nodes_set.add(dst)
            for idx in recv_txs:
                src = str(self.transactions_df.iloc[idx]["src_account_id"])
                if src in member_set:
                    selected_nodes_set.add(src)

        # Deterministically sort selected nodes: focal first, then degree desc, balance desc, id asc
        sorted_selected_accs = sorted(
            selected_nodes_set,
            key=lambda a: (
                0 if a == focal_account_id else 1,
                -degrees.get(a, 0),
                -_sanitize_float(self.accounts_df.loc[a].get("balance")) if a in self.accounts_df.index else 0.0,
                a,
            ),
        )

        nodes: list[GraphNode] = []
        for acc in sorted_selected_accs:
            acc_row = self.accounts_df.loc[acc] if acc in self.accounts_df.index else None
            name = str(acc_row.get("customer_name", acc)) if acc_row is not None else acc
            balance = _sanitize_float(acc_row.get("balance")) if acc_row is not None else 0.0
            nodes.append(
                GraphNode(
                    id=acc,
                    label=name,
                    customer_name=name,
                    balance=balance,
                    degree=degrees.get(acc, 0),
                )
            )

        # Partition valid edges between selected nodes into focal-touching and contextual background edges
        focal_edges_list: list[dict] = []
        other_edges_list: list[dict] = []

        for e in all_edges:
            src = e["source"]
            dst = e["target"]
            if src in selected_nodes_set and dst in selected_nodes_set:
                if focal_account_id and (src == focal_account_id or dst == focal_account_id):
                    focal_edges_list.append(e)
                else:
                    other_edges_list.append(e)

        # Deterministically sort edges by weight descending, then endpoints
        focal_edges_list.sort(key=lambda e: (-float(e.get("weight", 0.0)), e["source"], e["target"]))
        other_edges_list.sort(key=lambda e: (-float(e.get("weight", 0.0)), e["source"], e["target"]))

        # Prioritize ALL focal edges so no observed relationships are truncated, then fill with top community edges
        candidate_edges = focal_edges_list + other_edges_list[:max(0, max_edges - len(focal_edges_list))]

        edges: list[GraphEdge] = []
        existing_pairs: set[tuple[str, str]] = set()

        for e in candidate_edges:
            src = e["source"]
            dst = e["target"]
            src_sent = self.account_sent_tx_indices.get(src, [])
            dst_recv = self.account_recv_tx_indices.get(dst, [])
            fwd_indices = set(src_sent) & set(dst_recv)

            dst_sent = self.account_sent_tx_indices.get(dst, [])
            src_recv = self.account_recv_tx_indices.get(src, [])
            rev_indices = set(dst_sent) & set(src_recv)

            all_tx = fwd_indices | rev_indices
            tx_count = len(all_tx)
            if tx_count > 0:
                tx_amt = round(float(self.transactions_df.iloc[list(all_tx)]["amount"].sum()), 2)
                if fwd_indices and rev_indices:
                    direction = "bidirectional"
                elif fwd_indices:
                    direction = "source_to_target"
                else:
                    direction = "target_to_source"
            else:
                tx_amt = 0.0
                direction = None

            edges.append(
                GraphEdge(
                    source=src,
                    target=dst,
                    weight=round(float(e["weight"]), 4),
                    shared_instruments=list(e.get("shared_instruments", [])),
                    shared_devices=list(e.get("shared_devices", [])),
                    shared_ips=list(e.get("shared_ips", [])),
                    shared_merchants=list(e.get("shared_merchants", [])),
                    temporal_overlap=int(e.get("temporal_overlap", 0)),
                    has_transaction_flow=tx_count > 0,
                    transaction_count=tx_count,
                    total_amount=tx_amt,
                    flow_direction=direction,
                )
            )
            existing_pairs.add((src, dst))
            existing_pairs.add((dst, src))

        # Ensure direct transaction edges for focal_account_id with selected nodes are included
        if focal_account_id and focal_account_id in selected_nodes_set:
            for other_id in selected_nodes_set:
                if other_id == focal_account_id:
                    continue
                if (focal_account_id, other_id) in existing_pairs:
                    continue

                fwd_indices = set(self.account_sent_tx_indices.get(focal_account_id, [])) & set(self.account_recv_tx_indices.get(other_id, []))
                rev_indices = set(self.account_sent_tx_indices.get(other_id, [])) & set(self.account_recv_tx_indices.get(focal_account_id, []))
                all_tx = fwd_indices | rev_indices
                if all_tx:
                    tx_amt = round(float(self.transactions_df.iloc[list(all_tx)]["amount"].sum()), 2)
                    direction = "bidirectional" if (fwd_indices and rev_indices) else ("source_to_target" if fwd_indices else "target_to_source")
                    src_node = focal_account_id if fwd_indices else other_id
                    dst_node = other_id if fwd_indices else focal_account_id
                    edges.append(
                        GraphEdge(
                            source=src_node,
                            target=dst_node,
                            weight=1.0,
                            shared_instruments=[],
                            shared_devices=[],
                            shared_ips=[],
                            shared_merchants=[],
                            temporal_overlap=0,
                            has_transaction_flow=True,
                            transaction_count=len(all_tx),
                            total_amount=tx_amt,
                            flow_direction=direction,
                        )
                    )
                    existing_pairs.add((src_node, dst_node))
                    existing_pairs.add((dst_node, src_node))

        # Deterministically sort edges: focal-touching first, then weight descending, source, target
        edges.sort(
            key=lambda e: (
                0 if focal_account_id and (e.source == focal_account_id or e.target == focal_account_id) else 1,
                -e.weight,
                e.source,
                e.target,
            )
        )

        res = CommunityGraphResponse(
            community_id=community_id,
            total_nodes=len(member_accounts),
            total_edges=len(all_edges),
            nodes=nodes,
            edges=edges,
        )
        self._graph_cache[cache_key] = res
        return res

    def get_community_timeline(
        self, community_id: int, limit: int = 100, offset: int = 0
    ) -> CommunityTimelineResponse | None:
        """Return chronological transaction timeline for a community."""
        self.load_data()

        if (
            self.community_risk_scores_df.empty
            or community_id not in self.community_risk_scores_df.index
        ):
            return None

        member_set = set(self.community_to_accounts.get(community_id, []))
        if not member_set:
            return CommunityTimelineResponse(community_id=community_id, total_events=0, events=[])

        # Collect transaction indices for members
        comm_tx_indices: set[int] = set()
        for acc in member_set:
            comm_tx_indices.update(self.account_sent_tx_indices.get(acc, []))
            comm_tx_indices.update(self.account_recv_tx_indices.get(acc, []))

        total = len(comm_tx_indices)
        if total == 0 or self.transactions_df.empty:
            return CommunityTimelineResponse(community_id=community_id, total_events=0, events=[])

        sorted_indices = sorted(
            comm_tx_indices,
            key=lambda idx: self.transactions_df.iloc[idx]["timestamp"],
        )

        limit = max(1, min(1000, limit))
        offset = max(0, offset)
        page_indices = sorted_indices[offset : offset + limit]

        events: list[TimelineEvent] = []
        if page_indices:
            sub_df = self.transactions_df.iloc[page_indices]
            for _, row in sub_df.iterrows():
                events.append(
                    TimelineEvent(
                        transaction_id=str(row["transaction_id"]),
                        timestamp=str(row["timestamp"]),
                        src_account_id=str(row["src_account_id"]),
                        dst_account_id=str(row["dst_account_id"]),
                        amount=round(float(row["amount"]), 2),
                        transaction_status=str(row["transaction_status"]),
                        merchant_id=str(row["merchant_id"]) if pd.notna(row.get("merchant_id")) else None,
                        payment_method=str(row["payment_method"]) if pd.notna(row.get("payment_method")) else None,
                    )
                )

        return CommunityTimelineResponse(
            community_id=community_id,
            total_events=total,
            events=events,
        )

    def get_community_evidence(self, community_id: int) -> CommunityEvidenceResponse | None:
        """Run observable evidence analysis for a community.

        Uses the Evidence Intelligence Engine with in-memory indexed data.
        Returns None if the community does not exist.

        Note: evidence_score is DISTINCT from risk_score.
          risk_score     = ML-derived ensemble prioritization
          evidence_score = deterministic observable rule strength
        """
        self.load_data()
        if community_id in self._evidence_cache:
            return self._evidence_cache[community_id]

        if (
            self.community_risk_scores_df.empty
            or community_id not in self.community_risk_scores_df.index
        ):
            return None

        from src.intelligence.evidence_engine import EvidenceEngine

        engine = EvidenceEngine(
            transactions_df=self.transactions_df,
            community_to_accounts=self.community_to_accounts,
            account_to_community=self.account_to_community,
            account_connections_map=self.account_connections_map,
            community_edges_map=self.community_edges_map,
            community_features_df=self.community_features_df,
            account_sent_tx_indices=self.account_sent_tx_indices,
            account_recv_tx_indices=self.account_recv_tx_indices,
        )

        result = engine.get_community_evidence(community_id)

        # Compute uncapped raw score from severity counts.
        # evidence_score is always capped at 100 (saturated for large communities).
        # raw_evidence_score preserves the actual rule-weight total for comparison.
        from src.intelligence.evidence_rules import SCORE_CONTRIBUTION
        raw_score = int(
            result.high_count * SCORE_CONTRIBUTION.get("HIGH", 25)
            + result.medium_count * SCORE_CONTRIBUTION.get("MEDIUM", 12)
            + result.low_count * SCORE_CONTRIBUTION.get("LOW", 5)
        )

        res = CommunityEvidenceResponse(
            community_id=result.community_id,
            evidence_score=result.evidence_score,
            raw_evidence_score=raw_score,
            evidence_count=result.evidence_count,
            high_count=result.high_count,
            medium_count=result.medium_count,
            low_count=result.low_count,
            runtime_ms=result.runtime_ms,
            items=[
                EvidenceItemSchema(
                    evidence_id=item.evidence_id,
                    entity_type=item.entity_type,
                    entity_id=item.entity_id,
                    type=item.type,
                    severity=item.severity,
                    title=item.title,
                    description=item.description,
                    score_contribution=item.score_contribution,
                    observed_at=item.observed_at,
                    supporting_entities=item.supporting_entities,
                    metrics=item.metrics,
                )
                for item in result.items
            ],
        )
        self._evidence_cache[community_id] = res
        return res

    def prewarm_cache(self) -> None:
        """Precompute critical datasets and high-priority intelligence on server startup."""
        logger.info("Pre-warming TraceLine in-memory intelligence caches...")
        try:
            self.get_summary()
            comms = self.get_communities()
            top_cid = comms.items[0].community_id if comms.items else 3
            self.get_community_detail(top_cid)
            self.get_community_evidence(top_cid)
            self.get_community_graph(top_cid, 200, 500)
            logger.info("Pre-warming completed. Community #%s intelligence is hot in cache.", top_cid)
        except Exception as e:
            logger.warning("Cache pre-warming encountered non-critical exception: %s", e)


    def get_account_evidence(self, account_id: str) -> AccountEvidenceResponse | None:
        """Run observable evidence analysis for an account.

        Uses the Evidence Intelligence Engine with in-memory indexed data.
        Returns None if the account does not exist.

        Note: evidence_score is DISTINCT from risk_score.
          risk_score     = ML-derived ensemble prioritization
          evidence_score = deterministic observable rule strength
        """
        self.load_data()

        if self.accounts_df.empty or account_id not in self.accounts_df.index:
            return None

        from src.intelligence.evidence_engine import EvidenceEngine

        engine = EvidenceEngine(
            transactions_df=self.transactions_df,
            community_to_accounts=self.community_to_accounts,
            account_to_community=self.account_to_community,
            account_connections_map=self.account_connections_map,
            community_edges_map=self.community_edges_map,
            community_features_df=self.community_features_df,
            account_sent_tx_indices=self.account_sent_tx_indices,
            account_recv_tx_indices=self.account_recv_tx_indices,
        )

        result = engine.get_account_evidence(account_id)

        return AccountEvidenceResponse(
            account_id=result.account_id,
            community_id=result.community_id,
            evidence_score=result.evidence_score,
            evidence_count=result.evidence_count,
            high_count=result.high_count,
            medium_count=result.medium_count,
            low_count=result.low_count,
            runtime_ms=result.runtime_ms,
            items=[
                EvidenceItemSchema(
                    evidence_id=item.evidence_id,
                    entity_type=item.entity_type,
                    entity_id=item.entity_id,
                    type=item.type,
                    severity=item.severity,
                    title=item.title,
                    description=item.description,
                    score_contribution=item.score_contribution,
                    observed_at=item.observed_at,
                    supporting_entities=item.supporting_entities,
                    metrics=item.metrics,
                )
                for item in result.items
            ],
        )


# Global singleton instance
service = TraceLineService()
