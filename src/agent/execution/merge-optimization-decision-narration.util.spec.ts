import { mergeOptimizationDecisionNarration } from './merge-optimization-decision-narration.util';

describe('mergeOptimizationDecisionNarration', () => {
  it('appends verdict and audit tips without mutating itinerary fields', () => {
    const out = mergeOptimizationDecisionNarration(
      {
        user_friendly_summary: '为您规划了3天的行程。',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
      },
      {
        method: 'CGUS',
        recommendedAlternativeId: 'plan-a',
        metaDecisionAudit: 'META_BUDGET(sample=500)',
        decisionVerdictNarrationZh: '**推荐方案：** `plan-a`',
        worldConstraintMaterialization: {
          appliedEvents: 2,
          roadIds: ['F206'],
          weatherDates: [],
          storeVersion: 1,
        },
      } as any,
    );
    expect(out.user_friendly_summary).toContain('plan-a');
    expect(out.optimization_decision_narration_zh).toContain('plan-a');
    expect(out.tips?.some((t) => t.includes('META_BUDGET'))).toBe(true);
    expect(out.tips?.some((t) => t.includes('F206'))).toBe(true);
  });

  it('surfaces HEURISTIC fallback in tips and summary', () => {
    const out = mergeOptimizationDecisionNarration(
      {
        user_friendly_summary: '为您规划了3天的行程。',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
      },
      {
        method: 'HEURISTIC',
        decisionVerdict: {
          chosen_plan_id: 'heuristic-current',
          rejected_plans: [],
          fallback_chain: [{ step: 'cgus_gate', reason: 'cgus_gate_false' }],
        },
        optimizationFlags: { freezeRouteSelection: true },
      } as any,
    );
    expect(out.tips?.some((t) => t.includes('[系统降级说明]'))).toBe(true);
    expect(out.user_friendly_summary).toMatch(/降级|Topology Lock/);
  });
});
