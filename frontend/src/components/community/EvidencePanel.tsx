import React from 'react';
import {
  AlertTriangle,
  Clock,
  Cpu,
  CreditCard,
  DollarSign,
  Info,
  Network,
  ShieldAlert,
  Smartphone,
  TrendingUp,
} from 'lucide-react';
import type { CommunityDetailResponse } from '../../types/api';

interface EvidencePanelProps {
  community: CommunityDetailResponse;
}

interface SignalMetadata {
  title: string;
  category: 'Infrastructure' | 'Temporal' | 'Graph' | 'Financial';
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  featureKey: string;
  formatValue: (val: number | null | undefined) => string;
  interpretation: string;
}

const SIGNAL_DICTIONARY: Record<string, Omit<SignalMetadata, 'title'>> = {
  weight_per_member: {
    category: 'Graph',
    icon: Cpu,
    color: '#fb923c',
    bgColor: 'rgba(251, 146, 60, 0.12)',
    borderColor: 'rgba(251, 146, 60, 0.35)',
    featureKey: 'weight_per_member',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toFixed(2)} wt/member` : '—'),
    interpretation: 'High concentration of relationship evidence relative to cluster membership size, indicating tightly bound co-activity.',
  },
  device_sharing_ratio: {
    category: 'Infrastructure',
    icon: Smartphone,
    color: '#f87171',
    bgColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
    featureKey: 'device_sharing_ratio',
    formatValue: (v) => (v !== null && v !== undefined ? `${(v * 100).toFixed(3)}%` : '—'),
    interpretation: 'Unusually high proportion of accounts operating from common hardware devices across distinct payment credentials.',
  },
  unique_shared_devices: {
    category: 'Infrastructure',
    icon: Smartphone,
    color: '#f87171',
    bgColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
    featureKey: 'unique_shared_devices',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toLocaleString()} devices` : '—'),
    interpretation: 'Significant raw count of multi-account shared hardware fingerprints observed within this cluster.',
  },
  instrument_sharing_ratio: {
    category: 'Infrastructure',
    icon: CreditCard,
    color: '#fbbf24',
    bgColor: 'rgba(251, 191, 36, 0.12)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
    featureKey: 'instrument_sharing_ratio',
    formatValue: (v) => (v !== null && v !== undefined ? `${(v * 100).toFixed(3)}%` : '—'),
    interpretation: 'Multiple accounts linked to the same cards, bank accounts, or funding instruments.',
  },
  unique_shared_instruments: {
    category: 'Infrastructure',
    icon: CreditCard,
    color: '#fbbf24',
    bgColor: 'rgba(251, 191, 36, 0.12)',
    borderColor: 'rgba(251, 191, 36, 0.35)',
    featureKey: 'unique_shared_instruments',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toLocaleString()} instruments` : '—'),
    interpretation: 'Extensive overlap in payment credentials spanning multiple customer profiles.',
  },
  temporal_compression_score: {
    category: 'Temporal',
    icon: Clock,
    color: '#00F0FF',
    bgColor: 'rgba(0, 240, 255, 0.12)',
    borderColor: 'rgba(0, 240, 255, 0.35)',
    featureKey: 'temporal_compression_score',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toFixed(4)}` : '—'),
    interpretation: 'High clustering of transactions in narrow time windows rather than standard organic temporal dispersion.',
  },
  temporal_overlap_mean: {
    category: 'Temporal',
    icon: Clock,
    color: '#00F0FF',
    bgColor: 'rgba(0, 240, 255, 0.12)',
    borderColor: 'rgba(0, 240, 255, 0.35)',
    featureKey: 'temporal_overlap_mean',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toFixed(2)} days` : '—'),
    interpretation: 'Frequent same-day concurrent activity observed across accounts in this community.',
  },
  mean_edge_weight: {
    category: 'Graph',
    icon: Network,
    color: '#a855f7',
    bgColor: 'rgba(168, 85, 247, 0.12)',
    borderColor: 'rgba(168, 85, 247, 0.35)',
    featureKey: 'mean_edge_weight',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toFixed(2)}` : '—'),
    interpretation: 'High average multi-layer evidence weight connecting account pairs across the community graph.',
  },
  density: {
    category: 'Graph',
    icon: Cpu,
    color: '#38bdf8',
    bgColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.35)',
    featureKey: 'density',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toFixed(6)}` : '—'),
    interpretation: 'Elevated ratio of actual interconnected edges relative to all possible account combinations.',
  },
  unique_shared_ips: {
    category: 'Infrastructure',
    icon: Network,
    color: '#c084fc',
    bgColor: 'rgba(192, 132, 252, 0.12)',
    borderColor: 'rgba(192, 132, 252, 0.35)',
    featureKey: 'unique_shared_ips',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toLocaleString()} IPs` : '—'),
    interpretation: 'Multiple accounts routing payment actions through identical IP addresses or subnet gateways.',
  },
  declined_rate: {
    category: 'Financial',
    icon: DollarSign,
    color: '#f87171',
    bgColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
    featureKey: 'declined_rate',
    formatValue: (v) => (v !== null && v !== undefined ? `${(v * 100).toFixed(2)}%` : '—'),
    interpretation: 'Elevated proportion of attempted transactions rejected or declined by issuers/gateways.',
  },
  amount_cv: {
    category: 'Financial',
    icon: TrendingUp,
    color: '#34d399',
    bgColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
    featureKey: 'amount_cv',
    formatValue: (v) => (v !== null && v !== undefined ? `${v.toFixed(3)}` : '—'),
    interpretation: 'High variance in payment amounts compared to the mean, characteristic of rapid testing and large cash-outs.',
  },
};

function parseSignal(rawSignal: string): SignalMetadata {
  const norm = rawSignal.toLowerCase().trim();

  for (const [key, meta] of Object.entries(SIGNAL_DICTIONARY)) {
    if (norm.includes(key.replace(/_/g, ' ')) || norm.includes(key) || norm.includes(meta.category.toLowerCase())) {
      return {
        title: rawSignal,
        ...meta,
      };
    }
  }

  return {
    title: rawSignal,
    category: 'Infrastructure',
    icon: AlertTriangle,
    color: '#94a3b8',
    bgColor: 'rgba(51, 65, 85, 0.2)',
    borderColor: 'rgba(51, 65, 85, 0.4)',
    featureKey: norm,
    formatValue: (v) => (v !== null && v !== undefined ? `${v}` : 'Elevated'),
    interpretation: 'Observable evidence anomaly contributing to ML risk prioritization.',
  };
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ community }) => {
  const { top_signal_1, top_signal_2, top_signal_3, features, risk_level, community_id } = community;

  const rawSignals = [top_signal_1, top_signal_2, top_signal_3].filter(Boolean);
  const parsedSignals = rawSignals.map((s) => parseSignal(s));

  const isHigh = risk_level === 'HIGH';
  const isMed = risk_level === 'MEDIUM';

  const generateInvestigatorSummary = () => {
    const signalsText = parsedSignals.map((s) => s.title.toLowerCase()).join(' and ');
    if (isHigh) {
      return `Community #${community_id} shows elevated multi-layer infrastructure reuse and unusually concentrated relationship evidence. ${parsedSignals[0]?.title || 'Observed entity sharing'} and ${parsedSignals[1]?.title || 'network density'} represent the primary observable evidence drivers prioritizing this cluster for investigator review.`;
    }
    if (isMed) {
      return `Community #${community_id} exhibits moderate observable overlap in shared credentials and timing patterns. Key contributing indicators include ${signalsText}, placing this community into the secondary monitoring queue.`;
    }
    return `Community #${community_id} reflects standard baseline activity with minimal credential sharing and organic temporal dispersion across ${community.member_count.toLocaleString()} member accounts.`;
  };

  return (
    <div
      className="dash-card"
      style={{
        padding: '24px 28px',
        borderLeft: `4px solid ${isHigh ? '#f43f5e' : isMed ? '#fbbf24' : '#10b981'}`,
        backgroundColor: '#070d1e',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Panel Top Title & Context */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '8px',
              borderRadius: '6px',
              backgroundColor: isHigh ? 'rgba(244, 63, 94, 0.2)' : 'rgba(251, 191, 36, 0.2)',
              color: isHigh ? '#f43f5e' : '#fbbf24',
              boxShadow: isHigh ? '0 0 16px rgba(244, 63, 94, 0.3)' : 'none',
            }}
          >
            <ShieldAlert size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f8fafc' }}>
              Why is this cluster prioritized?
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              Observable graph evidence contributing to investigator prioritization (Strict Zero-Leakage Mode)
            </span>
          </div>
        </div>

        <span
          style={{
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: '#162447',
            border: '1px solid var(--border-light)',
            color: 'var(--accent-cyan)',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {parsedSignals.length} Forensics Anomaly Vectors
        </span>
      </div>

      {/* Investigator Forensic Summary HUD Box */}
      <div
        style={{
          padding: '14px 18px',
          borderRadius: '8px',
          backgroundColor: '#030712',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}
      >
        <Info size={18} style={{ color: 'var(--accent-cyan)', marginTop: '2px', flexShrink: 0 }} />
        <p style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6, margin: 0 }}>
          {generateInvestigatorSummary()}
        </p>
      </div>

      {/* Top 3 Signals Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        {parsedSignals.map((sig, idx) => {
          const Icon = sig.icon;
          const featVal = features[sig.featureKey];
          const formattedVal = sig.formatValue(featVal);

          return (
            <div
              key={idx}
              style={{
                padding: '16px 18px',
                borderRadius: '8px',
                backgroundColor: sig.bgColor,
                border: `1px solid ${sig.borderColor}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Signal Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon size={16} style={{ color: sig.color }} />
                  <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: sig.color, letterSpacing: '0.04em' }}>
                    Vector #{idx + 1} · {sig.category}
                  </span>
                </div>

                <span
                  className="font-mono"
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#f8fafc',
                    backgroundColor: 'rgba(3, 7, 18, 0.7)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                >
                  {formattedVal}
                </span>
              </div>

              {/* Signal Title */}
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                {sig.title}
              </span>

              {/* Signal Interpretation */}
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                {sig.interpretation}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
