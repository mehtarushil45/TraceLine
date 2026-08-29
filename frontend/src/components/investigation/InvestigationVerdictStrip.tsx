import React from 'react';
import {
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import type { CommunityDetailResponse, CommunityEvidenceResponse } from '../../types/api';
import { Badge, RiskScore } from '../common';

interface InvestigationVerdictStripProps {
  community: CommunityDetailResponse | null;
  evidence: CommunityEvidenceResponse | null;
  signalFamiliesCount: number;
  skepticismCount: number;
  onScrollToTimeline?: () => void;
  onScrollToActions?: () => void;
}

export const InvestigationVerdictStrip: React.FC<InvestigationVerdictStripProps> = ({
  community,
  evidence,
  signalFamiliesCount,
  skepticismCount,
  onScrollToTimeline,
  onScrollToActions,
}) => {
  if (!community) return null;

  return (
    <div className="inv-verdict-strip">
      {/* Top Header Row */}
      <div className="inv-verdict-top">
        <div className="inv-verdict-title-group">
          <ShieldAlert size={16} style={{ color: 'var(--accent)' }} />
          <span className="inv-verdict-title">Investigation Assessment & Verdict</span>
          <Badge variant="neutral">Observable Evidence vs Model Inference Separated</Badge>
        </div>

        <div className="inv-verdict-metrics">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>
              ML Risk:
            </span>
            <RiskScore score={community.risk_score} level={community.risk_level} size="sm" showBar />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>
              Evidence Strength:
            </span>
            <strong className="font-mono" style={{ color: evidence && evidence.evidence_score >= 70 ? 'var(--accent)' : 'var(--text-primary)', fontSize: '13px' }}>
              {evidence ? `${evidence.evidence_score}/100` : '—'}
            </strong>
          </div>
        </div>
      </div>

      {/* Structured Verdict Grid */}
      <div className="inv-verdict-grid">
        <div className="inv-verdict-card">
          <span className="inv-verdict-card-label">Primary Working Hypothesis</span>
          <span className="inv-verdict-card-val">
            <strong>Coordinated Account Network</strong> with elevated internal density ({(community.density * 100).toFixed(2)}%) and shared hardware infrastructure.
          </span>
        </div>

        <div className="inv-verdict-card" style={{ cursor: 'pointer' }} onClick={onScrollToTimeline}>
          <span className="inv-verdict-card-label">Evidence Convergence</span>
          <span className="inv-verdict-card-val" style={{ color: 'var(--accent)' }}>
            <strong>{signalFamiliesCount} Independent Signal Families</strong> ({evidence?.evidence_count ?? 0} total active rule triggers, {evidence?.high_count ?? 0} High).
          </span>
        </div>

        <div className="inv-verdict-card">
          <span className="inv-verdict-card-label">Contradicting / Validation Points</span>
          <span className="inv-verdict-card-val" style={{ color: 'var(--risk-med)' }}>
            <strong>{skepticismCount} Alternative Explanations</strong> detected (e.g. corporate gateway overlap, unconfirmed pass-through timing).
          </span>
        </div>

        <div className="inv-verdict-card" style={{ cursor: 'pointer' }} onClick={onScrollToActions}>
          <span className="inv-verdict-card-label">Recommended Next Step</span>
          <span className="inv-verdict-card-val" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#86efac' }}>
            <span>Inspect Money Flow Chain</span>
            <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </div>
  );
};
