import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Smartphone,
  Store,
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px' }}>
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
            Back
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

      {/* Transaction Top Card */}
      <div
        className="dash-card"
        style={{
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: isDeclined ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: isDeclined ? '#ef4444' : '#10b981',
            }}
          >
            {isDeclined ? <XCircle size={28} /> : <CheckCircle2 size={28} />}
          </div>
          <div>
            <span className="font-mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-main)' }}>
              {tx.transaction_id}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '13px', color: 'var(--text-muted)' }}>
              <Clock size={13} />
              <span className="font-mono">{tx.timestamp.replace('T', ' ')}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Amount
            </span>
            <div className="font-mono" style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)' }}>
              ${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <span
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: isDeclined ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: isDeclined ? '#fca5a5' : '#86efac',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
            }}
          >
            {tx.transaction_status}
          </span>
        </div>
      </div>

      {/* Transaction Flow Card */}
      <div className="dash-card" style={{ padding: '20px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '14px' }}>
          Transaction Flow Parties
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '16px' }}>
          {/* Source Account Card */}
          <div
            onClick={() => navigate(`/accounts/${tx.src_account_id}`)}
            style={{
              padding: '16px',
              borderRadius: '6px',
              backgroundColor: '#080c14',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              transition: 'border-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontSize: '11px', color: '#f87171', fontWeight: 600, textTransform: 'uppercase' }}>
              Source (Origin) Account
            </span>
            <span className="font-mono font-bold text-slate-100 text-sm">{tx.src_account_id}</span>
            <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', marginTop: '4px' }}>View account profile →</span>
          </div>

          <ArrowRight size={22} style={{ color: 'var(--text-dim)' }} />

          {/* Destination Account Card */}
          <div
            onClick={() => navigate(`/accounts/${tx.dst_account_id}`)}
            style={{
              padding: '16px',
              borderRadius: '6px',
              backgroundColor: '#080c14',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              transition: 'border-color 0.15s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-cyan)')}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600, textTransform: 'uppercase' }}>
              Destination Account
            </span>
            <span className="font-mono font-bold text-slate-100 text-sm">{tx.dst_account_id}</span>
            <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', marginTop: '4px' }}>View account profile →</span>
          </div>
        </div>
      </div>

      {/* Grid: Merchant Catalog & Device/Footprint Information */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Merchant & Payment */}
        <div className="dash-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <Store size={16} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-main)' }}>
              Merchant & Method
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Merchant ID:</span>
              <span className="font-mono font-semibold text-slate-200">{tx.merchant_id || 'P2P / None'}</span>
            </div>
            {tx.merchant_name && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Merchant Name:</span>
                <span className="font-semibold text-slate-200">{tx.merchant_name}</span>
              </div>
            )}
            {tx.merchant_category && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-dim)' }}>Category:</span>
                <span className="font-semibold text-slate-200">{tx.merchant_category}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Payment Method:</span>
              <span className="font-mono text-slate-200">{tx.payment_method || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Account Age:</span>
              <span className="font-mono text-slate-200">{tx.account_age_days ? `${tx.account_age_days} days` : '—'}</span>
            </div>
          </div>
        </div>

        {/* Digital Footprint */}
        <div className="dash-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <Smartphone size={16} style={{ color: '#38bdf8' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-main)' }}>
              Observable Footprint
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Device ID:</span>
              <span className="font-mono text-slate-200">{tx.device_id || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Payment Instrument ID:</span>
              <span className="font-mono text-slate-200">{tx.payment_instrument_id || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>IP Address:</span>
              <span className="font-mono text-slate-200">{tx.ip_address || '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
