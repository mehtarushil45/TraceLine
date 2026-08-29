import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CreditCard,
  Eye,
  Layers,
  Network,
  Server,
  Smartphone,
  Zap,
} from 'lucide-react';
import type { CommunityEvidenceResponse, EvidenceItem } from '../../types/api';
import { Badge, Button, RiskBadge } from '../common';

interface EvidenceConvergencePanelProps {
  evidence: CommunityEvidenceResponse | null;
  onSelectEvidence: (item: EvidenceItem) => void;
}

interface SignalFamily {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  items: EvidenceItem[];
}

export const EvidenceConvergencePanel: React.FC<EvidenceConvergencePanelProps> = ({
  evidence,
  onSelectEvidence,
}) => {
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);

  const items = evidence?.items || [];

  // Group evidence items into canonical independent signal families
  const families: SignalFamily[] = [
    {
      id: 'topology',
      name: 'Network Topology & Hubs',
      icon: Network,
      color: '#38bdf8',
      items: items.filter((i) => ['HUB_ACCOUNT', 'HIGH_EVIDENCE_DENSITY', 'MULTI_LAYER_EVIDENCE'].includes(i.type)),
    },
    {
      id: 'device',
      name: 'Device & Hardware Fingerprints',
      icon: Smartphone,
      color: '#fb7185',
      items: items.filter((i) => i.type === 'DEVICE_REUSE'),
    },
    {
      id: 'ip',
      name: 'IP & Subnet Environment',
      icon: Server,
      color: '#60a5fa',
      items: items.filter((i) => i.type === 'IP_CONCENTRATION'),
    },
    {
      id: 'instruments',
      name: 'Payment Instrument Concentration',
      icon: CreditCard,
      color: '#fbbf24',
      items: items.filter((i) => i.type === 'SHARED_INSTRUMENT_CONCENTRATION'),
    },
    {
      id: 'merchant',
      name: 'Merchant Temporal Overlap',
      icon: Layers,
      color: '#34d399',
      items: items.filter((i) => i.type === 'MERCHANT_TEMPORAL_OVERLAP'),
    },
    {
      id: 'temporal',
      name: 'Temporal Burst & Velocity',
      icon: Zap,
      color: '#facc15',
      items: items.filter((i) => ['TEMPORAL_BURST', 'RAPID_INTERACTION'].includes(i.type)),
    },
  ].filter((f) => f.items.length > 0);

  const maxCount = Math.max(1, ...families.map((f) => f.items.length));

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Evidence Convergence Analysis</strong>
            <Badge variant="accent">{families.length} Signal Families Converging</Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Multiple independent evidence families corroborate the investigation hypothesis rather than relying on a single signal.
          </p>
        </div>
      </div>

      {/* Signal Families Grid */}
      <div className="inv-convergence-grid">
        {families.map((fam) => {
          const FamIcon = fam.icon;
          const isSelected = selectedFamilyId === fam.id;
          const percentage = Math.round((fam.items.length / maxCount) * 100);

          return (
            <div
              key={fam.id}
              className="inv-family-card"
              style={{ borderColor: isSelected ? 'var(--accent)' : 'var(--border)' }}
              onClick={() => setSelectedFamilyId(isSelected ? null : fam.id)}
            >
              <div className="inv-family-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FamIcon size={14} style={{ color: fam.color }} />
                  <span className="inv-family-name">{fam.name}</span>
                </div>
                <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: fam.color }}>
                  {fam.items.length} signal{fam.items.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="inv-family-bar-wrap">
                <div
                  className="inv-family-bar-fill"
                  style={{ width: `${percentage}%`, backgroundColor: fam.color }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>{fam.items.filter((i) => i.severity === 'HIGH').length} High Severity</span>
                {isSelected ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Underlying Evidence Items for Selected Family */}
      {selectedFamilyId && (
        <div style={{ padding: '14px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Underlying Evidence Items ({families.find((f) => f.id === selectedFamilyId)?.name}):
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {families
              .find((f) => f.id === selectedFamilyId)
              ?.items.map((item) => (
                <div
                  key={item.evidence_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RiskBadge level={item.severity} size="sm" />
                      <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{item.title}</strong>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>{item.description}</p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>
                      +{item.score_contribution.toFixed(0)} pts
                    </span>
                    <Button variant="secondary" size="sm" icon={Eye} onClick={() => onSelectEvidence(item)}>
                      Inspect
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
