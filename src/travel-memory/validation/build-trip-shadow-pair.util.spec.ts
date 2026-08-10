import {
  buildTripShadowPair,
  evaluateTripShadowCases,
  summarizeTripShadowNorthStar,
} from './build-trip-shadow-pair.util';

describe('buildTripShadowPair', () => {
  it('builds diverged Decision Pair awaiting outcome', () => {
    const pair = buildTripShadowPair({
      decisionId: 'D-IS-1',
      tripId: 'T-ICELAND',
      withoutMemoryRecommendation: 'plan-high-density',
      withMemoryRecommendation: 'plan-relaxed-pace',
      memoryDecisionTrace: {
        schemaId: 'tripnara.memory_decision_trace@v1',
        version: 1,
        decisionId: 'D-IS-1',
        contextSources: {
          world: true,
          booking: false,
          team: false,
          memory: true,
        },
        memoryContribution: {
          used: true,
          influence: [
            {
              id: 'M-PACE',
              memoryId: 'M-PACE',
              influence: 'PACE_CONSTRAINT',
              weight: 0.45,
              confidence: 0.9,
            },
          ],
        },
      },
    });
    expect(pair).not.toBeNull();
    expect(pair!.decisionPair.diverged).toBe(true);
    expect(pair!.compareCase.qualityDelta).toBe('UNKNOWN');
    expect(pair!.northStarReady).toBe(false);
    expect(pair!.notes).toContain('awaiting_user_outcome');
  });

  it('marks northStarReady when outcome shows improvement', () => {
    const pair = buildTripShadowPair({
      decisionId: 'D-IS-2',
      tripId: 'T-ICELAND',
      withoutMemoryRecommendation: 'GLACIER_HIKE',
      withMemoryRecommendation: 'SKIP_AND_CONTINUE',
      userChosen: 'SKIP_AND_CONTINUE',
      accepted: true,
      regret: 0.1,
      memoryDecisionTrace: {
        schemaId: 'tripnara.memory_decision_trace@v1',
        version: 1,
        decisionId: 'D-IS-2',
        contextSources: {
          world: true,
          booking: false,
          team: false,
          memory: true,
        },
        memoryContribution: {
          used: true,
          influence: [
            {
              id: 'EP1',
              memoryId: 'EP1',
              influence: 'EPISODE_WARNING',
              weight: 0.4,
              confidence: 0.8,
            },
          ],
        },
      },
    });
    expect(pair!.compareCase.qualityDelta).toBe('IMPROVED');
    expect(pair!.northStarReady).toBe(true);
  });

  it('aggregates trip cases and answers north-star draft', () => {
    const a = buildTripShadowPair({
      decisionId: 'D1',
      tripId: 'T1',
      withoutMemoryRecommendation: 'A',
      withMemoryRecommendation: 'B',
      userChosen: 'B',
      regret: 0.1,
      accepted: true,
    })!;
    const b = buildTripShadowPair({
      decisionId: 'D2',
      tripId: 'T1',
      withoutMemoryRecommendation: 'A',
      withMemoryRecommendation: 'C',
      userChosen: 'A',
      regret: 0.7,
      accepted: false,
    })!;
    const bundle = evaluateTripShadowCases({
      cases: [a.compareCase, b.compareCase],
      totalDecisions: 10,
    });
    const north = summarizeTripShadowNorthStar(bundle);
    expect(north.answerable).toBe(true);
    expect(north.preventedMistakeCount).toBe(1);
    expect(north.harmCount).toBe(1);
    expect(bundle.metrics.harmRate).toBe(0.5);
    expect(bundle.promotionBlocked).toBe(true);
  });
});
