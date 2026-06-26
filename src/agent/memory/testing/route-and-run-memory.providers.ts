// src/agent/memory/testing/route-and-run-memory.providers.ts
/** Double：单元测试里为 AgentService 提供最小 Memory 接线，避免 Optional 时代的静默缺失。 */
import type { Provider } from '@nestjs/common';
import { MemoryContextAssemblerService } from '../services/memory-context-assembler.service';
import { AgentMemoryContextStore } from '../context/agent-memory-context.store';
import { AgentExecutionContextStore } from '../../runtime/agent-execution-context.store';
import { AgentExecutionContextFactoryService } from '../../runtime/agent-execution-context-factory.service';
import { ExecutionTimelineRecorderService } from '../../runtime/execution-timeline-recorder.service';

export const ROUTE_AND_RUN_MEMORY_TEST_PROVIDERS: Provider[] = [
  {
    provide: MemoryContextAssemblerService,
    useValue: {
      loadForRouteAndRun: jest.fn().mockResolvedValue({
        snapshotId: 'snap-test',
        snapshotVersion: 1,
        requestId: 'test-req',
        userId: null,
        tripId: null,
        userProfile: null,
        travelPreference: null,
        routePartyProfile: null,
        recentDecisions: [],
        decisionLedger: null,
        ledgerRecomputePlan: null,
        recentWorldDecisions: [],
        activeTripState: null,
        recoveryHistory: [],
        failurePatterns: [],
        domainInfluenceDigest: null,
        wishConstraintDigest: null,
        privateWishDigest: null,
        decisionProfilingDigest: null,
        negotiationDigest: null,
        loadedAt: new Date().toISOString(),
        observability: { layers: ['mock'] },
      }),
      buildObservability: jest.fn().mockReturnValue({
        revision: 'v1',
        loaded: true,
        layers: ['mock'],
        user_id_present: false,
        snapshot_id: 'snap-test',
        snapshot_version: 1,
        loaded_at_iso: new Date().toISOString(),
      }),
    },
  },
  {
    provide: AgentMemoryContextStore,
    useValue: {
      runPromise: jest.fn((_m: unknown, fn: () => unknown) => Promise.resolve(fn())),
    },
  },
  {
    provide: AgentExecutionContextFactoryService,
    useValue: {
      createFromFrozenMemory: (m: {
        requestId: string;
        snapshotId: string;
        snapshotVersion: number;
      }) => ({
        requestId: m.requestId,
        snapshotId: m.snapshotId,
        snapshotVersion: m.snapshotVersion,
        executionBinding: {
          snapshot_id: m.snapshotId,
          snapshot_version: m.snapshotVersion,
          request_id: m.requestId,
        },
        activeParentSpanId: null,
      }),
    },
  },
  {
    provide: AgentExecutionContextStore,
    useValue: {
      runPromise: jest.fn((_e: unknown, fn: () => unknown) => Promise.resolve(fn())),
      get: jest.fn(),
    },
  },
  {
    provide: ExecutionTimelineRecorderService,
    useValue: {
      recordPoint: jest.fn(),
      recordSpan: jest.fn(),
      startSpan: jest.fn().mockReturnValue({
        spanId: 'mock-span',
        finishSuccess: jest.fn(),
        finishError: jest.fn(),
      }),
      getRingPreview: jest.fn().mockReturnValue([]),
    },
  },
];
