import { Test, TestingModule } from '@nestjs/testing';
import { E2EReplayService } from './e2e-replay.service';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { getTdGoldenReplayFixturesForRun } from './e2e-cases/registry';
import type { E2ECase } from './e2e-case.types';
import {
  buildDecisionLogsForFixture,
  buildGeneratePlanResultForFixture,
} from './e2e-replay.fixture-mocks';

describe('TD-05 golden replay corpus', () => {
  const fixtures = getTdGoldenReplayFixturesForRun();

  it('registry exposes at least one golden fixture', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.every((fixture) => fixture.metadata?.fixtureKind === 'golden')).toBe(true);
  });

  describe.each(fixtures)('$id', (testCase: E2ECase) => {
    let service: E2EReplayService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          E2EReplayService,
          {
            provide: TripDecisionEngineService,
            useValue: {
              generatePlan: jest.fn().mockResolvedValue(buildGeneratePlanResultForFixture(testCase)),
            },
          },
          {
            provide: DecisionLogStorageService,
            useValue: {
              queryLogs: jest.fn().mockResolvedValue(buildDecisionLogsForFixture(testCase)),
            },
          },
        ],
      }).compile();

      service = module.get<E2EReplayService>(E2EReplayService);
    });

    it('replay passes for golden captured fixture', async () => {
      const result = await service.replay(testCase);
      expect(result.case.id).toBe(testCase.id);
      expect(result.passed).toBe(true);
      expect(result.diff.hasDiff).toBe(false);
      expect(result.actual.traceSummary?.schemaVersion).toBe('trace/v1');
    });
  });
});
