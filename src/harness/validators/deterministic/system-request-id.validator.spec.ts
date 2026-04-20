import { HarnessSystemRequestIdValidator } from './system-request-id.validator';
import { HarnessStepName } from '../../contracts/harness-step.types';
import type { HarnessExecutionContext } from '../../runtime/execution-context.types';

function ctx(
  visible: Record<string, unknown>,
  requestId: string,
): HarnessExecutionContext {
  return {
    traceId: 't',
    requestId,
    step: HarnessStepName.PLAN_GEN,
    visibleState: visible,
    visibleEvidence: [],
    allowedTools: [],
    writableStatePaths: [],
    metadata: { startedAt: new Date().toISOString(), actor: 'test' },
  };
}

describe('HarnessSystemRequestIdValidator', () => {
  const v = new HarnessSystemRequestIdValidator();

  it('skips when systemState not in visible', () => {
    const r = v.validate({}, ctx({ userIntent: {} }, 'r1'));
    expect(r.passed).toBe(true);
    expect(r.code).toBe('SYSTEM_REQUEST_ID_SKIPPED');
  });

  it('passes when request ids match', () => {
    const r = v.validate(
      {},
      ctx({ systemState: { requestId: 'req-a' } }, 'req-a'),
    );
    expect(r.passed).toBe(true);
    expect(r.code).toBe('SYSTEM_REQUEST_ID_OK');
  });

  it('fails on mismatch', () => {
    const r = v.validate(
      {},
      ctx({ systemState: { requestId: 'req-a' } }, 'req-b'),
    );
    expect(r.passed).toBe(false);
    expect(r.code).toBe('SYSTEM_REQUEST_ID_MISMATCH');
  });
});
