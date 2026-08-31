import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, BookOpen, Briefcase, CheckSquare,
  CheckCircle2, Clock, FileText, FlaskConical, Layers, Network,
  Scale, ScanSearch, Search, Users,
} from 'lucide-react';
import {
  getCommunity, getCommunityAccounts, getCommunityEvidence,
  getCommunityGraph, getCommunityTimeline,
} from '../api';
import type {
  AccountSummary, CommunityDetailResponse, CommunityEvidenceResponse,
  CommunityGraphResponse, EvidenceItem, TimelineEvent,
} from '../types/api';
import type { FormalDecision } from '../types/cases';
import {
  Badge, Button, DataTable, EmptyState,
  EntityLink, LoadingState, Pagination, Panel, RiskBadge, RiskScore,
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
import { RecommendedActionsPanel } from '../components/investigation/RecommendedActionsPanel';
import {
  createFormalCase,
  findCaseForCommunity,
  getCases,
  recordDecision,
  recordSarExport,
  subscribeToCaseUpdates,
} from '../utils/caseManager';

// ---------------------------------------------------------------------------
// URL-driven view keys
// ---------------------------------------------------------------------------
type ForensicView =
  | 'evidence' | 'network' | 'accounts' | 'timeline'
  | 'money-flow' | 'story' | 'hypotheses' | 'decision';

const VALID_VIEWS: readonly ForensicView[] = [
  'evidence','network','accounts','timeline','money-flow','story','hypotheses','decision',
];

function normalizeView(raw: string | null): ForensicView {
  if (raw && (VALID_VIEWS as readonly string[]).includes(raw)) return raw as ForensicView;
  return 'evidence';
}

const NAV_ITEMS: { view: ForensicView; label: string; icon: React.ElementType }[] = [
  { view: 'evidence',   label: 'Evidence',   icon: Layers      },
  { view: 'network',    label: 'Network',    icon: Network     },
  { view: 'accounts',   label: 'Accounts',   icon: Users       },
  { view: 'timeline',   label: 'Timeline',   icon: Clock       },
  { view: 'money-flow', label: 'Money Flow', icon: Activity    },
  { view: 'story',      label: 'Storyline',  icon: BookOpen    },
  { view: 'hypotheses', label: 'Hypotheses', icon: Scale       },
  { view: 'decision',   label: 'Decision',   icon: CheckSquare },
];

// ---------------------------------------------------------------------------
// ForensicWorkspacePage — top-level Page 3
// Route: /forensics
// URL: ?community=<id>&view=<view>&focus=<nodeId>
// ---------------------------------------------------------------------------
export const ForensicWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const communityParam = searchParams.get('community');
  const activeView = normalizeView(searchParams.get('view'));
  const focusParam = searchParams.get('focus');

  const setView = useCallback(
    (view: ForensicView, extra?: Record<string, string>) => {
      setSearchParams(
        (_prev) => {
          const next = new URLSearchParams();
          if (communityParam) next.set('community', communityParam);
          next.set('view', view);
          if (extra) Object.entries(extra).forEach(([k, v]) => next.set(k, v));
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams, communityParam],
  );

  // data state
  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<CommunityEvidenceResponse | null>(null);
  const [graphData, setGraphData] = useState<CommunityGraphResponse | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsTotalPages, setAccountsTotalPages] = useState(1);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [evidenceFocus, setEvidenceFocus] = useState<EvidenceItem | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(focusParam);
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);
  const [openCasesCount, setOpenCasesCount] = useState(0);

  // Decision form state
  const [existingCaseId, setExistingCaseId] = useState<string | null>(null);
  const [decisionDisposition, setDecisionDisposition] = useState<FormalDecision['disposition']>('ESCALATE_SAR');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);

  // loading flags
  const [loadingCore, setLoadingCore] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [coreError, setCoreError] = useState<string | null>(null);

  // case count from real local storage + existing case detection
  useEffect(() => {
    const update = () => {
      setOpenCasesCount(getCases().filter((c) => c.status !== 'CLOSED').length);
      if (communityParam) {
        const existing = findCaseForCommunity(communityParam);
        setExistingCaseId(existing ? existing.id : null);
      }
    };
    update();
    return subscribeToCaseUpdates(update);
  }, [communityParam]);

  // core data on community change
  useEffect(() => {
    if (!communityParam) {
      setCommunity(null); setEvidence(null); setGraphData(null);
      setAccounts([]); setTimelineEvents([]); setCoreError(null); return;
    }
    setLoadingCore(true); setCoreError(null);
    Promise.all([
      getCommunity(communityParam),
      getCommunityEvidence(communityParam).catch(() => null),
    ])
      .then(([comm, ev]) => { setCommunity(comm); setEvidence(ev); })
      .catch((err) => setCoreError(err instanceof Error ? err.message : 'Community not found'))
      .finally(() => setLoadingCore(false));
  }, [communityParam]);

  // graph on demand
  useEffect(() => {
    if (!communityParam || !['network', 'accounts'].includes(activeView) || graphData || loadingGraph) return;
    setLoadingGraph(true);
    getCommunityGraph(communityParam, 200, 500)
      .then(setGraphData).catch(console.error).finally(() => setLoadingGraph(false));
  }, [communityParam, activeView, graphData, loadingGraph]);

  // accounts on demand
  useEffect(() => {
    if (!communityParam || activeView !== 'accounts') return;
    setLoadingAccounts(true);
    getCommunityAccounts(communityParam, accountsPage, 50)
      .then((res) => {
        setAccounts(res.items); setAccountsTotal(res.total); setAccountsTotalPages(res.total_pages);
      })
      .catch(console.error).finally(() => setLoadingAccounts(false));
  }, [communityParam, activeView, accountsPage]);

  // timeline on demand (shared for timeline/money-flow/story)
  useEffect(() => {
    if (!communityParam || !['timeline', 'money-flow', 'story'].includes(activeView) || timelineEvents.length > 0) return;
    setLoadingTimeline(true);
    getCommunityTimeline(communityParam, 200, 0)
      .then((res) => setTimelineEvents(res.events))
      .catch(console.error).finally(() => setLoadingTimeline(false));
  }, [communityParam, activeView, timelineEvents.length]);

  useEffect(() => { if (focusParam) setFocusedNodeId(focusParam); }, [focusParam]);

  // cross-view helpers
  const handleFocusInNetwork = useCallback((accountId: string) => {
    setFocusedNodeId(accountId); setView('network', { focus: accountId });
  }, [setView]);

  const handleSelectEvidence = useCallback((item: EvidenceItem) => {
    setEvidenceFocus(item);
    const fe = item.supporting_entities[0];
    setView('network', fe ? { focus: fe } : {});
  }, [setView]);

  const handleClearFocus = useCallback(() => {
    setEvidenceFocus(null); setFocusedNodeId(null);
  }, []);

  // account columns
  const accountColumns: Column<AccountSummary>[] = [
    {
      key: 'account_id', header: 'Account', width: '160px',
      render: (acc) => (
        <EntityLink
          type="account"
          id={acc.account_id}
          state={{ fromForensics: true, communityId: communityParam, forensicView: 'accounts' }}
        />
      ),
    },
    {
      key: 'customer_name', header: 'Customer',
      render: (acc) => <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{acc.customer_name}</span>,
    },
    {
      key: 'balance', header: 'Balance', width: '130px', align: 'right',
      render: (acc) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
          ${acc.balance.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'risk', header: 'Risk', width: '110px',
      render: (acc) => acc.account_risk_score != null
        ? <RiskScore score={Math.round(acc.account_risk_score * 100)} size="sm" />
        : <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>,
    },
    {
      key: 'created', header: 'Created', width: '120px',
      render: (acc) => <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{acc.creation_date || '—'}</span>,
    },
    {
      key: 'actions', header: '', width: '190px', align: 'right',
      render: (acc) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={() => handleFocusInNetwork(acc.account_id)}>Graph</Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              navigate('/accounts/' + acc.account_id, {
                state: { fromForensics: true, communityId: communityParam },
              })
            }
          >
            Profile
          </Button>
        </div>
      ),
    },
  ];

  // ─── EMPTY STATE ────────────────────────────────────────────────────────
  if (!communityParam) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <FlaskConical size={20} style={{ color: 'var(--accent)' }} />
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              Forensic Workspace
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Deep evidence investigation, hypothesis testing, and case preparation.
          </p>
        </div>

        <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '8px', padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '10px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ScanSearch size={24} style={{ color: 'var(--text-dim)' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
              No investigation selected
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, maxWidth: '420px', lineHeight: 1.6 }}>
              Select a community from the Community Directory or open a case to begin forensic analysis.
              Evidence, network, accounts, timeline, hypotheses, and decision tools appear here once a community is selected.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <Button variant="primary" size="md" icon={Search} onClick={() => navigate('/communities')}>
              Browse Communities
            </Button>
            <Button variant="secondary" size="md" icon={Briefcase} onClick={() => navigate('/investigations')}>
              Open Cases
            </Button>
          </div>
        </div>

        {openCasesCount > 0 && (
          <div style={{ marginTop: '20px' }}>
            <Panel title="Active Cases" subtitle="Cases currently under investigation." padding="none">
              <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {openCasesCount} open case{openCasesCount !== 1 ? 's' : ''}
                </span>
                <Button variant="secondary" size="sm" onClick={() => navigate('/investigations')}>
                  View Cases
                </Button>
              </div>
            </Panel>
          </div>
        )}
      </div>
    );
  }

  // ─── LOADING ─────────────────────────────────────────────────────────────
  if (loadingCore) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <LoadingState type="card" count={1} />
        <LoadingState type="table" count={6} />
      </div>
    );
  }

  // ─── ERROR ───────────────────────────────────────────────────────────────
  if (coreError || !community) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--risk-high)', fontSize: '14px', marginBottom: '16px' }}>
          {coreError || 'Community not found'}
        </p>
        <Button variant="secondary" size="md" onClick={() => navigate('/forensics')}>
          Back to Forensic Workspace
        </Button>
      </div>
    );
  }

  // ─── ACTIVE INVESTIGATION ────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: '1600px', margin: '0 auto' }}>

      {/* COMPACT FORENSIC HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/communities/' + communityParam)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: 0 }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft size={13} />
            <span>Community #{community.community_id}</span>
          </button>
          <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FlaskConical size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>Forensic Workspace</span>
          </div>
          <Badge variant="neutral">#{community.community_id}</Badge>
          <RiskBadge level={community.risk_level} size="sm" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              ML <strong style={{ color: community.risk_level === 'HIGH' ? 'var(--risk-high)' : 'var(--text-primary)' }}>{community.risk_score}</strong>
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Evidence <strong style={{ color: 'var(--accent)' }}>{evidence?.evidence_score ?? '—'}/100</strong>
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Members <strong>{community.member_count}</strong>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={CheckSquare}
            onClick={() => setView('decision')}
          >
            Decision
          </Button>
          <Button variant="secondary" size="sm" icon={FileText} onClick={() => setIsSarModalOpen(true)}>
            Generate SAR
          </Button>
        </div>
      </div>

      {/* FORENSIC VIEW NAV BAR — sticky */}
      <div style={{ position: 'sticky', top: '52px', zIndex: 10, backgroundColor: 'var(--bg-page)', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', overflowX: 'auto' }}>
          {NAV_ITEMS.map(({ view, label, icon: Icon }) => {
            const isActive = activeView === view;
            return (
              <button
                key={view}
                type="button"
                onClick={() => setView(view)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '10px 16px', borderRadius: '5px 5px 0 0', border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  backgroundColor: isActive ? 'var(--bg-subtle)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '12px', fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer', transition: 'all 0.12s ease', whiteSpace: 'nowrap', flexShrink: 0,
                }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <EvidenceConvergencePanel evidence={evidence} onSelectEvidence={handleSelectEvidence} />
          <RecommendedActionsPanel
            community={community}
            evidence={evidence}
            graphData={graphData}
            onFocusAccountInGraph={handleFocusInNetwork}
            onScrollToFlow={() => setView('money-flow')}
          />
        </div>
      )}

      {/* VIEW: NETWORK */}
      {activeView === 'network' && (
        <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
          {loadingGraph || !graphData
            ? <div style={{ padding: '24px' }}><LoadingState type="graph" /></div>
            : (
              <NetworkGraph
                graphData={graphData}
                height="680px"
                evidenceFocus={evidenceFocus}
                allEvidenceItems={evidence?.items ?? []}
                communityId={community.community_id}
                initialSelectedNodeId={focusedNodeId}
                onClearFocus={handleClearFocus}
              />
            )
          }
        </div>
      )}

      {/* VIEW: ACCOUNTS */}
      {activeView === 'accounts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {graphData && (
            <EntityRoleMatrix
              graphData={graphData}
              timelineEvents={timelineEvents}
              onFocusAccountInGraph={handleFocusInNetwork}
              communityId={community.community_id}
            />
          )}
          <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                Member Accounts — {accountsTotal.toLocaleString()} total
              </strong>
            </div>
            {loadingAccounts
              ? <div style={{ padding: '24px' }}><LoadingState type="table" count={8} /></div>
              : (
                <>
                  <DataTable
                    columns={accountColumns}
                    data={accounts}
                    keyExtractor={(acc) => acc.account_id}
                    emptyMessage="No member accounts found."
                  />
                  <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                    <Pagination
                      currentPage={accountsPage}
                      totalPages={accountsTotalPages}
                      totalItems={accountsTotal}
                      pageSize={50}
                      onPageChange={(p) => setAccountsPage(p)}
                    />
                  </div>
                </>
              )
            }
          </div>
        </div>
      )}

      {/* VIEW: TIMELINE */}
      {activeView === 'timeline' && (
        <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', padding: '20px' }}>
          {loadingTimeline
            ? <LoadingState type="table" count={8} />
            : timelineEvents.length === 0
              ? <EmptyState title="No timeline events" message="No transaction events found for this community." />
              : <TimelineView events={timelineEvents} evidenceFocus={evidenceFocus} communityId={community.community_id} />
          }
        </div>
      )}

      {/* VIEW: MONEY FLOW */}
      {activeView === 'money-flow' && (
        loadingTimeline
          ? <div style={{ padding: '24px' }}><LoadingState type="card" count={2} /></div>
          : <MoneyMovementFlow timelineEvents={timelineEvents} onFocusAccountInGraph={handleFocusInNetwork} />
      )}

      {/* VIEW: STORYLINE */}
      {activeView === 'story' && (
        loadingTimeline
          ? <div style={{ padding: '24px' }}><LoadingState type="card" count={3} /></div>
          : (
            <FraudStoryTimeline
              community={community}
              evidence={evidence}
              timelineEvents={timelineEvents}
              accounts={accounts}
              onSelectEvidence={handleSelectEvidence}
            />
          )
      )}

      {/* VIEW: HYPOTHESES */}
      {activeView === 'hypotheses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <HypothesisEnginePanel community={community} evidence={evidence} />
          <InvestigatorNarrativeBlock community={community} evidence={evidence} />
        </div>
      )}

      {/* VIEW: DECISION */}
      {activeView === 'decision' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Evidence summary at decision time */}
          <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <CheckSquare size={16} style={{ color: 'var(--accent)' }} />
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Investigation Evidence Summary</strong>
              <Badge variant="neutral">Community #{community.community_id}</Badge>
              <RiskBadge level={community.risk_level} size="sm" />
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '-4px' }}>
              DERIVED — Computed from Forensic Workspace investigation data
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Evidence Triggers', value: String(evidence?.evidence_count ?? '—'), sub: `${evidence?.high_count ?? 0} High / ${evidence?.medium_count ?? 0} Med / ${evidence?.low_count ?? 0} Low` },
                { label: 'Evidence Score', value: evidence?.evidence_score != null ? `${evidence.evidence_score}/100` : '—', sub: 'Composite evidence score' },
                { label: 'Shared Infrastructure', value: String((community.entity_sharing?.unique_shared_devices || 0) + (community.entity_sharing?.unique_shared_ips || 0) + (community.entity_sharing?.unique_shared_instruments || 0)), sub: 'devices + IPs + instruments' },
                { label: 'Transaction Volume', value: '$' + (community.transaction_statistics?.total_transaction_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), sub: 'Observed community movement' },
                { label: 'Member Accounts', value: String(community.member_count), sub: 'Accounts in Louvain partition' },
                { label: 'ML Risk Score', value: String(community.risk_score), sub: `Tier: ${community.risk_level}` },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ padding: '12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{label}</span>
                  <span className="font-mono" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>{sub}</span>
                </div>
              ))}
            </div>
          </div>

          <CaseReadinessAudit
            onOpenDossierModal={() => {}}
            onOpenSarModal={() => setIsSarModalOpen(true)}
          />

          <InvestigatorNarrativeBlock community={community} evidence={evidence} />

          {/* ── FORMAL DECISION & DOSSIER CREATION ─────────────────────────── */}
          <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <CheckSquare size={16} style={{ color: 'var(--accent)' }} />
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Record Formal Decision & Create Dossier</strong>
            </div>

            {existingCaseId ? (
              /* Already has a formal case — show link */
              <div style={{ padding: '16px', backgroundColor: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={16} style={{ color: '#86efac', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#86efac', fontWeight: 700 }}>Formal dossier already exists for this investigation.</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Case ID: <code className="font-mono">{existingCaseId}</code></div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/investigations/${existingCaseId}`)}>
                  Open Dossier →
                </Button>
              </div>
            ) : decisionSuccess ? (
              /* Decision recorded successfully */
              <div style={{ padding: '16px', backgroundColor: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={16} style={{ color: '#86efac', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', color: '#86efac', fontWeight: 700 }}>Formal dossier created and decision recorded.</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Case ID: <code className="font-mono">{decisionSuccess}</code></div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/investigations/${decisionSuccess}`)}>
                  Open Dossier →
                </Button>
              </div>
            ) : (
              /* Decision form */
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!decisionRationale.trim()) return;
                  setDecisionSubmitting(true);
                  const commId = community.community_id.toString();
                  const snap = {
                    evidenceCount: evidence?.evidence_count ?? 0,
                    highCount: evidence?.high_count ?? 0,
                    medCount: evidence?.medium_count ?? 0,
                    lowCount: evidence?.low_count ?? 0,
                    evidenceScore: evidence?.evidence_score ?? null,
                    snapshotTimestamp: new Date().toISOString(),
                    memberCount: community.member_count,
                    sharedDevices: community.entity_sharing?.unique_shared_devices ?? 0,
                    sharedIps: community.entity_sharing?.unique_shared_ips ?? 0,
                    sharedInstruments: community.entity_sharing?.unique_shared_instruments ?? 0,
                    totalTransactionAmount: community.transaction_statistics?.total_transaction_amount ?? 0,
                  };
                  const newCase = createFormalCase(
                    commId,
                    `Investigation: Community #${commId} — ${decisionDisposition.replace(/_/g, ' ')}`,
                    community.risk_level as 'HIGH' | 'MEDIUM' | 'LOW',
                    { type: 'COMMUNITY', id: commId, label: `Community #${commId}`, riskScore: community.risk_score, riskLevel: community.risk_level as 'HIGH' | 'MEDIUM' | 'LOW', addedAt: new Date().toISOString() },
                    snap
                  );
                  recordDecision(newCase.id, {
                    disposition: decisionDisposition,
                    rationale: decisionRationale.trim(),
                    timestamp: new Date().toISOString(),
                    evidenceSnapshot: snap,
                  });
                  setDecisionSuccess(newCase.id);
                  setDecisionSubmitting(false);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
              >
                <div style={{ padding: '10px 12px', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--accent)', display: 'block', marginBottom: '3px' }}>INVESTIGATOR ENTERED</strong>
                  Record your formal disposition and rationale. This creates a permanent dossier that cannot be undone.
                  SAR generation is available after recording the decision.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                    Disposition
                  </label>
                  <select
                    value={decisionDisposition}
                    onChange={(e) => setDecisionDisposition(e.target.value as FormalDecision['disposition'])}
                    required
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: '5px', fontSize: '13px', outline: 'none' }}
                  >
                    <option value="ESCALATE_SAR">ESCALATE — File Suspicious Activity Report (SAR)</option>
                    <option value="REFER_COMPLIANCE">REFER — Send to Compliance for review</option>
                    <option value="MONITOR">MONITOR — Continue observation, no immediate action</option>
                    <option value="CLOSE_NO_ACTION">CLOSE — No suspicious activity found</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                    Decision Rationale <span style={{ color: 'var(--risk-high)' }}>*</span>
                  </label>
                  <textarea
                    value={decisionRationale}
                    onChange={(e) => setDecisionRationale(e.target.value)}
                    placeholder="Document your reasoning: evidence assessed, alternative hypotheses ruled out, outstanding uncertainties, and basis for this disposition..."
                    required
                    rows={5}
                    style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: '5px', fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none', width: '100%' }}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>{decisionRationale.length} characters — minimum 20 characters required</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <Button
                    variant="primary"
                    size="md"
                    type="submit"
                    icon={CheckSquare}
                    disabled={decisionSubmitting || decisionRationale.trim().length < 20}
                  >
                    {decisionSubmitting ? 'Creating Dossier...' : 'Record Decision & Create Dossier'}
                  </Button>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>This action creates a formal case record. It cannot be undone.</span>
                </div>
              </form>
            )}
          </div>

          {/* SAR generation — available from Decision view only */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '16px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '6px', alignItems: 'center' }}>
            <Button
              variant="secondary"
              size="md"
              icon={FileText}
              onClick={() => {
                setIsSarModalOpen(true);
                // If a case exists, record the SAR export audit event
                const cid = existingCaseId || decisionSuccess;
                if (cid) recordSarExport(cid);
              }}
            >
              Generate SAR
            </Button>
            <Button variant="secondary" size="md" onClick={() => navigate('/investigations')}>
              View All Dossiers
            </Button>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              SAR generation is available exclusively from this Decision view.
            </span>
          </div>
        </div>
      )}

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
