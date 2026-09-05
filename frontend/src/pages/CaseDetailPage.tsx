import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  CheckCircle2,
  CheckSquare,
  Clock,
  ExternalLink,
  FileText,
  FlaskConical,
  Info,
  Shield,
  Users,
  XCircle,
} from 'lucide-react';
import type { AuditEvent, CaseStatus, FormalDecision, InvestigationCase } from '../types/cases';
import {
  computeDossierReadiness,
  getCase,
  subscribeToCaseUpdates,
  updateCase,
} from '../utils/caseManager';
import {
  getAccount,
  getTransaction,
} from '../api';
import type { AccountDetailResponse, TransactionDetailResponse } from '../types/api';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  RiskBadge,
} from '../components/common';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISPOSITION_META: Record<FormalDecision['disposition'], { label: string; color: string; icon: React.ElementType }> = {
  ESCALATE_SAR:     { label: 'ESCALATE — File SAR',             color: 'var(--risk-high)', icon: AlertTriangle  },
  REFER_COMPLIANCE: { label: 'REFER — Compliance Review',       color: 'var(--risk-med)',  icon: Users          },
  MONITOR:          { label: 'MONITOR — Continued Observation', color: 'var(--accent)',    icon: Activity       },
  CLOSE_NO_ACTION:  { label: 'CLOSE — No Action',               color: 'var(--text-muted)', icon: CheckCircle2  },
};

const AUDIT_EVENT_ICONS: Record<string, React.ElementType> = {
  CASE_CREATED:               Briefcase,
  DECISION_RECORDED:          CheckSquare,
  EVIDENCE_SNAPSHOT_ATTACHED: Shield,
  STATUS_CHANGED:             Activity,
  SAR_EXPORTED:               FileText,
  TARGET_ADDED:               Users,
  NOTES_UPDATED:              BookOpen,
  DOSSIER_VIEWED:             ExternalLink,
};

function renderStatusBadge(status: CaseStatus) {
  const styles: Record<CaseStatus, { bg: string; border: string; color: string; label: string }> = {
    OPEN:   { bg: 'var(--accent-subtle)',  border: 'var(--accent)',            color: 'var(--accent)',    label: 'OPEN'       },
    REVIEW: { bg: 'var(--risk-med-bg)',    border: 'var(--risk-med-border)',   color: 'var(--risk-med)', label: 'IN REVIEW'  },
    CLOSED: { bg: 'var(--bg-subtle)',      border: 'var(--border)',            color: 'var(--text-muted)', label: 'CLOSED'   },
  };
  const s = styles[status];
  return (
    <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.color, fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ReadinessItem: React.FC<{ label: string; ok: boolean; detail: string }> = ({ label, ok, detail }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
    {ok
      ? <CheckCircle2 size={14} style={{ color: '#86efac', flexShrink: 0, marginTop: '1px' }} />
      : <XCircle size={14} style={{ color: 'var(--text-dim)', flexShrink: 0, marginTop: '1px' }} />
    }
    <div style={{ flex: 1 }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '6px' }}>{detail}</span>
    </div>
  </div>
);

interface LineageNodeProps {
  label: string;
  detail?: string;
  indent?: number;
  onClick?: () => void;
}
const LineageNode: React.FC<LineageNodeProps> = ({ label, detail, indent = 0, onClick }) => (
  <div
    style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingLeft: `${indent * 18}px`, marginBottom: '4px', cursor: onClick ? 'pointer' : 'default' }}
    onClick={onClick}
  >
    <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: '1px' }}>
      {indent > 0 ? '├─' : '│'}
    </span>
    <div>
      <span style={{ fontSize: '12px', fontWeight: 600, color: onClick ? 'var(--accent)' : 'var(--text-secondary)', textDecoration: onClick ? 'underline' : 'none', textDecorationColor: 'rgba(59,130,246,0.4)' }}>{label}</span>
      {detail && <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '6px' }}>{detail}</span>}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// CaseDetailPage
// ---------------------------------------------------------------------------

export const CaseDetailPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate   = useNavigate();

  const [investigationCase, setInvestigationCase] = useState<InvestigationCase | null>(null);
  const [notes, setNotes]                         = useState('');
  const [isSavingNotes, setIsSavingNotes]         = useState(false);
  const [lastSaved, setLastSaved]                 = useState<string | null>(null);
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Linked entity hydration
  const [linkedAccounts,      setLinkedAccounts]      = useState<Map<string, AccountDetailResponse>>(new Map());
  const [linkedTransactions,  setLinkedTransactions]  = useState<Map<string, TransactionDetailResponse>>(new Map());
  const [loadingEntities,     setLoadingEntities]     = useState(false);

  const loadCase = useCallback(() => {
    if (!caseId) return;
    const c = getCase(caseId);
    if (c) {
      setInvestigationCase(c);
      setNotes(c.notes || '');
      if (!lastSaved) setLastSaved(new Date(c.updatedAt).toLocaleTimeString());
    }
  }, [caseId, lastSaved]);

  useEffect(() => {
    loadCase();
    return subscribeToCaseUpdates(loadCase);
  }, [loadCase]);

  // Hydrate linked entities from backend
  useEffect(() => {
    if (!investigationCase) return;
    setLoadingEntities(true);

    const accTargets = investigationCase.targets.filter((t) => t.type === 'ACCOUNT');
    const txTargets  = investigationCase.targets.filter((t) => t.type === 'TRANSACTION');

    const all: Promise<void>[] = [
      ...accTargets.slice(0, 10).map((t) =>
        getAccount(t.id)
          .then((acc) => setLinkedAccounts((prev) => new Map(prev).set(t.id, acc)))
          .catch(() => {})
      ),
      ...txTargets.slice(0, 10).map((t) =>
        getTransaction(t.id)
          .then((tx) => setLinkedTransactions((prev) => new Map(prev).set(t.id, tx)))
          .catch(() => {})
      ),
    ];

    Promise.allSettled(all).finally(() => setLoadingEntities(false));
  }, [investigationCase?.id]);

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    setIsSavingNotes(true);
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      if (caseId) {
        updateCase(caseId, { notes: val });
        setLastSaved(new Date().toLocaleTimeString());
        setIsSavingNotes(false);
      }
    }, 600);
  };

  const handleStatusChange = (status: CaseStatus) => {
    if (!caseId) return;
    updateCase(caseId, { status });
  };

  // ─── Guard ───────────────────────────────────────────────────────────────
  if (!investigationCase) {
    return (
      <ErrorState
        title="Dossier Not Found"
        message={`Formal investigation dossier ${caseId ?? ''} could not be retrieved.`}
        onRetry={() => navigate('/investigations')}
      />
    );
  }

  const dec            = investigationCase.decision;
  const snap           = dec?.evidenceSnapshot;
  const accountTargets = investigationCase.targets.filter((t) => t.type === 'ACCOUNT');
  const txTargets      = investigationCase.targets.filter((t) => t.type === 'TRANSACTION');
  const isReady        = computeDossierReadiness(investigationCase) === 'READY';

  const checks = [
    {
      label: 'Source investigation linked',
      ok: !!investigationCase.sourceCommunityId,
      detail: investigationCase.sourceCommunityId ? `Community #${investigationCase.sourceCommunityId}` : 'Not linked',
    },
    {
      label: 'Decision recorded',
      ok: !!dec,
      detail: dec ? dec.disposition.replace(/_/g, ' ') : 'No decision recorded',
    },
    {
      label: 'Evidence snapshot available',
      ok: !!snap,
      detail: snap
        ? `${snap.evidenceCount} triggers at ${new Date(snap.snapshotTimestamp).toLocaleDateString()}`
        : 'Not captured',
    },
    {
      label: 'Decision rationale recorded',
      ok: !!(dec?.rationale?.trim()),
      detail: dec?.rationale ? `${dec.rationale.length} chars` : 'Missing',
    },
    {
      label: 'Linked entities present',
      ok: investigationCase.targets.length > 0,
      detail: `${investigationCase.targets.length} entit${investigationCase.targets.length === 1 ? 'y' : 'ies'}`,
    },
    {
      label: 'SAR export on record',
      ok: investigationCase.sarExported,
      detail: investigationCase.sarExported
        ? `Exported ${investigationCase.sarExportTimestamp ? new Date(investigationCase.sarExportTimestamp).toLocaleString() : ''}`
        : 'Not yet exported from Decision view',
    },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>

      {/* 1 — HEADER ────────────────────────────────────────────────────────── */}
      <div>
        <button
          onClick={() => navigate('/investigations')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: 0, marginBottom: '12px' }}
          onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ArrowLeft size={13} />
          <span>Back to Formal Investigation Dossiers</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <Briefcase size={18} style={{ color: 'var(--accent)' }} />
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
                {investigationCase.id}
              </h1>
              {renderStatusBadge(investigationCase.status)}
              <RiskBadge level={investigationCase.priority} size="md" />
              {isReady ? (
                <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#86efac', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={10} /> DOSSIER READY
                </span>
              ) : (
                <span style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={10} /> INCOMPLETE
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Formal Investigation Dossier — {investigationCase.title}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {investigationCase.sourceCommunityId && (
              <Button variant="secondary" size="sm" icon={FlaskConical} onClick={() => navigate(`/forensics?community=${investigationCase.sourceCommunityId}&view=decision`)}>
                Source Investigation
              </Button>
            )}
            <select
              value={investigationCase.status}
              onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '6px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', outline: 'none' }}
            >
              <option value="OPEN">OPEN</option>
              <option value="REVIEW">IN REVIEW</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '12px', padding: '10px 14px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: '5px' }}>
          {[
            { label: 'Case ID',          value: investigationCase.id },
            { label: 'Created',          value: new Date(investigationCase.createdAt).toLocaleString() },
            { label: 'Last Updated',     value: new Date(investigationCase.updatedAt).toLocaleString() },
            { label: 'Source Community', value: investigationCase.sourceCommunityId ? `Community #${investigationCase.sourceCommunityId}` : '— Not linked' },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</span>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2 — FINAL INVESTIGATION DECISION ─────────────────────────────────── */}
      <Panel title="Final Investigation Decision" subtitle="Formally recorded disposition and investigator rationale." padding="md">
        {!dec ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <Info size={20} style={{ color: 'var(--text-dim)', marginBottom: '8px' }} />
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              No decision has been recorded for this dossier.
            </div>
            {investigationCase.sourceCommunityId && (
              <Button variant="secondary" size="sm" icon={FlaskConical} onClick={() => navigate(`/forensics?community=${investigationCase.sourceCommunityId}&view=decision`)}>
                Record Decision in Forensic Workspace
              </Button>
            )}
          </div>
        ) : (() => {
          const meta = DISPOSITION_META[dec.disposition];
          const DIcon = meta?.icon ?? CheckSquare;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '8px 10px', backgroundColor: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>INVESTIGATOR ENTERED</span>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: '8px' }}>
                  — This disposition and rationale were entered by the investigating analyst
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Disposition</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <DIcon size={14} style={{ color: meta?.color ?? 'var(--text-primary)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: meta?.color ?? 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {meta?.label ?? dec.disposition}
                    </span>
                  </div>
                </div>
                <div style={{ padding: '12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Decision Recorded</span>
                  <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{new Date(dec.timestamp).toLocaleString()}</span>
                </div>
              </div>
              <div style={{ padding: '14px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '8px', letterSpacing: '0.06em' }}>Decision Rationale</span>
                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{dec.rationale}</p>
              </div>
            </div>
          );
        })()}
      </Panel>

      {/* 3 — EVIDENCE SNAPSHOT ─────────────────────────────────────────────── */}
      <Panel title="Evidence Snapshot" subtitle="Evidence metrics captured at decision time. This is a snapshot, not a live query." padding="md">
        {!snap ? (
          <EmptyState title="No evidence snapshot recorded" message="Evidence snapshot is captured when a decision is recorded from the Forensic Workspace Decision view." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '6px 10px', backgroundColor: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>DERIVED</span>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: '8px' }}>
                Computed from Forensic Workspace at {new Date(snap.snapshotTimestamp).toLocaleString()} (snapshot, not live)
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '12px' }}>
              {[
                { label: 'Evidence Triggers', value: snap.evidenceCount.toString(), sub: `${snap.highCount} HIGH / ${snap.medCount} MED / ${snap.lowCount} LOW` },
                { label: 'Evidence Score',    value: snap.evidenceScore != null ? `${snap.evidenceScore}/100` : '—', sub: 'Composite at decision' },
                { label: 'Member Accounts',   value: snap.memberCount.toString(), sub: 'Louvain partition' },
                { label: 'Shared Infra',      value: (snap.sharedDevices + snap.sharedIps + snap.sharedInstruments).toString(), sub: `${snap.sharedDevices} dev / ${snap.sharedIps} IP / ${snap.sharedInstruments} instr` },
                { label: 'Tx Volume',         value: '$' + snap.totalTransactionAmount.toLocaleString(undefined, { maximumFractionDigits: 0 }), sub: 'Community movement' },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ padding: '12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>{label}</span>
                  <span className="font-mono" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>{sub}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* 4 — DOSSIER READINESS ─────────────────────────────────────────────── */}
      <Panel title="Dossier Readiness" subtitle="Deterministic boolean checks — no score, no estimate." padding="md">
        <div style={{ marginBottom: '12px' }}>
          {isReady ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '4px', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#86efac', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              <CheckCircle2 size={14} /> DOSSIER READY
            </div>
          ) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '4px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              <Clock size={14} /> INCOMPLETE — {checks.filter(c => !c.ok).length} check{checks.filter(c => !c.ok).length !== 1 ? 's' : ''} outstanding
            </div>
          )}
        </div>
        {checks.map((c) => (
          <ReadinessItem key={c.label} label={c.label} ok={c.ok} detail={c.detail} />
        ))}
      </Panel>

      {/* 5 — REPORTING STATUS ──────────────────────────────────────────────── */}
      <Panel title="Reporting Status" subtitle="SAR generation is performed exclusively from the Forensic Workspace Decision workflow." padding="md">
        {investigationCase.sarExported ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '5px' }}>
            <FileText size={16} style={{ color: '#86efac' }} />
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#86efac' }}>SAR Package Generated</div>
              {investigationCase.sarExportTimestamp && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Exported: <span className="font-mono">{new Date(investigationCase.sarExportTimestamp).toLocaleString()}</span>
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                Generated from the Decision view. Submission to regulators is outside the scope of this system.
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              SAR has not been generated for this investigation.
            </div>
            {investigationCase.sourceCommunityId && (
              <Button variant="secondary" size="sm" icon={FlaskConical} onClick={() => navigate(`/forensics?community=${investigationCase.sourceCommunityId}&view=decision`)}>
                Go to Decision View to Generate SAR
              </Button>
            )}
          </div>
        )}
      </Panel>

      {/* 6 — EVIDENCE LINEAGE ──────────────────────────────────────────────── */}
      <Panel title="Evidence Lineage" subtitle="Provenance tree from this dossier back to the originating investigation surfaces." padding="md">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Briefcase size={13} style={{ color: 'var(--accent)' }} />
            <strong style={{ color: 'var(--text-primary)' }}>CASE {investigationCase.id}</strong>
          </div>
          <div style={{ paddingLeft: '4px', borderLeft: '2px solid var(--border)' }}>
            <LineageNode
              label="DECISION"
              detail={dec ? `${dec.disposition.replace(/_/g, ' ')} — ${new Date(dec.timestamp).toLocaleDateString()}` : 'Not recorded'}
              indent={1}
            />
            {investigationCase.sourceCommunityId && (
              <>
                <LineageNode
                  label={`FORENSIC WORKSPACE — Community #${investigationCase.sourceCommunityId}`}
                  indent={1}
                  onClick={() => navigate(`/forensics?community=${investigationCase.sourceCommunityId}&view=evidence`)}
                />
                {['Evidence', 'Accounts', 'Network', 'Timeline', 'Money Flow', 'Storyline', 'Hypotheses'].map((v) => (
                  <LineageNode
                    key={v}
                    label={v}
                    indent={2}
                    onClick={() => navigate(`/forensics?community=${investigationCase.sourceCommunityId}&view=${v.toLowerCase().replace(' ', '-').replace('storyline', 'story').replace('hypotheses', 'hypotheses').replace('evidence', 'evidence').replace('network', 'network').replace('accounts', 'accounts').replace('timeline', 'timeline').replace('money-flow', 'money-flow')}`)}
                  />
                ))}
              </>
            )}
            {accountTargets.length > 0 && (
              <>
                <LineageNode label={`ACCOUNTS (${accountTargets.length})`} indent={1} />
                {accountTargets.slice(0, 5).map((t) => (
                  <LineageNode key={t.id} label={t.id} indent={2} onClick={() => navigate(`/accounts/${t.id}`)} />
                ))}
                {accountTargets.length > 5 && <LineageNode label={`+${accountTargets.length - 5} more`} indent={2} />}
              </>
            )}
            {txTargets.length > 0 && (
              <>
                <LineageNode label={`TRANSACTIONS (${txTargets.length})`} indent={1} />
                {txTargets.slice(0, 5).map((t) => (
                  <LineageNode key={t.id} label={t.id} indent={2} onClick={() => navigate(`/transactions/${t.id}`)} />
                ))}
                {txTargets.length > 5 && <LineageNode label={`+${txTargets.length - 5} more`} indent={2} />}
              </>
            )}
          </div>
        </div>
      </Panel>

      {/* 7 — INVESTIGATED ENTITIES (ACCOUNTS) ─────────────────────────────── */}
      {accountTargets.length > 0 && (
        <Panel title="Investigated Entities" subtitle="Accounts linked to this dossier. Data fetched live from backend dataset." padding="md">
          {loadingEntities ? (
            <LoadingState type="table" count={3} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {accountTargets.map((target) => {
                const acc = linkedAccounts.get(target.id);
                return (
                  <div key={target.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Users size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                      <div>
                        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{target.id}</span>
                        {acc && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '10px' }}>
                            Community #{acc.community_id} · Risk: {acc.community_risk_level ?? '—'}
                          </span>
                        )}
                        {!acc && <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '8px', fontStyle: 'italic' }}>Loading...</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {target.riskLevel && <RiskBadge level={target.riskLevel} size="sm" />}
                      <Button variant="secondary" size="sm" icon={ArrowRight} iconPosition="right" onClick={() => navigate(`/accounts/${target.id}`)}>
                        Profile
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {/* 8 — INVESTIGATED TRANSACTIONS ────────────────────────────────────── */}
      {txTargets.length > 0 && (
        <Panel title="Investigated Transactions" subtitle="Transactions linked to this dossier. Data fetched live from enriched_transactions.csv." padding="md">
          {loadingEntities ? (
            <LoadingState type="table" count={3} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {txTargets.map((target) => {
                const tx = linkedTransactions.get(target.id);
                return (
                  <div key={target.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Activity size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                      <div>
                        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{target.id}</span>
                        {tx && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '10px' }}>
                            ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} · {tx.transaction_status} · {tx.src_account_id} → {tx.dst_account_id}
                          </span>
                        )}
                        {!tx && <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '8px', fontStyle: 'italic' }}>Loading...</span>}
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" icon={ArrowRight} iconPosition="right" onClick={() => navigate(`/transactions/${target.id}`)}>
                      Inspect
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {/* 9 — IMMUTABLE AUDIT TRAIL ─────────────────────────────────────────── */}
      <Panel title="Immutable Case Audit Trail" subtitle="Lifecycle events recorded in reverse chronological order. Events cannot be edited or deleted." padding="md">
        {investigationCase.auditEvents.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '16px 0' }}>No audit events recorded.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[...investigationCase.auditEvents].reverse().map((evt: AuditEvent, idx) => {
              const Icon = AUDIT_EVENT_ICONS[evt.eventType] ?? Info;
              return (
                <div key={evt.eventId} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: idx < investigationCase.auditEvents.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={13} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{evt.eventType.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', padding: '1px 6px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                        {evt.source.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{evt.detail}</p>
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '3px', display: 'block' }}>
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* 10 — INVESTIGATOR NOTES ────────────────────────────────────────────── */}
      <Panel title="Investigator Notes" subtitle="Editable notes field — auto-saved to browser storage." padding="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ padding: '6px 10px', backgroundColor: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '4px', fontSize: '10px' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>INVESTIGATOR ENTERED</span>
            <span style={{ color: 'var(--text-dim)', marginLeft: '8px' }}>Notes are stored locally and are not transmitted to any backend service.</span>
          </div>
          <textarea
            value={notes}
            onChange={handleNotesChange}
            placeholder="Document analytical observations, subpoena considerations, SAR filing rationale, and case progress..."
            rows={5}
            style={{ width: '100%', padding: '12px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>{isSavingNotes ? 'Saving...' : lastSaved ? `Last saved: ${lastSaved}` : 'Auto-saved'}</span>
            <span className="font-mono">Case ID: {investigationCase.id}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
};
