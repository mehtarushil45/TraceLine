import React from 'react';

interface LoadingSkeletonProps {
  type?: 'card' | 'table' | 'detail' | 'graph';
  count?: number;
  height?: string | number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  type = 'card',
  count = 1,
  height,
}) => {
  if (type === 'card') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="dash-card skeleton"
            style={{ height: height || '120px', padding: '16px' }}
          />
        ))}
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="dash-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="skeleton" style={{ height: '32px', width: '100%' }} />
        {Array.from({ length: count || 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '40px', width: '100%' }} />
        ))}
      </div>
    );
  }

  if (type === 'graph') {
    return (
      <div
        className="dash-card skeleton"
        style={{
          height: height || '480px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Loading graph topology...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="skeleton" style={{ height: '48px', width: '60%' }} />
      <div className="skeleton" style={{ height: '140px', width: '100%' }} />
      <div className="skeleton" style={{ height: '200px', width: '100%' }} />
    </div>
  );
};
