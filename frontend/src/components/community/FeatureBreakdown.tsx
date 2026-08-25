import React from 'react';
import { Clock, Cpu, DollarSign, Share2 } from 'lucide-react';
import type { CommunityDetailResponse } from '../../types/api';

interface FeatureBreakdownProps {
  community: CommunityDetailResponse;
}

export const FeatureBreakdown: React.FC<FeatureBreakdownProps> = ({ community }) => {
  const { features, transaction_statistics: txStats, temporal_statistics: tempStats, entity_sharing: shareStats } = community;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
      {/* 1. Graph Structure */}
      <div className="dash-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          <Cpu size={16} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)' }}>
            Graph Structure
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Member Accounts:</span>
            <span className="font-mono font-semibold text-slate-200">{community.member_count.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Internal Edge Count:</span>
            <span className="font-mono font-semibold text-slate-200">{community.internal_edge_count.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Connection Density:</span>
            <span className="font-mono font-semibold text-slate-200">{community.density.toFixed(6)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Mean Edge Weight:</span>
            <span className="font-mono font-semibold text-slate-200">{community.mean_edge_weight !== null ? community.mean_edge_weight.toFixed(2) : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Weight per Member:</span>
            <span className="font-mono font-semibold text-slate-200">{features['weight_per_member'] !== undefined && features['weight_per_member'] !== null ? features['weight_per_member'].toFixed(2) : '—'}</span>
          </div>
        </div>
      </div>

      {/* 2. Entity Sharing */}
      <div className="dash-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          <Share2 size={16} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)' }}>
            Entity Sharing
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Shared Instruments:</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_instruments.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Shared Devices:</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_devices.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Shared IP Addresses:</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_ips.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Shared Merchants:</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_merchants.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Instrument Sharing Ratio:</span>
            <span className="font-mono font-semibold text-amber-400">{shareStats.instrument_sharing_ratio.toFixed(5)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Device Sharing Ratio:</span>
            <span className="font-mono font-semibold text-amber-400">{shareStats.device_sharing_ratio.toFixed(5)}</span>
          </div>
        </div>
      </div>

      {/* 3. Temporal Concentration */}
      <div className="dash-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          <Clock size={16} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)' }}>
            Temporal Behavior
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Temporal Compression:</span>
            <span className="font-mono font-semibold text-sky-400">{tempStats.temporal_compression_score.toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Active Clock Hours:</span>
            <span className="font-mono font-semibold text-slate-200">{tempStats.unique_active_hours} / 24</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Median Tx Gap:</span>
            <span className="font-mono font-semibold text-slate-200">{tempStats.median_inter_transaction_gap_hours !== null ? `${tempStats.median_inter_transaction_gap_hours.toFixed(3)} hrs` : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Transactions / Member:</span>
            <span className="font-mono font-semibold text-slate-200">{txStats.tx_per_member.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Temporal Overlap Mean:</span>
            <span className="font-mono font-semibold text-slate-200">{features['temporal_overlap_mean'] !== undefined && features['temporal_overlap_mean'] !== null ? `${features['temporal_overlap_mean'].toFixed(2)} days` : '—'}</span>
          </div>
        </div>
      </div>

      {/* 4. Transaction Behavior */}
      <div className="dash-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          <DollarSign size={16} style={{ color: '#10b981' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)' }}>
            Transaction Behavior
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Total Tx Amount:</span>
            <span className="font-mono font-semibold text-slate-200">${txStats.total_transaction_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Mean Tx Amount:</span>
            <span className="font-mono font-semibold text-slate-200">{txStats.mean_tx_amount !== null ? `$${txStats.mean_tx_amount.toFixed(2)}` : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Amount Variability (CV):</span>
            <span className="font-mono font-semibold text-slate-200">{txStats.amount_cv !== null ? txStats.amount_cv.toFixed(3) : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Declined Rate:</span>
            <span className="font-mono font-semibold text-red-400">{txStats.declined_rate !== null ? `${(txStats.declined_rate * 100).toFixed(2)}%` : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-dim)' }}>Payment Methods:</span>
            <span className="font-mono font-semibold text-slate-200">{txStats.unique_payment_methods ?? '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
