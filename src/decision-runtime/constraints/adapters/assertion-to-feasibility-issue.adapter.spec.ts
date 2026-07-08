import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { gatewayAssertionToFeasibilityIssue } from './assertion-to-feasibility-issue.adapter';

describe('assertion-to-feasibility-issue.adapter', () => {
  const poiAssertion: ConstraintAssertion = {
    assertionId: 'feas_issue-poi-1',
    constraintType: 'poi_access_reservation_required',
    status: 'BLOCK',
    severity: 'CRITICAL',
    scope: { tripId: 'trip-1', dayId: 'day-2', activityId: 'item-1' },
    reasonCode: 'poi_access_reservation_required',
    evidenceRefs: ['rule-1'],
    message: '蓝湖需要预约',
    evaluator: { engine: 'poi-access-capacity', version: '1.0.0', ruleId: 'poi_access_reservation_required' },
    overridable: false,
  };

  it('CAS-010: maps BLOCK assertion to must_handle feasibility issue', () => {
    const issue = gatewayAssertionToFeasibilityIssue(poiAssertion);
    expect(issue.id).toBe('issue-poi-1');
    expect(issue.priority).toBe('must_handle');
    expect(issue.category).toBe('access_capacity');
    expect(issue.proofs?.[0]?.evidenceType).toBe('gateway_projection');
  });

  it('CAS-121: plan-object assertion uses short queue title and diagnostic message', () => {
    const assertion: ConstraintAssertion = {
      assertionId: 'feas_plan_object_meal_late',
      constraintType: 'plan_object_meal_late_arrival_po_abc_meal_window_policy',
      status: 'WARNING',
      severity: 'MEDIUM',
      scope: { tripId: 'trip-1', dayId: 'day-3' },
      reasonCode: 'PLAN_OBJECT_MEAL_ARRIVAL',
      evidenceRefs: ['po_abc'],
      message: '预计 钻石沙滩 结束于 13:50，晚于午餐窗 12:00',
      evaluator: { engine: 'plan-object-evaluator', version: '1.0.0', ruleId: 'MEAL_WINDOW_VS_ARRIVAL' },
      overridable: true,
    };

    const issue = gatewayAssertionToFeasibilityIssue(assertion);
    expect(issue.title).toBe('午餐窗冲突');
    expect(issue.message).toBe('预计 钻石沙滩 结束于 13:50，晚于午餐窗 12:00');
    expect(issue.semanticKey).toBe('plan_object_meal_late_arrival_po_abc_meal_window_policy');
    expect(issue.proofs?.[0]).toMatchObject({
      entity: '日内评估',
      currentFact: assertion.message,
      semanticKey: assertion.constraintType,
      ruleId: 'MEAL_WINDOW_VS_ARRIVAL',
      evidenceSource: 'plan-object-evaluator',
    });
    expect(issue.proofs?.[0]?.entity).not.toMatch(/^plan_object_/);
    expect(issue.repairOptions?.length).toBeGreaterThan(0);
    expect(issue.repairOptions?.map((o) => o.id)).toEqual(
      expect.arrayContaining(['shift_meal_later', 'add_travel_buffer']),
    );
  });
});
