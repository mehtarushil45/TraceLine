import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
          Transaction Inspection Search
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Inspect observable transaction details, merchant attributes, and digital device/IP footprints.
        </p>
      </div>

      <div className="dash-card" style={{ padding: '24px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="Enter Transaction ID (e.g. tx_7517, tx_14402, tx_1)..."
              style={{
                width: '100%',
                padding: '9px 14px 9px 36px',
                backgroundColor: '#080c14',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '9px 20px',
              backgroundColor: '#0284c7',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Inspect <ArrowRight size={14} />
          </button>
        </form>

        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-dim)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
            Quick Examples:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['tx_7517', 'tx_14402', 'tx_38734', 'tx_55721', 'tx_99054'].map((sample) => (
              <button
                key={sample}
                onClick={() => navigate(`/transactions/${sample}`)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  backgroundColor: '#1e293b',
                  border: '1px solid var(--border)',
                  color: 'var(--accent-cyan)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
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
