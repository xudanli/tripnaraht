/**
 * Persona closure loop — offline replay fixtures gate.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { E2EReplayService } from './e2e-replay.service';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { getPersonaClosureFixturesForRun } from './e2e-cases/registry';
import type { E2ECase } from './e2e-case.types';
import {
  buildDecisionLogsForFixture,
  buildGeneratePlanResultForFixture,
} from './e2e-replay.fixture-mocks';
import { analyzeDecisionLogTraceability } from '../contracts/decision-log-traceability.contract';
import { countAbuPostNeptuneRechecks } from '../shared/persona-closure-log.util';

describe('Persona closure E2E replay fixtures', () => {
  const fixtures = getPersonaClosureFixturesForRun();

  it('registry exposes three persona closure fixtures', () => {
    expect(fixtures.length).toBe(3);
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

    it('replay passes personaClosureExpected assertions', async () => {
      const logs = buildDecisionLogsForFixture(testCase);
      expect(analyzeDecisionLogTraceability(logs).valid).toBe(true);

      const pc = testCase.expected.personaClosureExpected;
      if (pc?.minAbuRechecks) {
        expect(countAbuPostNeptuneRechecks(logs)).toBeGreaterThanOrEqual(pc.minAbuRechecks);
      }

      const result = await service.replay(testCase);
      expect(result.passed).toBe(true);
      expect(result.diff.hasDiff).toBe(false);
      expect(result.diff.personaClosureDiff).toBeUndefined();
    });
  });
});
