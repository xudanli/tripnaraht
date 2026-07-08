import type { FeasibilityProofDto } from '../types/trip-constraint-solver.types';
import { collectIssueProofEvidenceItems } from './decision-checker-evidence.projection.util';

describe('plan-object evidence BFF projection', () => {
  const planObjectProof: FeasibilityProofDto = {
    entity: '日内评估',
    constraint: 'PLAN_OBJECT_MEAL_ARRIVAL',
    currentFact: '预计 钻石沙滩 结束于 13:50，晚于午餐窗 12:00',
    evidenceSource: 'plan-object-evaluator',
    evidenceType: 'gateway_projection',
    conclusion: 'WARNING',
    ruleId: 'MEAL_WINDOW_VS_ARRIVAL',
    semanticKey: 'plan_object_meal_late_arrival_po_abc_meal_window_policy',
  };

  it('CAS-122: decision-checker evidence uses message title and ruleId subtitle', () => {
    const items = collectIssueProofEvidenceItems(
      {
        id: 'issue-meal',
        priority: 'suggest_adjust',
        category: 'schedule',
        title: '午餐窗冲突',
        message: planObjectProof.currentFact,
        affectedDays: [3],
        severity: 'medium',
        proofs: [planObjectProof],
      },
      [],
      3,
    );

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('预计 钻石沙滩 结束于 13:50，晚于午餐窗 12:00');
    expect(items[0].subtitle).toBe('依据：游览结束晚于午餐窗');
    expect(items[0].refs).toEqual(
      expect.arrayContaining([
        { type: 'semantic_key', id: 'plan_object_meal_late_arrival_po_abc_meal_window_policy' },
        { type: 'plan_object_rule', id: 'MEAL_WINDOW_VS_ARRIVAL' },
      ]),
    );
    expect(items[0].title).not.toMatch(/^plan_object_/);
  });
});
