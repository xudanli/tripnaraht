import { CGUSSearchService, type CGUSCandidate } from './cgus-search.service';
import { UnifiedDecisionFormulaService } from './unified-decision-formula.service';
import { PlanFeaturesService } from './plan-features/plan-features.service';
import { ExposureMapService } from './plan-features/exposure-map.service';
import { NoopCandidateScorerService } from './scoring/noop-candidate-scorer.service';

describe('CGUSSearchService (rollout-aware rerank)', () => {
  it('should rerank by rollout-aware score when rollout enabled', async () => {
    const unified = new UnifiedDecisionFormulaService();
    const planFeatures = new PlanFeaturesService();

    // Mock probabilistic world model: returns worse rollout for candidate A.
    const probabilisticWorldModel: any = {
      fromDeterministicModel: jest.fn((_ctx: any) => ({})),
      predictOutcome: jest.fn((_prob: any, action: any) => {
        const id = action?.payload?.candidateId;
        if (id === 'A') return { feasibilityProbability: 0.2, estimatedUtility: 0.2 };
        if (id === 'B') return { feasibilityProbability: 0.9, estimatedUtility: 0.9 };
        return { feasibilityProbability: 0.8, estimatedUtility: 0.8 };
      }),
    };

    const service = new CGUSSearchService(
      unified,
      undefined,
      undefined,
      probabilisticWorldModel,
      undefined,
      undefined,
      undefined,
      planFeatures,
      new ExposureMapService(),
      undefined,
    );

    const makePlan = (segmentsCount: number) => ({
      tripId: 't',
      routeDirectionId: 'rd-1',
      segments: Array.from({ length: segmentsCount }).map((_, i) => ({
        dayIndex: 0,
        distanceKm: 5,
        ascentM: 100,
        segmentId: `s${i}`,
      })),
    });

    const candidates: CGUSCandidate[] = [
      {
        id: 'A',
        plan: makePlan(3) as any,
        feasible: true,
        constraintViolations: [],
      },
      {
        id: 'B',
        plan: makePlan(3) as any,
        feasible: true,
        constraintViolations: [],
      },
    ];

    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    const result = await service.search(candidates, worldContext, {
      useMonteCarlo: false,
      useUtilityPrior: false,
      useWorldModelRollout: true,
      rolloutTopK: 2,
      rolloutHorizonSteps: 3,
    });

    // Base utilities could tie; rollout should make B rank above A.
    expect(result.usedRollout).toBe(true);
    expect(result.rankedCandidates[0].candidate.id).toBe('B');
    expect(result.rankedCandidates[0].rolloutPrediction).toBeTruthy();
    expect((result.rankedCandidates[0] as any).finalScore).toBeDefined();
    expect((result.rankedCandidates[0] as any).scoreBreakdown).toBeDefined();

    // Multi-step rollout should call predictOutcome per candidate per horizon step.
    expect(probabilisticWorldModel.predictOutcome).toHaveBeenCalled();
    // 2 candidates * horizon(3)
    expect(probabilisticWorldModel.predictOutcome.mock.calls.length).toBe(2 * 3);
  });
});

describe('CGUSSearchService (pilot variance allocation)', () => {
  it('should allocate more samples to higher-variance candidate under same utilityPrior', async () => {
    const unified = new UnifiedDecisionFormulaService();

    const probabilisticWorldModel: any = {
      fromDeterministicModel: jest.fn((_ctx: any) => ({})),
    };

    const expectedUtility: any = {
      computeExpectedUtility: jest.fn((plan: any, _ctx: any, _weights: any, config: any) => {
        const isHighVar = String(plan?.tripId ?? '').includes('highVar');
        const variance = isHighVar ? 0.25 : 0.01;
        return {
          expectedUtility: 0.7,
          statistics: { mean: 0.7, variance, stdDev: Math.sqrt(variance), median: 0.7, quantiles: { q5: 0.4, q25: 0.6, q75: 0.8, q95: 0.9 } },
          confidenceInterval: { lower: 0.6, upper: 0.8, level: 0.95 },
          dimensionExpectations: {
            safety: 0.8,
            experience: 0.7,
            philosophy: 0.8,
            timeSlack: 0.7,
            fatigueRisk: 0.2,
            weatherRisk: 0.1,
            budgetOverrun: 0.1,
            pacingVariance: 0.1,
          },
          riskMetrics: { downRiskProbability: 0.1, worstCase: 0.4, bestCase: 0.9, volatility: Math.sqrt(variance) },
          feasibilityProbability: 0.9,
          samplingDetails: { totalSamples: config.sampleSize, convergenceAchieved: false, effectiveSampleSize: config.sampleSize },
        };
      }),
    };

    const service = new CGUSSearchService(
      unified,
      undefined,
      expectedUtility,
      probabilisticWorldModel,
      undefined,
      undefined,
      undefined,
      undefined, // planFeatures off to keep utilityPrior identical (dimension mean)
      undefined, // exposureMap not needed here
      undefined,
    );

    const makePlan = (tripId: string) => ({
      tripId,
      routeDirectionId: 'rd-1',
      segments: [{ dayIndex: 0, distanceKm: 5, ascentM: 100, segmentId: 's1', slopePct: 0, metadata: { poiId: 'p1' } }],
    });

    const candidates: CGUSCandidate[] = [
      { id: 'high', plan: makePlan('highVar') as any, feasible: true, constraintViolations: [] },
      { id: 'low', plan: makePlan('lowVar') as any, feasible: true, constraintViolations: [] },
    ];

    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    const result = await service.search(candidates, worldContext, {
      useMonteCarlo: true,
      useUtilityPrior: true,
      useUtilityWeightedSampling: true,
      sampleSize: 200,
    });

    const samples = result.monteCarloSamplingDetails?.samplesPerCandidate ?? {};
    expect(samples['high']).toBeGreaterThan(samples['low']);
    expect(result.monteCarloSamplingDetails?.pilotVariancePerCandidate?.['high']).toBeGreaterThan(
      result.monteCarloSamplingDetails?.pilotVariancePerCandidate?.['low'] ?? 0,
    );
  }, 20000);
});

describe('CGUSSearchService (candidate scorer sidecar)', () => {
  it('should attach noop scorer sidecar in shadow mode without changing ranking', async () => {
    const unified = new UnifiedDecisionFormulaService();
    const noop = new NoopCandidateScorerService();
    const service = new CGUSSearchService(
      unified,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      noop,
    );

    const candidates: CGUSCandidate[] = [
      {
        id: 'x',
        plan: { tripId: 't', routeDirectionId: 'rd', segments: [] } as any,
        feasible: true,
        constraintViolations: [],
      },
      {
        id: 'y',
        plan: { tripId: 't', routeDirectionId: 'rd', segments: [] } as any,
        feasible: true,
        constraintViolations: [{ type: 'TIME', severity: 'SOFT', degree: 0.9 }],
      },
    ];

    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    const result = await service.search(candidates, worldContext, {
      useMonteCarlo: false,
      candidateScorer: { mode: 'shadow' },
    });

    expect(result.rankedCandidates).toHaveLength(2);
    expect(result.rankedCandidates[0].scorerSidecar?.candidateId).toBe(result.rankedCandidates[0].candidate.id);
    expect(result.rankedCandidates[0].scorerSidecar?.modelVersion).toContain('noop');
  });

  it('coerces candidateScorer mode active to shadow when invoking scorer', async () => {
    const unified = new UnifiedDecisionFormulaService();
    const noop = new NoopCandidateScorerService();
    const spy = jest.spyOn(noop, 'score');
    const service = new CGUSSearchService(
      unified,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      noop,
    );

    const candidates: CGUSCandidate[] = [
      {
        id: 'only',
        plan: { tripId: 't', routeDirectionId: 'rd', segments: [] } as any,
        feasible: true,
        constraintViolations: [],
      },
    ];
    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    await service.search(candidates, worldContext, {
      useMonteCarlo: false,
      candidateScorer: { mode: 'active' },
    });

    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0].mode).toBe('shadow');
    spy.mockRestore();
  });
});

describe('CGUSSearchService (emergency hard mask)', () => {
  it('prunes DRIVE segments from the search space when forbidden_modes includes DRIVE', async () => {
    const unified = new UnifiedDecisionFormulaService();
    const service = new CGUSSearchService(unified);

    const makePlan = (types: string[]) => ({
      tripId: 't',
      routeDirectionId: 'rd-1',
      segments: types.map((t, i) => ({
        dayIndex: 0,
        distanceKm: 5,
        ascentM: 0,
        slopePct: 0,
        segmentId: `s${i}`,
        metadata: { type: t },
      })),
    });

    const candidates: CGUSCandidate[] = [
      { id: 'A', plan: makePlan(['POI', 'DRIVE', 'POI']) as any, feasible: true, constraintViolations: [] },
      { id: 'B', plan: makePlan(['POI', 'WALK', 'POI']) as any, feasible: true, constraintViolations: [] },
    ];

    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    const result = await service.search(candidates, worldContext, {
      useMonteCarlo: false,
      emergencyConstraints: { forbidden_modes: ['DRIVE'] },
    });

    for (const r of result.rankedCandidates) {
      const segs = r.candidate.plan?.segments ?? [];
      expect(segs.some((s: any) => String(s?.metadata?.type ?? '').toUpperCase() === 'DRIVE')).toBe(false);
    }
  });
});

describe('CGUSSearchService (soft constraints affect Monte Carlo expectedUtility)', () => {
  it('case A: should monotonically decrease E[U] with larger SOFT violation degree', async () => {
    const unified = new UnifiedDecisionFormulaService();

    const expectedUtility: any = {
      computeExpectedUtility: jest.fn((_plan: any, _ctx: any, _weights: any, config: any) => ({
        expectedUtility: 0.6,
        statistics: { mean: 0.6, variance: 0.01 },
        confidenceInterval: { lower: 0.59, upper: 0.61, level: 0.95 },
        feasibilityProbability: 1,
        samplingDetails: { totalSamples: config.sampleSize, effectiveSampleSize: config.sampleSize },
      })),
    };

    const service = new CGUSSearchService(
      unified,
      undefined,
      expectedUtility,
      { fromDeterministicModel: jest.fn((_ctx: any) => ({})) } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    // Stabilize penalty math: keep base utility identical across candidates.
    (service as any).deriveDimensionScores = jest.fn(() => ({ safety: 1 }));
    (service as any).deriveRiskPenalty = jest.fn(() => 0);

    const makePlan = (id: string) => ({ tripId: id, routeDirectionId: 'rd-1', segments: [] });
    const candidates: CGUSCandidate[] = [
      { id: 'A', plan: makePlan('A') as any, feasible: true, constraintViolations: [] },
      { id: 'B', plan: makePlan('B') as any, feasible: true, constraintViolations: [{ type: 'X', severity: 'SOFT', degree: 0.3 }] },
      { id: 'C', plan: makePlan('C') as any, feasible: true, constraintViolations: [{ type: 'X', severity: 'SOFT', degree: 0.9 }] },
    ];

    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    const result = await service.search(candidates, worldContext, { useMonteCarlo: true, sampleSize: 100 });
    const byId = new Map(result.rankedCandidates.map((r) => [r.candidate.id, r]));

    expect(byId.get('A')?.expectedUtility).toBeGreaterThan(byId.get('B')?.expectedUtility ?? -1);
    expect(byId.get('B')?.expectedUtility).toBeGreaterThan(byId.get('C')?.expectedUtility ?? -1);
  });

  it('case B: hard-vs-soft separation: feasible=false (hard) candidate must not outrank feasible ones (Step1)', async () => {
    const unified = new UnifiedDecisionFormulaService();
    const expectedUtility: any = {
      computeExpectedUtility: jest.fn((_plan: any, _ctx: any, _weights: any, config: any) => ({
        expectedUtility: 0.95,
        statistics: { mean: 0.95, variance: 0.01 },
        confidenceInterval: { lower: 0.94, upper: 0.96, level: 0.95 },
        feasibilityProbability: 1,
        samplingDetails: { totalSamples: config.sampleSize, effectiveSampleSize: config.sampleSize },
      })),
    };

    const service = new CGUSSearchService(
      unified,
      undefined,
      expectedUtility,
      { fromDeterministicModel: jest.fn((_ctx: any) => ({})) } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    (service as any).deriveDimensionScores = jest.fn(() => ({ safety: 1 }));
    (service as any).deriveRiskPenalty = jest.fn(() => 0);

    const candidates: CGUSCandidate[] = [
      {
        id: 'soft-high',
        plan: { tripId: 'soft', routeDirectionId: 'rd-1', segments: [] } as any,
        feasible: true,
        constraintViolations: [{ type: 'X', severity: 'SOFT', degree: 0.9 }],
      },
      {
        id: 'hard',
        plan: { tripId: 'hard', routeDirectionId: 'rd-1', segments: [] } as any,
        feasible: false,
        constraintViolations: [{ type: 'TIME_WINDOW_BREACH', severity: 'HARD', degree: 1 }],
      },
    ];

    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    const result = await service.search(candidates, worldContext, { useMonteCarlo: true, sampleSize: 50 });
    const rankedIds = result.rankedCandidates.map((r) => r.candidate.id);

    // Step1 should keep feasible candidates only (since at least one feasible exists).
    expect(rankedIds).toContain('soft-high');
    expect(rankedIds).not.toContain('hard');
  });

  it('case C: retrievalConstraintCoeffs should amplify soft penalty when stress categories present', async () => {
    const unified = new UnifiedDecisionFormulaService();
    const expectedUtility: any = {
      computeExpectedUtility: jest.fn((_plan: any, _ctx: any, _weights: any, config: any) => ({
        expectedUtility: 0.6,
        statistics: { mean: 0.6, variance: 0.01 },
        confidenceInterval: { lower: 0.59, upper: 0.61, level: 0.95 },
        feasibilityProbability: 1,
        samplingDetails: { totalSamples: config.sampleSize, effectiveSampleSize: config.sampleSize },
      })),
    };

    const service = new CGUSSearchService(
      unified,
      undefined,
      expectedUtility,
      { fromDeterministicModel: jest.fn((_ctx: any) => ({})) } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

    (service as any).deriveDimensionScores = jest.fn(() => ({ safety: 1 }));
    (service as any).deriveRiskPenalty = jest.fn(() => 0);

    const candidate: CGUSCandidate = {
      id: 'x',
      plan: { tripId: 'x', routeDirectionId: 'rd-1', segments: [] } as any,
      feasible: true,
      constraintViolations: [{ type: 'X', severity: 'SOFT', degree: 0.5 }],
    };

    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    const noBoost = await service.search([candidate], worldContext, { useMonteCarlo: true, sampleSize: 50 });
    const boosted = await service.search([candidate], worldContext, {
      useMonteCarlo: true,
      sampleSize: 50,
      retrievalCategoryHints: ['ROAD_STATUS'],
    });

    const rowNoHints = noBoost.rankedCandidates[0] as any;
    const rowWithHints = boosted.rankedCandidates[0] as any;

    // Regression goal: same candidate/violations/risk; only switch retrievalCategoryHints.
    // Expected:
    // - raw Monte Carlo stays ~same
    // - applied soft penalty delta increases (coeff > 1)
    // - final expectedUtility decreases
    expect(rowWithHints.rawMonteCarloExpectedUtility).toBeCloseTo(rowNoHints.rawMonteCarloExpectedUtility, 6);
    expect(rowWithHints.appliedSoftPenaltyDelta).toBeGreaterThan(rowNoHints.appliedSoftPenaltyDelta);
    expect(rowWithHints.expectedUtility).toBeLessThan(rowNoHints.expectedUtility);

    // Also keep a minimum separation to avoid false positives from numeric drift.
    expect(rowWithHints.appliedSoftPenaltyDelta - rowNoHints.appliedSoftPenaltyDelta).toBeGreaterThan(0.05);
  });
});

