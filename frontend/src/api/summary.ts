import { fetchApi } from './client';
import type { HealthResponse, SummaryResponse } from '../types/api';

export async function getHealth(): Promise<HealthResponse> {
  return fetchApi<HealthResponse>('/health');
}

export async function getSummary(): Promise<SummaryResponse> {
  return fetchApi<SummaryResponse>('/summary');
}
