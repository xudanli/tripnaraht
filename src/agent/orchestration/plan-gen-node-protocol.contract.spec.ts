import {
  PLAN_GEN_ERROR_CODES,
  PLAN_GEN_ERROR_TERMINAL,
  PLAN_GEN_NODE_PROTOCOL_VERSION,
  isPlanGenErrorCode,
  resolvePlanGenErrorTerminal,
} from './plan-gen-node-protocol.constants';

describe('PLAN_GEN node protocol contract', () => {
  it('freezes version and known codes', () => {
    expect(PLAN_GEN_NODE_PROTOCOL_VERSION).toBe('1.0.0');
    expect(isPlanGenErrorCode('PLAN_GEN_EMPTY_DRAFT')).toBe(true);
    expect(isPlanGenErrorCode('MISSING_RESEARCH')).toBe(true);
    expect(isPlanGenErrorCode('UNKNOWN_X')).toBe(false);
  });

  it('maps clarify vs failed terminals', () => {
    expect(PLAN_GEN_ERROR_TERMINAL.EMPTY_DAYS_FROM_SKILL).toBe('NEED_MORE_INFO');
    expect(PLAN_GEN_ERROR_TERMINAL.MISSING_RESEARCH).toBe('NEED_MORE_INFO');
    expect(PLAN_GEN_ERROR_TERMINAL.SKILL_EXECUTION_ERROR).toBe('FAILED');
    expect(PLAN_GEN_ERROR_TERMINAL.PLAN_GEN_EXECUTOR_UNAVAILABLE).toBe('FAILED');
    expect(resolvePlanGenErrorTerminal('NO_TRIP_PLAN_REQUEST')).toBe('NEED_MORE_INFO');
    expect(resolvePlanGenErrorTerminal('weird')).toBe('NEED_MORE_INFO');
  });

  it('covers legacy executor codes as protocol members', () => {
    for (const code of [
      'EMPTY_DAYS_FROM_SKILL',
      'NO_SKILLS_REGISTRY',
      'NO_TRIP_PLAN_REQUEST',
      'SKILL_NOT_REGISTERED',
      'SKILL_RESULT_INVALID',
      'SKILL_EXECUTION_ERROR',
      'PLAN_GEN_EMPTY_DRAFT',
      'PLAN_GEN_EXECUTOR_UNAVAILABLE',
      'PLAN_GEN_HARNESS_BLOCKED',
      'GOVERNANCE_REPLANNING_DEFERRED',
      'INCONSISTENT_EMPTY_DRAFT',
    ] as const) {
      expect(Object.values(PLAN_GEN_ERROR_CODES)).toContain(code);
    }
  });
});
