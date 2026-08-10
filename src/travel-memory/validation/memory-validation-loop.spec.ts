import {
  CONTEXT_ASSEMBLY_BOUNDARY,
  MEMORY_ENGINEERING_CONTRACT,
  MEMORY_HARM_RATE_PROMOTION_BLOCK,
  MEMORY_VALIDATION_NORTH_STAR_QUESTION,
  TMR_LAYER_READINESS,
  TMR_RUNTIME_READINESS,
  TRAVEL_MEMORY_SYSTEM_BOUNDARY,
  buildShadowEvaluationBundle,
  classifyShadowQualityDelta,
  computeDeltaQuality,
  computeMemoryQualityMetrics,
  isMemoryAssistedSuccess,
  isMemoryOverWorld,
} from '../index';

describe('Memory Validation Loop V1', () => {
  it('freezes MUST / MUST NOT engineering contract', () => {
    expect(MEMORY_ENGINEERING_CONTRACT.MUST).toContain('PROVIDE_EVIDENCE');
    expect(MEMORY_ENGINEERING_CONTRACT.MUST_NOT).toContain(
      'LEARN_FROM_SINGLE_EPISODE',
    );
    expect(MEMORY_ENGINEERING_CONTRACT.MUST_NOT).toContain(
      'OVERRIDE_WORLD_STATE',
    );
  });

  it('computes delta quality toward lower regret', () => {
    const delta = computeDeltaQuality(
      {
        acceptanceRate: 0.5,
        overrideRate: 0.4,
        meanRegret: 0.5,
        repeatedMistakeRate: 0.2,
        sampleSize: 20,
      },
      {
        acceptanceRate: 0.65,
        overrideRate: 0.25,
        meanRegret: 0.32,
        repeatedMistakeRate: 0.1,
        sampleSize: 20,
      },
    );
    expect(delta.improved).toBe(true);
    expect(delta.delta.regret).toBeLessThan(0);
  });

  it('blocks promotion when harm rate exceeds red line', () => {
    const cases = Array.from({ length: 10 }, (_, i) => ({
      decisionId: `D${i}`,
      tripId: 'T1',
      diverged: true,
      memoryChangedRecommendation: true,
      qualityDelta: (i < 2 ? 'WORSENED' : i < 5 ? 'IMPROVED' : 'UNCHANGED') as const,
    }));
    const bundle = buildShadowEvaluationBundle({
      cases,
      totalDecisions: 20,
    });
    expect(bundle.metrics.harmRate).toBe(0.2);
    expect(bundle.metrics.benefitRate).toBe(0.3);
    expect(bundle.metrics.harmRate).toBeGreaterThan(
      MEMORY_HARM_RATE_PROMOTION_BLOCK,
    );
    expect(bundle.promotionBlocked).toBe(true);
  });

  it('classifies shadow quality from regret', () => {
    expect(
      classifyShadowQualityDelta({
        diverged: true,
        regret: 0.1,
        withMemoryRecommendation: 'B',
        userChosen: 'B',
      }),
    ).toBe('IMPROVED');
    expect(
      classifyShadowQualityDelta({
        diverged: true,
        regret: 0.8,
      }),
    ).toBe('WORSENED');
  });

  it('tracks dependency rate', () => {
    const metrics = computeMemoryQualityMetrics({
      cases: [
        {
          decisionId: 'D1',
          tripId: 'T1',
          diverged: false,
          memoryChangedRecommendation: false,
          qualityDelta: 'UNCHANGED',
        },
      ],
      totalDecisions: 10,
    });
    expect(metrics.dependencyRate).toBe(0.1);
  });

  it('freezes north-star question and system boundary', () => {
    expect(MEMORY_VALIDATION_NORTH_STAR_QUESTION).toContain('少犯了一次');
    expect(TRAVEL_MEMORY_SYSTEM_BOUNDARY.NOT_RESPONSIBLE_FOR).toContain(
      'REPLACE_CGUS',
    );
  });

  it('marks Evidence Ingestion Ready / Decision Consumption Not Ready', () => {
    expect(TMR_RUNTIME_READINESS.evidenceIngestion).toBe('READY');
    expect(TMR_RUNTIME_READINESS.decisionConsumption).toBe('NOT_READY');
    expect(TMR_LAYER_READINESS.TMR_L3_EPISODIC.agentImpact).toBe('WRITE_ONLY');
    expect(CONTEXT_ASSEMBLY_BOUNDARY.selfDriveWorld).toBe(
      'OPERATIONAL_WORLD_NOT_MEMORY',
    );
  });

  it('does not treat accept+high regret as memory success', () => {
    expect(
      isMemoryAssistedSuccess({
        schemaId: 'tripnara.decision_outcome_bundle@v1',
        version: 1,
        decisionId: 'D1',
        acceptance: true,
        executionSuccess: true,
        satisfaction: 0.3,
        regret: 0.7,
        constraintViolation: false,
        recoveryCost: 120,
      }),
    ).toBe(false);
  });

  it('flags Memory-over-World authority distribution', () => {
    expect(
      isMemoryOverWorld({
        worldEvidencePct: 0.2,
        bookingEvidencePct: 0.1,
        teamEvidencePct: 0.1,
        memoryEvidencePct: 0.6,
      }),
    ).toBe(true);
  });
});
