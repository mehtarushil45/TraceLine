import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Briefcase,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react';
import type { CasePriority, CaseStatus, InvestigationCase } from '../types/cases';
import { createCase, deleteCase, getCases, useCaseWatcher } from '../utils/caseManager';

export const InvestigationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<CasePriority>('HIGH');
  const [newNotes, setNewNotes] = useState('');

  const loadData = () => {
    setCases(getCases());
  };

  useEffect(() => {
    loadData();
    const unsub = useCaseWatcher(loadData);
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
    if (window.confirm('Are you sure you want to delete this investigation case?')) {
      deleteCase(id);
    }
  };

  const openCount = cases.filter((c) => c.status === 'OPEN').length;
  const reviewCount = cases.filter((c) => c.status === 'REVIEW').length;
  const closedCount = cases.filter((c) => c.status === 'CLOSED').length;
  const highPriorityTargetsCount = cases
    .filter((c) => c.status !== 'CLOSED')
    .reduce((acc, c) => acc + c.targets.filter((t) => t.riskLevel === 'HIGH').length, 0);

  const filteredCases = cases.filter((c) => {
    if (statusFilter === 'ALL') return true;
    return c.status === statusFilter;
  });

  const getStatusBadge = (status: CaseStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: '#38bdf8',
              fontSize: '11px',
              fontWeight: 600,
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
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24',
              fontSize: '11px',
              fontWeight: 600,
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
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(148, 163, 184, 0.15)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#94a3b8',
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

  const getPriorityBadge = (priority: CasePriority) => {
    switch (priority) {
      case 'HIGH':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}
          >
            HIGH PRIORITY
          </span>
        );
      case 'MEDIUM':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fcd34d',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}
          >
            MEDIUM
          </span>
        );
      case 'LOW':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#86efac',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}
          >
            LOW
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                color: 'var(--accent-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Briefcase size={18} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Investigation Queue
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Track communities, accounts and transactions requiring investigator review.
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            backgroundColor: '#0284c7',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          New Investigation Case
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="dash-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Open Cases
          </span>
          <div className="font-mono text-xl font-bold text-sky-400">{openCount}</div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Requiring investigator triage</span>
        </div>

        <div className="dash-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Under Review
          </span>
          <div className="font-mono text-xl font-bold text-amber-400">{reviewCount}</div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Active analysis & note-taking</span>
        </div>

        <div className="dash-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            Closed Cases
          </span>
          <div className="font-mono text-xl font-bold text-slate-400">{closedCount}</div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Resolved investigations</span>
        </div>

        <div className="dash-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            High-Priority Targets
          </span>
          <div className="font-mono text-xl font-bold text-red-400">{highPriorityTargetsCount}</div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Flagged accounts/clusters in queue</span>
        </div>
      </div>

      {/* Cases Queue Table Card */}
      <div className="dash-card" style={{ overflow: 'hidden' }}>
        {/* Filter Bar */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0b1120',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginRight: '8px' }}>
              Filter Status:
            </span>
            {(['ALL', 'OPEN', 'REVIEW', 'CLOSED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: statusFilter === st ? 'var(--border-light)' : 'transparent',
                  backgroundColor: statusFilter === st ? '#1e293b' : 'transparent',
                  color: statusFilter === st ? 'var(--text-main)' : 'var(--text-muted)',
                }}
              >
                {st}
              </button>
            ))}
          </div>

          <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {filteredCases.length} case{filteredCases.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* List / Table */}
        {filteredCases.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(51, 65, 85, 0.2)',
                color: 'var(--text-muted)',
              }}
            >
              <Briefcase size={24} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>
              No active investigations
            </span>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', maxWidth: '400px', lineHeight: 1.5 }}>
              Prioritize a community, account, or transaction from the network explorer to begin an investigation case.
            </p>
            <Link
              to="/communities"
              style={{
                fontSize: '12px',
                color: 'var(--accent-cyan)',
                fontWeight: 600,
                textDecoration: 'none',
                marginTop: '4px',
              }}
            >
              Explore Flagged Communities →
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="sec-table">
              <thead>
                <tr>
                  <th>Case Title & ID</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Targets</th>
                  <th>Last Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/investigations/${c.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '13px' }}>
                          {c.title}
                        </span>
                        <span className="font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                          {c.id}
                        </span>
                      </div>
                    </td>
                    <td>{getPriorityBadge(c.priority)}</td>
                    <td>{getStatusBadge(c.status)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="font-mono font-semibold text-slate-200">
                          {c.targets.length} target{c.targets.length === 1 ? '' : 's'}
                        </span>
                        {c.targets.length > 0 && (
                          <div style={{ display: 'flex', gap: '3px' }}>
                            {c.targets.map((t, idx) => (
                              <span
                                key={idx}
                                title={`${t.type}: ${t.label}`}
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  fontSize: '9px',
                                  fontFamily: 'var(--font-mono)',
                                  backgroundColor: '#1e293b',
                                  color: t.riskLevel === 'HIGH' ? '#f87171' : 'var(--text-muted)',
                                }}
                              >
                                {t.type[0]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '11px',
                            color: 'var(--accent-cyan)',
                            fontWeight: 600,
                          }}
                        >
                          Inspect Case <ChevronRight size={13} />
                        </span>
                        <button
                          onClick={(e) => handleDelete(e, c.id)}
                          title="Delete Case"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-dim)',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.color = '#ef4444')}
                          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Case Modal */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '16px',
          }}
        >
          <div
            className="dash-card"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              backgroundColor: '#0f172a',
              border: '1px solid var(--border-focus)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>
                Create New Investigation Case
              </h3>
              <button
                onClick={() => setShowNewModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Case Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Cluster 3 Hardware Sharing Investigation"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#080c14',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Initial Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as CasePriority)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#080c14',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  <option value="HIGH">High Priority</option>
                  <option value="MEDIUM">Medium Priority</option>
                  <option value="LOW">Low Priority</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Initial Investigator Notes
                </label>
                <textarea
                  rows={3}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Notes on why this investigation was initiated..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#080c14',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Create Case
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
