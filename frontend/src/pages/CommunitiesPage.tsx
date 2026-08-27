import React, { useEffect, useState } from 'react';
import { getCommunities } from '../api';
import type { CommunitySummary } from '../types/api';
import { CommunityTable } from '../components/community/CommunityTable';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { PageHeader } from '../components/common/PageHeader';
import { Badge } from '../components/common/Badge';

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
      <PageHeader
        title="Community Registry"
        description="Graph partition clusters identified through Louvain community detection across multi-entity payment evidence networks."
        badge={<Badge variant="accent">{communities.length || 59} Clusters</Badge>}
      />

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
