import React from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
  actions?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {Icon && <Icon size={16} style={{ color: 'var(--accent)' }} />}
          <h2
            style={{
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              margin: 0,
            }}
          >
            {title}
          </h2>
        </div>
        {description && (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
            {description}
          </p>
        )}
      </div>

      {actions && <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>}
    </div>
  );
};
