import { fetchApi } from './client';
import type { TransactionDetailResponse } from '../types/api';

export async function getTransaction(transactionId: string): Promise<TransactionDetailResponse> {
  return fetchApi<TransactionDetailResponse>(`/transactions/${transactionId}`);
}
