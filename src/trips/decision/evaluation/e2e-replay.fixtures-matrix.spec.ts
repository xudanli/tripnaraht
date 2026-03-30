/**
 * TD-05：真实 fixture 注册表 + 与 expected 对齐的 mock，全量 / CI 分片均可。
 */
import { Test, TestingModule } from '@nestjs/testing';
import { E2EReplayService } from './e2e-replay.service';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { getTdReplayFixturesForRun } from './e2e-cases/registry';
import type { E2ECase } from './e2e-case.types';
import {
  buildDecisionLogsForFixture,
  buildGeneratePlanResultForFixture,
} from './e2e-replay.fixture-mocks';
import { analyzeDecisionLogTraceability } from '../contracts/decision-log-traceability.contract';

describe('TD-05 E2E replay fixtures (registry + matrix)', () => {
  const fixtures = getTdReplayFixturesForRun();

  it('registry exposes at least one fixture', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(fixtures)('$id', (testCase: E2ECase) => {
    let service: E2EReplayService;

    beforeEach(async () => {
      const generatePlan = jest.fn().mockResolvedValue(buildGeneratePlanResultForFixture(testCase));
      const queryLogs = jest.fn().mockResolvedValue(buildDecisionLogsForFixture(testCase));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          E2EReplayService,
          { provide: TripDecisionEngineService, useValue: { generatePlan } },
          { provide: DecisionLogStorageService, useValue: { queryLogs } },
        ],
      }).compile();

      service = module.get<E2EReplayService>(E2EReplayService);
    });

    it('replay passes analyzeDiff for fixture expected', async () => {
      const logs = buildDecisionLogsForFixture(testCase);
      const tr = analyzeDecisionLogTraceability(logs);
      expect(tr.valid).toBe(true);

      const result = await service.replay(testCase);
      expect(result.case.id).toBe(testCase.id);
      expect(result.passed).toBe(true);
      expect(result.diff.hasDiff).toBe(false);
    });
  });
});
