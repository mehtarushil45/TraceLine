import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  FileText,
  Layers,
  Network,
  Users,
} from 'lucide-react';
import {
  getCommunity,
  getCommunityAccounts,
  getCommunityGraph,
  getCommunityTimeline,
} from '../api';
import type {
  AccountSummary,
  CommunityDetailResponse,
  CommunityGraphResponse,
  EvidenceItem,
  TimelineEvent,
} from '../types/api';
import { RiskBadge } from '../components/common/RiskBadge';
import { RiskScore } from '../components/common/RiskScore';
import { AddToInvestigationButton } from '../components/common/AddToInvestigationButton';
import { EvidenceIntelligencePanel } from '../components/community/EvidenceIntelligencePanel';
import { FeatureBreakdown } from '../components/community/FeatureBreakdown';
import { NetworkGraph } from '../components/graph/NetworkGraph';
import { AccountTable } from '../components/account/AccountTable';
import { TimelineView } from '../components/timeline/TimelineView';
import { Pagination } from '../components/common/Pagination';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { SarExportModal } from '../components/layout/SarExportModal';

import { updatePlaybookContext, updatePlaybookStep, getPlaybookContext } from '../utils/playbookManager';

export const CommunityDetailPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'accounts' | 'graph' | 'timeline'>('accounts');
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

  // Evidence focus — drives NetworkGraph highlighting and context banner
  const [evidenceFocus, setEvidenceFocus] = useState<EvidenceItem | null>(null);

  // Sync with playbook on load
  useEffect(() => {
    if (!communityId) return;
    const ctx = getPlaybookContext();
    if (ctx.isActive) {
      updatePlaybookContext({ communityId });
    }
  }, [communityId]);

  // Handle incoming navigation state (e.g. from AccountDetailPage "Explore in Graph")
  useEffect(() => {
    const state = location.state as { tab?: 'accounts' | 'graph' | 'timeline'; evidenceFocus?: EvidenceItem } | null;
    if (state?.tab) {
      setActiveTab(state.tab);
    }
    if (state?.evidenceFocus) {
      setEvidenceFocus(state.evidenceFocus);
      setActiveTab('graph');
      setTimeout(() => {
        document.getElementById('community-graph-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }, [location.state]);

  // Tab 1: Accounts
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsTotalPages, setAccountsTotalPages] = useState(1);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Tab 2: Graph — pre-loaded so the evidence panel can validate nodes
  const [graphData, setGraphData] = useState<CommunityGraphResponse | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  // Tab 3: Timeline
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load community detail
  useEffect(() => {
    if (!communityId) return;
    setLoading(true);
    setError(null);
    getCommunity(communityId)
      .then(setCommunity)
      .catch((err) => setError(err instanceof Error ? err.message : `Community ${communityId} not found`))
      .finally(() => setLoading(false));
  }, [communityId]);

  // Pre-load graph data in background (needed for explorable-check in evidence panel)
  useEffect(() => {
    if (!communityId || graphData) return;
    getCommunityGraph(communityId, 200, 500)
      .then(setGraphData)
      .catch(() => { /* silent — graph optional for evidence panel */ });
  }, [communityId, graphData]);

  // Load accounts when tab active
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

  // Load graph on demand (if not already loaded)
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

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  /**
   * Called when investigator clicks "Explore in Graph" on an evidence item.
   * Switches to the graph tab and sets the evidence focus.
   */
  const handleExploreInGraph = (item: EvidenceItem) => {
    setEvidenceFocus(item);
    setActiveTab('graph');
    const ctx = getPlaybookContext();
    if (ctx.isActive) {
      updatePlaybookStep(3, { evidenceId: item.evidence_id });
    }
    // Scroll graph section into view after a short tick
    setTimeout(() => {
      document.getElementById('community-graph-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const handleClearFocus = () => setEvidenceFocus(null);

  // -------------------------------------------------------------------------
  // Render guards
  // -------------------------------------------------------------------------

  if (loading) return <LoadingSkeleton type="detail" />;
  if (error || !community) return <ErrorState message={error || undefined} onRetry={() => navigate('/communities')} />;

  const isHigh = community.risk_level === 'HIGH';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>

      {/* 1. Breadcrumb + Action Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
          <button
            onClick={() => navigate('/communities')}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
          >
            <ArrowLeft size={14} />
            Communities
          </button>
          <span>/</span>
          <span className="font-mono text-slate-200">Community #{community.community_id}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsSarModalOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px',
              backgroundColor: '#162447', border: '1px solid var(--border-light)',
              borderRadius: '6px', color: 'var(--text-main)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <FileText size={13} style={{ color: 'var(--accent-cyan)' }} />
            <span>Generate SAR</span>
          </button>

          <AddToInvestigationButton
            targetType="COMMUNITY"
            targetId={community.community_id.toString()}
            targetLabel={`Community #${community.community_id}`}
            riskScore={community.risk_score}
            riskLevel={community.risk_level}
          />
        </div>
      </div>

      {/* 2. Hero HUD */}
      <div
        className="dash-card"
        style={{
          padding: '24px 28px',
          borderColor: isHigh ? 'rgba(244,63,94,0.4)' : 'var(--border)',
          background: isHigh
            ? 'linear-gradient(135deg, rgba(244,63,94,0.07) 0%, rgba(11,19,41,0.9) 100%)'
            : 'var(--bg-card)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px' }}>
          <div style={{
            padding: '13px', borderRadius: '10px',
            backgroundColor: isHigh ? 'rgba(244,63,94,0.18)' : 'rgba(51,65,85,0.28)',
            color: isHigh ? '#f43f5e' : 'var(--text-muted)',
            boxShadow: isHigh ? '0 0 18px rgba(244,63,94,0.28)' : 'none',
          }}>
            <Layers size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em', margin: 0 }}>
                Community #{community.community_id}
              </h1>
              <RiskBadge level={community.risk_level} size="lg" />
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
              Louvain Partition · {community.member_count.toLocaleString()} accounts · $
              {community.transaction_statistics.total_transaction_amount.toLocaleString(undefined, {
                minimumFractionDigits: 2, maximumFractionDigits: 2,
              })} total volume
            </p>
          </div>
        </div>

        <div style={{
          padding: '13px 20px', borderRadius: '8px',
          backgroundColor: '#030712', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '20px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ML Risk Score
            </span>
            <RiskScore score={community.risk_score} level={community.risk_level} size="lg" showSubtitle />
          </div>
        </div>
      </div>

      {/* 3. Evidence Intelligence Panel */}
      <div className="dash-card" style={{ padding: '22px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-cyan)' }}>
            Evidence Intelligence
          </span>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic' }}>
            Observable-rule analysis · Not ground-truth
          </span>
        </div>
        <EvidenceIntelligencePanel
          communityId={community.community_id}
          onExploreInGraph={handleExploreInGraph}
          graphData={graphData}
        />
      </div>

      {/* 4. Feature Breakdown */}
      <FeatureBreakdown community={community} />

      {/* 5. Investigation Workspace Tabs */}
      <div id="community-graph-section" style={{ scrollMarginTop: '20px' }}>
        {/* Tab bar */}
        <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: '4px', marginBottom: 0 }}>
          {[
            { key: 'accounts', label: `Member Accounts (${community.member_count.toLocaleString()})`, icon: Users },
            { key: 'graph', label: 'Network Graph', icon: Network },
            { key: 'timeline', label: 'Activity Timeline', icon: Clock },
          ].map(({ key, label, icon: Icon }) => {
            const isActive = activeTab === key;
            const showFocusDot = key === 'graph' && !!evidenceFocus;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key as any)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '11px 16px',
                  background: 'none', border: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  color: isActive ? '#f8fafc' : 'var(--text-muted)',
                  fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <Icon size={14} style={{ color: isActive ? 'var(--accent-cyan)' : 'inherit' }} />
                {label}
                {showFocusDot && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#22d3ee',
                    boxShadow: '0 0 4px #22d3ee',
                    flexShrink: 0,
                  }} title="Evidence focus active" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab: Accounts */}
        {activeTab === 'accounts' && (
          <div className="dash-card" style={{ marginTop: 0, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
            {loadingAccounts ? (
              <LoadingSkeleton type="table" count={6} />
            ) : (
              <>
                <AccountTable accounts={accounts} />
                <Pagination
                  currentPage={accountsPage}
                  totalPages={accountsTotalPages}
                  totalItems={accountsTotal}
                  pageSize={50}
                  onPageChange={(p) => setAccountsPage(p)}
                />
              </>
            )}
          </div>
        )}

        {/* Tab: Network Graph */}
        {activeTab === 'graph' && (
          <div style={{ marginTop: 0 }}>
            {loadingGraph || !graphData ? (
              <LoadingSkeleton type="graph" height="560px" />
            ) : (
              <NetworkGraph
                graphData={graphData}
                height="580px"
                evidenceFocus={evidenceFocus}
                onClearFocus={handleClearFocus}
              />
            )}
          </div>
        )}

        {/* Tab: Timeline */}
        {activeTab === 'timeline' && (
          <div>
            {loadingTimeline ? (
              <LoadingSkeleton type="table" count={6} />
            ) : (
              <TimelineView events={timelineEvents} evidenceFocus={evidenceFocus} />
            )}
          </div>
        )}
      </div>

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
