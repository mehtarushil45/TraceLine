import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { getTransactionsList } from '../api';
import type { PaginatedTransactionListResponse, TransactionListItem } from '../types/api';
import {
  Badge,
  Button,
  EmptyState,
  EntityLink,
  ErrorState,
  LoadingState,
  Panel,
  PageHeader,
} from '../components/common';

// ─── Status rendering ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  settled:  { color: '#86efac', bg: 'rgba(134,239,172,0.1)', border: 'rgba(134,239,172,0.25)', label: 'Settled' },
  declined: { color: 'var(--risk-high)', bg: 'var(--risk-high-bg)', border: 'var(--risk-high-border)', label: 'Declined' },
  pending:  { color: 'var(--risk-med)', bg: 'var(--risk-med-bg)', border: 'var(--risk-med-border)', label: 'Pending' },
};

const renderStatus = (status: string) => {
  const cfg = STATUS_CONFIG[status.toLowerCase()] ?? STATUS_CONFIG.pending;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.border}`,
        color: cfg.color,
        fontSize: '11px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {cfg.label}
    </span>
  );
};

const renderMethod = (method: string | null) => {
  if (!method) return <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>—</span>;
  const icons: Record<string, string> = { card: '💳', upi: '📲', wallet: '👝', netbanking: '🏦' };
  return (
    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span>{icons[method] ?? '•'}</span>
      {method.toUpperCase()}
    </span>
  );
};

// ─── Sort indicator ──────────────────────────────────────────────────────────

const SortHeader: React.FC<{
  label: string;
  field: string;
  currentSort: string;
  order: string;
  onSort: (f: string) => void;
}> = ({ label, field, currentSort, order, onSort }) => (
  <button
    onClick={() => onSort(field)}
    style={{
      background: 'none',
      border: 'none',
      color: currentSort === field ? 'var(--accent)' : 'var(--text-muted)',
      fontSize: '11px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: 0,
    }}
  >
    {label}
    <ArrowUpDown
      size={11}
      style={{ opacity: currentSort === field ? 1 : 0.4, transform: currentSort === field && order === 'asc' ? 'scaleY(-1)' : 'none' }}
    />
  </button>
);

// ─── Main Component ─────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export const TransactionsListPage: React.FC = () => {
  const navigate = useNavigate();

  // Data
  const [data, setData] = useState<PaginatedTransactionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(1);
    }, 400);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getTransactionsList({
        page,
        page_size: PAGE_SIZE,
        status: statusFilter || undefined,
        payment_method: methodFilter || undefined,
        min_amount: minAmount ? parseFloat(minAmount) : undefined,
        max_amount: maxAmount ? parseFloat(maxAmount) : undefined,
        search: debouncedSearch || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, methodFilter, minAmount, maxAmount, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field: string) => {
    if (field === sortBy) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilter('');
    setMethodFilter('');
    setMinAmount('');
    setMaxAmount('');
    setPage(1);
  };

  const hasFilters = search || statusFilter || methodFilter || minAmount || maxAmount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Transaction Registry"
        description="Investigator-oriented registry of all observed payment transactions. Filter by status, payment method, or amount. Search by transaction ID or account ID."
        badge={
          data && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge variant="neutral">{data.total.toLocaleString()} TRANSACTIONS</Badge>
              {data.filtered_declined_count > 0 && (
                <Badge variant="high">{data.filtered_declined_count.toLocaleString()} DECLINED</Badge>
              )}
            </div>
          )
        }
      />

      {/* ── Filters ── */}
      <Panel padding="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Row 1: Search */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: '11px', top: '10px', color: 'var(--text-dim)', pointerEvents: 'none' }} />
              <input
                id="tx-search"
                type="text"
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search by transaction ID (tx_...), source account (acc_...), or destination account..."
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '5px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>

          {/* Row 2: Categorical filters + amount range */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <Filter size={12} />
              Filter
            </div>

            {/* Status */}
            <select
              id="tx-filter-status"
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              style={{
                padding: '6px 10px',
                backgroundColor: 'var(--bg-input)',
                border: `1px solid ${statusFilter ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '4px',
                color: statusFilter ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">All Statuses</option>
              <option value="settled">Settled</option>
              <option value="declined">Declined</option>
              <option value="pending">Pending</option>
            </select>

            {/* Payment Method */}
            <select
              id="tx-filter-method"
              value={methodFilter}
              onChange={e => { setMethodFilter(e.target.value); setPage(1); }}
              style={{
                padding: '6px 10px',
                backgroundColor: 'var(--bg-input)',
                border: `1px solid ${methodFilter ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '4px',
                color: methodFilter ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="">All Methods</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="wallet">Wallet</option>
              <option value="netbanking">Netbanking</option>
            </select>

            {/* Min Amount */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>$</span>
              <input
                id="tx-filter-min"
                type="number"
                min="0"
                placeholder="Min amt"
                value={minAmount}
                onChange={e => { setMinAmount(e.target.value); setPage(1); }}
                style={{
                  width: '90px',
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-input)',
                  border: `1px solid ${minAmount ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>–</span>
              <input
                id="tx-filter-max"
                type="number"
                min="0"
                placeholder="Max amt"
                value={maxAmount}
                onChange={e => { setMaxAmount(e.target.value); setPage(1); }}
                style={{
                  width: '90px',
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-input)',
                  border: `1px solid ${maxAmount ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Aggregate stats bar */}
          {data && (
            <div style={{ display: 'flex', gap: '20px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-dim)' }}>
                Showing <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{data.items.length}</span> of{' '}
                <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{data.total.toLocaleString()}</span> transactions
              </span>
              <span style={{ color: 'var(--text-dim)' }}>
                Declined:{' '}
                <span style={{ color: data.filtered_declined_count > 0 ? 'var(--risk-high)' : 'var(--text-muted)', fontWeight: 700 }}>
                  {data.filtered_declined_count.toLocaleString()}
                </span>
              </span>
              <span style={{ color: 'var(--text-dim)' }}>
                Total volume:{' '}
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  ${data.filtered_total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </span>
              <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>
                Page {data.page} of {data.total_pages}
              </span>
            </div>
          )}
        </div>
      </Panel>

      {/* ── Table ── */}
      {loading ? (
        <Panel padding="none">
          <LoadingState type="table" count={PAGE_SIZE} />
        </Panel>
      ) : error ? (
        <ErrorState title="Registry Unavailable" message={error} onRetry={fetchData} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No transactions match"
          message={hasFilters ? 'Adjust your filters to see more results.' : 'No transactions found in the dataset.'}
        />
      ) : (
        <Panel padding="none">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '140px' }} />
                <col style={{ width: '165px' }} />
                <col style={{ width: '110px' }} />
                <col /> {/* flow — flexible */}
                <col style={{ width: '105px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '90px' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[
                    { label: 'TX ID', field: null },
                    { label: 'Timestamp', field: 'timestamp' },
                    { label: 'Amount', field: 'amount' },
                    { label: 'Flow (src → dst)', field: null },
                    { label: 'Status', field: 'transaction_status' },
                    { label: 'Method', field: null },
                    { label: 'Action', field: null },
                  ].map(({ label, field }) => (
                    <th
                      key={label}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--text-muted)',
                        backgroundColor: 'var(--bg-subtle)',
                        borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {field ? (
                        <SortHeader label={label} field={field} currentSort={sortBy} order={sortOrder} onSort={handleSort} />
                      ) : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item: TransactionListItem, idx) => (
                  <TxRow key={item.transaction_id} item={item} idx={idx} onInspect={() => navigate(`/transactions/${item.transaction_id}`)} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── Pagination ── */}
      {data && data.total_pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronLeft}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </Button>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Page <strong style={{ color: 'var(--text-primary)' }}>{data.page}</strong> of{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{data.total_pages}</strong>
          </span>
          <Button
            variant="secondary"
            size="sm"
            icon={ChevronRight}
            iconPosition="right"
            onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
            disabled={page >= data.total_pages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

// ─── Transaction Row Component ───────────────────────────────────────────────

const TxRow: React.FC<{ item: TransactionListItem; idx: number; onInspect: () => void }> = ({
  item,
  idx,
  onInspect,
}) => {
  const [hovered, setHovered] = useState(false);
  const isDeclined = item.transaction_status.toLowerCase() === 'declined';

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? 'var(--bg-subtle)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)',
        borderBottom: '1px solid var(--border-subtle)',
        transition: 'background-color 0.1s',
        cursor: 'pointer',
        ...(isDeclined ? { borderLeft: '2px solid var(--risk-high)' } : {}),
      }}
      onClick={onInspect}
    >
      {/* TX ID */}
      <td style={{ padding: '10px 14px' }}>
        <EntityLink type="transaction" id={item.transaction_id} style={{ fontSize: '12px', fontWeight: 700 }} />
      </td>

      {/* Timestamp */}
      <td style={{ padding: '10px 14px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
          {item.timestamp.replace('T', ' ')}
        </span>
      </td>

      {/* Amount */}
      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          fontWeight: 700,
          color: isDeclined ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}>
          ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </td>

      {/* Flow */}
      <td style={{ padding: '10px 14px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.src_account_id}
          </span>
          <ArrowRight size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.dst_account_id}
          </span>
        </div>
      </td>

      {/* Status */}
      <td style={{ padding: '10px 14px' }}>
        {renderStatus(item.transaction_status)}
      </td>

      {/* Method */}
      <td style={{ padding: '10px 14px' }}>
        {renderMethod(item.payment_method)}
      </td>

      {/* Action */}
      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowRight}
          iconPosition="right"
          onClick={e => { e.stopPropagation(); onInspect(); }}
        >
          Inspect
        </Button>
      </td>
    </tr>
  );
};
