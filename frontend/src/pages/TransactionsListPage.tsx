import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, Search } from 'lucide-react';

export const TransactionsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [txId, setTxId] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (txId.trim()) {
      navigate(`/transactions/${txId.trim().toLowerCase()}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '880px' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '8px',
              borderRadius: '8px',
              backgroundColor: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              color: '#fbbf24',
            }}
          >
            <Activity size={20} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Transaction Stream & Flow Inspector
          </h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Search and investigate specific money transfer operations, merchant context, and digital fingerprints.
        </p>
      </div>

      <div className="dash-card" style={{ padding: '28px', backgroundColor: '#070d1e' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="Enter Transaction ID (e.g. tx_7517, tx_1, tx_100)..."
              style={{
                width: '100%',
                padding: '10px 16px 10px 40px',
                backgroundColor: '#030712',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
              autoFocus
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '10px 22px',
              backgroundColor: '#0284c7',
              background: 'linear-gradient(135deg, #0284c7 0%, #00F0FF 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#030712',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Inspect Flow <ArrowRight size={14} />
          </button>
        </form>

        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-dim)' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '10px', letterSpacing: '0.06em', fontSize: '11px' }}>
            Sample Payment Network Transactions:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['tx_7517', 'tx_1', 'tx_100', 'tx_500', 'tx_1000', 'tx_42', 'tx_9999'].map((sample) => (
              <button
                key={sample}
                onClick={() => navigate(`/transactions/${sample}`)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#030712',
                  border: '1px solid var(--border)',
                  color: '#fbbf24',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = '#fbbf24';
                  e.currentTarget.style.backgroundColor = 'rgba(251, 191, 36, 0.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.backgroundColor = '#030712';
                }}
              >
                {sample}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
