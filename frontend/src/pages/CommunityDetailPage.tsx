import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Cpu,
  FileText,
  Layers,
  Network,
  ScanSearch,
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
  Metric,
  PageHeader,
  Pagination,
  Panel,
  RiskBadge,
  RiskScore,
} from '../components/common';
import type { Column } from '../components/common';
import { NetworkGraph } from '../components/graph/NetworkGraph';
import { FeatureBreakdown } from '../components/community/FeatureBreakdown';
import { TimelineView } from '../components/timeline/TimelineView';
import { SarExportModal } from '../components/layout/SarExportModal';
import { EvidenceConvergencePanel } from '../components/investigation/EvidenceConvergencePanel';
import { FraudStoryTimeline } from '../components/investigation/FraudStoryTimeline';
import { HypothesisEnginePanel } from '../components/investigation/HypothesisEnginePanel';
import { RecommendedActionsPanel } from '../components/investigation/RecommendedActionsPanel';

// ---------------------------------------------------------------------------
// Tab key type & normalizer — avoids unsafe arbitrary string casting
// ---------------------------------------------------------------------------
type TabKey = 'overview' | 'evidence' | 'members' | 'graph' | 'timeline' | 'features';
const VALID_TABS: readonly TabKey[] = ['overview', 'evidence', 'members', 'graph', 'timeline', 'features'];

function normalizeTab(raw: string | null): TabKey {
  if (raw && (VALID_TABS as readonly string[]).includes(raw)) return raw as TabKey;
  return 'overview';
}

export const CommunityDetailPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---------------------------------------------------------------------------
  // Tab state — driven entirely by ?tab= URL param (enables Back/Forward)
  // ---------------------------------------------------------------------------
  const activeTab = normalizeTab(searchParams.get('tab'));

  const setActiveTab = useCallback(
    (tab: TabKey, extra?: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', tab);
          if (extra) {
            Object.entries(extra).forEach(([k, v]) => next.set(k, v));
          } else if (tab !== 'graph') {
            // Clear graph-specific focus param when switching away from graph
            next.delete('focus');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // ---------------------------------------------------------------------------
  // Core data
  // ---------------------------------------------------------------------------
  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<CommunityEvidenceResponse | null>(null);
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

  // Evidence + node focus that drives NetworkGraph highlighting
  const [evidenceFocus, setEvidenceFocus] = useState<EvidenceItem | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Member Accounts
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsTotalPages, setAccountsTotalPages] = useState(1);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Graph data
  const [graphData, setGraphData] = useState<CommunityGraphResponse | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  // Timeline events
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Handle incoming navigation state (e.g. AccountDetailPage "Explore in Graph")
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const state = location.state as {
      tab?: string;
      evidenceFocus?: EvidenceItem;
      accountId?: string;
    } | null;
    if (!state) return;

    if (state.evidenceFocus) {
      setEvidenceFocus(state.evidenceFocus);
      setActiveTab('graph');
    } else if (state.accountId) {
      setFocusedNodeId(state.accountId);
      setActiveTab('graph', { focus: state.accountId });
    } else if (state.tab) {
      // Support legacy 'accounts' key mapping to the new 'members' tab
      const mapped = state.tab === 'accounts' ? 'members' : state.tab;
      setActiveTab(normalizeTab(mapped));
    }
  // Only re-run when location.state identity changes — not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Sync ?focus= URL param → focusedNodeId when on graph tab
  const focusFromUrl = searchParams.get('focus');
  useEffect(() => {
    if (focusFromUrl && activeTab === 'graph') {
      setFocusedNodeId(focusFromUrl);
    }
  }, [focusFromUrl, activeTab]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  // Load core community + evidence immediately
  useEffect(() => {
    if (!communityId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      getCommunity(communityId),
      getCommunityEvidence(communityId).catch(() => null),
    ])
      .then(([commRes, evRes]) => {
        setCommunity(commRes);
        setEvidence(evRes);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : `Community #${communityId} not found`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [communityId]);

  // Pre-load graph in background so graph tab opens instantly
  useEffect(() => {
    if (!communityId || graphData) return;
    getCommunityGraph(communityId, 200, 500)
      .then(setGraphData)
      .catch(() => { /* optional background prefetch */ });
  }, [communityId, graphData]);

  // Load accounts when on members tab or page changes
  useEffect(() => {
    if (!communityId || activeTab !== 'members') return;
    setLoadingAccounts(true);
    getCommunityAccounts(communityId, accountsPage, 50)
      .then((res) => {
        setAccounts(res.items);
        setAccountsTotal(res.total);
        setAccountsTotalPages(res.total_pages);
      })
      .catch((err) => console.error('Failed to load accounts:', err))
      .finally(() => setLoadingAccounts(false));
  }, [communityId, activeTab, accountsPage]);

  // Load graph on demand (fallback if background prefetch hasn't completed)
  useEffect(() => {
    if (!communityId || activeTab !== 'graph' || graphData || loadingGraph) return;
    setLoadingGraph(true);
    getCommunityGraph(communityId, 200, 500)
      .then(setGraphData)
      .catch((err) => console.error('Failed to load graph:', err))
      .finally(() => setLoadingGraph(false));
  }, [communityId, activeTab, graphData, loadingGraph]);

  // Load timeline on demand
  useEffect(() => {
    if (!communityId || activeTab !== 'timeline' || timelineEvents.length > 0) return;
    setLoadingTimeline(true);
    getCommunityTimeline(communityId, 200, 0)
      .then((res) => setTimelineEvents(res.events))
      .catch((err) => console.error('Failed to load timeline:', err))
      .finally(() => setLoadingTimeline(false));
  }, [communityId, activeTab, timelineEvents.length]);

  // ---------------------------------------------------------------------------
  // Cross-tab focus actions
  // ---------------------------------------------------------------------------

  /** Switches to Graph tab and highlights the evidence's supporting entities. */
  const handleExploreInGraph = useCallback(
    (item: EvidenceItem) => {
      setEvidenceFocus(item);
      setActiveTab('graph');
      setTimeout(() => {
        document.getElementById('community-workspace-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    },
    [setActiveTab],
  );

  /** Switches to Graph tab and focuses a specific member account node. */
  const handleFocusAccountInGraph = useCallback(
    (accountId: string) => {
      setFocusedNodeId(accountId);
      setActiveTab('graph', { focus: accountId });
      setTimeout(() => {
        document.getElementById('community-workspace-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    },
    [setActiveTab],
  );

  const handleClearFocus = useCallback(() => {
    setEvidenceFocus(null);
    setFocusedNodeId(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <LoadingState type="card" count={1} />
        <LoadingState type="table" count={6} />
      </div>
    );
  }

  if (error || !community) {
    return (
      <ErrorState
        title="Community Investigation Unavailable"
        message={error || 'The requested community cluster could not be loaded.'}
        onRetry={() => navigate('/')}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Column definitions
  // ---------------------------------------------------------------------------

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
      render: (item) => (
        <Button
          variant="secondary"
          size="sm"
          icon={Network}
          onClick={() => handleExploreInGraph(item)}
          title="Highlight affected entities in network topology"
        >
          Explore in Graph
        </Button>
      ),
    },
  ];

  const accountColumns: Column<AccountSummary>[] = [
    {
      key: 'account_id',
      header: 'Account ID',
      width: '160px',
      render: (acc) => <EntityLink type="account" id={acc.account_id} />,
    },
    {
      key: 'customer_name',
      header: 'Customer Name',
      render: (acc) => (
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {acc.customer_name}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      width: '130px',
      align: 'right',
      render: (acc) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
          ${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'account_risk_score',
      header: 'Risk Score',
      width: '110px',
      render: (acc) =>
        acc.account_risk_score !== null ? (
          <RiskScore score={Math.round(acc.account_risk_score * 100)} size="sm" />
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        ),
    },
    {
      key: 'creation_date',
      header: 'Created',
      width: '130px',
      render: (acc) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {acc.creation_date || '—'}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '240px',
      align: 'right',
      render: (acc) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={ScanSearch}
            onClick={() => handleFocusAccountInGraph(acc.account_id)}
            title="Focus this account in the Network Graph"
          >
            Graph
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => navigate(`/accounts/${acc.account_id}`)}
          >
            Inspect Profile
          </Button>
        </div>
      ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Tab definitions — exact order per spec
  // ---------------------------------------------------------------------------
  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'overview',  label: 'Overview',                                          icon: Layers    },
    { key: 'evidence',  label: `Evidence (${evidence?.items.length ?? 0})`,         icon: ScanSearch },
    { key: 'members',   label: `Members (${community.member_count.toLocaleString()})`, icon: Users  },
    { key: 'graph',     label: 'Network Graph',                                     icon: Network   },
    { key: 'timeline',  label: 'Activity Timeline',                                 icon: Clock     },
    { key: 'features',  label: 'Feature Breakdown',                                 icon: Cpu       },
  ];

  const isGraphWithFocus = activeTab === 'graph' && Boolean(evidenceFocus || focusedNodeId);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', maxWidth: '1600px', margin: '0 auto' }}>

      {/* ------------------------------------------------------------------ */}
      {/* PAGE HEADER                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ paddingBottom: '0' }}>
        <PageHeader
          title="Community Investigation"
          description={`Investigate network structure and observable evidence associated with community #${community.community_id}.`}
          breadcrumbs={
            <button
              onClick={() => navigate('/communities')}
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
              <span>Community Intelligence</span>
            </button>
          }
          badge={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge variant="neutral">COMMUNITY #{community.community_id}</Badge>
              <RiskBadge level={community.risk_level} size="md" />
            </div>
          }
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AddToInvestigationButton
                targetType="COMMUNITY"
                targetId={community.community_id.toString()}
                targetLabel={`Community #${community.community_id}`}
                riskScore={community.risk_score}
                riskLevel={community.risk_level}
                size="md"
              />
              <Button
                variant="secondary"
                size="md"
                icon={FileText}
                onClick={() => setIsSarModalOpen(true)}
              >
                Generate SAR
              </Button>
            </div>
          }
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* STICKY TAB BAR                                                      */}
      {/* ------------------------------------------------------------------ */}
      <div
        id="community-workspace-tabs"
        style={{
          position: 'sticky',
          top: '52px',   /* matches the 52px global header height */
          zIndex: 10,
          backgroundColor: 'var(--bg-page)',
          borderBottom: '1px solid var(--border)',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '2px',
            overflowX: 'auto',
            paddingBottom: '0',
          }}
        >
          {tabs.map(({ key, label, icon: Icon }) => {
            const isSelected = activeTab === key;
            const hasGraphFocus = key === 'graph' && isGraphWithFocus;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '10px 16px',
                  borderRadius: '5px 5px 0 0',
                  border: 'none',
                  borderBottom: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                  backgroundColor: isSelected ? 'var(--bg-subtle)' : 'transparent',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'color 0.12s ease, background-color 0.12s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onMouseOver={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <Icon size={14} style={{ color: isSelected ? 'var(--accent)' : 'inherit' }} />
                <span>{label}</span>
                {hasGraphFocus && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent)',
                      flexShrink: 0,
                    }}
                    title="Graph focus active"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* TAB CONTENT                                                         */}
      {/* ------------------------------------------------------------------ */}

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Investigation Context Metrics */}
          <Panel padding="md">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <Metric
                label="ML Risk Score"
                value={
                  <RiskScore
                    score={community.risk_score}
                    level={community.risk_level}
                    size="md"
                    showBar={true}
                  />
                }
                subtext="Prioritized risk tier"
              />
              <Metric
                label="Evidence Strength"
                value={`${evidence?.evidence_score ?? '—'}/100`}
                subtext={`${evidence?.evidence_count ?? 0} active triggers (${evidence?.high_count ?? 0} High)`}
                variant={evidence && evidence.evidence_score >= 70 ? 'high' : 'default'}
              />
              <Metric
                label="Member Accounts"
                value={community.member_count.toLocaleString()}
                subtext="Partition node count"
              />
              <Metric
                label="Transaction Volume"
                value={`$${community.transaction_statistics.total_transaction_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                subtext={`${community.transaction_statistics.tx_per_member.toFixed(1)} tx / account`}
              />
              <Metric
                label="Network Density"
                value={community.density.toFixed(4)}
                subtext={`${community.internal_edge_count.toLocaleString()} internal edges`}
              />
            </div>
          </Panel>

          {/* Why This Community Is Prioritized */}
          <Panel
            title="Why this community is prioritized"
            subtitle="Ensemble model prioritization corroborated by observable evidence engine rules."
            padding="lg"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              {/* Model Prioritization */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
                  Model Prioritization
                </span>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                  Assigned an ML risk score of{' '}
                  <strong style={{ color: community.risk_level === 'HIGH' ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                    {community.risk_score}/100 ({community.risk_level})
                  </strong>{' '}
                  derived from 21 graph-topological and payment-velocity features.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Top Risk Signals:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[community.top_signal_1, community.top_signal_2, community.top_signal_3]
                      .filter(Boolean)
                      .map((sig, idx) => (
                        <Badge key={idx} variant="neutral" size="sm">
                          {sig}
                        </Badge>
                      ))}
                  </div>
                </div>

                <div style={{ marginTop: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Declined Rate: </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {((community.transaction_statistics.declined_rate || 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Mean Edge Weight: </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {community.mean_edge_weight?.toFixed(2) || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Observable Evidence Engine */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '1px solid var(--border)', paddingLeft: '24px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
                  Observable Evidence Engine
                </span>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
                  Deterministic evidence analysis identified{' '}
                  <strong style={{ color: 'var(--accent)' }}>
                    {evidence?.evidence_count ?? 0} active rule triggers
                  </strong>{' '}
                  ({evidence?.high_count ?? 0} High, {evidence?.medium_count ?? 0} Medium, {evidence?.low_count ?? 0} Low).
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                  {[
                    { label: 'Shared Devices',      value: community.entity_sharing.unique_shared_devices      },
                    { label: 'Shared Instruments',  value: community.entity_sharing.unique_shared_instruments  },
                    { label: 'Shared IPs',          value: community.entity_sharing.unique_shared_ips          },
                    { label: 'Temporal Score',      value: community.temporal_statistics.temporal_compression_score.toFixed(2) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>{label}</span>
                      <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          {/* Quick action strip */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="md" icon={ScanSearch} onClick={() => setActiveTab('evidence')}>
              Review Evidence ({evidence?.evidence_count ?? 0} signals)
            </Button>
            <Button variant="secondary" size="md" icon={Network} onClick={() => setActiveTab('graph')}>
              Open Network Graph
            </Button>
          </div>

          {/* ── EVIDENCE CONVERGENCE ─────────────────────────────────────── */}
          <EvidenceConvergencePanel
            evidence={evidence}
            onSelectEvidence={handleExploreInGraph}
          />

          {/* ── FRAUD STORYLINE ──────────────────────────────────────────── */}
          <FraudStoryTimeline
            community={community}
            evidence={evidence}
            timelineEvents={timelineEvents}
            accounts={accounts}
            onSelectEvidence={handleExploreInGraph}
          />

          {/* ── HYPOTHESIS ENGINE ────────────────────────────────────────── */}
          <HypothesisEnginePanel
            community={community}
            evidence={evidence}
          />

          {/* ── RECOMMENDED NEXT ACTIONS ─────────────────────────────────── */}
          <RecommendedActionsPanel
            community={community}
            evidence={evidence}
            graphData={graphData}
            onFocusAccountInGraph={handleFocusAccountInGraph}
            onScrollToFlow={() => setActiveTab('timeline')}
          />
        </div>
      )}

      {/* ── EVIDENCE ─────────────────────────────────────────────────────── */}
      {activeTab === 'evidence' && (
        <Panel
          title={`Observable Evidence Rules (${evidence?.items.length ?? 0})`}
          subtitle="Deterministic rule evaluations linking entities via shared hardware, payment instruments, or temporal concentration."
          padding="none"
        >
          {!evidence || evidence.items.length === 0 ? (
            <EmptyState
              title="No observable evidence triggers"
              message="No deterministic evidence rules triggered for this community partition."
            />
          ) : (
            <DataTable
              columns={evidenceColumns}
              data={evidence.items}
              keyExtractor={(item) => item.evidence_id}
            />
          )}
        </Panel>
      )}

      {/* ── MEMBERS ──────────────────────────────────────────────────────── */}
      {activeTab === 'members' && (
        <Panel padding="none">
          {loadingAccounts ? (
            <div style={{ padding: '24px' }}>
              <LoadingState type="table" count={6} />
            </div>
          ) : (
            <>
              <DataTable
                columns={accountColumns}
                data={accounts}
                keyExtractor={(acc) => acc.account_id}
                emptyMessage="No member accounts found in this partition."
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
          )}
        </Panel>
      )}

      {/* ── NETWORK GRAPH ────────────────────────────────────────────────── */}
      {activeTab === 'graph' && (
        <Panel padding="none">
          {loadingGraph || !graphData ? (
            <div style={{ padding: '24px' }}>
              <LoadingState type="graph" />
            </div>
          ) : (
            <NetworkGraph
              graphData={graphData}
              height="680px"
              evidenceFocus={evidenceFocus}
              allEvidenceItems={evidence?.items ?? []}
              communityId={community.community_id}
              initialSelectedNodeId={focusedNodeId}
              onClearFocus={handleClearFocus}
            />
          )}
        </Panel>
      )}

      {/* ── ACTIVITY TIMELINE ────────────────────────────────────────────── */}
      {activeTab === 'timeline' && (
        <Panel padding="md">
          {loadingTimeline ? (
            <LoadingState type="table" count={6} />
          ) : (
            <TimelineView events={timelineEvents} evidenceFocus={evidenceFocus} />
          )}
        </Panel>
      )}

      {/* ── FEATURE BREAKDOWN ────────────────────────────────────────────── */}
      {activeTab === 'features' && (
        <FeatureBreakdown community={community} />
      )}

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
