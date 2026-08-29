import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, Search } from 'lucide-react';
import type { TimelineEvent, EvidenceItem } from '../../types/api';

interface TimelineViewProps {
  events: TimelineEvent[];
  evidenceFocus?: EvidenceItem | null;
  communityId?: number | string;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ events, evidenceFocus = null, communityId }) => {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DECLINED' | 'SETTLED'>('ALL');

  const filtered = events.filter((e) => {
    const matchesText =
      e.transaction_id.toLowerCase().includes(filterText.toLowerCase()) ||
      e.src_account_id.toLowerCase().includes(filterText.toLowerCase()) ||
      e.dst_account_id.toLowerCase().includes(filterText.toLowerCase()) ||
      (e.merchant_id && e.merchant_id.toLowerCase().includes(filterText.toLowerCase()));

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'DECLINED' && e.transaction_status.toLowerCase() === 'declined') ||
      (statusFilter === 'SETTLED' && e.transaction_status.toLowerCase() === 'settled');

    return matchesText && matchesStatus;
  });

  // If an evidence focus is active, compute which events match the supporting entities
  const evidenceMatches = React.useMemo(() => {
    if (!evidenceFocus) return new Set<string>();
    const supports = new Set(evidenceFocus.supporting_entities || []);
    const matched = new Set<string>();
    filtered.forEach((evt) => {
      if (!evt) return;
      if (supports.has(evt.transaction_id) || supports.has(evt.src_account_id) || supports.has(evt.dst_account_id)) {
        matched.add(evt.transaction_id);
      }
    });
    return matched;
  }, [filtered, evidenceFocus]);


  return (
    <div className="dash-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Timeline Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Search by ID, Account, Merchant..."
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {(['ALL', 'DECLINED', 'SETTLED'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: statusFilter === st ? 'var(--border-light)' : 'transparent',
                  backgroundColor:
                    statusFilter === st
                      ? st === 'DECLINED'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : st === 'SETTLED'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : '#1e293b'
                      : 'transparent',
                  color:
                    st === 'DECLINED'
                      ? '#fca5a5'
                      : st === 'SETTLED'
                      ? '#86efac'
                      : 'var(--text-muted)',
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {filtered.length} chronological events shown
        </span>
      </div>

      {/* Chronological Stream */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Evidence timeline banner when focus exists */}
        {evidenceFocus && (
          <div style={{ marginBottom: 8, padding: '10px 12px', borderRadius: 6, background: 'rgba(5,10,24,0.6)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-cyan)' }}>Evidence Focus: {evidenceFocus.type.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{evidenceMatches.size} related transactions highlighted</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {evidenceMatches.size === 0 ? 'No transaction-level evidence associated with this signal.' : ''}
            </div>
          </div>
        )}

        <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((evt) => {
            const isDeclined = evt.transaction_status.toLowerCase() === 'declined';
            const isHighlighted = evidenceFocus ? evidenceMatches.has(evt.transaction_id) : true;

            return (
              <div
                key={evt.transaction_id}
                onClick={() =>
                  navigate(`/transactions/${evt.transaction_id}`, {
                    state: {
                      fromForensics: true,
                      communityId: communityId ? String(communityId) : undefined,
                      forensicView: 'timeline',
                    },
                  })
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: isDeclined ? 'rgba(239, 68, 68, 0.08)' : 'rgba(30, 41, 59, 0.3)',
                  border: isDeclined ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease, opacity 0.15s ease',
                  opacity: evidenceFocus && !isHighlighted ? 0.25 : 1,
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
                onMouseOut={(e) =>
                  (e.currentTarget.style.borderColor = isDeclined ? 'rgba(239, 68, 68, 0.25)' : 'var(--border)')
                }
              >
                {/* Left: Time & Tx ID */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)', fontSize: '12px', width: '150px' }}>
                    <Clock size={13} />
                    <span className="font-mono">{evt.timestamp.replace('T', ' ')}</span>
                  </div>
                  <span className="font-mono font-semibold" style={{ color: 'var(--accent-cyan)', fontSize: '12px' }}>
                    {evt.transaction_id}
                  </span>
                </div>

                {/* Middle: Flow */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--text-main)' }}>{evt.src_account_id}</span>
                  <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
                  <span style={{ color: 'var(--text-main)' }}>{evt.dst_account_id}</span>
                </div>

                {/* Right: Amount & Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {evt.merchant_id && (
                    <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                      {evt.merchant_id}
                    </span>
                  )}
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-main)', fontSize: '13px' }}>
                    ${evt.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: isDeclined ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                      color: isDeclined ? '#fca5a5' : '#86efac',
                      fontSize: '10px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {evt.transaction_status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
