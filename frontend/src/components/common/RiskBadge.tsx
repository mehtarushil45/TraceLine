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

  let bg = 'rgba(16, 185, 129, 0.12)';
  let border = '1px solid rgba(16, 185, 129, 0.35)';
  let color = '#86efac';
  let dotColor = '#10b981';
  let glow = '0 0 10px rgba(16, 185, 129, 0.2)';

  if (normLevel === 'HIGH') {
    bg = 'rgba(244, 63, 94, 0.15)';
    border = '1px solid rgba(244, 63, 94, 0.4)';
    color = '#fca5a5';
    dotColor = '#f43f5e';
    glow = '0 0 14px rgba(244, 63, 94, 0.35)';
  } else if (normLevel === 'MEDIUM') {
    bg = 'rgba(251, 191, 36, 0.15)';
    border = '1px solid rgba(251, 191, 36, 0.4)';
    color = '#fde68a';
    dotColor = '#fbbf24';
    glow = '0 0 12px rgba(251, 191, 36, 0.25)';
  }

  const padding = size === 'lg' ? '4px 12px' : size === 'sm' ? '2px 6px' : '3px 9px';
  const fontSize = size === 'lg' ? '12px' : size === 'sm' ? '10px' : '11px';
  const dotSize = size === 'lg' ? '7px' : size === 'sm' ? '5px' : '6px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        borderRadius: '4px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
        letterSpacing: '0.04em',
        backgroundColor: bg,
        border,
        color,
        padding,
        fontSize,
        boxShadow: glow,
      }}
    >
      {showDot && (
        <span
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            backgroundColor: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
          }}
          className={normLevel === 'HIGH' ? 'animate-pulse-dot' : ''}
        />
      )}
      {normLevel}
    </span>
  );
};
