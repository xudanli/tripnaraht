import { buildRepairCommand, inferExecutionCapability } from '../repair/build-repair-command.util';
import type { DecisionProblemDetail } from '../types/decision-semantics.types';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';

function detail(partial?: Partial<DecisionProblemDetail>): DecisionProblemDetail {
  return {
    id: 'dp_1',
    tripId: 'trip1',
    type: 'INFEASIBILITY',
    title: '不可达',
    description: '封路',
    detectedBy: 'GATE',
    detectedAt: '2026-06-30T08:00:00Z',
    tripVersion: 'rev-1',
    affectedScope: [{ scopeType: 'DAY', scopeId: '2', impactType: 'BLOCKED', severity: 'HIGH' }],
    status: 'OPEN',
    semanticKey: 'gate:REACHABILITY:f208',
    sourceRefs: [{ system: 'GATE', refId: 'REACHABILITY:f208' }],
    assertionIds: ['ca1'],
    assertions: [],
    ...partial,
  };
}

function issue(partial: Partial<FeasibilityIssueDto>): FeasibilityIssueDto {
  return {
    id: 'issue-1',
    priority: 'must_handle',
    category: 'route',
    title: 't',
    message: 'm',
    affectedDays: [2],
    severity: 'high',
    ...partial,
  };
}

describe('build-repair-command', () => {
  it('maps gate reachability option to CHANGE_ROUTE + GUIDED_MANUAL', () => {
    const cmd = buildRepairCommand({
      optionId: 'gate_reach_alt_route',
      tripVersion: 'rev-1',
      detail: detail(),
    });
    expect(cmd?.commandType).toBe('CHANGE_ROUTE');
    expect(cmd?.expectedTripVersion).toBe('rev-1');

    const capability = inferExecutionCapability({
      optionId: 'gate_reach_alt_route',
      source: 'RULE_ENGINE',
      executable: false,
      optionType: 'REPAIR',
      hasFeasibilityIssue: false,
      canExecuteRepair: false,
      repairCommand: cmd,
    });
    expect(capability).toBe('GUIDED_MANUAL');
  });

  it('maps feasibility insert_rest to ADD_BUFFER + DIRECT when applyRepair available', () => {
    const i = issue({
      id: 'issue-drive',
      issueKind: 'daily_drive',
      repairOptions: [
        {
          id: 'insert_rest',
          label: '缓冲日',
          description: '拆分',
          impactSummary: 'high',
          actionType: 'insert_rest_day',
        },
      ],
    });
    const cmd = buildRepairCommand({
      optionId: 'insert_rest',
      tripVersion: 'rev-1',
      detail: detail({ detectedBy: 'FEASIBILITY' }),
      issue: i,
      repairOption: {
        id: 'insert_rest',
        title: '缓冲日',
        description: '拆分',
        impact: 'high',
        actionType: 'insert_rest_day',
      },
    });
    expect(cmd?.commandType).toBe('ADD_BUFFER');

    expect(
      inferExecutionCapability({
        optionId: 'insert_rest',
        source: 'CONSTRAINT_REPAIR',
        executable: true,
        optionType: 'REPAIR',
        hasFeasibilityIssue: true,
        canExecuteRepair: true,
        repairCommand: cmd,
      }),
    ).toBe('DIRECT');
  });

  it('returns ADVISORY_ONLY for ack options', () => {
    expect(
      inferExecutionCapability({
        optionId: 'ack_ab12cd34',
        source: 'RULE_ENGINE',
        executable: false,
        optionType: 'ACCEPT_RISK',
        hasFeasibilityIssue: false,
        canExecuteRepair: false,
      }),
    ).toBe('ADVISORY_ONLY');
  });
});
