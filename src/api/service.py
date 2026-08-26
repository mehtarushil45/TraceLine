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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd

from src.api.schemas import (
    AccountConnectionsResponse,
    AccountDetailResponse,
    AccountSummary,
    AccountTransactionStats,
    CommunityDetailResponse,
    CommunityEvidenceResponse,
    CommunityGraphResponse,
    CommunityListResponse,
    CommunitySummary,
    CommunityTimelineResponse,
    ConnectionItem,
    AccountEvidenceResponse,
    EntitySharingStats,
    EvidenceItemSchema,
    GraphEdge,
    GraphNode,
    PaginatedAccountsResponse,
    PaginatedTransactionsResponse,
    SummaryResponse,
    TemporalStats,
    TimelineEvent,
    TransactionDetailResponse,
    TransactionItem,
    TransactionStats,
)
from src.features.community_features import FEATURE_NAMES, FORBIDDEN_COLUMNS

logger = logging.getLogger("traceline.service")

DEFAULT_DATA_DIR = Path("data/processed/payment_network")


def _sanitize_float(val: Any) -> Optional[float]:
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


class TraceLineService:
    """Singleton service providing fast in-memory query capabilities."""

    def __init__(self, data_dir: Path | str = DEFAULT_DATA_DIR) -> None:
        self.data_dir = Path(data_dir)
        self._is_loaded = False

        # In-memory datasets
        self.accounts_df: pd.DataFrame = pd.DataFrame()
        self.transactions_df: pd.DataFrame = pd.DataFrame()
        self.merchants_df: pd.DataFrame = pd.DataFrame()
        self.community_features_df: pd.DataFrame = pd.DataFrame()
        self.community_risk_scores_df: pd.DataFrame = pd.DataFrame()

        # Indexes & lookup tables
        self.community_to_accounts: Dict[int, List[str]] = {}
        self.account_to_community: Dict[str, int] = {}
        self.account_sent_tx_indices: Dict[str, List[int]] = {}
        self.account_recv_tx_indices: Dict[str, List[int]] = {}
        self.tx_id_to_index: Dict[str, int] = {}
        self.account_connections_map: Dict[str, List[Dict[str, Any]]] = {}
        self.community_edges_map: Dict[int, List[Dict[str, Any]]] = {}

        # System counts
        self.total_accounts: int = 0
        self.total_transactions: int = 0
        self.total_communities: int = 0
        self.total_graph_edges: int = 2617094  # Total AccountGraph projected edges

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
                acc = str(row["account_id"])
                cid = int(row["community_id"])
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

            self.total_transactions = len(self.transactions_df)

            # Build fast lookup indices for transactions
            src_col = self.transactions_df["src_account_id"].astype(str).values
            dst_col = self.transactions_df["dst_account_id"].astype(str).values
            tx_id_col = self.transactions_df["transaction_id"].astype(str).values

            for idx, (src, dst, tx_id) in enumerate(zip(src_col, dst_col, tx_id_col)):
                self.account_sent_tx_indices.setdefault(src, []).append(idx)
                self.account_recv_tx_indices.setdefault(dst, []).append(idx)
                self.tx_id_to_index[tx_id] = idx

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
            except Exception as e:
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
        
        tier_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
        if not self.community_risk_scores_df.empty and "risk_level" in self.community_risk_scores_df.columns:
            counts = self.community_risk_scores_df["risk_level"].value_counts().to_dict()
            tier_counts["HIGH"] = counts.get("HIGH", 0)
            tier_counts["MEDIUM"] = counts.get("MEDIUM", 0)
            tier_counts["LOW"] = counts.get("LOW", 0)

        return SummaryResponse(
            account_count=self.total_accounts,
            transaction_count=self.total_transactions,
            community_count=self.total_communities,
            high_risk_count=tier_counts["HIGH"],
            medium_risk_count=tier_counts["MEDIUM"],
            low_risk_count=tier_counts["LOW"],
            graph_edge_count=self.total_graph_edges,
        )

    def get_communities(self) -> CommunityListResponse:
        """Return all communities sorted by risk_score descending."""
        self.load_data()

        if self.community_risk_scores_df.empty:
            return CommunityListResponse(total=0, items=[])

        # Merge risk scores with features
        merged = self.community_risk_scores_df.join(self.community_features_df, how="left")
        merged.sort_values(by=["risk_score", "risk_probability"], ascending=[False, False], inplace=True)

        items: List[CommunitySummary] = []
        for cid, row in merged.iterrows():
            cid_int = int(cid)
            items.append(
                CommunitySummary(
                    community_id=cid_int,
                    member_count=int(row.get("member_count", len(self.community_to_accounts.get(cid_int, [])))),
                    risk_score=int(row.get("risk_score", 0)),
                    risk_probability=round(float(row.get("risk_probability", 0.0)), 4),
                    risk_level=str(row.get("risk_level", "LOW")),
                    top_signal_1=str(row.get("top_signal_1", "")),
                    top_signal_2=str(row.get("top_signal_2", "")),
                    top_signal_3=str(row.get("top_signal_3", "")),
                    density=round(float(row.get("density", 0.0)), 6),
                    mean_edge_weight=_sanitize_float(row.get("mean_edge_weight")),
                    tx_per_member=round(float(row.get("tx_per_member", 0.0)), 2),
                    total_transaction_amount=round(float(row.get("total_transaction_amount", 0.0)), 2),
                )
            )

        return CommunityListResponse(total=len(items), items=items)

    def get_community_detail(self, community_id: int) -> Optional[CommunityDetailResponse]:
        """Return detailed metrics and features for a single community."""
        self.load_data()

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
        features: Dict[str, Optional[float]] = {}
        for feat in FEATURE_NAMES:
            features[feat] = _sanitize_float(feat_row.get(feat))

        member_count = int(feat_row.get("member_count", len(self.community_to_accounts.get(community_id, []))))
        density = float(feat_row.get("density", 0.0))
        mean_edge_weight = _sanitize_float(feat_row.get("mean_edge_weight"))
        weight_per_member = float(feat_row.get("weight_per_member", 0.0))
        total_internal_weight = weight_per_member * member_count

        possible_pairs = member_count * (member_count - 1) / 2.0 if member_count > 1 else 0
        internal_edge_count = int(round(density * possible_pairs))

        # Build detailed responses
        tx_stats = TransactionStats(
            total_transaction_amount=float(feat_row.get("total_transaction_amount", 0.0)),
            mean_tx_amount=_sanitize_float(feat_row.get("mean_tx_amount")),
            amount_cv=_sanitize_float(feat_row.get("amount_cv")),
            declined_rate=_sanitize_float(feat_row.get("declined_rate")),
            tx_per_member=float(feat_row.get("tx_per_member", 0.0)),
            unique_payment_methods=_sanitize_float(feat_row.get("unique_payment_methods")),
            merchant_category_entropy=_sanitize_float(feat_row.get("merchant_category_entropy")),
        )

        temp_stats = TemporalStats(
            temporal_compression_score=float(feat_row.get("temporal_compression_score", 0.0)),
            unique_active_hours=float(feat_row.get("unique_active_hours", 0.0)),
            median_inter_transaction_gap_hours=_sanitize_float(feat_row.get("median_inter_transaction_gap_hours")),
            timestamp_span_hours=None,
            min_timestamp=None,
            max_timestamp=None,
        )

        entity_sharing = EntitySharingStats(
            unique_shared_instruments=float(feat_row.get("unique_shared_instruments", 0.0)),
            unique_shared_devices=float(feat_row.get("unique_shared_devices", 0.0)),
            unique_shared_ips=float(feat_row.get("unique_shared_ips", 0.0)),
            unique_shared_merchants=float(feat_row.get("unique_shared_merchants", 0.0)),
            instrument_sharing_ratio=float(feat_row.get("instrument_sharing_ratio", 0.0)),
            device_sharing_ratio=float(feat_row.get("device_sharing_ratio", 0.0)),
        )

        return CommunityDetailResponse(
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

    def get_community_accounts(
        self, community_id: int, page: int = 1, page_size: int = 50
    ) -> Optional[PaginatedAccountsResponse]:
        """Return paginated list of accounts in a community."""
        self.load_data()

        if (
            self.community_risk_scores_df.empty
            or community_id not in self.community_risk_scores_df.index
        ):
            return None

        account_ids = self.community_to_accounts.get(community_id, [])
        total = len(account_ids)
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        total_pages = max(1, math.ceil(total / page_size))

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_account_ids = account_ids[start_idx:end_idx]

        items: List[AccountSummary] = []
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

    def get_account(self, account_id: str) -> Optional[AccountDetailResponse]:
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

        if sent_indices and not self.transactions_df.empty:
            sent_df = self.transactions_df.iloc[sent_indices]
            total_amount_sent = float(sent_df["amount"].sum())
            declined_count += int((sent_df["transaction_status"] == "declined").sum())

        if recv_indices and not self.transactions_df.empty:
            recv_df = self.transactions_df.iloc[recv_indices]
            total_amount_recv = float(recv_df["amount"].sum())
            declined_count += int((recv_df["transaction_status"] == "declined").sum())

        conn_count = len(self.account_connections_map.get(account_id, []))

        return AccountDetailResponse(
            account_id=account_id,
            customer_name=str(acc_row.get("customer_name", "Unknown")),
            balance=round(float(acc_row.get("balance", 0.0)), 2),
            account_risk_score=_sanitize_float(acc_row.get("risk_score")),
            creation_date=str(acc_row.get("creation_date", "")) if pd.notna(acc_row.get("creation_date")) else None,
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

    def get_account_transactions(
        self,
        account_id: str,
        page: int = 1,
        page_size: int = 50,
        direction: str = "all",
    ) -> Optional[PaginatedTransactionsResponse]:
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
            all_indices = sorted(list(set(sent_idx + recv_idx)))

        total = len(all_indices)
        page = max(1, page)
        page_size = max(1, min(100, page_size))
        total_pages = max(1, math.ceil(total / page_size))

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_indices = all_indices[start_idx:end_idx]

        items: List[TransactionItem] = []
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

    def get_account_connections(self, account_id: str) -> Optional[AccountConnectionsResponse]:
        """Return observable connections and shared evidence for an account."""
        self.load_data()

        if self.accounts_df.empty or account_id not in self.accounts_df.index:
            return None

        raw_conns = self.account_connections_map.get(account_id, [])
        items: List[ConnectionItem] = []
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

    def get_transaction(self, transaction_id: str) -> Optional[TransactionDetailResponse]:
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

    def get_community_graph(
        self, community_id: int, max_nodes: int = 200, max_edges: int = 500
    ) -> Optional[CommunityGraphResponse]:
        """Return graph nodes and edges for community visualization."""
        self.load_data()

        if (
            self.community_risk_scores_df.empty
            or community_id not in self.community_risk_scores_df.index
        ):
            return None

        member_accounts = self.community_to_accounts.get(community_id, [])
        all_edges = self.community_edges_map.get(community_id, [])

        # Calculate degrees within community
        degrees: Dict[str, int] = {acc: 0 for acc in member_accounts}
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

        nodes: List[GraphNode] = []
        for acc in selected_nodes_set:
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

        # Select edges between selected nodes
        edges: List[GraphEdge] = []
        for e in all_edges:
            src = e["source"]
            dst = e["target"]
            if src in selected_nodes_set and dst in selected_nodes_set:
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
                    )
                )
                if len(edges) >= max_edges:
                    break

        return CommunityGraphResponse(
            community_id=community_id,
            total_nodes=len(member_accounts),
            total_edges=len(all_edges),
            nodes=nodes,
            edges=edges,
        )

    def get_community_timeline(
        self, community_id: int, limit: int = 100, offset: int = 0
    ) -> Optional[CommunityTimelineResponse]:
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
        comm_tx_indices: Set[int] = set()
        for acc in member_set:
            comm_tx_indices.update(self.account_sent_tx_indices.get(acc, []))
            comm_tx_indices.update(self.account_recv_tx_indices.get(acc, []))

        total = len(comm_tx_indices)
        if total == 0 or self.transactions_df.empty:
            return CommunityTimelineResponse(community_id=community_id, total_events=0, events=[])

        sorted_indices = sorted(
            list(comm_tx_indices),
            key=lambda idx: self.transactions_df.iloc[idx]["timestamp"],
        )

        limit = max(1, min(1000, limit))
        offset = max(0, offset)
        page_indices = sorted_indices[offset : offset + limit]

        events: List[TimelineEvent] = []
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

    def get_community_evidence(self, community_id: int) -> Optional[CommunityEvidenceResponse]:
        """Run observable evidence analysis for a community.

        Uses the Evidence Intelligence Engine with in-memory indexed data.
        Returns None if the community does not exist.

        Note: evidence_score is DISTINCT from risk_score.
          risk_score     = ML-derived ensemble prioritization
          evidence_score = deterministic observable rule strength
        """
        self.load_data()

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

        return CommunityEvidenceResponse(
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

    def get_account_evidence(self, account_id: str) -> Optional[AccountEvidenceResponse]:
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
