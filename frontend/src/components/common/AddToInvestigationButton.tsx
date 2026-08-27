import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, ExternalLink } from 'lucide-react';
import type { RiskLevel } from '../../types/api';
import type { TargetType } from '../../types/cases';
import {
  addTargetToCase,
  getOrCreateActiveCase,
  isTargetInAnyCase,
  subscribeToCaseUpdates,
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
    const unsub = subscribeToCaseUpdates(checkStatus);
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
          gap: '5px',
          padding: isSmall ? '3px 8px' : '6px 12px',
          borderRadius: '4px',
          backgroundColor: 'var(--risk-low-bg)',
          border: '1px solid var(--risk-low-border)',
          color: '#86efac',
          fontSize: isSmall ? '11px' : '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.12s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--risk-low-bg)';
        }}
      >
        <Check size={isSmall ? 11 : 13} />
        <span>In Case</span>
        <ExternalLink size={10} style={{ opacity: 0.7 }} />
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
          gap: '5px',
          padding: isSmall ? '3px 8px' : '6px 12px',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontSize: isSmall ? '11px' : '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.12s ease',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
          e.currentTarget.style.borderColor = 'var(--border-light)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
          e.currentTarget.style.borderColor = 'var(--border)';
        }}
      >
        <Plus size={isSmall ? 11 : 13} style={{ color: 'var(--accent)' }} />
        <span>Add to Case</span>
      </button>

      {feedback && (
        <span
          style={{
            position: 'absolute',
            bottom: '-22px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            color: '#86efac',
            padding: '1px 6px',
            borderRadius: '3px',
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
