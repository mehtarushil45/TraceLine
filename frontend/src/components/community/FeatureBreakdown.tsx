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
      <div className="dash-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <Cpu size={16} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-main)' }}>
            Graph Structure (4 Features)
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Member Accounts (member_count):</span>
            <span className="font-mono font-semibold text-slate-200">{community.member_count.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Connection Density (density):</span>
            <span className="font-mono font-semibold text-slate-200">{community.density.toFixed(6)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Mean Edge Weight (mean_edge_weight):</span>
            <span className="font-mono font-semibold text-slate-200">{community.mean_edge_weight !== null ? community.mean_edge_weight.toFixed(2) : '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Weight per Member (weight_per_member):</span>
            <span className="font-mono font-bold text-amber-400">
              {features['weight_per_member'] !== undefined && features['weight_per_member'] !== null
                ? features['weight_per_member'].toFixed(2)
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Entity Sharing */}
      <div className="dash-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <Share2 size={16} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-main)' }}>
            Entity Sharing (6 Features)
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Shared Instruments (unique_shared_instruments):</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_instruments.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Shared Devices (unique_shared_devices):</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_devices.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Shared IPs (unique_shared_ips):</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_ips.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Shared Merchants (unique_shared_merchants):</span>
            <span className="font-mono font-semibold text-slate-200">{shareStats.unique_shared_merchants.toLocaleString()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Instrument Sharing Ratio (instrument_sharing_ratio):</span>
            <span className="font-mono font-semibold text-amber-400">{shareStats.instrument_sharing_ratio.toFixed(5)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Device Sharing Ratio (device_sharing_ratio):</span>
            <span className="font-mono font-semibold text-amber-400">{shareStats.device_sharing_ratio.toFixed(5)}</span>
          </div>
        </div>
      </div>

      {/* 3. Temporal Behavior */}
      <div className="dash-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <Clock size={16} style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-main)' }}>
            Temporal Behavior (5 Features)
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Temporal Compression (temporal_compression_score):</span>
            <span className="font-mono font-semibold text-sky-400">{tempStats.temporal_compression_score.toFixed(4)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Active Hours (unique_active_hours):</span>
            <span className="font-mono font-semibold text-slate-200">{tempStats.unique_active_hours} / 24 hrs</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Median Tx Gap (median_inter_transaction_gap_hours):</span>
            <span className="font-mono font-semibold text-slate-200">
              {tempStats.median_inter_transaction_gap_hours !== null
                ? `${tempStats.median_inter_transaction_gap_hours.toFixed(3)} hrs`
                : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Transactions / Member (tx_per_member):</span>
            <span className="font-mono font-semibold text-slate-200">{txStats.tx_per_member.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Temporal Overlap Mean (temporal_overlap_mean):</span>
            <span className="font-mono font-semibold text-sky-300">
              {features['temporal_overlap_mean'] !== undefined && features['temporal_overlap_mean'] !== null
                ? `${features['temporal_overlap_mean'].toFixed(2)} days`
                : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Transaction Behavior */}
      <div className="dash-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <DollarSign size={16} style={{ color: '#10b981' }} />
          <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-main)' }}>
            Transaction Behavior (6 Features)
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Total Tx Volume (total_transaction_amount):</span>
            <span className="font-mono font-semibold text-slate-200">
              ${txStats.total_transaction_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Mean Tx Amount (mean_tx_amount):</span>
            <span className="font-mono font-semibold text-slate-200">
              {txStats.mean_tx_amount !== null ? `$${txStats.mean_tx_amount.toFixed(2)}` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Amount Variability (amount_cv):</span>
            <span className="font-mono font-semibold text-slate-200">
              {txStats.amount_cv !== null ? txStats.amount_cv.toFixed(3) : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Declined Rate (declined_rate):</span>
            <span className="font-mono font-bold text-red-400">
              {txStats.declined_rate !== null ? `${(txStats.declined_rate * 100).toFixed(2)}%` : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Payment Methods (unique_payment_methods):</span>
            <span className="font-mono font-semibold text-slate-200">{txStats.unique_payment_methods ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-dim)' }}>Category Entropy (merchant_category_entropy):</span>
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
