/**
 * Staging / 联调：PA 多轮后「不去南岸改内陆」已沉淀为 Constraint Sink patch，
 * 但 route_and_run 不带 recent_messages（滑动窗口外 pivot）时 INTAKE 仍应 hydrate。
 */
import { randomUUID } from 'node:crypto';
import type { AgentMemoryContext } from '../../interfaces/agent-memory-context.interface';
import type { TripTaskMemory } from '../../../context-engine/interfaces/trip-task-memory.interface';
import { CONSTRAINT_SINK_V1_KEY } from '../../constraint-sink/constraint-sink.types';

export const ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID = 'trip-iceland-coastal-pivot-staging';
export const ICELAND_COASTAL_PIVOT_STAGING_USER_ID = 'staging-user-coastal-pivot';

const pivotPatch = {
  id: 'patch-coastal-pivot-staging-001',
  at: '2026-06-04T08:00:00.000Z',
  message_id: 'msg-pivot-8',
  session_id: 'pa-sess-coastal-pivot',
  confidence: 0.9,
  provenance: 'rule' as const,
  delta: {
    destination_pivot: { from: 'south_coast', to: 'highlands' },
    negative: {
      avoid_regions: ['south_coast'],
      notes_zh: '用户表示避免沿海/南岸区域',
    },
    pace: 'relaxed' as const,
  },
};

export function buildIcelandCoastalPivotStagingTripTaskMemory(
  overrides?: Partial<{ tripId: string; userId: string }>,
): TripTaskMemory {
  const tripId = overrides?.tripId ?? ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID;
  return {
    tripId,
    currentPhase: 'decision',
    decisionLogSummary: 'staging: coastal pivot → highlands (constraint_sink_v1)',
    artifactsRefs: [],
    lastUpdated: new Date().toISOString(),
    goal: 'Iceland — inland pivot after south coast avoidance',
    constraints: {
      [CONSTRAINT_SINK_V1_KEY]: {
        revision: 'v1',
        patches: [pivotPatch],
      },
    },
    history: [
      {
        at: pivotPatch.at,
        event: 'constraint_sink',
        payload: {
          patch_id: pivotPatch.id,
          requestId: pivotPatch.session_id,
          applied_keys: ['negative.avoid_regions', 'destination_pivot', 'pace'],
          confidence: pivotPatch.confidence,
        },
      },
    ],
  };
}

export function buildIcelandCoastalPivotStagingMemoryContext(
  overrides?: Partial<{ tripId: string; snapshotId: string; userId: string }>,
): AgentMemoryContext {
  const tripId = overrides?.tripId ?? ICELAND_COASTAL_PIVOT_STAGING_TRIP_ID;
  const snapshotId = overrides?.snapshotId ?? randomUUID();
  const userId = overrides?.userId ?? ICELAND_COASTAL_PIVOT_STAGING_USER_ID;
  const activeTripState = buildIcelandCoastalPivotStagingTripTaskMemory({ tripId });

  return {
    snapshotId,
    snapshotVersion: 1,
    requestId: `req-coastal-pivot-${snapshotId.slice(0, 8)}`,
    userId,
    tripId,
    userProfile: null,
    userBasics: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: null,
    ledgerRecomputePlan: null,
    recentWorldDecisions: [],
    activeTripState,
    recoveryHistory: [],
    failurePatterns: [],
    loadedAt: new Date().toISOString(),
    observability: { layers: ['fixture:iceland_coastal_pivot_staging'] },
  };
}

export function buildIcelandCoastalPivotStagingRedisEnvelope(memory: AgentMemoryContext): {
  snapshotKey: string;
  tripHeadKey: string;
  tripTaskMemoryKey: string;
  envelope: {
    schema: 'v1';
    snapshot_id: string;
    snapshot_version: number;
    request_id: string;
    user_id: string | null;
    trip_id: string | null;
    loaded_at: string;
    payload: AgentMemoryContext;
  };
} {
  const envelope = {
    schema: 'v1' as const,
    snapshot_id: memory.snapshotId,
    snapshot_version: memory.snapshotVersion,
    request_id: memory.requestId,
    user_id: memory.userId,
    trip_id: memory.tripId,
    loaded_at: memory.loadedAt,
    payload: memory,
  };
  const tripId = String(memory.tripId).trim();
  return {
    snapshotKey: `agent:mem_snapshot:v1:${memory.snapshotId}`,
    tripHeadKey: `agent:mem_snapshot_trip_head:v1:${tripId}`,
    tripTaskMemoryKey: `trip_task_memory:${tripId}`,
    envelope,
  };
}

/** 供前端 / BFF mock：`observability.memory_contract.constraint_sink` 片段 */
export function buildCoastalPivotConstraintSinkObservability() {
  return {
    hydrated: true,
    applied_keys: ['destination', 'pace', 'guardian_debate_intent_hint'],
    patch_ids: [pivotPatch.id],
    overridden_by_request_keys: [] as string[],
  };
}
