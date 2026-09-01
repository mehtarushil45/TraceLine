import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  GitBranch,
  Info,
  Network,
  Smartphone,
  Store,
  XCircle,
} from 'lucide-react';
import {
  getAccount,
  getAccountEvidence,
  getAccountTransactions,
  getTransaction,
  getTransactionCounterparty,
} from '../api';
import type {
  AccountDetailResponse,
  AccountEvidenceResponse,
  EvidenceItem,
  TransactionCounterpartyResponse,
  TransactionDetailResponse,
  TransactionItem,
} from '../types/api';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  EntityLink,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  Panel,
  RiskBadge,
} from '../components/common';
import type { Column } from '../components/common';

// ─── Status renderer ─────────────────────────────────────────────────────────

const renderTxStatus = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'settled') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '4px',
          backgroundColor: 'rgba(134,239,172,0.1)',
          border: '1px solid rgba(134,239,172,0.25)',
          color: '#86efac',
          fontSize: '11px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
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
          padding: '2px 8px',
          borderRadius: '4px',
          backgroundColor: 'var(--risk-high-bg)',
          border: '1px solid var(--risk-high-border)',
          color: 'var(--risk-high)',
          fontSize: '11px',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
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
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: 'var(--risk-med-bg)',
        border: '1px solid var(--risk-med-border)',
        color: 'var(--risk-med)',
        fontSize: '11px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      <Clock size={11} />
      {status}
    </span>
  );
};

// ─── Field row helper ─────────────────────────────────────────────────────────

const FieldRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  provenance?: 'observed' | 'derived';
}> = ({ icon, label, value, provenance = 'observed' }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderRadius: '4px',
      backgroundColor: 'var(--bg-input)',
      border: '1px solid var(--border)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
      {icon}
      <span>{label}</span>
      {provenance === 'derived' && (
        <span
          style={{
            fontSize: '9px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-dim)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            padding: '1px 4px',
          }}
        >
          derived
        </span>
      )}
    </div>
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        fontSize: '12px',
        textAlign: 'right',
        maxWidth: '58%',
        wordBreak: 'break-all',
      }}
    >
      {value}
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const TransactionDetailPage: React.FC = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const navState = location.state as {
    fromForensics?: boolean;
    communityId?: string;
    forensicView?: string;
    fromAccount?: string;
  } | null;

  const fromForensics = Boolean(navState?.fromForensics);
  const forensicCommunityId = navState?.communityId;
  const forensicView = navState?.forensicView || 'timeline';
  const fromAccountId = navState?.fromAccount ?? null;

  // Core data
  const [tx, setTx] = useState<TransactionDetailResponse | null>(null);
  const [srcAccount, setSrcAccount] = useState<AccountDetailResponse | null>(null);
  const [dstAccount, setDstAccount] = useState<AccountDetailResponse | null>(null);
  const [srcEvidence, setSrcEvidence] = useState<AccountEvidenceResponse | null>(null);
  const [counterparty, setCounterparty] = useState<TransactionCounterpartyResponse | null>(null);
  const [relatedTxs, setRelatedTxs] = useState<TransactionItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) return;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const txRes = await getTransaction(transactionId);
        setTx(txRes);

        const [srcRes, dstRes, evRes, cpRes, relRes] = await Promise.allSettled([
          getAccount(txRes.src_account_id),
          getAccount(txRes.dst_account_id),
          getAccountEvidence(txRes.src_account_id),
          getTransactionCounterparty(transactionId),
          getAccountTransactions(txRes.src_account_id, 1, 6),
        ]);

        if (srcRes.status === 'fulfilled') setSrcAccount(srcRes.value);
        if (dstRes.status === 'fulfilled') setDstAccount(dstRes.value);
        if (evRes.status === 'fulfilled') setSrcEvidence(evRes.value);
        if (cpRes.status === 'fulfilled') setCounterparty(cpRes.value);
        if (relRes.status === 'fulfilled') {
          // Exclude the focal transaction from related list
          setRelatedTxs(relRes.value.items.filter((t) => t.transaction_id !== transactionId).slice(0, 5));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : `Transaction '${transactionId}' not found`);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [transactionId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <LoadingState type="card" count={1} />
        <LoadingState type="table" count={6} />
      </div>
    );
  }

  if (error || !tx) {
    return (
      <ErrorState
        title="Transaction Record Unavailable"
        message={error || 'The requested transaction could not be loaded from the dataset.'}
        onRetry={() => navigate('/transactions')}
      />
    );
  }

  const isDeclined = ['declined', 'failed'].includes(tx.transaction_status.toLowerCase());
  const isSettled = ['settled', 'completed', 'success'].includes(tx.transaction_status.toLowerCase());

  const backLabel = fromForensics && (forensicCommunityId || srcAccount?.community_id)
    ? `Back to Community #${forensicCommunityId || srcAccount?.community_id} Forensic Workspace`
    : fromAccountId
    ? `Back to Account ${fromAccountId}`
    : 'Back to Transactions Registry';

  const backAction = () => {
    if (fromForensics && (forensicCommunityId || srcAccount?.community_id)) {
      navigate(`/forensics?community=${forensicCommunityId || srcAccount?.community_id}&view=${forensicView}`);
    } else if (fromAccountId) {
      navigate(`/accounts/${fromAccountId}`);
    } else {
      navigate('/transactions');
    }
  };

  // ── Evidence columns ─────────────────────────────────────────────────────
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
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</span>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>{item.description}</p>
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
      header: 'Supporting Entities',
      width: '160px',
      render: (item) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {item.supporting_entities.length} entit{item.supporting_entities.length === 1 ? 'y' : 'ies'}
          </span>
          {item.supporting_entities.length > 0 && (
            <span className="font-mono truncate" style={{ fontSize: '10px', color: 'var(--text-dim)', maxWidth: '140px' }}>
              {item.supporting_entities.slice(0, 2).join(', ')}
              {item.supporting_entities.length > 2 ? '…' : ''}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: '',
      width: '140px',
      align: 'right',
      render: () => {
        if (!srcAccount?.community_id) return null;
        return (
          <Button
            variant="secondary"
            size="sm"
            icon={Network}
            onClick={() => navigate(
              `/forensics?community=${srcAccount.community_id}&view=network&focus=${srcAccount.account_id}&lens=relationship`,
              { state: { fromTransaction: tx.transaction_id } }
            )}
          >
            Explore Graph
          </Button>
        );
      },
    },
  ];

  // ── Related tx columns ───────────────────────────────────────────────────
  const relatedTxColumns: Column<TransactionItem>[] = [
    {
      key: 'transaction_id',
      header: 'Transaction ID',
      width: '145px',
      render: (item) => <EntityLink type="transaction" id={item.transaction_id} style={{ fontSize: '12px' }} />,
    },
    {
      key: 'timestamp',
      header: 'Timestamp',
      width: '160px',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {item.timestamp.replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '110px',
      align: 'right',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
          ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'flow',
      header: 'Flow',
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
          <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
            {item.src_account_id}
          </span>
          <ArrowRight size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
            {item.dst_account_id}
          </span>
        </div>
      ),
    },
    {
      key: 'transaction_status',
      header: 'Status',
      width: '110px',
      render: (item) => renderTxStatus(item.transaction_status),
    },
    {
      key: 'action',
      header: '',
      width: '90px',
      align: 'right',
      render: (item) => (
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowRight}
          iconPosition="right"
          onClick={() => navigate(`/transactions/${item.transaction_id}`, { state: { fromAccount: tx.src_account_id } })}
        >
          Inspect
        </Button>
      ),
    },
  ];

  // ── Counterparty recent tx columns ───────────────────────────────────────
  type CPItem = NonNullable<typeof counterparty>['recent_transactions'][0];
  const cpRecentColumns: Column<CPItem>[] = [
    {
      key: 'transaction_id',
      header: 'Transaction ID',
      width: '145px',
      render: (item) => (
        <EntityLink
          type="transaction"
          id={item.transaction_id}
          style={{
            fontSize: '12px',
            fontWeight: item.transaction_id === tx.transaction_id ? 800 : 500,
            color: item.transaction_id === tx.transaction_id ? 'var(--accent)' : 'var(--text-primary)',
          }}
        />
      ),
    },
    {
      key: 'timestamp',
      header: 'Timestamp',
      width: '160px',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {item.timestamp.replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '110px',
      align: 'right',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700 }}>
          ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'transaction_status',
      header: 'Status',
      width: '110px',
      render: (item) => renderTxStatus(item.transaction_status),
    },
    {
      key: 'payment_method',
      header: 'Method',
      width: '110px',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {item.payment_method ? item.payment_method.toUpperCase() : '—'}
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      width: '90px',
      align: 'right',
      render: (item) =>
        item.transaction_id !== tx.transaction_id ? (
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            iconPosition="right"
            onClick={() => navigate(`/transactions/${item.transaction_id}`)}
          >
            Inspect
          </Button>
        ) : (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--accent)',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              border: '1px solid var(--accent)',
              borderRadius: '3px',
              padding: '2px 5px',
            }}
          >
            FOCAL TX
          </span>
        ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* ── 1. PAGE HEADER ─────────────────────────────────────────────── */}
      <PageHeader
        title="Transaction Investigation"
        description="Forensic investigation of a single payment transaction — observed telemetry, counterparty relationship metrics, and deterministic evidence."
        breadcrumbs={
          <button
            onClick={backAction}
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
            <span>{backLabel}</span>
          </button>
        }
        badge={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant="neutral">TX {tx.transaction_id}</Badge>
            {renderTxStatus(tx.transaction_status)}
            {srcAccount?.community_id != null && (
              <Badge variant="accent">COMMUNITY #{srcAccount.community_id}</Badge>
            )}
            {srcAccount?.community_risk_level && (
              <RiskBadge level={srcAccount.community_risk_level} size="md" />
            )}
          </div>
        }
      />

      {/* ── 2. OBSERVED CORE METRICS ────────────────────────────────────── */}
      <Panel padding="md">
        <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
            Observed Transaction Telemetry — Direct source dataset fields
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <Metric
            label="Observed Amount"
            value={`$${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtext="Recorded transfer amount"
          />
          <Metric
            label="Transaction Status"
            value={renderTxStatus(tx.transaction_status)}
            subtext={isDeclined ? 'Declined — failure reason unavailable in telemetry' : isSettled ? 'Settled successfully' : 'Pending settlement'}
            variant={isDeclined ? 'high' : 'default'}
          />
          <Metric
            label="Execution Timestamp (UTC)"
            value={tx.timestamp.split('T')[0] || tx.timestamp.split(' ')[0]}
            subtext={tx.timestamp.split('T')[1]?.split('.')[0] || tx.timestamp.split(' ')[1] || 'Recorded timestamp'}
          />
          <Metric
            label="Payment Method"
            value={tx.payment_method ? tx.payment_method.toUpperCase() : '—'}
            subtext={tx.payment_method ? `${tx.payment_method} channel` : 'Unrecorded in telemetry'}
          />
          {srcAccount?.community_id != null && (
            <Metric
              label="Origin Community"
              value={`Community #${srcAccount.community_id}`}
              subtext={srcAccount.community_risk_score ? `${srcAccount.community_risk_score}/100 partition risk` : 'Louvain partition'}
              variant={srcAccount?.community_risk_level === 'HIGH' ? 'high' : 'default'}
            />
          )}
        </div>
      </Panel>

      {/* ── 3. COUNTERPARTY TRANSFER FLOW ───────────────────────────────── */}
      <Panel
        title="Counterparty Transfer Flow"
        subtitle="Observed sender and receiver accounts. Click to open the Account Investigation dossier."
        padding="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'stretch' }}>
          {/* Source */}
          <div
            style={{
              padding: '16px 18px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                  Sender (Source Account)
                </span>
                <Badge variant="neutral" size="sm">
                  DEBITED
                </Badge>
              </div>
              <EntityLink type="account" id={tx.src_account_id} style={{ fontSize: '14px', fontWeight: 800 }} />
              {srcAccount && (
                <div
                  style={{
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    fontSize: '11px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Balance: </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      ${srcAccount.balance.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Community: </span>
                    <span className="font-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {srcAccount.community_id != null ? `#${srcAccount.community_id}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Risk Level: </span>
                    {srcAccount.risk_level && <RiskBadge level={srcAccount.risk_level} size="sm" />}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Connections: </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {srcAccount.connected_account_count}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              onClick={() => navigate(`/accounts/${tx.src_account_id}`, { state: { fromTransaction: tx.transaction_id } })}
            >
              Inspect Sender Account
            </Button>
          </div>

          {/* Flow Summary */}
          <div
            style={{
              padding: '16px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
              Transaction Amount
            </span>
            <span className="font-mono" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
              ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div style={{ marginTop: '4px' }}>{renderTxStatus(tx.transaction_status)}</div>
            {tx.payment_method && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                via {tx.payment_method.toUpperCase()}
              </span>
            )}
            <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px' }}>
              {tx.timestamp.replace('T', ' ')}
            </span>
          </div>

          {/* Destination */}
          <div
            style={{
              padding: '16px 18px',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>
                  Receiver (Destination Account)
                </span>
                <Badge variant="low" size="sm">
                  CREDITED
                </Badge>
              </div>
              <EntityLink type="account" id={tx.dst_account_id} style={{ fontSize: '14px', fontWeight: 800 }} />
              {dstAccount && (
                <div
                  style={{
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    fontSize: '11px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Balance: </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      ${dstAccount.balance.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Community: </span>
                    <span className="font-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {dstAccount.community_id != null ? `#${dstAccount.community_id}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Risk Level: </span>
                    {dstAccount.risk_level && <RiskBadge level={dstAccount.risk_level} size="sm" />}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Connections: </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {dstAccount.connected_account_count}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowRight}
              iconPosition="right"
              onClick={() => navigate(`/accounts/${tx.dst_account_id}`, { state: { fromTransaction: tx.transaction_id } })}
            >
              Inspect Receiver Account
            </Button>
          </div>
        </div>
      </Panel>

      {/* ── 4. COUNTERPARTY RELATIONSHIP ANALYSIS ──────────────────────── */}
      <Panel
        title="Counterparty Relationship Analysis"
        subtitle={
          counterparty
            ? `Observed relationship between ${tx.src_account_id} and ${tx.dst_account_id} — derived from all transactions in the dataset.`
            : 'Loading counterparty data...'
        }
        padding="lg"
      >
        {!counterparty ? (
          <EmptyState title="Counterparty data unavailable" message="Could not load relationship analysis for this transaction." />
        ) : (
          <>
            {/* Provenance and context badges */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
              <div
                style={{
                  padding: '5px 10px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  display: 'inline-flex',
                  gap: '6px',
                  alignItems: 'center',
                }}
              >
                <GitBranch size={12} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
                  Derived from {counterparty.total_transactions_between} observed transaction
                  {counterparty.total_transactions_between === 1 ? '' : 's'}
                </span>
              </div>

              {counterparty.total_transactions_between === 1 && (
                <div
                  style={{
                    padding: '5px 10px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }}
                >
                  ℹ Single observed interaction between counterparties in dataset
                </div>
              )}

              {counterparty.transactions_src_to_dst > 0 && counterparty.transactions_dst_to_src > 0 && (
                <div
                  style={{
                    padding: '5px 10px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--accent)',
                  }}
                >
                  ⇄ Bidirectional Transfer Flow Observed
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div style={{ padding: '12px 14px', borderRadius: '5px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  Total Observed Txs
                </div>
                <div className="font-mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {counterparty.total_transactions_between}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {counterparty.transactions_src_to_dst} fwd · {counterparty.transactions_dst_to_src} rev
                </div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: '5px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  Flow {tx.src_account_id} → {tx.dst_account_id}
                </div>
                <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ${counterparty.total_flow_src_to_dst.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  across {counterparty.transactions_src_to_dst} tx{counterparty.transactions_src_to_dst !== 1 ? 's' : ''}
                </div>
              </div>

              {counterparty.transactions_dst_to_src > 0 ? (
                <div style={{ padding: '12px 14px', borderRadius: '5px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    Flow {tx.dst_account_id} → {tx.src_account_id}
                  </div>
                  <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    ${counterparty.total_flow_dst_to_src.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    across {counterparty.transactions_dst_to_src} tx{counterparty.transactions_dst_to_src !== 1 ? 's' : ''}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px 14px', borderRadius: '5px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    Flow {tx.dst_account_id} → {tx.src_account_id}
                  </div>
                  <div className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-dim)' }}>
                    $0
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    No reverse transfers observed
                  </div>
                </div>
              )}

              <div style={{ padding: '12px 14px', borderRadius: '5px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  Declined (This Pair)
                </div>
                <div className="font-mono" style={{ fontSize: '20px', fontWeight: 800, color: counterparty.declined_between > 0 ? 'var(--risk-high)' : 'var(--text-primary)' }}>
                  {counterparty.declined_between}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  of {counterparty.total_transactions_between} total transfers
                </div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: '5px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  Community Partition State
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: counterparty.same_community ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {counterparty.same_community ? 'Shared Louvain Community' : 'Cross-Community'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  Sender: {counterparty.src_community_id != null ? `#${counterparty.src_community_id}` : '—'} · Receiver:{' '}
                  {counterparty.dst_community_id != null ? `#${counterparty.dst_community_id}` : '—'}
                </div>
              </div>

              {(counterparty.first_observed_between || counterparty.last_observed_between) && (
                <div style={{ padding: '12px 14px', borderRadius: '5px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: '4px' }}>
                    Observed Temporal Range
                  </div>
                  <div className="font-mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    <div>First: {counterparty.first_observed_between ? counterparty.first_observed_between.replace('T', ' ') : '—'}</div>
                    <div>Last: {counterparty.last_observed_between ? counterparty.last_observed_between.replace('T', ' ') : '—'}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Note on Louvain partition interpretation */}
            {counterparty.same_community && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(59,130,246,0.05)',
                  border: '1px solid rgba(59,130,246,0.15)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'flex-start',
                }}
              >
                <Info size={13} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
                <span>
                  Both accounts belong to the same Louvain community partition (Community #{counterparty.src_community_id}). This reflects structural network modularity and shared graph density, not an automated fraud determination.
                </span>
              </div>
            )}

            {/* Recent transactions between this pair */}
            {counterparty.recent_transactions.length > 0 ? (
              <>
                <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Recent Transactions Between This Account Pair ({counterparty.recent_transactions.length})
                </div>
                <DataTable
                  columns={cpRecentColumns}
                  data={counterparty.recent_transactions}
                  keyExtractor={(item) => item.transaction_id}
                />
              </>
            ) : (
              <EmptyState
                title="No additional transactions between this pair"
                message="This transaction is the only observed interaction between these two accounts in the dataset."
              />
            )}
          </>
        )}
      </Panel>

      {/* ── 5. DIGITAL FINGERPRINT & MERCHANT ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        <Panel
          title="Observable Digital Fingerprint"
          subtitle="Infrastructure identifiers recorded during execution. Observed directly in source telemetry."
          padding="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <FieldRow
              icon={<Smartphone size={14} style={{ color: 'var(--risk-high)' }} />}
              label="Device ID"
              value={tx.device_id ?? <span style={{ color: 'var(--text-dim)' }}>— (No device recorded)</span>}
            />
            <FieldRow
              icon={<CreditCard size={14} style={{ color: 'var(--risk-med)' }} />}
              label="Payment Instrument"
              value={tx.payment_instrument_id ?? <span style={{ color: 'var(--text-dim)' }}>— (No instrument recorded)</span>}
            />
            <FieldRow
              icon={<Network size={14} style={{ color: 'var(--accent)' }} />}
              label="IP Address"
              value={tx.ip_address ?? <span style={{ color: 'var(--text-dim)' }}>— (No IP recorded)</span>}
            />
            <FieldRow
              icon={<Clock size={14} style={{ color: 'var(--text-dim)' }} />}
              label="Account Age at Execution"
              value={tx.account_age_days != null ? `${tx.account_age_days} days` : <span style={{ color: 'var(--text-dim)' }}>—</span>}
              provenance="derived"
            />
          </div>
        </Panel>

        <Panel
          title="Merchant & Payment Channel"
          subtitle="Merchant routing data from catalog join. Fields show — when not present in source telemetry."
          padding="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <FieldRow
              icon={<Store size={14} style={{ color: 'var(--risk-med)' }} />}
              label="Merchant ID"
              value={tx.merchant_id ?? <span style={{ color: 'var(--text-dim)' }}>— (P2P / Direct Transfer)</span>}
            />
            <FieldRow
              icon={<Store size={14} style={{ color: 'var(--text-dim)' }} />}
              label="Merchant Name"
              value={tx.merchant_name ?? <span style={{ color: 'var(--text-dim)' }}>— (Unlisted / Direct Transfer)</span>}
              provenance="derived"
            />
            <FieldRow
              icon={<Store size={14} style={{ color: 'var(--text-dim)' }} />}
              label="Merchant Category"
              value={tx.merchant_category ?? <span style={{ color: 'var(--text-dim)' }}>—</span>}
              provenance="derived"
            />
            <FieldRow
              icon={<CreditCard size={14} style={{ color: 'var(--accent)' }} />}
              label="Payment Method"
              value={tx.payment_method ? tx.payment_method.toUpperCase() : <span style={{ color: 'var(--text-dim)' }}>— (Unrecorded)</span>}
            />
          </div>
          {isDeclined && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 12px',
                borderRadius: '5px',
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--risk-high)', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <XCircle size={11} /> Transaction Declined
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Failure reason not available in source data. The enriched_transactions dataset does not record a failure_reason field.
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── 6. ORIGIN ACCOUNT OBSERVABLE EVIDENCE ──────────────────────── */}
      <Panel
        title={`Origin Account Observable Evidence — ${tx.src_account_id} (${srcEvidence?.items.length ?? 0} rules)`}
        subtitle="Deterministic evidence rules triggered on the originating account entity. These are account-level signals produced by the evidence intelligence engine, not transaction-level ML predictions."
        padding="none"
      >
        {!srcEvidence || srcEvidence.items.length === 0 ? (
          <EmptyState
            title="No evidence rules triggered on origin account"
            message="No deterministic evidence rules fired for the source account of this transaction. This does not imply the transaction is risk-free."
          />
        ) : (
          <DataTable columns={evidenceColumns} data={srcEvidence.items} keyExtractor={(item) => item.evidence_id} />
        )}
      </Panel>

      {/* ── 7. RECENT ACTIVITY FROM ORIGIN ACCOUNT ─────────────────────── */}
      <Panel
        title={`Recent Activity from Origin Account — ${tx.src_account_id}`}
        subtitle="Other recent transactions sent by the origin account. Excludes the focal transaction."
        padding="none"
      >
        {relatedTxs.length === 0 ? (
          <EmptyState
            title="No other transactions"
            message="No additional transactions found for this origin account in the dataset."
          />
        ) : (
          <DataTable columns={relatedTxColumns} data={relatedTxs} keyExtractor={(item) => item.transaction_id} />
        )}
      </Panel>
    </div>
  );
};
