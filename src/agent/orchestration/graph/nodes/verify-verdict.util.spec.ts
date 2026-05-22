import { buildVerifyPhaseVerdict } from './verify-verdict.util';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

function baseState(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    request_id: 'r1',
    current_step: 'VERIFY',
    metadata: { last_updated_at: new Date().toISOString() },
    decision_log: [],
    errors: [],
    gate_result: { gate_result: 'PASS' },
    ...overrides,
  } as OrchestratorState;
}

describe('buildVerifyPhaseVerdict', () => {
  const prev = process.env.DECISION_VERIFY_RETURN_TO_RESEARCH;

  afterEach(() => {
    if (prev === undefined) delete process.env.DECISION_VERIFY_RETURN_TO_RESEARCH;
    else process.env.DECISION_VERIFY_RETURN_TO_RESEARCH = prev;
  });

  it('returns fatal when verification.hasFatal', () => {
    const v = buildVerifyPhaseVerdict(baseState(), {
      verification: {
        hasFatal: true,
        issues: [{ class: 'FATAL', message: 'boom' }],
      },
    } as any);
    expect(v).toEqual({ kind: 'fatal', fatalMessage: 'boom' });
  });

  it('returns return_to_research on L2 harness action when enabled', () => {
    process.env.DECISION_VERIFY_RETURN_TO_RESEARCH = 'true';
    const v = buildVerifyPhaseVerdict(baseState(), {
      verification: { hasFatal: false, issues: [] },
      harnessRuntime: {
        last_harness_failure_events: [
          { step: 'VERIFY', code: 'EVIDENCE_SNAPSHOT_UNBOUND', severity: 'L2' },
        ],
      },
    } as any);
    expect(v.kind).toBe('return_to_research');
  });

  it('returns needs_repair when gate ADJUST_REQUIRED or errors present', () => {
    expect(
      buildVerifyPhaseVerdict(
        baseState({ gate_result: { gate_result: 'ADJUST_REQUIRED' } }),
        { verification: { hasFatal: false, issues: [] } } as any,
      ).kind,
    ).toBe('needs_repair');
    expect(
      buildVerifyPhaseVerdict(
        baseState({
          errors: [{ step: 'VERIFY', error_code: 'X', message: 'm', timestamp: '' }],
        }),
        { verification: { hasFatal: false, issues: [] } } as any,
      ).kind,
    ).toBe('needs_repair');
  });

  it('returns complete when verify passes', () => {
    expect(
      buildVerifyPhaseVerdict(baseState(), {
        verification: { hasFatal: false, issues: [] },
      } as any).kind,
    ).toBe('complete');
  });
});
