import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Briefcase,
  Layers,
  Search,
  User,
  X,
} from 'lucide-react';
import { getCases } from '../../utils/caseManager';

interface OmnisearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OmnisearchModal: React.FC<OmnisearchModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const raw = query.trim().toLowerCase();
  const cases = getCases();

  // Search matches
  const matchedCases = cases.filter(
    (c) => c.title.toLowerCase().includes(raw) || c.id.toLowerCase().includes(raw)
  );

  const isNumeric = /^\d+$/.test(raw.replace(/^#/, ''));
  const isAccount = raw.startsWith('acc_') || raw.includes('account');
  const isTransaction = raw.startsWith('tx_') || raw.includes('transaction');

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
    setQuery('');
  };

  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!raw) return;

    if (isNumeric) {
      handleSelect(`/communities/${raw.replace(/^#/, '')}`);
    } else if (raw.startsWith('acc_')) {
      handleSelect(`/accounts/${raw}`);
    } else if (raw.startsWith('tx_')) {
      handleSelect(`/transactions/${raw}`);
    } else {
      handleSelect(`/communities`);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        paddingLeft: '16px',
        paddingRight: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="dash-card"
        style={{
          width: '100%',
          maxWidth: '620px',
          backgroundColor: '#0a1024',
          border: '1px solid rgba(0, 240, 255, 0.3)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 32px rgba(0, 240, 255, 0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <form onSubmit={handleEnter} style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <Search size={18} style={{ color: 'var(--accent-cyan)', marginRight: '12px', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search communities (#3), accounts (acc_100), transactions (tx_7517), or cases..."
            autoFocus
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#f8fafc',
              fontSize: '15px',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </form>

        {/* Search Results & Quick Actions */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Quick Suggestions */}
          {!raw && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', padding: '4px 8px' }}>
                Quick Triage Targets
              </span>
              <div
                onClick={() => handleSelect('/communities/3')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e' }}>
                    <Layers size={15} />
                  </div>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                      Community #3 (Flagship Cluster)
                    </span>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Risk Score: 92/100 · High Hardware & Instrument Reuse
                    </span>
                  </div>
                </div>
                <span className="font-mono text-xs text-rose-400 font-bold">92 HIGH</span>
              </div>

              <div
                onClick={() => handleSelect('/investigations')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)' }}>
                  <Briefcase size={15} />
                </div>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                    Investigation Queue & Watchlist
                  </span>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Review tracked targets, cases, and forensic notes
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Direct Matches */}
          {raw && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', padding: '4px 8px' }}>
                Matching Entities
              </span>

              {/* Community Jump */}
              {(isNumeric || raw.includes('comm')) && (
                <div
                  onClick={() => handleSelect(`/communities/${raw.replace(/\D/g, '') || '3'}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Layers size={16} style={{ color: 'var(--accent-cyan)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                      Jump to Community #{raw.replace(/\D/g, '') || '0'}
                    </span>
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)' }} />
                </div>
              )}

              {/* Account Jump */}
              {(isAccount || raw.startsWith('acc_')) && (
                <div
                  onClick={() => handleSelect(`/accounts/${raw}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <User size={16} style={{ color: '#38bdf8' }} />
                    <span className="font-mono text-sm text-slate-100 font-semibold">
                      Inspect Account '{raw}'
                    </span>
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)' }} />
                </div>
              )}

              {/* Transaction Jump */}
              {(isTransaction || raw.startsWith('tx_')) && (
                <div
                  onClick={() => handleSelect(`/transactions/${raw}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Activity size={16} style={{ color: '#fbbf24' }} />
                    <span className="font-mono text-sm text-slate-100 font-semibold">
                      Inspect Transaction '{raw}'
                    </span>
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)' }} />
                </div>
              )}

              {/* Matched Investigation Cases */}
              {matchedCases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleSelect(`/investigations/${c.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Briefcase size={16} style={{ color: '#c084fc' }} />
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                        {c.title}
                      </span>
                      <span className="font-mono text-[11px]" style={{ display: 'block', color: 'var(--text-dim)' }}>
                        {c.id} · {c.status} · {c.targets.length} targets
                      </span>
                    </div>
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--text-dim)' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer Key Hints */}
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: '#050a18',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-dim)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span><kbd style={{ padding: '2px 4px', backgroundColor: '#1e293b', borderRadius: '3px', color: 'var(--text-muted)' }}>↵ Enter</kbd> to Select</span>
            <span><kbd style={{ padding: '2px 4px', backgroundColor: '#1e293b', borderRadius: '3px', color: 'var(--text-muted)' }}>Esc</kbd> to Close</span>
          </div>
          <span className="gradient-text-razorpay font-semibold">Razorpay Neural Graph Search</span>
        </div>
      </div>
    </div>
  );
};
