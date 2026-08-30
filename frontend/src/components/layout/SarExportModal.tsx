import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ShieldAlert,
  X,
} from 'lucide-react';
import { getCases } from '../../utils/caseManager';

interface SarExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SarExportModal: React.FC<SarExportModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const cases = getCases();

  if (!isOpen) return null;

  const openCases = cases.filter((c) => c.status !== 'CLOSED');

  const reportMarkdown = `# TRACELINE FRAUD INTELLIGENCE | SUSPICIOUS ACTIVITY REPORT (SAR)
Generated: ${new Date().toLocaleString()}
System: TraceLine Neural Graph Risk Platform v1.0
Classification: RESTRICTED // FORENSIC INVESTIGATION DOSSIER
Strict Mode: Observable Graph Evidence Only (Zero Label Leakage)

================================================================================
1. EXECUTIVE THREAT ASSESSMENT
================================================================================
Payment Network Scale:
- Total Observable Accounts: 50,000
- Processed Transaction Volume: 450,546
- Graph Interconnection Edges: 2,617,094
- Detected Partition Communities: 59 Clusters
- High-Risk Prioritization Clusters: 17 Communities (Risk Score ≥ 60/100)
- Watchlist Queue Clusters: 13 Communities (35 ≤ Risk Score < 60)

Primary Observable Anomaly Vectors:
1. Multi-Account Payment Instrument Reuse (Shared Cards / Virtual Funding Tokens)
2. Hardware Fingerprint Clustering (Shared Device Identifiers)
3. Micro-Burst Temporal Transaction Compression (Same-day concurrent execution)
4. Gateway & Issuer Decline Velocity Anomalies

================================================================================
2. ACTIVE INVESTIGATION CASES & TARGET WATCHLIST
================================================================================
Total Active Cases: ${openCases.length}

${
  openCases.length === 0
    ? 'No active cases in queue. Primary triage driven by automated Louvain clustering.'
    : openCases
        .map(
          (c, idx) => `
CASE #${idx + 1}: ${c.title}
Case ID: ${c.id}
Status: ${c.status} | Priority: ${c.priority}
Created: ${c.createdAt} | Updated: ${c.updatedAt}
Targets (${c.targets.length}):
${c.targets.map((t) => `  - [${t.type}] ${t.label} (ID: ${t.id}${t.riskLevel ? `, Risk: ${t.riskLevel}` : ''})`).join('\n')}
Investigator Notes:
  ${c.notes || 'No notes recorded.'}
--------------------------------------------------------------------------------`
        )
        .join('\n')
}

================================================================================
3. INVESTIGATOR ATTESTATION
================================================================================
This report compiles observable relationship topology, device fingerprints, and transaction timing extracted deterministically from network telemetry. All risk tiers represent relative evidence concentration and prioritize manual forensic review.

Analyst Status: SUBMITTED FOR COMPLIANCE & RISK OPERATIONS REVIEW
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(reportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TraceLine_SAR_Dossier_${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        className="dash-card"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          backgroundColor: '#0a1024',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#050a18',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)' }}>
              <ShieldAlert size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
                Generate Forensic SAR Dossier
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                Suspicious Activity Report & Network Evidence Export
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#1e293b',
                border: '1px solid var(--border-light)',
                borderRadius: '4px',
                color: copied ? '#86efac' : 'var(--text-main)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#0284c7',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Download size={13} />
              Export .MD
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Dossier Preview Text Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', backgroundColor: '#030712' }}>
          <pre
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: '#cbd5e1',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {reportMarkdown}
          </pre>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border)',
            backgroundColor: '#050a18',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-dim)',
          }}
        >
          <span>TraceLine Risk Intelligence Compliance Specification // ISO-20022 Aligned</span>
          <span className="font-mono text-cyan-400">STATUS: VERIFIED SECURE</span>
        </div>
      </div>
    </div>
  );
};
