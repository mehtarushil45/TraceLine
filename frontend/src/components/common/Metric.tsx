import React from 'react';

interface MetricProps {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  variant?: 'default' | 'accent' | 'high' | 'med' | 'low';
  size?: 'sm' | 'md' | 'lg';
}

export const Metric: React.FC<MetricProps> = ({
  label,
  value,
  subtext,
  variant = 'default',
  size = 'md',
}) => {
  const valueColorMap = {
    default: 'var(--text-primary)',
    accent: 'var(--accent)',
    high: 'var(--risk-high)',
    med: 'var(--risk-med)',
    low: 'var(--risk-low)',
  };

  const fontSizeMap = {
    sm: '15px',
    md: '18px',
    lg: '24px',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-dim)',
        }}
      >
        {label}
      </span>
      <div
        style={{
          fontSize: fontSizeMap[size],
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          color: valueColorMap[variant],
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {subtext && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {subtext}
        </span>
      )}
    </div>
  );
};
