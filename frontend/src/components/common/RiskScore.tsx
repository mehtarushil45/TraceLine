import React from 'react';
import type { RiskLevel } from '../../types/api';

interface RiskScoreProps {
  score: number;
  level?: RiskLevel | string;
  size?: 'sm' | 'md' | 'lg';
  showBar?: boolean;
  showSubtitle?: boolean;
}

export const RiskScore: React.FC<RiskScoreProps> = ({
  score,
  level,
  size = 'md',
  showBar = false,
  showSubtitle = false,
}) => {
  const normLevel = level
    ? (level.toUpperCase() as RiskLevel)
    : score >= 60
    ? 'HIGH'
    : score >= 35
    ? 'MEDIUM'
    : 'LOW';

  let color = '#10b981'; // emerald
  if (normLevel === 'HIGH') {
    color = '#ef4444'; // red
  } else if (normLevel === 'MEDIUM') {
    color = '#f59e0b'; // amber
  }

  const fontSize = size === 'lg' ? '28px' : size === 'sm' ? '13px' : '18px';

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize,
            color,
            lineHeight: 1,
          }}
        >
          {score}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          /100
        </span>
      </div>

      {showBar && (
        <div
          style={{
            height: '4px',
            width: '100%',
            backgroundColor: '#1e293b',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, score))}%`,
              backgroundColor: color,
              borderRadius: '2px',
              transition: 'width 0.5s ease',
            }}
          />
        </div>
      )}

      {showSubtitle && (
        <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
          Model risk score derived from observable network evidence
        </span>
      )}
    </div>
  );
};
