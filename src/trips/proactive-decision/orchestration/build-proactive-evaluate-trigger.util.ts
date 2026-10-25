/**
 * PD-3.2/3.3 — Build Gateway trigger input after a PD Decision Problem is opened.
 * Uses existing CANONICAL_PROBLEM_EVALUATE — does not add a parallel evaluate path.
 */

import type { DecisionTriggerInput } from '../../../decision-runtime/contracts/decision-run-request';
import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { LensActivationDecisionV1 } from '../lenses/lens-activation.types';

export const PROACTIVE_WORLD_SIGNAL_ENTRY_ID =
  'proactive-decision.world-signal' as const;

export function buildProactiveCanonicalEvaluateTriggerInput(input: {
  tripId: string;
  problemId: string;
  signalEventId: string;
  caseId: ProactiveDecisionCaseId;
  idempotencyKey: string;
  semanticCapability?: string;
  requestId?: string;
  lensActivation?: LensActivationDecisionV1;
}): DecisionTriggerInput {
  return {
    kind: 'CANONICAL_PROBLEM_EVALUATE',
    tripId: input.tripId,
    source: 'WORLD_EVENT_BUS',
    requestId: input.requestId ?? input.idempotencyKey,
    problemId: input.problemId,
    eventId: input.signalEventId,
    semanticCapability: input.semanticCapability,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      proactiveDecisionV1: true,
      entryId: PROACTIVE_WORLD_SIGNAL_ENTRY_ID,
      caseId: input.caseId,
      triggerProductKind: 'PROACTIVE_WORLD_SIGNAL',
      lensActivated: input.lensActivation?.lensOrder ?? [],
      activateNeptune: input.lensActivation?.activateNeptune ?? false,
      requirePostRepairRecheck:
        input.lensActivation?.requirePostRepairRecheck ?? false,
    },
  };
}
