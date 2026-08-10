/**
 * P1 — Decision / Adjustment Inbox semantic SSOT.
 *
 * One fact source, multiple projections. Do not invent a second problem store.
 */

/** Sole problem fact source for inbox projections. */
export const DECISION_INBOX_SSOT_SERVICE =
  'UnifiedDecisionProblemReadModelService' as const;

export type DecisionInboxProjectionKind =
  /** Travel-status / decision center consumer queue */
  | 'consumer_decision_queue'
  /** Mobile / ERC "待调整" adjustment queue */
  | 'execution_adjustment_queue'
  /** Unified Decision Problems API (canonical UI) */
  | 'unified_decision_problems'
  /** Deprecated mobile inline fallback when ERC projection missing */
  | 'mobile_legacy_adjustment_queue';

export interface DecisionInboxProjectionDescriptor {
  kind: DecisionInboxProjectionKind;
  service: string;
  ssot: typeof DECISION_INBOX_SSOT_SERVICE;
  disposition: 'KEEP' | 'DEPRECATE';
  notes: string;
}

export const DECISION_INBOX_PROJECTIONS: readonly DecisionInboxProjectionDescriptor[] =
  [
    {
      kind: 'unified_decision_problems',
      service: 'UnifiedDecisionProblemReadModelService',
      ssot: DECISION_INBOX_SSOT_SERVICE,
      disposition: 'KEEP',
      notes: 'SSOT + primary API surface',
    },
    {
      kind: 'consumer_decision_queue',
      service: 'ConsumerDecisionQueueService',
      ssot: DECISION_INBOX_SSOT_SERVICE,
      disposition: 'KEEP',
      notes: 'Projection via projectListItemToConsumerDecision; empty when gateway unified off',
    },
    {
      kind: 'execution_adjustment_queue',
      service: 'ExecutionAdjustmentQueueProjectionService',
      ssot: DECISION_INBOX_SSOT_SERVICE,
      disposition: 'KEEP',
      notes: 'Merges decision problems + execution risks; prefer over mobile legacy',
    },
    {
      kind: 'mobile_legacy_adjustment_queue',
      service: 'MobileExecutionService.getExecutionAdjustmentQueueLegacy',
      ssot: DECISION_INBOX_SSOT_SERVICE,
      disposition: 'DEPRECATE',
      notes: 'Fallback only when ERC projection unavailable',
    },
  ] as const;

export function listActiveDecisionInboxProjections(): DecisionInboxProjectionDescriptor[] {
  return DECISION_INBOX_PROJECTIONS.filter((p) => p.disposition === 'KEEP');
}
