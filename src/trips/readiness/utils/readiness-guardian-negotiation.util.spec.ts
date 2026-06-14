import {
  extractGuardianNegotiationSnapshot,
  isReadinessGuardianNegotiationEnabled,
  mapNegotiationResultToSummary,
  mergeGuardianNegotiationSnapshot,
  READINESS_GUARDIAN_NEGOTIATION_METADATA_KEY,
  shouldDeferRepairByPreNegotiation,
  buildGuardianDeferMessage,
  GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD,
  buildGuardianRepairHintsFromSummary,
} from './readiness-guardian-negotiation.util';
import type { NegotiationResult } from '../../decision/optimization/learning/guardian-persona.interface';

describe('readiness-guardian-negotiation.util', () => {
  const baseResult: NegotiationResult = {
    decision: 'REQUIRES_HUMAN',
    evaluations: [
      {
        persona: 'ABU',
        utility: 0.4,
        primaryConcerns: ['F-road 风险'],
        positiveAspects: [],
        suggestedAdjustments: [],
        stance: 'CONCERN',
        confidence: 0.8,
      },
      {
        persona: 'DRE',
        utility: 0.6,
        primaryConcerns: ['第3天疲劳偏高'],
        positiveAspects: [],
        suggestedAdjustments: ['插入缓冲日'],
        stance: 'NEUTRAL',
        confidence: 0.7,
      },
      {
        persona: 'NEPTUNE',
        utility: 0.75,
        primaryConcerns: [],
        positiveAspects: ['路线哲学匹配'],
        suggestedAdjustments: [],
        stance: 'SUPPORT',
        confidence: 0.9,
      },
    ],
    debateRounds: [{ roundNumber: 1, arguments: [], consensusShift: 0 }],
    votes: [],
    consensusLevel: 0.55,
    keyTradeoffs: ['安全 vs 体验密度'],
    conditions: ['确认 F-road 许可'],
    humanDecisionPoints: ['是否接受第3天高强度驾驶？'],
    summary: '三人存在分歧，需用户确认',
  };

  it('maps negotiation result into readiness summary', () => {
    const summary = mapNegotiationResultToSummary(baseResult, {
      phase: 'post_repair',
      tripId: 'trip-1',
      repairActionType: 'reorder_pois',
      blockerId: 'blocker-1',
    });

    expect(summary.decision).toBe('REQUIRES_HUMAN');
    expect(summary.consensusLevel).toBe(0.55);
    expect(summary.humanDecisionPoints).toEqual(['是否接受第3天高强度驾驶？']);
    expect(summary.personaEvaluations).toHaveLength(3);
    expect(summary.personaEvaluations[0].personaLabel).toBe('守护者');
  });

  it('persists and reads snapshot from trip metadata', () => {
    const snapshot = {
      preRepair: mapNegotiationResultToSummary(baseResult, {
        phase: 'pre_repair',
        tripId: 'trip-1',
      }),
      postRepair: mapNegotiationResultToSummary(
        { ...baseResult, consensusLevel: 0.72, decision: 'CONDITIONAL_APPROVE' },
        { phase: 'post_repair', tripId: 'trip-1' },
      ),
      latest: mapNegotiationResultToSummary(baseResult, {
        phase: 'post_repair',
        tripId: 'trip-1',
      }),
    };

    const merged = mergeGuardianNegotiationSnapshot({ foo: 'bar' }, snapshot);
    expect(merged.foo).toBe('bar');
    expect(merged[READINESS_GUARDIAN_NEGOTIATION_METADATA_KEY]).toEqual(snapshot);

    const loaded = extractGuardianNegotiationSnapshot(merged);
    expect(loaded?.latest?.consensusLevel).toBe(0.55);
  });

  it('respects READINESS_GUARDIAN_NEGOTIATION env toggle', () => {
    const previous = process.env.READINESS_GUARDIAN_NEGOTIATION;
    process.env.READINESS_GUARDIAN_NEGOTIATION = '0';
    expect(isReadinessGuardianNegotiationEnabled()).toBe(false);
    process.env.READINESS_GUARDIAN_NEGOTIATION = previous;
  });

  it('defers repair when pre_repair is REJECT with low consensus', () => {
    const preRepair = mapNegotiationResultToSummary(
      { ...baseResult, decision: 'REJECT', consensusLevel: 0.35 },
      { phase: 'pre_repair', tripId: 'trip-1' },
    );
    expect(GUARDIAN_LOW_CONSENSUS_DEFER_THRESHOLD).toBe(0.4);
    expect(shouldDeferRepairByPreNegotiation(preRepair)).toBe(true);
    expect(shouldDeferRepairByPreNegotiation(undefined)).toBe(false);
    expect(
      shouldDeferRepairByPreNegotiation({
        ...preRepair,
        decision: 'REJECT',
        consensusLevel: 0.5,
      }),
    ).toBe(false);
    expect(
      shouldDeferRepairByPreNegotiation({
        ...preRepair,
        decision: 'REQUIRES_HUMAN',
        consensusLevel: 0.2,
      }),
    ).toBe(false);

    const message = buildGuardianDeferMessage(preRepair);
    expect(message).toContain('共识 35%');
    expect(message).toContain('是否接受第3天高强度驾驶');
  });

  it('builds guardian repair hints from negotiation summary', () => {
    const summary = mapNegotiationResultToSummary(baseResult, {
      phase: 'pre_repair',
      tripId: 'trip-1',
    });
    const hints = buildGuardianRepairHintsFromSummary(summary);
    expect(hints?.decision).toBe('REQUIRES_HUMAN');
    expect(hints?.items.some((item) => item.text.includes('F-road'))).toBe(true);
  });
});
