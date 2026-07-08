/**
 * WP3 — RFC-001 PlanOperation[] → Decision Semantics TripMutationSet.
 */

import { randomUUID } from 'crypto';
import type { PlanOperation } from '../contracts/plan-operation.types';
import type { TripMutation, TripMutationSet } from '../../decision-semantics/types/decision-semantics.types';

export const PLAN_OPERATION_MUTATION_ADAPTER_VERSION =
  'plan-operation-to-mutation-rfc001-0.1.0';

function mutationFromOperation(op: PlanOperation): TripMutation | null {
  const itemId = op.parameters.itineraryItemId as string | undefined;
  const segId = op.targetRefs[0]?.id;

  switch (op.kind) {
    case 'REMOVE_ITEM':
    case 'REPLACE_ITEM':
      if (!itemId) return null;
      return {
        operation: 'REMOVE',
        entityType: 'ITINERARY_ITEM',
        entityId: itemId,
        after:
          op.kind === 'REPLACE_ITEM'
            ? {
                substitutePoiId: op.parameters.substitutePoiId,
                intentRef: op.parameters.intentRef,
                operationId: op.operationId,
              }
            : { operationId: op.operationId },
        semanticEffects: [],
      };
    case 'CHANGE_ROUTE':
      return {
        operation: 'UPDATE',
        entityType: 'JOURNEY_LEG',
        entityId: segId ?? itemId,
        after: {
          bypassRoadId: op.parameters.bypassRoadId,
          itineraryItemId: itemId,
          operationId: op.operationId,
        },
        semanticEffects: [],
      };
    case 'MOVE_ITEM':
      return {
        operation: 'MOVE',
        entityType: 'ITINERARY_ITEM',
        entityId: itemId,
        after: { ...op.parameters, operationId: op.operationId },
        semanticEffects: [],
      };
    case 'SHIFT_TIME':
      return {
        operation: 'UPDATE',
        entityType: 'ITINERARY_ITEM',
        entityId: itemId,
        after: { ...op.parameters, operationId: op.operationId },
        semanticEffects: [],
      };
    case 'ADD_ITEM':
      return {
        operation: 'ADD',
        entityType: 'ITINERARY_ITEM',
        entityId: (op.parameters.itineraryItemId as string | undefined) ?? op.operationId,
        after: { ...op.parameters, operationId: op.operationId },
        semanticEffects: [],
      };
    default:
      return {
        operation: 'UPDATE',
        entityType: 'ITINERARY_ITEM',
        entityId: itemId ?? segId,
        after: { kind: op.kind, ...op.parameters, operationId: op.operationId },
        semanticEffects: [],
      };
  }
}

export function buildTripMutationSetFromPlanOperations(input: {
  tripId: string;
  decisionId: string;
  versionBefore: string;
  operations: PlanOperation[];
  createdBy?: string;
}): TripMutationSet {
  const operations = input.operations
    .map(mutationFromOperation)
    .filter((m): m is TripMutation => m != null);

  return {
    mutationId: `mut_rfc001_${randomUUID().slice(0, 12)}`,
    tripId: input.tripId,
    operations,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? 'RFC001_DECISION_CORE',
    sourceDecisionId: input.decisionId,
    versionBefore: input.versionBefore,
  };
}
