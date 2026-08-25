import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Smartphone,
  Store,
  User,
  XCircle,
} from 'lucide-react';
import { getTransaction } from '../api';
import type { TransactionDetailResponse } from '../types/api';
import { AddToInvestigationButton } from '../components/common/AddToInvestigationButton';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';

export const TransactionDetailPage: React.FC = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();

  const [tx, setTx] = useState<TransactionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) return;

    const fetchTx = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getTransaction(transactionId);
        setTx(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Transaction '${transactionId}' not found`);
      } finally {
        setLoading(false);
      }
    };

    fetchTx();
  }, [transactionId]);

  if (loading) {
    return <LoadingSkeleton type="detail" />;
  }

  if (error || !tx) {
    return <ErrorState message={error || undefined} onRetry={() => navigate('/transactions')} />;
  }

  const isDeclined = tx.transaction_status.toLowerCase() === 'declined';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1080px' }}>
      {/* Breadcrumb & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-dim)' }}>
          <button
            onClick={() => navigate(-1)}
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
            Transactions
          </button>
          <span>/</span>
          <span className="font-mono text-slate-200">{tx.transaction_id}</span>
        </div>

        <AddToInvestigationButton
          targetType="TRANSACTION"
          targetId={tx.transaction_id}
          targetLabel={`Transaction ${tx.transaction_id} ($${tx.amount.toFixed(2)})`}
        />
      </div>

      {/* Transaction Top Hero Card */}
      <div
        className="dash-card"
        style={{
          padding: '26px 30px',
          backgroundColor: '#070d1e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              backgroundColor: isDeclined ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: isDeclined ? '#f43f5e' : '#10b981',
              boxShadow: isDeclined ? '0 0 16px rgba(244, 63, 94, 0.25)' : '0 0 16px rgba(16, 185, 129, 0.2)',
            }}
          >
            {isDeclined ? <XCircle size={30} /> : <CheckCircle2 size={30} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 className="font-mono" style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                {tx.transaction_id}
              </h1>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: '4px',
                  backgroundColor: isDeclined ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  border: `1px solid ${isDeclined ? 'rgba(244, 63, 94, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                  color: isDeclined ? '#fca5a5' : '#86efac',
                  fontSize: '11px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                }}
              >
                {tx.transaction_status.toUpperCase()}
              </span>
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
              Processed: {new Date(tx.timestamp).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Amount Pill */}
        <div
          style={{
            padding: '12px 22px',
            borderRadius: '8px',
            backgroundColor: '#030712',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
          }}
        >
          <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Settlement Amount
          </span>
          <span className="font-mono" style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc' }}>
            ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Money Flow Architecture Diagram */}
      <div className="dash-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: '16px' }}>
          Payment Gateway Transfer Flow
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'center' }}>
          {/* Origin Account */}
          <div
            onClick={() => navigate(`/accounts/${tx.src_account_id}`)}
            style={{
              padding: '16px 18px',
              borderRadius: '8px',
              backgroundColor: '#070d1e',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Source Account (Origin)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <User size={16} style={{ color: 'var(--accent-cyan)' }} />
              <span className="font-mono font-bold text-slate-100">{tx.src_account_id}</span>
            </div>
          </div>

          {/* Destination Account */}
          <div
            onClick={() => navigate(`/accounts/${tx.dst_account_id}`)}
            style={{
              padding: '16px 18px',
              borderRadius: '8px',
              backgroundColor: '#070d1e',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Destination Account (Beneficiary)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <User size={16} style={{ color: '#34d399' }} />
              <span className="font-mono font-bold text-slate-100">{tx.dst_account_id}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Digital Footprint & Telemetry Matrix */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Merchant & Gateway Data */}
        <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <Store size={16} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#f8fafc' }}>
              Merchant Context
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Merchant ID:</span>
              <span className="font-mono font-semibold text-slate-200">{tx.merchant_id || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Merchant Name:</span>
              <span className="font-mono font-semibold text-slate-200">{tx.merchant_name || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Merchant Category:</span>
              <span className="font-mono font-semibold text-slate-200">{tx.merchant_category || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payment Method:</span>
              <span className="font-mono font-semibold text-slate-200">{tx.payment_method || 'TRANSFER'}</span>
            </div>
          </div>
        </div>

        {/* Device & Observable Digital Footprint */}
        <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
            <Smartphone size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#f8fafc' }}>
              Observable Digital Footprint
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Device Fingerprint ID:</span>
              <span className="font-mono font-semibold text-cyan-300">{tx.device_id || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payment Instrument Token:</span>
              <span className="font-mono font-semibold text-amber-300">{tx.payment_instrument_id || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>IP Address:</span>
              <span className="font-mono font-semibold text-purple-300">{tx.ip_address || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
