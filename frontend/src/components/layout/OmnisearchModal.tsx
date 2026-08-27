import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Briefcase,
  Layers,
  Search,
  Users,
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

  // Matched cases from real LocalStorage cases
  const matchedCases = raw
    ? cases.filter((c) => c.title.toLowerCase().includes(raw) || c.id.toLowerCase().includes(raw))
    : cases.slice(0, 3);

  const isNumeric = /^\d+$/.test(raw.replace(/^#/, ''));
  const isAccount = raw.startsWith('acc_') || (raw.startsWith('acc') && raw.length > 3);
  const isTransaction = raw.startsWith('tx_') || (raw.startsWith('tx') && raw.length > 2);

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
    } else if (matchedCases.length > 0) {
      handleSelect(`/investigations/${matchedCases[0].id}`);
    } else {
      handleSelect(`/communities`);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh',
        paddingLeft: '16px',
        paddingRight: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="dash-card"
        style={{
          width: '100%',
          maxWidth: '580px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <form onSubmit={handleEnter} style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-dim)', marginRight: '10px', flexShrink: 0 }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investigations, communities, accounts and transactions..."
            autoFocus
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
          >
            <X size={16} />
          </button>
        </form>

        {/* Results / Navigation Suggestions */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Direct Entity Pattern Match */}
          {raw && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', padding: '2px 6px' }}>
                Direct Target Navigation
              </span>

              {isNumeric && (
                <div
                  onClick={() => handleSelect(`/communities/${raw.replace(/^#/, '')}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-subtle)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Open Community #{raw.replace(/^#/, '')}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    Enter <ArrowRight size={11} />
                  </span>
                </div>
              )}

              {isAccount && (
                <div
                  onClick={() => handleSelect(`/accounts/${raw}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-subtle)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      Inspect Account {raw}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    Enter <ArrowRight size={11} />
                  </span>
                </div>
              )}

              {isTransaction && (
                <div
                  onClick={() => handleSelect(`/transactions/${raw}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-subtle)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={14} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      Inspect Transaction {raw}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    Enter <ArrowRight size={11} />
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Matched Investigation Cases */}
          {matchedCases.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', padding: '2px 6px' }}>
                Active Cases ({matchedCases.length})
              </span>
              {matchedCases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleSelect(`/investigations/${c.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-subtle)',
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Briefcase size={14} style={{ color: 'var(--text-muted)' }} />
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {c.title}
                      </span>
                      <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                        {c.id} · {c.targets.length} targets · {c.status}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {c.priority}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Registry Jump Shortcuts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', padding: '2px 6px' }}>
              Registries
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div
                onClick={() => handleSelect('/communities')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '5px',
                  backgroundColor: 'var(--bg-subtle)',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                <Layers size={13} style={{ color: 'var(--accent)' }} />
                <span>Communities Registry</span>
              </div>

              <div
                onClick={() => handleSelect('/accounts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 10px',
                  borderRadius: '5px',
                  backgroundColor: 'var(--bg-subtle)',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                <Users size={13} style={{ color: 'var(--accent)' }} />
                <span>Accounts Registry</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-dim)' }}>
          <span>Type ID to navigate directly (e.g. 3, acc_..., tx_...)</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
};
