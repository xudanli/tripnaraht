import {
  mergeTravelMemoryHintsIntoScoringHints,
  proveMemoryContributionFromPreference,
  resolveTravelMemoryCgusSoftMode,
} from './apply-travel-memory-hints-to-cgus.util';
import type { TravelMemoryDecisionHintV1 } from './selective-consume.util';

describe('applyTravelMemoryHintsToCgus', () => {
  const paceHint: TravelMemoryDecisionHintV1 = {
    key: 'travel.pace',
    value: 'RELAXED',
    influence: 'PACE_CONSTRAINT',
    confidence: 0.9,
    memoryId: 'M-PACE',
    advisoryOnly: true,
  };

  it('maps pace hint into relaxed scoringHints', () => {
    const { scoringHints, applied } = mergeTravelMemoryHintsIntoScoringHints(
      { densityPreference: 'balanced', fatigueSensitivity: 0.45, safetyBias: 0.5 },
      [paceHint],
    );
    expect(scoringHints.densityPreference).toBe('relaxed');
    expect(scoringHints.fatigueSensitivity).toBeGreaterThan(0.7);
    expect(applied).toHaveLength(1);
    expect(applied[0].influence).toBe('PACE_CONSTRAINT');
  });

  it('proves used=true only when preference order flips top1 in active mode', () => {
    const baseline = {
      densityPreference: 'balanced' as const,
      fatigueSensitivity: 0.45,
      safetyBias: 0.5,
    };
    const { scoringHints: memoryHints, applied } = mergeTravelMemoryHintsIntoScoringHints(
      baseline,
      [paceHint],
    );

    const ranked = [
      {
        candidate: { id: 'plan-high-density', constraintViolations: [] },
        utility: 0.8,
        finalScore: 0.8,
      },
      {
        candidate: { id: 'plan-relaxed-pace', constraintViolations: [] },
        utility: 0.78,
        finalScore: 0.78,
      },
    ];

    const active = proveMemoryContributionFromPreference({
      decisionId: 'D1',
      ranked,
      baselineHints: baseline,
      memoryHints,
      applied,
      softMode: 'active',
    });
    expect(active.trace.memoryContribution.used).toBe(true);
    expect(active.trace.memoryContribution.influence.length).toBeGreaterThan(0);
    expect(active.rankingChanged).toBe(true);
    expect(active.withoutMemoryRecommendation).toBe('plan-high-density');
    expect(active.withMemoryRecommendation).toBe('plan-relaxed-pace');

    const shadow = proveMemoryContributionFromPreference({
      decisionId: 'D1',
      ranked,
      baselineHints: baseline,
      memoryHints,
      applied,
      softMode: 'shadow',
    });
    expect(shadow.trace.memoryContribution.used).toBe(false);
  });

  it('keeps used=false when ranking unchanged', () => {
    const baseline = {
      densityPreference: 'relaxed' as const,
      fatigueSensitivity: 0.8,
      safetyBias: 0.5,
    };
    const { scoringHints: memoryHints, applied } = mergeTravelMemoryHintsIntoScoringHints(
      baseline,
      [paceHint],
    );
    const ranked = [
      {
        candidate: { id: 'plan-relaxed-pace', constraintViolations: [] },
        utility: 0.9,
        finalScore: 0.9,
      },
      {
        candidate: { id: 'plan-high-density', constraintViolations: [] },
        utility: 0.5,
        finalScore: 0.5,
      },
    ];
    const proof = proveMemoryContributionFromPreference({
      decisionId: 'D2',
      ranked,
      baselineHints: baseline,
      memoryHints,
      applied,
      softMode: 'active',
    });
    expect(proof.trace.memoryContribution.used).toBe(false);
    expect(proof.trace.memoryContribution.influence).toEqual([]);
    expect(proof.rankingChanged).toBe(false);
  });

  it('resolves soft mode from env', () => {
    expect(resolveTravelMemoryCgusSoftMode({ TRAVEL_MEMORY_CGUS_SOFT: 'shadow' })).toBe(
      'shadow',
    );
    expect(resolveTravelMemoryCgusSoftMode({ TRAVEL_MEMORY_CGUS_SOFT: 'off' })).toBe('off');
  });
});
