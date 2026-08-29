import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import type { TimelineEvent } from '../../types/api';
import { Badge, Button } from '../common';

interface MoneyMovementFlowProps {
  timelineEvents: TimelineEvent[];
  onFocusAccountInGraph: (accountId: string) => void;
}

export const MoneyMovementFlow: React.FC<MoneyMovementFlowProps> = ({
  timelineEvents,
  onFocusAccountInGraph,
}) => {
  const [activeHopIndex, setActiveHopIndex] = useState<number | null>(null);

  // Derive distinct transfer chain hops from real timeline events
  const flowHops = timelineEvents.slice(0, 5).map((evt, idx) => ({
    hopNumber: idx + 1,
    source: evt.src_account_id,
    target: evt.dst_account_id,
    amount: evt.amount,
    status: evt.transaction_status,
    timestamp: evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : 'Observed',
    merchant: evt.merchant_id,
    paymentMethod: evt.payment_method || 'Electronic Transfer',
    role: idx === 0 ? 'SOURCE ORIGINATOR' : idx === timelineEvents.length - 1 ? 'FINAL RECIPIENT' : 'INTERMEDIARY / RELAY',
  }));

  const handleTraceForward = () => {
    setActiveHopIndex((prev) => (prev === null ? 0 : Math.min(flowHops.length - 1, prev + 1)));
  };

  const handleTraceBackward = () => {
    setActiveHopIndex((prev) => (prev === null ? 0 : Math.max(0, prev - 1)));
  };

  const handleResetTrace = () => {
    setActiveHopIndex(null);
  };

  return (
    <div className="dash-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} style={{ color: '#34d399' }} />
            <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Money Movement & Fund Velocity Flow</strong>
            <Badge variant="accent">Deterministic Flow Chain</Badge>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Multi-hop fund transfer velocity across source accounts, intermediary relays, and destination settlement endpoints.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={handleTraceBackward} disabled={activeHopIndex === 0}>
            Trace Backward
          </Button>
          <Button variant="secondary" size="sm" icon={ChevronRight} onClick={handleTraceForward} disabled={activeHopIndex === flowHops.length - 1}>
            Trace Forward
          </Button>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={handleResetTrace}>
            Full Path
          </Button>
        </div>
      </div>

      {flowHops.length > 0 ? (
        <div className="inv-flow-chain">
          {flowHops.map((hop, idx) => {
            const isSelected = activeHopIndex === null || activeHopIndex === idx;

            return (
              <React.Fragment key={idx}>
                {/* Source Node */}
                <div
                  className={`inv-flow-node ${isSelected ? 'inv-flow-node--active' : ''}`}
                  onClick={() => onFocusAccountInGraph(hop.source)}
                  title="Click to focus account in graph"
                >
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {hop.role}
                  </span>
                  <strong className="font-mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                    {hop.source}
                  </strong>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Method: {hop.paymentMethod}
                  </span>
                </div>

                {/* Transfer Arrow & Amount */}
                <div className="inv-flow-arrow">
                  <span style={{ color: '#34d399', fontSize: '11px', fontWeight: 700 }}>
                    ${hop.amount.toLocaleString()}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--accent)' }}>
                    <span>───</span>
                    <ArrowRight size={12} />
                  </div>
                  <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                    {hop.timestamp}
                  </span>
                </div>

                {/* Destination Node (on last item) */}
                {idx === flowHops.length - 1 && (
                  <div
                    className={`inv-flow-node ${isSelected ? 'inv-flow-node--active' : ''}`}
                    onClick={() => onFocusAccountInGraph(hop.target)}
                    title="Click to focus destination in graph"
                  >
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {hop.merchant ? 'SETTLEMENT MERCHANT' : 'DESTINATION TARGET'}
                    </span>
                    <strong className="font-mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                      {hop.merchant || hop.target}
                    </strong>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Status: {hop.status}
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>
          No peer-to-peer transaction chain observed for this community partition.
        </div>
      )}
    </div>
  );
};
