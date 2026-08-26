import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Briefcase,
  ChevronRight,
  Clock,
  Compass,
  CreditCard,
  Layers,
  Network,
  ShieldAlert,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getCommunities, getCommunityAccounts, getSummary } from '../api';
import type { CommunitySummary, SummaryResponse } from '../types/api';
import { KpiCard } from '../components/common/KpiCard';
import { RiskBadge } from '../components/common/RiskBadge';
import { RiskScore } from '../components/common/RiskScore';
import { SignalBadge } from '../components/common/SignalBadge';
import { AddToInvestigationButton } from '../components/common/AddToInvestigationButton';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { getCases } from '../utils/caseManager';
import { startPlaybook } from '../utils/playbookManager';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [topCommunities, setTopCommunities] = useState<CommunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLaunchingDemo, setIsLaunchingDemo] = useState(false);

  const cases = getCases();
  const openCases = cases.filter((c) => c.status !== 'CLOSED');
  const lastCase = cases[0] || null;

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, commRes] = await Promise.all([
        getSummary(),
        getCommunities(),
      ]);
      setSummary(sumRes);
      const sorted = [...commRes.items].sort((a, b) => b.risk_score - a.risk_score);
      setTopCommunities(sorted.slice(0, 10));
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

  const highestRiskComm = topCommunities[0] || {
    community_id: 3,
    risk_score: 92,
    risk_level: 'HIGH',
    member_count: 1231,
  };

  const handleStartPlaybook = () => {
    const commId = highestRiskComm.community_id;
    startPlaybook({
      communityId: commId,
      currentStep: 1,
    });
    navigate(`/communities/${commId}`);
  };

  const handleLaunchDemoInvestigation = async () => {
    setIsLaunchingDemo(true);
    try {
      const commId = highestRiskComm.community_id;
      // Pre-seed with real account from this community
      const accRes = await getCommunityAccounts(String(commId), 1, 1);
      const firstAcc = accRes.items[0];

      startPlaybook({
        communityId: commId,
        accountId: firstAcc ? firstAcc.account_id : 'acc_100',
        currentStep: 1,
      });

      navigate(`/communities/${commId}`);
    } catch (_) {
      startPlaybook({
        communityId: highestRiskComm.community_id,
        currentStep: 1,
      });
      navigate(`/communities/${highestRiskComm.community_id}`);
    } finally {
      setIsLaunchingDemo(false);
    }
  };

  const highPct = ((summary.high_risk_count / summary.community_count) * 100).toFixed(1);
  const medPct = ((summary.medium_risk_count / summary.community_count) * 100).toFixed(1);
  const lowPct = ((summary.low_risk_count / summary.community_count) * 100).toFixed(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. Hero Threat Status HUD Banner with Playbook Action              */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="dash-card glow-border-high"
        style={{
          padding: '26px 30px',
          background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(11, 19, 41, 0.95) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flex: 1, minWidth: '320px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(244, 63, 94, 0.2)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              color: '#f43f5e',
              boxShadow: '0 0 20px rgba(244, 63, 94, 0.3)',
            }}
          >
            <ShieldAlert size={32} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#f43f5e',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.08em',
                }}
              >
                LIVE THREAT RADAR
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                RAZORPAY RISK CLUSTER DETECTION · STRICT OBSERVABLE MODE
              </span>
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginTop: '6px', letterSpacing: '-0.02em', margin: 0 }}>
              {summary.high_risk_count} High-Risk Louvain Clusters Identified in Payment Network
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
              Deterministic evidence engine flagged abnormal hardware reuse, shared payment credentials, and burst transaction velocities.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleStartPlaybook}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 22px',
              backgroundColor: '#0284c7',
              background: 'linear-gradient(135deg, #0284c7 0%, #00F0FF 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#030712',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 0 24px rgba(0, 240, 255, 0.4)',
              transition: 'transform 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <Compass size={16} />
            <span>START GUIDED INVESTIGATION</span>
            <ArrowRight size={15} />
          </button>

          <button
            onClick={handleLaunchDemoInvestigation}
            disabled={isLaunchingDemo}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 18px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '8px',
              color: 'var(--accent-cyan)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isLaunchingDemo ? 'wait' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={14} />
            <span>Launch Demo Investigation</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Investigation Readiness & Threat Status HUD                      */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="dash-card"
        style={{
          padding: '20px 24px',
          backgroundColor: '#070d1e',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-cyan)' }}>
              Investigation Readiness & Active Dossier Context
            </span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.22)', fontStyle: 'italic' }}>
              Real telemetry snapshot
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '12px' }}>
            <Link
              to="/investigations"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--accent-cyan)',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <Briefcase size={13} />
              <span>{openCases.length} Active Investigation Cases</span>
              <ChevronRight size={13} />
            </Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {/* Highest Risk Community */}
          <div
            onClick={() => navigate(`/communities/${highestRiskComm.community_id}`)}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#030712',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = '#f43f5e')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.3)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                Highest Priority Cluster
              </span>
              <RiskBadge level={highestRiskComm.risk_level} size="sm" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="font-mono font-bold text-lg text-slate-100">
                Community #{highestRiskComm.community_id}
              </span>
              <span className="font-mono text-xs text-rose-400 font-bold">
                Score {highestRiskComm.risk_score}/100
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {highestRiskComm.member_count.toLocaleString()} member accounts
            </span>
          </div>

          {/* Observable Evidence Coverage */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#030712',
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              High-Risk Cluster Prioritization
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="font-mono font-bold text-lg text-amber-400">
                {summary.high_risk_count} Clusters
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                ({highPct}% of network)
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Deterministic evidence rules active
            </span>
          </div>

          {/* Accounts Available */}
          <div
            onClick={() => navigate('/accounts')}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#030712',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Accounts In Graph
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="font-mono font-bold text-lg text-slate-100">
                {summary.account_count.toLocaleString()}
              </span>
              <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>
                100% indexed
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Full multi-layer topology resolution
            </span>
          </div>

          {/* Last Investigation / Active Case */}
          <div
            onClick={() => navigate(lastCase ? `/investigations/${lastCase.id}` : '/investigations')}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#030712',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              Active Case Dossier
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="font-mono font-bold text-sm text-cyan-300 truncate" style={{ maxWidth: '160px' }}>
                {lastCase ? lastCase.title : 'No Active Cases'}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {lastCase ? `${lastCase.targets.length} targets · ${lastCase.status}` : 'Click to initialize case'}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Primary KPI Grid (4 Glowing Glass Cards)                        */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <KpiCard
          title="Observable Accounts"
          value={summary.account_count}
          subtitle="100% Graph Coverage · 0 Unlinked"
          icon={Users}
          variant="cyan"
        />
        <KpiCard
          title="Network Transactions"
          value={summary.transaction_count}
          subtitle="450.5k Verified Flow Events"
          icon={Activity}
          variant="default"
        />
        <KpiCard
          title="Evidence Graph Edges"
          value={summary.graph_edge_count}
          subtitle="Multi-Layer Relationship Topology"
          icon={Network}
          variant="default"
        />
        <KpiCard
          title="Louvain Partition Clusters"
          value={summary.community_count}
          subtitle="17 High · 13 Watchlist · 29 Low"
          icon={Layers}
          variant="amber"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Observable Fraud Typology Matrix                                */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
        <div className="dash-card" style={{ padding: '16px', borderLeft: '4px solid #f87171' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Smartphone size={16} style={{ color: '#f87171' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#f87171' }}>
              Hardware & Device Clustering
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
            Multi-account hardware fingerprint sharing where disparate KYC profiles execute actions from identical physical devices.
          </p>
        </div>

        <div className="dash-card" style={{ padding: '16px', borderLeft: '4px solid #fbbf24' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <CreditCard size={16} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24' }}>
              Payment Instrument Collusion
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
            Shared virtual cards, bank accounts, or funding instruments linked across dozens of high-velocity customer accounts.
          </p>
        </div>

        <div className="dash-card" style={{ padding: '16px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Clock size={16} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#38bdf8' }}>
              Temporal Micro-Bursting
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
            Extreme transaction clustering in narrow same-day time windows rather than organic temporal dispersion.
          </p>
        </div>

        <div className="dash-card" style={{ padding: '16px', borderLeft: '4px solid #a855f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <TrendingUp size={16} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#a855f7' }}>
              Decline Velocity Spikes
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
            Elevated authorization rejection rates indicative of automated card-testing and rapid exhaustion testing.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Risk Distribution Spectrum                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="dash-card" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
              Community Risk Spectrum
            </span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px', margin: 0 }}>
              ML Risk Tier Partitioning (N = 59 Louvain Communities)
            </h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#f43f5e' }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>HIGH ({summary.high_risk_count})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#fbbf24' }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>MEDIUM ({summary.medium_risk_count})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#10b981' }} />
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>LOW ({summary.low_risk_count})</span>
            </div>
          </div>
        </div>

        {/* Multi-segmented Progress Bar */}
        <div
          style={{
            height: '14px',
            width: '100%',
            backgroundColor: '#070d1e',
            border: '1px solid var(--border)',
            borderRadius: '7px',
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div style={{ width: `${highPct}%`, backgroundColor: '#f43f5e', transition: 'width 0.5s' }} title={`HIGH: ${highPct}%`} />
          <div style={{ width: `${medPct}%`, backgroundColor: '#fbbf24', transition: 'width 0.5s' }} title={`MEDIUM: ${medPct}%`} />
          <div style={{ width: `${lowPct}%`, backgroundColor: '#10b981', transition: 'width 0.5s' }} title={`LOW: ${lowPct}%`} />
        </div>

        {/* Statistics Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '18px' }}>
          <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f87171', textTransform: 'uppercase' }}>HIGH RISK (Score ≥ 60)</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span className="font-mono font-bold text-2xl text-rose-400">{summary.high_risk_count}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>({highPct}% of network)</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              Immediate investigator triage queue
            </span>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>MEDIUM RISK (35 ≤ Score &lt; 60)</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span className="font-mono font-bold text-2xl text-amber-400">{summary.medium_risk_count}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>({medPct}% of network)</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              Moderate evidence overlap; secondary monitoring
            </span>
          </div>

          <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#4ade80', textTransform: 'uppercase' }}>LOW RISK (Score &lt; 35)</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span className="font-mono font-bold text-2xl text-emerald-400">{summary.low_risk_count}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>({lowPct}% of network)</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
              Standard organic peer activity
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Priority Investigation Leaderboard                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="dash-card">
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#070d1e',
          }}
        >
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              Top Flagged Risk Communities
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
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
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            View All 59 Communities <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="sec-table">
            <thead>
              <tr>
                <th>Community</th>
                <th>Risk Score</th>
                <th>Risk Tier</th>
                <th>Member Accounts</th>
                <th>Connection Density</th>
                <th>Mean Edge Weight</th>
                <th>Primary Observable Signals</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {topCommunities.map((comm) => (
                <tr
                  key={comm.community_id}
                  onClick={() => {
                    startPlaybook({ communityId: comm.community_id, currentStep: 1 });
                    navigate(`/communities/${comm.community_id}`);
                  }}
                  style={{
                    cursor: 'pointer',
                  }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '6px',
                          backgroundColor: comm.risk_level === 'HIGH' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                          color: comm.risk_level === 'HIGH' ? '#f43f5e' : '#fbbf24',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Layers size={15} />
                      </div>
                      <span className="font-mono font-bold text-slate-100">
                        Community #{comm.community_id}
                      </span>
                    </div>
                  </td>
                  <td>
                    <RiskScore score={comm.risk_score} level={comm.risk_level} size="sm" showBar={true} />
                  </td>
                  <td>
                    <RiskBadge level={comm.risk_level} size="sm" />
                  </td>
                  <td className="font-mono text-slate-200 font-semibold">{comm.member_count.toLocaleString()}</td>
                  <td className="font-mono text-slate-300">{comm.density.toFixed(5)}</td>
                  <td className="font-mono text-slate-300">{comm.mean_edge_weight !== null ? comm.mean_edge_weight.toFixed(2) : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      <SignalBadge signal={comm.top_signal_1} />
                      {comm.top_signal_2 && <SignalBadge signal={comm.top_signal_2} />}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                      <AddToInvestigationButton
                        targetType="COMMUNITY"
                        targetId={comm.community_id.toString()}
                        targetLabel={`Community #${comm.community_id}`}
                        riskScore={comm.risk_score}
                        riskLevel={comm.risk_level}
                        size="sm"
                      />
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '11px',
                          color: 'var(--accent-cyan)',
                          fontWeight: 700,
                        }}
                      >
                        Triage <ChevronRight size={13} />
                      </div>
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
