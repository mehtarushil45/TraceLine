import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  FileText,
  Layers,
  Network,
  Plus,
  Save,
  ScanSearch,
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { CasePriority, CaseStatus, InvestigationCase, InvestigationTarget } from '../types/cases';
import {
  deleteCase,
  getCase,
  removeTargetFromCase,
  updateCase,
  addTargetToCase,
  subscribeToCaseUpdates,
} from '../utils/caseManager';
import {
  getAccount,
  getAccountEvidence,
  getCommunity,
  getCommunityEvidence,
  getTransaction,
} from '../api';
import type {
  AccountDetailResponse,
  CommunityDetailResponse,
  EvidenceItem,
  EvidenceSeverity,
  TransactionDetailResponse,
} from '../types/api';
import { RiskBadge } from '../components/common/RiskBadge';
import { ErrorState } from '../components/common/ErrorState';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { CaseDossierModal } from '../components/layout/CaseDossierModal';

export const CaseDetailPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [investigationCase, setInvestigationCase] = useState<InvestigationCase | null>(null);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<string | null>(null);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [addTargetInput, setAddTargetInput] = useState('');
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);

  // Enriched details fetched from backend
  const [communityDetails, setCommunityDetails] = useState<Map<string, CommunityDetailResponse>>(new Map());
  const [accountDetails, setAccountDetails] = useState<Map<string, AccountDetailResponse>>(new Map());
  const [transactionDetails, setTransactionDetails] = useState<Map<string, TransactionDetailResponse>>(new Map());
  const [evidenceMap, setEvidenceMap] = useState<Map<string, EvidenceItem[]>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Evidence filter in case dossier
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceSeverity | 'ALL'>('ALL');
  const [selectedCommunityForGraph, setSelectedCommunityForGraph] = useState<string>('');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCase = () => {
    if (!caseId) return;
    const c = getCase(caseId);
    if (c) {
      setInvestigationCase(c);
      setNotes(c.notes || '');
      setTitle(c.title);
      if (!lastSavedTimestamp) {
        setLastSavedTimestamp(new Date(c.updatedAt).toLocaleTimeString());
      }
    }
  };

  useEffect(() => {
    loadCase();
    const unsub = subscribeToCaseUpdates(loadCase);
    return unsub;
  }, [caseId]);

  // Fetch enriched details for all targets
  useEffect(() => {
    if (!investigationCase || investigationCase.targets.length === 0) return;

    let isMounted = true;
    setLoadingDetails(true);

    const fetchAllTargets = async () => {
      const commMap = new Map<string, CommunityDetailResponse>();
      const accMap = new Map<string, AccountDetailResponse>();
      const txMap = new Map<string, TransactionDetailResponse>();
      const evMap = new Map<string, EvidenceItem[]>();

      const promises = investigationCase.targets.map(async (target) => {
        try {
          if (target.type === 'COMMUNITY') {
            const [detail, ev] = await Promise.allSettled([
              getCommunity(target.id),
              getCommunityEvidence(target.id),
            ]);
            if (detail.status === 'fulfilled') commMap.set(target.id, detail.value);
            if (ev.status === 'fulfilled') evMap.set(`COMMUNITY_${target.id}`, ev.value.items);
          } else if (target.type === 'ACCOUNT') {
            const [detail, ev] = await Promise.allSettled([
              getAccount(target.id),
              getAccountEvidence(target.id),
            ]);
            if (detail.status === 'fulfilled') {
              accMap.set(target.id, detail.value);
              // Also store community ID reference if available
              if (detail.value.community_id !== null) {
                if (!selectedCommunityForGraph) {
                  setSelectedCommunityForGraph(String(detail.value.community_id));
                }
              }
            }
            if (ev.status === 'fulfilled') evMap.set(`ACCOUNT_${target.id}`, ev.value.items);
          } else if (target.type === 'TRANSACTION') {
            const detail = await getTransaction(target.id);
            txMap.set(target.id, detail);
          }
        } catch (err) {
          console.warn(`Failed to enrich target ${target.type} ${target.id}:`, err);
        }
      });

      await Promise.all(promises);

      if (isMounted) {
        setCommunityDetails(commMap);
        setAccountDetails(accMap);
        setTransactionDetails(txMap);
        setEvidenceMap(evMap);
        setLoadingDetails(false);

        // Set default community for graph if available
        const firstComm = investigationCase.targets.find((t) => t.type === 'COMMUNITY');
        if (firstComm) {
          setSelectedCommunityForGraph(firstComm.id);
        }
      }
    };

    fetchAllTargets();

    return () => {
      isMounted = false;
    };
  }, [investigationCase?.targets]);

  // Combine and deduplicate evidence across all targets
  const aggregatedEvidence: EvidenceItem[] = useMemo(() => {
    const items: EvidenceItem[] = [];
    const seen = new Set<string>();

    evidenceMap.forEach((evidenceList) => {
      evidenceList.forEach((item) => {
        if (!seen.has(item.evidence_id)) {
          seen.add(item.evidence_id);
          items.push(item);
        }
      });
    });

    // Sort by severity (HIGH -> MEDIUM -> LOW) and score contribution
    return items.sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const diff = order[a.severity] - order[b.severity];
      if (diff !== 0) return diff;
      return b.score_contribution - a.score_contribution;
    });
  }, [evidenceMap]);

  // Autosave notes on change (debounced 400ms)
  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    setIsSavingNotes(true);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (investigationCase) {
        updateCase(investigationCase.id, { notes: newNotes });
        setIsSavingNotes(false);
        setLastSavedTimestamp(new Date().toLocaleTimeString());
      }
    }, 400);
  };

  const handleManualSaveNotes = () => {
    if (!investigationCase) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    updateCase(investigationCase.id, { notes });
    setIsSavingNotes(false);
    setLastSavedTimestamp(new Date().toLocaleTimeString());
  };

  if (!investigationCase) {
    return (
      <ErrorState
        message={`No investigation case found matching ID '${caseId}'. It may have been removed or closed.`}
        onRetry={() => navigate('/investigations')}
      />
    );
  }

  const handleStatusChange = (newStatus: CaseStatus) => {
    updateCase(investigationCase.id, { status: newStatus });
  };

  const handlePriorityChange = (newPriority: CasePriority) => {
    updateCase(investigationCase.id, { priority: newPriority });
  };

  const handleSaveTitle = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      updateCase(investigationCase.id, { title: title.trim() });
      setIsEditingTitle(false);
    }
  };

  const handleRemoveTarget = (target: InvestigationTarget) => {
    removeTargetFromCase(investigationCase.id, target.type, target.id);
  };

  const handleQuickAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = addTargetInput.trim();
    if (!raw) return;

    let target: InvestigationTarget;
    if (raw.startsWith('acc_') || raw.startsWith('ACC_')) {
      target = {
        type: 'ACCOUNT',
        id: raw.toLowerCase(),
        label: `Account ${raw.toLowerCase()}`,
        addedAt: new Date().toISOString(),
      };
    } else if (raw.startsWith('tx_') || raw.startsWith('TX_')) {
      target = {
        type: 'TRANSACTION',
        id: raw.toLowerCase(),
        label: `Transaction ${raw.toLowerCase()}`,
        addedAt: new Date().toISOString(),
      };
    } else if (!isNaN(Number(raw))) {
      target = {
        type: 'COMMUNITY',
        id: raw,
        label: `Community #${raw}`,
        addedAt: new Date().toISOString(),
      };
    } else {
      target = {
        type: 'ACCOUNT',
        id: raw.toLowerCase(),
        label: `Account ${raw.toLowerCase()}`,
        addedAt: new Date().toISOString(),
      };
    }

    addTargetToCase(investigationCase.id, target);
    setAddTargetInput('');
  };

  const handleDeleteThisCase = () => {
    if (window.confirm('Delete this investigation case dossier permanently?')) {
      deleteCase(investigationCase.id);
      navigate('/investigations');
    }
  };

  const handleOpenInvestigationGraph = () => {
    let targetCommId = selectedCommunityForGraph;

    if (!targetCommId) {
      const comm = investigationCase.targets.find((t) => t.type === 'COMMUNITY');
      if (comm) targetCommId = comm.id;
    }

    if (!targetCommId) {
      // Find an account target with community_id
      for (const t of investigationCase.targets) {
        if (t.type === 'ACCOUNT') {
          const acc = accountDetails.get(t.id);
          if (acc && acc.community_id !== null) {
            targetCommId = String(acc.community_id);
            break;
          }
        }
      }
    }

    if (targetCommId) {
      const topEvidence = aggregatedEvidence[0] || null;
      navigate(`/communities/${targetCommId}`, {
        state: { tab: 'graph', evidenceFocus: topEvidence },
      });
    } else {
      alert('No community cluster or assigned accounts attached to open a graph for.');
    }
  };

  const communityTargets = investigationCase.targets.filter((t) => t.type === 'COMMUNITY');
  const accountTargets = investigationCase.targets.filter((t) => t.type === 'ACCOUNT');
  const transactionTargets = investigationCase.targets.filter((t) => t.type === 'TRANSACTION');

  // Compute highest risk score observed among attached targets
  let maxObservedRiskScore: number | null = null;
  communityTargets.forEach((t) => {
    const detail = communityDetails.get(t.id);
    if (detail && (maxObservedRiskScore === null || detail.risk_score > maxObservedRiskScore)) {
      maxObservedRiskScore = detail.risk_score;
    }
  });
  accountTargets.forEach((t) => {
    const detail = accountDetails.get(t.id);
    if (detail && detail.community_risk_score !== null) {
      if (maxObservedRiskScore === null || detail.community_risk_score > maxObservedRiskScore) {
        maxObservedRiskScore = detail.community_risk_score;
      }
    }
  });

  // Calculate high/medium/low evidence counts
  const highEvidenceCount = aggregatedEvidence.filter((e) => e.severity === 'HIGH').length;
  const medEvidenceCount = aggregatedEvidence.filter((e) => e.severity === 'MEDIUM').length;
  const lowEvidenceCount = aggregatedEvidence.filter((e) => e.severity === 'LOW').length;

  // Filtered evidence for display
  const filteredEvidence = aggregatedEvidence.filter(
    (item) => evidenceFilter === 'ALL' || item.severity === evidenceFilter
  );

  // Available communities for graph dropdown
  const availableCommunities: { id: string; label: string }[] = [];
  communityTargets.forEach((t) => {
    availableCommunities.push({ id: t.id, label: `Community #${t.id}` });
  });
  accountDetails.forEach((acc) => {
    if (acc.community_id !== null) {
      const cid = String(acc.community_id);
      if (!availableCommunities.some((c) => c.id === cid)) {
        availableCommunities.push({ id: cid, label: `Community #${cid} (Account ${acc.account_id})` });
      }
    }
  });

  // Build Chronological Timeline Events
  interface TimelineItem {
    id: string;
    timestamp: string;
    title: string;
    subtitle: string;
    type: 'CASE' | 'COMMUNITY' | 'ACCOUNT' | 'TRANSACTION' | 'EVIDENCE';
    link?: string;
  }

  const timelineItems: TimelineItem[] = [];

  // Case creation
  timelineItems.push({
    id: 'case_created',
    timestamp: investigationCase.createdAt,
    title: 'Investigation Case Created',
    subtitle: `Initial priority: ${investigationCase.priority} · Status: ${investigationCase.status}`,
    type: 'CASE',
  });

  // Targets added
  investigationCase.targets.forEach((t) => {
    timelineItems.push({
      id: `target_${t.type}_${t.id}`,
      timestamp: t.addedAt,
      title: `${t.type === 'COMMUNITY' ? 'Community Cluster' : t.type === 'ACCOUNT' ? 'Account Target' : 'Transaction Target'} Attached: ${t.label}`,
      subtitle: `Target added to dossier for evidence aggregation`,
      type: t.type,
      link: t.type === 'COMMUNITY' ? `/communities/${t.id}` : t.type === 'ACCOUNT' ? `/accounts/${t.id}` : `/transactions/${t.id}`,
    });
  });

  // Transactions executed
  transactionDetails.forEach((tx) => {
    timelineItems.push({
      id: `tx_${tx.transaction_id}`,
      timestamp: tx.timestamp,
      title: `Transaction Operation: $${tx.amount.toLocaleString()} (${tx.transaction_status})`,
      subtitle: `${tx.src_account_id} → ${tx.dst_account_id}${tx.merchant_name ? ` · Merchant: ${tx.merchant_name}` : ''}`,
      type: 'TRANSACTION',
      link: `/transactions/${tx.transaction_id}`,
    });
  });

  // Sort timeline chronologically (newest first)
  timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. Breadcrumb & Action Toolbar                                     */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
          <button
            onClick={() => navigate('/investigations')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <ArrowLeft size={14} />
            Investigations
          </button>
          <span>/</span>
          <span className="font-mono text-slate-200">{investigationCase.id}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Open Investigation Graph Button */}
          {availableCommunities.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {availableCommunities.length > 1 && (
                <select
                  value={selectedCommunityForGraph}
                  onChange={(e) => setSelectedCommunityForGraph(e.target.value)}
                  style={{
                    backgroundColor: '#070d1e',
                    border: '1px solid var(--border-light)',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    padding: '6px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {availableCommunities.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              )}

              <button
                onClick={handleOpenInvestigationGraph}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  backgroundColor: 'rgba(0, 240, 255, 0.12)',
                  border: '1px solid rgba(0, 240, 255, 0.35)',
                  borderRadius: '6px',
                  color: 'var(--accent-cyan)',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                title="Launch topology graph with case accounts focused"
              >
                <Network size={14} />
                <span>Open Investigation Graph</span>
              </button>
            </div>
          )}

          {/* Export Dossier Button */}
          <button
            onClick={() => setIsDossierModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              backgroundColor: '#162447',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <FileText size={13} style={{ color: 'var(--accent-cyan)' }} />
            <span>Export Case Dossier</span>
          </button>

          {/* Delete Case */}
          <button
            onClick={handleDeleteThisCase}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              backgroundColor: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              borderRadius: '6px',
              color: '#fca5a5',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Case Workspace Header HUD                                       */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="dash-card"
        style={{
          padding: '24px 28px',
          backgroundColor: '#070d1e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1, minWidth: '320px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: 'var(--accent-cyan)',
              boxShadow: '0 0 16px rgba(0, 240, 255, 0.2)',
            }}
          >
            <Briefcase size={26} />
          </div>

          <div style={{ flex: 1 }}>
            {isEditingTitle ? (
              <form onSubmit={handleSaveTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '540px' }}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    backgroundColor: '#030712',
                    border: '1px solid var(--accent-cyan)',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                  autoFocus
                />
                <button
                  type="submit"
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-light)',
                    borderRadius: '4px',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
                  {investigationCase.title}
                </h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontWeight: 600,
                  }}
                >
                  Edit Title
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span className="font-mono text-cyan-400">{investigationCase.id}</span>
              <span>·</span>
              <span>Created {new Date(investigationCase.createdAt).toLocaleDateString()}</span>
              <span>·</span>
              <span>Updated {new Date(investigationCase.updatedAt).toLocaleTimeString()}</span>
              <span>·</span>
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>
                {investigationCase.targets.length} target{investigationCase.targets.length !== 1 ? 's' : ''} attached
              </span>
            </div>
          </div>
        </div>

        {/* Status & Priority Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
              Status Workflow
            </span>
            <select
              value={investigationCase.status}
              onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
              style={{
                backgroundColor: '#030712',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: investigationCase.status === 'OPEN' ? '#34d399' : investigationCase.status === 'REVIEW' ? '#fbbf24' : '#94a3b8',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="OPEN">● OPEN</option>
              <option value="REVIEW">◐ UNDER REVIEW</option>
              <option value="CLOSED">○ CLOSED</option>
            </select>
          </div>

          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
              Priority Level
            </span>
            <select
              value={investigationCase.priority}
              onChange={(e) => handlePriorityChange(e.target.value as CasePriority)}
              style={{
                backgroundColor: '#030712',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: investigationCase.priority === 'HIGH' ? '#f87171' : investigationCase.priority === 'MEDIUM' ? '#fbbf24' : '#60a5fa',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="HIGH">HIGH PRIORITY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Executive Threat & Observable Evidence Scope Summary            */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        {/* Attached Targets Breakdown */}
        <div className="dash-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Attached Scope
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="font-mono font-bold text-2xl text-slate-100">{investigationCase.targets.length}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>targets</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--accent-cyan)' }}>
            {communityTargets.length} communities · {accountTargets.length} accounts · {transactionTargets.length} txs
          </span>
        </div>

        {/* Max Observed Risk Score */}
        <div className="dash-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Max Cluster ML Risk
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="font-mono font-bold text-2xl" style={{ color: maxObservedRiskScore && maxObservedRiskScore >= 60 ? '#f87171' : maxObservedRiskScore && maxObservedRiskScore >= 35 ? '#fbbf24' : '#34d399' }}>
              {maxObservedRiskScore !== null ? `${maxObservedRiskScore}/100` : '—'}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Model triage priority for attached clusters
          </span>
        </div>

        {/* Aggregated Evidence Indicators */}
        <div className="dash-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Observable Evidence Items
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="font-mono font-bold text-2xl text-amber-400">{aggregatedEvidence.length}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>signals</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            <strong style={{ color: '#f87171' }}>{highEvidenceCount} High</strong> · <strong style={{ color: '#fbbf24' }}>{medEvidenceCount} Med</strong> · <strong style={{ color: '#60a5fa' }}>{lowEvidenceCount} Low</strong>
          </span>
        </div>

        {/* Case Status Summary */}
        <div className="dash-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Dossier Workflow Status
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: investigationCase.status === 'OPEN' ? '#34d399' : investigationCase.status === 'REVIEW' ? '#fbbf24' : '#94a3b8' }}>
              {investigationCase.status === 'OPEN' ? 'Active Forensic Triage' : investigationCase.status === 'REVIEW' ? 'Compliance Review In Progress' : 'Case Closed & Archived'}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {investigationCase.priority} Priority Queue
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Observable Evidence Summary (Aggregated across targets)         */}
      {/* ------------------------------------------------------------------ */}
      <div className="dash-card" style={{ padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-cyan)' }}>
                Observable Evidence Intelligence Summary
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', fontStyle: 'italic' }}>
                Aggregated rule-based signals · Zero label leakage
              </span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Deterministic evidence extracted across {investigationCase.targets.length} attached targets.
            </span>
          </div>

          {/* Severity Filter Pills */}
          {aggregatedEvidence.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
                const count = sev === 'ALL' ? aggregatedEvidence.length : sev === 'HIGH' ? highEvidenceCount : sev === 'MEDIUM' ? medEvidenceCount : lowEvidenceCount;
                const active = evidenceFilter === sev;
                const color = sev === 'HIGH' ? '#f87171' : sev === 'MEDIUM' ? '#fbbf24' : sev === 'LOW' ? '#60a5fa' : 'rgba(255,255,255,0.6)';

                return (
                  <button
                    key={sev}
                    onClick={() => setEvidenceFilter(sev)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 16,
                      border: active ? `1px solid ${color}55` : '1px solid rgba(255,255,255,0.08)',
                      background: active ? `${color}12` : 'rgba(255,255,255,0.03)',
                      color: active ? color : 'var(--text-dim)',
                      fontSize: 11,
                      fontWeight: active ? 700 : 400,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {sev}
                    <span style={{ fontSize: 10, padding: '0 4px', borderRadius: 8, background: active ? `${color}25` : 'rgba(255,255,255,0.06)' }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Evidence List */}
        {loadingDetails ? (
          <LoadingSkeleton type="table" count={3} />
        ) : aggregatedEvidence.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '6px' }}>
            <Shield size={28} style={{ margin: '0 auto 8px', opacity: 0.25, color: 'var(--accent-cyan)' }} />
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              No automated evidence signals detected on current targets. Attach communities or accounts to aggregate relationship signals.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredEvidence.slice(0, 10).map((item) => {
              const sev = item.severity;
              const isHigh = sev === 'HIGH';
              const isMed = sev === 'MEDIUM';
              const color = isHigh ? '#f87171' : isMed ? '#fbbf24' : '#60a5fa';

              return (
                <div
                  key={item.evidence_id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#070d1e',
                    border: `1px solid ${isHigh ? 'rgba(239,68,68,0.25)' : isMed ? 'rgba(245,158,11,0.22)' : 'var(--border)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 7px',
                          borderRadius: 4,
                          fontWeight: 800,
                          backgroundColor: `${color}15`,
                          color,
                          border: `1px solid ${color}35`,
                        }}
                      >
                        {item.severity}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                        {item.title}
                      </span>
                    </div>

                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      {item.type}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    {item.description}
                  </p>

                  {/* Supporting entities and metrics */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Entities:</span>
                      {item.supporting_entities.slice(0, 6).map((entity) => (
                        <span
                          key={entity}
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: 3,
                            backgroundColor: `${color}10`,
                            border: `1px solid ${color}20`,
                            color,
                            fontFamily: 'monospace',
                          }}
                        >
                          {entity}
                        </span>
                      ))}
                      {item.supporting_entities.length > 6 && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                          +{item.supporting_entities.length - 6} more
                        </span>
                      )}
                    </div>

                    {/* Explore in graph action */}
                    {availableCommunities.length > 0 && (
                      <button
                        onClick={handleOpenInvestigationGraph}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: 'rgba(0,240,255,0.08)',
                          border: '1px solid rgba(0,240,255,0.2)',
                          color: 'var(--accent-cyan)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <ScanSearch size={11} />
                        Explore in Graph
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredEvidence.length > 10 && (
              <span style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-dim)', paddingTop: 4 }}>
                Showing top 10 of {filteredEvidence.length} observable signals. Full list included in Dossier Export.
              </span>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Attached Targets & Quick-Attach                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="dash-card" style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-cyan)', margin: 0 }}>
              Attached Target Inventory ({investigationCase.targets.length})
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Tracked Communities, Accounts, and Transactions linked to this case.
            </span>
          </div>

          {/* Quick Add Bar */}
          <form onSubmit={handleQuickAddTarget} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              value={addTargetInput}
              onChange={(e) => setAddTargetInput(e.target.value)}
              placeholder="Attach target ID (e.g. 3, acc_..., tx_...)..."
              style={{
                width: '280px',
                padding: '6px 12px',
                backgroundColor: '#030712',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Plus size={13} />
              Attach
            </button>
          </form>
        </div>

        {investigationCase.targets.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '6px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              No targets attached yet. Attach entities via the quick input above or browse Communities/Accounts.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Communities */}
            {communityTargets.length > 0 && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent-cyan)', display: 'block', marginBottom: '8px' }}>
                  Communities ({communityTargets.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                  {communityTargets.map((t) => {
                    const detail = communityDetails.get(t.id);
                    return (
                      <div
                        key={t.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          backgroundColor: '#070d1e',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ padding: 6, borderRadius: 4, background: 'rgba(0,240,255,0.1)', color: 'var(--accent-cyan)' }}>
                            <Layers size={16} />
                          </div>
                          <div>
                            <Link
                              to={`/communities/${t.id}`}
                              style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', textDecoration: 'none' }}
                            >
                              {t.label}
                            </Link>
                            {detail && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {detail.member_count} accounts · ${detail.transaction_statistics.total_transaction_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} vol
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {detail && <RiskBadge level={detail.risk_level} size="sm" />}
                          <Link
                            to={`/communities/${t.id}`}
                            style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', padding: 4 }}
                            title="Open Community Detail"
                          >
                            <ExternalLink size={14} />
                          </Link>
                          <button
                            onClick={() => handleRemoveTarget(t)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
                            title="Remove from case"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Accounts */}
            {accountTargets.length > 0 && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#38bdf8', display: 'block', marginBottom: '8px' }}>
                  Accounts ({accountTargets.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                  {accountTargets.map((t) => {
                    const detail = accountDetails.get(t.id);
                    return (
                      <div
                        key={t.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          backgroundColor: '#070d1e',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ padding: 6, borderRadius: 4, background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>
                            <User size={16} />
                          </div>
                          <div>
                            <Link
                              to={`/accounts/${t.id}`}
                              className="font-mono"
                              style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', textDecoration: 'none' }}
                            >
                              {t.label}
                            </Link>
                            {detail && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Bal: ${detail.balance.toLocaleString()} · {detail.connected_account_count} connections
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {detail?.community_risk_level && <RiskBadge level={detail.community_risk_level} size="sm" />}
                          <Link
                            to={`/accounts/${t.id}`}
                            style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', padding: 4 }}
                            title="Open Account Profile"
                          >
                            <ExternalLink size={14} />
                          </Link>
                          <button
                            onClick={() => handleRemoveTarget(t)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
                            title="Remove from case"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Transactions */}
            {transactionTargets.length > 0 && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#fbbf24', display: 'block', marginBottom: '8px' }}>
                  Transactions ({transactionTargets.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                  {transactionTargets.map((t) => {
                    const detail = transactionDetails.get(t.id);
                    return (
                      <div
                        key={t.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          backgroundColor: '#070d1e',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ padding: 6, borderRadius: 4, background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                            <Activity size={16} />
                          </div>
                          <div>
                            <Link
                              to={`/transactions/${t.id}`}
                              className="font-mono"
                              style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', textDecoration: 'none' }}
                            >
                              {t.label}
                            </Link>
                            {detail && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                ${detail.amount.toLocaleString()} · {detail.src_account_id} → {detail.dst_account_id}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {detail && (
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: 3,
                                fontWeight: 700,
                                backgroundColor: detail.transaction_status === 'COMPLETED' ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
                                color: detail.transaction_status === 'COMPLETED' ? '#34d399' : '#f87171',
                              }}
                            >
                              {detail.transaction_status}
                            </span>
                          )}
                          <Link
                            to={`/transactions/${t.id}`}
                            style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', padding: 4 }}
                            title="Open Transaction Detail"
                          >
                            <ExternalLink size={14} />
                          </Link>
                          <button
                            onClick={() => handleRemoveTarget(t)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
                            title="Remove from case"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Chronological Investigation Timeline                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="dash-card" style={{ padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-cyan)' }}>
            Investigation Activity Timeline
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', fontStyle: 'italic' }}>
            Chronological forensic events ({timelineItems.length})
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative', paddingLeft: 12 }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', top: 12, bottom: 12, left: 23, width: 2, backgroundColor: 'rgba(56,189,248,0.15)' }} />

          {timelineItems.map((item, idx) => {
            const dotColor = item.type === 'CASE' ? '#00F0FF' : item.type === 'COMMUNITY' ? '#38bdf8' : item.type === 'ACCOUNT' ? '#a78bfa' : '#fbbf24';

            return (
              <div
                key={item.id || idx}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  padding: '12px 0',
                  position: 'relative',
                }}
              >
                {/* Dot */}
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: '#030712',
                    border: `2px solid ${dotColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    zIndex: 2,
                    marginTop: 1,
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dotColor }} />
                </div>

                {/* Event Content */}
                <div style={{ flex: 1, backgroundColor: '#070d1e', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.link ? (
                        <Link to={item.link} style={{ fontSize: '12.5px', fontWeight: 700, color: '#f8fafc', textDecoration: 'none' }}>
                          {item.title}
                        </Link>
                      ) : (
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f8fafc' }}>
                          {item.title}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {item.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7. Investigator Notes Workspace with Auto-Save                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="dash-card" style={{ padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-cyan)' }}>
                Investigator Forensic Notes & Dossier Record
              </span>
              {isSavingNotes ? (
                <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>
                  Saving changes...
                </span>
              ) : (
                lastSavedTimestamp && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: '#86efac', fontWeight: 600 }}>
                    <CheckCircle2 size={12} />
                    Auto-saved at {lastSavedTimestamp}
                  </span>
                )
              )}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Record forensic hypotheses, observable evidence synthesis, and compliance actions. Persists in local storage.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleManualSaveNotes}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#0284c7',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Save size={13} />
              Save Now
            </button>
          </div>
        </div>

        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Document investigator hypotheses, multi-account relationship findings, merchant temporal overlap observations, or recommended remediation steps..."
          rows={7}
          style={{
            width: '100%',
            padding: '14px 16px',
            backgroundColor: '#030712',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text-main)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.6,
            outline: 'none',
            resize: 'vertical',
          }}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 8. Modal: Full Printable / Exportable Case Dossier                */}
      {/* ------------------------------------------------------------------ */}
      <CaseDossierModal
        isOpen={isDossierModalOpen}
        onClose={() => setIsDossierModalOpen(false)}
        investigationCase={investigationCase}
        communityDetails={communityDetails}
        accountDetails={accountDetails}
        transactionDetails={transactionDetails}
        aggregatedEvidence={aggregatedEvidence}
      />
    </div>
  );
};
