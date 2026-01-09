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
      },
    ] as any);

    const result = await service.replay(icelandHighlandsCase);

    expect(result).toBeDefined();
    expect(result.case.id).toBe(icelandHighlandsCase.id);
    expect(result.actual.logs.length).toBeGreaterThan(0);
    expect(result.executionTime).toBeDefined();
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
