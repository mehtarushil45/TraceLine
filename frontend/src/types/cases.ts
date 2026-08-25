/**
 * Investigation Case and Watchlist Types.
 * Strictly uses observable risk scores and avoids ground-truth evaluation attributes.
 */

export type CaseStatus = 'OPEN' | 'REVIEW' | 'CLOSED';
export type CasePriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TargetType = 'COMMUNITY' | 'ACCOUNT' | 'TRANSACTION';

export interface InvestigationTarget {
  type: TargetType;
  id: string;
  label: string;
  riskScore?: number | null;
  riskLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  addedAt: string;
}

export interface InvestigationCase {
  id: string;
  title: string;
  status: CaseStatus;
  priority: CasePriority;
  createdAt: string;
  updatedAt: string;
  notes: string;
  targets: InvestigationTarget[];
}
