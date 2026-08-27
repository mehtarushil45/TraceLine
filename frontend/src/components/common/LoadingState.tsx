import React from 'react';
import { LoadingSkeleton } from './LoadingSkeleton';

interface LoadingStateProps {
  type?: 'card' | 'table' | 'detail' | 'graph';
  count?: number;
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  type = 'card',
  count = 3,
  message,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      {message && (
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {message}
        </span>
      )}
      <LoadingSkeleton type={type} count={count} />
    </div>
  );
};
