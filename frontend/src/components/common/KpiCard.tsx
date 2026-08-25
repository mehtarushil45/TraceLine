import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'cyan' | 'red' | 'amber' | 'emerald';
  badge?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
  badge,
}) => {
  const variantStyles = {
    default: {
      iconBg: 'rgba(51, 65, 85, 0.4)',
      iconColor: '#94a3b8',
      borderColor: 'var(--border)',
    },
    cyan: {
      iconBg: 'rgba(56, 189, 248, 0.12)',
      iconColor: '#38bdf8',
      borderColor: 'rgba(56, 189, 248, 0.25)',
    },
    red: {
      iconBg: 'rgba(239, 68, 68, 0.12)',
      iconColor: '#ef4444',
      borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    amber: {
      iconBg: 'rgba(245, 158, 11, 0.12)',
      iconColor: '#f59e0b',
      borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    emerald: {
      iconBg: 'rgba(16, 185, 129, 0.12)',
      iconColor: '#10b981',
      borderColor: 'rgba(16, 185, 129, 0.3)',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      className="dash-card"
      style={{
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderColor: style.borderColor,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
          }}
        >
          {title}
        </span>
        <div
          style={{
            padding: '8px',
            borderRadius: '6px',
            backgroundColor: style.iconBg,
            color: style.iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={18} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-main)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.02em',
          }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {badge && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: style.iconBg,
              color: style.iconColor,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {subtitle && (
        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
};
