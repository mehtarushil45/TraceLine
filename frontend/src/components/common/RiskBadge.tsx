import React from 'react';
import type { RiskLevel } from '../../types/api';

interface RiskBadgeProps {
  level: RiskLevel | string;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level,
  size = 'md',
  showDot = true,
}) => {
  const normLevel = (level || 'LOW').toUpperCase() as RiskLevel;

  let bg = 'var(--risk-low-bg)';
  let border = '1px solid var(--risk-low-border)';
  let color = '#86efac';
  let dotColor = '#10b981';

  if (normLevel === 'HIGH') {
    bg = 'var(--risk-high-bg)';
    border = '1px solid var(--risk-high-border)';
    color = '#fca5a5';
    dotColor = '#ef4444';
  } else if (normLevel === 'MEDIUM') {
    bg = 'var(--risk-med-bg)';
    border = '1px solid var(--risk-med-border)';
    color = '#fde68a';
    dotColor = '#f59e0b';
  }

  const padding = size === 'lg' ? '3px 10px' : size === 'sm' ? '1px 6px' : '2px 8px';
  const fontSize = size === 'lg' ? '12px' : size === 'sm' ? '10px' : '11px';
  const dotSize = size === 'lg' ? '6px' : size === 'sm' ? '4px' : '5px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        borderRadius: '4px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        letterSpacing: '0.04em',
        backgroundColor: bg,
        border,
        color,
        padding,
        fontSize,
        whiteSpace: 'nowrap',
      }}
    >
      {showDot && (
        <span
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {normLevel}
    </span>
  );
};
