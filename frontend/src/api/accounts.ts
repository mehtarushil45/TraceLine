import { fetchApi } from './client';
import type {
  AccountConnectionsResponse,
  AccountDetailResponse,
  AccountEvidenceResponse,
  PaginatedTransactionsResponse,
} from '../types/api';

export async function getAccount(accountId: string): Promise<AccountDetailResponse> {
  return fetchApi<AccountDetailResponse>(`/accounts/${accountId}`);
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
