import React, { useState } from 'react';
import {
  Activity,
  Clock,
  CreditCard,
  Eye,
  Server,
  Users,
  Zap,
} from 'lucide-react';
import type {
  AccountSummary,
  CommunityDetailResponse,
  CommunityEvidenceResponse,
  EvidenceItem,
  TimelineEvent,
} from '../../types/api';
import { Badge, Button, RiskBadge } from '../common';

interface FraudStoryTimelineProps {
  community: CommunityDetailResponse;
  evidence: CommunityEvidenceResponse | null;
  timelineEvents: TimelineEvent[];
  accounts: AccountSummary[];
  onSelectEvidence: (item: EvidenceItem) => void;
}

interface StoryStage {
  id: string;
  stageNumber: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  items: {
    timestamp: string;
    entity: string;
    entityType: 'ACCOUNT' | 'MERCHANT' | 'DEVICE' | 'IP' | 'TRANSACTION';
    description: string;
    amount?: number | null;
    evidenceRule?: string;
    severity?: 'HIGH' | 'MEDIUM' | 'LOW';
    evidenceItem?: EvidenceItem;
  }[];
}

export const FraudStoryTimeline: React.FC<FraudStoryTimelineProps> = ({
  community,
  evidence,
  timelineEvents,
  accounts,
  onSelectEvidence,
}) => {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  // Build the 5 chronological stages from real data
  const stages: StoryStage[] = [
    {
      id: 'onboarding',
      stageNumber: '01',
      title: 'Identity & Account Onboarding',
      subtitle: `${community.member_count} member accounts established within community partition`,
      icon: Users,
      color: '#60a5fa',
      items: accounts.slice(0, 4).map((acc) => ({
        timestamp: acc.creation_date || 'Observed window',
        entity: acc.account_id,
        entityType: 'ACCOUNT',
        description: `Member account registered by ${acc.customer_name || 'Account Holder'}. Initial balance $${acc.balance.toLocaleString()}.`,
        amount: acc.balance,
      })),
    },
    {
      id: 'infrastructure',
      stageNumber: '02',
      title: 'Shared Infrastructure Observed',
      subtitle: `${community.entity_sharing.unique_shared_devices} devices, ${community.entity_sharing.unique_shared_ips} IPs, and ${community.entity_sharing.unique_shared_instruments} payment instruments linked across member accounts`,
      icon: Server,
      color: '#fbbf24',
      items: (evidence?.items || [])
        .filter((ev) => ['SHARED_INSTRUMENT_CONCENTRATION', 'DEVICE_REUSE', 'IP_CONCENTRATION', 'HUB_ACCOUNT'].includes(ev.type))
        .slice(0, 4)
        .map((ev) => ({
          timestamp: ev.observed_at || 'During investigation window',
          entity: ev.supporting_entities[0] || `Community #${community.community_id}`,
          entityType: 'DEVICE',
          description: ev.description,
          evidenceRule: ev.title,
          severity: ev.severity,
          evidenceItem: ev,
        })),
    },
    {
      id: 'velocity',
      stageNumber: '03',
      title: 'Suspicious Velocity & Temporal Spikes',
      subtitle: `Temporal compression score ${community.temporal_statistics.temporal_compression_score.toFixed(2)} with ${community.temporal_statistics.unique_active_hours} active transaction hours`,
      icon: Zap,
      color: '#f87171',
      items: (evidence?.items || [])
        .filter((ev) => ['TEMPORAL_BURST', 'RAPID_INTERACTION', 'HIGH_EVIDENCE_DENSITY'].includes(ev.type))
        .slice(0, 3)
        .map((ev) => ({
          timestamp: ev.observed_at || 'Compressed timeframe',
          entity: ev.supporting_entities[0] || `Community #${community.community_id}`,
          entityType: 'TRANSACTION',
          description: ev.description,
          evidenceRule: ev.title,
          severity: ev.severity,
          evidenceItem: ev,
        })),
    },
    {
      id: 'movement',
      stageNumber: '04',
      title: 'Coordinated Fund Movement & Layering',
      subtitle: `${community.transaction_statistics.tx_per_member.toFixed(1)} average transactions per member totaling $${community.transaction_statistics.total_transaction_amount.toLocaleString()}`,
      icon: Activity,
      color: '#34d399',
      items: timelineEvents.slice(0, 4).map((evt) => ({
        timestamp: evt.timestamp ? new Date(evt.timestamp).toLocaleString() : 'Observed transfer',
        entity: `${evt.src_account_id} → ${evt.dst_account_id}`,
        entityType: 'TRANSACTION',
        description: `Direct transfer of $${evt.amount.toLocaleString()} (Status: ${evt.transaction_status}).`,
        amount: evt.amount,
      })),
    },
    {
      id: 'cashout',
      stageNumber: '05',
      title: 'Merchant Access & Destination Routing',
      subtitle: `${community.entity_sharing.unique_shared_merchants} shared merchant routing channels identified`,
      icon: CreditCard,
      color: '#c084fc',
      items: (evidence?.items || [])
        .filter((ev) => ev.type === 'MERCHANT_TEMPORAL_OVERLAP')
        .slice(0, 3)
        .map((ev) => ({
          timestamp: ev.observed_at || 'Same-day access',
          entity: ev.supporting_entities[0] || 'Merchant Endpoint',
          entityType: 'MERCHANT',
          description: ev.description,
          evidenceRule: ev.title,
          severity: ev.severity,
          evidenceItem: ev,
        })),
    },
  ];

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={16} style={{ color: 'var(--accent)' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>The Suspected Operation Storyline</strong>
            <Badge variant="accent">Chronological Reconstruction</Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Reconstructed stages of network activity from initial account observation to infrastructure reuse and fund movement.
          </p>
        </div>
      </div>

      <div className="inv-story-timeline">
        {stages.map((stage) => {
          const StageIcon = stage.icon;
          const isExpanded = expandedStage === stage.id || expandedStage === null;

          return (
            <div key={stage.id} className="inv-timeline-stage">
              <div
                className="inv-stage-header"
                style={{ cursor: 'pointer' }}
                onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="inv-stage-number">STAGE {stage.stageNumber}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <StageIcon size={14} style={{ color: stage.color }} />
                    <span className="inv-stage-title">{stage.title}</span>
                  </div>
                </div>

                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {stage.subtitle}
                </span>
              </div>

              {isExpanded && stage.items.length > 0 && (
                <div className="inv-stage-events">
                  {stage.items.map((item, idx) => (
                    <div key={idx} className="inv-stage-event-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-dim)', width: '130px', flexShrink: 0 }}>
                          {item.timestamp}
                        </span>

                        <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
                          {item.entity}
                        </span>

                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.description}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {item.severity && <RiskBadge level={item.severity} size="sm" />}
                        {item.amount && (
                          <span className="font-mono" style={{ fontSize: '11px', fontWeight: 600, color: '#34d399' }}>
                            ${item.amount.toLocaleString()}
                          </span>
                        )}
                        {item.evidenceItem && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Eye}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.evidenceItem) onSelectEvidence(item.evidenceItem);
                            }}
                          >
                            View Evidence
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
