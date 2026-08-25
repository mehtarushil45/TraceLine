import { fetchApi } from './client';
import type {
  CommunityDetailResponse,
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
  pageSize: number = 50
): Promise<PaginatedAccountsResponse> {
  return fetchApi<PaginatedAccountsResponse>(
    `/communities/${communityId}/accounts?page=${page}&page_size=${pageSize}`
  );
}

export async function getCommunityGraph(
  communityId: number | string,
  maxNodes: number = 200,
  maxEdges: number = 500
): Promise<CommunityGraphResponse> {
  return fetchApi<CommunityGraphResponse>(
    `/graph/community/${communityId}?max_nodes=${maxNodes}&max_edges=${maxEdges}`
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
