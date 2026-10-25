import { planLensesForProactiveCase } from '../lenses/evaluate-lens-activation.util';
import { synthesizeProactiveRecommendation } from '../synthesis/synthesize-proactive-recommendation.util';
import { buildProactiveImpactFromWeather } from '../adapters/build-proactive-impact.util';
import {
  computeProactiveInterventionValue,
  resolveProactiveInterventionThreshold,
} from './compute-intervention-value.util';
import {
  defaultAttentionCost,
  evaluateProactiveIntervention,
} from './evaluate-proactive-intervention.util';

describe('PD-6 Intervention Gate + reminder card', () => {
  function weatherContinueBundle() {
    const impact = buildProactiveImpactFromWeather({
      tripId: 'trip_pd6',
      signalEventId: 'evt_pd6_wind',
      signalKind: 'WEATHER_WIND',
      weatherImpact: {
        affectedPlanItemIds: ['item_reynisfjara'],
        affectedEntityRefs: [
          { kind: 'PLAN_ITEM', id: 'item_reynisfjara', label: 'Day4 Reynisfjara' },
        ],
      },
      affectedItemLabels: ['Day4 Reynisfjara'],
      createdAt: '2026-08-11T12:00:00.000Z',
    });
    const lens = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    const syn = synthesizeProactiveRecommendation({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      lens,
      impactZh: '沿海风力增强，影响黑沙滩体验。',
    });
    expect(syn.ok).toBe(true);
    if (!syn.ok) throw new Error('synthesis failed');
    return { impact, synthesis: syn.synthesis };
  }

  it('RFC value = Improvement×Confidence×Actionability − AttentionCost', () => {
    const v = computeProactiveInterventionValue({
      improvement: 0.5,
      confidence: 0.8,
      actionability: 0.8,
      attentionCost: 0.1,
      threshold: 0.12,
    });
    expect(v.interventionValue).toBeCloseTo(0.5 * 0.8 * 0.8 - 0.1, 5);
    expect(v.passesThreshold).toBe(true);
  });

  it('builds three-layer card when over threshold', () => {
    const { impact, synthesis } = weatherContinueBundle();
    const decision = evaluateProactiveIntervention({
      impact,
      synthesis,
      decisionProblemId: 'problem_pd6',
      attentionCost: 0.05,
      threshold: 0.05,
      actionableLeadTimeHours: 4,
    });

    expect(decision.notifyUser).toBe(false);
    expect(decision.pushForbidden).toBe(true);
    expect(decision.autoApplyForbidden).toBe(true);
    expect(decision.candidate.schemaId).toBe('nara.intervention_candidate@v1');

    // High-quality weather postpone should notify card
    expect(decision.gate).toBe('NOTIFY_CARD');
    expect(decision.card).not.toBeNull();
    expect(decision.card?.layer1WhatHappenedZh).toContain('风力');
    expect(decision.card?.layer2WhatImpactedZh).toContain('Day4 Reynisfjara');
    expect(decision.card?.layer3SuggestionZh).toContain('建议');
    expect(decision.card?.ctas.map((c) => c.id)).toEqual([
      'VIEW_OPTIONS',
      'DEFER',
      'WHY',
    ]);
    expect(decision.silentLearning).toBeNull();
  });

  it('goes Silent Learning when value below threshold', () => {
    const { impact, synthesis } = weatherContinueBundle();
    const decision = evaluateProactiveIntervention({
      impact,
      synthesis,
      attentionCost: 0.9,
      threshold: 0.5,
      actionableLeadTimeHours: 4,
    });
    expect(decision.gate).toBe('SILENT_LEARNING');
    expect(decision.card).toBeNull();
    expect(decision.silentLearning?.reason).toMatch(/THRESHOLD|DO_NOT_SURFACE/);
    expect(decision.silentLearning?.memoryHook).toBe('TRAVEL_MEMORY_PENDING');
  });

  it('default attention cost scales with impact level', () => {
    expect(defaultAttentionCost({ impactLevel: 'CRITICAL' })).toBeLessThan(
      defaultAttentionCost({ impactLevel: 'LOW' }),
    );
  });

  it('threshold env defaults to 0.08', () => {
    expect(resolveProactiveInterventionThreshold({})).toBe(0.08);
    expect(
      resolveProactiveInterventionThreshold({
        PROACTIVE_INTERVENTION_THRESHOLD: '0.25',
      }),
    ).toBe(0.25);
  });
});
