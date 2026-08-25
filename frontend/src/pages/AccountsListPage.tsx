import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, Users } from 'lucide-react';

export const AccountsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (accountId.trim()) {
      navigate(`/accounts/${accountId.trim().toLowerCase()}`);
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
              backgroundColor: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: 'var(--accent-cyan)',
            }}
          >
            <Users size={20} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Account Profile Registry
          </h1>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Directly lookup and inspect observable evidence, risk context, and transaction history for any account in the network.
        </p>
      </div>

      <div className="dash-card" style={{ padding: '28px', backgroundColor: '#070d1e' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '12px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="Enter Account ID (e.g. acc_100, acc_10006, acc_1)..."
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
            Lookup Profile <ArrowRight size={14} />
          </button>
        </form>

        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-dim)' }}>
          <span style={{ fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '10px', letterSpacing: '0.06em', fontSize: '11px' }}>
            Flagship Account Profiles for Review:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['acc_100', 'acc_10006', 'acc_10021', 'acc_1', 'acc_42', 'acc_123', 'acc_500'].map((sample) => (
              <button
                key={sample}
                onClick={() => navigate(`/accounts/${sample}`)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#030712',
                  border: '1px solid var(--border)',
                  color: 'var(--accent-cyan)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                  e.currentTarget.style.backgroundColor = 'rgba(0, 240, 255, 0.1)';
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
