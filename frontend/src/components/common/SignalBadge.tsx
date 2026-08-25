import React from 'react';
import { AlertCircle, Clock, Cpu, CreditCard, DollarSign, Network, Smartphone } from 'lucide-react';

interface SignalBadgeProps {
  signal: string;
}

export const SignalBadge: React.FC<SignalBadgeProps> = ({ signal }) => {
  if (!signal) return null;

  const sLower = signal.toLowerCase();
  let Icon = AlertCircle;
  let color = '#94a3b8';
  let bg = 'rgba(51, 65, 85, 0.3)';
  let border = 'rgba(51, 65, 85, 0.5)';

  if (sLower.includes('device')) {
    Icon = Smartphone;
    color = '#f87171'; // red/coral
    bg = 'rgba(239, 68, 68, 0.12)';
    border = 'rgba(239, 68, 68, 0.3)';
  } else if (sLower.includes('instrument') || sLower.includes('payment')) {
    Icon = CreditCard;
    color = '#fbbf24'; // amber
    bg = 'rgba(245, 158, 11, 0.12)';
    border = 'rgba(245, 158, 11, 0.3)';
  } else if (sLower.includes('temporal') || sLower.includes('gap') || sLower.includes('timing')) {
    Icon = Clock;
    color = '#38bdf8'; // sky
    bg = 'rgba(56, 189, 248, 0.12)';
    border = 'rgba(56, 189, 248, 0.3)';
  } else if (sLower.includes('ip') || sLower.includes('network')) {
    Icon = Network;
    color = '#c084fc'; // purple
    bg = 'rgba(192, 132, 252, 0.12)';
    border = 'rgba(192, 132, 252, 0.3)';
  } else if (sLower.includes('amount') || sLower.includes('financial') || sLower.includes('declined')) {
    Icon = DollarSign;
    color = '#34d399'; // emerald
    bg = 'rgba(52, 211, 153, 0.12)';
    border = 'rgba(52, 211, 153, 0.3)';
  } else if (sLower.includes('weight') || sLower.includes('density')) {
    Icon = Cpu;
    color = '#fb923c'; // orange
    bg = 'rgba(251, 146, 60, 0.12)';
    border = 'rgba(251, 146, 60, 0.3)';
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '5px',
        backgroundColor: bg,
        border: `1px solid ${border}`,
        fontSize: '11px',
        fontWeight: 600,
        color,
        letterSpacing: '0.01em',
        lineHeight: 1.3,
      }}
    >
      <Icon size={12} style={{ flexShrink: 0 }} />
      <span>{signal}</span>
    </span>
  );
};
