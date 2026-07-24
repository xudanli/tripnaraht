/**
 * MEM-BLOCKER-SCOPE-001 — Trip-level elderly curfew constraint fixture.
 * Scope: CURRENT_TRIP only; must not appear in another trip's assembled context.
 */
import type { TripTaskMemory } from '../../../agent/context-engine/interfaces/trip-task-memory.interface';
import { CONSTRAINT_SINK_V1_KEY } from '../../../agent/memory/constraint-sink/constraint-sink.types';
import { hydrateTripPlanFromConstraintSink } from '../../../agent/memory/constraint-sink/hydrate-trip-plan-from-constraint-sink.util';
import type { RouteAndRunRequestDto } from '../../../agent/dto/route-and-run.dto';

export const ELDERLY_CURFEW_TRIP_A = 'trip-elderly-curfew-a';
export const COUPLE_TRIP_B = 'trip-couple-b';
export const SCOPE_TEST_USER_ID = 'user-scope-blocker-001';

export const ELDERLY_CURFEW_NOTES_ZH = '这次带老人，晚上8点前必须回酒店';

const elderlyCurfewPatch = {
  id: 'patch-elderly-curfew-trip-a',
  at: '2026-06-30T10:00:00.000Z',
  message_id: 'msg-elderly-curfew',
  session_id: 'pa-sess-elderly',
  confidence: 0.92,
  provenance: 'rule' as const,
  delta: {
    pace: 'relaxed' as const,
    negative: {
      notes_zh: ELDERLY_CURFEW_NOTES_ZH,
    },
  },
};

export function buildElderlyCurfewTripTaskMemory(tripId: string = ELDERLY_CURFEW_TRIP_A): TripTaskMemory {
  return {
    tripId,
    currentPhase: 'decision',
    decisionLogSummary: 'elderly curfew — 8pm hotel return',
    artifactsRefs: [],
    lastUpdated: new Date().toISOString(),
    goal: 'Family trip with elderly — early return constraint',
    constraints: {
      [CONSTRAINT_SINK_V1_KEY]: {
        revision: 'v1',
        patches: [elderlyCurfewPatch],
      },
    },
  };
}

export function buildEmptyCoupleTripTaskMemory(tripId: string = COUPLE_TRIP_B): TripTaskMemory {
  return {
    tripId,
    currentPhase: 'intake',
    decisionLogSummary: '',
    artifactsRefs: [],
    lastUpdated: new Date().toISOString(),
    goal: 'Couple getaway — no elderly constraints',
    constraints: {},
  };
}

/** Flatten hydrate output into a single string for assembled-context assertions. */
export function assembleConstraintSinkContextText(input: {
  tripTaskMemory: TripTaskMemory;
  tripId: string;
  userId?: string;
}): string {
  const request = {
    request_id: 'mem-blocker-scope-001',
    user_id: input.userId ?? SCOPE_TEST_USER_ID,
    trip_id: input.tripId,
    message: '帮我规划行程',
  } as RouteAndRunRequestDto;

  const { tripPlanRequest, applied } = hydrateTripPlanFromConstraintSink(
    {
      request_id: request.request_id,
      origin: '未指定',
      message: request.message,
      destination: '未指定',
    },
    input.tripTaskMemory,
    request,
  );

  return JSON.stringify({
    applied_patch_ids: applied.patch_ids,
    applied_keys: applied.keys,
    message: tripPlanRequest.message,
    pace: tripPlanRequest.pace,
    guardian: tripPlanRequest.guardian_debate_trip_context,
    style_tags: tripPlanRequest.style_tags,
  });
}
