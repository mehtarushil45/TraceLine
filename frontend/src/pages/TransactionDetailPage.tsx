import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Network,
  Smartphone,
  Store,
  User,
  XCircle,
} from 'lucide-react';
import {
  getAccount,
  getAccountEvidence,
  getAccountTransactions,
  getTransaction,
} from '../api';
import type {
  AccountDetailResponse,
  AccountEvidenceResponse,
  EvidenceItem,
  TransactionDetailResponse,
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
  LoadingState,
  Metric,
  PageHeader,
  Panel,
  RiskBadge,
} from '../components/common';
import type { Column } from '../components/common';
import { SarExportModal } from '../components/layout/SarExportModal';

export const TransactionDetailPage: React.FC = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();

  const [tx, setTx] = useState<TransactionDetailResponse | null>(null);
  const [srcAccount, setSrcAccount] = useState<AccountDetailResponse | null>(null);
  const [dstAccount, setDstAccount] = useState<AccountDetailResponse | null>(null);
  const [srcEvidence, setSrcEvidence] = useState<AccountEvidenceResponse | null>(null);
  const [relatedTxs, setRelatedTxs] = useState<TransactionItem[]>([]);
  const [isSarModalOpen, setIsSarModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) return;

    const fetchTransactionData = async () => {
      setLoading(true);
      setError(null);
      try {
        const txRes = await getTransaction(transactionId);
        setTx(txRes);

        // Fetch source and destination account details in parallel
        const [srcRes, dstRes, evRes, relRes] = await Promise.allSettled([
          getAccount(txRes.src_account_id),
          getAccount(txRes.dst_account_id),
          getAccountEvidence(txRes.src_account_id),
          getAccountTransactions(txRes.src_account_id, 1, 10),
        ]);

        if (srcRes.status === 'fulfilled') setSrcAccount(srcRes.value);
        if (dstRes.status === 'fulfilled') setDstAccount(dstRes.value);
        if (evRes.status === 'fulfilled') setSrcEvidence(evRes.value);
        if (relRes.status === 'fulfilled') setRelatedTxs(relRes.value.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Transaction '${transactionId}' not found`);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactionData();
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
        message={error || 'The requested transaction flow record could not be loaded.'}
        onRetry={() => navigate('/transactions')}
      />
    );
  }

  const isDeclined = tx.transaction_status.toLowerCase() === 'declined' || tx.transaction_status.toLowerCase() === 'failed';
  const isSettled = tx.transaction_status.toLowerCase() === 'settled' || tx.transaction_status.toLowerCase() === 'completed' || tx.transaction_status.toLowerCase() === 'success';

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
      width: '160px',
      align: 'right',
      render: (item) => {
        if (!srcAccount?.community_id) return null;
        return (
          <Button
            variant="secondary"
            size="sm"
            icon={Network}
            onClick={() =>
              navigate(`/communities/${srcAccount.community_id}`, {
                state: { tab: 'graph', evidenceFocus: item },
              })
            }
            title="Explore affected nodes in community topology"
          >
            Explore in Graph
          </Button>
        );
      },
    },
  ];

  // Related Transactions Table Columns
  const relatedTxColumns: Column<TransactionItem>[] = [
    {
      key: 'transaction_id',
      header: 'Transaction ID',
      width: '150px',
      render: (item) => (
        <EntityLink
          type="transaction"
          id={item.transaction_id}
          style={{
            fontWeight: item.transaction_id === tx.transaction_id ? 800 : 500,
            color: item.transaction_id === tx.transaction_id ? 'var(--accent)' : 'var(--text-primary)',
          }}
        />
      ),
    },
    {
      key: 'timestamp',
      header: 'Timestamp',
      width: '150px',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {item.timestamp}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '120px',
      align: 'right',
      render: (item) => (
        <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
          ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'flow',
      header: 'Transfer Flow',
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
          <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
            {item.src_account_id}
          </span>
          <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
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
      header: 'Action',
      width: '110px',
      align: 'right',
      render: (item) => (
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowRight}
          iconPosition="right"
          onClick={() => navigate(`/transactions/${item.transaction_id}`)}
        >
          Inspect
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
        title="Transaction Investigation"
        description="Forensic investigation of payment flow, digital fingerprints, and counterparty relationships."
        breadcrumbs={
          <button
            onClick={() => (srcAccount ? navigate(`/accounts/${tx.src_account_id}`) : navigate('/transactions'))}
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
            <span>{srcAccount ? `Back to Account ${tx.src_account_id}` : 'Back to Transactions'}</span>
          </button>
        }
        badge={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant="neutral">TX {tx.transaction_id}</Badge>
            {renderTxStatus(tx.transaction_status)}
            {srcAccount?.community_id && (
              <Badge variant="accent">COMMUNITY #{srcAccount.community_id}</Badge>
            )}
            {srcAccount?.community_risk_level && (
              <RiskBadge level={srcAccount.community_risk_level} size="md" />
            )}
          </div>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AddToInvestigationButton
              targetType="TRANSACTION"
              targetId={tx.transaction_id}
              targetLabel={`Transaction ${tx.transaction_id} ($${tx.amount.toFixed(2)})`}
              riskScore={srcAccount?.community_risk_score}
              riskLevel={srcAccount?.community_risk_level}
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
      {/* 2. TRANSACTION CONTEXT METRICS                                    */}
      {/* ------------------------------------------------------------------ */}
      <Panel padding="md">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <Metric
            label="Transfer Amount"
            value={`$${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtext="Settlement gross amount"
          />
          <Metric
            label="Gateway Status"
            value={renderTxStatus(tx.transaction_status)}
            subtext={isDeclined ? 'Declined by gateway' : isSettled ? 'Settled successfully' : 'Pending authorization'}
            variant={isDeclined ? 'high' : 'default'}
          />
          <Metric
            label="Timestamp"
            value={tx.timestamp.split('T')[0] || tx.timestamp.split(' ')[0]}
            subtext={tx.timestamp.split('T')[1] || tx.timestamp.split(' ')[1] || 'Execution time'}
          />
          <Metric
            label="Payment Channel"
            value={tx.payment_method || 'TRANSFER'}
            subtext={tx.merchant_category || 'Standard Channel'}
          />
          <Metric
            label="Origin Cluster"
            value={srcAccount?.community_id ? `Community #${srcAccount.community_id}` : 'Independent'}
            subtext={srcAccount?.community_risk_score ? `${srcAccount.community_risk_score}/100 Risk Score` : 'Unpartitioned'}
            variant={srcAccount?.community_risk_level === 'HIGH' ? 'high' : 'default'}
          />
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 3. PAYMENT GATEWAY TRANSFER FLOW (HERO VISUAL)                    */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title="Payment Gateway Transfer Flow"
        subtitle="Direct counterparty money transfer routing across source and destination nodes."
        padding="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'stretch' }}>
          {/* Origin Source Account Card */}
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
                  Origin (Source Account)
                </span>
                <Badge variant="neutral" size="sm">DEBITED</Badge>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                  <User size={16} />
                </div>
                <div>
                  <EntityLink type="account" id={tx.src_account_id} style={{ fontSize: '14px', fontWeight: 800 }} />
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {srcAccount?.customer_name || 'Origin Customer'}
                  </span>
                </div>
              </div>

              {srcAccount && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Balance: </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      ${srcAccount.balance.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Cluster: </span>
                    <span className="font-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {srcAccount.community_id !== null ? `#${srcAccount.community_id}` : 'None'}
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
              onClick={() => navigate(`/accounts/${tx.src_account_id}`)}
            >
              Inspect Source Account
            </Button>
          </div>

          {/* Transfer Operation Core Badge */}
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
              Execution Amount
            </span>
            <span className="font-mono" style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>
              ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div style={{ marginTop: '4px' }}>
              {renderTxStatus(tx.transaction_status)}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {tx.payment_method || 'Direct Wire'} · {tx.timestamp}
            </span>
          </div>

          {/* Beneficiary Destination Account Card */}
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
                  Beneficiary (Destination Account)
                </span>
                <Badge variant="low" size="sm">CREDITED</Badge>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '4px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86efac' }}>
                  <User size={16} />
                </div>
                <div>
                  <EntityLink type="account" id={tx.dst_account_id} style={{ fontSize: '14px', fontWeight: 800 }} />
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {dstAccount?.customer_name || 'Beneficiary Customer'}
                  </span>
                </div>
              </div>

              {dstAccount && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Balance: </span>
                    <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      ${dstAccount.balance.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>Cluster: </span>
                    <span className="font-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                      {dstAccount.community_id !== null ? `#${dstAccount.community_id}` : 'None'}
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
              onClick={() => navigate(`/accounts/${tx.dst_account_id}`)}
            >
              Inspect Destination Account
            </Button>
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 4. DIGITAL FOOTPRINT & MERCHANT METADATA GRID                      */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Observable Hardware & Digital Footprint */}
        <Panel
          title="Observable Hardware & Digital Fingerprint"
          subtitle="Hardware markers and telemetry captured during transaction execution."
          padding="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                <Smartphone size={14} style={{ color: 'var(--risk-high)' }} />
                <span>Device Fingerprint:</span>
              </div>
              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {tx.device_id || '—'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                <CreditCard size={14} style={{ color: 'var(--risk-med)' }} />
                <span>Payment Instrument Token:</span>
              </div>
              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {tx.payment_instrument_id || '—'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                <Network size={14} style={{ color: 'var(--accent)' }} />
                <span>IP Address:</span>
              </div>
              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {tx.ip_address || '—'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                <Clock size={14} style={{ color: 'var(--text-dim)' }} />
                <span>Account Age at Execution:</span>
              </div>
              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {tx.account_age_days !== null ? `${tx.account_age_days} days` : '—'}
              </span>
            </div>
          </div>
        </Panel>

        {/* Merchant & Gateway Context */}
        <Panel
          title="Merchant & Gateway Routing"
          subtitle="Merchant categorization and payment channel parameters."
          padding="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                <Store size={14} style={{ color: 'var(--risk-med)' }} />
                <span>Merchant Identifier:</span>
              </div>
              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {tx.merchant_id || 'P2P / Direct Transfer'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Merchant Name:</span>
              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {tx.merchant_name || 'Standard Transfer'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Merchant Category:</span>
              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {tx.merchant_category || 'Financial Intermediation'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '4px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payment Channel:</span>
              <span className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {tx.payment_method || 'Standard Wire / UPI'}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. CONTEXTUAL OBSERVABLE EVIDENCE                                 */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title={`Contextual Observable Evidence (${srcEvidence?.items.length ?? 0})`}
        subtitle="Deterministic evidence rules active on the originating entity node."
        padding="none"
      >
        {!srcEvidence || srcEvidence.items.length === 0 ? (
          <EmptyState
            title="No contextual evidence triggers"
            message="No deterministic evidence rules triggered for the source account of this transaction."
          />
        ) : (
          <DataTable
            columns={evidenceColumns}
            data={srcEvidence.items}
            keyExtractor={(item) => item.evidence_id}
          />
        )}
      </Panel>

      {/* ------------------------------------------------------------------ */}
      {/* 6. RELATED TRANSACTION ACTIVITY FROM SOURCE NODE                  */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        title={`Related Recent Transactions from ${tx.src_account_id}`}
        subtitle="Recent transfer operations executed by the originating entity."
        padding="none"
      >
        {relatedTxs.length === 0 ? (
          <EmptyState
            title="No related transactions"
            message="No additional transactions recorded for this origin account."
          />
        ) : (
          <DataTable
            columns={relatedTxColumns}
            data={relatedTxs}
            keyExtractor={(item) => item.transaction_id}
          />
        )}
      </Panel>

      <SarExportModal isOpen={isSarModalOpen} onClose={() => setIsSarModalOpen(false)} />
    </div>
  );
};
