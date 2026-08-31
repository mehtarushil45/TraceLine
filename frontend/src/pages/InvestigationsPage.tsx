import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  FlaskConical,
  Layers,
  XCircle,
} from 'lucide-react';
import type { CaseStatus, DossierStatus, InvestigationCase } from '../types/cases';
import {
  deleteCase,
  getCases,
  subscribeToCaseUpdates,
} from '../utils/caseManager';
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  Metric,
  PageHeader,
  Panel,
  RiskBadge,
  SearchInput,
} from '../components/common';
import type { Column, FilterOption } from '../components/common';

// ─── Status badge ────────────────────────────────────────────────────────────
const renderStatusBadge = (status: CaseStatus) => {
  switch (status) {
    case 'OPEN':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--accent-subtle)', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          OPEN
        </span>
      );
    case 'REVIEW':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--risk-med-bg)', border: '1px solid var(--risk-med-border)', color: 'var(--risk-med)', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
          IN REVIEW
        </span>
      );
    case 'CLOSED':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          CLOSED
        </span>
      );
  }
};

// ─── Dossier readiness badge ──────────────────────────────────────────────────
const renderReadinessBadge = (status: DossierStatus) =>
  status === 'READY' ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#86efac', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
      <CheckCircle2 size={10} /> READY
    </span>
  ) : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
      <Clock size={10} /> INCOMPLETE
    </span>
  );

// ─── Disposition badge ─────────────────────────────────────────────────────────
const DISPOSITION_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ESCALATE_SAR:    { label: 'ESCALATE SAR',   color: 'var(--risk-high)', bg: 'var(--risk-high-bg)', border: 'var(--risk-high-border)' },
  REFER_COMPLIANCE:{ label: 'REFER',          color: 'var(--risk-med)',  bg: 'var(--risk-med-bg)',  border: 'var(--risk-med-border)'  },
  MONITOR:         { label: 'MONITOR',        color: 'var(--accent)',    bg: 'var(--accent-subtle)', border: 'var(--accent)'          },
  CLOSE_NO_ACTION: { label: 'CLOSED',         color: 'var(--text-muted)', bg: 'var(--bg-subtle)',  border: 'var(--border)'           },
};

const renderDisposition = (disposition?: string) => {
  if (!disposition) return <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>— Pending decision</span>;
  const d = DISPOSITION_LABELS[disposition] ?? { label: disposition, color: 'var(--text-muted)', bg: 'var(--bg-subtle)', border: 'var(--border)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '4px', backgroundColor: d.bg, border: `1px solid ${d.border}`, color: d.color, fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
      {d.label}
    </span>
  );
};

export const InvestigationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dispositionFilter, setDispositionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = () => setCases(getCases());

  useEffect(() => {
    loadData();
    const unsub = subscribeToCaseUpdates(loadData);
    return unsub;
  }, []);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Permanently delete this formal investigation dossier? This action cannot be undone.')) {
      deleteCase(id);
    }
  };

  // ── Summary counts ────────────────────────────────────────────────────────
  const openCount   = cases.filter((c) => c.status === 'OPEN').length;
  const reviewCount = cases.filter((c) => c.status === 'REVIEW').length;
  const closedCount = cases.filter((c) => c.status === 'CLOSED').length;
  const sarCount    = cases.filter((c) => c.sarExported).length;
  const readyCount  = cases.filter((c) => c.dossierStatus === 'READY').length;

  // ── Filter options ────────────────────────────────────────────────────────
  const statusFilterOptions: FilterOption<string>[] = [
    { label: 'All', value: 'ALL', count: cases.length },
    { label: 'Open', value: 'OPEN', count: openCount },
    { label: 'In Review', value: 'REVIEW', count: reviewCount },
    { label: 'Closed', value: 'CLOSED', count: closedCount },
  ];

  const dispositionFilterOptions: FilterOption<string>[] = [
    { label: 'All Dispositions', value: 'ALL' },
    { label: 'Escalate SAR', value: 'ESCALATE_SAR', count: cases.filter((c) => c.decision?.disposition === 'ESCALATE_SAR').length },
    { label: 'Monitor', value: 'MONITOR', count: cases.filter((c) => c.decision?.disposition === 'MONITOR').length },
    { label: 'Refer', value: 'REFER_COMPLIANCE', count: cases.filter((c) => c.decision?.disposition === 'REFER_COMPLIANCE').length },
    { label: 'Closed', value: 'CLOSE_NO_ACTION', count: cases.filter((c) => c.decision?.disposition === 'CLOSE_NO_ACTION').length },
    { label: 'Pending Decision', value: 'PENDING', count: cases.filter((c) => !c.decision).length },
  ];

  const filteredCases = cases.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (dispositionFilter !== 'ALL') {
      if (dispositionFilter === 'PENDING' && c.decision) return false;
      if (dispositionFilter !== 'PENDING' && c.decision?.disposition !== dispositionFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = c.id.toLowerCase().includes(q);
      const matchComm = (c.sourceCommunityId ?? '').toLowerCase().includes(q);
      const matchTarget = c.targets.some((t) => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q));
      if (!matchId && !matchComm && !matchTarget) return false;
    }
    return true;
  });

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns: Column<InvestigationCase>[] = [
    {
      key: 'id',
      header: 'Case ID',
      width: '175px',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {c.id}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source Investigation',
      width: '180px',
      render: (c) => {
        if (!c.sourceCommunityId) {
          return <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>— No source linked</span>;
        }
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/forensics?community=${c.sourceCommunityId}&view=decision`); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: 'var(--accent)', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono)', padding: 0 }}
            title="Open source Forensic Workspace"
          >
            <FlaskConical size={11} />
            Community #{c.sourceCommunityId}
          </button>
        );
      },
    },
    {
      key: 'risk',
      header: 'Risk',
      width: '100px',
      render: (c) => <RiskBadge level={c.priority} size="sm" />,
    },
    {
      key: 'targets',
      header: 'Entities',
      width: '100px',
      render: (c) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Layers size={12} style={{ color: 'var(--text-dim)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.targets.length}</span>
          {c.sarExported && (
            <span style={{ fontSize: '10px', color: '#86efac', fontFamily: 'var(--font-mono)', border: '1px solid rgba(16,185,129,0.3)', padding: '0 4px', borderRadius: '3px' }}>SAR</span>
          )}
        </div>
      ),
    },
    {
      key: 'disposition',
      header: 'Decision',
      render: (c) => renderDisposition(c.decision?.disposition),
    },
    {
      key: 'dossierStatus',
      header: 'Dossier',
      width: '120px',
      render: (c) => renderReadinessBadge(c.dossierStatus),
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (c) => renderStatusBadge(c.status),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      width: '130px',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {new Date(c.updatedAt).toLocaleDateString()}<br />
          <span style={{ fontSize: '9.5px' }}>{new Date(c.updatedAt).toLocaleTimeString()}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      width: '160px',
      align: 'right',
      render: (c) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            iconPosition="right"
            onClick={(e) => { e.stopPropagation(); navigate(`/investigations/${c.id}`); }}
          >
            Open Dossier
          </Button>
          <button
            onClick={(e) => handleDelete(e, c.id)}
            title="Delete dossier permanently"
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--risk-high)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
          >
            <XCircle size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* ── 1. PAGE HEADER ─────────────────────────────────────────────────── */}
      <PageHeader
        title="Formal Investigation Dossiers"
        description="Completed investigations preserved with decision provenance, evidence lineage, and resolution state. Cases are created from the Forensic Workspace Decision view."
        badge={<Badge variant="neutral">{cases.length} Total Dossier{cases.length !== 1 ? 's' : ''}</Badge>}
        actions={
          cases.length === 0 ? (
            <Button
              variant="secondary"
              size="md"
              icon={FlaskConical}
              onClick={() => navigate('/forensics')}
            >
              Open Forensic Workspace →
            </Button>
          ) : undefined
        }
      />

      {/* ── 2. OPERATIONAL SUMMARY ────────────────────────────────────────── */}
      <Panel padding="md">
        <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
            DERIVED — Calculated from persisted case records
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
          <Metric label="Total Dossiers" value={cases.length.toString()} subtext="Formal investigations" />
          <Metric label="Open" value={openCount.toString()} subtext="Under active inquiry" variant={openCount > 0 ? 'accent' : 'default'} />
          <Metric label="Under Review" value={reviewCount.toString()} subtext="Decision recorded" variant={reviewCount > 0 ? 'med' : 'default'} />
          <Metric label="Closed" value={closedCount.toString()} subtext="Resolved investigations" />
          <Metric label="Dossier Ready" value={readyCount.toString()} subtext="Complete with decision" variant={readyCount > 0 ? 'accent' : 'default'} />
          <Metric label="SAR Exported" value={sarCount.toString()} subtext="Reports generated" variant={sarCount > 0 ? 'high' : 'default'} />
        </div>
      </Panel>

      {/* ── 3. DOSSIER TABLE ─────────────────────────────────────────────── */}
      <Panel padding="none">
        {/* Filter bar */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', backgroundColor: 'var(--bg-sidebar)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <FilterBar options={statusFilterOptions} selected={statusFilter} onChange={setStatusFilter} size="sm" />
            <FilterBar options={dispositionFilterOptions} selected={dispositionFilter} onChange={setDispositionFilter} size="sm" />
          </div>
          <div style={{ width: '280px' }}>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search case ID, community, or entity..."
            />
          </div>
        </div>

        {/* Zero state */}
        {cases.length === 0 ? (
          <div style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '10px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={24} style={{ color: 'var(--text-dim)' }} />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.01em' }}>0 FORMAL DOSSIERS</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: 1.7, marginBottom: '16px' }}>
                No formal investigation dossiers exist yet.<br />
                Cases are created after an investigator completes<br />
                the <strong style={{ color: 'var(--text-secondary)' }}>Forensic Workspace Decision</strong> workflow.
              </div>
              <Button variant="primary" size="md" icon={FlaskConical} onClick={() => navigate('/forensics')}>
                Open Forensic Workspace →
              </Button>
            </div>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredCases}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => navigate(`/investigations/${c.id}`)}
            emptyMessage="No dossiers match the selected filters."
          />
        )}
      </Panel>
    </div>
  );
};
