import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import {
  buildPlanObjectRepairOptions,
  buildPlanObjectRepairOptionsFromAssertion,
  isPlanObjectFeasibilityIssue,
} from './plan-object-repair-options.util';

describe('plan-object-repair-options.util', () => {
  it('builds buffer linkage repairs from message gap', () => {
    const options = buildPlanObjectRepairOptions({
      issueId: 'plan_object_buffer_day_3_a_b',
      semanticKey: 'plan_object_buffer_day_3_po_a_po_b',
      message: '「A」到「B」缓冲仅 8 分钟',
      ruleId: 'BUFFER_LINKAGE',
      dayNumber: 3,
      planObjectId: 'po_b',
    });
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((o) => o.actionType === 'add_buffer' || o.id.includes('buffer'))).toBe(true);
  });

  it('builds meal late arrival repairs', () => {
    const options = buildPlanObjectRepairOptions({
      issueId: 'meal-late',
      semanticKey: 'plan_object_meal_late_arrival_po_meal',
      message: '预计上一站结束晚于午餐窗',
      ruleId: 'MEAL_WINDOW_VS_ARRIVAL',
      dayNumber: 3,
      planObjectId: 'po_meal',
    });
    expect(options.map((o) => o.id)).toEqual(
      expect.arrayContaining(['shift_meal_later', 'add_travel_buffer']),
    );
  });

  it('builds from gateway assertion', () => {
    const assertion: ConstraintAssertion = {
      assertionId: 'feas_plan_object_buffer',
      constraintType: 'plan_object_buffer_day_3_po_a_po_b',
      status: 'WARNING',
      severity: 'MEDIUM',
      scope: { tripId: 't1', dayId: 'day-3', planObjectIds: ['po_b'] },
      reasonCode: 'PLAN_OBJECT_BUFFER_LINKAGE',
      evidenceRefs: ['po_b'],
      message: '缓冲仅 8 分钟',
      evaluator: { engine: 'plan-object-evaluator', version: '1.0.0', ruleId: 'BUFFER_LINKAGE' },
      overridable: true,
    };
    const options = buildPlanObjectRepairOptionsFromAssertion(assertion, 'plan_object_buffer_day_3');
    expect(options.length).toBeGreaterThan(0);
  });

  it('detects plan object issues with id: prefix semanticKey', () => {
    expect(
      isPlanObjectFeasibilityIssue({
        id: 'plan_object_meal',
        semanticKey: 'id:plan_object_meal_late_arrival_po_x',
        priority: 'suggest_adjust',
        category: 'schedule',
        title: 't',
        message: 'm',
        severity: 'low',
      }),
    ).toBe(true);
  });
});
