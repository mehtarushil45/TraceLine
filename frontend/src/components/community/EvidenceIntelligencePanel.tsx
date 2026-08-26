/**
 * EvidenceIntelligencePanel
 *
 * Displays live, observable-only evidence from:
 *   - GET /api/communities/{id}/evidence  (when communityId is provided)
 *   - GET /api/accounts/{id}/evidence     (when accountId is provided)
 *
 * Provides:
 *  - Evidence summary (score arc, HIGH/MEDIUM/LOW counts, entity context)
 *  - Severity filter chips with execution runtime
 *  - Expandable evidence cards with:
 *      - Severity badge + evidence type label
 *      - Human-readable title + full forensic explanation
 *      - Category description (investigator context)
 *      - Observable metrics grid
 *      - Supporting entities (account IDs, device IDs, IP addresses, instruments)
 *      - "Explore in Graph" action (highlights in community graph)
 *      - "Add to Investigation" action (targets individual entities or peer accounts)
 *
 * Leakage contract: never exposes pattern_id, is_ring_member, link_type,
 * fraud_purity, max_ring_coverage, primary_ring_id, or is_positive.
 *
 * Evidence Score ≠ Risk Score:
 *   risk_score     = ML-derived ensemble prioritization
 *   evidence_score = deterministic observable rule strength (this engine)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  CreditCard,
  ExternalLink,
  GitMerge,
  Globe,
  Info,
  Layers,
  Network,
  ScanSearch,
  Shield,
  Smartphone,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { getAccountEvidence, getCommunityEvidence } from '../../api';
import type {
  AccountEvidenceResponse,
  CommunityEvidenceResponse,
  CommunityGraphResponse,
  EvidenceItem,
  EvidenceSeverity,
  EvidenceType,
} from '../../types/api';
import { AddToInvestigationButton } from '../common/AddToInvestigationButton';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EvidenceIntelligencePanelProps {
  /** Provide either communityId OR accountId */
  communityId?: number;
  accountId?: string;
  /** Optional parent community ID when displaying in account scope */
  parentCommunityId?: number | null;
  /** Fired when the investigator clicks "Explore in Graph" on an evidence item. */
  onExploreInGraph?: (item: EvidenceItem) => void;
  /**
   * Optional: the loaded graph data. Used to validate which supporting
   * entities are actually account nodes. If not provided, all items with
   * supporting_entities are treated as explorable.
   */
  graphData?: CommunityGraphResponse | null;
}

// ---------------------------------------------------------------------------
// Evidence type metadata
// ---------------------------------------------------------------------------

interface EvidenceMeta {
  icon: React.ElementType;
  label: string;
  hexColor: string;
  categoryDescription: string;
}

const EVIDENCE_META: Record<EvidenceType, EvidenceMeta> = {
  SHARED_INSTRUMENT_CONCENTRATION: {
    icon: CreditCard,
    label: 'Shared Payment Instrument',
    hexColor: '#fbbf24',
    categoryDescription: 'Multiple accounts share the same payment credential — observable infrastructure overlap.',
  },
  DEVICE_REUSE: {
    icon: Smartphone,
    label: 'Device Reuse',
    hexColor: '#fb7185',
    categoryDescription: 'Multiple accounts operate from the same hardware device fingerprint.',
  },
  IP_CONCENTRATION: {
    icon: Globe,
    label: 'IP Concentration',
    hexColor: '#60a5fa',
    categoryDescription: 'Multiple accounts share network origin — potential proxy, VPN, or infrastructure overlap.',
  },
  TEMPORAL_BURST: {
    icon: Zap,
    label: 'Temporal Burst',
    hexColor: '#facc15',
    categoryDescription: 'Unusually dense transaction activity compressed into a short chronological window.',
  },
  RAPID_INTERACTION: {
    icon: Clock,
    label: 'Rapid Interaction',
    hexColor: '#fb923c',
    categoryDescription: 'Unusually small median time between consecutive transaction operations.',
  },
  MERCHANT_TEMPORAL_OVERLAP: {
    icon: TrendingUp,
    label: 'Merchant Overlap',
    hexColor: '#34d399',
    categoryDescription: 'Multiple accounts transacted at the same merchant on the same calendar day.',
  },
  HIGH_EVIDENCE_DENSITY: {
    icon: Cpu,
    label: 'Evidence Density',
    hexColor: '#c084fc',
    categoryDescription: 'High observable relationship evidence concentration relative to cluster size.',
  },
  HUB_ACCOUNT: {
    icon: Network,
    label: 'Hub Account',
    hexColor: '#22d3ee',
    categoryDescription: 'Account with graph connection degree significantly above median — potential relay node.',
  },
  MULTI_LAYER_EVIDENCE: {
    icon: GitMerge,
    label: 'Multi-Layer Signal',
    hexColor: '#f87171',
    categoryDescription: 'Account pair shares multiple independent evidence dimensions simultaneously.',
  },
};

// ---------------------------------------------------------------------------
// Severity styles
// ---------------------------------------------------------------------------

const SEV_STYLES: Record<EvidenceSeverity, {
  badge: string;
  borderColor: string;
  glowShadow: string;
}> = {
  HIGH: {
    badge: 'bg-red-500/15 text-red-400 border border-red-500/40 font-bold',
    borderColor: 'rgba(239,68,68,0.28)',
    glowShadow: '0 0 0 1px rgba(239,68,68,0.08)',
  },
  MEDIUM: {
    badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/40 font-semibold',
    borderColor: 'rgba(245,158,11,0.25)',
    glowShadow: '0 0 0 1px rgba(245,158,11,0.06)',
  },
  LOW: {
    badge: 'bg-sky-500/15 text-sky-400 border border-sky-500/40',
    borderColor: 'rgba(56,189,248,0.18)',
    glowShadow: '',
  },
};

// ---------------------------------------------------------------------------
// Determine whether "Explore in Graph" should be enabled
// ---------------------------------------------------------------------------

function canExploreInGraph(
  item: EvidenceItem,
  graphNodeIds: Set<string>,
  hasCommunityContext: boolean
): boolean {
  if (!hasCommunityContext) return false;

  const communityWideTypes: EvidenceType[] = [
    'TEMPORAL_BURST',
    'RAPID_INTERACTION',
    'HIGH_EVIDENCE_DENSITY',
  ];
  if (communityWideTypes.includes(item.type)) return true;

  // If graph node IDs are known, check if at least one entity is a node
  if (graphNodeIds.size > 0) {
    return (item.supporting_entities || []).some((id) => graphNodeIds.has(id));
  }

  // In account mode without graph loaded yet, check if there are supporting entities or account IDs
  const hasAccounts = (item.supporting_entities || []).some((id) => id.startsWith('acc_'));
  return hasAccounts || item.entity_type === 'ACCOUNT';
}

// ---------------------------------------------------------------------------
// Evidence Score Arc
// ---------------------------------------------------------------------------

const EvidenceScoreArc: React.FC<{ score: number }> = ({ score }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 60 ? '#f87171' : clamped >= 30 ? '#fbbf24' : '#34d399';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width="80" height="50" viewBox="0 0 80 50">
        <path d="M 8 46 A 34 34 0 0 1 72 46" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M 8 46 A 34 34 0 0 1 72 46"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * 107} 107`}
          style={{ transition: 'stroke-dasharray 0.55s ease' }}
        />
        <text x="40" y="44" textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>{clamped}</text>
      </svg>
      <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Evidence Score
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single metrics cell
// ---------------------------------------------------------------------------

const MetricCell: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div style={{
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 6,
    padding: '6px 10px',
  }}>
    <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.32)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {label.replace(/_/g, ' ')}
    </div>
    <div style={{ fontSize: 12, color, fontWeight: 700, fontFamily: 'monospace', wordBreak: 'break-all' }}>
      {value}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Evidence Card
// ---------------------------------------------------------------------------

interface EvidenceCardProps {
  item: EvidenceItem;
  communityId?: number | null;
  accountId?: string;
  onExploreInGraph?: (item: EvidenceItem) => void;
  isExplorable: boolean;
}

const EvidenceCard: React.FC<EvidenceCardProps> = ({
  item,
  communityId,
  accountId,
  onExploreInGraph,
  isExplorable,
}) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const meta = EVIDENCE_META[item.type] || {
    icon: Shield, label: item.type, hexColor: '#94a3b8', categoryDescription: '',
  };
  const sev = SEV_STYLES[item.severity] || SEV_STYLES.LOW;
  const Icon = meta.icon;
  const { hexColor } = meta;

  // Account targets for Add to Case
  const accountTargets = (item.supporting_entities || [])
    .filter((e) => e.startsWith('acc_'))
    .slice(0, 3);

  const handleExplore = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onExploreInGraph) {
      onExploreInGraph(item);
    } else if (communityId !== null && communityId !== undefined) {
      navigate(`/communities/${communityId}`, {
        state: { evidenceFocus: item, tab: 'graph' },
      });
    }
  }, [item, onExploreInGraph, communityId, navigate]);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${sev.borderColor}`,
        borderRadius: 8,
        marginBottom: 8,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        boxShadow: expanded ? sev.glowShadow : 'none',
        overflow: 'hidden',
      }}
    >
      {/* ---- Collapsed header ---- */}
      <div
        style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 11 }}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        {/* Icon */}
        <div style={{
          width: 34, height: 34, borderRadius: 7,
          background: `${hexColor}14`, border: `1px solid ${hexColor}28`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
        }}>
          <Icon size={15} color={hexColor} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4 }} className={sev.badge}>
              {item.severity}
            </span>
            <span style={{ fontSize: 10, color: hexColor, fontWeight: 600, opacity: 0.85 }}>
              {meta.label}
            </span>
            {isExplorable && (
              <span style={{
                fontSize: 9.5, padding: '1px 6px', borderRadius: 3,
                background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.2)',
                color: 'var(--accent-cyan)', fontWeight: 600,
              }}>
                Graph-explorable
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.84)', lineHeight: 1.45 }}>
            {item.title}
          </p>
        </div>

        {/* Expand toggle */}
        <button
          style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* ---- Expanded body ---- */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 14px 14px' }}>
          {/* Category explanation */}
          <p style={{ margin: '0 0 8px 0', fontSize: 11, color: hexColor, opacity: 0.75, lineHeight: 1.5, fontStyle: 'italic' }}>
            {meta.categoryDescription}
          </p>

          {/* Full description */}
          <p style={{ margin: '0 0 14px 0', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65 }}>
            {item.description}
          </p>

          {/* Metrics grid */}
          {Object.entries(item.metrics).filter(([, v]) => v !== null && typeof v !== 'object').length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 7,
              marginBottom: 14,
            }}>
              {Object.entries(item.metrics)
                .filter(([, v]) => v !== null && typeof v !== 'object')
                .slice(0, 8)
                .map(([k, v]) => (
                  <MetricCell
                    key={k}
                    label={k}
                    value={typeof v === 'number' ? (Number.isInteger(v) ? String(v) : (v as number).toFixed(3)) : String(v)}
                    color={hexColor}
                  />
                ))}
            </div>
          )}

          {/* Supporting entities */}
          {item.supporting_entities.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.32)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Supporting Entities ({item.supporting_entities.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {item.supporting_entities.slice(0, 14).map((entity) => (
                  <span key={entity} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: `${hexColor}10`, border: `1px solid ${hexColor}22`,
                    color: hexColor, fontFamily: 'monospace',
                  }}>
                    {entity}
                  </span>
                ))}
                {item.supporting_entities.length > 14 && (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '2px 0', alignSelf: 'center' }}>
                    +{item.supporting_entities.length - 14} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ---- Action bar ---- */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {/* Explore in Graph */}
            <button
              onClick={handleExplore}
              disabled={!isExplorable}
              title={
                isExplorable
                  ? communityId
                    ? `Explore this evidence on Community #${communityId} graph`
                    : 'Explore this evidence on the network topology graph'
                  : 'No community graph or account nodes available to highlight'
              }
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 13px',
                borderRadius: 5,
                background: isExplorable ? `${hexColor}18` : 'rgba(255,255,255,0.04)',
                border: isExplorable ? `1px solid ${hexColor}45` : '1px solid rgba(255,255,255,0.1)',
                color: isExplorable ? hexColor : 'rgba(255,255,255,0.25)',
                fontSize: 12,
                fontWeight: 700,
                cursor: isExplorable ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => { if (isExplorable) e.currentTarget.style.background = `${hexColor}28`; }}
              onMouseOut={(e) => { if (isExplorable) e.currentTarget.style.background = `${hexColor}18`; }}
            >
              <ScanSearch size={13} />
              Explore in Graph
            </button>

            {/* In Account Mode: Quick-Add Account and Peers */}
            {accountId && (
              <AddToInvestigationButton
                targetType="ACCOUNT"
                targetId={accountId}
                targetLabel={`Account ${accountId}`}
                size="sm"
              />
            )}

            {/* Peer accounts in supporting entities */}
            {accountTargets
              .filter((id) => id !== accountId)
              .map((peerId) => (
                <AddToInvestigationButton
                  key={peerId}
                  targetType="ACCOUNT"
                  targetId={peerId}
                  targetLabel={`Peer ${peerId}`}
                  size="sm"
                />
              ))}

            {/* If in Community Mode and no specific account target */}
            {!accountId && accountTargets.length === 0 && communityId !== null && communityId !== undefined && (
              <AddToInvestigationButton
                targetType="COMMUNITY"
                targetId={String(communityId)}
                targetLabel={`Community #${communityId}`}
                size="sm"
              />
            )}

            {/* Collapse */}
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
              style={{
                marginLeft: 'auto',
                padding: '7px 12px', borderRadius: 5,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.35)',
                cursor: 'pointer', fontSize: 11,
              }}
            >
              Collapse
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main EvidenceIntelligencePanel
// ---------------------------------------------------------------------------

export const EvidenceIntelligencePanel: React.FC<EvidenceIntelligencePanelProps> = ({
  communityId,
  accountId,
  parentCommunityId,
  onExploreInGraph,
  graphData,
}) => {
  const navigate = useNavigate();
  const [communityData, setCommunityData] = useState<CommunityEvidenceResponse | null>(null);
  const [accountData, setAccountData] = useState<AccountEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<EvidenceSeverity | 'ALL'>('ALL');

  // Build set of graph node IDs for explorable-check
  const graphNodeIds: Set<string> = new Set(graphData?.nodes.map((n) => n.id) || []);

  const isAccountMode = Boolean(accountId);
  const effectiveCommunityId = isAccountMode
    ? (parentCommunityId ?? accountData?.community_id ?? null)
    : (communityId ?? null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (isAccountMode && accountId) {
      getAccountEvidence(accountId)
        .then((res) => {
          setAccountData(res);
          setCommunityData(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Account evidence engine unavailable'))
        .finally(() => setLoading(false));
    } else if (communityId !== undefined && communityId !== null) {
      getCommunityEvidence(communityId)
        .then((res) => {
          setCommunityData(res);
          setAccountData(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Community evidence engine unavailable'))
        .finally(() => setLoading(false));
    }
  }, [communityId, accountId, isAccountMode]);

  const activeData = isAccountMode ? accountData : communityData;

  const filtered = activeData?.items.filter(
    (item) => filterSeverity === 'ALL' || item.severity === filterSeverity
  ) ?? [];

  // ---------- Loading ----------
  if (loading) {
    return (
      <div style={{ paddingTop: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 64, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 8, opacity: 1 - i * 0.2 }} />
        ))}
      </div>
    );
  }

  // ---------- Error ----------
  if (error) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: 14,
        background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)',
        borderRadius: 8, color: '#f87171', fontSize: 13,
      }}>
        <AlertTriangle size={15} />
        <span>{error}</span>
      </div>
    );
  }

  if (!activeData) return null;

  const { high_count: countHigh, medium_count: countMed, low_count: countLow } = activeData;

  return (
    <div>
      {/* ------------------------------------------------------------------ */}
      {/* Summary bar                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, padding: '14px 18px',
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10, marginBottom: 18, flexWrap: 'wrap',
      }}>
        <EvidenceScoreArc score={activeData.evidence_score} />

        <div style={{ width: 1, height: 52, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

        {/* Counts */}
        {[
          { label: 'HIGH', count: countHigh, color: '#f87171' },
          { label: 'MEDIUM', count: countMed, color: '#fbbf24' },
          { label: 'LOW', count: countLow, color: '#60a5fa' },
          { label: 'TOTAL', count: activeData.evidence_count, color: 'rgba(255,255,255,0.65)' },
        ].map(({ label, count, color }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{count}</span>
          </div>
        ))}

        {/* Context badge & note */}
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 280 }}>
          {isAccountMode && effectiveCommunityId !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Partition Context:
              </span>
              <button
                onClick={() => navigate(`/communities/${effectiveCommunityId}`)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.25)',
                  color: 'var(--accent-cyan)', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Layers size={11} />
                Community #{effectiveCommunityId}
                <ExternalLink size={10} style={{ opacity: 0.7 }} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
            <Info size={12} style={{ color: 'rgba(255,255,255,0.28)', marginTop: 1, flexShrink: 0 }} />
            <p style={{ margin: 0, fontSize: 10.5, color: 'rgba(255,255,255,0.35)', lineHeight: 1.45 }}>
              {isAccountMode
                ? 'Account-level evidence extracted from observable connections and transaction velocity.'
                : 'Community-level evidence derived from deterministic observable graph rules.'}
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Filter chips + runtime                                              */}
      {/* ------------------------------------------------------------------ */}
      {activeData.evidence_count > 0 && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
            const active = filterSeverity === sev;
            const count = sev === 'ALL' ? activeData.evidence_count : sev === 'HIGH' ? countHigh : sev === 'MEDIUM' ? countMed : countLow;
            const color = sev === 'HIGH' ? '#f87171' : sev === 'MEDIUM' ? '#fbbf24' : sev === 'LOW' ? '#60a5fa' : 'rgba(255,255,255,0.55)';
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                style={{
                  padding: '4px 11px', borderRadius: 18,
                  border: active ? `1px solid ${color}55` : '1px solid rgba(255,255,255,0.09)',
                  background: active ? `${color}12` : 'rgba(255,255,255,0.03)',
                  color: active ? color : 'rgba(255,255,255,0.42)',
                  fontSize: 11.5, fontWeight: active ? 700 : 400,
                  cursor: 'pointer', transition: 'all 0.12s ease',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {sev}
                <span style={{
                  fontSize: 10, padding: '1px 5px', borderRadius: 9,
                  background: active ? `${color}22` : 'rgba(255,255,255,0.07)',
                  color: active ? color : 'rgba(255,255,255,0.38)',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: 'monospace' }}>
            {activeData.runtime_ms.toFixed(0)}ms
          </span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Evidence cards                                                       */}
      {/* ------------------------------------------------------------------ */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', color: 'rgba(255,255,255,0.28)', fontSize: 13 }}>
          <Layers size={30} style={{ margin: '0 auto 10px', opacity: 0.25 }} />
          <p style={{ margin: 0 }}>
            {activeData.evidence_count === 0
              ? isAccountMode
                ? 'No observable evidence indicators detected for this account.'
                : 'No observable evidence indicators detected for this community.'
              : `No ${filterSeverity} severity items.`}
          </p>
        </div>
      ) : (
        <div>
          {filtered.map((item) => (
            <EvidenceCard
              key={item.evidence_id}
              item={item}
              communityId={effectiveCommunityId}
              accountId={accountId}
              onExploreInGraph={onExploreInGraph}
              isExplorable={canExploreInGraph(item, graphNodeIds, effectiveCommunityId !== null)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
