/**
 * TraceLine Frontend API Type Definitions.
 * Strictly reflects observable evidence and ML community risk scores.
 * Ground-truth evaluation fields (pattern_id, is_ring_member, etc.) are excluded.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

export interface SummaryResponse {
  account_count: number;
  transaction_count: number;
  community_count: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  graph_edge_count: number;
}

export interface CommunitySummary {
  community_id: number;
  member_count: number;
  risk_score: number;
  risk_probability: number;
  risk_level: RiskLevel;
  top_signal_1: string;
  top_signal_2: string;
  top_signal_3: string;
  density: number;
  mean_edge_weight: number | null;
  tx_per_member: number;
  total_transaction_amount: number;
}

export interface CommunityListResponse {
  total: number;
  items: CommunitySummary[];
}

export interface TransactionStats {
  total_transaction_amount: number;
  mean_tx_amount: number | null;
  amount_cv: number | null;
  declined_rate: number | null;
  tx_per_member: number;
  unique_payment_methods: number | null;
  merchant_category_entropy: number | null;
}

export interface TemporalStats {
  temporal_compression_score: number;
  unique_active_hours: number;
  median_inter_transaction_gap_hours: number | null;
  timestamp_span_hours: number | null;
  min_timestamp: string | null;
  max_timestamp: string | null;
}

export interface EntitySharingStats {
  unique_shared_instruments: number;
  unique_shared_devices: number;
  unique_shared_ips: number;
  unique_shared_merchants: number;
  instrument_sharing_ratio: number;
  device_sharing_ratio: number;
}

export interface CommunityDetailResponse {
  community_id: number;
  member_count: number;
  risk_score: number;
  risk_probability: number;
  risk_level: RiskLevel;
  top_signal_1: string;
  top_signal_2: string;
  top_signal_3: string;
  features: Record<string, number | null>;
  density: number;
  mean_edge_weight: number | null;
  total_internal_weight: number;
  internal_edge_count: number;
  transaction_statistics: TransactionStats;
  temporal_statistics: TemporalStats;
  entity_sharing: EntitySharingStats;
}

export interface AccountSummary {
  account_id: string;
  customer_name: string;
  balance: number;
  account_risk_score: number | null;
  creation_date: string | null;
  community_id: number;
}

export interface PaginatedAccountsResponse {
  community_id: number;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: AccountSummary[];
}

export interface AccountTransactionStats {
  sent_count: number;
  received_count: number;
  total_count: number;
  total_amount_sent: number;
  total_amount_received: number;
  declined_count: number;
}

export interface AccountDetailResponse {
  account_id: string;
  customer_name: string;
  balance: number;
  account_risk_score: number | null;
  creation_date: string | null;
  community_id: number | null;
  community_risk_score: number | null;
  community_risk_level: RiskLevel | null;
  connected_account_count: number;
  transaction_statistics: AccountTransactionStats;
}

export interface ConnectionItem {
  connected_account_id: string;
  edge_weight: number;
  shared_devices: string[];
  shared_payment_instruments: string[];
  shared_ips: string[];
  shared_merchants: string[];
  temporal_overlap: number;
}

export interface AccountConnectionsResponse {
  account_id: string;
  total_connections: number;
  connections: ConnectionItem[];
}

export interface TransactionItem {
  transaction_id: string;
  timestamp: string;
  amount: number;
  src_account_id: string;
  dst_account_id: string;
  merchant_id: string | null;
  device_id: string | null;
  payment_instrument_id: string | null;
  ip_address: string | null;
  payment_method: string | null;
  account_age_days: number | null;
  transaction_status: string;
}

export interface PaginatedTransactionsResponse {
  account_id: string | null;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: TransactionItem[];
}

export interface TransactionDetailResponse {
  transaction_id: string;
  timestamp: string;
  amount: number;
  src_account_id: string;
  dst_account_id: string;
  merchant_id: string | null;
  merchant_name: string | null;
  merchant_category: string | null;
  device_id: string | null;
  payment_instrument_id: string | null;
  ip_address: string | null;
  payment_method: string | null;
  account_age_days: number | null;
  transaction_status: string;
}

export interface GraphNode {
  id: string;
  label: string;
  customer_name: string | null;
  balance: number | null;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  shared_instruments: string[];
  shared_devices: string[];
  shared_ips: string[];
  shared_merchants: string[];
  temporal_overlap: number;
}

export interface CommunityGraphResponse {
  community_id: number;
  total_nodes: number;
  total_edges: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TimelineEvent {
  transaction_id: string;
  timestamp: string;
  src_account_id: string;
  dst_account_id: string;
  amount: number;
  transaction_status: string;
  merchant_id: string | null;
  payment_method: string | null;
}

export interface CommunityTimelineResponse {
  community_id: number;
  total_events: number;
  events: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Evidence Intelligence Engine types
// evidence_score is DISTINCT from risk_score:
//   risk_score     = ML-derived ensemble prioritization
//   evidence_score = deterministic observable rule strength
// ---------------------------------------------------------------------------

export type EvidenceSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type EvidenceType =
  | 'SHARED_INSTRUMENT_CONCENTRATION'
  | 'DEVICE_REUSE'
  | 'IP_CONCENTRATION'
  | 'TEMPORAL_BURST'
  | 'RAPID_INTERACTION'
  | 'MERCHANT_TEMPORAL_OVERLAP'
  | 'HIGH_EVIDENCE_DENSITY'
  | 'HUB_ACCOUNT'
  | 'MULTI_LAYER_EVIDENCE';

export interface EvidenceItem {
  evidence_id: string;
  entity_type: string;
  entity_id: string;
  type: EvidenceType;
  severity: EvidenceSeverity;
  title: string;
  description: string;
  score_contribution: number;
  observed_at: string | null;
  supporting_entities: string[];
  metrics: Record<string, unknown>;
}

export interface CommunityEvidenceResponse {
  community_id: number;
  /** Deterministic observable-rule strength [0–100], CAPPED. Always saturates at 100 for medium+ communities. */
  evidence_score: number;
  /** Uncapped total: High×25 + Med×12 + Low×5. Use this to compare evidence load across communities. */
  raw_evidence_score: number;
  evidence_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  items: EvidenceItem[];
  runtime_ms: number;
}


export interface AccountEvidenceResponse {
  account_id: string;
  community_id: number | null;
  /** Deterministic observable-rule strength [0–100]. NOT the ML risk_score. */
  evidence_score: number;
  evidence_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  items: EvidenceItem[];
  runtime_ms: number;
}
