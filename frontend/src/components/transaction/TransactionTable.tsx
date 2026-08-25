import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { TransactionItem } from '../../types/api';

interface TransactionTableProps {
  transactions: TransactionItem[];
  highlightAccountId?: string;
}

export const TransactionTable: React.FC<TransactionTableProps> = ({
  transactions,
  highlightAccountId,
}) => {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'settled' || s === 'completed' || s === 'success') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            color: '#86efac',
            fontSize: '11px',
            fontWeight: 500,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <CheckCircle2 size={11} />
          {status}
        </span>
      );
    }
    if (s === 'declined' || s === 'failed') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#fca5a5',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <XCircle size={11} />
          {status}
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 6px',
          borderRadius: '4px',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          color: '#fcd34d',
          fontSize: '11px',
          fontWeight: 500,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <Clock size={11} />
        {status}
      </span>
    );
  };

  if (transactions.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
        No transactions recorded.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="sec-table">
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Timestamp</th>
            <th>Amount</th>
            <th>Flow (Source → Destination)</th>
            <th>Merchant / Method</th>
            <th>Device / IP</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const isSource = highlightAccountId && tx.src_account_id === highlightAccountId;
            const isDest = highlightAccountId && tx.dst_account_id === highlightAccountId;

            return (
              <tr
                key={tx.transaction_id}
                onClick={() => navigate(`/transactions/${tx.transaction_id}`)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <span className="font-mono font-semibold" style={{ color: 'var(--accent-cyan)' }}>
                    {tx.transaction_id}
                  </span>
                </td>
                <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {tx.timestamp.replace('T', ' ')}
                </td>
                <td className="font-mono font-semibold" style={{ color: 'var(--text-main)' }}>
                  ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/accounts/${tx.src_account_id}`);
                      }}
                      style={{
                        color: isSource ? '#f87171' : 'var(--text-main)',
                        fontWeight: isSource ? 700 : 400,
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                      }}
                    >
                      {tx.src_account_id}
                    </span>
                    <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/accounts/${tx.dst_account_id}`);
                      }}
                      style={{
                        color: isDest ? '#34d399' : 'var(--text-main)',
                        fontWeight: isDest ? 700 : 400,
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                      }}
                    >
                      {tx.dst_account_id}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="font-mono text-xs" style={{ color: 'var(--text-main)' }}>
                      {tx.merchant_id || 'P2P Transfer'}
                    </span>
                    {tx.payment_method && (
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                        {tx.payment_method}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {tx.device_id || '—'}
                    </span>
                    {tx.ip_address && (
                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>
                        {tx.ip_address}
                      </span>
                    )}
                  </div>
                </td>
                <td>{getStatusBadge(tx.transaction_status)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
