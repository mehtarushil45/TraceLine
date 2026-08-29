import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  ExternalLink,
  ListFilter,
  Zap,
} from 'lucide-react';
import { getCommunities, getCommunityEvidence, getSummary } from '../api';
import type {
  CommunityEvidenceResponse,
  CommunitySummary,
  EvidenceItem,
  SummaryResponse,
} from '../types/api';
import type { InvestigationCase } from '../types/cases';
import {
  AddToInvestigationButton,
  Badge,
  Button,
  DataTable,
  EntityLink,
  ErrorState,
  FilterBar,
  LoadingState,
  Panel,
  RiskBadge,
  RiskScore,
  SearchInput,
  SignalBadge,
} from '../components/common';
import type { Column, FilterOption } from '../components/common';
import { getCases, isTargetInAnyCase, subscribeToCaseUpdates } from '../utils/caseManager';
import './risk-queue.css';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<number, CommunityEvidenceResponse>>({});
  const [loading, setLoading] = useState(true);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [triageSearchQuery, setTriageSearchQuery] = useState('');
  const [tableFilterRisk, setTableFilterRisk] = useState('ALL');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [cases, setCases] = useState<InvestigationCase[]>([]);

  const loadCases = useCallback(() => {
    setCases(getCases());
  }, []);

  const fetchEvidenceFor = useCallback(async (communityId: number) => {
    try {
      const evidence = await getCommunityEvidence(communityId);
      if (evidence) {
        setEvidenceMap((prev) => ({ ...prev, [communityId]: evidence }));
      }
    } catch {
      // Non-blocking: fallback gracefully
    }
  }, []);

  const loadData = useCallback(async () => {
    // Only trigger full page loading indicator if we don't have initial summary yet
    if (!summary) {
      setLoading(true);
    }
    setError(null);

    try {
      const [summaryResponse, communitiesResponse] = await Promise.all([
        getSummary(),
        getCommunities(),
      ]);
      const sorted = [...communitiesResponse.items].sort((a, b) => b.risk_score - a.risk_score);
      setSummary(summaryResponse);
      setCommunities(sorted);
      loadCases();

      // Automatically select the highest-risk community as initial lead if none selected
      if (sorted.length > 0) {
        setSelectedId((current) =>
          current !== null && sorted.some((c) => c.community_id === current) ? current : sorted[0].community_id
        );
      }

      setLoading(false);
      setEvidenceLoading(true);

      // Progressive hydration: update evidenceMap per-community as each request resolves.
      // Do NOT wait for all 59 — each community row updates the moment its own data arrives.
      let remaining = sorted.length;
      sorted.forEach(async (comm) => {
        try {
          const ev = await getCommunityEvidence(comm.community_id);
          if (ev) {
            setEvidenceMap((prev) => ({ ...prev, [comm.community_id]: ev }));
          }
        } catch {
          // Non-blocking: this community stays in "unavailable" state
        } finally {
          remaining -= 1;
          if (remaining === 0) {
            setEvidenceLoading(false);
          }
        }
      });

      // Safety: if sorted is empty, clear the loading state immediately
      if (sorted.length === 0) {
        setEvidenceLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to TraceLine API');
    } finally {
      setLoading(false);
    }

  }, [loadCases, summary]);

  useEffect(() => {
    loadData();
    const unsub = subscribeToCaseUpdates(loadCases);
    return unsub;
  }, [loadData, loadCases]);

  // When selected lead changes, fetch its evidence dynamically if not cached
  useEffect(() => {
    if (selectedId !== null && !evidenceMap[selectedId]) {
      fetchEvidenceFor(selectedId);
    }
  }, [selectedId, evidenceMap, fetchEvidenceFor]);

  // Filtered communities for the upper left Triage Queue search
  const filteredTriageCommunities = useMemo(() => {
    const query = triageSearchQuery.toLowerCase().trim();
    if (!query) return communities;
    return communities.filter((community) => {
      const evidence = evidenceMap[community.community_id];
      const matchFields = [
        `community #${community.community_id}`,
        `community ${community.community_id}`,
        `#${community.community_id}`,
        String(community.community_id),
        community.risk_level,
        community.top_signal_1,
        community.top_signal_2,
        community.top_signal_3,
        ...((evidence?.items ?? []).flatMap((item) => [
          item.title,
          item.type,
          item.description,
          ...item.supporting_entities,
        ])),
      ];
      return matchFields.some((val) => val?.toLowerCase().includes(query));
    });
  }, [communities, evidenceMap, triageSearchQuery]);

  // Selected lead object for the upper two-column workspace
  const selectedCommunity = useMemo(() => {
    if (selectedId === null) return communities[0] || null;
    return communities.find((c) => c.community_id === selectedId) || communities[0] || null;
  }, [communities, selectedId]);

  const selectedEvidence = useMemo(() => {
    return selectedCommunity ? evidenceMap[selectedCommunity.community_id] : null;
  }, [selectedCommunity, evidenceMap]);

  const selectedCaseInfo = useMemo(() => {
    if (!selectedCommunity) return { inCase: false };
    return isTargetInAnyCase('COMMUNITY', String(selectedCommunity.community_id));
  }, [selectedCommunity, cases]);

  const selectedRank = useMemo(() => {
    if (!selectedCommunity) return 1;
    const index = communities.findIndex((c) => c.community_id === selectedCommunity.community_id);
    return index >= 0 ? index + 1 : 1;
  }, [communities, selectedCommunity]);

  // Up to 3 distinct evidence items for the selected lead
  const distinctEvidenceItems = useMemo(() => {
    if (!selectedEvidence || !selectedEvidence.items.length) return [];
    const seen = new Set<string>();
    const distinct: EvidenceItem[] = [];
    for (const item of selectedEvidence.items) {
      const key = `${item.type}_${item.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        distinct.push(item);
      }
      if (distinct.length === 3) break;
    }
    if (distinct.length < 3) {
      for (const item of selectedEvidence.items) {
        if (!distinct.includes(item)) {
          distinct.push(item);
        }
        if (distinct.length === 3) break;
      }
    }
    return distinct;
  }, [selectedEvidence]);

  // Filtered list for the full directory queue table below
  const tableFilteredCommunities = useMemo(() => {
    return communities.filter((community) => {
      if (tableFilterRisk !== 'ALL' && community.risk_level !== tableFilterRisk) return false;
      const query = tableSearchQuery.toLowerCase().trim();
      if (!query) return true;
      const evidence = evidenceMap[community.community_id];
      const matchFields = [
        `community #${community.community_id}`,
        `community ${community.community_id}`,
        `#${community.community_id}`,
        String(community.community_id),
        community.risk_level,
        community.top_signal_1,
        community.top_signal_2,
        community.top_signal_3,
        ...((evidence?.items ?? []).flatMap((item) => [
          item.title,
          item.type,
          item.description,
          ...item.supporting_entities,
        ])),
      ];
      return matchFields.some((val) => val?.toLowerCase().includes(query));
    });
  }, [communities, evidenceMap, tableFilterRisk, tableSearchQuery]);

  if (loading && !summary) {
    return (
      <div className="risk-queue-page">
        <LoadingState type="card" count={2} />
        <LoadingState type="table" count={8} />
      </div>
    );
  }

  if (error && !summary) {
    return <ErrorState message={error || undefined} onRetry={loadData} />;
  }

  const filterOptions: FilterOption[] = [
    { label: 'All', value: 'ALL', count: communities.length },
    { label: 'High', value: 'HIGH', count: summary?.high_risk_count ?? 0 },
    { label: 'Medium', value: 'MEDIUM', count: summary?.medium_risk_count ?? 0 },
    { label: 'Low', value: 'LOW', count: summary?.low_risk_count ?? 0 },
  ];

  const columns: Column<CommunitySummary>[] = [
    {
      key: 'priority',
      header: 'Priority',
      width: '72px',
      align: 'center',
      render: (community) => {
        const rank = communities.findIndex((c) => c.community_id === community.community_id) + 1;
        return (
          <span className={`rq-rank ${rank <= 3 ? 'rq-rank--top' : ''}`}>
            #{String(rank).padStart(2, '0')}
          </span>
        );
      },
    },
    {
      key: 'community_id',
      header: 'Investigation Target',
      width: '170px',
      render: (community) => (
        <div
          className="rq-community-cell"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            setSelectedId(community.community_id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          title="Select community for investigation"
        >
          <EntityLink type="community" id={community.community_id} />
          <span className="rq-subtext">{community.member_count.toLocaleString()} accounts</span>
        </div>
      ),
    },
    {
      key: 'risk',
      header: 'ML Priority',
      width: '160px',
      render: (community) => (
        <div className="rq-risk-cell">
          <RiskBadge level={community.risk_level} size="sm" />
          <RiskScore score={community.risk_score} level={community.risk_level} size="sm" showBar />
        </div>
      ),
    },
    {
      key: 'signals',
      header: 'Observable Evidence Signals',
      render: (community) => {
        const evidence = evidenceMap[community.community_id];
        const signals =
          evidence?.items.slice(0, 2).map((item) => item.title) ??
          [community.top_signal_1, community.top_signal_2].filter(Boolean);
        return (
          <div className="rq-signals">
            {signals.map((signal) => (
              <SignalBadge key={signal} signal={signal} />
            ))}
          </div>
        );
      },
    },
    {
      key: 'evidence',
      header: 'Evidence Score',
      width: '140px',
      render: (community) => {
        const evidence = evidenceMap[community.community_id];
        if (evidence) {
          return (
            <div className="rq-evidence-cell">
              <strong>{evidence.evidence_score}/100</strong>
              <span>
                {evidence.evidence_count} signal{evidence.evidence_count === 1 ? '' : 's'} · {evidence.high_count} high
              </span>
            </div>
          );
        }

        if (evidenceLoading) {
          return (
            <div className="rq-evidence-cell">
              <span className="rq-subtext">Calculating…</span>
            </div>
          );
        }

        return (
          <div className="rq-evidence-cell">
            <strong>—</strong>
            <span className="rq-subtext" title="Evidence score unavailable for this community">Unavailable</span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Action',
      width: '200px',
      align: 'right',
      render: (community) => (
        <div className="rq-actions" onClick={(e) => e.stopPropagation()}>
          <AddToInvestigationButton
            targetType="COMMUNITY"
            targetId={String(community.community_id)}
            targetLabel={`Community #${community.community_id}`}
            riskScore={community.risk_score}
            riskLevel={community.risk_level}
            size="sm"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => navigate(`/communities/${community.community_id}?tab=overview`)}
          >
            Review
          </Button>
        </div>
      ),
    },
  ];

  return (
    <main className="risk-queue-page">
      {/* 1. Primary Two-Column Investigation Workspace (Directly at top of page) */}
      <section className="rq-triage-workspace" aria-label="Investigation Triage Workspace">
        {/* LEFT: TRIAGE QUEUE (With Dedicated Search Control & Independent Vertical Scroll) */}
        <aside className="rq-triage-rail">
          <div className="rq-triage-rail-header">
            <div className="rq-triage-rail-title">
              <ListFilter size={14} />
              <span>Triage Queue</span>
            </div>
            <span className="rq-triage-rail-count">
              {triageSearchQuery.trim()
                ? `${filteredTriageCommunities.length} ${filteredTriageCommunities.length === 1 ? 'Match' : 'Matches'}`
                : `${communities.length} Leads`}
            </span>
          </div>

          <div className="rq-triage-search-bar">
            <SearchInput
              value={triageSearchQuery}
              onChange={setTriageSearchQuery}
              placeholder="Search community or signal..."
              width="100%"
            />
          </div>

          <div
            className="rq-triage-list"
            role="listbox"
            aria-label="Prioritized investigation leads"
          >
            {filteredTriageCommunities.length > 0 ? (
              filteredTriageCommunities.map((comm) => {
                const isSelected = selectedCommunity?.community_id === comm.community_id;
                const evidence = evidenceMap[comm.community_id];
                const topSignal = evidence?.items[0]?.title ?? comm.top_signal_1;
                const overallRank = communities.findIndex((c) => c.community_id === comm.community_id) + 1;

                return (
                  <button
                    key={comm.community_id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`rq-triage-item ${isSelected ? 'rq-triage-item--active' : ''}`}
                    onClick={() => setSelectedId(comm.community_id)}
                  >
                    <div className="rq-triage-item-rank">
                      <span className={`rq-item-rank-badge ${overallRank <= 3 ? 'rq-item-rank-badge--top' : ''}`}>
                        #{String(overallRank).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="rq-triage-item-body">
                      <div className="rq-triage-item-top">
                        <strong className="rq-triage-item-id">Community #{comm.community_id}</strong>
                        <span className="rq-triage-item-members">{comm.member_count.toLocaleString()} accounts</span>
                      </div>
                      <div className="rq-triage-item-signal" title={topSignal}>
                        {topSignal || 'Observable graph pattern'}
                      </div>
                      <div className="rq-triage-item-meta">
                        {evidence ? (
                          <span className="rq-triage-item-ev">
                            {evidence.evidence_score}/100 ev · {evidence.evidence_count} signals
                          </span>
                        ) : (
                          <span className="rq-triage-item-ev">
                            Density: {(comm.density * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rq-triage-item-score">
                      <RiskBadge level={comm.risk_level} size="sm" />
                      <span className="rq-triage-score-num">{comm.risk_score.toFixed(0)}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rq-triage-empty">
                <AlertTriangle size={16} />
                <strong>No matching communities</strong>
                <span>Try a community ID or observable signal.</span>
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT: SELECTED INVESTIGATION LEAD (Primary Investigation Desk) */}
        <section className="rq-lead-panel">
          {selectedCommunity ? (
            <div className="rq-lead-content">
              {/* Header: Identity, Scorecard, Case Status */}
              <div className="rq-lead-header">
                <div>
                  <div className="rq-lead-eyebrow">
                    <span className="rq-eyebrow-rank">Rank #{selectedRank} of {communities.length}</span>
                    {selectedCaseInfo.inCase ? (
                      <Badge variant="med">
                        <Briefcase size={10} style={{ marginRight: '4px' }} />
                        IN CASE · {selectedCaseInfo.caseTitle || 'Case Dossier'}
                      </Badge>
                    ) : (
                      <Badge variant="neutral">UNASSIGNED LEAD</Badge>
                    )}
                  </div>
                  <h2 className="rq-lead-title">
                    Community #{selectedCommunity.community_id}
                  </h2>
                  <div className="rq-lead-subtitle">
                    {selectedCommunity.member_count.toLocaleString()} member accounts · ${selectedCommunity.total_transaction_amount.toLocaleString()} observable transaction volume · {selectedCommunity.tx_per_member.toFixed(1)} tx/member
                  </div>
                </div>

                <div className="rq-lead-scorecard">
                  <div className="rq-lead-scorecard-item">
                    <span className="rq-scorecard-label">ML Risk Score</span>
                    <div className="rq-scorecard-value">
                      <RiskScore
                        score={selectedCommunity.risk_score}
                        level={selectedCommunity.risk_level}
                        size="lg"
                        showBar
                      />
                    </div>
                  </div>
                  <div className="rq-lead-scorecard-item">
                    <span className="rq-scorecard-label">Evidence Strength</span>
                    <div className="rq-scorecard-ev-score">
                      <strong>{selectedEvidence?.evidence_score ?? '—'}</strong>
                      <small>/ 100</small>
                    </div>
                  </div>
                </div>
              </div>

              {/* Why This Lead is Prioritized (Accurate Factual Rationale) */}
              <div className="rq-lead-rationale">
                <div className="rq-rationale-icon">
                  <Zap size={15} />
                </div>
                <div className="rq-rationale-text">
                  <div className="rq-rationale-title-row">
                    <strong>Why this lead is prioritized:</strong>
                    <span className="rq-rationale-meta-tags">
                      Rank #{selectedRank} of {communities.length} · ML Risk Score: {selectedCommunity.risk_score.toFixed(0)}/100 · Evidence Strength: {selectedEvidence ? `${selectedEvidence.evidence_score}/100` : 'Calculating...'}
                    </span>
                  </div>
                  <p>
                    Ranked #{selectedRank} of {communities.length} based on an ML risk score of {selectedCommunity.risk_score.toFixed(0)}/100. Corroborated by {selectedEvidence ? `${selectedEvidence.evidence_count} observable signals, including ${selectedEvidence.high_count} high-severity signals, across ${selectedCommunity.member_count.toLocaleString()} member accounts` : `observable graph signals across ${selectedCommunity.member_count.toLocaleString()} member accounts`}, with an internal network density of {(selectedCommunity.density * 100).toFixed(2)}% and {selectedCommunity.tx_per_member.toFixed(1)} average transactions per member generating ${selectedCommunity.total_transaction_amount.toLocaleString()} in total observable transaction volume.
                  </p>
                </div>
              </div>

              {/* Observable Evidence Signals */}
              <div className="rq-lead-section">
                <div className="rq-section-heading">
                  <span>Observable Evidence Signals</span>
                  <small>
                    {selectedEvidence
                      ? `${selectedEvidence.evidence_count} signals (${selectedEvidence.high_count} high severity)`
                      : 'Deterministic graph & entity rules'}
                  </small>
                </div>

                <div className="rq-evidence-grid">
                  {distinctEvidenceItems.length > 0 ? (
                    distinctEvidenceItems.map((item) => (
                      <div key={item.evidence_id} className={`rq-ev-card rq-ev-card--${item.severity.toLowerCase()}`}>
                        <div className="rq-ev-card-top">
                          <span className="rq-ev-card-type">{item.type.replace(/_/g, ' ')}</span>
                          <Badge
                            variant={
                              item.severity === 'HIGH'
                                ? 'high'
                                : item.severity === 'MEDIUM'
                                ? 'med'
                                : 'low'
                            }
                            size="sm"
                          >
                            {item.severity}
                          </Badge>
                        </div>
                        <strong className="rq-ev-card-title">{item.title}</strong>
                        <p className="rq-ev-card-desc">{item.description}</p>
                        <div className="rq-ev-card-footer">
                          {item.score_contribution > 0 ? (
                            <span className="rq-ev-pts">Contribution: +{item.score_contribution.toFixed(0)} pts</span>
                          ) : (
                            <span className="rq-ev-pts">Observable rule</span>
                          )}
                          {item.supporting_entities.length > 0 && (
                            <span>{item.supporting_entities.length} supporting entit{item.supporting_entities.length === 1 ? 'y' : 'ies'}</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    // Fallback to top signals if evidence detail is still loading
                    [selectedCommunity.top_signal_1, selectedCommunity.top_signal_2, selectedCommunity.top_signal_3]
                      .filter(Boolean)
                      .map((signal, sIdx) => (
                        <div key={sIdx} className="rq-ev-card rq-ev-card--high">
                          <div className="rq-ev-card-top">
                            <span className="rq-ev-card-type">GRAPH TOPOLOGY</span>
                            <Badge variant={sIdx === 0 ? 'high' : 'med'} size="sm">
                              {sIdx === 0 ? 'HIGH' : 'MEDIUM'}
                            </Badge>
                          </div>
                          <strong className="rq-ev-card-title">{signal}</strong>
                          <p className="rq-ev-card-desc">
                            Observable structural pattern detected during graph community analysis.
                          </p>
                          <div className="rq-ev-card-footer">
                            <span className="rq-ev-pts">Top Signal #{sIdx + 1}</span>
                            <span>Structural pattern</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Network & Entity Context Stats */}
              <div className="rq-lead-metrics">
                <div className="rq-metric-tile">
                  <span>MEMBER ACCOUNTS</span>
                  <strong>{selectedCommunity.member_count.toLocaleString()}</strong>
                  <small>Accounts in community</small>
                </div>
                <div className="rq-metric-tile">
                  <span>NETWORK DENSITY</span>
                  <strong>{(selectedCommunity.density * 100).toFixed(2)}%</strong>
                  <small>Internal edge ratio</small>
                </div>
                <div className="rq-metric-tile">
                  <span>TX PER MEMBER</span>
                  <strong>{selectedCommunity.tx_per_member.toFixed(1)}</strong>
                  <small>Avg activity intensity</small>
                </div>
                <div className="rq-metric-tile">
                  <span>TOTAL VOLUME</span>
                  <strong>${selectedCommunity.total_transaction_amount.toLocaleString()}</strong>
                  <small>Total observable tx sum</small>
                </div>
              </div>

              {/* Investigation Decision / Next Action Area */}
              <div className="rq-decision-area">
                <div className="rq-decision-header">
                  <span className="rq-decision-label">INVESTIGATION DECISION & NEXT ACTION</span>
                  <small className="rq-decision-target">Target: Community #{selectedCommunity.community_id}</small>
                </div>
                <div className="rq-decision-actions">
                  <div className="rq-decision-action-item">
                    <div className="rq-decision-desc">
                      <strong>Inspect Community</strong>
                      <span>Review full interactive network graph, transaction timeline, and member accounts.</span>
                    </div>
                    <Button
                      variant="primary"
                      size="md"
                      icon={ArrowRight}
                      iconPosition="right"
                      onClick={() => navigate(`/communities/${selectedCommunity.community_id}?tab=overview`)}
                    >
                      Inspect Community
                    </Button>
                  </div>

                  <div className="rq-decision-action-item">
                    <div className="rq-decision-desc">
                      <strong>{selectedCaseInfo.inCase ? 'Open Case Dossier' : 'Add to Case Dossier'}</strong>
                      <span>{selectedCaseInfo.inCase ? `View this lead inside "${selectedCaseInfo.caseTitle}".` : 'Preserve this lead and observable evidence in an investigator dossier.'}</span>
                    </div>
                    {selectedCaseInfo.inCase && selectedCaseInfo.caseId ? (
                      <Button
                        variant="secondary"
                        size="md"
                        icon={ExternalLink}
                        onClick={() => navigate(`/investigations/${selectedCaseInfo.caseId}`)}
                      >
                        Open Dossier
                      </Button>
                    ) : (
                      <AddToInvestigationButton
                        targetType="COMMUNITY"
                        targetId={String(selectedCommunity.community_id)}
                        targetLabel={`Community #${selectedCommunity.community_id}`}
                        riskScore={selectedCommunity.risk_score}
                        riskLevel={selectedCommunity.risk_level}
                        size="md"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rq-lead-empty">
              <AlertTriangle size={24} />
              <p>Select a community from the triage queue to view investigation evidence.</p>
            </div>
          )}
        </section>
      </section>

      {/* 2. Full Investigation Queue (Below Workspace: Complete Directory) */}
      <Panel padding="none" className="rq-table-panel">
        <div className="rq-queue-toolbar">
          <div>
            <div className="rq-toolbar-title">
              Full Investigation Queue <span>{tableFilteredCommunities.length} communities</span>
            </div>
            <p>
              Complete ranked directory. Search, filter by risk tier, or select a community to review.
            </p>
          </div>
          <div className="rq-controls">
            <SearchInput
              value={tableSearchQuery}
              onChange={setTableSearchQuery}
              placeholder="Search ID, account, merchant, or signal..."
              width="280px"
            />
            <FilterBar
              options={filterOptions}
              selected={tableFilterRisk}
              onChange={setTableFilterRisk}
              size="sm"
            />
          </div>
        </div>
        <DataTable
          className="rq-table"
          columns={columns}
          data={tableFilteredCommunities}
          keyExtractor={(community) => community.community_id}
          emptyMessage="No communities match the active search or filter controls."
        />
      </Panel>
    </main>
  );
};
