import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { getCommunities, getCommunityEvidence, getSummary } from '../api';
import type {
  CommunityEvidenceResponse,
  CommunitySummary,
  SummaryResponse,
} from '../types/api';
import type { InvestigationCase } from '../types/cases';
import {
  AddToInvestigationButton,
  Badge,
  Button,
  DataTable,
  EmptyState,
  EntityLink,
  ErrorState,
  FilterBar,
  LoadingState,
  Metric,
  PageHeader,
  Panel,
  RiskBadge,
  RiskScore,
  SearchInput,
  StatusBadge,
} from '../components/common';
import type { Column, FilterOption } from '../components/common';
import { getCases, subscribeToCaseUpdates } from '../utils/caseManager';
import { startPlaybook } from '../utils/playbookManager';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [evidenceMap, setEvidenceMap] = useState<Record<number, CommunityEvidenceResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRisk, setFilterRisk] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cases, setCases] = useState<InvestigationCase[]>([]);

  // Real investigation cases from LocalStorage & live subscription
  const loadCases = () => {
    setCases(getCases());
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, commRes] = await Promise.all([
        getSummary(),
        getCommunities(),
      ]);

      setSummary(sumRes);

      // Sort by ML risk_score descending
      const sorted = [...commRes.items].sort((a, b) => b.risk_score - a.risk_score);
      setCommunities(sorted);

      // Fetch observable evidence in parallel for top 10 priority communities
      const topTriage = sorted.slice(0, 10);
      const evPromises = topTriage.map(async (comm) => {
        try {
          const ev = await getCommunityEvidence(comm.community_id);
          return { id: comm.community_id, data: ev };
        } catch {
          return { id: comm.community_id, data: null };
        }
      });

      const evResults = await Promise.all(evPromises);
      const evMap: Record<number, CommunityEvidenceResponse> = {};
      for (const res of evResults) {
        if (res.data) {
          evMap[res.id] = res.data;
        }
      }
      setEvidenceMap(evMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to TraceLine API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    loadCases();
    const unsub = subscribeToCaseUpdates(loadCases);
    return unsub;
  }, []);

  const handleReviewCommunity = (commId: number) => {
    startPlaybook({
      communityId: commId,
      currentStep: 1,
    });
    navigate(`/communities/${commId}`);
  };

  // Filtered and searched community list
  const filteredCommunities = useMemo(() => {
    return communities.filter((comm) => {
      if (filterRisk !== 'ALL' && comm.risk_level !== filterRisk) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const idMatch =
          `community ${comm.community_id}`.toLowerCase().includes(q) ||
          `#${comm.community_id}`.includes(q) ||
          comm.community_id.toString() === q;
        const tierMatch = comm.risk_level.toLowerCase().includes(q);
        const signalMatch =
          (comm.top_signal_1 && comm.top_signal_1.toLowerCase().includes(q)) ||
          (comm.top_signal_2 && comm.top_signal_2.toLowerCase().includes(q)) ||
          (comm.top_signal_3 && comm.top_signal_3.toLowerCase().includes(q));

        // Also check loaded evidence item titles
        const ev = evidenceMap[comm.community_id];
        const evMatch = ev?.items.some((item) =>
          item.title.toLowerCase().includes(q) || item.type.toLowerCase().includes(q)
        );

        if (!idMatch && !tierMatch && !signalMatch && !evMatch) {
          return false;
        }
      }
      return true;
    });
  }, [communities, filterRisk, searchQuery, evidenceMap]);

  if (loading && !summary) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <LoadingState type="card" count={1} />
        <LoadingState type="table" count={8} />
      </div>
    );
  }

  if (error || !summary) {
    return <ErrorState message={error || undefined} onRetry={loadData} />;
  }

  const highRiskTotal = summary.high_risk_count;
  const mediumRiskTotal = summary.medium_risk_count;
  const lowRiskTotal = summary.low_risk_count;
  const activeCases = cases.filter((c) => c.status !== 'CLOSED');

  const filterOptions: FilterOption[] = [
    { label: 'All', value: 'ALL', count: communities.length },
    { label: 'High', value: 'HIGH', count: highRiskTotal },
    { label: 'Medium', value: 'MEDIUM', count: mediumRiskTotal },
    { label: 'Low', value: 'LOW', count: lowRiskTotal },
  ];

  // Table Columns Definition
  const columns: Column<CommunitySummary>[] = [
    {
      key: 'rank',
      header: 'Priority',
      width: '70px',
      align: 'center',
      render: (_, idx) => {
        const rankNum = idx + 1;
        const isTop3 = rankNum <= 3 && filterRisk === 'ALL';
        return (
          <span
            className="font-mono"
            style={{
              fontWeight: 800,
              fontSize: '12px',
              color: isTop3 ? 'var(--risk-high)' : 'var(--text-dim)',
            }}
          >
            #{rankNum.toString().padStart(2, '0')}
          </span>
        );
      },
    },
    {
      key: 'community_id',
      header: 'Community',
      width: '130px',
      render: (comm) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <EntityLink type="community" id={comm.community_id} />
        </div>
      ),
    },
    {
      key: 'risk_level',
      header: 'Risk',
      width: '90px',
      render: (comm) => <RiskBadge level={comm.risk_level} size="sm" />,
    },
    {
      key: 'risk_score',
      header: 'Risk Score',
      width: '130px',
      render: (comm) => (
        <RiskScore score={comm.risk_score} level={comm.risk_level} size="sm" showBar={true} />
      ),
    },
    {
      key: 'evidence',
      header: 'Evidence',
      width: '150px',
      render: (comm) => {
        const ev = evidenceMap[comm.community_id];
        if (ev) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Score:</span>
                <span
                  className="font-mono"
                  style={{
                    fontWeight: 700,
                    fontSize: '12px',
                    color:
                      ev.evidence_score >= 70
                        ? 'var(--risk-high)'
                        : ev.evidence_score >= 40
                        ? 'var(--risk-med)'
                        : 'var(--risk-low)',
                  }}
                >
                  {ev.evidence_score}/100
                </span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {ev.evidence_count} trigger{ev.evidence_count !== 1 ? 's' : ''} ({ev.high_count} High)
              </span>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              Density {comm.density.toFixed(4)}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
              Rules active
            </span>
          </div>
        );
      },
    },
    {
      key: 'primary_signals',
      header: 'Primary Signals',
      render: (comm) => {
        const ev = evidenceMap[comm.community_id];
        // If real evidence loaded, surface top 2 rule items, otherwise top signals
        const signals = ev?.items.slice(0, 2).map((i) => i.title) || [
          comm.top_signal_1,
          comm.top_signal_2,
        ].filter(Boolean);

        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
            {signals.map((sig, sIdx) => (
              <Badge key={sIdx} variant="neutral" size="sm">
                {sig}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: 'member_count',
      header: 'Members',
      width: '100px',
      align: 'right',
      render: (comm) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {comm.member_count.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'tx_per_member',
      header: 'Tx Density',
      width: '110px',
      align: 'right',
      render: (comm) => (
        <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {comm.tx_per_member ? `${comm.tx_per_member.toFixed(1)} tx/acct` : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      width: '160px',
      align: 'right',
      render: (comm) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
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
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => handleReviewCommunity(comm.community_id)}
          >
            Review
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. PAGE HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <PageHeader
        title="Risk Queue"
        description="Prioritized communities requiring investigation based on network risk and observable evidence."
        badge={<Badge variant="neutral">OBSERVABLE EVIDENCE</Badge>}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge variant="high">{highRiskTotal} High Priority</Badge>
            <Badge variant="med">{mediumRiskTotal} Medium Priority</Badge>
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={loadData}
              title="Refresh queue"
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* 2. QUEUE CONTROLS                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Filter by community ID, risk tier, or signal..."
          width="320px"
        />

        <FilterBar
          options={filterOptions}
          selected={filterRisk}
          onChange={setFilterRisk}
          size="md"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. PRIORITIZED COMMUNITY TABLE (HERO ELEMENT)                      */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="none">
        <DataTable
          columns={columns}
          data={filteredCommunities}
          keyExtractor={(comm) => comm.community_id}
          emptyMessage="No communities match the active filter and search criteria."
        />
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 4. ACTIVE INVESTIGATIONS                                           */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title={`Active Investigations (${activeCases.length})`}
        subtitle="Open forensic dossiers assembled by investigators."
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={ChevronRight}
            iconPosition="right"
            onClick={() => navigate('/investigations')}
          >
            Manage All Cases
          </Button>
        }
        padding={cases.length === 0 ? 'md' : 'sm'}
      >
        {cases.length === 0 ? (
          <EmptyState
            title="No active investigations"
            message="Review prioritized communities in the queue above and select 'Add to Case' to assemble a forensic dossier."
            icon={Briefcase}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
            {cases.slice(0, 4).map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/investigations/${c.id}`)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '5px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'border-color 0.12s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--border-light)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    {c.id}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <StatusBadge status={c.status} size="sm" />
                    <RiskBadge level={c.priority} size="sm" />
                  </div>
                </div>

                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }} className="truncate">
                  {c.title}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '4px', borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {c.targets.length} target{c.targets.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    Open Dossier <ArrowRight size={11} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 5. NETWORK COVERAGE SUMMARY                                        */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title="Network Coverage"
        subtitle="Partition coverage and entity graph indexing metrics."
        padding="md"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <Metric
            label="Indexed Accounts"
            value={summary.account_count.toLocaleString()}
            subtext="100% graph coverage"
          />
          <Metric
            label="Monitored Transactions"
            value={summary.transaction_count.toLocaleString()}
            subtext="Flow events analyzed"
          />
          <Metric
            label="Projected Evidence Edges"
            value={summary.graph_edge_count.toLocaleString()}
            subtext="Multi-entity relationships"
          />
          <Metric
            label="Detected Communities"
            value={`${summary.community_count} Clusters`}
            subtext={`${summary.high_risk_count} High · ${summary.medium_risk_count} Medium · ${summary.low_risk_count} Low`}
          />
        </div>
      </Panel>
    </div>
  );
};
