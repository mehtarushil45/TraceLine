import { fetchApi } from './client';
import type {
  PaginatedTransactionListResponse,
  TransactionCounterpartyResponse,
  TransactionDetailResponse,
} from '../types/api';

export interface TransactionListParams {
  page?: number;
  page_size?: number;
  status?: string;
  payment_method?: string;
  min_amount?: number;
  max_amount?: number;
  search?: string;
  sort_by?: string;
  sort_order?: string;
}

export async function getTransactionsList(
  params: TransactionListParams = {}
): Promise<PaginatedTransactionListResponse> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.page_size !== undefined) qs.set('page_size', String(params.page_size));
  if (params.status) qs.set('status', params.status);
  if (params.payment_method) qs.set('payment_method', params.payment_method);
  if (params.min_amount !== undefined) qs.set('min_amount', String(params.min_amount));
  if (params.max_amount !== undefined) qs.set('max_amount', String(params.max_amount));
  if (params.search) qs.set('search', params.search);
  if (params.sort_by) qs.set('sort_by', params.sort_by);
  if (params.sort_order) qs.set('sort_order', params.sort_order);
  const query = qs.toString();
  return fetchApi<PaginatedTransactionListResponse>(`/transactions${query ? `?${query}` : ''}`);
}

export async function getTransaction(transactionId: string): Promise<TransactionDetailResponse> {
  return fetchApi<TransactionDetailResponse>(`/transactions/${transactionId}`);
}

export async function getTransactionCounterparty(
  transactionId: string
): Promise<TransactionCounterpartyResponse> {
  return fetchApi<TransactionCounterpartyResponse>(`/transactions/${transactionId}/counterparty`);
}
