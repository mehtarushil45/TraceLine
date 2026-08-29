import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { getCommunity, getCommunityEvidence } from '../api';
import type {
  CommunityDetailResponse,
  CommunityEvidenceResponse,
} from '../types/api';
import {
  AddToInvestigationButton,
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
import { SarExportModal } from '../components/layout/SarExportModal';

export const CommunityDetailPage: React.FC = () => {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();

  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<CommunityEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

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
      {/* A. COMMUNITY HEADER                                                */}
      {/* ------------------------------------------------------------------ */}
      <PageHeader
        title="Community Triage"
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

      {/* ------------------------------------------------------------------ */}
      {/* B. COMMUNITY SCORECARD                                             */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="md">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
          <Metric
            label="ML Risk Score"
            value={<RiskScore score={community.risk_score} level={community.risk_level} size="md" showBar />}
          />
          <Metric
            label="Evidence Strength"
            value={`${evidence?.evidence_score ?? '—'}/100`}
            variant={evidence && evidence.evidence_score >= 70 ? 'high' : 'default'}
          />
          <Metric
            label="Member Accounts"
            value={community.member_count.toLocaleString()}
          />
          <Metric
            label="Transaction Volume"
            value={`$${community.transaction_statistics.total_transaction_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
          <Metric
            label="Network Density"
            value={community.density.toFixed(4)}
          />
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* C. WHY THIS COMMUNITY IS PRIORITIZED                               */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title="Why this community is prioritized"
        subtitle="Ensemble model prioritization corroborated by observable evidence engine indicators."
        padding="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {/* Model Prioritization Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
              Model Prioritization
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>ML Risk:</span>
              <strong style={{ fontSize: '14px', color: community.risk_level === 'HIGH' ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                {community.risk_score}/100 {community.risk_level}
              </strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Top signals:</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {topSignals.length > 0 ? (
                  topSignals.map((sig, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>•</span>
                      <span>{sig}</span>
                    </div>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No specific top signals recorded</span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Declined Rate: </span>
                <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {((community.transaction_statistics.declined_rate || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Mean Edge Wt: </span>
                <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {community.mean_edge_weight?.toFixed(2) || '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Observable Evidence Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '1px solid var(--border)', paddingLeft: '24px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
              Observable Indicators
            </span>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
              Deterministic evidence analysis identified{' '}
              <strong style={{ color: 'var(--accent)' }}>
                {evidence?.evidence_count ?? 0} rule triggers
              </strong>{' '}
              ({evidence?.high_count ?? 0} High, {evidence?.medium_count ?? 0} Medium, {evidence?.low_count ?? 0} Low).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              {[
                { label: 'Shared Devices', value: community.entity_sharing.unique_shared_devices },
                { label: 'Shared Instruments', value: community.entity_sharing.unique_shared_instruments },
                { label: 'Shared IPs', value: community.entity_sharing.unique_shared_ips },
                { label: 'Temporal Score', value: community.temporal_statistics.temporal_compression_score.toFixed(2) },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                    {label}
                  </span>
                  <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* D. INVESTIGATION ENTRY (PRIMARY CTA)                               */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="lg">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>
              Ready for Investigation?
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              This community has been prioritized for deeper forensic review.
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Access full evidence convergence, interactive topology graph, account roles, transaction timeline, money movement, and hypothesis reasoning.
            </span>
          </div>

          <Button
            variant="primary"
            size="lg"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => navigate(`/forensics?community=${communityId}&view=evidence`)}
            style={{ padding: '12px 24px', fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            Open Forensic Workspace →
          </Button>
        </div>
      </Panel>

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
