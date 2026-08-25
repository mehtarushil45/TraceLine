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
import { AddToInvestigationButton } from '../components/common/AddToInvestigationButton';
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
      {/* 1. Breadcrumb & Action Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
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

        <AddToInvestigationButton
          targetType="ACCOUNT"
          targetId={account.account_id}
          targetLabel={`Account ${account.account_id} (${account.customer_name || 'Customer'})`}
        />
      </div>

      {/* 2. Customer Profile Hero HUD */}
      <div
        className="dash-card"
        style={{
          padding: '24px 28px',
          backgroundColor: '#070d1e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: 'var(--accent-cyan)',
              boxShadow: '0 0 16px rgba(0, 240, 255, 0.2)',
            }}
          >
            <User size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 className="font-mono" style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                {account.account_id}
              </h1>
              {account.community_id !== null && (
                <button
                  onClick={() => navigate(`/communities/${account.community_id}`)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: 'var(--accent-cyan)',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Layers size={13} />
                  <span>Community #{account.community_id}</span>
                </button>
              )}
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
              {account.customer_name || 'Individual Customer Account'} · Created on{' '}
              {account.creation_date ? new Date(account.creation_date).toLocaleDateString() : '—'}
            </span>
          </div>
        </div>

        {/* Balance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              backgroundColor: '#030712',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Available Balance
            </span>
            <span className="font-mono" style={{ fontSize: '20px', fontWeight: 800, color: '#34d399' }}>
              ${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Transaction Flow Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {/* Total Volume */}
        <div className="dash-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
            Total Transaction Flow
          </span>
          <span className="font-mono font-bold text-xl text-slate-100">
            ${(txStats.total_amount_sent + txStats.total_amount_received).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {txStats.total_count.toLocaleString()} total operations
          </span>
        </div>

        {/* Outgoing Sent */}
        <div className="dash-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowUpRight size={14} style={{ color: '#f87171' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#f87171' }}>
              Sent / Debited
            </span>
          </div>
          <span className="font-mono font-bold text-xl text-slate-100">
            ${txStats.total_amount_sent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {txStats.sent_count.toLocaleString()} transfers
          </span>
        </div>

        {/* Incoming Received */}
        <div className="dash-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowDownLeft size={14} style={{ color: '#34d399' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#34d399' }}>
              Received / Credited
            </span>
          </div>
          <span className="font-mono font-bold text-xl text-slate-100">
            ${txStats.total_amount_received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {txStats.received_count.toLocaleString()} deposits
          </span>
        </div>

        {/* Declined */}
        <div className="dash-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <XCircle size={14} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24' }}>
              Declined Transactions
            </span>
          </div>
          <span className="font-mono font-bold text-xl text-amber-400">
            {txStats.declined_count.toLocaleString()}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {((txStats.declined_count / Math.max(1, txStats.total_count)) * 100).toFixed(1)}% decline rate
          </span>
        </div>
      </div>

      {/* 4. Investigation Tabs Header */}
      <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: '16px' }}>
        <button
          onClick={() => setActiveTab('transactions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'transactions' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'transactions' ? '#f8fafc' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Activity size={16} style={{ color: activeTab === 'transactions' ? 'var(--accent-cyan)' : 'inherit' }} />
          Transaction Audit Log ({txStats.total_count.toLocaleString()})
        </button>

        <button
          onClick={() => setActiveTab('connections')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 18px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'connections' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeTab === 'connections' ? '#f8fafc' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Network size={16} style={{ color: activeTab === 'connections' ? 'var(--accent-cyan)' : 'inherit' }} />
          Observable Graph Connections
        </button>
      </div>

      {/* Tab A: Transactions */}
      {activeTab === 'transactions' && (
        <div className="dash-card">
          {/* Direction Filter Bar */}
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#070d1e',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {(['all', 'sent', 'received'] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => {
                    setTxDirection(dir);
                    setTxPage(1);
                  }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: txDirection === dir ? 'var(--accent-cyan)' : 'transparent',
                    backgroundColor: txDirection === dir ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                    color: txDirection === dir ? '#00F0FF' : 'var(--text-muted)',
                  }}
                >
                  {dir}
                </button>
              ))}
            </div>

            <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              Showing {transactions.length} of {txTotal} entries
            </span>
          </div>

          {loadingTx ? (
            <LoadingSkeleton type="table" count={6} />
          ) : (
            <>
              <TransactionTable transactions={transactions} />
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

      {/* Tab B: Observable Graph Connections */}
      {activeTab === 'connections' && (
        <div className="dash-card">
          {loadingConns || !connections ? (
            <LoadingSkeleton type="table" count={6} />
          ) : (
            <ConnectionsTable connections={connections.connections} />
          )}
        </div>
      )}
    </div>
  );
};
