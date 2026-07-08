/**
 * Normalizes heterogeneous trigger inputs → DecisionRunRequest.
 */

import { randomUUID } from 'crypto';
import type {
  DecisionRunRequest,
  DecisionTriggerInput,
} from '../contracts/decision-run-request';
import { DECISION_RUN_REQUEST_SCHEMA_ID } from '../contracts/decision-run-request';
import { attachRouteTarget } from './decision-trigger-router.util';

export function buildDecisionRunId(input: DecisionTriggerInput): string {
  if (input.requestId?.trim()) return input.requestId.trim();
  if (input.idempotencyKey?.trim()) {
    return `run_${input.tripId.slice(0, 8)}_${input.idempotencyKey.trim()}`;
  }
  return `run_${input.tripId.slice(0, 8)}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export function normalizeDecisionTriggerInput(
  input: DecisionTriggerInput,
): DecisionRunRequest {
  if (!input.tripId?.trim()) {
    throw new Error('DecisionTriggerInput.tripId is required');
  }
  if (!input.kind) {
    throw new Error('DecisionTriggerInput.kind is required');
  }
  if (!input.source) {
    throw new Error('DecisionTriggerInput.source is required');
  }

  const base: Omit<DecisionRunRequest, 'routeTarget'> = {
    schemaId: DECISION_RUN_REQUEST_SCHEMA_ID,
    runId: buildDecisionRunId(input),
    tripId: input.tripId.trim(),
    triggerKind: input.kind,
    source: input.source,
    createdAt: new Date().toISOString(),
    problemId: input.problemId?.trim() || undefined,
    decisionId: input.decisionId?.trim() || undefined,
    userId: input.userId?.trim() || undefined,
    eventId: input.eventId?.trim() || undefined,
    semanticCapability: input.semanticCapability?.trim() || undefined,
    idempotencyKey: input.idempotencyKey?.trim() || undefined,
    metadata: input.metadata,
  };

  return attachRouteTarget(base);
}
