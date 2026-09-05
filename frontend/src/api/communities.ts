import { fetchApi } from './client';
import type {
  CommunityDetailResponse,
  CommunityEvidenceResponse,
  CommunityGraphResponse,
  CommunityListResponse,
  CommunityTimelineResponse,
  PaginatedAccountsResponse,
} from '../types/api';

export async function getCommunities(): Promise<CommunityListResponse> {
  return fetchApi<CommunityListResponse>('/communities');
}

export async function getCommunity(communityId: number | string): Promise<CommunityDetailResponse> {
  return fetchApi<CommunityDetailResponse>(`/communities/${communityId}`);
}

export async function getCommunityAccounts(
  communityId: number | string,
  page: number = 1,
  pageSize: number = 50,
  riskLevel?: string,
  sortBy?: string,
  search?: string
): Promise<PaginatedAccountsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (riskLevel && riskLevel !== 'ALL') {
    params.set('risk_level', riskLevel);
  }
  if (sortBy) {
    params.set('sort_by', sortBy);
  }
  if (search && search.trim()) {
    params.set('search', search.trim());
  }
  return fetchApi<PaginatedAccountsResponse>(
    `/communities/${communityId}/accounts?${params.toString()}`
  );
}

export async function getCommunityGraph(
  communityId: number | string,
  maxNodes: number = 200,
  maxEdges: number = 500,
  focalAccountId?: string | null
): Promise<CommunityGraphResponse> {
  const focalQuery = focalAccountId ? `&focal_account_id=${encodeURIComponent(focalAccountId)}` : '';
  return fetchApi<CommunityGraphResponse>(
    `/graph/community/${communityId}?max_nodes=${maxNodes}&max_edges=${maxEdges}${focalQuery}`
  );
}

export async function getCommunityTimeline(
  communityId: number | string,
  limit: number = 100,
  offset: number = 0
): Promise<CommunityTimelineResponse> {
  return fetchApi<CommunityTimelineResponse>(
    `/timeline/community/${communityId}?limit=${limit}&offset=${offset}`
  );
}

export async function getCommunityEvidence(
  communityId: number | string
): Promise<CommunityEvidenceResponse> {
  return fetchApi<CommunityEvidenceResponse>(`/communities/${communityId}/evidence`);
}
