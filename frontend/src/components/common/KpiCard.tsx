import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'cyan' | 'red' | 'amber' | 'emerald';
  badge?: string;
  trend?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
  badge,
  trend,
}) => {
  const variantStyles = {
    default: {
      iconBg: 'rgba(51, 65, 85, 0.4)',
      iconColor: '#94a3b8',
      borderColor: 'var(--border)',
      glow: 'transparent',
    },
    cyan: {
      iconBg: 'rgba(0, 240, 255, 0.15)',
      iconColor: '#00F0FF',
      borderColor: 'rgba(0, 240, 255, 0.3)',
      glow: 'rgba(0, 240, 255, 0.08)',
    },
    red: {
      iconBg: 'rgba(244, 63, 94, 0.15)',
      iconColor: '#f43f5e',
      borderColor: 'rgba(244, 63, 94, 0.35)',
      glow: 'rgba(244, 63, 94, 0.08)',
    },
    amber: {
      iconBg: 'rgba(251, 191, 36, 0.15)',
      iconColor: '#fbbf24',
      borderColor: 'rgba(251, 191, 36, 0.35)',
      glow: 'rgba(251, 191, 36, 0.08)',
    },
    emerald: {
      iconBg: 'rgba(16, 185, 129, 0.15)',
      iconColor: '#10b981',
      borderColor: 'rgba(16, 185, 129, 0.35)',
      glow: 'rgba(16, 185, 129, 0.08)',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      className="dash-card"
      style={{
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderColor: style.borderColor,
        position: 'relative',
        overflow: 'hidden',
        background: `radial-gradient(circle at 90% 10%, ${style.glow} 0%, rgba(11, 19, 41, 0.85) 70%)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-dim)',
          }}
        >
          {title}
        </span>
        <div
          style={{
            padding: '8px',
            borderRadius: '8px',
            backgroundColor: style.iconBg,
            color: style.iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 12px ${style.glow}`,
          }}
        >
          <Icon size={18} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span
          style={{
            fontSize: '28px',
            fontWeight: 800,
            color: '#f8fafc',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.03em',
            lineHeight: 1,
          }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {badge && (
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: style.iconBg,
              color: style.iconColor,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {badge}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
        {subtitle && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {subtitle}
          </span>
        )}
        {trend && (
          <span style={{ fontSize: '11px', color: '#10b981', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};
