import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  X,
} from 'lucide-react';
import type { CasePriority, CaseStatus, InvestigationCase } from '../types/cases';
import {
  addTargetToCase,
  createCase,
  getCase,
  subscribeToCaseUpdates,
  updateCase,
} from '../utils/caseManager';
import {
  getCommunity,
  getCommunityAccounts,
  getCommunityEvidence,
  getCommunityGraph,
  getCommunityTimeline,
} from '../api';
import type {
  AccountSummary,
  CommunityDetailResponse,
  CommunityEvidenceResponse,
  CommunityGraphResponse,
  EvidenceItem,
  TimelineEvent,
} from '../types/api';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
} from '../components/common';
import { NetworkGraph } from '../components/graph/NetworkGraph';
import { CaseDossierModal } from '../components/layout/CaseDossierModal';
import { SarExportModal } from '../components/layout/SarExportModal';

// Investigation Workspace Sections (Page 3)
import '../components/investigation/investigation.css';
import { InvestigationCommandBar } from '../components/investigation/InvestigationCommandBar';
import { InvestigationVerdictStrip } from '../components/investigation/InvestigationVerdictStrip';
import { FraudStoryTimeline } from '../components/investigation/FraudStoryTimeline';
import { MoneyMovementFlow } from '../components/investigation/MoneyMovementFlow';
import { EvidenceConvergencePanel } from '../components/investigation/EvidenceConvergencePanel';
import { HypothesisEnginePanel } from '../components/investigation/HypothesisEnginePanel';
import { EntityRoleMatrix } from '../components/investigation/EntityRoleMatrix';
import { InfrastructureIntelligence } from '../components/investigation/InfrastructureIntelligence';
import { BehavioralAnomalyIndicatorProps } from '../components/investigation/BehavioralAnomalyIndicator';
import { RecommendedActionsPanel } from '../components/investigation/RecommendedActionsPanel';
import { InvestigatorNarrativeBlock } from '../components/investigation/InvestigatorNarrativeBlock';
import { CaseReadinessAudit } from '../components/investigation/CaseReadinessAudit';

export const CaseDetailPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [investigationCase, setInvestigationCase] = useState<InvestigationCase | null>(null);
  const [notes, setNotes] = useState('');
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<string | null>(null);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isAddTargetModalOpen, setIsAddTargetModalOpen] = useState(false);
  const [newTargetType, setNewTargetType] = useState<'COMMUNITY' | 'ACCOUNT' | 'TRANSACTION'>('COMMUNITY');
  const [newTargetId, setNewTargetId] = useState('');

  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

  // Enriched workspace data
  const [community, setCommunity] = useState<CommunityDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<CommunityEvidenceResponse | null>(null);
  const [graphData, setGraphData] = useState<CommunityGraphResponse | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(true);

  // Synchronized graph focus state
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState<EvidenceItem | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Load Case and synchronize with localStorage
  // ---------------------------------------------------------------------------
  const loadCase = useCallback(() => {
    if (!caseId) return;
    let c = getCase(caseId);

    // If case not found and caseId looks like a numeric community ID, create a case on demand
    if (!c && !caseId.startsWith('case_')) {
      const commId = caseId.replace('comm_', '');
      c = createCase(`Investigation: Community #${commId}`, 'HIGH', {
        type: 'COMMUNITY',
        id: commId,
        label: `Community #${commId}`,
        riskLevel: 'HIGH',
        addedAt: new Date().toISOString(),
      });
    }

    if (c) {
      setInvestigationCase(c);
      setNotes(c.notes || '');
      if (!lastSavedTimestamp) {
        setLastSavedTimestamp(new Date(c.updatedAt).toLocaleTimeString());
      }
    }
  }, [caseId, lastSavedTimestamp]);

  useEffect(() => {
    loadCase();
    const unsub = subscribeToCaseUpdates(loadCase);
    return unsub;
  }, [loadCase]);

  // ---------------------------------------------------------------------------
  // Fetch Enriched Data for Primary Target
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!investigationCase) return;

    const primaryCommTarget = investigationCase.targets.find((t) => t.type === 'COMMUNITY');
    const commId = primaryCommTarget ? primaryCommTarget.id : '3'; // Default to prioritized community if no community in targets

    setLoadingDetails(true);

    Promise.allSettled([
      getCommunity(commId),
      getCommunityEvidence(commId),
      getCommunityGraph(commId, 200, 500),
      getCommunityTimeline(commId, 100, 0),
      getCommunityAccounts(commId, 1, 50),
    ])
      .then(([commRes, evRes, graphRes, timeRes, accRes]) => {
        if (commRes.status === 'fulfilled') setCommunity(commRes.value);
        if (evRes.status === 'fulfilled') setEvidence(evRes.value);
        if (graphRes.status === 'fulfilled') setGraphData(graphRes.value);
        if (timeRes.status === 'fulfilled') setTimelineEvents(timeRes.value.events);
        if (accRes.status === 'fulfilled') setAccounts(accRes.value.items);
      })
      .finally(() => {
        setLoadingDetails(false);
      });
  }, [investigationCase?.id]);

  // ---------------------------------------------------------------------------
  // Case Updates Handlers
  // ---------------------------------------------------------------------------
  const handleStatusChange = (status: CaseStatus) => {
    if (!caseId) return;
    updateCase(caseId, { status });
  };

  const handlePriorityChange = (priority: CasePriority) => {
    if (!caseId) return;
    updateCase(caseId, { priority });
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    setIsSavingNotes(true);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (caseId) {
        updateCase(caseId, { notes: val });
        setLastSavedTimestamp(new Date().toLocaleTimeString());
        setIsSavingNotes(false);
      }
    }, 600);
  };

  const handleAddTargetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || !newTargetId.trim()) return;

    const trimmed = newTargetId.trim();
    addTargetToCase(caseId, {
      type: newTargetType,
      id: trimmed,
      label: `${newTargetType} ${trimmed}`,
      addedAt: new Date().toISOString(),
    });

    setNewTargetId('');
    setIsAddTargetModalOpen(false);
  };

  // Cross-component focus handlers
  const handleSelectEvidence = (item: EvidenceItem) => {
    setSelectedEvidenceItem(item);
    document.getElementById('inv-graph-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleFocusAccountInGraph = (accountId: string) => {
    setFocusedNodeId(accountId);
    document.getElementById('inv-graph-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleScrollToTimeline = () => {
    document.getElementById('inv-timeline-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleScrollToFlow = () => {
    document.getElementById('inv-flow-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleScrollToActions = () => {
    document.getElementById('inv-actions-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!investigationCase) {
    return (
      <ErrorState
        title="Investigation Workspace Unavailable"
        message={`Case #${caseId} could not be retrieved from the workspace directory.`}
        onRetry={() => navigate('/investigations')}
      />
    );
  }

  const primaryCommunity = community;

  return (
    <div className="inv-workspace">
      {/* ------------------------------------------------------------------ */}
      {/* SECTION 1: INVESTIGATION COMMAND BAR                              */}
      {/* ------------------------------------------------------------------ */}
      <InvestigationCommandBar
        investigationCase={investigationCase}
        primaryCommunityId={primaryCommunity?.community_id}
        riskLevel={primaryCommunity?.risk_level || 'HIGH'}
        onStatusChange={handleStatusChange}
        onPriorityChange={handlePriorityChange}
        onOpenDossierModal={() => setIsDossierModalOpen(true)}
        onOpenSarModal={() => setIsSarModalOpen(true)}
        onOpenAddTarget={() => setIsAddTargetModalOpen(true)}
      />

      {loadingDetails ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <LoadingState type="card" count={2} />
          <LoadingState type="table" count={4} />
        </div>
      ) : primaryCommunity ? (
        <>
          {/* ------------------------------------------------------------------ */}
          {/* SECTION 2: INVESTIGATION VERDICT STRIP                            */}
          {/* ------------------------------------------------------------------ */}
          <InvestigationVerdictStrip
            community={primaryCommunity}
            evidence={evidence}
            signalFamiliesCount={5}
            skepticismCount={2}
            onScrollToTimeline={handleScrollToTimeline}
            onScrollToActions={handleScrollToActions}
          />

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 3: THE FRAUD STORY / OPERATION TIMELINE                    */}
          {/* ------------------------------------------------------------------ */}
          <div id="inv-timeline-section" style={{ scrollMarginTop: '20px' }}>
            <FraudStoryTimeline
              community={primaryCommunity}
              evidence={evidence}
              timelineEvents={timelineEvents}
              accounts={accounts}
              onSelectEvidence={handleSelectEvidence}
            />
          </div>

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 4: "HOW THE OPERATION MOVED" (MONEY MOVEMENT FLOW)        */}
          {/* ------------------------------------------------------------------ */}
          <div id="inv-flow-section" style={{ scrollMarginTop: '20px' }}>
            <MoneyMovementFlow
              timelineEvents={timelineEvents}
              onFocusAccountInGraph={handleFocusAccountInGraph}
            />
          </div>

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 5: EVIDENCE CONVERGENCE                                   */}
          {/* ------------------------------------------------------------------ */}
          <EvidenceConvergencePanel
            evidence={evidence}
            onSelectEvidence={handleSelectEvidence}
          />

          {/* ------------------------------------------------------------------ */}
          {/* SECTIONS 6 & 7: HYPOTHESIS ENGINE & SKEPTICISM                    */}
          {/* ------------------------------------------------------------------ */}
          <HypothesisEnginePanel
            community={primaryCommunity}
            evidence={evidence}
          />

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 8: ENTITY ROLE CLASSIFICATION MATRIX                      */}
          {/* ------------------------------------------------------------------ */}
          <EntityRoleMatrix
            graphData={graphData}
            timelineEvents={timelineEvents}
            onFocusAccountInGraph={handleFocusAccountInGraph}
          />

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 9: INFRASTRUCTURE LINKAGE INTELLIGENCE                    */}
          {/* ------------------------------------------------------------------ */}
          <InfrastructureIntelligence
            community={primaryCommunity}
            graphData={graphData}
          />

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 10: BEHAVIORAL & TEMPORAL ANOMALIES                       */}
          {/* ------------------------------------------------------------------ */}
          <BehavioralAnomalyIndicatorProps
            community={primaryCommunity}
          />

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 11: INVESTIGATION GRAPH (HERO INSTRUMENT)                 */}
          {/* ------------------------------------------------------------------ */}
          <div id="inv-graph-section" style={{ scrollMarginTop: '20px' }}>
            <Panel
              title="Investigation Topology & Network Graph"
              subtitle="Synchronized forensic topology canvas displaying partition nodes, hub connectivity, and active evidence focus."
              padding="none"
            >
              {graphData ? (
                <NetworkGraph
                  graphData={graphData}
                  height="600px"
                  evidenceFocus={selectedEvidenceItem}
                  allEvidenceItems={evidence?.items || []}
                  initialSelectedNodeId={focusedNodeId}
                  onClearFocus={() => {
                    setSelectedEvidenceItem(null);
                    setFocusedNodeId(null);
                  }}
                />
              ) : (
                <LoadingState type="graph" />
              )}
            </Panel>
          </div>

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 12: RECOMMENDED NEXT ACTIONS                               */}
          {/* ------------------------------------------------------------------ */}
          <div id="inv-actions-section" style={{ scrollMarginTop: '20px' }}>
            <RecommendedActionsPanel
              community={primaryCommunity}
              evidence={evidence}
              graphData={graphData}
              onFocusAccountInGraph={handleFocusAccountInGraph}
              onScrollToFlow={handleScrollToFlow}
            />
          </div>

          {/* ------------------------------------------------------------------ */}
          {/* SECTIONS 13 & 14: CASE NARRATIVE & EVIDENCE TRACEABILITY          */}
          {/* ------------------------------------------------------------------ */}
          <InvestigatorNarrativeBlock
            community={primaryCommunity}
            evidence={evidence}
          />

          {/* ------------------------------------------------------------------ */}
          {/* CASE NOTES & INVESTIGATOR LOG                                     */}
          {/* ------------------------------------------------------------------ */}
          <Panel
            title="Investigator Case Notes & Log"
            subtitle="Record analytical observations, subpoenas, SAR filing rationale, and case progress."
            padding="md"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <textarea
                value={notes}
                onChange={handleNotesChange}
                placeholder="Type investigation notes, hypothesis validations, or SAR rationale here (auto-saves to local dossier)..."
                rows={5}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span>{isSavingNotes ? 'Saving note changes...' : `Last saved: ${lastSavedTimestamp || 'Auto-saved'}`}</span>
                <span>Case ID: <code className="font-mono">{investigationCase.id}</code></span>
              </div>
            </div>
          </Panel>

          {/* ------------------------------------------------------------------ */}
          {/* SECTION 15: CASE READINESS & FILING AUDIT                         */}
          {/* ------------------------------------------------------------------ */}
          <CaseReadinessAudit
            onOpenDossierModal={() => setIsDossierModalOpen(true)}
            onOpenSarModal={() => setIsSarModalOpen(true)}
          />
        </>
      ) : (
        <EmptyState
          title="No Investigation Target Data"
          message="No active target data could be resolved for this case."
        />
      )}

      {/* Add Target Modal */}
      {isAddTargetModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setIsAddTargetModalOpen(false)}
        >
          <div
            style={{
              width: '420px',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Add Target to Case</strong>
              <button
                onClick={() => setIsAddTargetModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddTargetSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 700 }}>TARGET TYPE</label>
                <select
                  value={newTargetType}
                  onChange={(e) => setNewTargetType(e.target.value as any)}
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    fontSize: '12px',
                  }}
                >
                  <option value="COMMUNITY">Community</option>
                  <option value="ACCOUNT">Account</option>
                  <option value="TRANSACTION">Transaction</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 700 }}>TARGET IDENTIFIER (ID)</label>
                <input
                  type="text"
                  value={newTargetId}
                  onChange={(e) => setNewTargetId(e.target.value)}
                  placeholder="e.g. 3, acc_18902, or tx_9921"
                  required
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <Button variant="secondary" size="sm" onClick={() => setIsAddTargetModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit">
                  Add Target
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CaseDossierModal
        isOpen={isDossierModalOpen}
        onClose={() => setIsDossierModalOpen(false)}
        investigationCase={investigationCase}
      />

      <SarExportModal
        isOpen={isSarModalOpen}
        onClose={() => setIsSarModalOpen(false)}
      />
    </div>
  );
};
