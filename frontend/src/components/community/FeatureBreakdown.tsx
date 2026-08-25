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
      <div className="dash-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '3px solid var(--accent-cyan)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f8fafc' }}>
              Graph Topology
            </span>
          </div>
          <span className="font-mono text-[10px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">4 FEATURES</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Member Accounts (member_count):</span>
            <span className="font-mono font-bold text-slate-100">{community.member_count.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Connection Density (density):</span>
            <span className="font-mono font-semibold text-slate-200">{community.density.toFixed(6)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Mean Edge Weight (mean_edge_weight):</span>
            <span className="font-mono font-semibold text-slate-200">{community.mean_edge_weight !== null ? community.mean_edge_weight.toFixed(2) : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Weight per Member (weight_per_member):</span>
            <span className="font-mono font-bold text-amber-400">
              {features['weight_per_member'] !== undefined && features['weight_per_member'] !== null
                ? features['weight_per_member'].toFixed(2)
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Entity Sharing */}
      <div className="dash-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '3px solid #fbbf24' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Share2 size={16} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f8fafc' }}>
              Entity Sharing
            </span>
          </div>
          <span className="font-mono text-[10px] text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">6 FEATURES</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Shared Instruments (unique_shared_instruments):</span>
            <span className="font-mono font-bold text-slate-100">{shareStats.unique_shared_instruments.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Shared Devices (unique_shared_devices):</span>
            <span className="font-mono font-bold text-slate-100">{shareStats.unique_shared_devices.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Shared IPs (unique_shared_ips):</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_ips.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Shared Merchants (unique_shared_merchants):</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_merchants.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Instrument Sharing Ratio (instrument_sharing_ratio):</span>
            <span className="font-mono font-bold text-amber-400">{shareStats.instrument_sharing_ratio.toFixed(5)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Device Sharing Ratio (device_sharing_ratio):</span>
            <span className="font-mono font-bold text-amber-400">{shareStats.device_sharing_ratio.toFixed(5)}</span>
          </div>
        </div>
      </div>

      {/* 3. Temporal Behavior */}
      <div className="dash-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '3px solid #38bdf8' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f8fafc' }}>
              Temporal Velocity
            </span>
          </div>
          <span className="font-mono text-[10px] text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40">5 FEATURES</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Temporal Compression (temporal_compression_score):</span>
            <span className="font-mono font-bold text-sky-400">{tempStats.temporal_compression_score.toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Active Hours (unique_active_hours):</span>
            <span className="font-mono font-semibold text-slate-200">{tempStats.unique_active_hours} / 24 hrs</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Median Tx Gap (median_inter_transaction_gap_hours):</span>
            <span className="font-mono font-semibold text-slate-200">
              {tempStats.median_inter_transaction_gap_hours !== null
                ? `${tempStats.median_inter_transaction_gap_hours.toFixed(3)} hrs`
                : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Transactions / Member (tx_per_member):</span>
            <span className="font-mono font-semibold text-slate-200">{txStats.tx_per_member.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Temporal Overlap Mean (temporal_overlap_mean):</span>
            <span className="font-mono font-semibold text-sky-300">
              {features['temporal_overlap_mean'] !== undefined && features['temporal_overlap_mean'] !== null
                ? `${features['temporal_overlap_mean'].toFixed(2)} days`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Transaction Behavior */}
      <div className="dash-card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '3px solid #10b981' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DollarSign size={16} style={{ color: '#10b981' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f8fafc' }}>
              Transaction Analytics
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">6 FEATURES</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Total Tx Volume (total_transaction_amount):</span>
            <span className="font-mono font-bold text-slate-100">
              ${txStats.total_transaction_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Mean Tx Amount (mean_tx_amount):</span>
            <span className="font-mono font-semibold text-slate-200">
              {txStats.mean_tx_amount !== null ? `$${txStats.mean_tx_amount.toFixed(2)}` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Amount Variability (amount_cv):</span>
            <span className="font-mono font-semibold text-slate-200">
              {txStats.amount_cv !== null ? txStats.amount_cv.toFixed(3) : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Declined Rate (declined_rate):</span>
            <span className="font-mono font-bold text-rose-400">
              {txStats.declined_rate !== null ? `${(txStats.declined_rate * 100).toFixed(2)}%` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Payment Methods (unique_payment_methods):</span>
            <span className="font-mono font-semibold text-slate-200">{txStats.unique_payment_methods ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Category Entropy (merchant_category_entropy):</span>
            <span className="font-mono font-semibold text-emerald-400">
              {features['merchant_category_entropy'] !== undefined && features['merchant_category_entropy'] !== null
                ? features['merchant_category_entropy'].toFixed(3)
                : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
