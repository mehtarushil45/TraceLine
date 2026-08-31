"""Pydantic request and response schemas for the TraceLine API.

All response schemas strictly adhere to the leakage contract: only observable
payment network evidence and ML risk-scoring outputs are exposed.
Ground-truth evaluation fields (pattern_id, is_ring_member, fraud_cases, etc.)
are never included in any schema.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Health & Summary
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field("ok", description="Service status")
    version: str = Field("1.0.0", description="API version")
    timestamp: str = Field(..., description="Current server ISO timestamp")


class SummaryResponse(BaseModel):
    """System-wide summary metrics for the payment network."""

    account_count: int = Field(..., description="Total accounts in the network")
    transaction_count: int = Field(..., description="Total observable transactions")
    community_count: int = Field(..., description="Total detected Louvain communities")
    high_risk_count: int = Field(..., description="Number of communities in HIGH risk tier (score >= 60)")
    medium_risk_count: int = Field(..., description="Number of communities in MEDIUM risk tier (35 <= score < 60)")
    low_risk_count: int = Field(..., description="Number of communities in LOW risk tier (score < 35)")
    graph_edge_count: int = Field(..., description="Total projected AccountGraph evidence edges")


# ---------------------------------------------------------------------------
# Communities
# ---------------------------------------------------------------------------


class CommunitySummary(BaseModel):
    """Concise community representation for list views."""

    community_id: int = Field(..., description="Unique integer community ID")
    member_count: int = Field(..., description="Number of member accounts in this community")
    risk_score: int = Field(..., description="Integer risk score in [0, 100]")
    risk_probability: float = Field(..., description="Estimated risk probability in [0, 1]")
    risk_level: str = Field(..., description="Risk tier: LOW, MEDIUM, or HIGH")
    top_signal_1: str = Field(..., description="Primary observable risk signal")
    top_signal_2: str = Field(..., description="Secondary observable risk signal")
    top_signal_3: str = Field(..., description="Tertiary observable risk signal")
    density: float = Field(..., description="Internal connection density")
    mean_edge_weight: float | None = Field(None, description="Average edge weight among members")
    tx_per_member: float = Field(..., description="Average transactions per member")
    total_transaction_amount: float = Field(..., description="Total transaction volume in USD")


class CommunityListResponse(BaseModel):
    """Response containing all detected communities sorted by risk score."""

    total: int = Field(..., description="Total number of communities returned")
    items: list[CommunitySummary] = Field(..., description="Communities sorted by risk score descending")


class TransactionStats(BaseModel):
    """Transaction behavior statistics for a community."""

    total_transaction_amount: float = Field(..., description="Total financial volume")
    mean_tx_amount: float | None = Field(None, description="Mean transaction amount")
    amount_cv: float | None = Field(None, description="Coefficient of variation of transaction amounts")
    declined_rate: float | None = Field(None, description="Fraction of declined transactions")
    tx_per_member: float = Field(..., description="Transactions per member")
    unique_payment_methods: float | None = Field(None, description="Number of distinct payment methods used")
    merchant_category_entropy: float | None = Field(None, description="Entropy of merchant categories")


class TemporalStats(BaseModel):
    """Temporal concentration statistics for a community."""

    temporal_compression_score: float = Field(..., description="Temporal compression score in (0, 1]")
    unique_active_hours: float = Field(..., description="Count of distinct clock hours (0-23) active")
    median_inter_transaction_gap_hours: float | None = Field(None, description="Median gap between transactions in hours")
    timestamp_span_hours: float | None = Field(None, description="Span from first to last transaction in hours")
    min_timestamp: str | None = Field(None, description="Earliest transaction timestamp")
    max_timestamp: str | None = Field(None, description="Latest transaction timestamp")


class EntitySharingStats(BaseModel):
    """Shared infrastructure evidence metrics for a community."""

    unique_shared_instruments: float = Field(..., description="Count of unique shared payment instruments")
    unique_shared_devices: float = Field(..., description="Count of unique shared devices")
    unique_shared_ips: float = Field(..., description="Count of unique shared IP addresses")
    unique_shared_merchants: float = Field(..., description="Count of unique shared merchants")
    instrument_sharing_ratio: float = Field(..., description="Shared instruments per member")
    device_sharing_ratio: float = Field(..., description="Shared devices per member")


class CommunityDetailResponse(BaseModel):
    """Comprehensive investigator view for a single community."""

    community_id: int = Field(..., description="Unique integer community ID")
    member_count: int = Field(..., description="Number of member accounts")
    risk_score: int = Field(..., description="Risk score in [0, 100]")
    risk_probability: float = Field(..., description="Risk probability in [0, 1]")
    risk_level: str = Field(..., description="Risk level (LOW, MEDIUM, HIGH)")
    top_signal_1: str = Field(..., description="Primary observable signal")
    top_signal_2: str = Field(..., description="Secondary observable signal")
    top_signal_3: str = Field(..., description="Tertiary observable signal")
    features: dict[str, float | None] = Field(..., description="Full map of 21 observable community features")
    density: float = Field(..., description="Internal edge density")
    mean_edge_weight: float | None = Field(None, description="Average weight of internal edges")
    total_internal_weight: float = Field(..., description="Sum of all internal edge weights")
    internal_edge_count: int = Field(..., description="Count of internal edges between members")
    transaction_statistics: TransactionStats = Field(..., description="Transaction behavior statistics")
    temporal_statistics: TemporalStats = Field(..., description="Temporal concentration statistics")
    entity_sharing: EntitySharingStats = Field(..., description="Entity sharing metrics")


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


class AccountRegistryItem(BaseModel):
    """Account summary item in the global accounts registry index."""

    account_id: str = Field(..., description="Account identifier")
    customer_name: str = Field(..., description="Customer name")
    balance: float = Field(..., description="Current ledger balance")
    account_risk_score: float | None = Field(None, description="Account baseline risk score [0, 1]")
    risk_level: str = Field("LOW", description="Derived risk level (HIGH, MEDIUM, LOW)")
    creation_date: str | None = Field(None, description="Account creation / registration date")
    community_id: int | None = Field(None, description="Assigned community ID")
    community_risk_score: int | None = Field(None, description="Assigned community risk score [0-100]")
    community_risk_level: str | None = Field(None, description="Assigned community risk tier")
    connected_account_count: int = Field(0, description="Count of connected accounts in graph")
    tx_count: int = Field(0, description="Total transactions involving this account")
    tx_volume: float = Field(0.0, description="Total transacted amount (sent + received)")
    declined_count: int = Field(0, description="Count of declined transactions")
    decline_rate: float = Field(0.0, description="Fraction of transactions declined")


class PaginatedAccountsRegistryResponse(BaseModel):
    """Paginated global accounts registry."""

    total: int = Field(..., description="Total matching accounts")
    page: int = Field(..., description="Current page number (1-indexed)")
    page_size: int = Field(..., description="Items per page")
    total_pages: int = Field(..., description="Total pages available")
    items: list[AccountRegistryItem] = Field(..., description="List of account records for current page")


class AccountPeerStatsResponse(BaseModel):
    """Peer comparison metrics for an account against its assigned community peer group."""

    account_id: str = Field(..., description="Target account identifier")
    community_id: int | None = Field(None, description="Community ID used as peer baseline")
    peer_count: int = Field(0, description="Total member accounts in peer group")
    peer_sample_size: int = Field(0, description="Number of peers sampled for baseline calculation")
    has_peer_data: bool = Field(True, description="Whether sufficient peer data is available")

    # Target account metrics
    account_tx_count: int = Field(0, description="Account transaction count")
    account_tx_volume: float = Field(0.0, description="Account total transacted volume")
    account_decline_rate: float = Field(0.0, description="Account decline rate (0-1)")
    account_connections: int = Field(0, description="Account graph connection count")
    account_avg_tx_amount: float = Field(0.0, description="Account average transaction amount")

    # Peer baseline medians
    peer_median_tx_count: float | None = Field(None, description="Peer median transaction count")
    peer_median_tx_volume: float | None = Field(None, description="Peer median transaction volume")
    peer_median_decline_rate: float | None = Field(None, description="Peer median decline rate")
    peer_median_connections: float | None = Field(None, description="Peer median connection count")
    peer_median_avg_tx_amount: float | None = Field(None, description="Peer median average transaction amount")


class AccountSummary(BaseModel):
    """Account summary item within a community."""

    account_id: str = Field(..., description="Account identifier")
    customer_name: str = Field(..., description="Customer name")
    balance: float = Field(..., description="Current balance")
    account_risk_score: float | None = Field(None, description="Account baseline risk score")
    creation_date: str | None = Field(None, description="Account creation date")
    community_id: int = Field(..., description="Assigned community ID")


class PaginatedAccountsResponse(BaseModel):
    """Paginated list of accounts in a community."""

    community_id: int = Field(..., description="Community ID")
    total: int = Field(..., description="Total accounts in this community")
    page: int = Field(..., description="Current page number (1-indexed)")
    page_size: int = Field(..., description="Number of items per page")
    total_pages: int = Field(..., description="Total pages available")
    items: list[AccountSummary] = Field(..., description="List of account records for current page")


class AccountTransactionStats(BaseModel):
    """Transaction activity summary for a single account."""

    sent_count: int = Field(..., description="Count of outgoing transactions")
    received_count: int = Field(..., description="Count of incoming transactions")
    total_count: int = Field(..., description="Total transactions involving this account")
    total_amount_sent: float = Field(..., description="Sum of sent amounts")
    total_amount_received: float = Field(..., description="Sum of received amounts")
    declined_count: int = Field(..., description="Number of declined transactions")


class AccountDetailResponse(BaseModel):
    """Detailed view of an individual account."""

    account_id: str = Field(..., description="Account identifier")
    customer_name: str = Field(..., description="Customer name")
    balance: float = Field(..., description="Current balance")
    account_risk_score: float | None = Field(None, description="Account baseline risk score")
    risk_level: str = Field("LOW", description="Derived risk level (HIGH, MEDIUM, LOW)")
    creation_date: str | None = Field(None, description="Account creation date")
    first_observed_activity: str | None = Field(None, description="Earliest observed transaction timestamp")
    last_observed_activity: str | None = Field(None, description="Latest observed transaction timestamp")
    community_id: int | None = Field(None, description="Assigned community ID")
    community_risk_score: int | None = Field(None, description="Risk score of the assigned community")
    community_risk_level: str | None = Field(None, description="Risk tier of the assigned community")
    connected_account_count: int = Field(..., description="Number of connected accounts in the evidence graph")
    transaction_statistics: AccountTransactionStats = Field(..., description="Transaction metrics for this account")



class ConnectionItem(BaseModel):
    """An observable evidence connection between two accounts."""

    connected_account_id: str = Field(..., description="Connected account identifier")
    edge_weight: float = Field(..., description="Evidence weight of connection")
    shared_devices: list[str] = Field(default_factory=list, description="Shared device IDs")
    shared_payment_instruments: list[str] = Field(default_factory=list, description="Shared payment instrument IDs")
    shared_ips: list[str] = Field(default_factory=list, description="Shared IP addresses")
    shared_merchants: list[str] = Field(default_factory=list, description="Shared merchant IDs")
    temporal_overlap: int = Field(0, description="Calendar days with co-occurring activity")


class AccountConnectionsResponse(BaseModel):
    """Observable graph connections for an account."""

    account_id: str = Field(..., description="Target account ID")
    total_connections: int = Field(..., description="Total connected accounts")
    connections: list[ConnectionItem] = Field(..., description="List of connections")


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------


class TransactionItem(BaseModel):
    """Observable transaction record."""

    transaction_id: str = Field(..., description="Transaction identifier")
    timestamp: str = Field(..., description="ISO 8601 transaction timestamp")
    amount: float = Field(..., description="Transaction amount")
    src_account_id: str = Field(..., description="Source account ID")
    dst_account_id: str = Field(..., description="Destination account ID")
    merchant_id: str | None = Field(None, description="Merchant identifier")
    device_id: str | None = Field(None, description="Device identifier")
    payment_instrument_id: str | None = Field(None, description="Payment instrument identifier")
    ip_address: str | None = Field(None, description="IP address")
    payment_method: str | None = Field(None, description="Payment method used")
    account_age_days: int | None = Field(None, description="Age of account in days at transaction time")
    transaction_status: str = Field(..., description="Status: settled, pending, declined, etc.")


class PaginatedTransactionsResponse(BaseModel):
    """Paginated list of transactions."""

    account_id: str | None = Field(None, description="Account ID filter if applicable")
    total: int = Field(..., description="Total matching transactions")
    page: int = Field(..., description="Current page number (1-indexed)")
    page_size: int = Field(..., description="Number of transactions per page")
    total_pages: int = Field(..., description="Total pages available")
    items: list[TransactionItem] = Field(..., description="Transaction records for current page")


class TransactionDetailResponse(BaseModel):
    """Detailed transaction view with merchant catalog enrichment."""

    transaction_id: str = Field(..., description="Transaction identifier")
    timestamp: str = Field(..., description="ISO 8601 transaction timestamp")
    amount: float = Field(..., description="Transaction amount")
    src_account_id: str = Field(..., description="Source account ID")
    dst_account_id: str = Field(..., description="Destination account ID")
    merchant_id: str | None = Field(None, description="Merchant identifier")
    merchant_name: str | None = Field(None, description="Merchant name if available")
    merchant_category: str | None = Field(None, description="Merchant category if available")
    device_id: str | None = Field(None, description="Device identifier")
    payment_instrument_id: str | None = Field(None, description="Payment instrument identifier")
    ip_address: str | None = Field(None, description="IP address")
    payment_method: str | None = Field(None, description="Payment method used")
    account_age_days: int | None = Field(None, description="Age of account in days")
    transaction_status: str = Field(..., description="Transaction status")


class TransactionListItem(BaseModel):
    """Lightweight transaction row for the investigator registry listing."""

    transaction_id: str = Field(..., description="Transaction identifier")
    timestamp: str = Field(..., description="ISO 8601 transaction timestamp")
    amount: float = Field(..., description="Transaction amount")
    src_account_id: str = Field(..., description="Source account ID")
    dst_account_id: str = Field(..., description="Destination account ID")
    transaction_status: str = Field(..., description="Status: settled, pending, declined")
    payment_method: str | None = Field(None, description="Payment method: card, upi, wallet, netbanking")
    merchant_id: str | None = Field(None, description="Merchant identifier if present")


class PaginatedTransactionListResponse(BaseModel):
    """Paginated transaction registry response for the investigator queue."""

    total: int = Field(..., description="Total transactions matching filters")
    page: int = Field(..., description="Current page (1-indexed)")
    page_size: int = Field(..., description="Items per page")
    total_pages: int = Field(..., description="Total pages available")
    items: list[TransactionListItem] = Field(..., description="Transaction records")
    filtered_declined_count: int = Field(0, description="Declined transactions in filtered result set")
    filtered_total_amount: float = Field(0.0, description="Total amount in filtered result set")


class CounterpartyTransactionItem(BaseModel):
    """A transaction between the same counterparty pair, for the relationship preview."""

    transaction_id: str
    timestamp: str
    amount: float
    transaction_status: str
    payment_method: str | None


class TransactionCounterpartyResponse(BaseModel):
    """Observed relationship between the src and dst accounts of a given transaction.

    All values are deterministically computed from the enriched_transactions dataset.
    No ML scores. No fabricated values.
    """

    transaction_id: str = Field(..., description="The focal transaction ID")
    src_account_id: str = Field(..., description="Source account")
    dst_account_id: str = Field(..., description="Destination account")
    total_transactions_between: int = Field(..., description="All transactions between src and dst (both directions)")
    transactions_src_to_dst: int = Field(..., description="Transactions in the src->dst direction")
    transactions_dst_to_src: int = Field(..., description="Transactions in the dst->src direction")
    total_flow_src_to_dst: float = Field(..., description="Sum of amounts flowing src->dst")
    total_flow_dst_to_src: float = Field(..., description="Sum of amounts flowing dst->src")
    first_observed_between: str | None = Field(None, description="Earliest transaction timestamp between this pair")
    last_observed_between: str | None = Field(None, description="Latest transaction timestamp between this pair")
    declined_between: int = Field(0, description="Count of declined transactions between this pair")
    src_community_id: int | None = Field(None, description="Source account community (Louvain partition)")
    dst_community_id: int | None = Field(None, description="Destination account community")
    same_community: bool = Field(False, description="Whether src and dst belong to the same community")
    recent_transactions: list[CounterpartyTransactionItem] = Field(
        default_factory=list,
        description="Most recent transactions between this pair (max 5)",
    )


# ---------------------------------------------------------------------------
# Graph & Timeline
# ---------------------------------------------------------------------------


class GraphNode(BaseModel):
    """Node in community visualization graph."""

    id: str = Field(..., description="Account ID")
    label: str = Field(..., description="Display label")
    customer_name: str | None = Field(None, description="Customer name")
    balance: float | None = Field(None, description="Current balance")
    degree: int = Field(0, description="Connection degree within community")


class GraphEdge(BaseModel):
    """Edge in community visualization graph."""

    source: str = Field(..., description="Source account ID")
    target: str = Field(..., description="Target account ID")
    weight: float = Field(..., description="Evidence weight")
    shared_instruments: list[str] = Field(default_factory=list, description="Shared payment instruments")
    shared_devices: list[str] = Field(default_factory=list, description="Shared devices")
    shared_ips: list[str] = Field(default_factory=list, description="Shared IPs")
    shared_merchants: list[str] = Field(default_factory=list, description="Shared merchants")
    temporal_overlap: int = Field(0, description="Temporal co-occurrence days")


class CommunityGraphResponse(BaseModel):
    """Graph structure for community visualization."""

    community_id: int = Field(..., description="Community ID")
    total_nodes: int = Field(..., description="Total nodes in community")
    total_edges: int = Field(..., description="Total edges in community")
    nodes: list[GraphNode] = Field(..., description="Graph nodes")
    edges: list[GraphEdge] = Field(..., description="Graph edges")


class TimelineEvent(BaseModel):
    """Chronological event for community timeline."""

    transaction_id: str = Field(..., description="Transaction identifier")
    timestamp: str = Field(..., description="Timestamp of transaction")
    src_account_id: str = Field(..., description="Source account ID")
    dst_account_id: str = Field(..., description="Destination account ID")
    amount: float = Field(..., description="Transaction amount")
    transaction_status: str = Field(..., description="Status (settled, declined, etc.)")
    merchant_id: str | None = Field(None, description="Merchant ID")
    payment_method: str | None = Field(None, description="Payment method")


class CommunityTimelineResponse(BaseModel):
    """Community transaction activity timeline."""

    community_id: int = Field(..., description="Community ID")
    total_events: int = Field(..., description="Total chronological events")
    events: list[TimelineEvent] = Field(..., description="Chronological activity events")


# ---------------------------------------------------------------------------
# Evidence Intelligence Engine
# ---------------------------------------------------------------------------


class EvidenceItemSchema(BaseModel):
    """A single observable evidence finding produced by the Evidence Intelligence Engine.

    All fields derive exclusively from observable payment-network data.
    Ground-truth evaluation fields (pattern_id, is_ring_member, link_type,
    fraud_purity, max_ring_coverage, primary_ring_id, is_positive) are
    never included.

    Evidence Score vs Risk Score
    ----------------------------
    evidence_score = deterministic observable rule strength (this engine)
    risk_score     = ML-derived ensemble prioritization (separate system)
    """

    model_config = ConfigDict(populate_by_name=True)

    evidence_id: str = Field(..., description="Deterministic SHA-1 based identifier")
    entity_type: str = Field(..., description="'COMMUNITY' or 'ACCOUNT'")
    entity_id: str = Field(..., description="Community ID (as string) or account ID")
    type: str = Field(..., description="Evidence detector type (e.g. DEVICE_REUSE)")
    severity: str = Field(..., description="Investigation priority: HIGH, MEDIUM, or LOW")
    title: str = Field(..., description="Short investigator-facing title")
    description: str = Field(..., description="Full natural-language explanation")
    score_contribution: float = Field(..., description="Points contributed to evidence_score")
    observed_at: str | None = Field(None, description="ISO 8601 timestamp of earliest observation")
    supporting_entities: list[str] = Field(default_factory=list, description="Sorted list of supporting entity IDs")
    metrics: dict[str, Any] = Field(default_factory=dict, description="Named observable measurement values")


class CommunityEvidenceResponse(BaseModel):
    """Observable-only evidence analysis result for a community.

    evidence_score is DISTINCT from risk_score:
      risk_score          = ML-derived ensemble prioritization (LR model output)
      evidence_score      = deterministic observable rule strength, capped at 100.
                            For large communities this always saturates at 100.
      raw_evidence_score  = uncapped point total before the 100-point cap.
                            Use this to meaningfully compare evidence load across
                            communities when evidence_score is saturated.
    """

    community_id: int = Field(..., description="Community ID")
    evidence_score: int = Field(..., description="Aggregate observable-rule evidence strength [0-100] (capped)")
    raw_evidence_score: int = Field(..., description="Uncapped aggregate rule point total (High×25 + Med×12 + Low×5)")
    evidence_count: int = Field(..., description="Total evidence items found")
    high_count: int = Field(..., description="Number of HIGH severity evidence items")
    medium_count: int = Field(..., description="Number of MEDIUM severity evidence items")
    low_count: int = Field(..., description="Number of LOW severity evidence items")
    items: list[EvidenceItemSchema] = Field(..., description="Sorted evidence items (HIGH first)")
    runtime_ms: float = Field(..., description="Engine runtime in milliseconds")


class AccountEvidenceResponse(BaseModel):
    """Observable-only evidence analysis result for an account.

    evidence_score is DISTINCT from risk_score:
      risk_score     = ML-derived ensemble prioritization
      evidence_score = deterministic observable rule strength
    """

    account_id: str = Field(..., description="Account identifier")
    community_id: int | None = Field(None, description="Assigned community ID if any")
    evidence_score: int = Field(..., description="Aggregate observable-rule evidence strength [0-100]")
    evidence_count: int = Field(..., description="Total evidence items found")
    high_count: int = Field(..., description="Number of HIGH severity evidence items")
    medium_count: int = Field(..., description="Number of MEDIUM severity evidence items")
    low_count: int = Field(..., description="Number of LOW severity evidence items")
    items: list[EvidenceItemSchema] = Field(..., description="Sorted evidence items (HIGH first)")
    runtime_ms: float = Field(..., description="Engine runtime in milliseconds")
