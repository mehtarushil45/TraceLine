/**
 * Investigation Playbook Manager
 *
 * Provides a lightweight state and workflow coordinator for guided
 * investigations. Preserves investigation context across pages:
 *   Community → Evidence → Graph → Account → Transaction → Case → Dossier
 *
 * Uses LocalStorage + CustomEvents for instant reactivity across components
 * without heavyweight external state libraries.
 */

export interface PlaybookContext {
  isActive: boolean;
  currentStep: number; // 1 to 7
  communityId?: string | number | null;
  accountId?: string | null;
  transactionId?: string | null;
  evidenceId?: string | null;
  caseId?: string | null;
  completedSteps: number[];
  startedAt?: string;
}

const STORAGE_KEY = 'traceline_investigation_playbook';
const EVENT_NAME = 'traceline_playbook_updated';

const DEFAULT_CONTEXT: PlaybookContext = {
  isActive: false,
  currentStep: 1,
  communityId: null,
  accountId: null,
  transactionId: null,
  evidenceId: null,
  caseId: null,
  completedSteps: [],
};

function notifySubscribers() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

export function getPlaybookContext(): PlaybookContext {
  if (typeof window === 'undefined') return { ...DEFAULT_CONTEXT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTEXT };
    return JSON.parse(raw) as PlaybookContext;
  } catch (err) {
    console.error('Failed to load playbook context from localStorage:', err);
    return { ...DEFAULT_CONTEXT };
  }
}

export function savePlaybookContext(ctx: PlaybookContext) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
    notifySubscribers();
  } catch (err) {
    console.error('Failed to save playbook context to localStorage:', err);
  }
}

export function startPlaybook(initial?: Partial<PlaybookContext>): PlaybookContext {
  const newCtx: PlaybookContext = {
    ...DEFAULT_CONTEXT,
    isActive: true,
    currentStep: initial?.currentStep ?? 1,
    communityId: initial?.communityId ?? null,
    accountId: initial?.accountId ?? null,
    transactionId: initial?.transactionId ?? null,
    evidenceId: initial?.evidenceId ?? null,
    caseId: initial?.caseId ?? null,
    completedSteps: [1],
    startedAt: new Date().toISOString(),
    ...initial,
  };
  savePlaybookContext(newCtx);
  return newCtx;
}

export function updatePlaybookStep(step: number, updates?: Partial<PlaybookContext>): PlaybookContext {
  const current = getPlaybookContext();
  const completed = new Set(current.completedSteps);
  completed.add(step);

  const updated: PlaybookContext = {
    ...current,
    ...updates,
    currentStep: step,
    completedSteps: Array.from(completed),
  };
  savePlaybookContext(updated);
  return updated;
}

export function updatePlaybookContext(updates: Partial<PlaybookContext>): PlaybookContext {
  const current = getPlaybookContext();
  const updated: PlaybookContext = {
    ...current,
    ...updates,
  };
  savePlaybookContext(updated);
  return updated;
}

export function exitPlaybook() {
  const current = getPlaybookContext();
  savePlaybookContext({
    ...current,
    isActive: false,
  });
}

export function usePlaybookWatcher(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT_NAME, callback);
  return () => {
    window.removeEventListener(EVENT_NAME, callback);
  };
}

export interface PlaybookStepDefinition {
  step: number;
  label: string;
  shortLabel: string;
  description: string;
  targetPath: (ctx: PlaybookContext) => string;
  canNavigate: (ctx: PlaybookContext) => boolean;
}

export const PLAYBOOK_STEPS: PlaybookStepDefinition[] = [
  {
    step: 1,
    label: 'Community Triage',
    shortLabel: 'Triage',
    description: 'Review highest-priority cluster prioritization and ML observable feature breakdown.',
    targetPath: (ctx) => (ctx.communityId ? `/communities/${ctx.communityId}` : '/communities'),
    canNavigate: (ctx) => Boolean(ctx.communityId),
  },
  {
    step: 2,
    label: 'Evidence Intelligence',
    shortLabel: 'Evidence',
    description: 'Analyze deterministic observable rule indicators and score contributions.',
    targetPath: (ctx) => (ctx.communityId ? `/communities/${ctx.communityId}` : '/communities'),
    canNavigate: (ctx) => Boolean(ctx.communityId),
  },
  {
    step: 3,
    label: 'Network Topology Graph',
    shortLabel: 'Graph',
    description: 'Explore multi-layer account relationships and focused infrastructure clusters.',
    targetPath: (ctx) => (ctx.communityId ? `/communities/${ctx.communityId}` : '/communities'),
    canNavigate: (ctx) => Boolean(ctx.communityId),
  },
  {
    step: 4,
    label: 'Account Forensic Profile',
    shortLabel: 'Account',
    description: 'Inspect a key hub or connected account and its account-level observable evidence.',
    targetPath: (ctx) => (ctx.accountId ? `/accounts/${ctx.accountId}` : '/accounts'),
    canNavigate: (ctx) => Boolean(ctx.accountId),
  },
  {
    step: 5,
    label: 'Transaction Audit',
    shortLabel: 'Transaction',
    description: 'Audit a concrete transaction operation, merchant context, and digital footprint.',
    targetPath: (ctx) => (ctx.transactionId ? `/transactions/${ctx.transactionId}` : '/transactions'),
    canNavigate: (ctx) => Boolean(ctx.transactionId),
  },
  {
    step: 6,
    label: 'Investigation Case',
    shortLabel: 'Case',
    description: 'Aggregate entities and synthesize findings into an active investigation case.',
    targetPath: (ctx) => (ctx.caseId ? `/investigations/${ctx.caseId}` : '/investigations'),
    canNavigate: (ctx) => Boolean(ctx.caseId),
  },
  {
    step: 7,
    label: 'Forensic Case Dossier',
    shortLabel: 'Dossier',
    description: 'Review, attest, and export the official TraceLine forensic investigation report.',
    targetPath: (ctx) => (ctx.caseId ? `/investigations/${ctx.caseId}` : '/investigations'),
    canNavigate: (ctx) => Boolean(ctx.caseId),
  },
];
