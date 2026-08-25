import React, { useEffect, useState } from 'react';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
          Detected Louvain Communities
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Explore all 59 network partitions detected via Louvain community detection (resolution=1.0) and scored with ML risk models.
        </p>
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
