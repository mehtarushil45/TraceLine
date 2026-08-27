import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  Layers,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { CasePriority, CaseStatus, InvestigationCase } from '../types/cases';
import {
  createCase,
  deleteCase,
  getCases,
  subscribeToCaseUpdates,
} from '../utils/caseManager';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  Metric,
  PageHeader,
  Panel,
  RiskBadge,
  SearchInput,
} from '../components/common';
import type { Column, FilterOption } from '../components/common';

export const InvestigationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<CasePriority>('HIGH');
  const [newNotes, setNewNotes] = useState('');

  const loadData = () => {
    setCases(getCases());
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeToCaseUpdates(loadData);
    return unsub;
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const created = createCase(newTitle.trim() || undefined, newPriority, undefined, newNotes.trim());
    setShowNewModal(false);
    setNewTitle('');
    setNewNotes('');
    navigate(`/investigations/${created.id}`);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Delete this investigation case permanently?')) {
      deleteCase(id);
    }
  };

  // Case counts
  const openCount = cases.filter((c) => c.status === 'OPEN').length;
  const reviewCount = cases.filter((c) => c.status === 'REVIEW').length;
  const closedCount = cases.filter((c) => c.status === 'CLOSED').length;
  const highPriorityCount = cases.filter((c) => c.priority === 'HIGH' && c.status !== 'CLOSED').length;

  const statusFilterOptions: FilterOption<string>[] = [
    { label: 'All Cases', value: 'ALL', count: cases.length },
    { label: 'Open', value: 'OPEN', count: openCount },
    { label: 'In Review', value: 'REVIEW', count: reviewCount },
    { label: 'Closed', value: 'CLOSED', count: closedCount },
  ];

  const priorityFilterOptions: FilterOption<string>[] = [
    { label: 'All Priorities', value: 'ALL' },
    { label: 'High Priority', value: 'HIGH', count: cases.filter((c) => c.priority === 'HIGH').length },
    { label: 'Medium', value: 'MEDIUM', count: cases.filter((c) => c.priority === 'MEDIUM').length },
    { label: 'Low', value: 'LOW', count: cases.filter((c) => c.priority === 'LOW').length },
  ];

  const filteredCases = cases.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && c.priority !== priorityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = c.id.toLowerCase().includes(q);
      const matchTitle = c.title.toLowerCase().includes(q);
      const matchTarget = c.targets.some(
        (t) => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q)
      );
      if (!matchId && !matchTitle && !matchTarget) return false;
    }
    return true;
  });

  const renderStatusPill = (status: CaseStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            OPEN
          </span>
        );
      case 'REVIEW':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--risk-med-bg)',
              border: '1px solid var(--risk-med-border)',
              color: 'var(--risk-med)',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            IN REVIEW
          </span>
        );
      case 'CLOSED':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}
          >
            CLOSED
          </span>
        );
    }
  };

  const columns: Column<InvestigationCase>[] = [
    {
      key: 'id',
      header: 'Case ID',
      width: '140px',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {c.id}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Investigation Title / Scope',
      render: (c) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {c.title}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {c.targets.length} attached entit{c.targets.length === 1 ? 'y' : 'ies'} · Created {new Date(c.createdAt).toLocaleDateString()}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (c) => renderStatusPill(c.status),
    },
    {
      key: 'priority',
      header: 'Priority',
      width: '120px',
      render: (c) => <RiskBadge level={c.priority} size="sm" />,
    },
    {
      key: 'targets',
      header: 'Attached Targets',
      render: (c) => {
        if (c.targets.length === 0) {
          return <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>No targets attached</span>;
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {c.targets.slice(0, 3).map((t) => (
              <span
                key={`${t.type}_${t.id}`}
                className="font-mono"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontSize: '10.5px',
                }}
              >
                {t.type === 'COMMUNITY' && <Layers size={10} style={{ color: 'var(--accent)' }} />}
                {t.type === 'ACCOUNT' && <User size={10} style={{ color: 'var(--risk-med)' }} />}
                {t.id}
              </span>
            ))}
            {c.targets.length > 3 && (
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                +{c.targets.length - 3} more
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'updatedAt',
      header: 'Last Updated',
      width: '140px',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {new Date(c.updatedAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '150px',
      align: 'right',
      render: (c) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            iconPosition="right"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/investigations/${c.id}`);
            }}
          >
            Open Dossier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Trash2}
            onClick={(e) => handleDelete(e, c.id)}
            title="Delete investigation case"
          />
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
        title="Investigation Cases"
        description="Active multi-entity fraud ring investigations, persistent case notes, and forensic dossiers."
        badge={<Badge variant="neutral">{cases.length} Total Cases</Badge>}
        actions={
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => setShowNewModal(true)}
          >
            New Investigation Case
          </Button>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* 2. CASE SUMMARY METRICS                                            */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="md">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <Metric
            label="Total Case Files"
            value={cases.length.toString()}
            subtext="Persisted in workspace"
          />
          <Metric
            label="Active Investigations"
            value={openCount.toString()}
            subtext="Under active inquiry"
            variant={openCount > 0 ? 'accent' : 'default'}
          />
          <Metric
            label="In Formal Review"
            value={reviewCount.toString()}
            subtext="Pending closure / SAR"
            variant={reviewCount > 0 ? 'med' : 'default'}
          />
          <Metric
            label="High Priority Watchlist"
            value={highPriorityCount.toString()}
            subtext="High-risk ring targets"
            variant={highPriorityCount > 0 ? 'high' : 'default'}
          />
          <Metric
            label="Closed Dossiers"
            value={closedCount.toString()}
            subtext="Archived investigations"
          />
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 3. CASE SEARCH & FILTER BAR                                       */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="none">
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            backgroundColor: 'var(--bg-sidebar)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <FilterBar
              options={statusFilterOptions}
              selected={statusFilter}
              onChange={setStatusFilter}
              size="sm"
            />
            <FilterBar
              options={priorityFilterOptions}
              selected={priorityFilter}
              onChange={setPriorityFilter}
              size="sm"
            />
          </div>

          <div style={{ width: '280px' }}>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search cases or target IDs..."
            />
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 4. CASE DATA TABLE                                                */}
        {/* ------------------------------------------------------------------ */}
        {cases.length === 0 ? (
          <EmptyState
            title="No investigation cases created"
            message="Use the button above to start your first investigation case, or attach suspicious communities and accounts from the Risk Queue."
            actionLabel="Create Investigation Case"
            onAction={() => setShowNewModal(true)}
          />
        ) : (
          <DataTable
            columns={columns}
            data={filteredCases}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => navigate(`/investigations/${c.id}`)}
            emptyMessage="No investigation cases match the selected filters."
          />
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 5. CREATE NEW CASE MODAL                                           */}
      {/* ------------------------------------------------------------------ */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowNewModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Briefcase size={18} style={{ color: 'var(--accent)' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Create Investigation Case
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Case Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`Case #${cases.length + 1}: Ring / Merchant Risk Inquiry`}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Investigation Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as CasePriority)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  <option value="HIGH">HIGH PRIORITY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Initial Case Notes & Hypotheses
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Document initial hypotheses, shared devices observed, transaction velocity bursts..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                >
                  Create Case File
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
