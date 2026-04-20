import { HarnessUserIntentBudgetValidator } from './user-intent-budget.validator';
import { HarnessStepName } from '../../contracts/harness-step.types';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';

function ctx(visible: Record<string, unknown>): HarnessExecutionContext {
  return {
    traceId: 't',
    requestId: 'r',
    step: HarnessStepName.INTAKE,
    visibleState: visible,
    visibleEvidence: [],
    allowedTools: [],
    writableStatePaths: [],
    metadata: { startedAt: new Date().toISOString(), actor: 'test' },
  };
}

describe('HarnessUserIntentBudgetValidator', () => {
  const v = new HarnessUserIntentBudgetValidator();

  it('skips when budget unset', () => {
    const r = v.validate({}, ctx({ userIntent: { destination: 'X' } }));
    expect(r.passed).toBe(true);
    expect(r.code).toBe('USER_INTENT_BUDGET_SKIPPED');
  });

  it('accepts numeric string budget', () => {
    const r = v.validate({}, ctx({ userIntent: { budget: ' 2500.50 ' } }));
    expect(r.passed).toBe(true);
    expect(r.code).toBe('USER_INTENT_BUDGET_OK');
  });

  it('skips when budget is whitespace-only string', () => {
    const r = v.validate({}, ctx({ userIntent: { budget: '   ' } }));
    expect(r.passed).toBe(true);
    expect(r.code).toBe('USER_INTENT_BUDGET_SKIPPED');
  });

  it('rejects non-positive', () => {
    const r = v.validate({}, ctx({ userIntent: { budget: 0 } }));
    expect(r.passed).toBe(false);
    expect(r.code).toBe('USER_INTENT_BUDGET_NON_POSITIVE');
  });

  it('rejects NaN', () => {
    const r = v.validate({}, ctx({ userIntent: { budget: Number.NaN } }));
    expect(r.passed).toBe(false);
    expect(r.code).toBe('USER_INTENT_BUDGET_INVALID_TYPE');
  });
});
