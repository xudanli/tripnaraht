import { HarnessBudgetOverrunValidator } from './budget-overrun.validator';
import { HarnessStepName } from '../../contracts/harness-step.types';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';

function ctx(visible: Record<string, unknown>): HarnessExecutionContext {
  return {
    traceId: 't',
    requestId: 'r',
    step: HarnessStepName.VERIFY,
    visibleState: visible,
    visibleEvidence: [],
    allowedTools: [],
    writableStatePaths: [],
    metadata: { startedAt: new Date().toISOString(), actor: 'test' },
  };
}

describe('HarnessBudgetOverrunValidator', () => {
  const v = new HarnessBudgetOverrunValidator();

  it('skips when budgetOverrun unset', () => {
    const r = v.validate({}, ctx({ tripState: { planDraft: {} } }));
    expect(r.passed).toBe(true);
    expect(r.code).toBe('BUDGET_OVERRUN_SKIPPED');
  });

  it('rejects NaN', () => {
    const r = v.validate({}, ctx({ tripState: { budgetOverrun: Number.NaN } }));
    expect(r.passed).toBe(false);
    expect(r.code).toBe('BUDGET_OVERRUN_INVALID');
  });
});
