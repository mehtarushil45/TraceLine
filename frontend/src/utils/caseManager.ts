import type {
  AuditEvent,
  AuditEventType,
  CasePriority,
  DossierStatus,
  EvidenceSnapshot,
  FormalDecision,
  InvestigationCase,
  InvestigationTarget,
  TargetType,
} from '../types/cases';

const STORAGE_KEY = 'traceline_investigation_cases';
const EVENT_NAME = 'traceline_cases_updated';

function notifySubscribers() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

function makeAuditEventId(): string {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function makeAuditEvent(
  eventType: AuditEventType,
  detail: string,
  source: AuditEvent['source']
): AuditEvent {
  return {
    eventId: makeAuditEventId(),
    eventType,
    timestamp: new Date().toISOString(),
    detail,
    source,
  };
}

/** Compute deterministic dossier readiness from the case record. */
export function computeDossierReadiness(c: InvestigationCase): DossierStatus {
  const hasDecision = !!c.decision;
  const hasRationale = !!(c.decision?.rationale?.trim());
  const hasEvidence = !!c.decision?.evidenceSnapshot;
  const hasLinkedEntities = c.targets.some(
    (t) => t.type === 'ACCOUNT' || t.type === 'TRANSACTION' || t.type === 'COMMUNITY'
  );
  const hasSourceInvestigation = !!c.sourceCommunityId;
  if (hasDecision && hasRationale && hasEvidence && hasLinkedEntities && hasSourceInvestigation) {
    return 'READY';
  }
  return 'INCOMPLETE';
}

/** Migrate a stored case object to the current model shape. */
function migrateCase(raw: Partial<InvestigationCase> & { id: string; title: string }): InvestigationCase {
  const migrated: InvestigationCase = {
    id: raw.id,
    title: raw.title,
    status: raw.status ?? 'OPEN',
    priority: raw.priority ?? 'HIGH',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    notes: raw.notes ?? '',
    targets: raw.targets ?? [],
    sourceCommunityId: raw.sourceCommunityId,
    decision: raw.decision,
    sarExported: raw.sarExported ?? false,
    sarExportTimestamp: raw.sarExportTimestamp,
    auditEvents: raw.auditEvents ?? [],
    dossierStatus: raw.dossierStatus ?? 'INCOMPLETE',
  };
  return migrated;
}

export function getCases(): InvestigationCase[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<InvestigationCase> & { id: string; title: string }>;
    return parsed.map(migrateCase);
  } catch (err) {
    console.error('Failed to load investigation cases from localStorage:', err);
    return [];
  }
}

function saveCases(cases: InvestigationCase[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
    notifySubscribers();
  } catch (err) {
    console.error('Failed to save investigation cases to localStorage:', err);
  }
}

export function getCase(id: string): InvestigationCase | null {
  const cases = getCases();
  return cases.find((c) => c.id === id) || null;
}

/**
 * Create a FORMAL case — called ONLY from the Forensic Workspace Decision view.
 * This is the authoritative case-creation boundary per TraceLine lifecycle.
 */
export function createFormalCase(
  sourceCommunityId: string,
  title: string,
  priority: CasePriority,
  initialTarget: InvestigationTarget,
  evidenceSnapshot: EvidenceSnapshot
): InvestigationCase {
  const cases = getCases();
  const now = new Date().toISOString();

  const newCase: InvestigationCase = {
    id: `CASE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    title,
    status: 'OPEN',
    priority,
    createdAt: now,
    updatedAt: now,
    notes: '',
    targets: [initialTarget],
    sourceCommunityId,
    decision: undefined,
    sarExported: false,
    auditEvents: [
      makeAuditEvent(
        'CASE_CREATED',
        `Formal dossier created from Forensic Workspace investigation of Community #${sourceCommunityId}.`,
        'FORENSIC_WORKSPACE_DECISION'
      ),
      makeAuditEvent(
        'EVIDENCE_SNAPSHOT_ATTACHED',
        `Evidence snapshot captured: ${evidenceSnapshot.evidenceCount} triggers (${evidenceSnapshot.highCount} HIGH, ${evidenceSnapshot.medCount} MEDIUM, ${evidenceSnapshot.lowCount} LOW). Evidence score: ${evidenceSnapshot.evidenceScore ?? 'N/A'}/100.`,
        'FORENSIC_WORKSPACE_DECISION'
      ),
    ],
    dossierStatus: 'INCOMPLETE',
  };

  cases.unshift(newCase);
  saveCases(cases);
  return newCase;
}

/**
 * Record a formal investigator decision on a case.
 * Called only from the Forensic Workspace Decision view.
 */
export function recordDecision(
  caseId: string,
  decision: FormalDecision
): InvestigationCase | null {
  const cases = getCases();
  const idx = cases.findIndex((c) => c.id === caseId);
  if (idx === -1) return null;

  const auditEvent = makeAuditEvent(
    'DECISION_RECORDED',
    `Decision recorded: ${decision.disposition}. Rationale: "${decision.rationale.slice(0, 120)}${decision.rationale.length > 120 ? '...' : ''}"`,
    'FORENSIC_WORKSPACE_DECISION'
  );

  const updated: InvestigationCase = {
    ...cases[idx],
    decision,
    status: 'REVIEW',
    updatedAt: new Date().toISOString(),
    auditEvents: [...(cases[idx].auditEvents ?? []), auditEvent],
  };
  updated.dossierStatus = computeDossierReadiness(updated);

  cases[idx] = updated;
  saveCases(cases);
  return updated;
}

/**
 * Record that a SAR was exported for this case from the Decision view.
 */
export function recordSarExport(caseId: string): InvestigationCase | null {
  const cases = getCases();
  const idx = cases.findIndex((c) => c.id === caseId);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const auditEvent = makeAuditEvent(
    'SAR_EXPORTED',
    `SAR export package generated at ${new Date(now).toLocaleString()}. Exported from Forensic Workspace Decision view.`,
    'FORENSIC_WORKSPACE_DECISION'
  );

  const updated: InvestigationCase = {
    ...cases[idx],
    sarExported: true,
    sarExportTimestamp: now,
    updatedAt: now,
    auditEvents: [...(cases[idx].auditEvents ?? []), auditEvent],
  };
  updated.dossierStatus = computeDossierReadiness(updated);

  cases[idx] = updated;
  saveCases(cases);
  return updated;
}

export function updateCase(id: string, updates: Partial<InvestigationCase>): InvestigationCase | null {
  const cases = getCases();
  const idx = cases.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const auditEvents = [...(cases[idx].auditEvents ?? [])];
  if (updates.notes !== undefined && updates.notes !== cases[idx].notes) {
    auditEvents.push(makeAuditEvent('NOTES_UPDATED', 'Investigator notes updated.', 'CASE_DOSSIER'));
  }
  if (updates.status !== undefined && updates.status !== cases[idx].status) {
    auditEvents.push(makeAuditEvent('STATUS_CHANGED', `Case status changed to ${updates.status}.`, 'CASE_DOSSIER'));
  }

  const updated: InvestigationCase = {
    ...cases[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
    auditEvents,
  };
  updated.dossierStatus = computeDossierReadiness(updated);

  cases[idx] = updated;
  saveCases(cases);
  return updated;
}

export function deleteCase(id: string): boolean {
  const cases = getCases();
  const filtered = cases.filter((c) => c.id !== id);
  if (filtered.length === cases.length) return false;
  saveCases(filtered);
  return true;
}

export function addTargetToCase(caseId: string, target: InvestigationTarget): boolean {
  const cases = getCases();
  const targetCase = cases.find((c) => c.id === caseId);
  if (!targetCase) return false;

  const exists = targetCase.targets.some(
    (t) => t.type === target.type && t.id.toLowerCase() === target.id.toLowerCase()
  );
  if (exists) return false;

  const auditEvent = makeAuditEvent(
    'TARGET_ADDED',
    `${target.type} entity ${target.id} added to dossier.`,
    'CASE_DOSSIER'
  );

  targetCase.targets.push(target);
  targetCase.auditEvents = [...(targetCase.auditEvents ?? []), auditEvent];
  targetCase.updatedAt = new Date().toISOString();
  targetCase.dossierStatus = computeDossierReadiness(targetCase);
  saveCases(cases);
  return true;
}

export function removeTargetFromCase(caseId: string, targetType: TargetType, targetId: string): boolean {
  const cases = getCases();
  const targetCase = cases.find((c) => c.id === caseId);
  if (!targetCase) return false;

  const originalLen = targetCase.targets.length;
  targetCase.targets = targetCase.targets.filter(
    (t) => !(t.type === targetType && t.id.toLowerCase() === targetId.toLowerCase())
  );

  if (targetCase.targets.length === originalLen) return false;

  targetCase.updatedAt = new Date().toISOString();
  targetCase.dossierStatus = computeDossierReadiness(targetCase);
  saveCases(cases);
  return true;
}

export function isTargetInAnyCase(
  targetType: TargetType,
  targetId: string
): { inCase: boolean; caseId?: string; caseTitle?: string } {
  const cases = getCases();
  for (const c of cases) {
    if (c.status !== 'CLOSED') {
      const match = c.targets.find(
        (t) => t.type === targetType && t.id.toLowerCase() === targetId.toLowerCase()
      );
      if (match) {
        return { inCase: true, caseId: c.id, caseTitle: c.title };
      }
    }
  }
  return { inCase: false };
}

/** Find an existing formal case for a given community, if one exists. */
export function findCaseForCommunity(communityId: string): InvestigationCase | null {
  const cases = getCases();
  return cases.find((c) => c.sourceCommunityId === communityId) ?? null;
}

/**
 * @deprecated Use createFormalCase() from the Decision view instead.
 * Kept for backward compatibility with legacy case records in localStorage.
 */
export function getOrCreateActiveCase(defaultTarget?: InvestigationTarget): InvestigationCase {
  const cases = getCases();
  const openCase = cases.find((c) => c.status === 'OPEN' || c.status === 'REVIEW');
  if (openCase) return openCase;

  const now = new Date().toISOString();
  const newCase: InvestigationCase = {
    id: `CASE-${Date.now().toString(36).toUpperCase()}-LEGACY`,
    title: defaultTarget ? `Investigation: ${defaultTarget.label}` : 'Network Risk Investigation',
    status: 'OPEN',
    priority: 'HIGH',
    createdAt: now,
    updatedAt: now,
    notes: '',
    targets: defaultTarget ? [defaultTarget] : [],
    sarExported: false,
    auditEvents: [makeAuditEvent('CASE_CREATED', 'Legacy case created.', 'SYSTEM')],
    dossierStatus: 'INCOMPLETE',
  };
  cases.unshift(newCase);
  saveCases(cases);
  return newCase;
}

export function subscribeToCaseUpdates(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT_NAME, callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
  };
}
