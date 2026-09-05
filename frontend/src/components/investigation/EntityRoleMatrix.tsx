import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, ScanSearch, Users } from 'lucide-react';
import type { CommunityGraphResponse, TimelineEvent } from '../../types/api';
import { Badge, Button } from '../common';

interface EntityRoleMatrixProps {
  graphData: CommunityGraphResponse | null;
  timelineEvents: TimelineEvent[];
  onFocusAccountInGraph: (accountId: string) => void;
  communityId?: number | string;
}

interface ClassifiedEntity {
  id: string;
  role: 'PRIMARY HUB' | 'INTERMEDIARY' | 'SOURCE' | 'MERCHANT' | 'MEMBER';
  name: string;
  metric: string;
  evidenceContext: string;
  roleVariant: 'high' | 'med' | 'accent' | 'neutral';
}

export const EntityRoleMatrix: React.FC<EntityRoleMatrixProps> = ({
  graphData,
  timelineEvents,
  onFocusAccountInGraph,
  communityId,
}) => {
  const navigate = useNavigate();

  const nodes = graphData?.nodes || [];

  // Sort entities deterministically by connectivity (degree), balance, and ID so the primary hubs remain consistent
  const sortedNodes = [...nodes].sort((a, b) => (b.degree - a.degree) || ((b.balance ?? 0) - (a.balance ?? 0)) || a.id.localeCompare(b.id));
  const classifiedEntities: ClassifiedEntity[] = sortedNodes.slice(0, 6).map((node) => {
    const isHub = node.degree >= 4;
    const isSource = timelineEvents.some((t) => t.src_account_id === node.id);
    const isRecipient = timelineEvents.some((t) => t.dst_account_id === node.id);

    let role: ClassifiedEntity['role'] = 'MEMBER';
    let roleVariant: ClassifiedEntity['roleVariant'] = 'neutral';
    let evidenceContext = 'Standard partition member';

    if (isHub) {
      role = 'PRIMARY HUB';
      roleVariant = 'high';
      evidenceContext = `High internal connectivity (${node.degree} links)`;
    } else if (isSource && isRecipient) {
      role = 'INTERMEDIARY';
      roleVariant = 'med';
      evidenceContext = 'Observed receiving and forwarding funds';
    } else if (isSource) {
      role = 'SOURCE';
      roleVariant = 'accent';
      evidenceContext = 'Initiates peer fund transfers';
    }

    return {
      id: node.id,
      role,
      name: node.customer_name || 'Account Holder',
      metric: `${node.degree} links · $${node.balance ? node.balance.toLocaleString() : '0'} balance`,
      evidenceContext,
      roleVariant,
    };
  });

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={16} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Entity Role Classification</strong>
            <Badge variant="accent">Investigative Taxonomy</Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Evidence-based role classification differentiating hubs, intermediaries, sources, and settlement endpoints.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
        {classifiedEntities.map((ent) => (
          <div
            key={ent.id}
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
              <Badge variant={ent.roleVariant} size="sm" style={{ flexShrink: 0 }}>
                {ent.role}
              </Badge>
              <span
                className="font-mono"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-dim)',
                  textAlign: 'right',
                  lineHeight: 1.3,
                  flexShrink: 1,
                  whiteSpace: 'normal',
                }}
              >
                {ent.metric}
              </span>
            </div>

            <div>
              <strong className="font-mono" style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'block' }}>
                {ent.id}
              </strong>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ent.name}</span>
            </div>

            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {ent.evidenceContext}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <Button
                variant="secondary"
                size="sm"
                icon={ScanSearch}
                onClick={() => onFocusAccountInGraph(ent.id)}
              >
                Focus in Graph
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={ExternalLink}
                onClick={() =>
                  navigate(`/accounts/${ent.id}`, {
                    state: {
                      fromForensics: true,
                      communityId: communityId ? String(communityId) : undefined,
                      forensicView: 'accounts',
                    },
                  })
                }
              >
                Profile
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
