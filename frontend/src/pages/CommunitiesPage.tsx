import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { getCommunities } from '../api';
import type { CommunitySummary } from '../types/api';
import { CommunityTable } from '../components/community/CommunityTable';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';

export const CommunitiesPage: React.FC = () => {
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCommunities();
      setCommunities(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch communities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 240, 255, 0.15)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                color: 'var(--accent-cyan)',
              }}
            >
              <Layers size={20} />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Louvain Partition Communities
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Unsupervised Louvain community detection (resolution=1.0, seed=42) partitioning 50,000 payment accounts across 2.6M evidence edges.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: '#070d1e',
              border: '1px solid var(--border)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            59 Total Clusters · 100% Node Coverage
          </span>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton type="table" count={8} />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <CommunityTable communities={communities} />
      )}
    </div>
  );
};
