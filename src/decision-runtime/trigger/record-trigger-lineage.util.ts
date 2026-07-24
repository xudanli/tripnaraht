/**
 * Record trigger lineage without full Gateway dispatch (Agentic / loop paths).
 */

import type { DecisionTriggerInput, DecisionRunRequest } from '../contracts/decision-run-request';
import type { DecisionRunDispatchResult } from '../contracts/decision-run-request';
import type { DecisionTriggerGatewayService } from './decision-trigger.gateway.service';
import {
  isDecisionTriggerGatewayEnabled,
  isDecisionTriggerLineageEnabled,
} from './decision-trigger.config';

export function recordTriggerLineageIfEnabled(
  gateway: DecisionTriggerGatewayService | undefined,
  input: DecisionTriggerInput,
): DecisionRunRequest | undefined {
  if (!gateway || !isDecisionTriggerLineageEnabled()) {
    return undefined;
  }
  return gateway.buildRunRequest(input);
}

function buildUserIntentInput(params: {
  tripId: string;
  userId?: string;
  entryPointId: string;
  metadata?: Record<string, unknown>;
}): DecisionTriggerInput {
  return {
    kind: 'USER_INTENT',
    tripId: params.tripId,
    source: 'HTTP',
    userId: params.userId,
    metadata: {
      entryPointId: params.entryPointId,
      eventType: 'USER_ITINERARY_EDIT',
      affectsEffectivePlan: true,
      ...params.metadata,
    },
  };
}

/** User-initiated HTTP edit — lineage only when Gateway dispatch is off. */
export function recordUserIntentLineageIfEnabled(
  gateway: DecisionTriggerGatewayService | undefined,
  params: {
    tripId: string;
    userId?: string;
    entryPointId: string;
    metadata?: Record<string, unknown>;
  },
): DecisionRunRequest | undefined {
  return recordTriggerLineageIfEnabled(gateway, buildUserIntentInput(params));
}

/**
 * User-initiated HTTP edit — full Gateway dispatch when enabled (P4 user.trip-edit).
 * Legacy Prisma write remains authority; dispatch records lineage + replanning policy.
 */
export async function dispatchUserIntentIfEnabled(
  gateway: DecisionTriggerGatewayService | undefined,
  params: {
    tripId: string;
    userId?: string;
    entryPointId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<DecisionRunDispatchResult | DecisionRunRequest | undefined> {
  if (!gateway) {
    return undefined;
  }

  const input = buildUserIntentInput(params);

  if (isDecisionTriggerGatewayEnabled()) {
    return gateway.dispatch(input);
  }

  return recordTriggerLineageIfEnabled(gateway, input);
}

/** Extract runId from dispatch result or lineage-only buildRunRequest output. */
export function resolveDecisionRunId(
  dispatched: DecisionRunDispatchResult | DecisionRunRequest | undefined,
): string | undefined {
  if (!dispatched) return undefined;
  if ('request' in dispatched) return dispatched.request.runId;
  return dispatched.runId;
}

/**
 * In-trip recovery loop — full Gateway dispatch when enabled (P4 loops.in-trip-recovery).
 * LoopOrchestrator remains execution authority.
 */
export async function dispatchInTripDeviationIfEnabled(
  gateway: DecisionTriggerGatewayService | undefined,
  input: DecisionTriggerInput,
): Promise<DecisionRunDispatchResult | DecisionRunRequest | undefined> {
  if (!gateway) {
    return undefined;
  }

  const enriched: DecisionTriggerInput = {
    ...input,
    metadata: {
      entryPointId: 'loops.in-trip-recovery',
      affectsEffectivePlan: true,
      ...input.metadata,
    },
  };

  if (isDecisionTriggerGatewayEnabled()) {
    return gateway.dispatch(enriched);
  }

  return recordTriggerLineageIfEnabled(gateway, enriched);
}

/**
 * Kernel environment-delta replan — full Gateway dispatch when enabled (P4 kernel.replan-coordinator).
 * ReplanCoordinatorService remains execution authority.
 */
export async function dispatchWorldEventIfEnabled(
  gateway: DecisionTriggerGatewayService | undefined,
  input: DecisionTriggerInput,
): Promise<DecisionRunDispatchResult | DecisionRunRequest | undefined> {
  if (!gateway) {
    return undefined;
  }

  const enriched: DecisionTriggerInput = {
    ...input,
    metadata: {
      entryPointId: 'kernel.replan-coordinator',
      affectsEffectivePlan: true,
      ...input.metadata,
    },
  };

  if (isDecisionTriggerGatewayEnabled()) {
    return gateway.dispatch(enriched);
  }

  return recordTriggerLineageIfEnabled(gateway, enriched);
}

/**
 * Agent route_and_run — Gateway dispatch when enabled (advisory only, no formal Decision).
 */
export async function dispatchAgentRouteAndRunIfEnabled(
  gateway: DecisionTriggerGatewayService | undefined,
  input: DecisionTriggerInput,
): Promise<DecisionRunDispatchResult | DecisionRunRequest | undefined> {
  if (!gateway) {
    return undefined;
  }

  const enriched: DecisionTriggerInput = {
    ...input,
    metadata: {
      entryPointId: 'agent.route-and-run',
      affectsEffectivePlan: false,
      ...input.metadata,
    },
  };

  if (isDecisionTriggerGatewayEnabled()) {
    return gateway.dispatch(enriched);
  }

  return recordTriggerLineageIfEnabled(gateway, enriched);
}

/** User-initiated feasibility / readiness repair — lineage only when Gateway dispatch is off. */
export function recordManualRepairLineageIfEnabled(
  gateway: DecisionTriggerGatewayService | undefined,
  params: ManualRepairDispatchParams,
): DecisionRunRequest | undefined {
  return recordTriggerLineageIfEnabled(gateway, buildManualRepairInput(params));
}

export interface ManualRepairDispatchParams {
  tripId: string;
  userId?: string;
  entryPointId: string;
  issueId?: string;
  metadata?: Record<string, unknown>;
}

function buildManualRepairInput(params: ManualRepairDispatchParams): DecisionTriggerInput {
  return {
    kind: 'MANUAL_REPAIR_REQUEST',
    tripId: params.tripId,
    source: 'HTTP',
    userId: params.userId,
    metadata: {
      entryPointId: params.entryPointId,
      eventType: 'MANUAL_REPAIR',
      affectsEffectivePlan: true,
      ...(params.issueId ? { issueId: params.issueId } : {}),
      ...params.metadata,
    },
  };
}

/**
 * User-initiated manual repair — full Gateway dispatch when enabled (P4 feasibility/readiness apply-repair).
 * Legacy repair service remains execution authority.
 */
export async function dispatchManualRepairIfEnabled(
  gateway: DecisionTriggerGatewayService | undefined,
  params: ManualRepairDispatchParams,
): Promise<DecisionRunDispatchResult | DecisionRunRequest | undefined> {
  if (!gateway) {
    return undefined;
  }

  const input = buildManualRepairInput(params);

  if (isDecisionTriggerGatewayEnabled()) {
    return gateway.dispatch(input);
  }

  return recordTriggerLineageIfEnabled(gateway, input);
}
