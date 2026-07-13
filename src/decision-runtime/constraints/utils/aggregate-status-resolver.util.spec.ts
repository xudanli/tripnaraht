import {
  resolveAggregateStatus,
  tepOutcomeToExecutabilityAggregate,
  tepOutcomeToExecutabilityLaneStatus,
} from './aggregate-status-resolver.util';

describe('aggregate-status-resolver.util', () => {
  it('prefers EXECUTION_BLOCK over PLANNING_BLOCK', () => {
    const status = resolveAggregateStatus({
      planning: { status: 'PASS', source: 'FEASIBILITY' },
      executability: { status: 'BLOCK', source: 'TEP', ruleId: 'SDR-101' },
      runtime: null,
    });
    expect(status).toBe('EXECUTION_BLOCK');
  });

  it('returns PLANNING_BLOCK when only planning fails', () => {
    const status = resolveAggregateStatus({
      planning: { status: 'BLOCK', source: 'FEASIBILITY' },
      executability: { status: 'PASS', source: 'TEP' },
      runtime: null,
    });
    expect(status).toBe('PLANNING_BLOCK');
  });

  it('maps TEP NEED_CONFIRM to executability BLOCK + EXECUTION_BLOCK', () => {
    expect(tepOutcomeToExecutabilityLaneStatus('NEED_CONFIRM')).toBe('BLOCK');
    expect(tepOutcomeToExecutabilityAggregate('NEED_CONFIRM')).toBe('EXECUTION_BLOCK');
  });
});
