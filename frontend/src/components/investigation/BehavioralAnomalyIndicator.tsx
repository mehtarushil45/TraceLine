import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { CommunityDetailResponse } from '../../types/api';
import { Badge } from '../common';

interface BehavioralAnomalyIndicatorProps {
  community: CommunityDetailResponse;
}

export const BehavioralAnomalyIndicatorProps: React.FC<BehavioralAnomalyIndicatorProps> = ({
  community,
}) => {
  const temporalScore = community.temporal_statistics.temporal_compression_score;
  const isCompressed = temporalScore >= 0.35;
  const spanHours = community.temporal_statistics.timestamp_span_hours ?? 0;
  const medianGap = community.temporal_statistics.median_inter_transaction_gap_hours ?? 0;

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} style={{ color: '#f87171' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Behavioral Transition & Temporal Velocity</strong>
            <Badge variant={isCompressed ? 'high' : 'neutral'}>
              {isCompressed ? 'Elevated Velocity Spike' : 'Standard Baseline'}
            </Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Quantitative shift in transaction velocity, inter-transaction gaps, and activity concentration compared to normal baselines.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        {/* Baseline vs Spike Comparison */}
        <div style={{ padding: '14px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Activity Transition Profile
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Temporal Span:</span>
              <span className="font-mono font-bold text-slate-100">{spanHours.toFixed(1)} hours</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Active Window:</span>
              <span className="font-mono font-bold text-slate-100">{community.temporal_statistics.unique_active_hours} distinct hours</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)' }}>Median Gap:</span>
              <span className="font-mono font-bold text-amber-400">
                {medianGap.toFixed(2)} hrs between tx
              </span>
            </div>
          </div>
        </div>

        {/* Compression Gauge Card */}
        <div style={{ padding: '14px', backgroundColor: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Temporal Compression Score
          </span>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span className="font-mono" style={{ fontSize: '24px', fontWeight: 800, color: isCompressed ? '#f87171' : 'var(--text-primary)' }}>
              {temporalScore.toFixed(2)}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>/ 1.00 index</span>
          </div>

          <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-card)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.min(100, Math.round(temporalScore * 100))}%`,
                height: '100%',
                backgroundColor: isCompressed ? '#f87171' : 'var(--accent)',
              }}
            />
          </div>

          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {isCompressed
              ? 'Transactions occurred in closely spaced bursts indicative of automated or coordinated execution.'
              : 'Transaction distribution across time is within expected variance.'}
          </span>
        </div>
      </div>
    </div>
  );
};
