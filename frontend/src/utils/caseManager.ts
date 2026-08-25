import type { CasePriority, InvestigationCase, InvestigationTarget, TargetType } from '../types/cases';

const STORAGE_KEY = 'traceline_investigation_cases';
const EVENT_NAME = 'traceline_cases_updated';

function notifySubscribers() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

export function getCases(): InvestigationCase[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InvestigationCase[];
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

export function createCase(
  title?: string,
  priority: CasePriority = 'HIGH',
  initialTarget?: InvestigationTarget,
  notes: string = ''
): InvestigationCase {
  const cases = getCases();
  const nextNum = cases.length + 1;
  const now = new Date().toISOString();

  const newCase: InvestigationCase = {
    id: `case_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: title || `Case #${nextNum}: ${initialTarget ? initialTarget.label : 'Network Risk Investigation'}`,
    status: 'OPEN',
    priority,
    createdAt: now,
    updatedAt: now,
    notes,
    targets: initialTarget ? [initialTarget] : [],
  };

  cases.unshift(newCase);
  saveCases(cases);
  return newCase;
}

export function updateCase(id: string, updates: Partial<InvestigationCase>): InvestigationCase | null {
  const cases = getCases();
  const idx = cases.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const updated: InvestigationCase = {
    ...cases[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

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

  // Prevent duplicate targets
  const exists = targetCase.targets.some(
    (t) => t.type === target.type && t.id.toLowerCase() === target.id.toLowerCase()
  );
  if (exists) return false;

  targetCase.targets.push(target);
  targetCase.updatedAt = new Date().toISOString();
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
  saveCases(cases);
  return true;
}

export function isTargetInAnyCase(targetType: TargetType, targetId: string): { inCase: boolean; caseId?: string; caseTitle?: string } {
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

export function getOrCreateActiveCase(defaultTarget?: InvestigationTarget): InvestigationCase {
  const cases = getCases();
  const openCase = cases.find((c) => c.status === 'OPEN' || c.status === 'REVIEW');
  if (openCase) {
    return openCase;
  }
  return createCase(
    defaultTarget ? `Case #1: ${defaultTarget.label} Triage` : 'Case #1: Network Risk Triage',
    'HIGH',
    defaultTarget
  );
}

export function useCaseWatcher(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT_NAME, callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
  };
}
