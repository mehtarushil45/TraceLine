import React from 'react';
import type { CaseStatus } from '../../types/cases';

interface StatusBadgeProps {
  status: CaseStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const norm = (status || 'OPEN').toUpperCase();

  let bg = 'var(--bg-subtle)';
  let border = '1px solid var(--border)';
  let color = 'var(--text-secondary)';

  if (norm === 'OPEN') {
    bg = 'rgba(59, 130, 246, 0.12)';
    border = '1px solid rgba(59, 130, 246, 0.3)';
    color = '#93c5fd';
  } else if (norm === 'REVIEW' || norm === 'UNDER REVIEW') {
    bg = 'var(--risk-med-bg)';
    border = '1px solid var(--risk-med-border)';
    color = 'var(--risk-med)';
  } else if (norm === 'CLOSED') {
    bg = 'var(--risk-low-bg)';
    border = '1px solid var(--risk-low-border)';
    color = 'var(--risk-low)';
  }

  const isSmall = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: isSmall ? '1px 6px' : '2px 8px',
        borderRadius: '4px',
        fontSize: isSmall ? '10px' : '11px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        backgroundColor: bg,
        border,
        color,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}
    >
      {norm}
    </span>
  );
};
