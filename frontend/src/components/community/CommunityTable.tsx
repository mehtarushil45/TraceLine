import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ChevronRight, Layers, Search, Filter } from 'lucide-react';
import type { CommunitySummary } from '../../types/api';
import { RiskBadge } from '../common/RiskBadge';
import { RiskScore } from '../common/RiskScore';
import { SignalBadge } from '../common/SignalBadge';

interface CommunityTableProps {
  communities: CommunitySummary[];
}

export const CommunityTable: React.FC<CommunityTableProps> = ({ communities }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<keyof CommunitySummary>('risk_score');
  const [sortAsc, setSortAsc] = useState(false);

  const filtered = communities.filter((c) => {
    const matchesSearch =
      c.community_id.toString().includes(search) ||
      c.top_signal_1.toLowerCase().includes(search.toLowerCase()) ||
      c.top_signal_2.toLowerCase().includes(search.toLowerCase()) ||
      c.top_signal_3.toLowerCase().includes(search.toLowerCase());

    const matchesRisk = riskFilter === 'ALL' || c.risk_level === riskFilter;

    return matchesSearch && matchesRisk;
  });

  const sorted = [...filtered].sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];

    if (valA === null || valA === undefined) valA = -Infinity as any;
    if (valB === null || valB === undefined) valB = -Infinity as any;

    if (typeof valA === 'string') {
      return sortAsc
        ? (valA as string).localeCompare(valB as string)
        : (valB as string).localeCompare(valA as string);
    }
    return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
  });

  const handleSort = (column: keyof CommunitySummary) => {
    if (sortBy === column) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(column);
      setSortAsc(false);
    }
  };

  return (
    <div className="dash-card" style={{ overflow: 'hidden' }}>
      {/* Table Filter Bar */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          backgroundColor: '#0b1120',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by ID or signal..."
              style={{
                width: '100%',
                padding: '6px 12px 6px 30px',
                backgroundColor: '#1e293b',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-main)',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} style={{ color: 'var(--text-dim)' }} />
            {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setRiskFilter(lvl)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: riskFilter === lvl ? 'var(--border-light)' : 'transparent',
                  backgroundColor:
                    riskFilter === lvl
                      ? lvl === 'HIGH'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : lvl === 'MEDIUM'
                        ? 'rgba(245, 158, 11, 0.2)'
                        : lvl === 'LOW'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : '#1e293b'
                      : 'transparent',
                  color:
                    lvl === 'HIGH'
                      ? '#fca5a5'
                      : lvl === 'MEDIUM'
                      ? '#fcd34d'
                      : lvl === 'LOW'
                      ? '#86efac'
                      : 'var(--text-muted)',
                }}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Showing {sorted.length} of {communities.length} communities
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="sec-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('community_id')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Community <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('risk_score')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Risk Score <ArrowUpDown size={12} />
                </div>
              </th>
              <th>Risk Level</th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('member_count')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Members <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('density')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Density <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('mean_edge_weight')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Mean Weight <ArrowUpDown size={12} />
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('tx_per_member')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Tx / Member <ArrowUpDown size={12} />
                </div>
              </th>
              <th>Top Observable Signals</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((comm) => {
              const isHigh = comm.risk_level === 'HIGH';
              return (
                <tr
                  key={comm.community_id}
                  onClick={() => navigate(`/communities/${comm.community_id}`)}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.03)' : undefined,
                  }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '4px',
                          backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.15)' : 'rgba(51, 65, 85, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isHigh ? '#ef4444' : 'var(--text-muted)',
                        }}
                      >
                        <Layers size={14} />
                      </div>
                      <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        #{comm.community_id}
                      </span>
                    </div>
                  </td>
                  <td>
                    <RiskScore score={comm.risk_score} level={comm.risk_level} size="sm" />
                  </td>
                  <td>
                    <RiskBadge level={comm.risk_level} size="sm" />
                  </td>
                  <td className="font-mono" style={{ color: 'var(--text-main)' }}>
                    {comm.member_count.toLocaleString()}
                  </td>
                  <td className="font-mono" style={{ color: 'var(--text-muted)' }}>
                    {comm.density.toFixed(5)}
                  </td>
                  <td className="font-mono" style={{ color: 'var(--text-muted)' }}>
                    {comm.mean_edge_weight !== null ? comm.mean_edge_weight.toFixed(2) : '—'}
                  </td>
                  <td className="font-mono" style={{ color: 'var(--text-muted)' }}>
                    {comm.tx_per_member.toFixed(1)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '380px' }}>
                      <SignalBadge signal={comm.top_signal_1} />
                      {comm.top_signal_2 && <SignalBadge signal={comm.top_signal_2} />}
                    </div>
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
                      Investigate
                      <ChevronRight size={14} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
