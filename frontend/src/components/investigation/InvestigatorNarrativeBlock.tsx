import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import type { CommunityDetailResponse, CommunityEvidenceResponse } from '../../types/api';
import { Badge, Button } from '../common';

interface InvestigatorNarrativeBlockProps {
  community: CommunityDetailResponse;
  evidence: CommunityEvidenceResponse | null;
}

export const InvestigatorNarrativeBlock: React.FC<InvestigatorNarrativeBlockProps> = ({
  community,
  evidence,
}) => {
  const [copied, setCopied] = useState(false);

  const narrativeText = `OBSERVATION:
Community partition #${community.community_id} comprises ${community.member_count} member accounts with ${community.internal_edge_count} internal connections (network density ${(community.density * 100).toFixed(2)}%) and $${community.transaction_statistics.total_transaction_amount.toLocaleString()} in observed payment volume.

TRIGGER:
The partition was prioritized by an ensemble ML risk score of ${community.risk_score}/100 (${community.risk_level}) and corroborated by ${evidence?.evidence_count ?? 0} active deterministic evidence rules (${evidence?.high_count ?? 0} High severity).

RELATIONSHIP INTELLIGENCE:
Analysis detected ${community.entity_sharing.unique_shared_devices} shared hardware devices, ${community.entity_sharing.unique_shared_ips} shared IP addresses, and ${community.entity_sharing.unique_shared_instruments} shared payment instruments across member accounts.

TEMPORAL DYNAMICS:
Transactions exhibited elevated temporal concentration with a compression score of ${community.temporal_statistics.temporal_compression_score.toFixed(2)} across ${community.temporal_statistics.unique_active_hours} active transaction hours.

ASSESSMENT:
The convergence of shared infrastructure identifiers and compressed transaction timing is consistent with a coordinated account network. However, baseline historical activity prior to the observed window remains unconfirmed.

RECOMMENDATION:
1. Review primary hub accounts for authorized corporate usage vs unauthorized proxy consolidation.
2. Verify pass-through fund velocity across downstream merchant endpoints.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(narrativeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Case-Ready Investigator Narrative</strong>
            <Badge variant="accent">Deterministic Synthesis</Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Structured, factual case summary constructed from verified evidence for SAR filing and management review.
          </p>
        </div>

        <Button variant="secondary" size="sm" icon={copied ? CheckCircle2 : Copy} onClick={handleCopy}>
          {copied ? 'Copied Narrative' : 'Copy Text'}
        </Button>
      </div>

      <div style={{ padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', lineHeight: 1.6 }}>
        <div>
          <span className="inv-narrative-tag">OBSERVATION</span>
          <span style={{ color: 'var(--text-primary)' }}>
            Community partition #{community.community_id} comprises <strong>{community.member_count} member accounts</strong> with {community.internal_edge_count} internal connections (network density {(community.density * 100).toFixed(2)}%) and <strong>${community.transaction_statistics.total_transaction_amount.toLocaleString()}</strong> in observed payment volume.
          </span>
        </div>

        <div>
          <span className="inv-narrative-tag">TRIGGER</span>
          <span style={{ color: 'var(--text-primary)' }}>
            The partition was prioritized by an ensemble ML risk score of <strong>{community.risk_score}/100 ({community.risk_level})</strong> and corroborated by <strong>{evidence?.evidence_count ?? 0} active deterministic evidence rules</strong> ({evidence?.high_count ?? 0} High severity).
          </span>
        </div>

        <div>
          <span className="inv-narrative-tag">RELATIONSHIPS</span>
          <span style={{ color: 'var(--text-primary)' }}>
            Analysis detected <strong>{community.entity_sharing.unique_shared_devices} shared hardware devices</strong>, {community.entity_sharing.unique_shared_ips} shared IP addresses, and {community.entity_sharing.unique_shared_instruments} shared payment instruments across member accounts.
          </span>
        </div>

        <div>
          <span className="inv-narrative-tag">TEMPORAL DYNAMICS</span>
          <span style={{ color: 'var(--text-primary)' }}>
            Transactions exhibited elevated temporal concentration with a compression score of <strong>{community.temporal_statistics.temporal_compression_score.toFixed(2)}</strong> across {community.temporal_statistics.unique_active_hours} active transaction hours.
          </span>
        </div>

        <div>
          <span className="inv-narrative-tag">ASSESSMENT</span>
          <span style={{ color: 'var(--text-primary)' }}>
            The convergence of shared infrastructure identifiers and compressed transaction timing is consistent with a coordinated account network. However, baseline historical activity prior to the observed window remains unconfirmed.
          </span>
        </div>
      </div>
    </div>
  );
};
