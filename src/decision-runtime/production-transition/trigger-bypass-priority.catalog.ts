/**
 * Static priority for Trigger Gateway bypass / lineage_only entry points.
 * Production traffic counts override ranks when supplied via metrics artifact.
 *
 * @see PRODUCTION_TRANSITION.md Week 1 — Layer 1 Agentic
 */

import {
  DECISION_TRIGGER_WIRING_CATALOG,
  type TriggerEntryPointWiring,
} from '../trigger/decision-trigger-wiring.catalog';

export const TRIGGER_BYPASS_PRIORITY_VERSION = 'trigger-bypass-priority@v1';

export type EstimatedTrafficTier = 'high' | 'medium' | 'low';
export type FormalDecisionImpact = 'direct' | 'indirect' | 'advisory';

export interface TriggerBypassPriorityHint {
  entryId: string;
  estimatedTrafficTier: EstimatedTrafficTier;
  formalDecisionImpact: FormalDecisionImpact;
  /** Lower = wire first */
  upgradePriority: number;
  rationale: string;
}

/** All catalog formal entry points are dispatch-wired — hints empty until new bypass added */
export const TRIGGER_BYPASS_PRIORITY_HINTS: TriggerBypassPriorityHint[] = [];

export interface TriggerBypassRankedEntry {
  entryId: string;
  label: string;
  mode: TriggerEntryPointWiring['mode'];
  triggerKind: TriggerEntryPointWiring['triggerKind'];
  source: TriggerEntryPointWiring['source'];
  moduleHint: string;
  estimatedTrafficTier: EstimatedTrafficTier;
  formalDecisionImpact: FormalDecisionImpact;
  upgradePriority: number;
  rationale: string;
  requestCount30d?: number;
  rank: number;
  rankSource: 'production_metrics' | 'static_estimate';
}

export function snapshotTriggerBypassPriorityCatalog() {
  return {
    schemaId: 'tripnara.trigger_bypass_priority_catalog@v1',
    version: TRIGGER_BYPASS_PRIORITY_VERSION,
    hints: TRIGGER_BYPASS_PRIORITY_HINTS,
  };
}

export function listBypassCandidates(
  catalog: TriggerEntryPointWiring[] = DECISION_TRIGGER_WIRING_CATALOG,
): TriggerEntryPointWiring[] {
  return catalog.filter((e) => e.mode === 'lineage_only' || e.mode === 'not_wired');
}
