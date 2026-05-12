import { CGUSSearchService, type CGUSCandidate } from './cgus-search.service';
import { UnifiedDecisionFormulaService } from './unified-decision-formula.service';

describe('CGUS penalty consistency (validation-only)', () => {
  it('deterministic utility vs MC penalty delta: deterministic includes SOFT via riskPenalty while MC-delta does not', async () => {
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

    // Stabilize dimension scores; riskPenalty should be independent from SOFT constraints.
    ;(service as any).deriveDimensionScores = jest.fn(() => ({ safety: 1 }));
    ;(service as any).deriveRiskPenalty = jest.fn(() => 0);

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

    // Deterministic path: utility uses unified formula (constraint penalty + riskPenalty)
    const deterministic = await service.search([candidate], worldContext, { useMonteCarlo: false });
    const _detUtility = deterministic.rankedCandidates[0].utility;

    // Monte Carlo path: expectedUtility uses rawMC - appliedSoftPenaltyDelta
    const mc = await service.search([candidate], worldContext, { useMonteCarlo: true, sampleSize: 50 });
    const row = mc.rankedCandidates[0] as any;

    expect(row.rawMonteCarloExpectedUtility).toBeCloseTo(0.6, 6);
    expect(row.appliedSoftPenaltyDelta).toBeGreaterThan(0);

    // Expected after penalty-unification: deterministic SOFT impact should match MC appliedSoftPenaltyDelta
    // (both represent the constraint penalty, not an extra SOFT→risk channel).
    const scoreNoConstraints = unified.computeUnifiedScore({
      dimensionScores: { safety: 1 },
      weights: { safety: 1 },
      constraintViolations: [],
      riskPenalty: 0,
      preferenceScore: 0,
    });
    const scoreWithConstraintsAndRisk = unified.computeUnifiedScore({
      dimensionScores: { safety: 1 },
      weights: { safety: 1 },
      constraintViolations: [{ type: 'X', severity: 'SOFT', degree: 0.5 }],
      riskPenalty: 0,
      preferenceScore: 0,
    });
    const deterministicSoftImpact = scoreNoConstraints - scoreWithConstraintsAndRisk;
    expect(deterministicSoftImpact).toBeCloseTo(row.appliedSoftPenaltyDelta, 6);
  });

  it('Step2 ordering can disagree with MC E[U] preference because MC does not re-sort by expectedUtility', async () => {
    const unified = new UnifiedDecisionFormulaService();
    const expectedUtility: any = {
      computeExpectedUtility: jest.fn((plan: any, _ctx: any, _weights: any, config: any) => {
        const id = String(plan?.tripId ?? '');
        // Make rawMC prefer "B" over "A"
        const raw = id === 'B' ? 0.8 : 0.6;
        return {
          expectedUtility: raw,
          statistics: { mean: raw, variance: 0.01 },
          confidenceInterval: { lower: raw - 0.01, upper: raw + 0.01, level: 0.95 },
          feasibilityProbability: 1,
          samplingDetails: { totalSamples: config.sampleSize, effectiveSampleSize: config.sampleSize },
        };
      }),
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

    // Deterministic scoring: make unified utility prefer "A" over "B"
    ;(service as any).deriveDimensionScores = jest.fn((c: CGUSCandidate) => ({ safety: c.id === 'A' ? 1 : 0.9 }));
    ;(service as any).deriveRiskPenalty = jest.fn(() => 0);

    const makeCandidate = (id: 'A' | 'B'): CGUSCandidate => ({
      id,
      plan: { tripId: id, routeDirectionId: 'rd-1', segments: [] } as any,
      feasible: true,
      constraintViolations: [],
    });

    const worldContext: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
      human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
      routeDirection: { id: 'rd-1', name: 'RD' },
    };

    const result = await service.search([makeCandidate('A'), makeCandidate('B')], worldContext, {
      useMonteCarlo: true,
      sampleSize: 50,
    });

    // Ranked list is still based on deterministic utility unless rollout/exploration re-sorts.
    expect(result.rankedCandidates[0].candidate.id).toBe('A');

    const byId = new Map(result.rankedCandidates.map((r) => [r.candidate.id, r]));
    expect((byId.get('B') as any).rawMonteCarloExpectedUtility).toBeGreaterThan(
      (byId.get('A') as any).rawMonteCarloExpectedUtility,
    );

    // Validation signal: MC preference differs from Step2 ordering.
    // This is not a failure of constraints, but a property of the current pipeline.
    expect((byId.get('B') as any).expectedUtility).toBeGreaterThan((byId.get('A') as any).expectedUtility);
  });
});

