import { CGUSSearchService, type CGUSCandidate } from './cgus-search.service';
import { UnifiedDecisionFormulaService } from './unified-decision-formula.service';

describe('CGUS Step3 MC rank authority (方案 C)', () => {
  function makeService(rawMcById: Record<string, number>) {
    const unified = new UnifiedDecisionFormulaService();
    const expectedUtility: any = {
      computeExpectedUtility: jest.fn((plan: any, _ctx: any, _weights: any, config: any) => {
        const id = String(plan?.tripId ?? '');
        const raw = rawMcById[id] ?? 0.6;
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

    // Deterministic pre-rank prefers A over B
    ;(service as any).deriveDimensionScores = jest.fn((c: CGUSCandidate) => ({ safety: c.id === 'A' ? 1 : 0.9 }));
    ;(service as any).deriveRiskPenalty = jest.fn(() => 0);
    return service;
  }

  function makeCandidates(): CGUSCandidate[] {
    const mk = (id: 'A' | 'B'): CGUSCandidate => ({
      id,
      plan: { tripId: id, routeDirectionId: 'rd-1', segments: [] } as any,
      feasible: true,
      constraintViolations: [],
    });
    return [mk('A'), mk('B')];
  }

  const worldContext: any = {
    physical: { month: 1, climateSeasonality: { accessibilityScore: 0.8 } },
    human: { fitnessScore: 80, riskTolerance: 'MEDIUM' },
    routeDirection: { id: 'rd-1', name: 'RD' },
  };

  it('case 1: when MC disagrees but rerank disabled, winner stays deterministic', async () => {
    const service = makeService({ A: 0.6, B: 0.8 });
    const result = await service.search(makeCandidates(), worldContext, {
      useMonteCarlo: true,
      sampleSize: 200,
      mcRankAuthority: { enabled: false, minSamplesPerCandidate: 50 },
    });
    expect(result.rankedCandidates[0].candidate.id).toBe('A');
  });

  it('case 2: when MC disagrees and gates pass, rerank enabled switches winner to MC top', async () => {
    const service = makeService({ A: 0.6, B: 0.8 });
    const result = await service.search(makeCandidates(), worldContext, {
      useMonteCarlo: true,
      sampleSize: 200,
      mcRankAuthority: { enabled: true, minSamplesPerCandidate: 50 },
    });
    expect(result.rankedCandidates[0].candidate.id).toBe('B');
  });

  it('case 3: when MC disagrees but sample gate fails, rerank enabled does not switch winner', async () => {
    const service = makeService({ A: 0.6, B: 0.8 });
    const result = await service.search(makeCandidates(), worldContext, {
      useMonteCarlo: true,
      sampleSize: 30,
      mcRankAuthority: { enabled: true, minSamplesPerCandidate: 50 },
    });
    expect(result.rankedCandidates[0].candidate.id).toBe('A');
  });

  it('case 4: when MC disagrees but top margin gate fails, rerank enabled keeps deterministic winner (soft gate)', async () => {
    const service = makeService({ A: 0.6, B: 0.8 });
    const result = await service.search(makeCandidates(), worldContext, {
      useMonteCarlo: true,
      sampleSize: 200,
      mcRankAuthority: { enabled: true, minSamplesPerCandidate: 50, minTopMargin: 0.5 },
    });
    expect(result.rankedCandidates[0].candidate.id).toBe('A');
  });
});

