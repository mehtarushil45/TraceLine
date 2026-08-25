import React from 'react';
import { Database } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: LucideIcon;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records found',
  message = 'No matching data matches your current search or filter criteria.',
  icon: Icon = Database,
}) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '12px',
        color: 'var(--text-dim)',
      }}
    >
      <div
        style={{
          padding: '12px',
          borderRadius: '8px',
          backgroundColor: 'rgba(51, 65, 85, 0.2)',
          color: 'var(--text-muted)',
        }}
      >
        <Icon size={24} />
      </div>
      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>
        {title}
      </span>
      <p style={{ fontSize: '12px', color: 'var(--text-dim)', maxWidth: '360px' }}>
        {message}
      </p>
    </div>
  );
};
