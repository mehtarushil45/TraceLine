import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  X,
} from 'lucide-react';
import {
  exitPlaybook,
  getPlaybookContext,
  PLAYBOOK_STEPS,
  updatePlaybookStep,
  usePlaybookWatcher,
  type PlaybookContext,
} from '../../utils/playbookManager';

export const InvestigationPlaybookBanner: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [ctx, setCtx] = useState<PlaybookContext>(getPlaybookContext());

  const loadCtx = () => {
    setCtx(getPlaybookContext());
  };

  useEffect(() => {
    loadCtx();
    const unsub = usePlaybookWatcher(loadCtx);
    return unsub;
  }, []);

  // Sync step based on current route
  useEffect(() => {
    if (!ctx.isActive) return;

    const path = location.pathname;
    let detectedStep: number | null = null;

    if (path.startsWith('/communities/')) {
      // Check if on graph tab or main
      const state = location.state as { tab?: string } | null;
      if (state?.tab === 'graph') {
        detectedStep = 3;
      } else {
        detectedStep = ctx.currentStep === 2 ? 2 : 1;
      }
    } else if (path.startsWith('/accounts/')) {
      detectedStep = 4;
    } else if (path.startsWith('/transactions/')) {
      detectedStep = 5;
    } else if (path.startsWith('/investigations/')) {
      detectedStep = ctx.currentStep === 7 ? 7 : 6;
    }

    if (detectedStep !== null && detectedStep !== ctx.currentStep) {
      updatePlaybookStep(detectedStep);
    }
  }, [location.pathname, location.state, ctx.isActive]);

  if (!ctx.isActive) return null;

  const currentDef = PLAYBOOK_STEPS.find((s) => s.step === ctx.currentStep) || PLAYBOOK_STEPS[0];
  const canGoPrev = ctx.currentStep > 1;
  const canGoNext = ctx.currentStep < 7;

  const handleStepClick = (stepNum: number) => {
    const stepDef = PLAYBOOK_STEPS.find((s) => s.step === stepNum);
    if (!stepDef) return;

    updatePlaybookStep(stepNum);

    // Route based on step
    if (stepNum === 1) {
      navigate(`/communities/${ctx.communityId || 3}`);
    } else if (stepNum === 2) {
      navigate(`/communities/${ctx.communityId || 3}`);
      setTimeout(() => {
        document.getElementById('community-graph-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (stepNum === 3) {
      navigate(`/communities/${ctx.communityId || 3}`, { state: { tab: 'graph' } });
    } else if (stepNum === 4) {
      navigate(`/accounts/${ctx.accountId || 'acc_100'}`);
    } else if (stepNum === 5) {
      navigate(`/transactions/${ctx.transactionId || 'tx_7517'}`);
    } else if (stepNum === 6 || stepNum === 7) {
      navigate(ctx.caseId ? `/investigations/${ctx.caseId}` : '/investigations');
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      handleStepClick(ctx.currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (canGoPrev) {
      handleStepClick(ctx.currentStep - 1);
    }
  };

  const handleExit = () => {
    exitPlaybook();
  };

  return (
    <div
      style={{
        marginBottom: '20px',
        borderRadius: '10px',
        backgroundColor: '#070d1e',
        border: '1px solid rgba(0, 240, 255, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 240, 255, 0.12)',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Top Header Row */}
      <div
        style={{
          padding: '10px 18px',
          backgroundColor: '#050a18',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid rgba(0, 240, 255, 0.3)',
              color: 'var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.06em',
            }}
          >
            <Compass size={13} className="animate-spin-slow" />
            <span>INVESTIGATION PLAYBOOK</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}>
            <span style={{ color: '#f8fafc', fontWeight: 700 }}>
              Step {ctx.currentStep} of 7: {currentDef.label}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>—</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
              {currentDef.description}
            </span>
          </div>
        </div>

        {/* Right side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Active Target Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginRight: 6 }}>
            {ctx.communityId && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: 'rgba(0,240,255,0.1)',
                  border: '1px solid rgba(0,240,255,0.25)',
                  color: 'var(--accent-cyan)',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                }}
                title="Active Community Context"
              >
                Comm #{ctx.communityId}
              </span>
            )}
            {ctx.accountId && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: 'rgba(56,189,248,0.1)',
                  border: '1px solid rgba(56,189,248,0.25)',
                  color: '#38bdf8',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                }}
                title="Active Account Context"
              >
                {ctx.accountId}
              </span>
            )}
            {ctx.transactionId && (
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  color: '#fbbf24',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                }}
                title="Active Transaction Context"
              >
                {ctx.transactionId}
              </span>
            )}
          </div>

          <button
            onClick={handlePrev}
            disabled={!canGoPrev}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 4,
              backgroundColor: canGoPrev ? '#1e293b' : 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border-light)',
              color: canGoPrev ? '#f8fafc' : 'var(--text-dim)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: canGoPrev ? 'pointer' : 'not-allowed',
            }}
          >
            <ArrowLeft size={12} />
            Prev
          </button>

          <button
            onClick={handleNext}
            disabled={!canGoNext}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 4,
              backgroundColor: canGoNext ? '#0284c7' : 'rgba(255,255,255,0.04)',
              border: 'none',
              color: canGoNext ? '#fff' : 'var(--text-dim)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: canGoNext ? 'pointer' : 'not-allowed',
            }}
          >
            Next Step
            <ArrowRight size={12} />
          </button>

          <button
            onClick={handleExit}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '4px 8px',
              borderRadius: 4,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-dim)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
            title="Exit Playbook"
          >
            <X size={12} />
            Exit
          </button>
        </div>
      </div>

      {/* Stepper Track */}
      <div
        style={{
          padding: '12px 18px',
          backgroundColor: '#030712',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          overflowX: 'auto',
        }}
      >
          {PLAYBOOK_STEPS.map((step, idx) => {
            const isCompleted = ctx.completedSteps.includes(step.step);
            const isCurrent = ctx.currentStep === step.step;
            const isPast = step.step < ctx.currentStep;

            return (
              <React.Fragment key={step.step}>
                {/* Step Item */}
                <button
                  onClick={() => handleStepClick(step.step)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: isCurrent ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                    border: isCurrent ? '1px solid rgba(0, 240, 255, 0.4)' : '1px solid transparent',
                    color: isCurrent ? 'var(--accent-cyan)' : isCompleted ? '#f8fafc' : 'var(--text-dim)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                  title={`${step.label}: ${step.description}`}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: isCurrent ? 'var(--accent-cyan)' : isCompleted ? '#10b981' : '#1e293b',
                      color: isCurrent ? '#030712' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {isCompleted && !isCurrent ? <Check size={11} /> : step.step}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: isCurrent ? 800 : isCompleted ? 600 : 400 }}>
                    {step.shortLabel}
                  </span>
                </button>

                {/* Connector line between steps */}
                {idx < PLAYBOOK_STEPS.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      minWidth: '16px',
                      height: 2,
                      backgroundColor: isPast ? '#10b981' : isCurrent ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                      margin: '0 4px',
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
    </div>
  );
};
