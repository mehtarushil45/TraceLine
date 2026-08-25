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

  let badgeClass = 'badge-risk-low';
  let dotColor = 'bg-emerald-400';
  let dotPulse = 'bg-emerald-500';

  if (normLevel === 'HIGH') {
    badgeClass = 'badge-risk-high';
    dotColor = 'bg-red-400';
    dotPulse = 'bg-red-500';
  } else if (normLevel === 'MEDIUM') {
    badgeClass = 'badge-risk-medium';
    dotColor = 'bg-amber-400';
    dotPulse = 'bg-amber-500';
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px] font-semibold gap-1',
    md: 'px-2.5 py-1 text-xs font-semibold gap-1.5',
    lg: 'px-3.5 py-1.5 text-sm font-bold gap-2',
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '4px',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
      }}
      className={`${badgeClass} ${sizeClasses[size]}`}
    >
      {showDot && (
        <span
          style={{
            position: 'relative',
            display: 'flex',
            height: size === 'lg' ? '8px' : '6px',
            width: size === 'lg' ? '8px' : '6px',
          }}
        >
          {normLevel === 'HIGH' && (
            <span
              style={{
                position: 'absolute',
                display: 'inline-flex',
                height: '100%',
                width: '100%',
                borderRadius: '9999px',
                opacity: 0.75,
              }}
              className={`${dotPulse} animate-ping`}
            />
          )}
          <span
            style={{
              position: 'relative',
              display: 'inline-flex',
              borderRadius: '9999px',
              height: '100%',
              width: '100%',
            }}
            className={dotColor}
          />
        </span>
      )}
      {normLevel}
    </span>
  );
};
