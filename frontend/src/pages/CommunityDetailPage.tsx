import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Cpu,
  FileText,
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

export const CommunityDetailPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<CommunityEvidenceResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'accounts' | 'graph' | 'timeline' | 'features'>('accounts');
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

  // Evidence focus & selected node — drives NetworkGraph node highlighting
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

  // Handle incoming navigation state (e.g. from AccountDetailPage "Explore in Graph")
  useEffect(() => {
    const state = location.state as { tab?: 'accounts' | 'graph' | 'timeline' | 'features'; evidenceFocus?: EvidenceItem; accountId?: string } | null;
    if (state?.tab) {
      setActiveTab(state.tab);
    }
    if (state?.evidenceFocus) {
      setEvidenceFocus(state.evidenceFocus);
      setActiveTab('graph');
      setTimeout(() => {
        document.getElementById('community-workspace-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
    if (state?.accountId) {
      setFocusedNodeId(state.accountId);
      setActiveTab('graph');
    }
  }, [location.state]);

  // Load core community and observable evidence
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

  // Pre-load graph data in background
  useEffect(() => {
    if (!communityId || graphData) return;
    getCommunityGraph(communityId, 200, 500)
      .then(setGraphData)
      .catch(() => {
        /* Graph preloading optional */
      });
  }, [communityId, graphData]);

  // Load accounts when on accounts tab or page changes
  useEffect(() => {
    if (!communityId || activeTab !== 'accounts') return;
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

  // Load graph on demand
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

  /**
   * Explores an evidence item in the Cytoscape graph view.
   */
  const handleExploreInGraph = useCallback((item: EvidenceItem) => {
    setEvidenceFocus(item);
    setActiveTab('graph');
    setTimeout(() => {
      document.getElementById('community-workspace-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  /**
   * Focuses on a specific member account inside the graph.
   */
  const handleFocusAccountInGraph = useCallback((accountId: string) => {
    setFocusedNodeId(accountId);
    setActiveTab('graph');
    setTimeout(() => {
      document.getElementById('community-workspace-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }, []);

  const handleClearFocus = useCallback(() => {
    setEvidenceFocus(null);
    setFocusedNodeId(null);
  }, []);

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

  // Observable Evidence Table Columns
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

  // Member Accounts Table Columns
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
      render: (acc) => (
        acc.account_risk_score !== null ? (
          <RiskScore score={Math.round(acc.account_risk_score * 100)} size="sm" />
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        )
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. PAGE HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <PageHeader
        title="Community Investigation"
        description={`Investigate network structure and observable evidence associated with community #${community.community_id}.`}
        breadcrumbs={
          <button
            onClick={() => navigate('/')}
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
            <span>Back to Risk Queue</span>
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

      {/* ------------------------------------------------------------------ */}
      {/* 2. INVESTIGATION CONTEXT METRICS                                  */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* 3. "WHY THIS COMMUNITY IS PRIORITIZED" SECTION                    */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title="Why this community is prioritized"
        subtitle="Ensemble model prioritization corroborated by observable evidence engine rules."
        padding="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {/* Model Prioritization Analysis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
              Model Prioritization
            </span>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
              Assigned an ML risk score of <strong style={{ color: community.risk_level === 'HIGH' ? 'var(--risk-high)' : 'var(--text-primary)' }}>{community.risk_score}/100 ({community.risk_level})</strong> derived from 21 graph-topological and payment-velocity features.
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

          {/* Observable Evidence Engine Analysis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '1px solid var(--border)', paddingLeft: '24px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
              Observable Evidence Engine
            </span>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
              Deterministic evidence analysis identified <strong style={{ color: 'var(--accent)' }}>{evidence?.evidence_count ?? 0} active rule triggers</strong> ({evidence?.high_count ?? 0} High, {evidence?.medium_count ?? 0} Medium, {evidence?.low_count ?? 0} Low).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
              <div style={{ padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Shared Devices</span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {community.entity_sharing.unique_shared_devices}
                </span>
              </div>
              <div style={{ padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Shared Instruments</span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {community.entity_sharing.unique_shared_instruments}
                </span>
              </div>
              <div style={{ padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Shared IPs</span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {community.entity_sharing.unique_shared_ips}
                </span>
              </div>
              <div style={{ padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Temporal Score</span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {community.temporal_statistics.temporal_compression_score.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 4. OBSERVABLE EVIDENCE DETAIL TABLE                                */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* 5. INVESTIGATION WORKSPACE TABS                                   */}
      {/* ------------------------------------------------------------------ */}
      <div id="community-workspace-section" style={{ scrollMarginTop: '20px' }}>
        {/* Tab Controls Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '2px',
            marginBottom: '16px',
          }}
        >
          {[
            { key: 'accounts', label: `Member Accounts (${community.member_count.toLocaleString()})`, icon: Users },
            { key: 'graph', label: 'Network Graph', icon: Network },
            { key: 'timeline', label: 'Activity Timeline', icon: Clock },
            { key: 'features', label: 'Feature Breakdown (21)', icon: Cpu },
          ].map(({ key, label, icon: Icon }) => {
            const isSelected = activeTab === key;
            const isGraphWithFocus = key === 'graph' && Boolean(evidenceFocus || focusedNodeId);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '9px 16px',
                  borderRadius: '5px 5px 0 0',
                  border: 'none',
                  borderBottom: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                  backgroundColor: isSelected ? 'var(--bg-subtle)' : 'transparent',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <Icon size={14} style={{ color: isSelected ? 'var(--accent)' : 'inherit' }} />
                <span>{label}</span>
                {isGraphWithFocus && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent)',
                    }}
                    title="Graph focus active"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content: Member Accounts */}
        {activeTab === 'accounts' && (
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

        {/* Tab Content: Network Graph */}
        {activeTab === 'graph' && (
          <Panel padding="none">
            {loadingGraph || !graphData ? (
              <div style={{ padding: '24px' }}>
                <LoadingState type="graph" />
              </div>
            ) : (
              <NetworkGraph
                graphData={graphData}
                height="640px"
                evidenceFocus={evidenceFocus}
                allEvidenceItems={evidence?.items ?? []}
                communityId={community.community_id}
                initialSelectedNodeId={focusedNodeId}
                onClearFocus={handleClearFocus}
              />
            )}
          </Panel>
        )}

        {/* Tab Content: Activity Timeline */}
        {activeTab === 'timeline' && (
          <Panel padding="md">
            {loadingTimeline ? (
              <LoadingState type="table" count={6} />
            ) : (
              <TimelineView events={timelineEvents} evidenceFocus={evidenceFocus} />
            )}
          </Panel>
        )}

        {/* Tab Content: Feature Breakdown */}
        {activeTab === 'features' && (
          <FeatureBreakdown community={community} />
        )}
      </div>

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
