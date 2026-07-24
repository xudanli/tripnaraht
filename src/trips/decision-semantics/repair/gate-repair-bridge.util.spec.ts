import { planGateRepairSync, canPlanGateRepair } from '../repair/gate-repair-bridge.util';
import type { DecisionProblemDetail } from '../types/decision-semantics.types';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';

function gateDetail(): DecisionProblemDetail {
  return {
    id: 'dp_gate_reach',
    tripId: 'trip1',
    type: 'INFEASIBILITY',
    title: '不可达',
    description: '路段不可达',
    detectedBy: 'GATE',
    detectedAt: '2026-06-30T08:00:00Z',
    tripVersion: 'rev-1',
    affectedScope: [{ scopeType: 'DAY', scopeId: '2', impactType: 'BLOCKED', severity: 'HIGH' }],
    status: 'OPEN',
    semanticKey: 'gate:REACHABILITY:f208',
    sourceRefs: [{ system: 'GATE', refId: 'REACHABILITY:f208' }],
    assertionIds: ['ca1'],
    assertions: [],
  };
}

describe('gate-repair-bridge', () => {
  it('plans validate for gate_data_revalidate', () => {
    expect(planGateRepairSync('gate_data_revalidate', gateDetail(), [])).toEqual({
      kind: 'validate_trip',
    });
    expect(canPlanGateRepair('gate_data_revalidate', gateDetail(), [])).toBe(true);
  });

  it('bridges gate_reach_alt_route to related feasibility repair option', () => {
    const issues: FeasibilityIssueDto[] = [
      {
        id: 'issue-route-d2',
        priority: 'must_handle',
        category: 'route',
        title: '封路',
        message: 'F-road 关闭',
        affectedDays: [2],
        severity: 'high',
        issueKind: 'visitor_access',
        repairOptions: [
          {
            id: 'bypass_via_ring',
            label: '绕行',
            description: '改走 1 号公路',
            impactSummary: 'medium',
            actionType: 'change_route',
          },
        ],
      },
    ];

    const plan = planGateRepairSync('gate_reach_alt_route', gateDetail(), issues);
    expect(plan).toEqual({
      kind: 'feasibility_apply',
      issue: issues[0],
      optionId: 'bypass_via_ring',
    });
  });

  it('returns null when no related feasibility repair exists', () => {
    expect(planGateRepairSync('gate_reach_alt_route', gateDetail(), [])).toBeNull();
  });
});
