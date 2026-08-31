import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  CreditCard,
  ExternalLink,
  History,
  Network,
  Shield,
  Smartphone,
  XCircle,
} from 'lucide-react';
import {
  getAccount,
  getAccountConnections,
  getAccountEvidence,
  getAccountPeerStats,
  getAccountTransactions,
} from '../api';
import type {
  AccountConnectionsResponse,
  AccountDetailResponse,
  AccountEvidenceResponse,
  AccountPeerStatsResponse,
  ConnectionItem,
  TransactionItem,
} from '../types/api';
import {
  AddToInvestigationButton,
  Badge,
  Button,
  DataTable,
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


export const AccountDetailPage: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const navState = location.state as { fromForensics?: boolean; communityId?: string } | null;
  const fromForensics = Boolean(navState?.fromForensics);
  const forensicCommunityId = navState?.communityId;

  const [account, setAccount] = useState<AccountDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<AccountEvidenceResponse | null>(null);
  const [peerStats, setPeerStats] = useState<AccountPeerStatsResponse | null>(null);
  const [connections, setConnections] = useState<AccountConnectionsResponse | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionItem[]>([]);


  // Deep Dive Tabs State
  const [activeTab, setActiveTab] = useState<'transactions' | 'connections'>('transactions');
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txDirection, setTxDirection] = useState<'all' | 'sent' | 'received'>('all');
  const [loadingTx, setLoadingTx] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Initial Load of Dossier Core Data
  useEffect(() => {
    if (!accountId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      getAccount(accountId),
      getAccountEvidence(accountId).catch(() => null),
      getAccountPeerStats(accountId).catch(() => null),
      getAccountConnections(accountId).catch(() => null),
      getAccountTransactions(accountId, 1, 100, 'all').catch(() => null),
    ])
      .then(([accRes, evRes, peerRes, connRes, txRes]) => {
        setAccount(accRes);
        setEvidence(evRes);
        setPeerStats(peerRes);
        setConnections(connRes);
        if (txRes) {
          setRecentTransactions(txRes.items);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : `Account '${accountId}' not found`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [accountId]);

  // 2. Load Paginated Transactions in Tab
  useEffect(() => {
    if (!accountId || activeTab !== 'transactions') return;

    let isMounted = true;
    setLoadingTx(true);
    getAccountTransactions(accountId, txPage, 50, txDirection)
      .then((res) => {
        if (isMounted) {
          setTransactions(res.items);
          setTxTotal(res.total);
          setTxTotalPages(res.total_pages);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Failed to load transactions:', err);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingTx(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [accountId, activeTab, txPage, txDirection]);

  // Derived: Behavioral Profile Metrics
  const behavioralProfile = useMemo(() => {
    if (!account) return null;
    const stats = account.transaction_statistics;
    const totalCount = stats.total_count;
    const totalVolume = stats.total_amount_sent + stats.total_amount_received;
    const avgAmount = totalCount > 0 ? totalVolume / totalCount : 0;
    const declineRate = totalCount > 0 ? stats.declined_count / totalCount : 0;

    // Calculate time span and tx velocity (txs/day)
    let activeDays = 1;
    if (account.first_observed_activity && account.last_observed_activity) {
      const start = new Date(account.first_observed_activity).getTime();
      const end = new Date(account.last_observed_activity).getTime();
      const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      activeDays = diffDays;
    }
    const velocityPerDay = totalCount / activeDays;

    // Payment methods count
    const paymentMethods: Record<string, number> = {};
    recentTransactions.forEach((tx) => {
      const pm = tx.payment_method || 'wire';
      paymentMethods[pm] = (paymentMethods[pm] || 0) + 1;
    });

    return {
      totalCount,
      totalVolume,
      avgAmount,
      declineRate,
      activeDays,
      velocityPerDay,
      paymentMethods,
    };
  }, [account, recentTransactions]);

  // Derived: Relationship Exposure Breakdown
  const relationshipExposure = useMemo(() => {
    if (!connections) {
      return {
        totalConnections: 0,
        sharedDevicesCount: 0,
        sharedInstrumentsCount: 0,
        sharedIpsCount: 0,
        topConnections: [],
      };
    }
    const conns = connections.connections;
    const uniqueDevices = new Set<string>();
    const uniqueInstruments = new Set<string>();
    const uniqueIps = new Set<string>();

    conns.forEach((c) => {
      c.shared_devices.forEach((d) => uniqueDevices.add(d));
      c.shared_payment_instruments.forEach((i) => uniqueInstruments.add(i));
      c.shared_ips.forEach((ip) => uniqueIps.add(ip));
    });

    const sortedConns = [...conns].sort((a, b) => b.edge_weight - a.edge_weight);

    return {
      totalConnections: conns.length,
      sharedDevicesCount: uniqueDevices.size,
      sharedInstrumentsCount: uniqueInstruments.size,
      sharedIpsCount: uniqueIps.size,
      topConnections: sortedConns.slice(0, 5),
    };
  }, [connections]);

  // Derived: Timeline Events (Constructed strictly from real transactions)
  const timelineEvents = useMemo(() => {
    if (!recentTransactions.length || !behavioralProfile) return [];

    const events: Array<{
      id: string;
      timestamp: string;
      type: 'first_tx' | 'last_tx' | 'declined' | 'large_amount' | 'regular';
      title: string;
      description: string;
      amount: number;
      isOutgoing: boolean;
      status: string;
      txId: string;
    }> = [];

    // Sort ascending by timestamp
    const sorted = [...recentTransactions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const thresholdAmount = Math.max(1000, behavioralProfile.avgAmount * 2.5);

    sorted.forEach((tx, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === sorted.length - 1 && sorted.length > 1;
      const isDeclined = tx.transaction_status.toLowerCase() === 'declined';
      const isLarge = tx.amount >= thresholdAmount;
      const isOutgoing = tx.src_account_id === accountId;

      if (isFirst) {
        events.push({
          id: `first-${tx.transaction_id}`,
          timestamp: tx.timestamp,
          type: 'first_tx',
          title: 'First Observed Transaction Activity',
          description: `Initial observed ${isOutgoing ? 'outgoing debit' : 'incoming credit'} of $${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
          amount: tx.amount,
          isOutgoing,
          status: tx.transaction_status,
          txId: tx.transaction_id,
        });
      } else if (isDeclined) {
        events.push({
          id: `dec-${tx.transaction_id}`,
          timestamp: tx.timestamp,
          type: 'declined',
          title: 'Declined Transaction Operation',
          description: `Operation was declined by risk policy or payment channel ($${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}).`,
          amount: tx.amount,
          isOutgoing,
          status: tx.transaction_status,
          txId: tx.transaction_id,
        });
      } else if (isLarge) {
        events.push({
          id: `large-${tx.transaction_id}`,
          timestamp: tx.timestamp,
          type: 'large_amount',
          title: 'Unusually High Transaction Volume',
          description: `Transaction amount of $${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} exceeds 2.5× average entity transaction baseline.`,
          amount: tx.amount,
          isOutgoing,
          status: tx.transaction_status,
          txId: tx.transaction_id,
        });
      } else if (isLast) {
        events.push({
          id: `last-${tx.transaction_id}`,
          timestamp: tx.timestamp,
          type: 'last_tx',
          title: 'Latest Observed Transaction Activity',
          description: `Most recent observed ${isOutgoing ? 'outgoing debit' : 'incoming credit'} of $${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
          amount: tx.amount,
          isOutgoing,
          status: tx.transaction_status,
          txId: tx.transaction_id,
        });
      }
    });

    return events;
  }, [recentTransactions, behavioralProfile, accountId]);

  // Derived: Alternative Explanations (Anti-Confirmation Bias)
  const alternativeExplanations = useMemo(() => {
    if (!account || !behavioralProfile) return [];
    const items: Array<{ title: string; explanation: string; strength: 'high' | 'moderate' }> = [];

    if (peerStats && peerStats.has_peer_data && peerStats.peer_median_decline_rate !== null) {
      if (behavioralProfile.declineRate <= peerStats.peer_median_decline_rate) {
        items.push({
          title: 'Decline Rate Consistent with Peer Baseline',
          explanation: `The account decline rate (${(behavioralProfile.declineRate * 100).toFixed(1)}%) is at or below the community median (${(peerStats.peer_median_decline_rate * 100).toFixed(1)}%), indicating normal payment completion behavior without elevated policy friction.`,
          strength: 'high',
        });
      }
    }

    if (relationshipExposure.sharedDevicesCount === 0 && relationshipExposure.sharedInstrumentsCount === 0) {
      items.push({
        title: 'Zero Shared Hardware or Payment Tokens',
        explanation: 'This account exhibits no shared device hardware fingerprints or shared payment card/token links with other network entities. Graph adjacency is based purely on transaction flows.',
        strength: 'high',
      });
    }

    if (peerStats && peerStats.has_peer_data && peerStats.peer_median_tx_volume !== null) {
      if (behavioralProfile.totalVolume < peerStats.peer_median_tx_volume) {
        items.push({
          title: 'Transacted Volume Below Community Median',
          explanation: `Total transacted volume ($${behavioralProfile.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}) is lower than the community peer median ($${peerStats.peer_median_tx_volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}). High cluster risk prioritization may be driven by other peer accounts.`,
          strength: 'moderate',
        });
      }
    }

    if (evidence && evidence.high_count === 0 && evidence.medium_count === 0) {
      items.push({
        title: 'Only Low-Severity Observable Evidence Triggers',
        explanation: 'All deterministic evidence detections for this entity are classified as LOW severity (e.g. general graph centrality), with zero HIGH or MEDIUM multi-layer infrastructure reuse signals.',
        strength: 'moderate',
      });
    }

    return items;
  }, [account, behavioralProfile, peerStats, relationshipExposure, evidence]);

  // Derived: Next Best Actions (Deterministic recommendations)
  const nextActions = useMemo(() => {
    if (!account) return [];
    const actions: Array<{
      title: string;
      reason: string;
      actionLabel: string;
      onClick: () => void;
      priority: 'high' | 'medium';
    }> = [];

    if (relationshipExposure.sharedDevicesCount > 0) {
      actions.push({
        title: 'Inspect Shared Device Hardware',
        reason: `Account shares hardware fingerprint with ${relationshipExposure.sharedDevicesCount} connected entities in the graph.`,
        actionLabel: 'Inspect in Network Graph →',
        onClick: () =>
          navigate(`/forensics?community=${account.community_id}&view=network&focus=${account.account_id}`),
        priority: 'high',
      });
    }

    if (relationshipExposure.sharedInstrumentsCount > 0) {
      actions.push({
        title: 'Inspect Shared Payment Instruments',
        reason: `Card/token infrastructure is shared across ${relationshipExposure.sharedInstrumentsCount} network nodes.`,
        actionLabel: 'Explore Evidence Matrix →',
        onClick: () =>
          navigate(`/forensics?community=${account.community_id}&view=evidence&focus=${account.account_id}`),
        priority: 'high',
      });
    }

    if (account.community_id !== null && account.community_risk_score && account.community_risk_score >= 60) {
      actions.push({
        title: `Triage Parent Cluster #` + account.community_id,
        reason: `Parent community partition is prioritized as ${account.community_risk_level} risk (${account.community_risk_score}/100).`,
        actionLabel: 'Open Community Triage →',
        onClick: () => navigate(`/communities/${account.community_id}`),
        priority: 'medium',
      });
    }

    if (relationshipExposure.topConnections.length > 0) {
      const topConn = relationshipExposure.topConnections[0];
      actions.push({
        title: `Inspect Strongest Graph Neighbor (${topConn.connected_account_id})`,
        reason: `Strongest observable evidence link with weight ${topConn.edge_weight.toFixed(2)}.`,
        actionLabel: `Inspect ${topConn.connected_account_id} →`,
        onClick: () => navigate(`/accounts/${topConn.connected_account_id}`),
        priority: 'medium',
      });
    }

    return actions;
  }, [account, relationshipExposure, navigate]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>
        <LoadingState type="card" count={2} />
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

  const hasCommunity = account.community_id !== null && account.community_id !== undefined;
  const txStats = account.transaction_statistics;

  const txFilterOptions: FilterOption<'all' | 'sent' | 'received'>[] = [
    { label: 'All Operations', value: 'all', count: txStats.total_count },
    { label: 'Sent (Debited)', value: 'sent', count: txStats.sent_count },
    { label: 'Received (Credited)', value: 'received', count: txStats.received_count },
  ];

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
      width: '160px',
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
          onClick={() =>
            navigate(`/transactions/${tx.transaction_id}`, {
              state: { fromAccount: account.account_id },
            })
          }
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
      render: (conn) =>
        conn.shared_devices.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--risk-high)' }}>
            <Smartphone size={13} style={{ flexShrink: 0 }} />
            <span className="font-mono" style={{ fontSize: '11px' }}>
              {conn.shared_devices.join(', ')}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        ),
    },
    {
      key: 'shared_payment_instruments',
      header: 'Shared Instruments',
      render: (conn) =>
        conn.shared_payment_instruments.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--risk-med)' }}>
            <CreditCard size={13} style={{ flexShrink: 0 }} />
            <span className="font-mono" style={{ fontSize: '11px' }}>
              {conn.shared_payment_instruments.join(', ')}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
        ),
    },
    {
      key: 'shared_ips',
      header: 'Shared IPs',
      render: (conn) =>
        conn.shared_ips.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent)' }}>
            <Network size={13} style={{ flexShrink: 0 }} />
            <span className="font-mono" style={{ fontSize: '11px' }}>
              {conn.shared_ips.join(', ')}
            </span>
          </div>
        ) : (
          <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>—</span>
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
        description={`Entity intelligence dossier for account ${account.account_id}. Observable network relationships, behavioral profile, peer comparison, and deterministic evidence.`}
        breadcrumbs={
          <button
            onClick={() => {
              if (fromForensics && (forensicCommunityId || account.community_id)) {
                const targetComm = forensicCommunityId || String(account.community_id);
                navigate(`/forensics?community=${targetComm}&view=accounts`);
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
                : 'Back to Accounts Registry'}
            </span>
          </button>
        }
        badge={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant="neutral">ACCOUNT {account.account_id}</Badge>
            {hasCommunity && (
              <Badge variant="accent">COMMUNITY #{account.community_id}</Badge>
            )}
            {account.risk_level && (
              <RiskBadge level={account.risk_level} size="md" />
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
              riskLevel={account.risk_level}
              size="md"
            />
          </div>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* 2. SCORECARD METRICS                                              */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="md">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px' }}>
          <Metric
            label="Available Balance"
            value={`$${account.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtext="Current ledger balance"
          />
          <Metric
            label="Model Risk Score"
            value={
              account.account_risk_score !== null ? (
                <RiskScore score={Math.round(account.account_risk_score * 100)} level={account.risk_level} size="md" showBar />
              ) : (
                '—'
              )
            }
            subtext="Model output (relative risk ranking)"
          />
          <Metric
            label="Parent Community Risk"
            value={account.community_risk_score !== null ? `${account.community_risk_score}/100` : '—'}
            subtext={
              account.community_risk_level
                ? `Community #${account.community_id} — ${account.community_risk_level} risk tier (Louvain partition score)`
                : 'Not assigned to a community partition'
            }
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
      {/* 3. DUAL COLUMN DOSSIER: RISK TRAJECTORY & WHY THIS ACCOUNT         */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '16px' }}>
        {/* Section A: Risk Trajectory Status */}
        <Panel
          title="1. Account Risk Trajectory"
          subtitle="Model assessment checkpoints across observed entity history."
          padding="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <Cpu size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>
                  Assessment Provenance
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {account.account_risk_score !== null
                    ? `Baseline Score: ${Math.round(account.account_risk_score * 100)}/100 (${account.risk_level} Tier)`
                    : 'Unscored Entity'}
                </span>
              </div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px dashed var(--border-light)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}
            >
              <History size={16} style={{ color: 'var(--text-dim)', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                  Historical risk trajectory unavailable for this dataset.
                </strong>
                The current benchmark provides a single static risk assessment per account. Longitudinal risk score re-evaluations are not recorded in this 90-day transaction telemetry window.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px' }}>
              <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>First Observed Activity</span>
                <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {account.first_observed_activity ? account.first_observed_activity.split('T')[0] : account.creation_date || '—'}
                </span>
              </div>
              <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Latest Observed Activity</span>
                <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {account.last_observed_activity ? account.last_observed_activity.split('T')[0] : '—'}
                </span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Section B: Why This Account Matters */}
        <Panel
          title="2. Why This Account (Evidence Indicators)"
          subtitle="Deterministic rule evaluations across network graph and hardware sharing."
          padding="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {evidence && evidence.items.length > 0 ? (
              evidence.items.map((item) => (
                <div
                  key={item.evidence_id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '5px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RiskBadge level={item.severity} size="sm" />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {item.title}
                      </span>
                    </div>
                    <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>
                      +{item.score_contribution.toFixed(0)} pts
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                    {item.description}
                  </p>
                  {item.supporting_entities.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', fontSize: '11px', color: 'var(--text-dim)' }}>
                      <span>Supporting entities:</span>
                      <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {item.supporting_entities.slice(0, 3).join(', ')}
                        {item.supporting_entities.length > 3 ? ` (+${item.supporting_entities.length - 3} more)` : ''}
                      </span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No active deterministic rule triggers surfaced for this account.
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. RELATIONSHIP EXPOSURE & PEER COMPARISON DUAL GRID              */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '16px' }}>
        {/* Section A: Relationship Exposure Summary */}
        <Panel
          title="3. Relationship Exposure"
          subtitle="Hardware fingerprints, payment instruments, and graph adjacency."
          padding="lg"
          actions={
            hasCommunity ? (
              <Button
                variant="secondary"
                size="sm"
                icon={Network}
                onClick={() =>
                  navigate(`/forensics?community=${account.community_id}&view=network&focus=${account.account_id}`)
                }
              >
                Explore Relationship Network →
              </Button>
            ) : undefined
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 4-Stat Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              <div style={{ padding: '10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Shared Devices</span>
                <strong className="font-mono" style={{ fontSize: '16px', color: relationshipExposure.sharedDevicesCount > 0 ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                  {relationshipExposure.sharedDevicesCount}
                </strong>
              </div>
              <div style={{ padding: '10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Shared Cards/Tokens</span>
                <strong className="font-mono" style={{ fontSize: '16px', color: relationshipExposure.sharedInstrumentsCount > 0 ? 'var(--risk-med)' : 'var(--text-primary)' }}>
                  {relationshipExposure.sharedInstrumentsCount}
                </strong>
              </div>
              <div style={{ padding: '10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Shared IPs</span>
                <strong className="font-mono" style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                  {relationshipExposure.sharedIpsCount}
                </strong>
              </div>
              <div style={{ padding: '10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)', textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Neighbors</span>
                <strong className="font-mono" style={{ fontSize: '16px', color: 'var(--accent)' }}>
                  {account.connected_account_count}
                </strong>
              </div>
            </div>

            {/* Top Connected Accounts List */}
            <div>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '8px' }}>
                Strongest Observable Connections
              </span>
              {relationshipExposure.topConnections.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {relationshipExposure.topConnections.map((conn) => (
                    <div
                      key={conn.connected_account_id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/accounts/${conn.connected_account_id}`)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          {conn.connected_account_id}
                        </button>
                        {conn.shared_devices.length > 0 && (
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'var(--risk-high-bg)', color: 'var(--risk-high)' }}>
                            Shared Device
                          </span>
                        )}
                        {conn.shared_payment_instruments.length > 0 && (
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'var(--risk-med-bg)', color: 'var(--risk-med)' }}>
                            Shared Instrument
                          </span>
                        )}
                      </div>
                      <span className="font-mono" style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>
                        Weight: {conn.edge_weight.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No observable connections recorded.</span>
              )}
            </div>
          </div>
        </Panel>

        {/* Section B: Peer-Relative Behavior */}
        <Panel
          title="4. Peer-Relative Behavior"
          subtitle={
            peerStats && peerStats.has_peer_data
              ? `Benchmark comparison vs ${peerStats.peer_count.toLocaleString()} member accounts in Community #${peerStats.community_id}.`
              : 'Comparison vs community baseline population.'
          }
          padding="lg"
        >
          {peerStats && peerStats.has_peer_data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '8px',
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--text-dim)',
                }}
              >
                <span>Dimension</span>
                <span style={{ textAlign: 'right' }}>This Account</span>
                <span style={{ textAlign: 'right' }}>Peer Median</span>
              </div>

              {[
                {
                  label: 'Transaction Count',
                  accountVal: `${peerStats.account_tx_count.toLocaleString()} txs`,
                  peerVal: `${peerStats.peer_median_tx_count?.toFixed(1) ?? '—'} txs`,
                  isElevated: (peerStats.peer_median_tx_count ?? 0) > 0 && peerStats.account_tx_count > (peerStats.peer_median_tx_count ?? 0) * 1.5,
                },
                {
                  label: 'Transacted Volume',
                  accountVal: `$${peerStats.account_tx_volume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                  peerVal: `$${peerStats.peer_median_tx_volume?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—'}`,
                  isElevated: (peerStats.peer_median_tx_volume ?? 0) > 0 && peerStats.account_tx_volume > (peerStats.peer_median_tx_volume ?? 0) * 2,
                },
                {
                  label: 'Decline Rate',
                  accountVal: `${(peerStats.account_decline_rate * 100).toFixed(1)}%`,
                  peerVal: `${((peerStats.peer_median_decline_rate ?? 0) * 100).toFixed(1)}%`,
                  isElevated: peerStats.account_decline_rate > 0.05,
                },
                {
                  label: 'Graph Connections',
                  accountVal: `${peerStats.account_connections} nodes`,
                  peerVal: `${peerStats.peer_median_connections?.toFixed(1) ?? '—'} nodes`,
                  isElevated: (peerStats.peer_median_connections ?? 0) > 0 && peerStats.account_connections > (peerStats.peer_median_connections ?? 0) * 2,
                },
                {
                  label: 'Avg Transaction Amount',
                  accountVal: `$${peerStats.account_avg_tx_amount.toFixed(2)}`,
                  peerVal: `$${peerStats.peer_median_avg_tx_amount?.toFixed(2) ?? '—'}`,
                  isElevated: false,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    backgroundColor: row.isElevated ? 'var(--risk-high-bg)' : 'var(--bg-input)',
                    border: row.isElevated ? '1px solid var(--risk-high-border)' : '1px solid var(--border)',
                    fontSize: '12px',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.label}</span>
                  <span className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: row.isElevated ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                    {row.accountVal}
                  </span>
                  <span className="font-mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                    {row.peerVal}
                  </span>
                </div>
              ))}

              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: '4px' }}>
                * Peer medians calculated across a representative sample of {peerStats.peer_sample_size} member accounts in Community #{peerStats.community_id}.
              </span>
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Peer baseline comparison unavailable (account is not assigned to a community cluster partition).
            </div>
          )}
        </Panel>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. BEHAVIORAL PROFILE & CHRONOLOGICAL TIMELINE                    */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '16px' }}>
        {/* Section A: Behavioral Fingerprint */}
        <Panel
          title="5. Behavioral Profile"
          subtitle="Measurable transaction frequency, velocity, and payment method distribution."
          padding="lg"
        >
          {behavioralProfile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ padding: '10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Daily Velocity</span>
                  <span className="font-mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                    {behavioralProfile.velocityPerDay.toFixed(2)} tx/day
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                    Over {behavioralProfile.activeDays} observed days
                  </span>
                </div>

                <div style={{ padding: '10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Avg Operation</span>
                  <span className="font-mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                    ${behavioralProfile.avgAmount.toFixed(2)}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                    Per transacted operation
                  </span>
                </div>

                <div style={{ padding: '10px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Sent / Received</span>
                  <span className="font-mono" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                    {txStats.sent_count} / {txStats.received_count}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                    Debits vs credits
                  </span>
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '8px' }}>
                  Observed Payment Channels
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(behavioralProfile.paymentMethods).map(([method, count]) => (
                    <div
                      key={method}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <CreditCard size={13} style={{ color: 'var(--accent)' }} />
                      <span style={{ textTransform: 'capitalize', color: 'var(--text-primary)', fontWeight: 600 }}>{method}</span>
                      <span className="font-mono" style={{ color: 'var(--text-dim)', fontSize: '11px' }}>({count})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No behavioral data available.</div>
          )}
        </Panel>

        {/* Section B: Account Investigation Timeline */}
        <Panel
          title="6. Investigation Timeline"
          subtitle="Chronological milestones reconstructed from observable transaction records."
          padding="lg"
        >
          {timelineEvents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {timelineEvents.map((evt) => (
                <div
                  key={evt.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    border: evt.type === 'declined' ? '1px solid var(--risk-high-border)' : '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '10px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="font-mono" style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
                        {evt.timestamp}
                      </span>
                      {evt.type === 'declined' && (
                        <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'var(--risk-high-bg)', color: 'var(--risk-high)', fontWeight: 700 }}>
                          Declined
                        </span>
                      )}
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{evt.title}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{evt.description}</span>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ExternalLink}
                    onClick={() =>
                      navigate(`/transactions/${evt.txId}`, {
                        state: { fromAccount: account.account_id },
                      })
                    }
                    title="Inspect transaction"
                  >
                    Inspect
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No timeline events recorded in active transaction window.
            </div>
          )}
        </Panel>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 6. ALTERNATIVE EXPLANATIONS & NEXT BEST INVESTIGATION DUAL GRID     */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '16px' }}>
        {/* Section A: Alternative Explanations (Anti-Confirmation Bias) */}
        <Panel
          title="7. Alternative Explanations (Anti-Confirmation Bias)"
          subtitle="Observable evidence that weakens or contextualizes suspicious interpretations."
          padding="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {alternativeExplanations.length > 0 ? (
              alternativeExplanations.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield size={14} style={{ color: '#10b981' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.title}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                    {item.explanation}
                  </p>
                </div>
              ))
            ) : (
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
                Insufficient counter-evidence to support a benign alternative explanation. Observable signals consistently align with cluster risk indicators.
              </div>
            )}
          </div>
        </Panel>

        {/* Section B: Next Best Investigation */}
        <Panel
          title="8. Next Best Investigation Actions"
          subtitle="Deterministic, evidence-driven next steps for the investigator."
          padding="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {nextActions.length > 0 ? (
              nextActions.map((action, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {action.title}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {action.reason}
                    </span>
                  </div>

                  <Button
                    variant={action.priority === 'high' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={action.onClick}
                  >
                    {action.actionLabel}
                  </Button>
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                Insufficient observable evidence to generate a specific next-step recommendation for this account. No shared devices, shared instruments, or high-risk community membership detected in available graph data.
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7. DEEP DIVE TABS: FULL TRANSACTIONS & ALL CONNECTIONS             */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ scrollMarginTop: '20px', marginTop: '8px' }}>
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
            <span>All Transactions ({txStats.total_count.toLocaleString()})</span>
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
            <span>All Observable Graph Connections ({account.connected_account_count})</span>
          </button>
        </div>

        {/* Tab A: Transactions Activity Log */}
        {activeTab === 'transactions' && (
          <Panel padding="none">
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
                Showing {transactions.length} of {txTotal} operations
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
            {!connections ? (
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

    </div>
  );
};
