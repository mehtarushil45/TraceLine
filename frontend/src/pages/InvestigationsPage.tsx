import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Briefcase,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { CasePriority, CaseStatus, InvestigationCase } from '../types/cases';
import { createCase, deleteCase, getCases, subscribeToCaseUpdates } from '../utils/caseManager';

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
              padding: '3px 9px',
              borderRadius: '4px',
              backgroundColor: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid rgba(0, 240, 255, 0.35)',
              color: '#00F0FF',
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
              padding: '3px 9px',
              borderRadius: '4px',
              backgroundColor: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.35)',
              color: '#fbbf24',
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
              padding: '3px 9px',
              borderRadius: '4px',
              backgroundColor: 'rgba(148, 163, 184, 0.15)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#94a3b8',
              fontSize: '11px',
              fontWeight: 700,
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
              padding: '3px 9px',
              borderRadius: '4px',
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              color: '#fca5a5',
              fontSize: '11px',
              fontWeight: 800,
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
              padding: '3px 9px',
              borderRadius: '4px',
              backgroundColor: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.4)',
              color: '#fde68a',
              fontSize: '11px',
              fontWeight: 800,
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
              padding: '3px 9px',
              borderRadius: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#86efac',
              fontSize: '11px',
              fontWeight: 800,
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
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: '8px',
                backgroundColor: 'rgba(0, 240, 255, 0.15)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                color: 'var(--accent-cyan)',
              }}
            >
              <Briefcase size={20} />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              Investigation Queue & Watchlist
            </h1>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Track suspicious clusters, accounts, and transactions with persistent notes and multi-target forensics.
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            backgroundColor: '#0284c7',
            background: 'linear-gradient(135deg, #0284c7 0%, #00F0FF 100%)',
            border: 'none',
            borderRadius: '6px',
            color: '#030712',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
          }}
        >
          <Plus size={16} />
          Create New Case
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="dash-card" style={{ padding: '18px 20px', borderTop: '3px solid #00F0FF' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Active Open Cases
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="font-mono font-bold text-2xl text-cyan-400">{openCount}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>awaiting triage</span>
          </div>
        </div>

        <div className="dash-card" style={{ padding: '18px 20px', borderTop: '3px solid #fbbf24' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Under Review
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="font-mono font-bold text-2xl text-amber-400">{reviewCount}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>in active analysis</span>
          </div>
        </div>

        <div className="dash-card" style={{ padding: '18px 20px', borderTop: '3px solid #64748b' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Closed Cases
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="font-mono font-bold text-2xl text-slate-300">{closedCount}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>resolved</span>
          </div>
        </div>

        <div className="dash-card" style={{ padding: '18px 20px', borderTop: '3px solid #f43f5e' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            High-Risk Tracked Targets
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="font-mono font-bold text-2xl text-rose-400">{highPriorityTargetsCount}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>critical entities</span>
          </div>
        </div>
      </div>

      {/* Cases Table */}
      <div className="dash-card" style={{ overflow: 'hidden' }}>
        {/* Table Filter Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#070d1e',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {(['ALL', 'OPEN', 'REVIEW', 'CLOSED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: statusFilter === st ? 'var(--accent-cyan)' : 'transparent',
                  backgroundColor: statusFilter === st ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                  color: statusFilter === st ? '#00F0FF' : 'var(--text-muted)',
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

        {/* Empty State */}
        {filteredCases.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(51, 65, 85, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <Briefcase size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>No cases found</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '380px' }}>
                You can create a new investigation or attach communities directly using the [ + Add to Investigation ] button on any detail view.
              </p>
            </div>
            <Link
              to="/communities"
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--accent-cyan)',
                textDecoration: 'none',
                marginTop: '6px',
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
                  <th>Attached Targets</th>
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
                      <div>
                        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>
                          {c.title}
                        </span>
                        <span className="font-mono" style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                          {c.id}
                        </span>
                      </div>
                    </td>
                    <td>{getPriorityBadge(c.priority)}</td>
                    <td>{getStatusBadge(c.status)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="font-mono font-bold text-slate-200">{c.targets.length}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          ({c.targets.filter((t) => t.type === 'COMMUNITY').length}C ·{' '}
                          {c.targets.filter((t) => t.type === 'ACCOUNT').length}A ·{' '}
                          {c.targets.filter((t) => t.type === 'TRANSACTION').length}T)
                        </span>
                      </div>
                    </td>
                    <td className="font-mono text-slate-400 text-xs">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
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
                          onMouseOver={(e) => (e.currentTarget.style.color = '#f87171')}
                          onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
                        >
                          <Trash2 size={15} />
                        </button>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '12px',
                            color: 'var(--accent-cyan)',
                            fontWeight: 700,
                          }}
                        >
                          Inspect Case
                          <ChevronRight size={14} />
                        </div>
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
            backgroundColor: 'rgba(3, 7, 18, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="dash-card"
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: '#0a1024',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                Create New Investigation Case
              </h3>
              <button
                onClick={() => setShowNewModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Case Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Cluster #3 Infrastructure & Card Reuse Triage"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#030712',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Priority Level
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as CasePriority)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#030712',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                >
                  <option value="HIGH">HIGH (Immediate Threat)</option>
                  <option value="MEDIUM">MEDIUM (Watchlist Review)</option>
                  <option value="LOW">LOW (Informational)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                  Initial Investigator Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Record initial observable evidence hypotheses, e.g. 'Multiple accounts sharing virtual card credentials and device fingerprints...'"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#030712',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: '#1e293b',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
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
                    background: 'linear-gradient(135deg, #0284c7 0%, #00F0FF 100%)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#030712',
                    fontSize: '12px',
                    fontWeight: 800,
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
