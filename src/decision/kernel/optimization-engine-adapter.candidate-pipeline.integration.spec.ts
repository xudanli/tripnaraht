import { Test, TestingModule } from '@nestjs/testing';
import { OptimizationEngineAdapterService } from './optimization-engine-adapter.service';
import { CGUSSearchService } from '../../trips/decision/optimization/cgus-search.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import { PlanFeaturesService } from '../../trips/decision/optimization/plan-features/plan-features.service';
import { ConstraintEngineService } from '../../trips/decision/constraints/constraint-engine.service';
import type { DecisionState } from './decision-state.types';

describe('OptimizationEngineAdapterService — candidate pipeline integration', () => {
  const prevPipeline = process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE;

  afterEach(() => {
    if (prevPipeline === undefined) delete process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE;
    else process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE = prevPipeline;
  });

  const mkDso = (): DecisionState =>
    ({
      userIntent: { destination: 'IS', days: 3, dateRange: { startDate: '2026-10-12', endDate: '2026-10-15' } },
      tripState: {
        planDraft: {
          request_id: 'req-pipeline',
          days: [
            {
              date: '2026-10-13',
              items: [
                { id: 'a', type: 'POI', start_window: '09:00', end_window: '10:00', location_ref: { place_id: 'p1', name: 'P1' } },
                { id: 'b', type: 'POI', start_window: '10:00', end_window: '11:00', location_ref: { place_id: 'p2', name: 'P2' } },
              ],
            },
          ],
        },
      },
      environmentState: { routeDirectionId: 'rd-is', countryCode: 'IS', month: 10 },
      constraints: { feasible: true, violations: [] },
      research_data: {
        worldModel: {
          physical: { demEvidence: [], roadStates: [], hazardZones: [], ferryStates: [], countryCode: 'IS', month: 10 },
          human: {
            profileId: 'h',
            maxDailyAscentM: 800,
            rollingAscent3DaysM: 2000,
            maxSlopePct: 25,
            preferredPace: 'MEDIUM',
            riskTolerance: 'MEDIUM',
            highAltitudeExperience: 'NONE',
          },
          routeDirection: { id: 'rd-is', countryCode: 'IS', name: 'r', nameCN: 'r', nameEN: 'r', tags: [] },
        },
      },
      systemState: { requestId: 'req-pipeline', version: 0, startedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString() },
      requestId: 'req-pipeline',
    }) as any;

  it('uses CandidateSearchPipeline when KERNEL_CGUS_USE_CANDIDATE_PIPELINE=1', async () => {
    process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE = '1';

    const searchSpy = jest.fn(async (candidates: unknown[]) => ({
      rankedCandidates: (candidates as any[]).map((c, i) => ({ candidate: c, utility: 1 - i * 0.1 })),
      recommended: (candidates as any[])[0],
      usedMonteCarlo: false,
      usedRollout: false,
      usedExploration: false,
    }));

    const constraintEngineMock = {
      isFeasible: jest.fn(async () => ({
        feasible: true,
        violations: [],
        rawCheckResult: { violations: [], isValid: true, summary: { errorCount: 0, warningCount: 0, infoCount: 0 } },
      })),
    };

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
    expect(hints?.candidateSearchAudit?.initialVariantCount).toBeGreaterThan(0);
    expect(searchSpy).toHaveBeenCalled();
    const ids = (searchSpy.mock.calls[0][0] as any[]).map((c) => c.id);
    expect(ids.some((id) => !id.startsWith('plan-relaxed-pace') || ids.length > 0)).toBe(true);
    expect(hints?.decisionVerdict?.fallback_chain?.some((f) => f.step === 'candidate_generation')).toBe(true);
  });
});
