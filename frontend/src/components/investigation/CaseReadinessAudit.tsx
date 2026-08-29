import React, { useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Square,
} from 'lucide-react';
import { Badge, Button } from '../common';

interface CaseReadinessAuditProps {
  onOpenDossierModal: () => void;
  onOpenSarModal: () => void;
}

export const CaseReadinessAudit: React.FC<CaseReadinessAuditProps> = ({
  onOpenDossierModal,
  onOpenSarModal,
}) => {
  const [checklist, setChecklist] = useState({
    targetIdentified: true,
    riskScoreValidated: true,
    evidenceCollected: true,
    relationshipsReviewed: true,
    transactionPathTraced: true,
    contradictingReviewed: false,
    decisionRecorded: false,
    sarNarrativeReady: true,
  });

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const completedCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = Object.keys(checklist).length;
  const isReady = completedCount >= totalCount - 1;

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardCheck size={16} style={{ color: isReady ? '#34d399' : 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Case Readiness & Filing Audit</strong>
            <Badge variant={isReady ? 'low' : 'med'}>
              {completedCount}/{totalCount} Items Verified
            </Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Ensure all evidence standards, cross-entity relationships, and contradicting hypotheses have been audited before filing.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button variant="secondary" size="sm" icon={FileText} onClick={onOpenSarModal}>
            Generate SAR
          </Button>
          <Button variant="primary" size="sm" icon={Download} onClick={onOpenDossierModal}>
            Export Dossier
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
        {[
          { key: 'targetIdentified', label: 'Primary target entities classified' },
          { key: 'riskScoreValidated', label: 'Ensemble risk score & features validated' },
          { key: 'evidenceCollected', label: 'Deterministic rule triggers collected' },
          { key: 'relationshipsReviewed', label: 'Hardware/IP infrastructure linked' },
          { key: 'transactionPathTraced', label: 'Multi-hop transaction paths verified' },
          { key: 'contradictingReviewed', label: 'Contradicting evidence & false-positive risks reviewed' },
          { key: 'decisionRecorded', label: 'Investigator notes & findings recorded' },
          { key: 'sarNarrativeReady', label: 'Case narrative ready for regulator export' },
        ].map(({ key, label }) => {
          const isChecked = checklist[key as keyof typeof checklist];

          return (
            <div
              key={key}
              onClick={() => toggleCheck(key as keyof typeof checklist)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '12px',
                color: isChecked ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {isChecked ? (
                <CheckCircle2 size={15} style={{ color: '#34d399', flexShrink: 0 }} />
              ) : (
                <Square size={15} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
              )}
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
