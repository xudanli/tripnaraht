/**
 * Build TripMutationSet from repair option payloads and feasibility preview diffs.
 */

import { randomUUID } from 'crypto';
import type { PreviewRepairResponse, RepairOption } from '../../readiness/types/coverage-map.types';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  TradeoffDimension,
  TripMutation,
  TripMutationEntityType,
  TripMutationOperation,
  TripMutationSet,
} from '../types/decision-semantics.types';

function opFromChangeType(changeType: string): TripMutationOperation {
  switch (changeType) {
    case 'added':
      return 'ADD';
    case 'removed':
      return 'REMOVE';
    case 'time_changed':
    case 'title_changed':
      return 'UPDATE';
    case 'moved_day':
      return 'MOVE';
    default:
      return 'UPDATE';
  }
}

function entityFromChangeType(changeType: string): TripMutationEntityType {
  if (changeType === 'added' || changeType === 'removed') return 'ITINERARY_ITEM';
  return 'ITINERARY_ITEM';
}

export function buildMutationsFromItineraryDiff(
  diff: PreviewRepairResponse['itineraryDiff'] | undefined,
  tradeoffs: TradeoffDimension[],
): TripMutation[] {
  if (!diff?.length) return [];
  return diff.map((entry) => ({
    operation: opFromChangeType(entry.changeType),
    entityType: entityFromChangeType(entry.changeType),
    entityId: entry.slotId,
    before: entry.before as Record<string, unknown> | undefined,
    after: entry.after as Record<string, unknown> | undefined,
    semanticEffects: tradeoffs.slice(0, 3),
  }));
}

export function buildMutationsFromRepairOption(
  option: RepairOption,
  issue: FeasibilityIssueDto | undefined,
  tradeoffs: TradeoffDimension[],
): TripMutation[] {
  const payload = (option.payload ?? {}) as Record<string, unknown>;
  const action = option.actionType ?? option.id;
  const mutations: TripMutation[] = [];

  const push = (
    operation: TripMutationOperation,
    entityType: TripMutationEntityType,
    entityId?: string,
    after?: Record<string, unknown>,
  ) => {
    mutations.push({
      operation,
      entityType,
      entityId,
      after,
      semanticEffects: tradeoffs.slice(0, 2),
    });
  };

  if (/insert_rest|add_buffer|buffer/.test(String(action))) {
    push('ADD', 'DAY', undefined, {
      afterDayNumber: payload.afterDayNumber ?? payload.beforeDayNumber,
      strategy: payload.strategy ?? 'insert_rest',
    });
  }

  if (/relocate_lodging|change_hotel|midpoint/.test(String(action))) {
    push('UPDATE', 'HOTEL', issue?.toItemId, {
      strategy: payload.strategy ?? 'relocate_lodging',
      dayNumber: payload.dayNumber ?? issue?.affectedDays?.[0],
      segmentId: payload.segmentId,
    });
  }

  if (/move_to_day|split_day|reorder/.test(String(action))) {
    push('MOVE', 'ITINERARY_ITEM', (payload.itemId as string) ?? issue?.toItemId, {
      suggestedDayNumber: (payload.suggestedValue as { dayNumber?: number })?.dayNumber,
      dayNumber: payload.dayNumber,
    });
  }

  if (/alternative_route|find_alternative/.test(String(action))) {
    push('UPDATE', 'JOURNEY_LEG', (payload.segmentId as string) ?? `${issue?.fromItemId}->${issue?.toItemId}`, {
      fromItemId: payload.fromItemId ?? issue?.fromItemId,
      toItemId: payload.toItemId ?? issue?.toItemId,
      strategy: 'alternative_route',
    });
  }

  if (/shift_departure|add_buffer_minutes/.test(String(action))) {
    push('UPDATE', 'ITINERARY_ITEM', issue?.fromItemId, {
      shiftMinutes: payload.shiftMinutes,
      suggestedTime: payload.suggestedTime ?? issue?.anchors?.suggestedTime,
    });
  }

  if (/adjust_time/.test(String(action))) {
    push('UPDATE', 'ITINERARY_ITEM', (payload.itemId as string) ?? issue?.toItemId, {
      payload: {
        ...payload,
        anchors: issue?.anchors,
      },
    });
  }

  if (/remove|skip|delete/.test(String(action))) {
    push('REMOVE', 'ITINERARY_ITEM', (payload.itemId as string) ?? issue?.toItemId, {
      reason: option.description,
    });
  }

  if (/replace/.test(String(action))) {
    push('REPLACE', 'ITINERARY_ITEM', (payload.itemId as string) ?? issue?.toItemId, {
      replacementId: payload.replacementId,
    });
  }

  if (!mutations.length && issue) {
    push('UPDATE', 'ITINERARY_ITEM', issue.fromItemId ?? issue.toItemId, {
      actionType: action,
      issueId: issue.id,
      payload,
    });
  }

  return mutations;
}

export function buildTripMutationSet(input: {
  tripId: string;
  versionBefore: string;
  createdBy: string;
  sourceDecisionId?: string;
  option: RepairOption;
  issue?: FeasibilityIssueDto;
  tradeoffs: TradeoffDimension[];
  preview?: PreviewRepairResponse | Record<string, unknown>;
}): TripMutationSet {
  const previewDiff = (input.preview as PreviewRepairResponse | undefined)?.itineraryDiff;
  const fromDiff = buildMutationsFromItineraryDiff(previewDiff, input.tradeoffs);
  const fromOption =
    fromDiff.length > 0
      ? fromDiff
      : buildMutationsFromRepairOption(input.option, input.issue, input.tradeoffs);

  return {
    mutationId: `mut_${randomUUID().slice(0, 12)}`,
    tripId: input.tripId,
    operations: fromOption,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    sourceDecisionId: input.sourceDecisionId,
    versionBefore: input.versionBefore,
  };
}

export function buildSemanticImpactFromMutations(
  mutations: TripMutation[],
  issue?: FeasibilityIssueDto,
): import('../../decision/execution/semantic-impact.types').SemanticImpactDeclaration {
  const hasDay = mutations.some((m) => m.entityType === 'DAY');
  const hasRoute = mutations.some((m) => m.entityType === 'JOURNEY_LEG');
  const affectedDates: string[] = [];
  if (issue?.affectedDays?.length) {
    // day numbers only — calendar dates resolved downstream
  }
  return {
    affectedDomains: hasRoute ? (['ROUTING', 'TEMPORAL'] as const) : (['TEMPORAL'] as const),
    impactScope: hasDay ? 'GLOBAL' : issue?.affectedDays?.length ? 'DAY' : 'SLOT',
    ...(issue?.affectedDays?.length ? {} : {}),
  };
}
