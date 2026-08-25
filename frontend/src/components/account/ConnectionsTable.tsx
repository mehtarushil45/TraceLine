import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CreditCard, Network, Smartphone, Store } from 'lucide-react';
import type { ConnectionItem } from '../../types/api';

interface ConnectionsTableProps {
  connections: ConnectionItem[];
}

export const ConnectionsTable: React.FC<ConnectionsTableProps> = ({ connections }) => {
  const navigate = useNavigate();

  if (connections.length === 0) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
        No observable evidence connections detected for this account.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="sec-table">
        <thead>
          <tr>
            <th>Connected Account</th>
            <th>Evidence Weight</th>
            <th>Shared Devices</th>
            <th>Shared Instruments</th>
            <th>Shared IPs</th>
            <th>Shared Merchants</th>
            <th>Co-occurrence</th>
            <th style={{ textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {connections.map((conn) => (
            <tr
              key={conn.connected_account_id}
              onClick={() => navigate(`/accounts/${conn.connected_account_id}`)}
              style={{ cursor: 'pointer' }}
            >
              <td>
                <span className="font-mono font-semibold" style={{ color: 'var(--accent-cyan)' }}>
                  {conn.connected_account_id}
                </span>
              </td>
              <td>
                <span className="font-mono font-bold" style={{ color: '#f59e0b' }}>
                  {conn.edge_weight.toFixed(2)}
                </span>
              </td>
              <td>
                {conn.shared_devices.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171' }}>
                    <Smartphone size={13} />
                    <span className="font-mono text-xs">{conn.shared_devices.join(', ')}</span>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
              </td>
              <td>
                {conn.shared_payment_instruments.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
                    <CreditCard size={13} />
                    <span className="font-mono text-xs">{conn.shared_payment_instruments.join(', ')}</span>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
              </td>
              <td>
                {conn.shared_ips.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c084fc' }}>
                    <Network size={13} />
                    <span className="font-mono text-xs">{conn.shared_ips.join(', ')}</span>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
              </td>
              <td>
                {conn.shared_merchants.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
                    <Store size={13} />
                    <span className="font-mono text-xs">{conn.shared_merchants.length} merchants</span>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
              </td>
              <td>
                {conn.temporal_overlap > 0 ? (
                  <span className="font-mono text-xs" style={{ color: '#38bdf8' }}>
                    {conn.temporal_overlap} days
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>—</span>
                )}
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
                  Inspect
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
