/**
 * In-memory harness for MEM-BLOCKER-DELETE-001 (five-layer delete verification).
 */
import { ConfigService } from '@nestjs/config';
import type { TripTaskMemory } from '../../../agent/context-engine/interfaces/trip-task-memory.interface';
import { TripTaskMemoryService } from '../../../agent/context-engine/services/trip-task-memory.service';
import { readConstraintSinkState } from '../../../agent/memory/constraint-sink/constraint-sink-state.util';
import { UserMemoryConsoleService } from '../../../agent/memory/console/user-memory-console.service';
import type { MemoryService } from '../../../agent/memory/services/memory.service';
import { MemorySnapshotPersistenceService } from '../../../agent/memory/persistence/memory-snapshot-persistence.service';
import type { AgentMemoryContext } from '../../../agent/memory/interfaces/agent-memory-context.interface';
import {
  assembleConstraintSinkContextText,
  buildElderlyCurfewTripTaskMemory,
  ELDERLY_CURFEW_NOTES_ZH,
  ELDERLY_CURFEW_TRIP_A,
  SCOPE_TEST_USER_ID,
} from './elderly-curfew-trip-scope.fixture';
import {
  probeVectorRecallForConstraintSink,
  textContainsAnySnippet,
} from '../assertions/memory-delete.assertions';

const TRIP_TASK_KEY_PREFIX = 'trip_task_memory:';
const SNAPSHOT_TRIP_HEAD_PREFIX = 'agent:mem_snapshot_trip_head:v1:';

/** Minimal Redis double for TripTaskMemory + MemorySnapshotPersistence */
export class BlockerInMemoryRedis {
  private readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async set(key: string, value: unknown, _ttl?: number): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  rawGet(key: string): unknown {
    return this.store.get(key);
  }

  dumpKeysMatching(prefix: string): string[] {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }
}

export const DELETE_BLOCKER_PATCH_ID = 'patch-elderly-curfew-trip-a';
export const DELETE_BLOCKER_FORBIDDEN = [ELDERLY_CURFEW_NOTES_ZH, '8点前', '老人'];

export type MemoryDeleteBlockerHarness = {
  console: UserMemoryConsoleService;
  tripTaskMemory: TripTaskMemoryService;
  snapshotPersistence: MemorySnapshotPersistenceService;
  redis: BlockerInMemoryRedis;
  tripId: string;
  userId: string;
  seedWithPatch: () => Promise<void>;
  persistSnapshotWithActiveTrip: () => Promise<string>;
  probeAfterDelete: () => Promise<import('../assertions/memory-delete.assertions').MemoryDeleteFiveLayerProbe>;
};

export function createMemoryDeleteBlockerHarness(): MemoryDeleteBlockerHarness {
  const redis = new BlockerInMemoryRedis();
  const tripTaskMemory = new TripTaskMemoryService(redis as unknown as import('../../../redis/redis.service').RedisService);
  const snapshotPersistence = new MemorySnapshotPersistenceService(
    redis as unknown as import('../../../redis/redis.service').RedisService,
  );

  const memoryService = {
    getUserTravelProfile: jest.fn(),
    getUserRouteDirectionDecisions: jest.fn().mockResolvedValue([]),
    saveUserTravelProfile: jest.fn(),
    deleteRouteDirectionDecision: jest.fn(),
  } as unknown as MemoryService;

  const configOn = { get: (k: string) => (k === 'FEATURE_MEMORY_CONSOLE' ? '1' : undefined) } as ConfigService;

  const console = new UserMemoryConsoleService(
    memoryService,
    undefined,
    tripTaskMemory,
    configOn,
    snapshotPersistence,
  );

  const tripId = ELDERLY_CURFEW_TRIP_A;
  const userId = SCOPE_TEST_USER_ID;

  async function seedWithPatch(): Promise<void> {
    await tripTaskMemory.set(buildElderlyCurfewTripTaskMemory(tripId));
  }

  async function persistSnapshotWithActiveTrip(): Promise<string> {
    const task = (await tripTaskMemory.get(tripId))!;
    const memory: AgentMemoryContext = {
      snapshotId: 'snap-delete-blocker-001',
      snapshotVersion: 1,
      requestId: 'req-delete-blocker',
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
      activeTripState: task,
      recoveryHistory: [],
      failurePatterns: [],
      recentTripFeedbacks: [],
      domainInfluenceDigest: null,
      wishConstraintDigest: null,
      privateWishDigest: null,
      decisionProfilingDigest: null,
      negotiationDigest: null,
      loadedAt: new Date().toISOString(),
      observability: { layers: ['constraint_sink'] },
    };
    await snapshotPersistence.persistSerializableSnapshot(memory);
    return memory.snapshotId;
  }

  async function probeAfterDelete(): Promise<
    import('../assertions/memory-delete.assertions').MemoryDeleteFiveLayerProbe
  > {
    const task = await tripTaskMemory.get(tripId);
    const sink = readConstraintSinkState(task?.constraints);
    const canonicalJson = JSON.stringify(sink ?? {});

    const cacheKey = `${TRIP_TASK_KEY_PREFIX}${tripId}`;
    const cached = redis.rawGet(cacheKey) as TripTaskMemory | undefined;
    const cacheJson = JSON.stringify(cached?.constraints ?? {});

    const latestCtx = await snapshotPersistence.loadLatestContextForTrip(tripId);
    const snapshotJson = JSON.stringify(latestCtx?.activeTripState?.constraints ?? latestCtx ?? {});

    const assembled = assembleConstraintSinkContextText({ tripTaskMemory: task!, tripId, userId });

    const vectorHits = probeVectorRecallForConstraintSink(ELDERLY_CURFEW_NOTES_ZH).filter((h) =>
      DELETE_BLOCKER_FORBIDDEN.some((s) => h.includes(s)),
    );

    return {
      canonicalContainsFact: textContainsAnySnippet(canonicalJson, DELETE_BLOCKER_FORBIDDEN),
      vectorRecallHits: vectorHits,
      cacheContainsFact: textContainsAnySnippet(cacheJson, DELETE_BLOCKER_FORBIDDEN),
      snapshotContainsFact: textContainsAnySnippet(snapshotJson, DELETE_BLOCKER_FORBIDDEN),
      assembledContainsFact: textContainsAnySnippet(assembled, DELETE_BLOCKER_FORBIDDEN),
    };
  }

  return {
    console,
    tripTaskMemory,
    snapshotPersistence,
    redis,
    tripId,
    userId,
    seedWithPatch,
    persistSnapshotWithActiveTrip,
    probeAfterDelete,
  };
}

export { SNAPSHOT_TRIP_HEAD_PREFIX };
