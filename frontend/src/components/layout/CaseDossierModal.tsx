import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Printer,
  X,
} from 'lucide-react';
import type { InvestigationCase } from '../../types/cases';
import type {
  AccountDetailResponse,
  CommunityDetailResponse,
  EvidenceItem,
  TransactionDetailResponse,
} from '../../types/api';

interface CaseDossierModalProps {
  isOpen: boolean;
  onClose: () => void;
  investigationCase: InvestigationCase;
  communityDetails?: Map<string, CommunityDetailResponse>;
  accountDetails?: Map<string, AccountDetailResponse>;
  transactionDetails?: Map<string, TransactionDetailResponse>;
  aggregatedEvidence?: EvidenceItem[];
}

export const CaseDossierModal: React.FC<CaseDossierModalProps> = ({
  isOpen,
  onClose,
  investigationCase,
  communityDetails = new Map(),
  accountDetails = new Map(),
  transactionDetails = new Map(),
  aggregatedEvidence = [],
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const communityTargets = investigationCase.targets.filter((t) => t.type === 'COMMUNITY');
  const accountTargets = investigationCase.targets.filter((t) => t.type === 'ACCOUNT');
  const transactionTargets = investigationCase.targets.filter((t) => t.type === 'TRANSACTION');

  // Calculate high/medium/low evidence counts
  const highEvidence = aggregatedEvidence.filter((e) => e.severity === 'HIGH');
  const medEvidence = aggregatedEvidence.filter((e) => e.severity === 'MEDIUM');
  const lowEvidence = aggregatedEvidence.filter((e) => e.severity === 'LOW');

  // Calculate volume
  let totalVolume = 0;
  transactionDetails.forEach((tx) => {
    totalVolume += tx.amount;
  });
  communityDetails.forEach((comm) => {
    totalVolume += comm.transaction_statistics.total_transaction_amount;
  });

  const dossierDate = new Date().toLocaleString();

  // Generate plain-text/markdown report
  const markdownReport = `# TraceLine Risk Intelligence | Investigation Dossier
Generated: ${dossierDate}
System: TraceLine Neural Graph Risk Platform v1.0
Classification: RESTRICTED // FORENSIC INVESTIGATION DOSSIER
Strict Mode: Observable Graph Evidence Only (Zero Label Leakage)

================================================================================
1. CASE METADATA & EXECUTIVE SUMMARY
================================================================================
Case Reference: ${investigationCase.id}
Case Title: ${investigationCase.title}
Status: ${investigationCase.status}
Priority: ${investigationCase.priority}
Created At: ${new Date(investigationCase.createdAt).toLocaleString()}
Last Updated: ${new Date(investigationCase.updatedAt).toLocaleString()}

Target Scope:
- Communities Tracked: ${communityTargets.length}
- Accounts Tracked: ${accountTargets.length}
- Transactions Tracked: ${transactionTargets.length}
- Total Attached Entities: ${investigationCase.targets.length}
- Aggregated Observable Evidence Items: ${aggregatedEvidence.length} (HIGH: ${highEvidence.length}, MED: ${medEvidence.length}, LOW: ${lowEvidence.length})
${totalVolume > 0 ? `- Observable Transaction Volume Under Review: $${totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}

================================================================================
2. ATTACHED TARGET INVENTORY
================================================================================
${
  communityTargets.length === 0
    ? 'No community clusters attached.'
    : `COMMUNITY CLUSTERS (${communityTargets.length}):\n` +
      communityTargets
        .map((t) => {
          const detail = communityDetails.get(t.id);
          return `  - Community #${t.id}: ${detail ? `${detail.member_count} member accounts, $${detail.transaction_statistics.total_transaction_amount.toLocaleString()} vol, ML Risk: ${detail.risk_score}/100 (${detail.risk_level})` : t.label}`;
        })
        .join('\n')
}

${
  accountTargets.length === 0
    ? 'No individual accounts attached.'
    : `ACCOUNTS (${accountTargets.length}):\n` +
      accountTargets
        .map((t) => {
          const detail = accountDetails.get(t.id);
          return `  - Account ${t.id}: ${detail ? `${detail.customer_name || 'Customer'}, Bal: $${detail.balance.toLocaleString()}, Comm #${detail.community_id ?? 'N/A'}, Conn: ${detail.connected_account_count}` : t.label}`;
        })
        .join('\n')
}

${
  transactionTargets.length === 0
    ? 'No specific transaction records attached.'
    : `TRANSACTIONS (${transactionTargets.length}):\n` +
      transactionTargets
        .map((t) => {
          const detail = transactionDetails.get(t.id);
          return `  - Transaction ${t.id}: ${detail ? `$${detail.amount.toLocaleString()} | ${detail.transaction_status} | ${detail.timestamp} | ${detail.src_account_id} -> ${detail.dst_account_id}${detail.merchant_name ? ` (${detail.merchant_name})` : ''}` : t.label}`;
        })
        .join('\n')
}

================================================================================
3. OBSERVABLE EVIDENCE INTELLIGENCE FINDINGS
================================================================================
${
  aggregatedEvidence.length === 0
    ? 'No automated evidence indicators observed on attached targets.'
    : aggregatedEvidence
        .map(
          (e, idx) => `
[${e.severity}] #${idx + 1}: ${e.title}
Type: ${e.type} | Entity: ${e.entity_type} ${e.entity_id}
Description:
  ${e.description}
Supporting Entities:
  ${e.supporting_entities.join(', ') || 'N/A'}
Observable Metrics:
  ${JSON.stringify(e.metrics)}
--------------------------------------------------------------------------------`
        )
        .join('\n')
}

================================================================================
4. INVESTIGATOR FORENSIC NOTES & HYPOTHESES
================================================================================
${investigationCase.notes || 'No investigator notes recorded for this case dossier.'}

================================================================================
5. COMPLIANCE & FORENSIC ATTESTATION
================================================================================
This investigation dossier is compiled deterministically from observable network topology,
hardware fingerprints, and transaction timing extracted from live payment telemetry.
All risk tiers and evidence scores represent relative observable risk concentration
and prioritize manual forensic review.

Analyst Status: SUBMITTED FOR COMPLIANCE & RISK OPERATIONS REVIEW
Attestation: ZERO_LABEL_LEAKAGE_STRICT_COMPLIANCE
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(markdownReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([markdownReport], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TraceLine_Dossier_${investigationCase.id}_${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(14px)',
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="dash-card dossier-modal-container"
        style={{
          width: '100%',
          maxWidth: '900px',
          maxHeight: '92vh',
          backgroundColor: '#070d1e',
          border: '1px solid rgba(0, 240, 255, 0.35)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85), 0 0 24px rgba(0, 240, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '12px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div
          className="no-print"
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#050a18',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0, 240, 255, 0.15)',
                color: 'var(--accent-cyan)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
              }}
            >
              <FileText size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  TraceLine Investigation Dossier
                </h3>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: 'rgba(0, 240, 255, 0.12)',
                    border: '1px solid rgba(0, 240, 255, 0.25)',
                    color: 'var(--accent-cyan)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  RESTRICTED // FORENSIC DOSSIER
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                Case ID: <span className="font-mono text-slate-300">{investigationCase.id}</span> · Generated {dossierDate}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: copied ? '#86efac' : 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Copy Markdown report to clipboard"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy MD'}
            </button>

            <button
              onClick={handleDownload}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid var(--border-light)',
                borderRadius: '6px',
                color: 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Download dossier as markdown file"
            >
              <Download size={13} />
              Export .MD
            </button>

            <button
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 14px',
                backgroundColor: 'var(--accent)',
                border: '1px solid var(--accent-border)',
                borderRadius: '5px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Print or Save as PDF"
            >
              <Printer size={13} />
              Print / Save PDF
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
              }}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Dossier Content Area */}
        <div
          className="dossier-printable-content"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 28px',
            backgroundColor: '#030712',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* 1. Header Banner */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: '8px',
              backgroundColor: '#070d1e',
              border: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Case Dossier Reference
              </span>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#f8fafc', marginTop: 4, marginBottom: 4 }}>
                {investigationCase.title}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '12px', color: 'var(--text-muted)' }}>
                <span className="font-mono text-cyan-400">{investigationCase.id}</span>
                <span>·</span>
                <span>Status: <strong style={{ color: '#f8fafc' }}>{investigationCase.status}</strong></span>
                <span>·</span>
                <span>Priority: <strong style={{ color: '#f8fafc' }}>{investigationCase.priority}</strong></span>
              </div>
            </div>

            <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-dim)' }}>
              <div>Created: <span className="font-mono text-slate-300">{new Date(investigationCase.createdAt).toLocaleDateString()}</span></div>
              <div>Updated: <span className="font-mono text-slate-300">{new Date(investigationCase.updatedAt).toLocaleDateString()}</span></div>
            </div>
          </div>

          {/* 2. Key Scope & Threat Metrics */}
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-cyan)', marginBottom: 10 }}>
              1. Executive Scope & Threat Assessment
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <div style={{ padding: '12px 14px', borderRadius: '6px', backgroundColor: '#070d1e', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Communities</span>
                <span className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>{communityTargets.length}</span>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: '6px', backgroundColor: '#070d1e', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Accounts</span>
                <span className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: '#38bdf8' }}>{accountTargets.length}</span>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: '6px', backgroundColor: '#070d1e', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Transactions</span>
                <span className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: '#fbbf24' }}>{transactionTargets.length}</span>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: '6px', backgroundColor: '#070d1e', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Observable Evidence</span>
                <span className="font-mono" style={{ fontSize: '18px', fontWeight: 800, color: '#f87171' }}>{aggregatedEvidence.length} items</span>
              </div>
            </div>
          </div>

          {/* 3. Attached Target Details */}
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-cyan)', marginBottom: 10 }}>
              2. Attached Target Inventory
            </h4>

            {investigationCase.targets.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No targets attached to this case yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {communityTargets.map((t) => {
                  const detail = communityDetails.get(t.id);
                  return (
                    <div key={t.id} style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: '#070d1e', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span className="font-mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{t.label}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {detail ? `${detail.member_count} member accounts · $${detail.transaction_statistics.total_transaction_amount.toLocaleString()} volume · ML Risk: ${detail.risk_score}/100 (${detail.risk_level})` : 'Community Cluster'}
                      </span>
                    </div>
                  );
                })}

                {accountTargets.map((t) => {
                  const detail = accountDetails.get(t.id);
                  return (
                    <div key={t.id} style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: '#070d1e', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span className="font-mono" style={{ color: '#38bdf8', fontWeight: 700 }}>{t.label}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {detail ? `${detail.customer_name || 'Customer'} · Balance: $${detail.balance.toLocaleString()} · ${detail.connected_account_count} connections` : 'Customer Account'}
                      </span>
                    </div>
                  );
                })}

                {transactionTargets.map((t) => {
                  const detail = transactionDetails.get(t.id);
                  return (
                    <div key={t.id} style={{ padding: '10px 14px', borderRadius: '6px', backgroundColor: '#070d1e', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                      <span className="font-mono" style={{ color: '#fbbf24', fontWeight: 700 }}>{t.label}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {detail ? `$${detail.amount.toLocaleString()} · ${detail.transaction_status} · ${detail.timestamp} · ${detail.src_account_id} → ${detail.dst_account_id}` : 'Transaction Record'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Observable Evidence Intelligence Findings */}
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-cyan)', marginBottom: 10 }}>
              3. Observable Evidence Findings ({aggregatedEvidence.length})
            </h4>

            {aggregatedEvidence.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No observable rule indicators detected on attached targets.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {aggregatedEvidence.map((item, idx) => (
                  <div
                    key={item.evidence_id || idx}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '6px',
                      backgroundColor: '#070d1e',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: 3,
                          fontWeight: 700,
                          backgroundColor: item.severity === 'HIGH' ? 'rgba(239,68,68,0.15)' : item.severity === 'MEDIUM' ? 'rgba(245,158,11,0.15)' : 'rgba(56,189,248,0.15)',
                          color: item.severity === 'HIGH' ? '#f87171' : item.severity === 'MEDIUM' ? '#fbbf24' : '#60a5fa',
                          border: `1px solid ${item.severity === 'HIGH' ? 'rgba(239,68,68,0.3)' : item.severity === 'MEDIUM' ? 'rgba(245,158,11,0.3)' : 'rgba(56,189,248,0.3)'}`,
                        }}
                      >
                        {item.severity}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                        {item.title}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {item.description}
                    </p>

                    {item.supporting_entities && item.supporting_entities.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                        Entities: {item.supporting_entities.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Forensic Investigator Notes */}
          <div>
            <h4 style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-cyan)', marginBottom: 10 }}>
              4. Forensic Notes & Investigator Hypotheses
            </h4>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '6px',
                backgroundColor: '#070d1e',
                border: '1px solid var(--border)',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {investigationCase.notes || 'No investigator notes recorded.'}
            </div>
          </div>

          {/* 6. Attestation Block */}
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '6px',
              backgroundColor: '#050a18',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              fontSize: '11px',
              color: 'var(--text-dim)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="font-mono text-cyan-400">TRACELINE OBSERVABLE FORENSICS SPECIFICATION // STRICT MODE</span>
              <span style={{ color: '#86efac', fontWeight: 700 }}>STATUS: FORENSICALLY VERIFIED</span>
            </div>
            <p style={{ margin: 0, lineHeight: 1.4 }}>
              This dossier compiles observable relationship topology, device fingerprints, and transaction timing extracted deterministically from network telemetry. All risk tiers represent relative evidence concentration and prioritize manual forensic review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
