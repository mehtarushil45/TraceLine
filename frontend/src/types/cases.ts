/**
 * Investigation Case and Watchlist Types.
 * Strictly uses observable risk scores and avoids ground-truth evaluation attributes.
 *
 * Lifecycle: Risk Queue → Communities → Community Triage → Forensic Workspace
 *          → Forensic Workspace Decision (case creation boundary)
 *          → Cases / Formal Investigation Dossiers
 */

export type CaseStatus = 'OPEN' | 'REVIEW' | 'CLOSED';
export type CasePriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TargetType = 'COMMUNITY' | 'ACCOUNT' | 'TRANSACTION';
export type DossierStatus = 'READY' | 'INCOMPLETE';

export type AuditEventType =
  | 'CASE_CREATED'
  | 'DECISION_RECORDED'
  | 'EVIDENCE_SNAPSHOT_ATTACHED'
  | 'STATUS_CHANGED'
  | 'SAR_EXPORTED'
  | 'TARGET_ADDED'
  | 'NOTES_UPDATED'
  | 'DOSSIER_VIEWED';

/** Minimal evidence snapshot captured at decision time from community data. */
export interface EvidenceSnapshot {
  /** Total evidence trigger count at time of decision */
  evidenceCount: number;
  /** High-severity trigger count */
  highCount: number;
  /** Medium-severity trigger count */
  medCount: number;
  /** Low-severity trigger count */
  lowCount: number;
  /** Composite evidence score at time of decision */
  evidenceScore: number | null;
  /** ISO timestamp when snapshot was captured */
  snapshotTimestamp: string;
  /** Community member count at time of decision */
  memberCount: number;
  /** Shared infrastructure counts at time of decision */
  sharedDevices: number;
  sharedIps: number;
  sharedInstruments: number;
  /** Total transaction volume observed in the community */
  totalTransactionAmount: number;
}

/** A formally recorded investigator decision — INVESTIGATOR ENTERED. */
export interface FormalDecision {
  /** Investigator-chosen disposition */
  disposition: 'ESCALATE_SAR' | 'CLOSE_NO_ACTION' | 'MONITOR' | 'REFER_COMPLIANCE';
  /** Investigator-written rationale — INVESTIGATOR ENTERED */
  rationale: string;
  /** ISO timestamp when decision was recorded */
  timestamp: string;
  /** Evidence snapshot captured at decision time */
  evidenceSnapshot: EvidenceSnapshot;
}

/** Immutable audit event recording a case lifecycle change. */
export interface AuditEvent {
  /** Unique event identifier */
  eventId: string;
  /** Type of lifecycle event */
  eventType: AuditEventType;
  /** ISO timestamp of the event */
  timestamp: string;
  /** Human-readable description of the event */
  detail: string;
  /** Source surface where the event originated */
  source: 'FORENSIC_WORKSPACE_DECISION' | 'CASES_REGISTRY' | 'CASE_DOSSIER' | 'SYSTEM';
}

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

  /** ID of the source Forensic Workspace community investigation */
  sourceCommunityId?: string;

  /** Formally recorded investigator decision — populated from Decision view */
  decision?: FormalDecision;

  /** Whether SAR was exported from the Decision view */
  sarExported: boolean;

  /** ISO timestamp of SAR export — null if not exported */
  sarExportTimestamp?: string;

  /** Ordered list of immutable lifecycle audit events */
  auditEvents: AuditEvent[];

  /** Deterministic dossier readiness: READY if all required fields are present */
  dossierStatus: DossierStatus;
}

