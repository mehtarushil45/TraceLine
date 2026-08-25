import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, ExternalLink } from 'lucide-react';
import type { RiskLevel } from '../../types/api';
import type { TargetType } from '../../types/cases';
import {
  addTargetToCase,
  getOrCreateActiveCase,
  isTargetInAnyCase,
  useCaseWatcher,
} from '../../utils/caseManager';

interface AddToInvestigationButtonProps {
  targetType: TargetType;
  targetId: string;
  targetLabel: string;
  riskScore?: number | null;
  riskLevel?: RiskLevel | null;
  size?: 'sm' | 'md';
}

export const AddToInvestigationButton: React.FC<AddToInvestigationButtonProps> = ({
  targetType,
  targetId,
  targetLabel,
  riskScore,
  riskLevel,
  size = 'md',
}) => {
  const navigate = useNavigate();
  const [inCaseInfo, setInCaseInfo] = useState<{ inCase: boolean; caseId?: string; caseTitle?: string }>({
    inCase: false,
  });
  const [feedback, setFeedback] = useState<string | null>(null);

  const checkStatus = () => {
    setInCaseInfo(isTargetInAnyCase(targetType, targetId));
  };

  useEffect(() => {
    checkStatus();
    const unsub = useCaseWatcher(checkStatus);
    return unsub;
  }, [targetType, targetId]);

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (inCaseInfo.inCase && inCaseInfo.caseId) {
      navigate(`/investigations/${inCaseInfo.caseId}`);
      return;
    }

    const activeCase = getOrCreateActiveCase({
      type: targetType,
      id: targetId,
      label: targetLabel,
      riskScore: riskScore ?? null,
      riskLevel: riskLevel ?? null,
      addedAt: new Date().toISOString(),
    });

    const added = addTargetToCase(activeCase.id, {
      type: targetType,
      id: targetId,
      label: targetLabel,
      riskScore: riskScore ?? null,
      riskLevel: riskLevel ?? null,
      addedAt: new Date().toISOString(),
    });

    if (added || inCaseInfo.inCase) {
      setFeedback('Added to Case');
      setTimeout(() => setFeedback(null), 2500);
      checkStatus();
    }
  };

  const isSmall = size === 'sm';

  if (inCaseInfo.inCase) {
    return (
      <button
        onClick={handleAdd}
        title={`View in ${inCaseInfo.caseTitle || 'active investigation'}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: isSmall ? '4px 10px' : '7px 14px',
          borderRadius: '6px',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          color: '#86efac',
          fontSize: isSmall ? '11px' : '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.12)';
        }}
      >
        <Check size={isSmall ? 12 : 14} />
        <span>In Investigation</span>
        <ExternalLink size={11} style={{ opacity: 0.7 }} />
      </button>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        onClick={handleAdd}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: isSmall ? '4px 10px' : '7px 14px',
          borderRadius: '6px',
          backgroundColor: '#1e293b',
          border: '1px solid var(--border-light)',
          color: 'var(--text-main)',
          fontSize: isSmall ? '11px' : '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = '#334155';
          e.currentTarget.style.borderColor = 'var(--accent-cyan)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = '#1e293b';
          e.currentTarget.style.borderColor = 'var(--border-light)';
        }}
      >
        <Plus size={isSmall ? 12 : 14} style={{ color: 'var(--accent-cyan)' }} />
        <span>Add to Investigation</span>
      </button>

      {feedback && (
        <span
          style={{
            position: 'absolute',
            bottom: '-24px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#0f172a',
            border: '1px solid var(--border-light)',
            color: '#86efac',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
            zIndex: 20,
          }}
        >
          {feedback}
        </span>
      )}
    </div>
  );
};
