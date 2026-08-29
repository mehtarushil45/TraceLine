import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Download,
  FileText,
  Plus,
} from 'lucide-react';
import type { CasePriority, CaseStatus, InvestigationCase } from '../../types/cases';
import { Badge, Button, RiskBadge } from '../common';

interface InvestigationCommandBarProps {
  investigationCase: InvestigationCase;
  primaryCommunityId?: number | string | null;
  riskLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  onStatusChange: (status: CaseStatus) => void;
  onPriorityChange?: (priority: CasePriority) => void;
  onOpenDossierModal: () => void;
  onOpenSarModal: () => void;
  onOpenAddTarget: () => void;
}

export const InvestigationCommandBar: React.FC<InvestigationCommandBarProps> = ({
  investigationCase,
  primaryCommunityId,
  riskLevel = 'HIGH',
  onStatusChange,
  onPriorityChange,
  onOpenDossierModal,
  onOpenSarModal,
  onOpenAddTarget,
}) => {
  const navigate = useNavigate();

  return (
    <div className="inv-command-bar">
      <div className="inv-command-left">
        <button
          type="button"
          className="inv-command-back"
          onClick={() => navigate('/')}
          title="Return to Risk Queue"
        >
          <ArrowLeft size={13} />
          <span>Risk Queue</span>
        </button>

        <span style={{ color: 'var(--border)' }}>|</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Briefcase size={14} style={{ color: 'var(--accent)' }} />
          <span className="inv-command-id">{investigationCase.title}</span>
        </div>

        {primaryCommunityId && (
          <Badge variant="neutral">
            Community #{primaryCommunityId}
          </Badge>
        )}

        <RiskBadge level={riskLevel} size="sm" />

        {/* Status Dropdown */}
        <select
          value={investigationCase.status}
          onChange={(e) => onStatusChange(e.target.value as CaseStatus)}
          style={{
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="OPEN">STATUS: OPEN</option>
          <option value="REVIEW">STATUS: IN REVIEW</option>
          <option value="CLOSED">STATUS: RESOLVED</option>
        </select>

        {/* Priority Dropdown */}
        {onPriorityChange && (
          <select
            value={investigationCase.priority}
            onChange={(e) => onPriorityChange(e.target.value as CasePriority)}
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="HIGH">PRIORITY: HIGH</option>
            <option value="MEDIUM">PRIORITY: MEDIUM</option>
            <option value="LOW">PRIORITY: LOW</option>
          </select>
        )}
      </div>

      <div className="inv-command-actions">
        <Button
          variant="secondary"
          size="sm"
          icon={Plus}
          onClick={onOpenAddTarget}
        >
          Add Target
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={FileText}
          onClick={onOpenSarModal}
        >
          Generate SAR
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={Download}
          onClick={onOpenDossierModal}
        >
          Export Case Dossier
        </Button>
      </div>
    </div>
  );
};
