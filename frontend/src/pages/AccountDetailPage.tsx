import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Layers,
  Network,
  User,
  XCircle,
} from 'lucide-react';
import {
  getAccount,
  getAccountConnections,
  getAccountTransactions,
} from '../api';
import type {
  AccountConnectionsResponse,
  AccountDetailResponse,
  TransactionItem,
} from '../types/api';
import { RiskBadge } from '../components/common/RiskBadge';
import { TransactionTable } from '../components/transaction/TransactionTable';
import { ConnectionsTable } from '../components/account/ConnectionsTable';
import { Pagination } from '../components/common/Pagination';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';

export const AccountDetailPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<AccountDetailResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'connections'>('transactions');

  // Transactions Tab State
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txDirection, setTxDirection] = useState<'all' | 'sent' | 'received'>('all');
  const [loadingTx, setLoadingTx] = useState(false);

  // Connections Tab State
  const [connections, setConnections] = useState<AccountConnectionsResponse | null>(null);
  const [loadingConns, setLoadingConns] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load Account Profile
  useEffect(() => {
    if (!accountId) return;

    const fetchAccount = async () => {
      setLoading(true);
      setError(null);
      try {
        const acc = await getAccount(accountId);
        setAccount(acc);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Account '${accountId}' not found`);
      } finally {
        setLoading(false);
      }
    };

    fetchAccount();
  }, [accountId]);

  // Load Transactions Tab
  useEffect(() => {
    if (!accountId || activeTab !== 'transactions') return;

    const fetchTx = async () => {
      setLoadingTx(true);
      try {
        const res = await getAccountTransactions(accountId, txPage, 50, txDirection);
        setTransactions(res.items);
        setTxTotal(res.total);
        setTxTotalPages(res.total_pages);
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setLoadingTx(false);
      }
    };

    fetchTx();
  }, [accountId, activeTab, txPage, txDirection]);

  // Load Connections Tab
  useEffect(() => {
    if (!accountId || activeTab !== 'connections' || connections) return;

    const fetchConns = async () => {
      setLoadingConns(true);
      try {
        const res = await getAccountConnections(accountId);
        setConnections(res);
      } catch (err) {
        console.error('Failed to load connections:', err);
      } finally {
        setLoadingConns(false);
      }
    };

    fetchConns();
  }, [accountId, activeTab, connections]);

  if (loading) {
    return <LoadingSkeleton type="detail" />;
  }

  if (error || !account) {
    return <ErrorState message={error || undefined} onRetry={() => navigate('/accounts')} />;
  }

  const txStats = account.transaction_statistics;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
        <button
          onClick={() => navigate('/accounts')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <ArrowLeft size={14} />
          Accounts
        </button>
        <span>/</span>
        <span className="font-mono text-slate-200">{account.account_id}</span>
      </div>

      {/* Account Profile Header Card */}
      <div
        className="dash-card"
        style={{
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: 'var(--accent-cyan)',
            }}
          >
            <User size={28} />
          </div>
          <div>
            <h1 className="font-mono" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-main)' }}>
              {account.account_id}
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {account.customer_name} · Created {account.creation_date || '—'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', fontSize: '13px' }}>
              <span>
                Balance: <strong className="font-mono text-slate-100">${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
              {account.account_risk_score !== null && (
                <span>
                  Baseline Risk: <strong className="font-mono text-amber-400">{(account.account_risk_score * 100).toFixed(1)}/100</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Community Assignment Badge Card */}
        {account.community_id !== null && (
          <div
            onClick={() => navigate(`/communities/${account.community_id}`)}
            style={{
              padding: '12px 18px',
              borderRadius: '6px',
              backgroundColor: '#080c14',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              transition: 'border-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ padding: '8px', borderRadius: '4px', backgroundColor: '#1e293b', color: 'var(--accent-cyan)' }}>
              <Layers size={18} />
            </div>
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                Assigned Community
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <span className="font-mono font-bold text-slate-100">Community #{account.community_id}</span>
                {account.community_risk_level && <RiskBadge level={account.community_risk_level} size="sm" />}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Activity Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <div className="dash-card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Outgoing (Sent)</span>
            <ArrowUpRight size={15} style={{ color: '#f87171' }} />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
            {txStats.sent_count} txs
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            ${txStats.total_amount_sent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="dash-card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Incoming (Received)</span>
            <ArrowDownLeft size={15} style={{ color: '#34d399' }} />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
            {txStats.received_count} txs
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            ${txStats.total_amount_received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="dash-card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Declined Txs</span>
            <XCircle size={15} style={{ color: '#ef4444' }} />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '6px', color: txStats.declined_count > 0 ? '#ef4444' : 'inherit' }}>
            {txStats.declined_count}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            {txStats.total_count > 0 ? `${((txStats.declined_count / txStats.total_count) * 100).toFixed(1)}% of total` : '0%'}
          </span>
        </div>

        <div className="dash-card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Graph Connections</span>
            <Network size={15} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: '6px' }}>
            {account.connected_account_count}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            Connected peer accounts
          </span>
        </div>
      </div>

      {/* Account Tabs */}
      <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px' }}>
        <button
          onClick={() => setActiveTab('transactions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'transactions' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'transactions' ? 'var(--text-main)' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Activity size={16} />
          Transaction History ({txStats.total_count})
        </button>

        <button
          onClick={() => setActiveTab('connections')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'connections' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'connections' ? 'var(--text-main)' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Network size={16} />
          Evidence Connections ({account.connected_account_count})
        </button>
      </div>

      {/* Tab 1: Transactions Table */}
      {activeTab === 'transactions' && (
        <div className="dash-card">
          {/* Direction Filter Bar */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', backgroundColor: '#0b1120' }}>
            {(['all', 'sent', 'received'] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => {
                  setTxDirection(dir);
                  setTxPage(1);
                }}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: txDirection === dir ? 'var(--border-light)' : 'transparent',
                  backgroundColor: txDirection === dir ? '#1e293b' : 'transparent',
                  color: txDirection === dir ? 'var(--text-main)' : 'var(--text-muted)',
                }}
              >
                {dir} Transactions
              </button>
            ))}
          </div>

          {loadingTx ? (
            <LoadingSkeleton type="table" count={5} />
          ) : (
            <>
              <TransactionTable transactions={transactions} highlightAccountId={account.account_id} />
              <Pagination
                currentPage={txPage}
                totalPages={txTotalPages}
                totalItems={txTotal}
                pageSize={50}
                onPageChange={(p) => setTxPage(p)}
              />
            </>
          )}
        </div>
      )}

      {/* Tab 2: Connections Table */}
      {activeTab === 'connections' && (
        <div className="dash-card">
          {loadingConns ? (
            <LoadingSkeleton type="table" count={5} />
          ) : (
            <ConnectionsTable connections={connections?.connections || []} />
          )}
        </div>
      )}
    </div>
  );
};
