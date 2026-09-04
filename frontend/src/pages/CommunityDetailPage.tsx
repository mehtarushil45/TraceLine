import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Cpu,
  Eye,
  ShieldAlert,
} from 'lucide-react';
import { getCommunity, getCommunityEvidence } from '../api';
import type {
  CommunityDetailResponse,
  CommunityEvidenceResponse,
} from '../types/api';
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  Panel,
  RiskBadge,
  RiskScore,
} from '../components/common';

export const CommunityDetailPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();

  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<CommunityEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <LoadingState type="card" count={1} />
        <LoadingState type="card" count={2} />
      </div>
    );
  }

  if (error || !community) {
    return (
      <ErrorState
        title="Community Triage Unavailable"
        message={error || 'The requested community cluster could not be loaded.'}
        onRetry={() => navigate('/communities')}
      />
    );
  }

  const topSignals = [community.top_signal_1, community.top_signal_2, community.top_signal_3].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* ------------------------------------------------------------------ */}
      {/* A. COMMUNITY HEADER (TRIAGE IDENTITY ONLY - NO CASE/SAR ACTIONS)  */}
      {/* ------------------------------------------------------------------ */}
      <PageHeader
        title="Community Triage"
        description={`Executive triage brief for community #${community.community_id}. Review model risk prioritization and observable corroboration before launching the deep Forensic Workspace.`}
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
            <span>Community Directory</span>
          </button>
        }
        badge={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge variant="neutral">COMMUNITY #{community.community_id}</Badge>
            <RiskBadge level={community.risk_level} size="md" label={`${community.risk_level} PRIORITY`} />
          </div>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* B. COMMUNITY SCORECARD (WITH EXPLICIT PROVENANCE DESCRIPTIONS)     */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="md">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <Metric
              label="ML Risk Score"
              value={
                community.risk_score !== null && community.risk_score !== undefined ? (
                  <RiskScore score={community.risk_score} level={community.risk_level} size="md" showBar />
                ) : (
                  '—'
                )
              }
            />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
              Ensemble risk score (0–100)
            </span>
          </div>

          <div>
            <Metric
              label="RAW RULE EVIDENCE POINTS"
              value={evidence ? evidence.raw_evidence_score.toLocaleString() : '—'}
              variant={evidence && evidence.raw_evidence_score >= 5000 ? 'high' : 'default'}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
              Uncapped deterministic rule-weight total
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
              High × 25 · Medium × 12 · Low × 5
            </span>
          </div>

          <div>
            <Metric
              label="Community Member Accounts"
              value={community.member_count !== null && community.member_count !== undefined ? community.member_count.toLocaleString() : '—'}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
              Accounts assigned to this community partition
            </span>
          </div>

          <div>
            <Metric
              label="Observed Transaction Volume"
              value={
                community.transaction_statistics?.total_transaction_amount !== null &&
                community.transaction_statistics?.total_transaction_amount !== undefined
                  ? `$${community.transaction_statistics.total_transaction_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : '—'
              }
            />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
              Sum of transaction amounts involving community members
            </span>
          </div>

          <div>
            <Metric
              label="Internal Network Density"
              value={community.density !== null && community.density !== undefined ? community.density.toFixed(4) : '—'}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
              Fraction of possible account pairs connected by observed relationships
            </span>
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* C. DUAL-PANEL TRIAGE: MODEL PRIORITIZATION vs OBSERVABLE EVIDENCE */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '16px' }}>
        
        {/* 1. MODEL PRIORITIZATION PANEL */}
        <Panel
          title="1. Model Prioritization (ML Ensemble Pipeline)"
          subtitle="Statistical risk scoring derived from community graph features and behavioral patterns."
          padding="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Model Risk & Probability Summary */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Cpu size={18} style={{ color: 'var(--accent)' }} />
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                    ML Pipeline Output
                  </span>
                  <strong style={{ fontSize: '15px', color: community.risk_level === 'HIGH' ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                    Score: {community.risk_score}/100 ({community.risk_level} Priority)
                  </strong>
                </div>
              </div>
              <div
                style={{ textAlign: 'right' }}
                title="Raw logistic-regression model output; not a calibrated probability."
              >
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block' }}>
                  LR Model Output (not calibrated)
                </span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {community.risk_probability.toFixed(4)}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                  Raw logistic-regression model output; not a calibrated probability.
                </span>
              </div>
            </div>

            {/* Top Contributing Model Features */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
                Top Contributing Model Features
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {topSignals.length > 0 ? (
                  topSignals.map((sig, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>#{i + 1}</span>
                      <span>{sig}</span>
                    </div>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No specific top feature attributions available</span>
                )}
              </div>
            </div>

            {/* Model-Tracked Financial & Network Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                  Transaction Decline Rate
                </span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {community.transaction_statistics?.declined_rate !== null &&
                  community.transaction_statistics?.declined_rate !== undefined
                    ? `${(community.transaction_statistics.declined_rate * 100).toFixed(1)}%`
                    : '—'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
                  Proportion of member transactions with declined status
                </span>
              </div>

              <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                  Average Network Connection Weight
                </span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {community.mean_edge_weight !== null && community.mean_edge_weight !== undefined
                    ? community.mean_edge_weight.toFixed(2)
                    : '—'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
                  Mean multi-layer weight across internal graph edges
                </span>
              </div>
            </div>

          </div>
        </Panel>

        {/* 2. OBSERVABLE CORROBORATION PANEL */}
        <Panel
          title="2. Observable Corroboration (Evidence Engine)"
          subtitle="Deterministic rule evaluations across network interactions and shared infrastructure."
          padding="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Rule Trigger Evaluation Breakdown */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Eye size={18} style={{ color: '#10b981' }} />
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                    Deterministic Rule Evaluation
                  </span>
                  <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>
                    {evidence ? `${evidence.evidence_count} Rule Triggers Evaluated` : 'Evaluating rule triggers...'}
                  </strong>
                </div>
              </div>
              {evidence && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <span style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '4px', backgroundColor: 'var(--risk-high-bg)', color: 'var(--risk-high)', fontWeight: 600 }}>
                    {evidence.high_count} High
                  </span>
                  <span style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '4px', backgroundColor: 'var(--risk-med-bg)', color: 'var(--risk-med)', fontWeight: 600 }}>
                    {evidence.medium_count} Med
                  </span>
                  <span style={{ fontSize: '11px', padding: '3px 7px', borderRadius: '4px', backgroundColor: 'var(--risk-low-bg)', color: 'var(--risk-low)', fontWeight: 600 }}>
                    {evidence.low_count} Low
                  </span>
                </div>
              )}
            </div>

            {/* Observable Infrastructure Sharing Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                {
                  label: 'Shared Devices',
                  value:
                    community.entity_sharing?.unique_shared_devices !== null &&
                    community.entity_sharing?.unique_shared_devices !== undefined
                      ? community.entity_sharing.unique_shared_devices
                      : '—',
                  note: 'Hardware fingerprints linked to ≥2 accounts',
                },
                {
                  label: 'Shared Instruments',
                  value:
                    community.entity_sharing?.unique_shared_instruments !== null &&
                    community.entity_sharing?.unique_shared_instruments !== undefined
                      ? community.entity_sharing.unique_shared_instruments
                      : '—',
                  note: 'Payment cards/tokens linked to ≥2 accounts',
                },
                {
                  label: 'Shared IPs',
                  value:
                    community.entity_sharing?.unique_shared_ips !== null &&
                    community.entity_sharing?.unique_shared_ips !== undefined
                      ? community.entity_sharing.unique_shared_ips
                      : '—',
                  note: 'IP addresses observed across member accounts',
                },
                {
                  label: 'Temporal Concentration Score',
                  value:
                    community.temporal_statistics?.temporal_compression_score !== null &&
                    community.temporal_statistics?.temporal_compression_score !== undefined
                      ? community.temporal_statistics.temporal_compression_score.toFixed(2)
                      : '—',
                  note: 'Measures how concentrated observed activity is within its active time span (0–1). 0 = low concentration, 1 = high.',
                },
              ].map(({ label, value, note }) => (
                <div
                  key={label}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                    {label}
                  </span>
                  <span className="font-mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                    {value}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '3px' }}>
                    {note}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0, fontStyle: 'italic' }}>
              * Rule triggers represent deterministic pattern matches observed in payment-network telemetry; they are corroborating signals, not conclusions of wrongdoing.
            </p>
          </div>
        </Panel>

      </div>

      {/* ------------------------------------------------------------------ */}
      {/* D. INVESTIGATION ENTRY (DOMINANT PRIMARY CTA - ZERO COMPETING BTNS)*/}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="lg">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '720px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldAlert size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>
                Triage Complete // Ready for Forensic Investigation
              </span>
            </div>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Begin deep multi-layer investigation on Community #{community.community_id}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Access full evidence convergence matrix, interactive 3D topology graph, account roles, transaction timeline, money movement flow, fraud storyline, and hypothesis reasoning engine.
            </span>
          </div>

          <Button
            variant="primary"
            size="lg"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => navigate(`/forensics?community=${communityId}&view=evidence`)}
            style={{ padding: '14px 28px', fontSize: '14px', fontWeight: 800, whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.25)' }}
          >
            Open Forensic Workspace →
          </Button>
        </div>
      </Panel>
    </div>
  );
};
