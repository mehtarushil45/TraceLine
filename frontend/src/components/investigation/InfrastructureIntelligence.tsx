import React from 'react';
import {
  CreditCard,
  Layers,
  Server,
  Smartphone,
} from 'lucide-react';
import type { CommunityDetailResponse, CommunityGraphResponse } from '../../types/api';
import { Badge } from '../common';

interface InfrastructureIntelligenceProps {
  community: CommunityDetailResponse;
  graphData: CommunityGraphResponse | null;
}

export const InfrastructureIntelligence: React.FC<InfrastructureIntelligenceProps> = ({
  community,
  graphData,
}) => {
  const edgesWithInfra = (graphData?.edges || []).filter(
    (e) =>
      e.shared_devices.length > 0 ||
      e.shared_ips.length > 0 ||
      e.shared_instruments.length > 0 ||
      e.shared_merchants.length > 0
  );

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={16} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Infrastructure Linkage Intelligence</strong>
            <Badge variant="accent">Hardware & Network Fingerprints</Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Multi-hop infrastructure linkages connecting accounts via shared hardware identifiers, subnet IPs, and payment instruments.
          </p>
        </div>
      </div>

      {/* Summary Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        <div style={{ padding: '12px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fb7185', fontSize: '11px', fontWeight: 700 }}>
            <Smartphone size={14} />
            <span>SHARED DEVICES</span>
          </div>
          <span className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
            {community.entity_sharing.unique_shared_devices}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
            Ratio: {(community.entity_sharing.device_sharing_ratio * 100).toFixed(1)}%
          </span>
        </div>

        <div style={{ padding: '12px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', fontSize: '11px', fontWeight: 700 }}>
            <Server size={14} />
            <span>SHARED SUBNET IPS</span>
          </div>
          <span className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
            {community.entity_sharing.unique_shared_ips}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
            Network layer concentration
          </span>
        </div>

        <div style={{ padding: '12px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontSize: '11px', fontWeight: 700 }}>
            <CreditCard size={14} />
            <span>SHARED INSTRUMENTS</span>
          </div>
          <span className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
            {community.entity_sharing.unique_shared_instruments}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
            Ratio: {(community.entity_sharing.instrument_sharing_ratio * 100).toFixed(1)}%
          </span>
        </div>

        <div style={{ padding: '12px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '11px', fontWeight: 700 }}>
            <Layers size={14} />
            <span>SHARED MERCHANTS</span>
          </div>
          <span className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
            {community.entity_sharing.unique_shared_merchants}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
            Gateway access points
          </span>
        </div>
      </div>

      {/* Concrete Linkages List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
          Observed Multi-Entity Connections ({edgesWithInfra.length}):
        </span>

        {edgesWithInfra.slice(0, 4).map((e, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{e.source}</strong>
              <span style={{ color: 'var(--accent)' }}>⇄</span>
              <strong style={{ color: 'var(--text-primary)' }}>{e.target}</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
              {e.shared_devices.length > 0 && (
                <span style={{ color: '#fb7185' }}>Device: {e.shared_devices[0]}</span>
              )}
              {e.shared_instruments.length > 0 && (
                <span style={{ color: '#fbbf24' }}>Card: {e.shared_instruments[0]}</span>
              )}
              {e.shared_ips.length > 0 && (
                <span style={{ color: '#60a5fa' }}>IP: {e.shared_ips[0]}</span>
              )}
              {e.temporal_overlap > 0 && (
                <span style={{ color: '#38bdf8' }}>{e.temporal_overlap} days overlap</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
