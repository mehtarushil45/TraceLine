import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Layers,
  Network,
  Smartphone,
  User,
  XCircle,
} from 'lucide-react';
import {
  getAccount,
  getAccountConnections,
  getAccountEvidence,
  getAccountTransactions,
} from '../api';
import type {
  AccountConnectionsResponse,
  AccountDetailResponse,
  AccountEvidenceResponse,
  ConnectionItem,
  EvidenceItem,
  TransactionItem,
} from '../types/api';
import {
  AddToInvestigationButton,
  Badge,
  Button,
  DataTable,
  EmptyState,
  EntityLink,
  ErrorState,
  FilterBar,
  LoadingState,
  Metric,
  PageHeader,
  Pagination,
  Panel,
  RiskBadge,
  RiskScore,
} from '../components/common';
import type { Column, FilterOption } from '../components/common';
import { SarExportModal } from '../components/layout/SarExportModal';

export const AccountDetailPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const navState = location.state as { fromForensics?: boolean; communityId?: string } | null;
  const fromForensics = Boolean(navState?.fromForensics);
  const forensicCommunityId = navState?.communityId;

  const [account, setAccount] = useState<AccountDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<AccountEvidenceResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'connections'>('transactions');
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

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

  // Load Account Profile and Deterministic Evidence
  useEffect(() => {
    if (!accountId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      getAccount(accountId),
      getAccountEvidence(accountId).catch(() => null),
    ])
      .then(([accRes, evRes]) => {
        setAccount(accRes);
        setEvidence(evRes);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : `Account '${accountId}' not found`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountId]);

  // Load Transactions Tab
  useEffect(() => {
    if (!accountId || activeTab !== 'transactions') return;

    setLoadingTx(true);
    getAccountTransactions(accountId, txPage, 50, txDirection)
      .then((res) => {
        setTransactions(res.items);
        setTxTotal(res.total);
        setTxTotalPages(res.total_pages);
      })
      .catch((err) => console.error('Failed to load transactions:', err))
      .finally(() => setLoadingTx(false));
  }, [accountId, activeTab, txPage, txDirection]);

  // Load Connections Tab
  useEffect(() => {
    if (!accountId || activeTab !== 'connections' || connections) return;

    setLoadingConns(true);
    getAccountConnections(accountId)
      .then(setConnections)
      .catch((err) => console.error('Failed to load connections:', err))
      .finally(() => setLoadingConns(false));
  }, [accountId, activeTab, connections]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <LoadingState type="card" count={1} />
        <LoadingState type="table" count={6} />
      </div>
    );
  }

  if (error || !account) {
    return (
      <ErrorState
        title="Account Profile Unavailable"
        message={error || 'The requested account record could not be loaded.'}
        onRetry={() => navigate('/accounts')}
      />
    );
  }

  const txStats = account.transaction_statistics;
  const hasCommunity = account.community_id !== null && account.community_id !== undefined;

  const txFilterOptions: FilterOption<'all' | 'sent' | 'received'>[] = [
    { label: 'All Operations', value: 'all', count: txStats.total_count },
    { label: 'Sent (Debited)', value: 'sent', count: txStats.sent_count },
    { label: 'Received (Credited)', value: 'received', count: txStats.received_count },
  ];

  // Helper for Transaction Status
  const renderTxStatus = (status: string) => {
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
            backgroundColor: 'var(--risk-low-bg)',
            border: '1px solid var(--risk-low-border)',
            color: '#86efac',
            fontSize: '11px',
            fontWeight: 600,
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
            backgroundColor: 'var(--risk-high-bg)',
            border: '1px solid var(--risk-high-border)',
            color: 'var(--risk-high)',
            fontSize: '11px',
            fontWeight: 700,
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
          backgroundColor: 'var(--risk-med-bg)',
          border: '1px solid var(--risk-med-border)',
          color: 'var(--risk-med)',
          fontSize: '11px',
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <Clock size={11} />
        {status}
      </span>
    );
  };

  // Observable Evidence Table Columns
  const evidenceColumns: Column<EvidenceItem>[] = [
    {
      key: 'severity',
      header: 'Severity',
      width: '100px',
      render: (item) => <RiskBadge level={item.severity} size="sm" />,
    },
    {
      key: 'title',
      header: 'Observable Rule / Indicator',
      render: (item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {item.title}
          </span>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
            {item.description}
          </p>
        </div>
      ),
    },
    {
      key: 'score_contribution',
      header: 'Rule Weight',
      width: '110px',
      align: 'right',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>
          +{item.score_contribution.toFixed(1)} pts
        </span>
      ),
    },
    {
      key: 'supporting_entities',
      header: 'Affected Entities',
      width: '160px',
      render: (item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {item.supporting_entities.length} entit{item.supporting_entities.length === 1 ? 'y' : 'ies'}
          </span>
          {item.supporting_entities.length > 0 && (
            <span className="font-mono truncate" style={{ fontSize: '10px', color: 'var(--text-dim)', maxWidth: '140px' }}>
              {item.supporting_entities.slice(0, 2).join(', ')}
              {item.supporting_entities.length > 2 ? '...' : ''}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '150px',
      align: 'right',
      render: () => {
        if (!hasCommunity) return null;
        return (
          <Button
            variant="secondary"
            size="sm"
            icon={Network}
            onClick={() =>
              navigate(`/forensics?community=${account.community_id}&view=network&focus=${account.account_id}`)
            }
            title="Explore affected nodes in community graph topology"
          >
            Explore in Graph
          </Button>
        );
      },
    },
  ];

  // Transaction Activity Table Columns
  const transactionColumns: Column<TransactionItem>[] = [
    {
      key: 'transaction_id',
      header: 'Transaction ID',
      width: '150px',
      render: (tx) => <EntityLink type="transaction" id={tx.transaction_id} />,
    },
    {
      key: 'timestamp',
      header: 'Timestamp',
      width: '150px',
      render: (tx) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {tx.timestamp}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '130px',
      align: 'right',
      render: (tx) => {
        const isOutgoing = tx.src_account_id === account.account_id;
        return (
          <span
            className="font-mono"
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: isOutgoing ? 'var(--text-primary)' : 'var(--risk-low)',
            }}
          >
            {isOutgoing ? '-' : '+'}${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        );
      },
    },
    {
      key: 'flow',
      header: 'Transfer Flow',
      render: (tx) => {
        const isSrc = tx.src_account_id === account.account_id;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <span
              className="font-mono"
              style={{
                color: isSrc ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: isSrc ? 700 : 500,
              }}
            >
              {tx.src_account_id}
            </span>
            <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
            <span
              className="font-mono"
              style={{
                color: !isSrc ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: !isSrc ? 700 : 500,
              }}
            >
              {tx.dst_account_id}
            </span>
          </div>
        );
      },
    },
    {
      key: 'transaction_status',
      header: 'Status',
      width: '110px',
      render: (tx) => renderTxStatus(tx.transaction_status),
    },
    {
      key: 'merchant_id',
      header: 'Merchant / Channel',
      width: '160px',
      render: (tx) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {tx.merchant_id || 'P2P Transfer'}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
            {tx.payment_method || 'Standard Wire'}
          </span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '110px',
      align: 'right',
      render: (tx) => (
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowRight}
          iconPosition="right"
          onClick={() => navigate(`/transactions/${tx.transaction_id}`)}
        >
          Inspect
        </Button>
      ),
    },
  ];

  // Connections Table Columns
  const connectionColumns: Column<ConnectionItem>[] = [
    {
      key: 'connected_account_id',
      header: 'Connected Account',
      width: '170px',
      render: (conn) => <EntityLink type="account" id={conn.connected_account_id} />,
    },
    {
      key: 'edge_weight',
      header: 'Evidence Weight',
      width: '130px',
      align: 'right',
      render: (conn) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 800, color: 'var(--risk-med)' }}>
          {conn.edge_weight.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'shared_devices',
      header: 'Shared Devices',
      render: (conn) => (
        conn.shared_devices.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--risk-high)' }}>
            <Smartphone size={13} style={{ flexShrink: 0 }} />
            <span className="font-mono" style={{ fontSize: '11px' }}>
              {conn.shared_devices.join(', ')}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        )
      ),
    },
    {
      key: 'shared_payment_instruments',
      header: 'Shared Instruments',
      render: (conn) => (
        conn.shared_payment_instruments.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--risk-med)' }}>
            <CreditCard size={13} style={{ flexShrink: 0 }} />
            <span className="font-mono" style={{ fontSize: '11px' }}>
              {conn.shared_payment_instruments.join(', ')}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        )
      ),
    },
    {
      key: 'shared_ips',
      header: 'Shared IPs',
      render: (conn) => (
        conn.shared_ips.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent)' }}>
            <Network size={13} style={{ flexShrink: 0 }} />
            <span className="font-mono" style={{ fontSize: '11px' }}>
              {conn.shared_ips.join(', ')}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        )
      ),
    },
    {
      key: 'temporal_overlap',
      header: 'Co-occurrence',
      width: '120px',
      render: (conn) => (
        conn.temporal_overlap > 0 ? (
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {conn.temporal_overlap} days
          </span>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        )
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '140px',
      align: 'right',
      render: (conn) => (
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowRight}
          iconPosition="right"
          onClick={() => navigate(`/accounts/${conn.connected_account_id}`)}
        >
          Inspect Profile
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* ------------------------------------------------------------------ */}
      {/* 1. PAGE HEADER                                                     */}
      {/* ------------------------------------------------------------------ */}
      <PageHeader
        title="Account Investigation"
        description="Investigate observable entity connections, payment velocity, and deterministic network evidence."
        breadcrumbs={
          <button
            onClick={() => {
              if (fromForensics && (forensicCommunityId || account.community_id)) {
                const targetComm = forensicCommunityId || String(account.community_id);
                navigate(`/forensics?community=${targetComm}&view=accounts`);
              } else if (hasCommunity) {
                navigate(`/communities/${account.community_id}`);
              } else {
                navigate('/accounts');
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '12px',
              cursor: 'pointer',
              padding: 0,
              marginBottom: '6px',
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft size={13} />
            <span>
              {fromForensics && (forensicCommunityId || account.community_id)
                ? `Back to Community #${forensicCommunityId || account.community_id} Forensic Workspace`
                : hasCommunity
                ? `Back to Community #${account.community_id}`
                : 'Back to Accounts'}
            </span>
          </button>
        }
        badge={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant="neutral">ACCOUNT {account.account_id}</Badge>
            {hasCommunity && (
              <Badge variant="accent">COMMUNITY #{account.community_id}</Badge>
            )}
            {account.community_risk_level && (
              <RiskBadge level={account.community_risk_level} size="md" />
            )}
          </div>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AddToInvestigationButton
              targetType="ACCOUNT"
              targetId={account.account_id}
              targetLabel={`Account ${account.account_id} (${account.customer_name || 'Customer'})`}
              riskScore={account.account_risk_score ? Math.round(account.account_risk_score * 100) : null}
              riskLevel={account.community_risk_level}
              size="md"
            />
            <Button
              variant="secondary"
              size="md"
              icon={FileText}
              onClick={() => setIsSarModalOpen(true)}
            >
              Generate SAR
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* 2. ACCOUNT CONTEXT METRICS                                        */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="md">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <Metric
            label="Available Balance"
            value={`$${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtext="Current ledger balance"
          />
          <Metric
            label="Account Baseline Risk"
            value={
              account.account_risk_score !== null ? (
                <RiskScore score={Math.round(account.account_risk_score * 100)} size="md" />
              ) : (
                '—'
              )
            }
            subtext="Individual model score"
          />
          <Metric
            label="Cluster Prioritization"
            value={account.community_risk_score !== null ? `${account.community_risk_score}/100` : '—'}
            subtext={account.community_risk_level ? `${account.community_risk_level} Risk Tier` : 'Unassigned partition'}
            variant={account.community_risk_level === 'HIGH' ? 'high' : account.community_risk_level === 'MEDIUM' ? 'med' : 'default'}
          />
          <Metric
            label="Connected Accounts"
            value={`${account.connected_account_count} Entities`}
            subtext="Observable graph neighbors"
          />
          <Metric
            label="Transaction Activity"
            value={`${txStats.total_count.toLocaleString()} Txs`}
            subtext={`$${(txStats.total_amount_sent + txStats.total_amount_received).toLocaleString(undefined, { maximumFractionDigits: 0 })} total flow`}
          />
          <Metric
            label="Declined Operations"
            value={`${txStats.declined_count.toLocaleString()}`}
            subtext={`${((txStats.declined_count / Math.max(1, txStats.total_count)) * 100).toFixed(1)}% decline rate`}
            variant={txStats.declined_count > 0 ? 'med' : 'default'}
          />
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 3. "WHY THIS ACCOUNT MATTERS" SECTION                             */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title="Why this account matters"
        subtitle="Corroboration between individual entity profile, community partition context, and observable evidence."
        padding="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {/* Account Profile Context */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
              Entity Profile & Cluster Context
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '5px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
                <User size={16} />
              </div>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {account.customer_name || 'Individual Account'}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  ID: {account.account_id} · Created {account.creation_date || '—'}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '4px 0 0 0' }}>
              {hasCommunity ? (
                <>
                  Part of partition cluster <strong>Community #{account.community_id}</strong>, which is prioritized at <strong>{account.community_risk_score}/100 ({account.community_risk_level})</strong>.
                </>
              ) : (
                <>This account operates independently without an assigned community partition.</>
              )}
            </p>

            {hasCommunity && (
              <div style={{ marginTop: '4px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Layers}
                  onClick={() => navigate(`/communities/${account.community_id}`)}
                >
                  Open Community #{account.community_id} Investigation
                </Button>
              </div>
            )}
          </div>

          {/* Observable Evidence Engine Analysis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderLeft: '1px solid var(--border)', paddingLeft: '24px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
              Deterministic Evidence Rules
            </span>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5, margin: 0 }}>
              Evidence engine detected <strong style={{ color: 'var(--accent)' }}>{evidence?.evidence_count ?? 0} active rule triggers</strong> ({evidence?.high_count ?? 0} High, {evidence?.medium_count ?? 0} Medium) affecting this specific entity and its {account.connected_account_count} graph neighbors.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
              <div style={{ padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Evidence Score</span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {evidence?.evidence_score ?? 0}/100
                </span>
              </div>
              <div style={{ padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Graph Neighbors</span>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {account.connected_account_count}
                </span>
              </div>
            </div>

            {hasCommunity && (
              <div style={{ marginTop: '4px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Network}
                  onClick={() => navigate(`/forensics?community=${account.community_id}&view=network&focus=${account.account_id}`)}
                >
                  Explore Cluster Topology in Graph
                </Button>
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 4. OBSERVABLE EVIDENCE DETAIL TABLE                                */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title={`Account Observable Evidence (${evidence?.items.length ?? 0})`}
        subtitle="Deterministic rule evaluations linking this account via shared devices, instruments, or temporal concentration."
        padding="none"
      >
        {!evidence || evidence.items.length === 0 ? (
          <EmptyState
            title="No observable evidence triggers"
            message="No deterministic evidence rules triggered specifically for this account."
          />
        ) : (
          <DataTable
            columns={evidenceColumns}
            data={evidence.items}
            keyExtractor={(item) => item.evidence_id}
          />
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 5. INVESTIGATION WORKSPACE TABS                                   */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ scrollMarginTop: '20px' }}>
        {/* Tab Controls Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '2px',
            marginBottom: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('transactions')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 16px',
              borderRadius: '5px 5px 0 0',
              border: 'none',
              borderBottom: activeTab === 'transactions' ? '2px solid var(--accent)' : '2px solid transparent',
              backgroundColor: activeTab === 'transactions' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'transactions' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: activeTab === 'transactions' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            <Activity size={14} style={{ color: activeTab === 'transactions' ? 'var(--accent)' : 'inherit' }} />
            <span>Transaction Activity ({txStats.total_count.toLocaleString()})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('connections')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 16px',
              borderRadius: '5px 5px 0 0',
              border: 'none',
              borderBottom: activeTab === 'connections' ? '2px solid var(--accent)' : '2px solid transparent',
              backgroundColor: activeTab === 'connections' ? 'var(--bg-subtle)' : 'transparent',
              color: activeTab === 'connections' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: activeTab === 'connections' ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
          >
            <Network size={14} style={{ color: activeTab === 'connections' ? 'var(--accent)' : 'inherit' }} />
            <span>Observable Graph Connections ({account.connected_account_count})</span>
          </button>
        </div>

        {/* Tab A: Transactions Activity Log */}
        {activeTab === 'transactions' && (
          <Panel padding="none">
            {/* Filter Bar Header */}
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                backgroundColor: 'var(--bg-sidebar)',
              }}
            >
              <FilterBar
                options={txFilterOptions}
                selected={txDirection}
                onChange={(dir) => {
                  setTxDirection(dir);
                  setTxPage(1);
                }}
                size="sm"
              />
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                Showing {transactions.length} of {txTotal} entries
              </span>
            </div>

            {loadingTx ? (
              <div style={{ padding: '24px' }}>
                <LoadingState type="table" count={6} />
              </div>
            ) : (
              <>
                <DataTable
                  columns={transactionColumns}
                  data={transactions}
                  keyExtractor={(tx) => tx.transaction_id}
                  emptyMessage="No transaction operations found matching criteria."
                />
                <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                  <Pagination
                    currentPage={txPage}
                    totalPages={txTotalPages}
                    totalItems={txTotal}
                    pageSize={50}
                    onPageChange={(p) => setTxPage(p)}
                  />
                </div>
              </>
            )}
          </Panel>
        )}

        {/* Tab B: Observable Graph Connections */}
        {activeTab === 'connections' && (
          <Panel padding="none">
            {loadingConns || !connections ? (
              <div style={{ padding: '24px' }}>
                <LoadingState type="table" count={6} />
              </div>
            ) : (
              <DataTable
                columns={connectionColumns}
                data={connections.connections}
                keyExtractor={(conn) => conn.connected_account_id}
                emptyMessage="No direct observable graph connections recorded for this account."
              />
            )}
          </Panel>
        )}
      </div>

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
