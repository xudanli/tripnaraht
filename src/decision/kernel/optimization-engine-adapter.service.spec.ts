import { Test, TestingModule } from '@nestjs/testing';
import { OptimizationEngineAdapterService } from './optimization-engine-adapter.service';
import type { DecisionState } from './decision-state.types';
import type { CGUSCandidate, CGUSSearchResult } from '../../trips/decision/optimization/cgus-search.service';
import { CGUSSearchService } from '../../trips/decision/optimization/cgus-search.service';
import { ChunkRetrievalService } from '../../rag/services/chunk-retrieval.service';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';
import { DecisionOSConfigService } from '../../trips/decision/optimization/config';

describe('OptimizationEngineAdapterService', () => {
  const prevKernelCgusRag = process.env.KERNEL_CGUS_RAG_EVIDENCE;
  const prevCgusContrast = process.env.CGUS_INJECT_CONTRAST_CANDIDATES;
  const prevRagPolicyEnforce = process.env.RAG_REALITY_POLICY_ENFORCE;
  afterEach(() => {
    if (prevKernelCgusRag === undefined) delete process.env.KERNEL_CGUS_RAG_EVIDENCE;
    else process.env.KERNEL_CGUS_RAG_EVIDENCE = prevKernelCgusRag;
    if (prevCgusContrast === undefined) delete process.env.CGUS_INJECT_CONTRAST_CANDIDATES;
    else process.env.CGUS_INJECT_CONTRAST_CANDIDATES = prevCgusContrast;
    if (prevRagPolicyEnforce === undefined) delete process.env.RAG_REALITY_POLICY_ENFORCE;
    else process.env.RAG_REALITY_POLICY_ENFORCE = prevRagPolicyEnforce;
  });

  const mkDso = (overrides?: Partial<DecisionState>): DecisionState =>
    ({
      userIntent: { destination: 'X', days: 3, dateRange: { startDate: '2026-01-01', endDate: '2026-01-03' } },
      tripState: {
        planDraft: {
          request_id: 'req-1',
          days: [
            {
              date: '2026-01-01',
              items: [
                { id: 'a', type: 'POI', start_window: '09:00', end_window: '10:00', location_ref: { place_id: 'p1', name: 'P1' } },
                { id: 'b', type: 'POI', start_window: '10:00', end_window: '11:00', location_ref: { place_id: 'p2', name: 'P2' } },
              ],
            },
          ],
        },
      },
      environmentState: { routeDirectionId: 'rd-1' },
      uncertaintyProfile: { hasUncertainty: true, suggestedSampleSize: 50, planningDepth: 1 } as any,
      systemState: { requestId: 'req-1', version: 0, startedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString() },
      requestId: 'req-1',
      ...overrides,
    }) as any;

  it('should pass feasible=true candidates to CGUS when there are no HARD violations', async () => {
    const cgusSearchMock: Pick<CGUSSearchService, 'search'> = {
      search: jest.fn(async (candidates: CGUSCandidate[]) => {
        return {
          rankedCandidates: candidates.map((c, i) => ({ candidate: c, utility: 1 - i * 0.01 })),
          recommended: candidates.find((c) => c.feasible),
          usedMonteCarlo: false,
          usedRollout: false,
          usedExploration: false,
        } as any;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizationEngineAdapterService,
        RagRealityPolicyGateService,
        { provide: CGUSSearchService, useValue: cgusSearchMock },
      ],
    }).compile();

    const service = module.get<OptimizationEngineAdapterService>(OptimizationEngineAdapterService);
    const hints = await service.getHintsAsync(mkDso({ constraints: { feasible: true, violations: [] } as any }));

    expect(hints?.method).toBe('CGUS');
    expect(cgusSearchMock.search).toHaveBeenCalled();
    const call = (cgusSearchMock.search as jest.Mock).mock.calls[0];
    const candidates = call?.[0] as CGUSCandidate[];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.feasible === true)).toBe(true);
  });

  it('AO-04 diversity: CGUS Top-N alternatives must be >1 with differing utility and drift risk', async () => {
    process.env.CGUS_INJECT_CONTRAST_CANDIDATES = '1';

    const cgusSearchMock: Pick<CGUSSearchService, 'search'> = {
      search: jest.fn(async (candidates: CGUSCandidate[]) => {
        // Deterministic tradeoff: "experience" plan has higher utility but lower feasibilityProbability (higher drift).
        const scored = candidates.map((c) => {
          if (c.id === 'plan-high-density') {
            return { candidate: c, utility: 0.95, expectedUtility: 0.92, feasibilityProbability: 0.65 };
          }
          if (c.id === 'plan-relaxed-pace') {
            return { candidate: c, utility: 0.82, expectedUtility: 0.78, feasibilityProbability: 0.95 };
          }
          return { candidate: c, utility: 0.75, expectedUtility: 0.74, feasibilityProbability: 0.9 };
        });
        scored.sort((a, b) => (b.expectedUtility ?? b.utility) - (a.expectedUtility ?? a.utility));
        return {
          rankedCandidates: scored as any,
          recommended: scored.find((x) => x.candidate.feasible)?.candidate,
          usedMonteCarlo: true,
          usedRollout: false,
          usedExploration: false,
        } as any;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizationEngineAdapterService,
        RagRealityPolicyGateService,
        { provide: CGUSSearchService, useValue: cgusSearchMock },
      ],
    }).compile();

    const service = module.get<OptimizationEngineAdapterService>(OptimizationEngineAdapterService);
    const hints = await service.getHintsAsync(mkDso({ constraints: { feasible: true, violations: [] } as any }));

    expect(hints?.method).toBe('CGUS');
    expect(Array.isArray(hints?.alternatives)).toBe(true);
    expect((hints?.alternatives?.length ?? 0)).toBeGreaterThanOrEqual(2);

    const a = hints!.alternatives![0] as any;
    const b = hints!.alternatives![1] as any;
    expect(a.score).not.toBe(b.score);
    expect(typeof a.feasibilityProbability).toBe('number');
    expect(typeof b.feasibilityProbability).toBe('number');

    // Aggressive candidate should have lower feasibilityProbability.
    const planHigh = (hints!.alternatives! as any[]).find((x) => x.id === 'plan-high-density');
    const planRelaxed = (hints!.alternatives! as any[]).find((x) => x.id === 'plan-relaxed-pace');
    expect(planHigh).toBeTruthy();
    expect(planRelaxed).toBeTruthy();
    expect(planHigh.feasibilityProbability).toBeLessThan(planRelaxed.feasibilityProbability);
  });

  it('should not mark candidates feasible in legacy fallback when HARD violations exist (no constraint engine)', async () => {
    const cgusSearchMock: Pick<CGUSSearchService, 'search'> = {
      search: jest.fn(async (candidates: CGUSCandidate[]) => {
        // In this test we only care about the candidates passed in.
        return {
          rankedCandidates: candidates.map((c) => ({ candidate: c, utility: 0.5 })),
          recommended: candidates.find((c) => c.feasible),
          usedMonteCarlo: false,
          usedRollout: false,
          usedExploration: false,
          noFeasibleCandidates: candidates.every((c) => !c.feasible),
        } as unknown as CGUSSearchResult;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizationEngineAdapterService,
        RagRealityPolicyGateService,
        { provide: CGUSSearchService, useValue: cgusSearchMock },
      ],
    }).compile();

    const service = module.get<OptimizationEngineAdapterService>(OptimizationEngineAdapterService);
    const hints = await service.getHintsAsync(
      mkDso({
        constraints: {
          feasible: false,
          violations: [{ type: 'HC_ROAD_CLOSED', severity: 'HARD', degree: 1, message: 'road closed' } as any],
        } as any,
      }),
    );

    expect(cgusSearchMock.search).toHaveBeenCalled();
    const call = (cgusSearchMock.search as jest.Mock).mock.calls[0];
    const candidates = call?.[0] as CGUSCandidate[];
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((c) => c.feasible === false)).toBe(true);

    // If CGUS reports no feasible candidates, adapter should allow upstream degradation (not force CGUS method).
    // (Current lightweight adapter still returns method=CGUS; this assertion is about feasibility propagation.)
    expect(hints).toBeDefined();
  });

  it('buildKernelRagQuery merges destination/country and road-safety tail', () => {
    const q = OptimizationEngineAdapterService.buildKernelRagQuery(
      mkDso({
        userIntent: { destination: 'Iceland Highlands', days: 3 } as any,
        environmentState: { countryCode: 'IS', routeDirectionId: 'rd-1' },
      }),
    );
    expect(q).toMatch(/Iceland Highlands/);
    expect(q).toMatch(/IS/);
    expect(q).toMatch(/road conditions/);
  });

  it('isKernelCgusRagEvidenceEnabled is false by default', () => {
    delete process.env.KERNEL_CGUS_RAG_EVIDENCE;
    expect(OptimizationEngineAdapterService.isKernelCgusRagEvidenceEnabled()).toBe(false);
  });

  it('isKernelCgusRagEvidenceEnabled accepts true/1/yes', () => {
    process.env.KERNEL_CGUS_RAG_EVIDENCE = 'true';
    expect(OptimizationEngineAdapterService.isKernelCgusRagEvidenceEnabled()).toBe(true);
    process.env.KERNEL_CGUS_RAG_EVIDENCE = '1';
    expect(OptimizationEngineAdapterService.isKernelCgusRagEvidenceEnabled()).toBe(true);
    process.env.KERNEL_CGUS_RAG_EVIDENCE = 'yes';
    expect(OptimizationEngineAdapterService.isKernelCgusRagEvidenceEnabled()).toBe(true);
  });

  it('when KERNEL_CGUS_RAG_EVIDENCE enabled (no DecisionOSConfigService), passes retrievalCategoryEvidence into CGUS.search', async () => {
    process.env.RAG_REALITY_POLICY_ENFORCE = '0';
    process.env.KERNEL_CGUS_RAG_EVIDENCE = 'true';
    const now = new Date();
    const retrieve = jest.fn().mockResolvedValue([
      {
        id: 'cid-1',
        chunkId: 'k1',
        content: 'rule text',
        type: 'general',
        credibilityScore: 0.9,
        keywords: [],
        metadata: {},
        fileId: '00000000-0000-4000-8000-000000000001',
        similarity: 0.85,
        category: 'RULES',
        chunkUpdatedAt: now,
      },
    ]);
    const chunkRetrievalMock = { retrieve };
    const cgusSearchMock: Pick<CGUSSearchService, 'search'> = {
      search: jest.fn(async (candidates: CGUSCandidate[]) => ({
        rankedCandidates: candidates.map((c, i) => ({ candidate: c, utility: 1 - i * 0.01 })),
        recommended: candidates.find((c) => c.feasible),
        usedMonteCarlo: false,
        usedRollout: false,
        usedExploration: false,
      })) as any,
    };

    const module = await Test.createTestingModule({
      providers: [
        OptimizationEngineAdapterService,
        RagRealityPolicyGateService,
        { provide: CGUSSearchService, useValue: cgusSearchMock },
        { provide: ChunkRetrievalService, useValue: chunkRetrievalMock },
      ],
    }).compile();

    const service = module.get<OptimizationEngineAdapterService>(OptimizationEngineAdapterService);
    await service.getHintsAsync(mkDso({ constraints: { feasible: true, violations: [] } as any }));

    expect(retrieve).toHaveBeenCalled();
    expect(cgusSearchMock.search).toHaveBeenCalled();
    const searchOpts = (cgusSearchMock.search as jest.Mock).mock.calls[0][2];
    expect(searchOpts?.retrievalCategoryEvidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'RULES' })]),
    );
  });

  it('when ragEvidence.enabled=true in DecisionOSConfigService, passes retrievalCategoryEvidence into CGUS.search', async () => {
    process.env.RAG_REALITY_POLICY_ENFORCE = '0';
    delete process.env.KERNEL_CGUS_RAG_EVIDENCE;
    const now = new Date();
    const retrieve = jest.fn().mockResolvedValue([
      {
        id: 'cid-1',
        chunkId: 'k1',
        content: 'rule text',
        type: 'general',
        credibilityScore: 0.9,
        keywords: [],
        metadata: {},
        fileId: '00000000-0000-4000-8000-000000000001',
        similarity: 0.85,
        category: 'RULES',
        chunkUpdatedAt: now,
      },
    ]);
    const chunkRetrievalMock = { retrieve };
    const cgusSearchMock: Pick<CGUSSearchService, 'search'> = {
      search: jest.fn(async (candidates: CGUSCandidate[]) => ({
        rankedCandidates: candidates.map((c, i) => ({ candidate: c, utility: 1 - i * 0.01 })),
        recommended: candidates.find((c) => c.feasible),
        usedMonteCarlo: false,
        usedRollout: false,
        usedExploration: false,
      })) as any,
    };

    const module = await Test.createTestingModule({
      providers: [
        OptimizationEngineAdapterService,
        RagRealityPolicyGateService,
        { provide: CGUSSearchService, useValue: cgusSearchMock },
        { provide: ChunkRetrievalService, useValue: chunkRetrievalMock },
        {
          provide: DecisionOSConfigService,
          useFactory: () =>
            new DecisionOSConfigService({
              ragEvidence: { enabled: true, minQueryLength: 1, confidenceThreshold: 0.25 },
            } as any),
        },
      ],
    }).compile();

    const service = module.get<OptimizationEngineAdapterService>(OptimizationEngineAdapterService);
    await service.getHintsAsync(mkDso({ constraints: { feasible: true, violations: [] } as any }));

    expect(retrieve).toHaveBeenCalled();
    expect(cgusSearchMock.search).toHaveBeenCalled();
    const searchOpts = (cgusSearchMock.search as jest.Mock).mock.calls[0][2];
    expect(searchOpts?.retrievalCategoryEvidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'RULES' })]),
    );
  });

  it('buildKernelRagQuery returns undefined when no usable fields', () => {
    expect(
      OptimizationEngineAdapterService.buildKernelRagQuery(
        mkDso({
          userIntent: { days: 3 } as any,
          tripState: { planDraft: (mkDso() as any).tripState.planDraft },
          environmentState: {},
        }),
      ),
    ).toBeUndefined();
  });

  it('buildKernelRagQuery respects minQueryLength', () => {
    const state = mkDso({
      userIntent: { destination: 'X', days: 3 } as any,
      environmentState: {},
    });
    expect(OptimizationEngineAdapterService.buildKernelRagQuery(state, { minQueryLength: 2 })).toBeUndefined();
    expect(OptimizationEngineAdapterService.buildKernelRagQuery(state, { minQueryLength: 1 })).toMatch(/road conditions/);
  });

  it('plumbs systemState.emergency_constraints.forbidden_modes into CGUS search options', async () => {
    const cgusSearchMock: Pick<CGUSSearchService, 'search'> = {
      search: jest.fn(async (candidates: CGUSCandidate[], _world: any, options: any) => {
        // Assert at the "nerve ending": adapter must pass forbidden_modes down to CGUS.
        expect(options?.emergencyConstraints?.forbidden_modes).toEqual(expect.arrayContaining(['DRIVE']));
        return {
          rankedCandidates: candidates.map((c) => ({ candidate: c, utility: 0.7 })),
          recommended: candidates[0],
          usedMonteCarlo: false,
          usedRollout: false,
          usedExploration: false,
        } as any;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizationEngineAdapterService,
        RagRealityPolicyGateService,
        { provide: CGUSSearchService, useValue: cgusSearchMock },
        // prevent optional injections from causing missing-provider failures in some envs
        { provide: ChunkRetrievalService, useValue: { retrieve: jest.fn().mockResolvedValue([]) } },
        { provide: DecisionOSConfigService, useValue: { get: jest.fn().mockReturnValue({ enabled: false }) } },
      ],
    }).compile();

    const service = module.get<OptimizationEngineAdapterService>(OptimizationEngineAdapterService);
    const dso = mkDso({
      constraints: { feasible: true, violations: [] } as any,
      systemState: {
        ...(mkDso().systemState as any),
        emergency_constraints: { forbidden_modes: ['DRIVE'], reason_code: 'HEALING_DRIVE_SAFETY_FAILED' },
      } as any,
    });
    const hints = await service.getHintsAsync(dso);
    expect(hints?.method).toBe('CGUS');
    expect(cgusSearchMock.search).toHaveBeenCalled();
  });
});

