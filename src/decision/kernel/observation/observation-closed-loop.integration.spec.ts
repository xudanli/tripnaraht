/**
 * 观测闭环集成：VOI → RESEARCH harness → Belief / excludePoiIds（确定性 Stub，无外部 API）。
 */
import { Test, TestingModule } from '@nestjs/testing';
import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { DecisionState } from '../decision-state.types';
import type { ObservationExecutionResult, ObservationToolExecutor } from './observation-harness.types';
import { computeObservationVoi, rankObservationActionsFromSignals } from '../voi-observation.util';
import { ObservationHarnessService, OBSERVATION_TOOL_EXECUTOR } from './observation-harness.service';
import { SenjaStormObservationExecutor } from './observation-tool-executors';
import { integratePassabilityIntoBeliefSamples } from './belief-observation-integrator';
import { MetaDecisionBudgetAllocatorService } from '../meta-decision-budget-allocator.service';

const RISK_POI = 'senja-high-route-poi';

function buildStormDso(overrides?: Partial<DecisionState>): DecisionState {
  const base: DecisionState = {
    requestId: 'e2e-obs-closed-loop',
    systemState: { requestId: 'e2e-obs-closed-loop', version: 1 },
    userIntent: {
      destination: { lat: 69.3, lng: 17.8 },
      mustIncludePoiIds: [RISK_POI],
      excludePoiIds: [],
    },
    environmentState: {
      countryCode: 'NO',
      weatherRisk: 0.9,
      failureRiskLevel: 'HIGH',
    },
    tripState: {},
  } as DecisionState;
  return { ...base, ...overrides };
}

/** 两路 passability 极端分歧，触发 harness 的 CROSS_OBSERVATION_SPREAD / suggestDilemmaElicitation */
class ContradictingPassabilityExecutor implements ObservationToolExecutor {
  async execute(action: TripObservationAction, _dso: DecisionState): Promise<ObservationExecutionResult> {
    if (action.type === 'OBSERVATION_SNS_CRAWL') {
      return {
        evidenceKind: 'recent_social_image',
        evidenceWeight: 0.82,
        passability01: 0.91,
        summary: 'aggregated: passable',
      };
    }
    return {
      evidenceKind: 'poi_operator',
      evidenceWeight: 0.78,
      passability01: 0.14,
      summary: 'operator: access difficult',
    };
  }
}

describe('Observation closed loop (integration)', () => {
  it('Assert 1: high weatherRisk yields SNS observation with VOI above trivial repair-opportunity cost proxy', () => {
    const ranked = rankObservationActionsFromSignals({
      utilityBefore: 0.55,
      entropy01: 0.55,
      weatherRisk01: 0.9,
      fragilePoiIds: [RISK_POI],
      geo: { lat: 69.3, lng: 17.8 },
      utilityPerEntropyUnit: 0.42,
      defaultCostSns: 0.06,
      defaultCostPoi: 0.14,
    });
    const sns = ranked.find(r => r.action.type === 'OBSERVATION_SNS_CRAWL');
    expect(sns).toBeDefined();
    const repairCostProxy = 0.02;
    const trivialRepairVoi = computeObservationVoi({
      utilityBefore: 0.55,
      expectedUtilityAfter: 0.55,
      cost01: repairCostProxy,
    });
    expect(sns!.voiScore).toBeGreaterThan(trivialRepairVoi);
  });

  it('Assert 2 & 3: harness executes SNS, marks infeasible, excludes POI; belief passability drops', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservationHarnessService,
        { provide: OBSERVATION_TOOL_EXECUTOR, useValue: new SenjaStormObservationExecutor([RISK_POI]) },
      ],
    }).compile();

    const harness = module.get(ObservationHarnessService);
    const dso = buildStormDso();
    const out = await harness.handleObservations(dso);

    expect(out.executedActions.some(a => a.type === 'OBSERVATION_SNS_CRAWL')).toBe(true);
    const snsAudit = out.audit.find(a => a.recommendation.action.type === 'OBSERVATION_SNS_CRAWL');
    expect(snsAudit?.execution.routeSegmentInfeasible).toBe(true);
    expect(out.excludedPoiIds).toContain(RISK_POI);
    expect(out.passabilityEvidence?.passability01).toBeCloseTo(0.2, 5);
    expect(out.passabilityEvidence?.evidenceWeight).toBeCloseTo(0.9, 5);

    const meta = new MetaDecisionBudgetAllocatorService();
    const mergedEnv = { ...dso.environmentState, ...out.environmentPatch } as DecisionState['environmentState'];
    const dso2 = { ...dso, environmentState: mergedEnv } as DecisionState;
    const samples = meta.buildBeliefSamples(dso2, 24, 0.75);
    const refined = out.passabilityEvidence
      ? integratePassabilityIntoBeliefSamples(samples, out.passabilityEvidence)
      : samples;
    const meanP =
      refined.reduce((s, x) => s + (x.environmentSummary?.passability ?? 0), 0) / Math.max(1, refined.length);
    expect(meanP).toBeLessThan(0.45);
  });

  it('prefers optimizationHints.observationRecommendations when present on DSO', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObservationHarnessService,
        { provide: OBSERVATION_TOOL_EXECUTOR, useValue: new SenjaStormObservationExecutor([RISK_POI]) },
      ],
    }).compile();
    const harness = module.get(ObservationHarnessService);
    const dso = buildStormDso({
      optimizationHints: {
        observationRecommendations: [
          {
            action: {
              type: 'OBSERVATION_SNS_CRAWL',
              center: { lat: 69.3, lng: 17.8 },
              estimatedCost01: 0.1,
            },
            voiScore: 0.4,
            voiAudit: { utilityBefore: 0.5, expectedUtilityAfter: 0.62, costPenalty: 0.1 },
          },
        ],
      },
    } as DecisionState);

    const out = await harness.handleObservations(dso);
    expect(out.audit[0].recommendation.voiScore).toBe(0.4);
  });

  it('cross-observation passability spread triggers suggestDilemmaElicitation', async () => {
    const prevV = process.env.OBSERVATION_VOI_THRESHOLD;
    const prevM = process.env.OBSERVATION_MAX_ACTIONS;
    process.env.OBSERVATION_VOI_THRESHOLD = '-1';
    process.env.OBSERVATION_MAX_ACTIONS = '2';
    try {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ObservationHarnessService,
          { provide: OBSERVATION_TOOL_EXECUTOR, useClass: ContradictingPassabilityExecutor },
        ],
      }).compile();
      const harness = module.get(ObservationHarnessService);
      const base = buildStormDso();
      const dso = buildStormDso({
        userIntent: { ...base.userIntent, mustIncludePoiIds: ['p-corridor'] },
      });
      const out = await harness.handleObservations(dso);
      const oh = out.researchDataPatch.observationHarness as Record<string, unknown> | undefined;
      expect(oh?.suggestDilemmaElicitation).toBeDefined();
      expect((oh?.suggestDilemmaElicitation as { crossSpread?: number }).crossSpread).toBeGreaterThanOrEqual(0.45);
    } finally {
      if (prevV === undefined) delete process.env.OBSERVATION_VOI_THRESHOLD;
      else process.env.OBSERVATION_VOI_THRESHOLD = prevV;
      if (prevM === undefined) delete process.env.OBSERVATION_MAX_ACTIONS;
      else process.env.OBSERVATION_MAX_ACTIONS = prevM;
    }
  });
});
