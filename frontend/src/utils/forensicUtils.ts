import type { EvidenceItem } from '../types/api';
import type { InvestigationLens } from '../components/graph/NetworkGraph';

/**
 * Validates whether an entity ID represents an account node.
 * Strictly guarantees that transaction IDs (e.g. 'tx_103686', 'txn_...')
 * can NEVER be represented or treated as an account investigation focal.
 */
export function isAccountId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim().toLowerCase();
  if (trimmed === '') return false;
  if (trimmed.startsWith('tx_') || trimmed.startsWith('txn_')) return false;
  return true;
}

/**
 * Returns true if the given evidence type is semantically relevant to the
 * active lens. Used to decide whether to preserve or clear the evidence focus
 * when the investigator manually changes lenses.
 *
 * Examples:
 * - Temporal Burst + Relationship -> false (clears temporal evidence focus)
 * - Device Reuse + Shared Infrastructure -> true (compatible)
 * - IP Concentration + Shared Infrastructure -> true (compatible)
 * - Hub Account + Relationship -> true (compatible)
 * - Hub Account + Community Structure -> true (compatible)
 */
export function isEvidenceFocusCompatibleWithLens(
  focusType: string,
  lens: InvestigationLens,
): boolean {
  const infraTypes = ['SHARED_INSTRUMENT_CONCENTRATION', 'DEVICE_REUSE', 'IP_CONCENTRATION'];
  const temporalTypes = ['TEMPORAL_BURST', 'MERCHANT_TEMPORAL_OVERLAP', 'RAPID_INTERACTION'];
  const flowTypes = ['HUB_ACCOUNT', 'MULTI_LAYER_EVIDENCE'];
  if (infraTypes.includes(focusType))    return lens === 'shared-infrastructure';
  if (temporalTypes.includes(focusType)) return lens === 'temporal';
  if (flowTypes.includes(focusType))     return lens === 'flow-of-funds' || lens === 'relationship' || lens === 'community';
  // Catch-all: general/density evidence is broadly relevant to topological relationship or community structure
  return lens === 'relationship' || lens === 'community';
}

/**
 * Extracts structured subject information from an EvidenceItem for display
 * in the Investigative Thread panel, Graph Focus Banner, and Timeline.
 *
 * Example:
 * EVIDENCE FOCUS: Temporal Burst
 * EVIDENCE SUBJECT:
 * 32 related transactions
 * 58-minute observed window
 */
export function getEvidenceSubject(item: EvidenceItem): {
  primary: string;
  secondary?: string;
  transactionCount?: number;
  windowMinutes?: number;
} {
  const metrics = (item.metrics || {}) as Record<string, unknown>;

  const txCount = metrics.transaction_count != null
    ? Number(metrics.transaction_count)
    : undefined;
  const windowMinutes = metrics.window_minutes != null
    ? Number(metrics.window_minutes)
    : undefined;

  if (txCount != null || windowMinutes != null) {
    const finalCount = txCount ?? (item.supporting_entities || []).filter((id) => !isAccountId(id)).length;
    return {
      primary: `${finalCount} related transaction${finalCount !== 1 ? 's' : ''}`,
      secondary: windowMinutes != null ? `${windowMinutes}-minute observed window` : undefined,
      transactionCount: finalCount,
      windowMinutes,
    };
  }

  // Parse title like "Transaction burst: 32 transactions in 58 minutes"
  const burstMatch = item.title.match(/(\d+)\s+transactions?\s+in\s+(\d+)\s+minutes?/i);
  if (burstMatch) {
    const count = parseInt(burstMatch[1], 10);
    const windowMin = parseInt(burstMatch[2], 10);
    return {
      primary: `${count} related transactions`,
      secondary: `${windowMin}-minute observed window`,
      transactionCount: count,
      windowMinutes: windowMin,
    };
  }

  // Check if supporting entities are transaction IDs
  const txEntities = (item.supporting_entities || []).filter((id) => !isAccountId(id));
  if (txEntities.length > 0) {
    return {
      primary: `${txEntities.length} related transaction${txEntities.length !== 1 ? 's' : ''}`,
      secondary: metrics.window_minutes ? `${metrics.window_minutes}-minute observed window` : undefined,
      transactionCount: txEntities.length,
      windowMinutes: typeof metrics.window_minutes === 'number' ? metrics.window_minutes : undefined,
    };
  }

  // Check for account entities
  const accEntities = (item.supporting_entities || []).filter((id) => isAccountId(id));
  if (accEntities.length > 0) {
    return {
      primary: `${accEntities.length} supporting account${accEntities.length !== 1 ? 's' : ''}`,
      secondary: accEntities.slice(0, 3).join(', ') + (accEntities.length > 3 ? ` (+${accEntities.length - 3} more)` : ''),
    };
  }

  return {
    primary: 'Community-wide observable pattern',
    secondary: undefined,
  };
}
