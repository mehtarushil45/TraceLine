import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Scale,
  XCircle,
} from 'lucide-react';
import type { CommunityDetailResponse, CommunityEvidenceResponse } from '../../types/api';
import { Badge } from '../common';

interface HypothesisEnginePanelProps {
  community: CommunityDetailResponse;
  evidence?: CommunityEvidenceResponse | null;
}

export const HypothesisEnginePanel: React.FC<HypothesisEnginePanelProps> = ({
  community,
}) => {
  const hasSharedHardware = community.entity_sharing.unique_shared_devices > 0 || community.entity_sharing.unique_shared_instruments > 0;
  const hasTemporalBurst = community.temporal_statistics.temporal_compression_score > 0.4;
  const hasHighDensity = community.density > 0.03;

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scale size={16} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Investigation Hypothesis Engine & Skepticism</strong>
            <Badge variant="neutral">Anti-Confirmation Bias</Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Comparing competing explanations to avoid confirmation bias. High ML risk does not establish wrongdoing.
          </p>
        </div>
      </div>

      {/* Competing Hypotheses Grid */}
      <div className="inv-hypotheses-grid">
        {/* Hypothesis A */}
        <div className="inv-hypothesis-card inv-hypothesis-card--plausible">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              HYPOTHESIS A: Coordinated Mule Network
            </strong>
            <Badge variant="high">PLAUSIBLE — HIGH SUPPORT</Badge>
          </div>

          <div className="inv-hyp-list">
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              Supporting Evidence:
            </span>
            {hasSharedHardware && (
              <div className="inv-hyp-item-pos">
                <CheckCircle2 size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Shared hardware devices ({community.entity_sharing.unique_shared_devices}) and payment instruments ({community.entity_sharing.unique_shared_instruments})</span>
              </div>
            )}
            {hasHighDensity && (
              <div className="inv-hyp-item-pos">
                <CheckCircle2 size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Elevated internal network connectivity ({(community.density * 100).toFixed(2)}% density)</span>
              </div>
            )}
            {hasTemporalBurst && (
              <div className="inv-hyp-item-pos">
                <CheckCircle2 size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Compressed temporal activity (Score: {community.temporal_statistics.temporal_compression_score.toFixed(2)})</span>
              </div>
            )}

            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', marginTop: '6px' }}>
              Contradicting / Caveats:
            </span>
            <div className="inv-hyp-item-neg">
              <XCircle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Historical activity baseline prior to observed window is unavailable in current dataset</span>
            </div>
          </div>
        </div>

        {/* Hypothesis B */}
        <div className="inv-hypothesis-card inv-hypothesis-card--lower">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              HYPOTHESIS B: Shared Corporate / Institutional Network
            </strong>
            <Badge variant="low">LOWER SUPPORT</Badge>
          </div>

          <div className="inv-hyp-list">
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              Supporting Observations:
            </span>
            <div className="inv-hyp-item-pos">
              <CheckCircle2 size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Common IP subnet environment observed ({community.entity_sharing.unique_shared_ips} shared IPs)</span>
            </div>

            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', marginTop: '6px' }}>
              Contradicting Evidence:
            </span>
            <div className="inv-hyp-item-neg">
              <XCircle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Direct peer-to-peer fund movement between accounts contradicts standard corporate gateway behavior</span>
            </div>
            <div className="inv-hyp-item-neg">
              <XCircle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Shared payment cards ({community.entity_sharing.unique_shared_instruments}) are inconsistent with distinct corporate employees</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 7: Investigator Skepticism Panel */}
      <div className="inv-skepticism-panel">
        <div className="inv-skepticism-title">
          <AlertTriangle size={15} />
          <span>Why This May Be Wrong — Contradicting & Missing Evidence</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            • <strong>Proxy / VPN Ambiguity:</strong> Shared IP address concentration ({community.entity_sharing.unique_shared_ips} unique IPs) may reflect a public VPN exit node or university proxy rather than coordinated fraud infrastructure.
          </p>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            • <strong>Merchant Popularity:</strong> Merchant temporal overlap ({community.entity_sharing.unique_shared_merchants} merchants) may occur organically if a merchant is a major regional retail or utility provider.
          </p>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            • <strong>Action Required:</strong> Verify whether transaction destinations represent legitimate retail vendors before issuing a formal Suspicious Activity Report (SAR).
          </p>
        </div>
      </div>
    </div>
  );
};
