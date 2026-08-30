import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Layers,
  RotateCcw,
  Search,
  Users,
} from 'lucide-react';
import { getAccounts } from '../api';
import type { AccountRegistryItem, RiskLevel } from '../types/api';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  Pagination,
  Panel,
  RiskBadge,
  RiskScore,
} from '../components/common';
import type { Column, FilterOption } from '../components/common';

type SortOption = 'risk_score' | 'community_risk' | 'tx_count' | 'tx_volume' | 'connections' | 'declined' | 'balance' | 'account_id';

export const AccountsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state synchronization
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialTier = (searchParams.get('tier') as 'HIGH' | 'MEDIUM' | 'LOW' | 'all') || 'all';
  const initialSearch = searchParams.get('q') || '';
  const initialComm = searchParams.get('community') || '';
  const initialSort = (searchParams.get('sort') as SortOption) || 'risk_score';
  const initialOrder = (searchParams.get('order') as 'asc' | 'desc') || 'desc';

  const [accounts, setAccounts] = useState<AccountRegistryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(initialPage);
  const [tier, setTier] = useState<'HIGH' | 'MEDIUM' | 'LOW' | 'all'>(initialTier);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [communityFilter, setCommunityFilter] = useState(initialComm);
  const [sortBy, setSortBy] = useState<SortOption>(initialSort);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialOrder);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync state to URL
  const updateUrlParams = useCallback(
    (p: number, t: string, q: string, comm: string, sort: string, order: string) => {
      const params = new URLSearchParams();
      if (p > 1) params.set('page', String(p));
      if (t !== 'all') params.set('tier', t);
      if (q.trim()) params.set('q', q.trim());
      if (comm.trim()) params.set('community', comm.trim());
      if (sort !== 'risk_score') params.set('sort', sort);
      if (order !== 'desc') params.set('order', order);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);

    const commId = communityFilter.trim() ? parseInt(communityFilter.trim(), 10) : undefined;
    const validCommId = !isNaN(commId as number) ? commId : undefined;

    getAccounts({
      page,
      pageSize: 50,
      riskTier: tier,
      communityId: validCommId,
      search: searchQuery,
      sortBy,
      sortOrder,
    })
      .then((res) => {
        setAccounts(res.items);
        setTotal(res.total);
        setTotalPages(res.total_pages);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load accounts registry');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [page, tier, searchQuery, communityFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadData();
    updateUrlParams(page, tier, searchQuery, communityFilter, sortBy, sortOrder);
  }, [loadData, page, tier, searchQuery, communityFilter, sortBy, sortOrder, updateUrlParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setCommunityFilter('');
    setTier('all');
    setSortBy('risk_score');
    setSortOrder('desc');
    setPage(1);
  };

  const tierFilterOptions: FilterOption<'HIGH' | 'MEDIUM' | 'LOW' | 'all'>[] = [
    { label: 'All Accounts', value: 'all' },
    { label: 'High Risk', value: 'HIGH' },
    { label: 'Medium Risk', value: 'MEDIUM' },
    { label: 'Low Risk', value: 'LOW' },
  ];

  // Columns definition
  const columns: Column<AccountRegistryItem>[] = [
    {
      key: 'account_id',
      header: 'Account ID',
      width: '150px',
      render: (item) => (
        <button
          type="button"
          onClick={() => navigate(`/accounts/${item.account_id}`)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
          onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          {item.account_id}
        </button>
      ),
    },
    {
      key: 'account_risk_score',
      header: 'Account Risk',
      width: '140px',
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {item.account_risk_score !== null ? (
            <>
              <RiskScore score={Math.round(item.account_risk_score * 100)} size="sm" />
              <RiskBadge level={item.risk_level} size="sm" />
            </>
          ) : (
            <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
          )}
        </div>
      ),
    },
    {
      key: 'community_id',
      header: 'Cluster Assignment',
      width: '160px',
      render: (item) => {
        if (item.community_id === null || item.community_id === undefined) {
          return <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>Unassigned</span>;
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => navigate(`/communities/${item.community_id}`)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              title={`View Community #${item.community_id} Triage`}
            >
              <Layers size={12} style={{ color: 'var(--accent)' }} />
              <span>#{item.community_id}</span>
            </button>
            {item.community_risk_level && (
              <RiskBadge level={item.community_risk_level as RiskLevel} size="sm" />
            )}
          </div>
        );
      },
    },
    {
      key: 'connected_account_count',
      header: 'Connections',
      width: '120px',
      align: 'right',
      render: (item) => (
        <span
          className="font-mono"
          style={{
            fontSize: '12px',
            color: item.connected_account_count > 20 ? 'var(--risk-high)' : item.connected_account_count > 5 ? 'var(--risk-med)' : 'var(--text-secondary)',
            fontWeight: item.connected_account_count > 5 ? 700 : 500,
          }}
        >
          {item.connected_account_count} nodes
        </span>
      ),
    },
    {
      key: 'tx_count',
      header: 'Transactions',
      width: '150px',
      align: 'right',
      render: (item) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
          <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {item.tx_count.toLocaleString()} txs
          </span>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            ${item.tx_volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      ),
    },
    {
      key: 'declined_count',
      header: 'Declines',
      width: '110px',
      align: 'right',
      render: (item) => (
        <span
          className="font-mono"
          style={{
            fontSize: '12px',
            fontWeight: item.declined_count > 0 ? 700 : 400,
            color: item.declined_count > 0 ? 'var(--risk-high)' : 'var(--text-dim)',
          }}
        >
          {item.declined_count > 0 ? `${item.declined_count} (${(item.decline_rate * 100).toFixed(0)}%)` : '0'}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      width: '120px',
      align: 'right',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          ${item.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '120px',
      align: 'right',
      render: (item) => (
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowRight}
          iconPosition="right"
          onClick={() => navigate(`/accounts/${item.account_id}`)}
        >
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* 1. Header */}
      <PageHeader
        title="Accounts Registry"
        description="Search, filter, and inspect individual entity dossiers across the 50,000-account payment network benchmark."
        badge={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge variant="neutral">
              <Users size={12} style={{ marginRight: '4px' }} />
              {total.toLocaleString()} ACCOUNTS
            </Badge>
          </div>
        }
      />

      {/* 2. Search, Filter, and Sorting Controls */}
      <Panel padding="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Top Bar: Search & Community ID Filter */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Account Search Input */}
            <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 320px', display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: '11px', top: '10px', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Account ID (e.g. acc_100) or name..."
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: '5px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>
              <Button type="submit" variant="primary" size="md">
                Search
              </Button>
            </form>

            {/* Community ID Filter Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                Community:
              </span>
              <input
                type="number"
                min="0"
                max="58"
                value={communityFilter}
                onChange={(e) => {
                  setCommunityFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="ID (0–58)"
                style={{
                  width: '90px',
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '5px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
            </div>

            {/* Sort Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                Sort:
              </span>
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [s, o] = e.target.value.split(':');
                  setSortBy(s as SortOption);
                  setSortOrder(o as 'asc' | 'desc');
                  setPage(1);
                }}
                style={{
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '5px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="risk_score:desc">Risk Score (High → Low)</option>
                <option value="risk_score:asc">Risk Score (Low → High)</option>
                <option value="community_risk:desc">Cluster Risk (High → Low)</option>
                <option value="tx_count:desc">Tx Count (High → Low)</option>
                <option value="tx_volume:desc">Tx Volume (High → Low)</option>
                <option value="connections:desc">Connections (High → Low)</option>
                <option value="declined:desc">Declines (High → Low)</option>
                <option value="balance:desc">Balance (High → Low)</option>
                <option value="account_id:asc">Account ID (Asc)</option>
              </select>
            </div>

            {/* Reset Button */}
            {(searchQuery || communityFilter || tier !== 'all' || sortBy !== 'risk_score') && (
              <Button
                variant="secondary"
                size="sm"
                icon={RotateCcw}
                onClick={handleResetFilters}
                title="Reset all filters"
              >
                Reset
              </Button>
            )}
          </div>

          {/* Bottom Bar: Risk Tier Filter & Result Counter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <FilterBar
              options={tierFilterOptions}
              selected={tier}
              onChange={(t) => {
                setTier(t);
                setPage(1);
              }}
              size="sm"
            />

            <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Showing {accounts.length} of {total.toLocaleString()} matched entities (Page {page} of {totalPages})
            </span>
          </div>
        </div>
      </Panel>

      {/* 3. Table Results Panel */}
      <Panel padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            <LoadingState type="table" count={10} />
          </div>
        ) : error ? (
          <ErrorState
            title="Registry Query Failed"
            message={error}
            onRetry={loadData}
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            title="No accounts match criteria"
            message="No account records found matching the active filters or search parameters."
            actionLabel="Reset Filters"
            onAction={handleResetFilters}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={accounts}
              keyExtractor={(item) => item.account_id}
            />
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={50}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
};

