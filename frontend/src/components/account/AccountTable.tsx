import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, User } from 'lucide-react';
import type { AccountSummary } from '../../types/api';

interface AccountTableProps {
  accounts: AccountSummary[];
  loading?: boolean;
}

export const AccountTable: React.FC<AccountTableProps> = ({ accounts }) => {
  const navigate = useNavigate();

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="sec-table">
        <thead>
          <tr>
            <th>Account ID</th>
            <th>Customer Name</th>
            <th>Balance</th>
            <th>Baseline Risk</th>
            <th>Creation Date</th>
            <th>Community</th>
            <th style={{ textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((acc) => (
            <tr
              key={acc.account_id}
              onClick={() => navigate(`/accounts/${acc.account_id}`)}
              style={{ cursor: 'pointer' }}
            >
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--accent-cyan)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <User size={13} />
                  </div>
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-main)' }}>
                    {acc.account_id}
                  </span>
                </div>
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{acc.customer_name}</td>
              <td className="font-mono" style={{ color: 'var(--text-main)' }}>
                ${acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td>
                {acc.account_risk_score !== null ? (
                  <span className="font-mono text-xs" style={{ color: acc.account_risk_score > 0.6 ? '#f87171' : 'var(--text-dim)' }}>
                    {(acc.account_risk_score * 100).toFixed(1)}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
              </td>
              <td className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
                {acc.creation_date || '—'}
              </td>
              <td>
                <span
                  className="font-mono text-xs"
                  style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: '#1e293b',
                    color: 'var(--text-muted)',
                  }}
                >
                  #{acc.community_id}
                </span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontSize: '11px',
                    color: 'var(--accent-cyan)',
                    fontWeight: 600,
                  }}
                >
                  Profile
                  <ChevronRight size={13} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
