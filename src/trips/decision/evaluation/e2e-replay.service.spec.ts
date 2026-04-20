// src/trips/decision/evaluation/e2e-replay.service.spec.ts
/**
 * E2E Replay Service 测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { E2EReplayService } from './e2e-replay.service';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { icelandHighlandsCase } from './e2e-cases/iceland-highlands.example';

describe('E2EReplayService', () => {
  let service: E2EReplayService;
  let decisionEngine: jest.Mocked<TripDecisionEngineService>;
  let logStorage: jest.Mocked<DecisionLogStorageService>;

  beforeEach(async () => {
    const mockDecisionEngine = {
      generatePlan: jest.fn(),
    };

    const mockLogStorage = {
      queryLogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        E2EReplayService,
        {
          provide: TripDecisionEngineService,
          useValue: mockDecisionEngine,
        },
        {
          provide: DecisionLogStorageService,
          useValue: mockLogStorage,
        },
      ],
    }).compile();

    service = module.get<E2EReplayService>(E2EReplayService);
    decisionEngine = module.get(TripDecisionEngineService);
    logStorage = module.get(DecisionLogStorageService);
  });

  it('应该能够回放 E2E Case', async () => {
    // Mock 决策引擎返回
    decisionEngine.generatePlan.mockResolvedValue({
      plan: {
        days: Array(7).fill({}),
      },
      log: {
        tripId: 'test-trip-id',
        routeDirection: {
          selected: {
            uuid: 'test-route-uuid',
          },
        },
        finalStatus: 'ALLOWED',
      },
    } as any);

    // Mock 日志存储返回
    logStorage.queryLogs.mockResolvedValue([
      {
        persona: 'ABU',
        action: 'ALLOW',
        explanation: '通过安全检查',
        reasonCodes: [],
        evidenceRefs: [],
        timestamp: new Date().toISOString(),
        decisionSource: 'PHYSICAL',
        decisionStage: 'ABU_GATE',
        metadata: {},
      },
      {
        persona: 'EXPECTED_UTILITY',
        action: 'EVALUATE',
        explanation: 'search audited',
        reasonCodes: [],
        evidenceRefs: [],
        timestamp: new Date().toISOString(),
        decisionSource: 'UTILITY',
        decisionStage: 'PLAN_SCORE',
        metadata: {
          schemaVersion: 'trace/v1',
          metaDecisionAudit: 'fixture-meta-budget entropy=0.42 cand=12 repair=2',
          candidateSearchBudget: {
            maxCandidates: 12,
            repairMaxIters: 2,
            repairTopKPerCandidate: 3,
            maxNewCandidatesPerIter: 12,
            maxPoolSize: 24,
            stopWhenFeasibleCount: 6,
          },
          candidateSearchAudit: {
            budget: {
              maxCandidates: 12,
              repairMaxIters: 2,
              repairTopKPerCandidate: 3,
              maxNewCandidatesPerIter: 12,
              maxPoolSize: 24,
              stopWhenFeasibleCount: 6,
            },
            initialVariantCount: 4,
            iterations: [
              {
                iter: 0,
                poolSizeBeforeProjection: 5,
                feasibleCountAfterProjection: 5,
                infeasibleCountAfterProjection: 0,
                repairsGenerated: 0,
                repairsAccepted: 0,
                poolSizeAfterDedup: 5,
              },
            ],
            finalCandidateCount: 5,
            finalFeasibleCount: 5,
            stopReason: 'COMPLETED',
          },
        },
      },
    ] as any);

    const result = await service.replay(icelandHighlandsCase);

    expect(result).toBeDefined();
    expect(result.case.id).toBe(icelandHighlandsCase.id);
    expect(result.actual.logs.length).toBeGreaterThan(0);
    expect((result.actual.logs[1] as any).metadata?.candidateSearchAudit?.initialVariantCount).toBe(4);
    expect((result.actual.traceSummary as any)?.candidateSearchAudit?.initialVariantCount).toBe(4);
    expect(logStorage.queryLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: `e2e-${icelandHighlandsCase.id}`,
      }),
    );
    expect(result.executionTime).toBeDefined();
  });

  it('should diff expected trace summary from replay metadata', async () => {
    decisionEngine.generatePlan.mockResolvedValue({
      plan: {
        days: Array(2).fill({}),
      },
      log: {
        tripId: 'trace-trip-id',
        finalStatus: 'ALLOWED',
      },
    } as any);

    logStorage.queryLogs.mockResolvedValue([
      {
        persona: 'EXPECTED_UTILITY',
        action: 'ALLOW',
        explanation: 'search audited',
        reasonCodes: [],
        evidenceRefs: [],
        timestamp: new Date().toISOString(),
        decisionSource: 'UTILITY',
        decisionStage: 'PLAN_SCORE',
        metadata: {
          schemaVersion: 'trace/v1',
          metaDecisionAudit: 'entropy=0.75;cand=18',
          candidateSearchBudget: {
            maxCandidates: 18,
            repairMaxIters: 3,
            repairTopKPerCandidate: 3,
            maxNewCandidatesPerIter: 12,
            maxPoolSize: 36,
          },
          candidateSearchAudit: { initialVariantCount: 3, stopReason: 'COMPLETED' },
        },
      },
    ] as any);

    const result = await service.replay({
      ...icelandHighlandsCase,
      expected: {
        ...icelandHighlandsCase.expected,
        traceSummary: {
          schemaVersion: 'trace/v1',
          metaDecisionAudit: 'entropy=0.75;cand=12',
          candidateSearchBudget: {
            maxCandidates: 12,
            repairMaxIters: 2,
            repairTopKPerCandidate: 2,
            maxNewCandidatesPerIter: 8,
            maxPoolSize: 24,
          },
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.diff.hasDiff).toBe(true);
    expect(result.diff.traceDiff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'metaDecisionAudit',
          message: expect.stringContaining('trace.metaDecisionAudit'),
        }),
        expect.objectContaining({
          key: 'candidateSearchBudget',
          message: expect.stringContaining('trace.candidateSearchBudget'),
        }),
      ]),
    );
  });

  it('应该能够批量回放多个 E2E Cases', async () => {
    decisionEngine.generatePlan.mockResolvedValue({
      plan: { days: Array(7).fill({}) },
      log: {
        tripId: 'test-trip-id',
        finalStatus: 'ALLOWED',
      },
    } as any);

    logStorage.queryLogs.mockResolvedValue([]);

    const cases = [icelandHighlandsCase];
    const results = await service.replayAll(cases);

    expect(results.length).toBe(1);
    expect(results[0].case.id).toBe(icelandHighlandsCase.id);
  });
});
