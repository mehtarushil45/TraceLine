import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpDown, ChevronRight, Layers, Search, Filter } from 'lucide-react';
import type { CommunitySummary } from '../../types/api';
import { RiskBadge } from '../common/RiskBadge';
import { RiskScore } from '../common/RiskScore';
import { SignalBadge } from '../common/SignalBadge';
import { AddToInvestigationButton } from '../common/AddToInvestigationButton';

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
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          backgroundColor: '#070d1e',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '300px' }}>
          <div style={{ position: 'relative', width: '320px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID or observable signal..."
              style={{
                width: '100%',
                padding: '8px 14px 8px 34px',
                backgroundColor: '#030712',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontFamily: 'var(--font-sans)',
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
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor:
                    riskFilter === lvl
                      ? lvl === 'HIGH'
                        ? '#f43f5e'
                        : lvl === 'MEDIUM'
                        ? '#fbbf24'
                        : lvl === 'LOW'
                        ? '#10b981'
                        : 'var(--accent-cyan)'
                      : 'transparent',
                  backgroundColor:
                    riskFilter === lvl
                      ? lvl === 'HIGH'
                        ? 'rgba(244, 63, 94, 0.2)'
                        : lvl === 'MEDIUM'
                        ? 'rgba(251, 191, 36, 0.2)'
                        : lvl === 'LOW'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(2, 132, 199, 0.2)'
                      : 'transparent',
                  color:
                    riskFilter === lvl
                      ? lvl === 'HIGH'
                        ? '#fca5a5'
                        : lvl === 'MEDIUM'
                        ? '#fde68a'
                        : lvl === 'LOW'
                        ? '#86efac'
                        : '#00F0FF'
                      : 'var(--text-muted)',
                }}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Showing <strong className="text-slate-200">{sorted.length}</strong> of {communities.length} clusters
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
              <th>Risk Tier</th>
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
              <th>Primary Observable Signals</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
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
                    backgroundColor: isHigh ? 'rgba(244, 63, 94, 0.03)' : undefined,
                  }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '30px',
                          height: '30px',
                          borderRadius: '6px',
                          backgroundColor: isHigh ? 'rgba(244, 63, 94, 0.15)' : 'rgba(51, 65, 85, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isHigh ? '#f43f5e' : 'var(--text-muted)',
                        }}
                      >
                        <Layers size={15} />
                      </div>
                      <span className="font-mono font-bold" style={{ color: 'var(--text-main)' }}>
                        #{comm.community_id}
                      </span>
                    </div>
                  </td>
                  <td>
                    <RiskScore score={comm.risk_score} level={comm.risk_level} size="sm" showBar={true} />
                  </td>
                  <td>
                    <RiskBadge level={comm.risk_level} size="sm" />
                  </td>
                  <td className="font-mono text-slate-200 font-semibold">
                    {comm.member_count.toLocaleString()}
                  </td>
                  <td className="font-mono text-slate-300">
                    {comm.density.toFixed(5)}
                  </td>
                  <td className="font-mono text-slate-300">
                    {comm.mean_edge_weight !== null ? comm.mean_edge_weight.toFixed(2) : '—'}
                  </td>
                  <td className="font-mono text-slate-300">
                    {comm.tx_per_member.toFixed(1)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '380px' }}>
                      <SignalBadge signal={comm.top_signal_1} />
                      {comm.top_signal_2 && <SignalBadge signal={comm.top_signal_2} />}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                      <AddToInvestigationButton
                        targetType="COMMUNITY"
                        targetId={comm.community_id.toString()}
                        targetLabel={`Community #${comm.community_id}`}
                        riskScore={comm.risk_score}
                        riskLevel={comm.risk_level}
                        size="sm"
                      />
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          fontSize: '11px',
                          color: 'var(--accent-cyan)',
                          fontWeight: 700,
                        }}
                      >
                        Inspect
                        <ChevronRight size={14} />
                      </div>
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
