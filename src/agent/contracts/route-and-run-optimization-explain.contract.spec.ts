/**
 * AO / route_and_run：explain.optimization 与 OpenAPI DTO 对齐（决策闭环 P0）。
 */
import { projectDecisionClosureExplain } from '../../trips/decision/evaluation/decision-closure-assertions';
import type { OptimizationHints } from '../../decision/kernel/decision-state.types';

describe('route_and_run optimization explain contract (P0)', () => {
  const hints: OptimizationHints = {
    method: 'CGUS',
    recommendedAlternativeId: 'repair-v2',
    metaDecisionAudit: 'META_BUDGET(sample=500) mcTotal=500 ragWorld=2',
    decisionVerdict: {
      chosen_plan_id: 'repair-v2',
      rejected_plans: [
        {
          id: 'base',
          status: 'infeasible',
          hard_violation_count: 1,
          rejection_reasons: ['HARD:WORLD_ROAD_CLOSED (F208)'],
        },
      ],
      monte_carlo_summary: { used: true, total_samples: 500 },
    },
    decisionVerdictNarrationZh: '**推荐方案：** `repair-v2`',
    worldConstraintMaterialization: {
      appliedEvents: 2,
      roadIds: ['F208'],
      weatherDates: ['2026-01-16'],
      storeVersion: 1,
      unifiedGraphNodeCount: 10,
      unifiedGraphEdgeCount: 14,
    },
  };

  it('projects snake_case fields required by RouteAndRunResponseDto.explain.optimization', () => {
    const explain = projectDecisionClosureExplain(hints);
    expect(explain).toBeDefined();
    expect(explain?.decision_verdict?.chosen_plan_id).toBe('repair-v2');
    expect(explain?.decision_verdict?.rejected_plans?.length).toBeGreaterThanOrEqual(1);
    expect(explain?.decision_verdict_narration_zh).toContain('repair-v2');
    expect(explain?.world_constraint_materialization?.applied_events).toBe(2);
    expect(explain?.world_constraint_materialization?.road_ids).toContain('F208');
    expect(explain?.meta_decision_audit).toContain('ragWorld');
    expect(explain).not.toHaveProperty('appliedEvents');
    expect(explain).not.toHaveProperty('decisionVerdict');
  });

  it('emits applied_events: 0 when materialization is empty but present', () => {
    const zero = projectDecisionClosureExplain({
      method: 'CGUS',
      recommendedAlternativeId: 'base',
      worldConstraintMaterialization: {
        appliedEvents: 0,
        roadIds: [],
        weatherDates: [],
        storeVersion: 0,
      },
    });
    expect(zero?.world_constraint_materialization?.applied_events).toBe(0);
  });
});
