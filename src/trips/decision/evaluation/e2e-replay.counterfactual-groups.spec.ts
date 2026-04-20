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

describe('TD-05 counterfactual replay groups', () => {
  const fixtures = getTdReplayFixturesForRun();

  function makeService(testCase: E2ECase) {
    return Test.createTestingModule({
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
  }

  it('counterfactual fixtures shift outcomes directionally against their baseline', async () => {
    const fixtureMap = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
    const counterfactuals = fixtures.filter((fixture) => fixture.metadata?.baselineCaseId);

    expect(counterfactuals.length).toBeGreaterThan(0);

    for (const testCase of counterfactuals) {
      const baseline = fixtureMap.get(testCase.metadata?.baselineCaseId ?? '');
      expect(baseline).toBeDefined();

      const baselineModule: TestingModule = await makeService(baseline!);
      const counterfactualModule: TestingModule = await makeService(testCase);
      const baselineService = baselineModule.get<E2EReplayService>(E2EReplayService);
      const counterfactualService = counterfactualModule.get<E2EReplayService>(E2EReplayService);

      const baselineReplay = await baselineService.replay(baseline!);
      const counterfactualReplay = await counterfactualService.replay(testCase);

      expect(baselineReplay.passed).toBe(true);
      expect(counterfactualReplay.passed).toBe(true);

      const expectation = testCase.metadata?.counterfactualExpectation;
      expect(expectation).toBeDefined();

      if (expectation?.expectedOutcomeShift === 'ADD_ADJUST') {
        expect(baselineReplay.actual.logs.some((log) => log.decisionStage === 'PACE_ADJUST')).toBe(false);
        expect(counterfactualReplay.actual.logs.some((log) => log.decisionStage === 'PACE_ADJUST')).toBe(true);
      }

      if (expectation?.expectedOutcomeShift === 'ADD_REPAIR') {
        expect(baselineReplay.actual.logs.some((log) => log.decisionStage === 'SPATIAL_REPAIR')).toBe(false);
        expect(counterfactualReplay.actual.logs.some((log) => log.decisionStage === 'SPATIAL_REPAIR')).toBe(true);
      }

      if (expectation?.expectedOutcomeShift === 'ADD_ADJUST_AND_REPAIR') {
        expect(baselineReplay.actual.logs.some((log) => log.decisionStage === 'PACE_ADJUST')).toBe(false);
        expect(baselineReplay.actual.logs.some((log) => log.decisionStage === 'SPATIAL_REPAIR')).toBe(false);
        expect(counterfactualReplay.actual.logs.some((log) => log.decisionStage === 'PACE_ADJUST')).toBe(true);
        expect(counterfactualReplay.actual.logs.some((log) => log.decisionStage === 'SPATIAL_REPAIR')).toBe(true);
      }

      if (expectation?.expectedOutcomeShift === 'REJECT') {
        expect(baselineReplay.actual.finalPlan?.allowed).toBe(true);
        expect(counterfactualReplay.actual.finalPlan?.allowed).toBe(false);
      }

      const baselineBudget = baselineReplay.actual.traceSummary?.candidateSearchBudget;
      const currentBudget = counterfactualReplay.actual.traceSummary?.candidateSearchBudget;
      if (
        expectation?.minCandidateBudgetDelta !== undefined &&
        baselineBudget &&
        currentBudget
      ) {
        expect(currentBudget.maxCandidates - baselineBudget.maxCandidates).toBeGreaterThanOrEqual(
          expectation.minCandidateBudgetDelta,
        );
      }
      if (
        expectation?.minRepairMaxItersDelta !== undefined &&
        baselineBudget &&
        currentBudget
      ) {
        expect(currentBudget.repairMaxIters - baselineBudget.repairMaxIters).toBeGreaterThanOrEqual(
          expectation.minRepairMaxItersDelta,
        );
      }
      for (const stage of expectation?.requiredAdditionalStages ?? []) {
        expect(counterfactualReplay.actual.logs.some((log) => log.decisionStage === stage)).toBe(true);
      }
    }
  });
});
