import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'accent' | 'high' | 'med' | 'low';
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  style = {},
}) => {
  const variantStyles = {
    neutral: {
      backgroundColor: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      color: 'var(--text-secondary)',
    },
    accent: {
      backgroundColor: 'var(--accent-subtle)',
      border: '1px solid var(--accent-border)',
      color: 'var(--accent)',
    },
    high: {
      backgroundColor: 'var(--risk-high-bg)',
      border: '1px solid var(--risk-high-border)',
      color: 'var(--risk-high)',
    },
    med: {
      backgroundColor: 'var(--risk-med-bg)',
      border: '1px solid var(--risk-med-border)',
      color: 'var(--risk-med)',
    },
    low: {
      backgroundColor: 'var(--risk-low-bg)',
      border: '1px solid var(--risk-low-border)',
      color: 'var(--risk-low)',
    },
  };

  const sizeStyles = {
    sm: { padding: '1px 6px', fontSize: '10px' },
    md: { padding: '2px 8px', fontSize: '11px' },
  };

  const curVariant = variantStyles[variant];
  const curSize = sizeStyles[size];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        borderRadius: '4px',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...curVariant,
        ...curSize,
        ...style,
      }}
    >
      {children}
    </span>
  );
};
