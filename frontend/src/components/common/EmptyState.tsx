import React from 'react';
import { Database } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records found',
  message = 'No matching data matches your current search or filter criteria.',
  icon: Icon = Database,
  actionLabel,
  onAction,
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
      <p style={{ fontSize: '12px', color: 'var(--text-dim)', maxWidth: '360px', margin: 0 }}>
        {message}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            marginTop: '8px',
            padding: '7px 14px',
            borderRadius: '5px',
            backgroundColor: 'var(--accent-subtle)',
            border: '1px solid var(--accent)',
            color: 'var(--accent)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
