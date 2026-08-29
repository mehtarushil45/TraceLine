import React, { useCallback, useEffect, useState } from 'react';
import {
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Clock,
  FileText,
  Layers,
  Network,
  Scale,
  Users,
} from 'lucide-react';
import {
  getCommunity,
  getCommunityAccounts,
  getCommunityEvidence,
  getCommunityGraph,
  getCommunityTimeline,
} from '../api';
import type {
  AccountSummary,
  CommunityDetailResponse,
  CommunityEvidenceResponse,
  CommunityGraphResponse,
  EvidenceItem,
  TimelineEvent,
} from '../types/api';
import {
  AddToInvestigationButton,
  Badge,
  Button,
  DataTable,
  EmptyState,
  EntityLink,
  ErrorState,
  LoadingState,
  Pagination,
  RiskBadge,
  RiskScore,
} from '../components/common';
import type { Column } from '../components/common';
import { NetworkGraph } from '../components/graph/NetworkGraph';
import { TimelineView } from '../components/timeline/TimelineView';
import { SarExportModal } from '../components/layout/SarExportModal';
import { EvidenceConvergencePanel } from '../components/investigation/EvidenceConvergencePanel';
import { FraudStoryTimeline } from '../components/investigation/FraudStoryTimeline';
import { HypothesisEnginePanel } from '../components/investigation/HypothesisEnginePanel';
import { MoneyMovementFlow } from '../components/investigation/MoneyMovementFlow';
import { EntityRoleMatrix } from '../components/investigation/EntityRoleMatrix';
import { CaseReadinessAudit } from '../components/investigation/CaseReadinessAudit';
import { InvestigatorNarrativeBlock } from '../components/investigation/InvestigatorNarrativeBlock';

// URL-driven view type
type WorkspaceView = 'evidence' | 'network' | 'accounts' | 'timeline' | 'money-flow' | 'story' | 'hypotheses';
const VALID_VIEWS: readonly WorkspaceView[] = ['evidence', 'network', 'accounts', 'timeline', 'money-flow', 'story', 'hypotheses'];

function normalizeView(raw: string | null): WorkspaceView {
  if (raw && (VALID_VIEWS as readonly string[]).includes(raw)) return raw as WorkspaceView;
  return 'evidence';
}

const NAV_ITEMS: { view: WorkspaceView; label: string; icon: React.ElementType }[] = [
  { view: 'evidence',   label: 'Evidence',   icon: Layers   },
  { view: 'network',    label: 'Network',    icon: Network  },
  { view: 'accounts',   label: 'Accounts',   icon: Users    },
  { view: 'timeline',   label: 'Timeline',   icon: Clock    },
  { view: 'money-flow', label: 'Money Flow', icon: Activity },
  { view: 'story',      label: 'Storyline',  icon: BookOpen },
  { view: 'hypotheses', label: 'Hypotheses', icon: Scale    },
];

export const CommunityInvestigationPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeView = normalizeView(searchParams.get('view'));
  const focusParam = searchParams.get('focus');

  // Redirect to the canonical top-level /forensics route immediately.
  // This preserves back/forward navigation and keeps deep links working.
  useEffect(() => {
    if (!communityId) return;
    const params = new URLSearchParams();
    params.set('community', communityId);
    params.set('view', activeView);
    if (focusParam) params.set('focus', focusParam);
    navigate('/forensics?' + params.toString(), { replace: true });
  }, [communityId, activeView, focusParam, navigate]);

  const setView = useCallback(
    (view: WorkspaceView, extra?: Record<string, string>) => {
      setSearchParams((_prev) => {
        const next = new URLSearchParams();
        next.set('view', view);
        if (extra) Object.entries(extra).forEach(([k, v]) => next.set(k, v));
        return next;
      }, { replace: false });
    },
    [setSearchParams],
  );

  // Data
  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<CommunityEvidenceResponse | null>(null);
  const [graphData, setGraphData] = useState<CommunityGraphResponse | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsTotalPages, setAccountsTotalPages] = useState(1);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);
  const [evidenceFocus, setEvidenceFocus] = useState<EvidenceItem | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(focusParam);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Core data
  useEffect(() => {
    if (!communityId) return;
    setLoading(true);
    Promise.all([
      getCommunity(communityId),
      getCommunityEvidence(communityId).catch(() => null),
    ])
      .then(([comm, ev]) => { setCommunity(comm); setEvidence(ev); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Community not found'))
      .finally(() => setLoading(false));
  }, [communityId]);

  // Graph on demand
  useEffect(() => {
    if (!communityId || !['network', 'accounts'].includes(activeView) || graphData || loadingGraph) return;
    setLoadingGraph(true);
    getCommunityGraph(communityId, 200, 500).then(setGraphData).catch(console.error).finally(() => setLoadingGraph(false));
  }, [communityId, activeView, graphData, loadingGraph]);

  // Accounts on demand
  useEffect(() => {
    if (!communityId || activeView !== 'accounts') return;
    setLoadingAccounts(true);
    getCommunityAccounts(communityId, accountsPage, 50)
      .then((res) => { setAccounts(res.items); setAccountsTotal(res.total); setAccountsTotalPages(res.total_pages); })
      .catch(console.error)
      .finally(() => setLoadingAccounts(false));
  }, [communityId, activeView, accountsPage]);

  // Timeline on demand (also needed for story / money-flow)
  useEffect(() => {
    if (!communityId || !['timeline', 'money-flow', 'story'].includes(activeView) || timelineEvents.length > 0) return;
    setLoadingTimeline(true);
    getCommunityTimeline(communityId, 200, 0)
      .then((res) => setTimelineEvents(res.events))
      .catch(console.error)
      .finally(() => setLoadingTimeline(false));
  }, [communityId, activeView, timelineEvents.length]);

  // Sync focus param
  useEffect(() => { if (focusParam) setFocusedNodeId(focusParam); }, [focusParam]);

  const handleFocusInNetwork = useCallback((accountId: string) => {
    setFocusedNodeId(accountId);
    setView('network', { focus: accountId });
  }, [setView]);

  const handleSelectEvidence = useCallback((item: EvidenceItem) => {
    setEvidenceFocus(item);
    setView('network', { focus: item.supporting_entities[0] || '' });
  }, [setView]);

  const handleClearFocus = useCallback(() => {
    setEvidenceFocus(null);
    setFocusedNodeId(null);
  }, []);

  const accountColumns: Column<AccountSummary>[] = [
    { key: 'account_id', header: 'Account', width: '160px', render: (acc) => <EntityLink type="account" id={acc.account_id} /> },
    { key: 'customer_name', header: 'Customer', render: (acc) => <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{acc.customer_name}</span> },
    { key: 'balance', header: 'Balance', width: '130px', align: 'right', render: (acc) => <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> },
    { key: 'risk', header: 'Risk', width: '110px', render: (acc) => acc.account_risk_score != null ? <RiskScore score={Math.round(acc.account_risk_score * 100)} size="sm" /> : <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span> },
    { key: 'created', header: 'Created', width: '120px', render: (acc) => <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{acc.creation_date || '—'}</span> },
    {
      key: 'action', header: '', width: '200px', align: 'right',
      render: (acc) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={() => handleFocusInNetwork(acc.account_id)}>Graph</Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/accounts/${acc.account_id}`)}>Profile →</Button>
        </div>
      ),
    },
  ];

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <LoadingState type="card" count={1} /><LoadingState type="table" count={6} />
    </div>
  );

  if (error || !community) return (
    <ErrorState title="Investigation Unavailable" message={error || 'Community not found'} onRetry={() => navigate(`/communities/${communityId}`)} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', maxWidth: '1600px', margin: '0 auto' }}>

      {/* COMPACT FORENSIC HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: '0', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(`/communities/${communityId}?tab=overview`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: 0 }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft size={13} />
            <span>Community #{community.community_id}</span>
          </button>
          <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)' }} />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>Investigation Workspace</span>
          <Badge variant="neutral">#{community.community_id}</Badge>
          <RiskBadge level={community.risk_level} size="sm" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>ML <strong style={{ color: community.risk_level === 'HIGH' ? 'var(--risk-high)' : 'var(--text-primary)' }}>{community.risk_score}</strong></span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Evidence <strong style={{ color: 'var(--accent)' }}>{evidence?.evidence_score ?? '—'}/100</strong></span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>Members <strong style={{ color: 'var(--text-primary)' }}>{community.member_count.toLocaleString()}</strong></span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AddToInvestigationButton targetType="COMMUNITY" targetId={community.community_id.toString()} targetLabel={`Community #${community.community_id}`} riskScore={community.risk_score} riskLevel={community.risk_level} size="sm" />
          <Button variant="secondary" size="sm" icon={FileText} onClick={() => setIsSarModalOpen(true)}>Generate SAR</Button>
        </div>
      </div>

      {/* FORENSIC NAV BAR */}
      <div style={{ position: 'sticky', top: '52px', zIndex: 10, backgroundColor: 'var(--bg-page)', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', overflowX: 'auto' }}>
          {NAV_ITEMS.map(({ view, label, icon: Icon }) => {
            const isActive = activeView === view;
            return (
              <button key={view} type="button" onClick={() => setView(view)}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 16px', borderRadius: '5px 5px 0 0', border: 'none', borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent', backgroundColor: isActive ? 'var(--bg-subtle)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '12px', fontWeight: isActive ? 700 : 500, cursor: 'pointer', transition: 'all 0.12s ease', whiteSpace: 'nowrap', flexShrink: 0 }}
                onMouseOver={(e) => { if (!isActive) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.backgroundColor = 'var(--bg-subtle)'; } }}
                onMouseOut={(e) => { if (!isActive) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; } }}
              >
                <Icon size={13} style={{ color: isActive ? 'var(--accent)' : 'inherit' }} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* VIEW: EVIDENCE */}
      {activeView === 'evidence' && (
        <EvidenceConvergencePanel evidence={evidence} onSelectEvidence={handleSelectEvidence} />
      )}

      {/* VIEW: NETWORK */}
      {activeView === 'network' && (
        <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
          {loadingGraph || !graphData ? (
            <div style={{ padding: '24px' }}><LoadingState type="graph" /></div>
          ) : (
            <NetworkGraph graphData={graphData} height="680px" evidenceFocus={evidenceFocus} allEvidenceItems={evidence?.items ?? []} communityId={community.community_id} initialSelectedNodeId={focusedNodeId} onClearFocus={handleClearFocus} />
          )}
        </div>
      )}

      {/* VIEW: ACCOUNTS */}
      {activeView === 'accounts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {graphData && timelineEvents.length > 0 && (
            <EntityRoleMatrix graphData={graphData} timelineEvents={timelineEvents} onFocusAccountInGraph={handleFocusInNetwork} />
          )}
          <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Member Accounts — {accountsTotal.toLocaleString()} total</strong>
            </div>
            {loadingAccounts ? (
              <div style={{ padding: '24px' }}><LoadingState type="table" count={8} /></div>
            ) : (
              <>
                <DataTable columns={accountColumns} data={accounts} keyExtractor={(acc) => acc.account_id} emptyMessage="No member accounts found." />
                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                  <Pagination currentPage={accountsPage} totalPages={accountsTotalPages} totalItems={accountsTotal} pageSize={50} onPageChange={(p) => setAccountsPage(p)} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* VIEW: TIMELINE */}
      {activeView === 'timeline' && (
        <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', padding: '20px' }}>
          {loadingTimeline ? <LoadingState type="table" count={8} /> : timelineEvents.length === 0 ? <EmptyState title="No timeline events" message="No transaction events were found for this community." /> : <TimelineView events={timelineEvents} evidenceFocus={evidenceFocus} />}
        </div>
      )}

      {/* VIEW: MONEY FLOW */}
      {activeView === 'money-flow' && (
        loadingTimeline ? <div style={{ padding: '24px' }}><LoadingState type="card" count={2} /></div> : <MoneyMovementFlow timelineEvents={timelineEvents} onFocusAccountInGraph={handleFocusInNetwork} />
      )}

      {/* VIEW: STORYLINE */}
      {activeView === 'story' && (
        loadingTimeline ? <div style={{ padding: '24px' }}><LoadingState type="card" count={3} /></div> : <FraudStoryTimeline community={community} evidence={evidence} timelineEvents={timelineEvents} accounts={accounts} onSelectEvidence={handleSelectEvidence} />
      )}

      {/* VIEW: HYPOTHESES */}
      {activeView === 'hypotheses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <HypothesisEnginePanel community={community} evidence={evidence} />
          <InvestigatorNarrativeBlock community={community} evidence={evidence} />
          <CaseReadinessAudit onOpenDossierModal={() => {}} onOpenSarModal={() => setIsSarModalOpen(true)} />
        </div>
      )}

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
