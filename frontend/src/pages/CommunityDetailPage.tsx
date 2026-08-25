import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
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
import { SignalBadge } from '../components/common/SignalBadge';
import { FeatureBreakdown } from '../components/community/FeatureBreakdown';
import { NetworkGraph } from '../components/graph/NetworkGraph';
import { AccountTable } from '../components/account/AccountTable';
import { TimelineView } from '../components/timeline/TimelineView';
import { Pagination } from '../components/common/Pagination';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';

export const CommunityDetailPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();

  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'accounts' | 'graph' | 'timeline'>('accounts');

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
      {/* Breadcrumb & Navigation */}
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

      {/* Main Workspace Header */}
      <div
        className="dash-card"
        style={{
          padding: '24px',
          borderColor: isHigh ? 'rgba(239, 68, 68, 0.4)' : 'var(--border)',
          backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.04)' : 'var(--bg-card)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.15)' : 'rgba(51, 65, 85, 0.3)',
              color: isHigh ? '#ef4444' : 'var(--text-muted)',
            }}
          >
            <Layers size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                Community #{community.community_id}
              </h1>
              <RiskBadge level={community.risk_level} size="lg" />
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Louvain Cluster · {community.member_count.toLocaleString()} member accounts · $
              {community.transaction_statistics.total_transaction_amount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              total volume
            </p>
          </div>
        </div>

        {/* Risk Score Meter */}
        <div
          style={{
            padding: '12px 20px',
            borderRadius: '6px',
            backgroundColor: '#080c14',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Risk Score
            </span>
            <RiskScore
              score={community.risk_score}
              probability={community.risk_probability}
              level={community.risk_level}
              size="lg"
            />
          </div>
        </div>
      </div>

      {/* Why is this Community Flagged? */}
      <div
        className="dash-card"
        style={{
          padding: '18px 20px',
          borderLeft: `4px solid ${isHigh ? '#ef4444' : '#f59e0b'}`,
          backgroundColor: '#0b1120',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} style={{ color: isHigh ? '#ef4444' : '#f59e0b' }} />
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-main)' }}>
            Why is this community flagged?
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
          The machine learning risk baseline identified strong observable anomalies in this cluster’s network structure and transaction patterns:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
          <SignalBadge signal={community.top_signal_1} />
          {community.top_signal_2 && <SignalBadge signal={community.top_signal_2} />}
          {community.top_signal_3 && <SignalBadge signal={community.top_signal_3} />}
        </div>
      </div>

      {/* 4 Feature Families Breakdown */}
      <FeatureBreakdown community={community} />

      {/* Investigation Tabs Header */}
      <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px' }}>
        <button
          onClick={() => setActiveTab('accounts')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'accounts' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'accounts' ? 'var(--text-main)' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Users size={16} />
          Member Accounts ({community.member_count})
        </button>

        <button
          onClick={() => setActiveTab('graph')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'graph' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'graph' ? 'var(--text-main)' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Network size={16} />
          Network Topology Graph
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'timeline' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'timeline' ? 'var(--text-main)' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Clock size={16} />
          Activity Timeline
        </button>
      </div>

      {/* Tab 1: Member Accounts Table */}
      {activeTab === 'accounts' && (
        <div className="dash-card">
          {loadingAccounts ? (
            <LoadingSkeleton type="table" count={5} />
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

      {/* Tab 2: Interactive Network Graph */}
      {activeTab === 'graph' && (
        <div>
          {loadingGraph || !graphData ? (
            <LoadingSkeleton type="graph" height="520px" />
          ) : (
            <NetworkGraph graphData={graphData} height="560px" />
          )}
        </div>
      )}

      {/* Tab 3: Chronological Activity Timeline */}
      {activeTab === 'timeline' && (
        <div>
          {loadingTimeline ? (
            <LoadingSkeleton type="table" count={6} />
          ) : (
            <TimelineView events={timelineEvents} />
          )}
        </div>
      )}
    </div>
  );
};
