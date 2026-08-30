import { fetchApi } from './client';
import type {
  AccountConnectionsResponse,
  AccountDetailResponse,
  AccountEvidenceResponse,
  AccountPeerStatsResponse,
  PaginatedAccountsRegistryResponse,
  PaginatedTransactionsResponse,
} from '../types/api';

export interface GetAccountsParams {
  page?: number;
  pageSize?: number;
  communityId?: number;
  riskTier?: 'HIGH' | 'MEDIUM' | 'LOW' | 'all';
  minRiskScore?: number;
  maxRiskScore?: number;
  search?: string;
  sortBy?: 'risk_score' | 'community_risk' | 'tx_count' | 'tx_volume' | 'connections' | 'declined' | 'balance' | 'account_id';
  sortOrder?: 'asc' | 'desc';
}

export async function getAccounts(params: GetAccountsParams = {}): Promise<PaginatedAccountsRegistryResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('page_size', String(params.pageSize));
  if (params.communityId !== undefined && params.communityId !== null) q.set('community_id', String(params.communityId));
  if (params.riskTier && params.riskTier !== 'all') q.set('risk_tier', params.riskTier);
  if (params.minRiskScore !== undefined) q.set('min_risk_score', String(params.minRiskScore));
  if (params.maxRiskScore !== undefined) q.set('max_risk_score', String(params.maxRiskScore));
  if (params.search) q.set('search', params.search.trim());
  if (params.sortBy) q.set('sort_by', params.sortBy);
  if (params.sortOrder) q.set('sort_order', params.sortOrder);

  const qs = q.toString();
  return fetchApi<PaginatedAccountsRegistryResponse>(`/accounts${qs ? `?${qs}` : ''}`);
}

export async function getAccount(accountId: string): Promise<AccountDetailResponse> {
  return fetchApi<AccountDetailResponse>(`/accounts/${accountId}`);
}

export async function getAccountPeerStats(accountId: string): Promise<AccountPeerStatsResponse> {
  return fetchApi<AccountPeerStatsResponse>(`/accounts/${accountId}/peer-stats`);
}

export async function getAccountTransactions(
  accountId: string,
  page: number = 1,
  pageSize: number = 50,
  direction: 'all' | 'sent' | 'received' = 'all'
): Promise<PaginatedTransactionsResponse> {
  return fetchApi<PaginatedTransactionsResponse>(
    `/accounts/${accountId}/transactions?page=${page}&page_size=${pageSize}&direction=${direction}`
  );
}

export async function getAccountConnections(accountId: string): Promise<AccountConnectionsResponse> {
  return fetchApi<AccountConnectionsResponse>(`/accounts/${accountId}/connections`);
}

export async function getAccountEvidence(accountId: string): Promise<AccountEvidenceResponse> {
  return fetchApi<AccountEvidenceResponse>(`/accounts/${accountId}/evidence`);
}

