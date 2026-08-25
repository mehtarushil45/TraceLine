import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Shield, ArrowRight } from 'lucide-react';

export const Header: React.FC = () => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean) return;

    if (clean.startsWith('acc_') || clean.startsWith('ACC_')) {
      navigate(`/accounts/${clean.toLowerCase()}`);
    } else if (clean.startsWith('tx_') || clean.startsWith('TX_')) {
      navigate(`/transactions/${clean.toLowerCase()}`);
    } else if (!isNaN(Number(clean))) {
      navigate(`/communities/${clean}`);
    } else if (clean.toLowerCase().startsWith('comm_') || clean.toLowerCase().startsWith('community_')) {
      const num = clean.replace(/^(comm_|community_)/i, '');
      if (!isNaN(Number(num))) {
        navigate(`/communities/${num}`);
      }
    } else {
      // Fallback: search accounts
      navigate(`/accounts/${clean}`);
    }
    setQuery('');
  };

  return (
    <header
      style={{
        height: '56px',
        backgroundColor: 'rgba(10, 15, 29, 0.8)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Quick Search */}
      <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', width: '380px', position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '12px', color: 'var(--text-dim)' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Community ID (e.g. 3), Account (acc_...), or Tx (tx_...)"
          style={{
            width: '100%',
            padding: '7px 32px 7px 34px',
            backgroundColor: '#080c14',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--text-main)',
            fontSize: '12px',
            outline: 'none',
            fontFamily: 'var(--font-mono)',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        {query && (
          <button
            type="submit"
            style={{
              position: 'absolute',
              right: '8px',
              background: 'none',
              border: 'none',
              color: 'var(--accent-cyan)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowRight size={14} />
          </button>
        )}
      </form>

      {/* Security Context Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            fontSize: '11px',
            color: '#7dd3fc',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Shield size={13} />
          <span>STRICT OBSERVABLE MODE</span>
        </div>
      </div>
    </header>
  );
};
