import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Compass,
  Server,
  UserCheck,
} from 'lucide-react';
import type { CommunityDetailResponse, CommunityEvidenceResponse, CommunityGraphResponse } from '../../types/api';
import { Button } from '../common';

interface RecommendedActionsPanelProps {
  community: CommunityDetailResponse;
  evidence?: CommunityEvidenceResponse | null;
  graphData: CommunityGraphResponse | null;
  onFocusAccountInGraph: (accountId: string) => void;
  onScrollToFlow: () => void;
}

export const RecommendedActionsPanel: React.FC<RecommendedActionsPanelProps> = ({
  community,
  graphData,
  onFocusAccountInGraph,
  onScrollToFlow,
}) => {
  const navigate = useNavigate();

  // Find top hub node
  const hubNode = (graphData?.nodes || []).slice().sort((a, b) => b.degree - a.degree)[0];

  const actions = [
    {
      id: 'inspect_hub',
      number: '01',
      title: hubNode ? `Inspect Central Hub Account (${hubNode.id})` : 'Inspect Central Network Entity',
      reason: `Account exhibits the highest degree connectivity (${hubNode?.degree || 0} links) within this partition cluster.`,
      icon: UserCheck,
      actionLabel: 'Inspect Profile',
      onClick: () =>
        hubNode
          ? navigate(`/accounts/${hubNode.id}`, {
              state: {
                fromForensics: true,
                communityId: String(community.community_id),
                forensicView: 'evidence',
              },
            })
          : null,
    },
    {
      id: 'trace_flow',
      number: '02',
      title: 'Trace Multi-Hop Transaction Movement',
      reason: `Total volume of $${community.transaction_statistics.total_transaction_amount.toLocaleString()} moved across internal member accounts.`,
      icon: Activity,
      actionLabel: 'Trace Flow',
      onClick: onScrollToFlow,
    },
    {
      id: 'validate_hardware',
      number: '03',
      title: 'Validate Shared Hardware & Payment Tokens',
      reason: `${community.entity_sharing.unique_shared_devices} shared devices and ${community.entity_sharing.unique_shared_instruments} payment instruments detected.`,
      icon: Server,
      actionLabel: 'Review Links',
      onClick: () => {
        if (hubNode) onFocusAccountInGraph(hubNode.id);
      },
    },
  ];

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={16} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Recommended Next Investigation Actions</strong>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Prioritised operational steps to confirm or rule out fraudulent intent across affected accounts.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        {actions.map((act) => {
          const ActIcon = act.icon;

          return (
            <div
              key={act.id}
              style={{
                padding: '14px 16px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="font-mono" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)' }}>
                    ACTION {act.number}
                  </span>
                  <ActIcon size={14} style={{ color: 'var(--accent)' }} />
                </div>

                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{act.title}</strong>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {act.reason}
                </p>
              </div>

              <Button
                variant="secondary"
                size="sm"
                icon={ArrowRight}
                iconPosition="right"
                onClick={act.onClick}
              >
                {act.actionLabel}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
