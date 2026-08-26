import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load data',
  message = 'An unexpected network error occurred. Please verify that the TraceLine API is running and reachable.',
  onRetry,
}) => {
  return (
    <div
      className="dash-card"
      style={{
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '16px',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
      }}
    >
      <div
        style={{
          padding: '12px',
          borderRadius: '50%',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
        }}
      >
        <AlertTriangle size={28} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '480px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fca5a5' }}>
          {title}
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {message}
        </p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#1e293b',
            border: '1px solid var(--border-light)',
            borderRadius: '6px',
            color: 'var(--text-main)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#334155')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#1e293b')}
        >
          <RefreshCw size={14} />
          Retry Request
        </button>
      )}
    </div>
  );
};
