/**
 * PR-3 integration — F208 封路 → CandidateSearchPipeline 生成 repair-spatial-poi-v2。
 */
import { Test, TestingModule } from '@nestjs/testing';
import { OptimizationEngineAdapterService } from './optimization-engine-adapter.service';
import { CGUSSearchService } from '../../trips/decision/optimization/cgus-search.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import { PlanFeaturesService } from '../../trips/decision/optimization/plan-features/plan-features.service';
import { ConstraintEngineService } from '../../trips/decision/constraints/constraint-engine.service';
import { REPAIR_SPATIAL_POI_V2_ID } from '../../trips/decision/constraint-graph/topology-mutation.util';
import type { DecisionState } from './decision-state.types';

describe('PR-3 Topology Mutation — candidate pipeline integration', () => {
  const prevPipeline = process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE;

  afterEach(() => {
    if (prevPipeline === undefined) delete process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE;
    else process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE = prevPipeline;
  });

  const mkDso = (): DecisionState =>
    ({
      userIntent: {
        destination: 'IS',
        days: 5,
        dateRange: { startDate: '2026-01-12', endDate: '2026-01-17' },
      },
      tripState: {
        planDraft: {
          request_id: 'req-f208-storm',
          days: [
            {
              date: '2026-01-13',
              items: [
                {
                  id: 'd1-a',
                  type: 'POI',
                  start_window: '09:00',
                  end_window: '12:00',
                  location_ref: { place_id: 'reykjavik', name: 'Reykjavik' },
                },
                {
                  id: 'd2-f208',
                  type: 'DRIVE',
                  start_window: '13:00',
                  end_window: '17:00',
                  location_ref: { place_id: 'f208', name: 'F208 Highland' },
                },
              ],
            },
          ],
        },
      },
      environmentState: { routeDirectionId: 'is-ring-road', countryCode: 'IS', month: 1 },
      constraints: {
        feasible: false,
        violations: [
          {
            type: 'WORLD_ROAD_CLOSED',
            severity: 'HARD',
            degree: 1,
            detail: 'F208:seasonal_closure',
          },
        ],
      },
      research_data: {
        worldModel: {
          physical: {
            demEvidence: [],
            roadStates: [{ roadId: 'F208', status: 'CLOSED' }],
            hazardZones: [],
            ferryStates: [],
            countryCode: 'IS',
            month: 1,
          },
          human: {
            profileId: 'h',
            maxDailyAscentM: 800,
            rollingAscent3DaysM: 2000,
            maxSlopePct: 25,
            preferredPace: 'MEDIUM',
            riskTolerance: 'MEDIUM',
            highAltitudeExperience: 'NONE',
          },
          routeDirection: {
            id: 'is-ring-road',
            countryCode: 'IS',
            name: 'r',
            nameCN: 'r',
            nameEN: 'r',
            tags: [],
          },
        },
      },
      uncertaintyProfile: { entropy01: 0.91, hasUncertainty: true },
      systemState: {
        requestId: 'req-f208-storm',
        version: 0,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      },
      requestId: 'req-f208-storm',
    }) as any;

  it('generates repair-spatial-poi-v2 when F208 is closed and pipeline repair runs', async () => {
    process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE = '1';

    const planHasTopologyRepair = (tripPlan: { days?: Array<{ segments?: Array<{ metadata?: Record<string, unknown> }> }> }) => {
      const segs = (tripPlan?.days ?? []).flatMap((d) => d.segments ?? []);
      return segs.some((s) => s.metadata?.topologyMutation === 'RING_ROAD_CONTINUITY');
    };

    const constraintEngineMock = {
      isFeasible: jest.fn(async (_world: unknown, tripPlan: { days?: Array<{ segments?: unknown[] }> }) => {
        if (planHasTopologyRepair(tripPlan as any)) {
          return {
            feasible: true,
            violations: [],
            rawCheckResult: { violations: [], isValid: true, summary: { errorCount: 0, warningCount: 0, infoCount: 0 } },
          };
        }
        return {
          feasible: false,
          violations: [{ code: 'WORLD_ROAD_CLOSED', severity: 'error', message: 'F208 closed' }],
          rawCheckResult: { violations: [], isValid: false, summary: { errorCount: 1, warningCount: 0, infoCount: 0 } },
        };
      }),
    };

    const searchSpy = jest.fn(async (candidates: Array<{ id: string }>) => {
      const repair = candidates.find((c) => c.id === REPAIR_SPATIAL_POI_V2_ID);
      const ranked = candidates.map((c, i) => ({
        candidate: c,
        utility: c.id === REPAIR_SPATIAL_POI_V2_ID ? 0.82 : 0.12 - i * 0.01,
        expectedUtility: c.id === REPAIR_SPATIAL_POI_V2_ID ? 0.82 : 0.12,
        feasibilityProbability: c.id === REPAIR_SPATIAL_POI_V2_ID ? 0.71 : 0.04,
      }));
      ranked.sort((a, b) => (b.expectedUtility ?? 0) - (a.expectedUtility ?? 0));
      return {
        rankedCandidates: ranked,
        recommended: repair ?? ranked[0]?.candidate,
        usedMonteCarlo: true,
        usedRollout: false,
        usedExploration: false,
        monteCarloSamplingDetails: { totalSamples: 200, samplesPerCandidate: {} },
      };
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizationEngineAdapterService,
        RagRealityPolicyGateService,
        PlanFeaturesService,
        { provide: CGUSSearchService, useValue: { search: searchSpy } },
        { provide: ConstraintEngineService, useValue: constraintEngineMock },
      ],
    }).compile();

    const service = module.get(OptimizationEngineAdapterService);
    const hints = await service.getHintsAsync(mkDso());

    expect(hints?.method).toBe('CGUS');
    expect(searchSpy).toHaveBeenCalled();
    const candidateIds = (searchSpy.mock.calls[0][0] as Array<{ id: string }>).map((c) => c.id);
    expect(candidateIds).toContain(REPAIR_SPATIAL_POI_V2_ID);
    expect(hints?.recommendedAlternativeId).toBe(REPAIR_SPATIAL_POI_V2_ID);
    expect(hints?.decisionVerdict?.fallback_chain?.some((f) => f.step === 'repair_accept')).toBe(true);
    expect(hints?.decisionVerdict?.fallback_chain?.some((f) => f.step === 'mc_rank_authority')).toBe(true);
  });
});
