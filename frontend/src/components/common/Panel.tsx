import React from 'react';

interface PanelProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  borderVariant?: 'default' | 'high' | 'med' | 'low';
  className?: string;
  style?: React.CSSProperties;
}

export const Panel: React.FC<PanelProps> = ({
  children,
  title,
  subtitle,
  actions,
  padding = 'md',
  borderVariant = 'default',
  className = '',
  style = {},
}) => {
  const paddingMap = {
    none: '0',
    sm: '12px',
    md: '16px 20px',
    lg: '24px',
  };

  let borderColor = 'var(--border)';
  if (borderVariant === 'high') borderColor = 'var(--risk-high-border)';
  else if (borderVariant === 'med') borderColor = 'var(--risk-med-border)';
  else if (borderVariant === 'low') borderColor = 'var(--risk-low-border)';

  const hasHeader = Boolean(title || actions);

  return (
    <div
      className={`dash-card ${className}`}
      style={{
        backgroundColor: 'var(--bg-panel)',
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        overflow: 'hidden',
        ...style,
      }}
    >
      {hasHeader && (
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            backgroundColor: 'var(--bg-sidebar)',
          }}
        >
          <div>
            {title && (
              <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)', margin: 0 }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}
        </div>
      )}

      <div style={{ padding: paddingMap[padding] }}>{children}</div>
    </div>
  );
};
