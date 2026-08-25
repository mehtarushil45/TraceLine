import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  TimelineEvent,
} from '../types/api';
import { RiskBadge } from '../components/common/RiskBadge';
import { RiskScore } from '../components/common/RiskScore';
import { AddToInvestigationButton } from '../components/common/AddToInvestigationButton';
import { EvidencePanel } from '../components/community/EvidencePanel';
import { FeatureBreakdown } from '../components/community/FeatureBreakdown';
import { NetworkGraph } from '../components/graph/NetworkGraph';
import { AccountTable } from '../components/account/AccountTable';
import { TimelineView } from '../components/timeline/TimelineView';
import { Pagination } from '../components/common/Pagination';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { SarExportModal } from '../components/layout/SarExportModal';

export const CommunityDetailPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();

  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'accounts' | 'graph' | 'timeline'>('accounts');
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

  // Tab 1: Accounts State
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsTotalPages, setAccountsTotalPages] = useState(1);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Tab 2: Graph State
  const [graphData, setGraphData] = useState<CommunityGraphResponse | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  // Tab 3: Timeline State
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial Load: Community Detail
  useEffect(() => {
    if (!communityId) return;

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const comm = await getCommunity(communityId);
        setCommunity(comm);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Community ${communityId} not found`);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [communityId]);

  // Load Tab 1: Accounts
  useEffect(() => {
    if (!communityId || activeTab !== 'accounts') return;

    const fetchAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const res = await getCommunityAccounts(communityId, accountsPage, 50);
        setAccounts(res.items);
        setAccountsTotal(res.total);
        setAccountsTotalPages(res.total_pages);
      } catch (err) {
        console.error('Failed to load accounts:', err);
      } finally {
        setLoadingAccounts(false);
      }
    };

    fetchAccounts();
  }, [communityId, activeTab, accountsPage]);

  // Load Tab 2: Graph
  useEffect(() => {
    if (!communityId || activeTab !== 'graph' || graphData) return;

    const fetchGraph = async () => {
      setLoadingGraph(true);
      try {
        const res = await getCommunityGraph(communityId, 200, 500);
        setGraphData(res);
      } catch (err) {
        console.error('Failed to load graph:', err);
      } finally {
        setLoadingGraph(false);
      }
    };

    fetchGraph();
  }, [communityId, activeTab, graphData]);

  // Load Tab 3: Timeline
  useEffect(() => {
    if (!communityId || activeTab !== 'timeline' || timelineEvents.length > 0) return;

    const fetchTimeline = async () => {
      setLoadingTimeline(true);
      try {
        const res = await getCommunityTimeline(communityId, 200, 0);
        setTimelineEvents(res.events);
      } catch (err) {
        console.error('Failed to load timeline:', err);
      } finally {
        setLoadingTimeline(false);
      }
    };

    fetchTimeline();
  }, [communityId, activeTab, timelineEvents.length]);

  if (loading) {
    return <LoadingSkeleton type="detail" />;
  }

  if (error || !community) {
    return <ErrorState message={error || undefined} onRetry={() => navigate('/communities')} />;
  }

  const isHigh = community.risk_level === 'HIGH';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Breadcrumb & Action Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
          <button
            onClick={() => navigate('/communities')}
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
            Communities
          </button>
          <span>/</span>
          <span className="font-mono text-slate-200">Community #{community.community_id}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsSarModalOpen(true)}
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
              fontWeight: 600,
              cursor: 'pointer',
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

      {/* 2. Flagship Workspace Hero HUD */}
      <div
        className="dash-card"
        style={{
          padding: '26px 30px',
          borderColor: isHigh ? 'rgba(244, 63, 94, 0.4)' : 'var(--border)',
          background: isHigh
            ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(11, 19, 41, 0.9) 100%)'
            : 'var(--bg-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              backgroundColor: isHigh ? 'rgba(244, 63, 94, 0.2)' : 'rgba(51, 65, 85, 0.3)',
              color: isHigh ? '#f43f5e' : 'var(--text-muted)',
              boxShadow: isHigh ? '0 0 20px rgba(244, 63, 94, 0.3)' : 'none',
            }}
          >
            <Layers size={30} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                Community #{community.community_id}
              </h1>
              <RiskBadge level={community.risk_level} size="lg" />
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Louvain Partition Cluster · {community.member_count.toLocaleString()} member accounts · $
              {community.transaction_statistics.total_transaction_amount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              total volume
            </p>
          </div>
        </div>

        {/* Risk Score Meter HUD */}
        <div
          style={{
            padding: '14px 22px',
            borderRadius: '8px',
            backgroundColor: '#030712',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              ML Risk Score
            </span>
            <RiskScore
              score={community.risk_score}
              level={community.risk_level}
              size="lg"
              showSubtitle={true}
            />
          </div>
        </div>
      </div>

      {/* 3. "Why is this Community Flagged?" Evidence Panel */}
      <EvidencePanel community={community} />

      {/* 4. 4 Feature Families Breakdown (21 Observable Features) */}
      <FeatureBreakdown community={community} />

      {/* 5. Investigation Tabs Header */}
      <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px' }}>
        <button
          onClick={() => setActiveTab('accounts')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'accounts' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'accounts' ? '#f8fafc' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Users size={16} style={{ color: activeTab === 'accounts' ? 'var(--accent-cyan)' : 'inherit' }} />
          Member Accounts ({community.member_count.toLocaleString()})
        </button>

        <button
          onClick={() => setActiveTab('graph')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'graph' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'graph' ? '#f8fafc' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Network size={16} style={{ color: activeTab === 'graph' ? 'var(--accent-cyan)' : 'inherit' }} />
          Network Topology Graph
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'timeline' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'timeline' ? '#f8fafc' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Clock size={16} style={{ color: activeTab === 'timeline' ? 'var(--accent-cyan)' : 'inherit' }} />
          Activity Timeline
        </button>
      </div>

      {/* Tab A: Member Accounts Table */}
      {activeTab === 'accounts' && (
        <div className="dash-card">
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

      {/* Tab B: Interactive Network Graph */}
      {activeTab === 'graph' && (
        <div>
          {loadingGraph || !graphData ? (
            <LoadingSkeleton type="graph" height="560px" />
          ) : (
            <NetworkGraph graphData={graphData} height="580px" />
          )}
        </div>
      )}

      {/* Tab C: Chronological Activity Timeline */}
      {activeTab === 'timeline' && (
        <div>
          {loadingTimeline ? (
            <LoadingSkeleton type="table" count={6} />
          ) : (
            <TimelineView events={timelineEvents} />
          )}
        </div>
      )}

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
