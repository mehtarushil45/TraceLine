import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  ChevronRight,
  Layers,
  Network,
  Users,
} from 'lucide-react';
import { getCommunities, getSummary } from '../api';
import type { CommunitySummary, SummaryResponse } from '../types/api';
import { KpiCard } from '../components/common/KpiCard';
import { RiskBadge } from '../components/common/RiskBadge';
import { RiskScore } from '../components/common/RiskScore';
import { SignalBadge } from '../components/common/SignalBadge';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [topCommunities, setTopCommunities] = useState<CommunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, commRes] = await Promise.all([getSummary(), getCommunities()]);
      setSummary(sumRes);
      setTopCommunities(commRes.items.slice(0, 6));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to TraceLine API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <LoadingSkeleton type="card" count={4} />
        <LoadingSkeleton type="table" count={5} />
      </div>
    );
  }

  if (error || !summary) {
    return <ErrorState message={error || undefined} onRetry={loadData} />;
  }

  const highPct = ((summary.high_risk_count / summary.community_count) * 100).toFixed(1);
  const medPct = ((summary.medium_risk_count / summary.community_count) * 100).toFixed(1);
  const lowPct = ((summary.low_risk_count / summary.community_count) * 100).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
            Payment Fraud Intelligence Overview
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Explainable graph-based risk scoring and community detection over 50,000 observable payment accounts.
          </p>
        </div>

        <button
          onClick={() => navigate('/communities')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#0284c7',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Explore All 59 Communities
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Primary KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <KpiCard
          title="Observable Accounts"
          value={summary.account_count}
          subtitle="Customer and merchant accounts"
          icon={Users}
          variant="cyan"
        />
        <KpiCard
          title="Transactions"
          value={summary.transaction_count}
          subtitle="Observable network flows"
          icon={Activity}
          variant="default"
        />
        <KpiCard
          title="Graph Evidence Edges"
          value={summary.graph_edge_count}
          subtitle="Projected account relationships"
          icon={Network}
          variant="default"
        />
        <KpiCard
          title="Louvain Communities"
          value={summary.community_count}
          subtitle="Detected risk clusters"
          icon={Layers}
          variant="amber"
        />
      </div>

      {/* Risk Distribution Breakdown */}
      <div className="dash-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
              Community Risk Distribution
            </span>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
              ML Risk Tier Partitioning (N = 59)
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#ef4444' }} />
              <span style={{ color: 'var(--text-muted)' }}>HIGH ({summary.high_risk_count})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#f59e0b' }} />
              <span style={{ color: 'var(--text-muted)' }}>MEDIUM ({summary.medium_risk_count})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#10b981' }} />
              <span style={{ color: 'var(--text-muted)' }}>LOW ({summary.low_risk_count})</span>
            </div>
          </div>
        </div>

        {/* Multi-segmented Progress Bar */}
        <div
          style={{
            height: '12px',
            width: '100%',
            backgroundColor: '#1e293b',
            borderRadius: '6px',
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div style={{ width: `${highPct}%`, backgroundColor: '#ef4444', transition: 'width 0.5s' }} title={`HIGH: ${highPct}%`} />
          <div style={{ width: `${medPct}%`, backgroundColor: '#f59e0b', transition: 'width 0.5s' }} title={`MEDIUM: ${medPct}%`} />
          <div style={{ width: `${lowPct}%`, backgroundColor: '#10b981', transition: 'width 0.5s' }} title={`LOW: ${lowPct}%`} />
        </div>

        {/* Statistics Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#f87171', textTransform: 'uppercase' }}>HIGH RISK TIER (Score ≥ 60)</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span className="font-mono font-bold text-lg text-red-400">{summary.high_risk_count}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>({highPct}% of clusters)</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
              Priority queue for immediate investigator drill-down
            </span>
          </div>

          <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#fbbf24', textTransform: 'uppercase' }}>MEDIUM RISK TIER (35 ≤ Score &lt; 60)</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span className="font-mono font-bold text-lg text-amber-400">{summary.medium_risk_count}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>({medPct}% of clusters)</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
              Moderate evidence overlap; secondary monitoring queue
            </span>
          </div>

          <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4ade80', textTransform: 'uppercase' }}>LOW RISK TIER (Score &lt; 35)</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span className="font-mono font-bold text-lg text-emerald-400">{summary.low_risk_count}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>({lowPct}% of clusters)</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
              Standard organic peer activity; baseline behavior
            </span>
          </div>
        </div>
      </div>

      {/* Priority Investigation Leaderboard */}
      <div className="dash-card">
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
              Top Flagged Communities
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Ranked by explainable ML risk score and observable evidence intensity.
            </p>
          </div>

          <button
            onClick={() => navigate('/communities')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-cyan)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            View All 59 <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="sec-table">
            <thead>
              <tr>
                <th>Community</th>
                <th>Risk Score</th>
                <th>Risk Level</th>
                <th>Members</th>
                <th>Density</th>
                <th>Mean Edge Weight</th>
                <th>Primary Observable Signals</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {topCommunities.map((comm) => (
                <tr
                  key={comm.community_id}
                  onClick={() => navigate(`/communities/${comm.community_id}`)}
                  style={{
                    cursor: 'pointer',
                  }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Layers size={14} />
                      </div>
                      <span className="font-mono font-semibold" style={{ color: 'var(--text-main)' }}>
                        Community #{comm.community_id}
                      </span>
                    </div>
                  </td>
                  <td>
                    <RiskScore score={comm.risk_score} level={comm.risk_level} size="sm" />
                  </td>
                  <td>
                    <RiskBadge level={comm.risk_level} size="sm" />
                  </td>
                  <td className="font-mono text-slate-200">{comm.member_count.toLocaleString()}</td>
                  <td className="font-mono text-slate-400">{comm.density.toFixed(5)}</td>
                  <td className="font-mono text-slate-400">{comm.mean_edge_weight !== null ? comm.mean_edge_weight.toFixed(2) : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      <SignalBadge signal={comm.top_signal_1} />
                      {comm.top_signal_2 && <SignalBadge signal={comm.top_signal_2} />}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontSize: '11px',
                        color: 'var(--accent-cyan)',
                        fontWeight: 600,
                      }}
                    >
                      Investigate <ChevronRight size={13} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
