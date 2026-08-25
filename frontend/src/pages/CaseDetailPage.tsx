import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  Layers,
  Plus,
  Save,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { CasePriority, CaseStatus, InvestigationCase, InvestigationTarget } from '../types/cases';
import { deleteCase, getCase, removeTargetFromCase, updateCase, addTargetToCase, useCaseWatcher } from '../utils/caseManager';
import { RiskBadge } from '../components/common/RiskBadge';
import { ErrorState } from '../components/common/ErrorState';

export const CaseDetailPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [investigationCase, setInvestigationCase] = useState<InvestigationCase | null>(null);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [savedNotesFeedback, setSavedNotesFeedback] = useState(false);
  const [addTargetInput, setAddTargetInput] = useState('');

  const loadCase = () => {
    if (!caseId) return;
    const c = getCase(caseId);
    if (c) {
      setInvestigationCase(c);
      setNotes(c.notes || '');
      setTitle(c.title);
    }
  };

  useEffect(() => {
    loadCase();
    const unsub = useCaseWatcher(loadCase);
    return unsub;
  }, [caseId]);

  if (!investigationCase) {
    return (
      <ErrorState
        message={`No investigation case found matching ID '${caseId}'. It may have been removed or closed.`}
        onRetry={() => navigate('/investigations')}
      />
    );
  }

  const handleStatusChange = (newStatus: CaseStatus) => {
    updateCase(investigationCase.id, { status: newStatus });
  };

  const handlePriorityChange = (newPriority: CasePriority) => {
    updateCase(investigationCase.id, { priority: newPriority });
  };

  const handleSaveTitle = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      updateCase(investigationCase.id, { title: title.trim() });
      setIsEditingTitle(false);
    }
  };

  const handleSaveNotes = () => {
    updateCase(investigationCase.id, { notes });
    setSavedNotesFeedback(true);
    setTimeout(() => setSavedNotesFeedback(false), 2000);
  };

  const handleRemoveTarget = (target: InvestigationTarget) => {
    removeTargetFromCase(investigationCase.id, target.type, target.id);
  };

  const handleQuickAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = addTargetInput.trim();
    if (!raw) return;

    let target: InvestigationTarget;
    if (raw.startsWith('acc_') || raw.startsWith('ACC_')) {
      target = {
        type: 'ACCOUNT',
        id: raw.toLowerCase(),
        label: `Account ${raw.toLowerCase()}`,
        addedAt: new Date().toISOString(),
      };
    } else if (raw.startsWith('tx_') || raw.startsWith('TX_')) {
      target = {
        type: 'TRANSACTION',
        id: raw.toLowerCase(),
        label: `Transaction ${raw.toLowerCase()}`,
        addedAt: new Date().toISOString(),
      };
    } else {
      const num = raw.replace(/^(comm_|community_)/i, '');
      target = {
        type: 'COMMUNITY',
        id: num,
        label: `Community #${num}`,
        addedAt: new Date().toISOString(),
      };
    }

    addTargetToCase(investigationCase.id, target);
    setAddTargetInput('');
  };

  const handleDeleteCase = () => {
    if (window.confirm(`Are you sure you want to delete "${investigationCase.title}"?`)) {
      deleteCase(investigationCase.id);
      navigate('/investigations');
    }
  };

  const communities = investigationCase.targets.filter((t) => t.type === 'COMMUNITY');
  const accounts = investigationCase.targets.filter((t) => t.type === 'ACCOUNT');
  const transactions = investigationCase.targets.filter((t) => t.type === 'TRANSACTION');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1200px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <button
          onClick={() => navigate('/investigations')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <ArrowLeft size={14} />
          Investigation Queue
        </button>
        <span>/</span>
        <span className="font-mono text-slate-200">{investigationCase.id}</span>
      </div>

      {/* Case Header Card */}
      <div
        className="dash-card"
        style={{
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1, minWidth: '300px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: 'var(--accent-cyan)',
            }}
          >
            <Briefcase size={28} />
          </div>

          <div style={{ flex: 1 }}>
            {isEditingTitle ? (
              <form onSubmit={handleSaveTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#080c14',
                    border: '1px solid var(--border-focus)',
                    borderRadius: '4px',
                    color: 'var(--text-main)',
                    fontSize: '18px',
                    fontWeight: 700,
                    outline: 'none',
                    width: '100%',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '4px 10px',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-dim)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1
                  onClick={() => setIsEditingTitle(true)}
                  title="Click to edit title"
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {investigationCase.title}
                </h1>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', cursor: 'pointer' }} onClick={() => setIsEditingTitle(true)}>
                  ✎
                </span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span className="font-mono">{investigationCase.id}</span>
              <span>·</span>
              <span>Created {new Date(investigationCase.createdAt).toLocaleDateString()}</span>
              <span>·</span>
              <span>Last updated {new Date(investigationCase.updatedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Workflow Controls: Status & Priority */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Priority Select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Priority Tier
            </span>
            <select
              value={investigationCase.priority}
              onChange={(e) => handlePriorityChange(e.target.value as CasePriority)}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid var(--border)',
                color: 'var(--text-main)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="HIGH">HIGH Priority</option>
              <option value="MEDIUM">MEDIUM Priority</option>
              <option value="LOW">LOW Priority</option>
            </select>
          </div>

          {/* Status Workflow Select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Investigation Status
            </span>
            <select
              value={investigationCase.status}
              onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
              style={{
                backgroundColor:
                  investigationCase.status === 'OPEN'
                    ? 'rgba(56, 189, 248, 0.15)'
                    : investigationCase.status === 'REVIEW'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : '#1e293b',
                border: '1px solid',
                borderColor:
                  investigationCase.status === 'OPEN'
                    ? 'rgba(56, 189, 248, 0.4)'
                    : investigationCase.status === 'REVIEW'
                    ? 'rgba(245, 158, 11, 0.4)'
                    : 'var(--border)',
                color:
                  investigationCase.status === 'OPEN'
                    ? '#7dd3fc'
                    : investigationCase.status === 'REVIEW'
                    ? '#fcd34d'
                    : 'var(--text-muted)',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="OPEN">OPEN</option>
              <option value="REVIEW">UNDER REVIEW</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          <button
            onClick={handleDeleteCase}
            title="Delete Investigation"
            style={{
              padding: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '6px',
              color: '#f87171',
              cursor: 'pointer',
              marginTop: '16px',
            }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Investigator Notes Section */}
      <div className="dash-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-main)' }}>
              Investigator Notes
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              (Observations, cross-entity links, interview notes)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {savedNotesFeedback && (
              <span className="font-mono text-xs text-emerald-400" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} /> Notes Saved
              </span>
            )}
            <button
              onClick={handleSaveNotes}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                backgroundColor: '#0284c7',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Save size={13} />
              Save Notes
            </button>
          </div>
        </div>

        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Repeated payment-instrument reuse across several connected accounts. Review transaction timing and account relationships..."
          style={{
            width: '100%',
            padding: '12px 14px',
            backgroundColor: '#080c14',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text-main)',
            fontSize: '13px',
            lineHeight: 1.5,
            outline: 'none',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>

      {/* Investigation Targets Section */}
      <div className="dash-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-main)' }}>
              Investigation Targets ({investigationCase.targets.length})
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Communities, accounts, and transactions attached to this investigation case.
            </p>
          </div>

          {/* Quick Add Target Form */}
          <form onSubmit={handleQuickAddTarget} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={addTargetInput}
              onChange={(e) => setAddTargetInput(e.target.value)}
              placeholder="Attach ID (e.g. 3, acc_100, tx_7517)..."
              style={{
                padding: '6px 12px',
                backgroundColor: '#080c14',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                width: '240px',
              }}
            />
            <button
              type="submit"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid var(--border-light)',
                borderRadius: '4px',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={13} />
              Attach
            </button>
          </form>
        </div>

        {investigationCase.targets.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
            No targets attached to this case yet. Use the "Add to Investigation" button on any Community, Account, or Transaction page.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. Flagged Communities */}
            {communities.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Communities ({communities.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                  {communities.map((t) => (
                    <div
                      key={`${t.type}_${t.id}`}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#080c14',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ padding: '6px', borderRadius: '4px', backgroundColor: '#1e293b', color: 'var(--accent-cyan)' }}>
                          <Layers size={16} />
                        </div>
                        <div>
                          <span className="font-mono font-bold text-slate-100 text-sm">{t.label}</span>
                          {t.riskLevel && (
                            <div style={{ marginTop: '2px' }}>
                              <RiskBadge level={t.riskLevel} size="sm" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link
                          to={`/communities/${t.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            backgroundColor: '#1e293b',
                            borderRadius: '4px',
                            color: 'var(--accent-cyan)',
                            fontSize: '11px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          Open <ExternalLink size={11} />
                        </Link>
                        <button
                          onClick={() => handleRemoveTarget(t)}
                          title="Remove target"
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Target Accounts */}
            {accounts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Accounts ({accounts.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                  {accounts.map((t) => (
                    <div
                      key={`${t.type}_${t.id}`}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#080c14',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ padding: '6px', borderRadius: '4px', backgroundColor: '#1e293b', color: 'var(--accent-cyan)' }}>
                          <User size={16} />
                        </div>
                        <div>
                          <span className="font-mono font-bold text-slate-100 text-sm">{t.id}</span>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)' }}>
                            {t.label}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link
                          to={`/accounts/${t.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            backgroundColor: '#1e293b',
                            borderRadius: '4px',
                            color: 'var(--accent-cyan)',
                            fontSize: '11px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          Open <ExternalLink size={11} />
                        </Link>
                        <button
                          onClick={() => handleRemoveTarget(t)}
                          title="Remove target"
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Target Transactions */}
            {transactions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Transactions ({transactions.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                  {transactions.map((t) => (
                    <div
                      key={`${t.type}_${t.id}`}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#080c14',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ padding: '6px', borderRadius: '4px', backgroundColor: '#1e293b', color: 'var(--accent-cyan)' }}>
                          <Activity size={16} />
                        </div>
                        <div>
                          <span className="font-mono font-bold text-slate-100 text-sm">{t.id}</span>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)' }}>
                            {t.label}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link
                          to={`/transactions/${t.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            backgroundColor: '#1e293b',
                            borderRadius: '4px',
                            color: 'var(--accent-cyan)',
                            fontSize: '11px',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          Open <ExternalLink size={11} />
                        </Link>
                        <button
                          onClick={() => handleRemoveTarget(t)}
                          title="Remove target"
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
