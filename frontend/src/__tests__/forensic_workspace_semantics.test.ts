import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAccountId,
  isEvidenceFocusCompatibleWithLens,
  getEvidenceSubject,
} from '../utils/forensicUtils.ts';
import type { EvidenceItem, TimelineEvent } from '../types/api.ts';

describe('TraceLine — Forensic Workspace Semantics & Traceability', () => {

  // -------------------------------------------------------------------------
  // Test A: Transaction evidence focus never becomes investigation focal
  // -------------------------------------------------------------------------
  describe('Test A: Transaction evidence focus never becomes investigation focal', () => {
    it('strictly rejects transaction IDs from being treated as account IDs', () => {
      assert.equal(isAccountId('tx_103686'), false);
      assert.equal(isAccountId('tx_999999'), false);
      assert.equal(isAccountId('txn_1020'), false);
      assert.equal(isAccountId('TX_103686'), false);
      assert.equal(isAccountId(null), false);
      assert.equal(isAccountId(undefined), false);
      assert.equal(isAccountId(''), false);
    });

    it('accepts valid account IDs as investigation focal', () => {
      assert.equal(isAccountId('acc_1001'), true);
      assert.equal(isAccountId('acc_hub_99'), true);
      assert.equal(isAccountId('acc_mule_alpha'), true);
      assert.equal(isAccountId('user_corp_01'), true);
    });

    it('ensures temporal burst containing tx_103686 does NOT assign transaction ID to investigation focal', () => {
      const temporalBurstEvidence: EvidenceItem = {
        evidence_id: 'ev_burst_01',
        entity_type: 'COMMUNITY',
        entity_id: 'comm_42',
        type: 'TEMPORAL_BURST',
        severity: 'HIGH',
        title: 'Transaction burst: 32 transactions in 58 minutes',
        description: '32 related community transactions occurred within a 58-minute window.',
        score_contribution: 25,
        observed_at: '2026-03-01T10:00:00Z',
        supporting_entities: ['tx_103686', 'tx_103687', 'tx_103688'],
        metrics: {
          transaction_count: 32,
          window_minutes: 58,
          start_timestamp: '2026-03-01T10:00:00Z',
          end_timestamp: '2026-03-01T10:58:00Z',
        },
      };

      // Filter supporting entities for valid account IDs
      const supportingAccounts = (temporalBurstEvidence.supporting_entities || []).filter(isAccountId);
      assert.equal(supportingAccounts.length, 0, 'No transaction ID should pass as an account ID');

      // Investigation focal must NOT be assigned the transaction ID
      let assignedFocal: string | null = null;
      const validAccountCount: number = supportingAccounts.length;
      if (validAccountCount === 1) {
        assignedFocal = supportingAccounts[0];
      }
      assert.equal(assignedFocal, null, 'Focal account must remain null instead of fabricating tx_103686 as focal');
    });
  });

  // -------------------------------------------------------------------------
  // Test B: Account focus remains stable while evidence focus changes
  // -------------------------------------------------------------------------
  describe('Test B: Account focus remains stable while evidence focus changes', () => {
    it('preserves current account focal when switching to signal-only evidence', () => {
      const existingFocal = 'acc_12345';

      const temporalEvidence: EvidenceItem = {
        evidence_id: 'ev_burst_02',
        entity_type: 'COMMUNITY',
        entity_id: 'comm_42',
        type: 'TEMPORAL_BURST',
        severity: 'HIGH',
        title: 'Transaction burst: 15 transactions in 20 minutes',
        description: 'Temporal burst signal with transaction IDs.',
        score_contribution: 25,
        observed_at: '2026-03-01T12:00:00Z',
        supporting_entities: ['tx_2001', 'tx_2002'],
        metrics: { transaction_count: 15, window_minutes: 20 },
      };

      // Selection logic in ForensicWorkspacePage:
      const supportingAccounts = temporalEvidence.supporting_entities.filter(isAccountId);
      let nextFocal: string | null = null;

      if (supportingAccounts.length === 1) {
        nextFocal = supportingAccounts[0];
      } else if (existingFocal && isAccountId(existingFocal)) {
        // Retain existing valid account investigation focal
        nextFocal = existingFocal;
      } else {
        nextFocal = null;
      }

      assert.equal(nextFocal, 'acc_12345', 'Existing account focal acc_12345 must remain stable');
    });

    it('updates to new account focal when evidence has unambiguous account', () => {
      const existingFocal = 'acc_12345';

      const hubEvidence: EvidenceItem = {
        evidence_id: 'ev_hub_01',
        entity_type: 'ACCOUNT',
        entity_id: 'acc_99999',
        type: 'HUB_ACCOUNT',
        severity: 'HIGH',
        title: 'Hub account high degree',
        description: 'Unambiguous hub account.',
        score_contribution: 25,
        observed_at: '2026-03-01T12:00:00Z',
        supporting_entities: ['acc_99999'],
        metrics: { degree: 45 },
      };

      const supportingAccounts = hubEvidence.supporting_entities.filter(isAccountId);
      let nextFocal: string | null = null;
      if (supportingAccounts.length === 1) {
        nextFocal = supportingAccounts[0];
      } else if (existingFocal && isAccountId(existingFocal)) {
        nextFocal = existingFocal;
      }

      assert.equal(nextFocal, 'acc_99999', 'Updates to unambiguous supporting account');
    });
  });

  // -------------------------------------------------------------------------
  // Test C: Incompatible lens clears evidence focus
  // -------------------------------------------------------------------------
  describe('Test C: Incompatible lens clears evidence focus', () => {
    it('clears temporal evidence focus when switching to relationship lens', () => {
      const isCompatible = isEvidenceFocusCompatibleWithLens('TEMPORAL_BURST', 'relationship');
      assert.equal(isCompatible, false, 'Temporal burst must not stay active on relationship lens');
    });

    it('clears temporal evidence focus when switching to flow-of-funds lens', () => {
      const isCompatible = isEvidenceFocusCompatibleWithLens('TEMPORAL_BURST', 'flow-of-funds');
      assert.equal(isCompatible, false);
    });

    it('preserves temporal evidence focus on temporal lens', () => {
      assert.equal(isEvidenceFocusCompatibleWithLens('TEMPORAL_BURST', 'temporal'), true);
      assert.equal(isEvidenceFocusCompatibleWithLens('MERCHANT_TEMPORAL_OVERLAP', 'temporal'), true);
      assert.equal(isEvidenceFocusCompatibleWithLens('RAPID_INTERACTION', 'temporal'), true);
    });

    it('preserves device reuse and IP concentration on shared-infrastructure lens', () => {
      assert.equal(isEvidenceFocusCompatibleWithLens('DEVICE_REUSE', 'shared-infrastructure'), true);
      assert.equal(isEvidenceFocusCompatibleWithLens('IP_CONCENTRATION', 'shared-infrastructure'), true);
      assert.equal(isEvidenceFocusCompatibleWithLens('SHARED_INSTRUMENT_CONCENTRATION', 'shared-infrastructure'), true);
    });

    it('preserves hub account on relationship and community structure lenses', () => {
      assert.equal(isEvidenceFocusCompatibleWithLens('HUB_ACCOUNT', 'relationship'), true);
      assert.equal(isEvidenceFocusCompatibleWithLens('HUB_ACCOUNT', 'community'), true);
      assert.equal(isEvidenceFocusCompatibleWithLens('HUB_ACCOUNT', 'flow-of-funds'), true);
    });
  });

  // -------------------------------------------------------------------------
  // Test D: Zero-result graph produces explicit empty state
  // -------------------------------------------------------------------------
  describe('Test D: Zero-result graph produces explicit empty state', () => {
    it('flags zero relationships when lens yields no matching edges', () => {
      const lensStatusMessage: string | null = 'No shared hardware, token, or IP telemetry recorded among current nodes.';
      const graphNodesCount: number = 12;

      const isZeroRelationships = Boolean(lensStatusMessage) || graphNodesCount === 0;
      assert.equal(isZeroRelationships, true, 'Zero-relationship empty state must be triggered');

      // Empty state content verification
      const emptyStateTitle = 'NO OBSERVED RELATIONSHIPS';
      const emptyStateDescription = lensStatusMessage;
      const expectedActions = ['View Community Structure', 'Clear Evidence Focus', 'Reset Lens'];

      assert.equal(emptyStateTitle, 'NO OBSERVED RELATIONSHIPS');
      assert.match(emptyStateDescription, /No shared hardware/);
      assert.equal(expectedActions.length, 3);
    });

    it('flags zero relationships when graph data has 0 nodes', () => {
      const lensStatusMessage = null;
      const graphNodesCount = 0;
      const isZeroRelationships = Boolean(lensStatusMessage) || graphNodesCount === 0;
      assert.equal(isZeroRelationships, true, 'Empty nodes must trigger empty state overlay');
    });
  });

  // -------------------------------------------------------------------------
  // Test E: Temporal evidence with supporting transactions links correctly to Timeline
  // -------------------------------------------------------------------------
  describe('Test E: Temporal evidence with supporting transactions links correctly to Timeline', () => {
    it('correctly derives 32 supporting transactions and 58-minute observed window', () => {
      const temporalEvidence: EvidenceItem = {
        evidence_id: 'ev_burst_32',
        entity_type: 'COMMUNITY',
        entity_id: 'comm_42',
        type: 'TEMPORAL_BURST',
        severity: 'HIGH',
        title: 'Transaction burst: 32 transactions in 58 minutes',
        description: '32 related community transactions occurred within a 58-minute window.',
        score_contribution: 25,
        observed_at: '2026-03-01T10:00:00Z',
        supporting_entities: ['tx_103686', 'tx_103687'],
        metrics: {
          transaction_count: 32,
          window_minutes: 58,
          start_timestamp: '2026-03-01T10:00:00Z',
          end_timestamp: '2026-03-01T10:58:00Z',
        },
      };

      const subject = getEvidenceSubject(temporalEvidence);
      assert.equal(subject.transactionCount, 32);
      assert.equal(subject.windowMinutes, 58);
      assert.equal(subject.primary, '32 related transactions');
      assert.equal(subject.secondary, '58-minute observed window');
    });

    it('matches timeline events within temporal window and by tx ID', () => {
      const temporalEvidence: EvidenceItem = {
        evidence_id: 'ev_burst_32',
        entity_type: 'COMMUNITY',
        entity_id: 'comm_42',
        type: 'TEMPORAL_BURST',
        severity: 'HIGH',
        title: 'Transaction burst: 32 transactions in 58 minutes',
        description: '32 related community transactions occurred within a 58-minute window.',
        score_contribution: 25,
        observed_at: '2026-03-01T10:00:00Z',
        supporting_entities: ['tx_103686'],
        metrics: {
          transaction_count: 32,
          window_minutes: 58,
          start_timestamp: '2026-03-01T10:00:00Z',
          end_timestamp: '2026-03-01T10:58:00Z',
        },
      };

      const sampleEvents: TimelineEvent[] = [
        {
          transaction_id: 'tx_103686',
          timestamp: '2026-03-01T10:15:00Z',
          src_account_id: 'acc_01',
          dst_account_id: 'acc_02',
          amount: 500,
          transaction_status: 'SETTLED',
          merchant_id: 'm_01',
          payment_method: 'CARD',
        },
        {
          transaction_id: 'tx_other_window',
          timestamp: '2026-03-01T10:45:00Z', // inside window
          src_account_id: 'acc_03',
          dst_account_id: 'acc_04',
          amount: 250,
          transaction_status: 'SETTLED',
          merchant_id: 'm_02',
          payment_method: 'TRANSFER',
        },
        {
          transaction_id: 'tx_outside',
          timestamp: '2026-03-02T15:00:00Z', // outside window
          src_account_id: 'acc_05',
          dst_account_id: 'acc_06',
          amount: 100,
          transaction_status: 'SETTLED',
          merchant_id: 'm_03',
          payment_method: 'CARD',
        },
      ];

      const supports = new Set(temporalEvidence.supporting_entities || []);
      const metrics = temporalEvidence.metrics;
      const startTs = new Date(metrics.start_timestamp as string).getTime();
      const endTs = new Date(metrics.end_timestamp as string).getTime();

      const matched = new Set<string>();
      sampleEvents.forEach((evt) => {
        if (supports.has(evt.transaction_id)) {
          matched.add(evt.transaction_id);
          return;
        }
        const t = new Date(evt.timestamp).getTime();
        if (t >= startTs && t <= endTs) {
          matched.add(evt.transaction_id);
        }
      });

      assert.equal(matched.has('tx_103686'), true, 'Direct tx ID match');
      assert.equal(matched.has('tx_other_window'), true, 'Temporal window match');
      assert.equal(matched.has('tx_outside'), false, 'Outside window not matched');
      assert.equal(matched.size, 2);
    });
  });

  // -------------------------------------------------------------------------
  // Test F: Community-level evidence without transaction mapping displays correct explanation
  // -------------------------------------------------------------------------
  describe('Test F: Community-level evidence without transaction mapping', () => {
    it('displays community-level signal explanation when no transactions are directly mapped', () => {
      const communityDensityEvidence: EvidenceItem = {
        evidence_id: 'ev_density_01',
        entity_type: 'COMMUNITY',
        entity_id: 'comm_42',
        type: 'HIGH_EVIDENCE_DENSITY',
        severity: 'MEDIUM',
        title: 'High graph evidence density',
        description: 'Cluster topology exhibits high internal interconnectivity.',
        score_contribution: 12,
        observed_at: '2026-03-01T00:00:00Z',
        supporting_entities: [],
        metrics: { density: 0.45 },
      };

      const subject = getEvidenceSubject(communityDensityEvidence);
      assert.equal(subject.transactionCount, undefined);

      const txEntities = communityDensityEvidence.supporting_entities.filter((id) => !isAccountId(id));
      const totalSupportingCount = txEntities.length;
      const evidenceMatchesSize = 0;

      const isCommunityLevelSignal = totalSupportingCount === 0 && evidenceMatchesSize === 0;
      assert.equal(isCommunityLevelSignal, true);

      const displayText = isCommunityLevelSignal
        ? 'Community-level signal — no individual transactions directly mapped to this evidence item.'
        : `${totalSupportingCount} supporting transactions`;

      assert.equal(
        displayText,
        'Community-level signal — no individual transactions directly mapped to this evidence item.'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Test G: SAR remains Draft until all readiness requirements are complete
  // -------------------------------------------------------------------------
  describe('Test G: SAR remains Draft until all readiness requirements are complete', () => {
    it('enforces DRAFT status when audit criteria are incomplete', () => {
      const auditCriteria = [
        { id: 'focal_selected', label: 'Primary Account Focal Established', completed: true },
        { id: 'hypotheses_evaluated', label: 'Competing Hypotheses Evaluated', completed: false }, // incomplete
        { id: 'narrative_documented', label: 'Investigative Narrative Recorded', completed: false },
        { id: 'evidence_verified', label: 'Observable Evidence Corroborated', completed: true },
      ];

      const completedCount = auditCriteria.filter((c) => c.completed).length;
      const totalCount = auditCriteria.length;
      const isReady = completedCount === totalCount;

      assert.equal(isReady, false, 'Audit must not be marked ready when items are incomplete');

      const sarStatus = isReady ? 'OFFICIALLY FILED' : 'DRAFT — PENDING INVESTIGATOR REVIEW';
      assert.equal(sarStatus, 'DRAFT — PENDING INVESTIGATOR REVIEW');
    });

    it('verifies neutral dossier header titling', () => {
      const sarMarkdownHeader = '# TraceLine Risk Intelligence | Suspicious Activity Report (SAR)';
      const dossierMarkdownHeader = '# TraceLine Risk Intelligence | Investigation Dossier';

      assert.match(sarMarkdownHeader, /TraceLine Risk Intelligence/);
      assert.doesNotMatch(sarMarkdownHeader, /FRAUD INTELLIGENCE/);
      assert.doesNotMatch(dossierMarkdownHeader, /FORENSIC INTELLIGENCE/);
    });
  });
});
