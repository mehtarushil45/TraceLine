import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  Search,
  ScanSearch,
} from 'lucide-react';
import { getCommunities, getCommunityEvidence } from '../api';
import type { CommunityEvidenceResponse, CommunitySummary } from '../types/api';
import {
  AddToInvestigationButton,
  Badge,
  Button,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  RiskBadge,
  RiskScore,
  SignalBadge,
} from '../components/common';
import type { FilterOption } from '../components/common';

// ---------------------------------------------------------------------------
// Community Intelligence — Page 2
// ---------------------------------------------------------------------------
// Purpose: Browse all detected community partitions and select one to investigate.
// This is the investigation entry point, NOT a duplicate of the Risk Queue.
// Risk Queue = triage/detection desk.
// Communities = investigation target selection.
// /communities/:id = Community Triage brief.
// /forensics?community=:id = deep investigation workspace.
// ---------------------------------------------------------------------------

export const CommunitiesPage: React.FC = () => {
  const navigate = useNavigate();

  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [evidenceMap, setEvidenceMap] = useState<Record<number, CommunityEvidenceResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [riskFilter, setRiskFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Load communities then progressively hydrate evidence scores
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCommunities();
      const sorted = [...res.items].sort((a, b) => b.risk_score - a.risk_score);
      setCommunities(sorted);
      setLoading(false);

      // Progressive evidence hydration — each resolves independently
      sorted.forEach(async (comm) => {
        try {
          const ev = await getCommunityEvidence(comm.community_id);
          if (ev) {
            setEvidenceMap((prev) => ({ ...prev, [comm.community_id]: ev }));
          }
        } catch {
          // Non-blocking
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to TraceLine API');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filterOptions: FilterOption[] = [
    { label: 'All', value: 'ALL', count: communities.length },
    { label: 'High', value: 'HIGH', count: communities.filter((c) => c.risk_level === 'HIGH').length },
    { label: 'Medium', value: 'MEDIUM', count: communities.filter((c) => c.risk_level === 'MEDIUM').length },
    { label: 'Low', value: 'LOW', count: communities.filter((c) => c.risk_level === 'LOW').length },
  ];

  const filtered = useMemo(() => {
    return communities.filter((c) => {
      if (riskFilter !== 'ALL' && c.risk_level !== riskFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        String(c.community_id).includes(q) ||
        `community #${c.community_id}`.includes(q) ||
        `#${c.community_id}`.includes(q) ||
        c.top_signal_1.toLowerCase().includes(q) ||
        c.top_signal_2.toLowerCase().includes(q) ||
        c.top_signal_3.toLowerCase().includes(q) ||
        c.risk_level.toLowerCase().includes(q)
      );
    });
  }, [communities, riskFilter, searchQuery]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <LoadingState type="card" count={4} />
        <LoadingState type="table" count={6} />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={loadData} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <PageHeader
        title="Community Intelligence"
        description="Select a detected community partition to begin a deep forensic investigation. Each cluster was identified through Louvain graph partitioning across the payment network."
        badge={<Badge variant="accent">{communities.length} Detected Clusters</Badge>}
      />

      {/* Toolbar — search + filters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          padding: '12px 16px',
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
        }}
      >
        <div style={{ position: 'relative', width: '320px' }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, signal, or risk tier..."
            style={{
              width: '100%',
              padding: '7px 12px 7px 32px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <FilterBar
          options={filterOptions}
          selected={riskFilter}
          onChange={setRiskFilter}
          size="sm"
        />

        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
          {filtered.length} of {communities.length} clusters
        </span>
      </div>

      {/* Context note — differentiate from Page 1 */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: 'rgba(56, 189, 248, 0.05)',
          border: '1px solid rgba(56, 189, 248, 0.15)',
          borderRadius: '5px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: 'var(--text-secondary)' }}>Investigation Entry Point:</strong>{' '}
        Select a detected community partition to review its triage brief and enter the Forensic Workspace.
        Use the{' '}
        <a
          onClick={() => navigate('/')}
          style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Risk Queue
        </a>{' '}
        for rapid triage and prioritized lead selection.
      </div>

      {/* Community Cards */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
            backgroundColor: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
          }}
        >
          No communities match the current filter.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '12px',
          }}
        >
          {filtered.map((comm) => {
            const ev = evidenceMap[comm.community_id];
            const rank = communities.findIndex((c) => c.community_id === comm.community_id) + 1;

            return (
              <div
                key={comm.community_id}
                style={{
                  backgroundColor: 'var(--bg-panel)',
                  border: `1px solid ${comm.risk_level === 'HIGH' ? 'rgba(244, 63, 94, 0.25)' : 'var(--border)'}`,
                  borderRadius: '6px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                }}
                onClick={() => navigate(`/communities/${comm.community_id}`)}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = comm.risk_level === 'HIGH' ? 'rgba(244, 63, 94, 0.5)' : 'var(--border-light)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = comm.risk_level === 'HIGH' ? 'rgba(244, 63, 94, 0.25)' : 'var(--border)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
                }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        backgroundColor: comm.risk_level === 'HIGH' ? 'rgba(244, 63, 94, 0.12)' : 'var(--bg-input)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Layers size={15} style={{ color: comm.risk_level === 'HIGH' ? '#f87171' : 'var(--text-muted)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span
                        className="font-mono"
                        style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}
                      >
                        Community #{comm.community_id}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Priority #{String(rank).padStart(2, '0')} · {comm.member_count.toLocaleString()} accounts
                      </span>
                    </div>
                  </div>
                  <RiskBadge level={comm.risk_level} size="sm" />
                </div>

                {/* ML Score + Evidence Strength */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-input)',
                      borderRadius: '4px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      ML Risk Score
                    </span>
                    <RiskScore score={comm.risk_score} level={comm.risk_level} size="sm" showBar />
                  </div>
                  <div
                    style={{
                      padding: '8px 10px',
                      backgroundColor: 'var(--bg-input)',
                      borderRadius: '4px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Evidence Strength
                    </span>
                    {ev ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                        <span className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: ev.evidence_score >= 60 ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                          {ev.evidence_score}/100
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                          {ev.evidence_count} triggers · {ev.high_count} high
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                        Loading…
                      </span>
                    )}
                  </div>
                </div>

                {/* Observable signals */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {[comm.top_signal_1, comm.top_signal_2, comm.top_signal_3]
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((sig) => (
                      <SignalBadge key={sig} signal={sig} />
                    ))}
                </div>

                {/* Card footer actions */}
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <AddToInvestigationButton
                    targetType="COMMUNITY"
                    targetId={String(comm.community_id)}
                    targetLabel={`Community #${comm.community_id}`}
                    riskScore={comm.risk_score}
                    riskLevel={comm.risk_level}
                    size="sm"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ScanSearch}
                    iconPosition="right"
                    onClick={() => navigate(`/communities/${comm.community_id}`)}
                  >
                    Investigate
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
