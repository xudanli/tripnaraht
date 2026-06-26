/**
 * Staging / 联调：南岸大风橙色语境下，黑沙滩 POI 失效 + 维克酒店仍稳定的迷你账本。
 * 与 `MemorySnapshotPersistenceService` 落盘结构兼容（嵌入 AgentMemoryContext）。
 */
import { randomUUID } from 'node:crypto';
import type { AgentMemoryContext } from '../../interfaces/agent-memory-context.interface';
import type { TripTaskMemory } from '../../../context-engine/interfaces/trip-task-memory.interface';
import { buildLedgerEdgesFromNodes } from '../decision-ledger-anchors.util';
import type { DecisionLedgerSnapshot, LedgerNode } from '../decision-ledger.types';
import { normalizeLedgerAnchorsV1 } from '../decision-ledger-world-anchor.util';
import { planLedgerRecomputeOrder } from '../decision-ledger-invalidation.util';
import type { WorldTopicSlice } from '../world-topic-slice.types';

export const ICELAND_SOUTH_COAST_WIND_STAGING_TRIP_ID = 'trip-iceland-south-wind-staging';

const wl = { coarseDigest: 'iceland-wx-coarse-v1', fineDigest: 'iceland-wx-fine-v1', activeTopics: {} };

function baseAnchors() {
  return normalizeLedgerAnchorsV1({
    budget: 'budget:staging',
    preference: 'pref:staging',
    policy: 'pol:staging',
    worldLayered: wl,
  });
}

function alignedSig(anchors: ReturnType<typeof baseAnchors>) {
  return {
    budgetAnchor: anchors.budget,
    preferenceAnchor: anchors.preference,
    policyAnchor: anchors.policy,
    worldAnchor: anchors.world,
    worldCoarseDigestAtCommit: anchors.worldLayered.coarseDigest,
    worldTopicDigestsAtCommit: { ...anchors.worldLayered.activeTopics },
  };
}

function defaultInvalidationPolicy() {
  return {
    budget: 'normal' as const,
    preference: 'normal' as const,
    world: 'normal' as const,
    policy: 'normal' as const,
  };
}

function snap(nodes: LedgerNode[], worldSlices?: WorldTopicSlice[]): DecisionLedgerSnapshot {
  const anchors = baseAnchors();
  const cloned = nodes.map(n => {
    const x = JSON.parse(JSON.stringify(n)) as LedgerNode;
    x.inputSignatures = { ...alignedSig(anchors), ...x.inputSignatures };
    x.invalidationPolicy = x.invalidationPolicy ?? defaultInvalidationPolicy();
    return x;
  });
  return {
    revision: 'v1',
    nodes: cloned,
    edges: buildLedgerEdgesFromNodes(cloned),
    anchors,
    ...(worldSlices?.length ? { worldSlices } : {}),
  };
}

const nowMs = Date.now();

const windSlice: WorldTopicSlice = {
  topic: 'world:iceland_south_coast_wind',
  data: {
    severity: 'ORANGE',
    maxWindMs: 25,
    area: 'Reynisfjara / Vik south coast',
    headline: 'Strong wind; beach access restricted',
  },
  meta: {
    version: 'v1',
    fetchedAt: nowMs,
    digest: 'wind-orange-v1',
    freshness: {
      granularity: 'FINE',
      ttlMs: 3_600_000,
      stalePolicy: 'MARK_STALE',
    },
  },
};

/**
 * 构造可写入 Redis 的 `AgentMemoryContext`：`currentPhase=decision` → GATE_EVAL → 阻塞 reconcile。
 */
export function buildIcelandSouthCoastWindStagingMemoryContext(
  overrides?: Partial<{ tripId: string; snapshotId: string }>,
): AgentMemoryContext {
  const tripId = overrides?.tripId ?? ICELAND_SOUTH_COAST_WIND_STAGING_TRIP_ID;
  const snapshotId = overrides?.snapshotId ?? randomUUID();

  const routeStable: LedgerNode = {
    nodeId: 'T_DAY3_PM_ROUTE',
    parentIds: [],
    consumesNodeIds: [],
    actionType: 'TRANSPORT',
    inputSignatures: alignedSig(baseAnchors()),
    outputRef: {
      kind: 'transport',
      payloadDigest: 'route-d3-pm',
      summary: 'Afternoon coastal segment toward Vik',
    },
    status: 'STABLE',
    createdAt: 1,
  };

  const poiInv: LedgerNode = {
    nodeId: 'POI_REYNISFJARA',
    parentIds: ['T_DAY3_PM_ROUTE'],
    consumesNodeIds: [],
    actionType: 'POI',
    inputSignatures: alignedSig(baseAnchors()),
    outputRef: {
      kind: 'poi',
      payloadDigest: 'reynisfjara-beach',
      summary: 'Reynisfjara black sand beach (Day 3 PM)',
    },
    status: 'INVALIDATED',
    createdAt: 2,
  };

  const hotelStable: LedgerNode = {
    nodeId: 'HOTEL_VIK',
    parentIds: ['POI_REYNISFJARA'],
    consumesNodeIds: [],
    actionType: 'ACCOMMODATION',
    inputSignatures: alignedSig(baseAnchors()),
    outputRef: {
      kind: 'hotel',
      payloadDigest: 'vik-hotel',
      summary: 'Vik Hotel — check-in after beach slot',
    },
    status: 'STABLE',
    createdAt: 3,
  };

  const ledger = snap([routeStable, poiInv, hotelStable], [windSlice]);

  const activeTripState: TripTaskMemory = {
    tripId,
    currentPhase: 'decision',
    decisionLogSummary: 'staging: iceland south wind',
    artifactsRefs: [],
    lastUpdated: new Date().toISOString(),
    goal: 'Iceland south coast Day 3 — staging drift',
  };

  return {
    snapshotId,
    snapshotVersion: 1,
    requestId: `req-staging-${snapshotId.slice(0, 8)}`,
    userId: 'staging-user',
    tripId,
    userProfile: null,
    travelPreference: null,
    routePartyProfile: null,
    recentDecisions: [],
    decisionLedger: ledger,
    ledgerRecomputePlan: planLedgerRecomputeOrder(ledger),
    recentWorldDecisions: [],
    activeTripState,
    recoveryHistory: [],
    failurePatterns: [],
    domainInfluenceDigest: null,
    wishConstraintDigest: null,
    privateWishDigest: null,
    decisionProfilingDigest: null,
    negotiationDigest: null,
    loadedAt: new Date().toISOString(),
    observability: { layers: ['fixture:iceland_south_coast_wind_staging'] },
  };
}

export function buildIcelandSouthCoastWindStagingRedisEnvelope(memory: AgentMemoryContext): {
  snapshotKey: string;
  tripHeadKey: string;
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
  return {
    snapshotKey: `agent:mem_snapshot:v1:${memory.snapshotId}`,
    tripHeadKey: `agent:mem_snapshot_trip_head:v1:${String(memory.tripId).trim()}`,
    envelope,
  };
}
