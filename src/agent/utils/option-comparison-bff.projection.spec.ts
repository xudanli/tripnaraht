import { projectOptionComparison, projectExplainAlternatives, applyComparisonDisplayPolicy } from './option-comparison-bff.projection.util';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('option-comparison-bff.projection.util', () => {
  it('projects ≥2 options from optimization hints + main itinerary', () => {
    const comparison = projectOptionComparison({
      primaryItinerary: { days: [{ date: '2026-07-01', items: [] }] } as any,
      decisionState: {
        optimizationHints: {
          recommendedAlternativeId: 'plan_b_optimized',
          alternatives: [
            {
              id: 'plan_b_optimized',
              score: 0.82,
              feasibilityProbability: 0.78,
              summary: 'Day3 天气不确定',
            },
          ],
        },
      } as any,
    });
    expect(comparison).toBeDefined();
    expect(comparison!.options.length).toBeGreaterThanOrEqual(2);
    expect(comparison!.schema).toBe('tripnara.option_comparison@v1');
    expect(comparison!.options.every((o) => o.summary || o.label)).toBe(true);

    const explainAlts = projectExplainAlternatives(comparison);
    expect(explainAlts?.length).toBeGreaterThanOrEqual(2);
    expect(explainAlts?.some((a) => a.is_recommended)).toBe(true);
  });

  it('prefers workbench metadata.comparison when present', () => {
    const state = {
      metadata: {
        comparison: {
          options: [
            {
              optionId: 'opt-a',
              scores: { executability: 80, cost: 40, fatigue: 30, experienceDensity: 70, risk: 20, freedom: 50 },
              summary: '稳健方案',
            },
            {
              optionId: 'opt-b',
              scores: { executability: 65, cost: 55, fatigue: 45, experienceDensity: 85, risk: 35, freedom: 60 },
              summary: '体验优先',
            },
          ],
          recommendation: { optionId: 'opt-a', reason: '综合可行性与成本更优' },
          kernelGateEval: {
            optionDeltas: [
              { optionId: 'opt-a', gateStatus: 'ALLOW', violationCount: 0, violationTypes: [] },
              { optionId: 'opt-b', gateStatus: 'NEED_CONFIRM', violationCount: 1, violationTypes: ['budget'] },
            ],
            divergesFromLlmRecommendation: true,
            llmRecommendedOptionId: 'opt-b',
            recommendedByGate: 'opt-a',
            appliedAt: new Date().toISOString(),
          },
        },
      },
    } as OrchestratorState;

    const comparison = projectOptionComparison({ orchestratorState: state });
    expect(comparison?.options).toHaveLength(2);
    expect(comparison?.kernelGateEval?.divergesFromLlmRecommendation).toBe(true);
  });

  it('projects ≥3 options from hints + dual_track + fallback_plans (P2)', () => {
    const comparison = projectOptionComparison({
      primaryItinerary: { days: [{ date: '2026-07-01', items: [] }] } as any,
      decisionState: {
        optimizationHints: {
          recommendedAlternativeId: 'plan_b_optimized',
          alternatives: [{ id: 'plan_b_optimized', score: 0.82, feasibilityProbability: 0.78, summary: 'Day3 天气不确定' }],
        },
      } as any,
      dualTrackUi: {
        mode: 'dual_track',
        axis_b_branches: [
          {
            branch_id: 'plan_b_rain',
            axis: 'B',
            trigger_kind: 'WEATHER',
            trigger_label_zh: '暴雨备选',
            trigger_condition: 'Day3 降水>10mm',
            impacted_segment_ids: [],
            summary_zh: 'Day3 改室内',
            activation_mode: 'user_confirm',
          },
        ],
        axis_a_segments: [],
        schema: 'tripnara.dual_track_itinerary@v1',
        computed_at: new Date().toISOString(),
      },
      orchestratorState: {
        metadata: {
          fallback_plans: [{ id: 'plan_conservative', strategy: 'conservative_pace', name: '保守节奏' }],
        },
      } as any,
    });
    expect(comparison!.options.length).toBeGreaterThanOrEqual(3);
    expect(comparison!.options.some((o) => o.optionId === 'plan_b_rain')).toBe(true);
    expect(comparison!.options.some((o) => o.optionId === 'plan_conservative')).toBe(true);
  });

  it('adds display overflow when options > 3', () => {
    const comparison = applyComparisonDisplayPolicy({
      schema: 'tripnara.option_comparison@v1',
      options: [
        { optionId: 'a', label: 'A', scores: {}, summary: 'a' },
        { optionId: 'b', label: 'B', scores: {}, summary: 'b' },
        { optionId: 'c', label: 'C', scores: {}, summary: 'c' },
        { optionId: 'd', label: 'D', scores: {}, summary: 'd' },
      ],
    });
    expect(comparison.display).toEqual({
      visibleColumnCount: 3,
      overflowCount: 1,
      overflowOptionIds: ['d'],
    });
  });
});
