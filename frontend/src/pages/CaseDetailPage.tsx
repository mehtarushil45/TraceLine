import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  FileText,
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
import { SarExportModal } from '../components/layout/SarExportModal';

export const CaseDetailPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [investigationCase, setInvestigationCase] = useState<InvestigationCase | null>(null);
  const [notes, setNotes] = useState('');
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [savedNotesFeedback, setSavedNotesFeedback] = useState(false);
  const [addTargetInput, setAddTargetInput] = useState('');
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

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
    } else if (!isNaN(Number(raw))) {
      target = {
        type: 'COMMUNITY',
        id: raw,
        label: `Community #${raw}`,
        addedAt: new Date().toISOString(),
      };
    } else {
      target = {
        type: 'ACCOUNT',
        id: raw.toLowerCase(),
        label: `Account ${raw.toLowerCase()}`,
        addedAt: new Date().toISOString(),
      };
    }

    addTargetToCase(investigationCase.id, target);
    setAddTargetInput('');
  };

  const handleDeleteThisCase = () => {
    if (window.confirm('Delete this investigation case entirely?')) {
      deleteCase(investigationCase.id);
      navigate('/investigations');
    }
  };

  const communityTargets = investigationCase.targets.filter((t) => t.type === 'COMMUNITY');
  const accountTargets = investigationCase.targets.filter((t) => t.type === 'ACCOUNT');
  const transactionTargets = investigationCase.targets.filter((t) => t.type === 'TRANSACTION');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Breadcrumb & Action Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
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
            Investigations
          </button>
          <span>/</span>
          <span className="font-mono text-slate-200">{investigationCase.id}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsSarModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              backgroundColor: '#162447',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <FileText size={13} style={{ color: 'var(--accent-cyan)' }} />
            <span>Generate SAR</span>
          </button>

          <button
            onClick={handleDeleteThisCase}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: '6px',
              color: '#fca5a5',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
            <span>Delete Case</span>
          </button>
        </div>
      </div>

      {/* 2. Case Workspace Header */}
      <div
        className="dash-card"
        style={{
          padding: '24px 28px',
          backgroundColor: '#070d1e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1, minWidth: '320px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: 'var(--accent-cyan)',
              boxShadow: '0 0 16px rgba(0, 240, 255, 0.2)',
            }}
          >
            <Briefcase size={26} />
          </div>

          <div style={{ flex: 1 }}>
            {isEditingTitle ? (
              <form onSubmit={handleSaveTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '500px' }}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    backgroundColor: '#030712',
                    border: '1px solid var(--accent-cyan)',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '16px',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                  autoFocus
                />
                <button
                  type="submit"
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  {investigationCase.title}
                </h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Edit
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span className="font-mono text-slate-400">{investigationCase.id}</span>
              <span>·</span>
              <span>Created {new Date(investigationCase.createdAt).toLocaleString()}</span>
              <span>·</span>
              <span>Updated {new Date(investigationCase.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Status & Priority Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
              Status Workflow
            </span>
            <select
              value={investigationCase.status}
              onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
              style={{
                backgroundColor: '#030712',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="OPEN">● OPEN</option>
              <option value="REVIEW">◐ UNDER REVIEW</option>
              <option value="CLOSED">○ CLOSED</option>
            </select>
          </div>

          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
              Priority Level
            </span>
            <select
              value={investigationCase.priority}
              onChange={(e) => handlePriorityChange(e.target.value as CasePriority)}
              style={{
                backgroundColor: '#030712',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="HIGH">HIGH PRIORITY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Investigator Notes Workspace */}
      <div className="dash-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f8fafc' }}>
              Investigator Notes
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Document hypotheses, observable evidence findings, and relationship topology.
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {savedNotesFeedback && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#86efac', fontWeight: 600 }}>
                <CheckCircle2 size={13} />
                Saved to Local Storage
              </span>
            )}
            <button
              onClick={handleSaveNotes}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: '#0284c7',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Save size={13} />
              Save Notes
            </button>
          </div>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. 'Cluster #3 accounts exhibit shared hardware fingerprint device_102 and payment card token_99. Coordinate with merchant operations for settlement review...'"
          rows={5}
          style={{
            width: '100%',
            padding: '12px 14px',
            backgroundColor: '#030712',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text-main)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.5,
            outline: 'none',
            resize: 'vertical',
          }}
        />
      </div>

      {/* 4. Investigation Targets & Quick-Attach */}
      <div className="dash-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f8fafc' }}>
              Attached Targets ({investigationCase.targets.length})
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Tracked Communities, Accounts, and Transactions linked to this case.
            </span>
          </div>

          {/* Quick Add Bar */}
          <form onSubmit={handleQuickAddTarget} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              value={addTargetInput}
              onChange={(e) => setAddTargetInput(e.target.value)}
              placeholder="Quick attach (e.g. 3, acc_100, tx_7517)..."
              style={{
                width: '280px',
                padding: '6px 12px',
                backgroundColor: '#030712',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
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
                borderRadius: '6px',
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

        {/* Empty Targets State */}
        {investigationCase.targets.length === 0 ? (
          <div style={{ padding: '30px 20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '6px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              No targets attached yet. Attach entities via the quick input above or browse Communities/Accounts.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Communities */}
            {communityTargets.length > 0 && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-cyan)', display: 'block', marginBottom: '8px' }}>
                  Communities ({communityTargets.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                  {communityTargets.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#070d1e',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Layers size={16} style={{ color: 'var(--accent-cyan)' }} />
                        <div>
                          <Link
                            to={`/communities/${t.id}`}
                            style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', textDecoration: 'none' }}
                          >
                            {t.label}
                          </Link>
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
                          style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center' }}
                        >
                          <ExternalLink size={14} />
                        </Link>
                        <button
                          onClick={() => handleRemoveTarget(t)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accounts */}
            {accountTargets.length > 0 && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#38bdf8', display: 'block', marginBottom: '8px' }}>
                  Accounts ({accountTargets.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                  {accountTargets.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#070d1e',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <User size={16} style={{ color: '#38bdf8' }} />
                        <div>
                          <Link
                            to={`/accounts/${t.id}`}
                            className="font-mono"
                            style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', textDecoration: 'none' }}
                          >
                            {t.label}
                          </Link>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link
                          to={`/accounts/${t.id}`}
                          style={{ color: '#38bdf8', display: 'flex', alignItems: 'center' }}
                        >
                          <ExternalLink size={14} />
                        </Link>
                        <button
                          onClick={() => handleRemoveTarget(t)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transactions */}
            {transactionTargets.length > 0 && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24', display: 'block', marginBottom: '8px' }}>
                  Transactions ({transactionTargets.length})
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                  {transactionTargets.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#070d1e',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Activity size={16} style={{ color: '#fbbf24' }} />
                        <div>
                          <Link
                            to={`/transactions/${t.id}`}
                            className="font-mono"
                            style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', textDecoration: 'none' }}
                          >
                            {t.label}
                          </Link>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Link
                          to={`/transactions/${t.id}`}
                          style={{ color: '#fbbf24', display: 'flex', alignItems: 'center' }}
                        >
                          <ExternalLink size={14} />
                        </Link>
                        <button
                          onClick={() => handleRemoveTarget(t)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
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

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
