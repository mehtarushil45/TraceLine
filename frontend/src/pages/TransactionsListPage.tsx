import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { Button } from '../components/common/Button';

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
      <PageHeader
        title="Transaction Registry"
        description="Search and investigate individual money transfer operations, merchant gateway routing, and authorization flags."
      />

      <Panel padding="lg">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '11px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="Enter Transaction ID (e.g. tx_...)..."
              style={{
                width: '100%',
                padding: '9px 14px 9px 36px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: '5px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
              autoFocus
            />
          </div>
          <Button type="submit" variant="primary" icon={ArrowRight} iconPosition="right">
            Inspect Flow
          </Button>
        </form>

        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
            Search tip: Enter exact transaction identifier (e.g. prefix with <code>tx_</code>) or navigate via account transaction ledgers.
          </span>
        </div>
      </Panel>
    </div>
  );
};
