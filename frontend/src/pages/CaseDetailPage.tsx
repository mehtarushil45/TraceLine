import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Edit2,
  FileText,
  Layers,
  Network,
  Plus,
  Printer,
  Save,
  Trash2,
  User,
} from 'lucide-react';
import type { CasePriority, CaseStatus, InvestigationCase, InvestigationTarget } from '../types/cases';
import {
  addTargetToCase,
  deleteCase,
  getCase,
  removeTargetFromCase,
  subscribeToCaseUpdates,
  updateCase,
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
  TransactionDetailResponse,
} from '../types/api';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  EntityLink,
  ErrorState,
  FilterBar,
  Metric,
  PageHeader,
  Panel,
  RiskBadge,
} from '../components/common';
import type { Column, FilterOption } from '../components/common';
import { CaseDossierModal } from '../components/layout/CaseDossierModal';
import { SarExportModal } from '../components/layout/SarExportModal';

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
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

  // Enriched details fetched from backend
  const [communityDetails, setCommunityDetails] = useState<Map<string, CommunityDetailResponse>>(new Map());
  const [accountDetails, setAccountDetails] = useState<Map<string, AccountDetailResponse>>(new Map());
  const [transactionDetails, setTransactionDetails] = useState<Map<string, TransactionDetailResponse>>(new Map());
  const [evidenceMap, setEvidenceMap] = useState<Map<string, EvidenceItem[]>>(new Map());
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Evidence filter
  const [evidenceFilter, setEvidenceFilter] = useState<string>('ALL');
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
    if (!investigationCase || investigationCase.targets.length === 0) {
      setLoadingDetails(false);
      return;
    }

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
              if (detail.value.community_id !== null && !selectedCommunityForGraph) {
                setSelectedCommunityForGraph(String(detail.value.community_id));
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
        title="Investigation Dossier Unavailable"
        message={`No investigation case file was found matching ID '${caseId}'.`}
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
    if (window.confirm('Delete this investigation case permanently?')) {
      deleteCase(investigationCase.id);
      navigate('/investigations');
    }
  };

  const communityTargets = investigationCase.targets.filter((t) => t.type === 'COMMUNITY');
  const accountTargets = investigationCase.targets.filter((t) => t.type === 'ACCOUNT');
  const transactionTargets = investigationCase.targets.filter((t) => t.type === 'TRANSACTION');

  // Compute highest risk score observed
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

  const highEvidenceCount = aggregatedEvidence.filter((e) => e.severity === 'HIGH').length;
  const medEvidenceCount = aggregatedEvidence.filter((e) => e.severity === 'MEDIUM').length;

  const evidenceFilterOptions: FilterOption<string>[] = [
    { label: 'All Severity', value: 'ALL', count: aggregatedEvidence.length },
    { label: 'High', value: 'HIGH', count: highEvidenceCount },
    { label: 'Medium', value: 'MEDIUM', count: medEvidenceCount },
    { label: 'Low', value: 'LOW', count: aggregatedEvidence.filter((e) => e.severity === 'LOW').length },
  ];

  const filteredEvidence = aggregatedEvidence.filter(
    (item) => evidenceFilter === 'ALL' || item.severity === evidenceFilter
  );

  // Target Table Columns
  const targetColumns: Column<InvestigationTarget>[] = [
    {
      key: 'type',
      header: 'Target Entity Type',
      width: '140px',
      render: (t) => {
        if (t.type === 'COMMUNITY') {
          return (
            <Badge variant="accent" size="sm">
              <Layers size={11} style={{ marginRight: '4px' }} />
              COMMUNITY
            </Badge>
          );
        }
        if (t.type === 'ACCOUNT') {
          return (
            <Badge variant="neutral" size="sm">
              <User size={11} style={{ marginRight: '4px' }} />
              ACCOUNT
            </Badge>
          );
        }
        return (
          <Badge variant="neutral" size="sm">
            TRANSACTION
          </Badge>
        );
      },
    },
    {
      key: 'id',
      header: 'Entity ID',
      width: '160px',
      render: (t) => {
        if (t.type === 'COMMUNITY') {
          return <EntityLink type="community" id={t.id} label={`Community #${t.id}`} />;
        }
        if (t.type === 'ACCOUNT') {
          return <EntityLink type="account" id={t.id} />;
        }
        return <EntityLink type="transaction" id={t.id} />;
      },
    },
    {
      key: 'label',
      header: 'Forensic Context / Detail',
      render: (t) => {
        if (t.type === 'COMMUNITY') {
          const comm = communityDetails.get(t.id);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t.label}
              </span>
              {comm && (
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  · {comm.member_count} members · Score {comm.risk_score}/100
                </span>
              )}
            </div>
          );
        }
        if (t.type === 'ACCOUNT') {
          const acc = accountDetails.get(t.id);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t.label}
              </span>
              {acc && (
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  · Balance ${acc.balance.toLocaleString()} · {acc.transaction_statistics.total_count} txs
                </span>
              )}
            </div>
          );
        }
        const tx = transactionDetails.get(t.id);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t.label}
            </span>
            {tx && (
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                · ${tx.amount.toFixed(2)} · {tx.transaction_status}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'addedAt',
      header: 'Added Timestamp',
      width: '150px',
      render: (t) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {new Date(t.addedAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '180px',
      align: 'right',
      render: (t) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => {
              if (t.type === 'COMMUNITY') navigate(`/communities/${t.id}`);
              else if (t.type === 'ACCOUNT') navigate(`/accounts/${t.id}`);
              else navigate(`/transactions/${t.id}`);
            }}
          >
            Inspect
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            onClick={() => handleRemoveTarget(t)}
            title="Remove entity from case"
          />
        </div>
      ),
    },
  ];

  // Aggregated Evidence Columns
  const evidenceColumns: Column<EvidenceItem>[] = [
    {
      key: 'severity',
      header: 'Severity',
      width: '100px',
      render: (item) => <RiskBadge level={item.severity} size="sm" />,
    },
    {
      key: 'title',
      header: 'Observable Rule / Indicator',
      render: (item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {item.title}
          </span>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
            {item.description}
          </p>
        </div>
      ),
    },
    {
      key: 'score_contribution',
      header: 'Rule Weight',
      width: '110px',
      align: 'right',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>
          +{item.score_contribution.toFixed(1)} pts
        </span>
      ),
    },
    {
      key: 'supporting_entities',
      header: 'Affected Entities',
      width: '160px',
      render: (item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {item.supporting_entities.length} entit{item.supporting_entities.length === 1 ? 'y' : 'ies'}
          </span>
          {item.supporting_entities.length > 0 && (
            <span className="font-mono truncate" style={{ fontSize: '10px', color: 'var(--text-dim)', maxWidth: '140px' }}>
              {item.supporting_entities.slice(0, 2).join(', ')}
              {item.supporting_entities.length > 2 ? '...' : ''}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '150px',
      align: 'right',
      render: (item) => {
        const commTarget = investigationCase.targets.find((t) => t.type === 'COMMUNITY');
        const commId = commTarget ? commTarget.id : selectedCommunityForGraph;
        if (!commId) return null;
        return (
          <Button
            variant="secondary"
            size="sm"
            icon={Network}
            onClick={() =>
              navigate(`/communities/${commId}`, {
                state: { tab: 'graph', evidenceFocus: item },
              })
            }
          >
            Explore in Graph
          </Button>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. PAGE HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <PageHeader
        title={
          isEditingTitle ? (
            <form onSubmit={handleSaveTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--accent)',
                  color: 'var(--text-primary)',
                  fontSize: '18px',
                  fontWeight: 800,
                  outline: 'none',
                }}
                autoFocus
              />
              <Button variant="primary" size="sm" type="submit">Save</Button>
              <Button variant="secondary" size="sm" onClick={() => setIsEditingTitle(false)}>Cancel</Button>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>{investigationCase.title}</span>
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
                title="Edit case title"
              >
                <Edit2 size={14} />
              </button>
            </div>
          )
        }
        description="Multi-entity forensic dossier with aggregated deterministic evidence, target telemetry, and investigator audit notes."
        breadcrumbs={
          <button
            onClick={() => navigate('/investigations')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '12px',
              cursor: 'pointer',
              padding: 0,
              marginBottom: '6px',
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft size={13} />
            <span>Back to Investigations</span>
          </button>
        }
        badge={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant="neutral">CASE {investigationCase.id}</Badge>

            {/* Status Selector Dropdown */}
            <select
              value={investigationCase.status}
              onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="OPEN">STATUS: OPEN</option>
              <option value="REVIEW">STATUS: IN REVIEW</option>
              <option value="CLOSED">STATUS: CLOSED</option>
            </select>

            {/* Priority Selector Dropdown */}
            <select
              value={investigationCase.priority}
              onChange={(e) => handlePriorityChange(e.target.value as CasePriority)}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="HIGH">PRIORITY: HIGH</option>
              <option value="MEDIUM">PRIORITY: MEDIUM</option>
              <option value="LOW">PRIORITY: LOW</option>
            </select>
          </div>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant="secondary"
              size="md"
              icon={Printer}
              onClick={() => setIsDossierModalOpen(true)}
            >
              Export Dossier / Print
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={FileText}
              onClick={() => setIsSarModalOpen(true)}
            >
              Generate SAR
            </Button>
            <Button
              variant="ghost"
              size="md"
              icon={Trash2}
              onClick={handleDeleteThisCase}
              title="Delete case file"
            />
          </div>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* 2. CASE CONTEXT METRICS                                            */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="md">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <Metric
            label="Case Lifecycle Status"
            value={investigationCase.status}
            subtext={`Updated ${new Date(investigationCase.updatedAt).toLocaleTimeString()}`}
            variant={investigationCase.status === 'OPEN' ? 'accent' : 'default'}
          />
          <Metric
            label="Investigation Priority"
            value={investigationCase.priority}
            subtext="Triage severity classification"
            variant={investigationCase.priority === 'HIGH' ? 'high' : 'med'}
          />
          <Metric
            label="Attached Entities"
            value={`${investigationCase.targets.length} Targets`}
            subtext={`${communityTargets.length} comm, ${accountTargets.length} acc, ${transactionTargets.length} tx`}
          />
          <Metric
            label="Peak Cluster Prioritization"
            value={maxObservedRiskScore !== null ? `${maxObservedRiskScore}/100` : '—'}
            subtext="Highest target ML risk score"
            variant={maxObservedRiskScore !== null && maxObservedRiskScore >= 75 ? 'high' : 'default'}
          />
          <Metric
            label="Observable Evidence Rules"
            value={`${aggregatedEvidence.length} Active`}
            subtext={`${highEvidenceCount} High, ${medEvidenceCount} Med triggers`}
            variant={highEvidenceCount > 0 ? 'high' : 'default'}
          />
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 3. ATTACHED TARGETS TABLE                                          */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title={`Attached Target Entities (${investigationCase.targets.length})`}
        subtitle="Network communities, individual accounts, and transaction operations attached to this case file."
        padding="none"
      >
        {/* Quick Add Target Bar */}
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            backgroundColor: 'var(--bg-sidebar)',
          }}
        >
          <form onSubmit={handleQuickAddTarget} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', maxWidth: '480px' }}>
            <input
              type="text"
              value={addTargetInput}
              onChange={(e) => setAddTargetInput(e.target.value)}
              placeholder="Add target ID (e.g. acc_123, tx_456, or community #)..."
              style={{
                flex: 1,
                padding: '6px 12px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <Button variant="secondary" size="sm" icon={Plus} type="submit">
              Attach Target
            </Button>
          </form>

          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            Entities can also be attached directly from the Risk Queue or Detail workspaces.
          </span>
        </div>

        {investigationCase.targets.length === 0 ? (
          <EmptyState
            title="No target entities attached"
            message="Attach suspicious communities, accounts, or transactions to begin building this forensic case dossier."
          />
        ) : (
          <DataTable
            columns={targetColumns}
            data={investigationCase.targets}
            keyExtractor={(t) => `${t.type}_${t.id}`}
          />
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 4. AGGREGATED OBSERVABLE EVIDENCE TABLE                            */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title={`Aggregated Observable Evidence (${aggregatedEvidence.length})`}
        subtitle="Deterministic evidence rule triggers collected across all attached case targets."
        padding="none"
      >
        {/* Filter Bar Header */}
        <div
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-sidebar)',
          }}
        >
          <FilterBar
            options={evidenceFilterOptions}
            selected={evidenceFilter}
            onChange={setEvidenceFilter}
            size="sm"
          />
          {loadingDetails && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Enriching evidence telemetry...
            </span>
          )}
        </div>

        {filteredEvidence.length === 0 ? (
          <EmptyState
            title="No observable evidence rule triggers"
            message="No deterministic evidence rules have triggered for the currently attached target entities."
          />
        ) : (
          <DataTable
            columns={evidenceColumns}
            data={filteredEvidence}
            keyExtractor={(item) => item.evidence_id}
          />
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 5. PERSISTENT INVESTIGATOR NOTES & AUDIT TRAIL                     */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title="Investigator Notes & Forensic Hypotheses"
        subtitle="Persistent case notes, timeline findings, and SAR corroboration log."
        padding="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Record ongoing investigation observations, cross-account connections, merchant anomalies, or regulatory submission notes..."
            rows={6}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              lineHeight: 1.5,
              outline: 'none',
              resize: 'vertical',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-dim)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isSavingNotes ? (
                <span style={{ color: 'var(--accent)' }}>Saving notes...</span>
              ) : (
                <>
                  <CheckCircle2 size={12} style={{ color: 'var(--risk-low)' }} />
                  <span>Autosaved locally{lastSavedTimestamp ? ` at ${lastSavedTimestamp}` : ''}</span>
                </>
              )}
            </div>

            <Button
              variant="secondary"
              size="sm"
              icon={Save}
              onClick={handleManualSaveNotes}
            >
              Save Notes
            </Button>
          </div>
        </div>
      </Panel>

      {/* Case Dossier Modal */}
      <CaseDossierModal
        isOpen={isDossierModalOpen}
        onClose={() => setIsDossierModalOpen(false)}
        investigationCase={investigationCase}
        communityDetails={communityDetails}
        accountDetails={accountDetails}
        transactionDetails={transactionDetails}
        aggregatedEvidence={aggregatedEvidence}
      />

      {/* SAR Export Modal */}
      <SarExportModal
        isOpen={isSarModalOpen}
        onClose={() => setIsSarModalOpen(false)}
      />
    </div>
  );
};
