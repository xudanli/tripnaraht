import { validateK3RouteAndRunDecisionLogAlignment } from './route-and-run-k3-decision-log.contract';

describe('route-and-run-k3-decision-log.contract (K3)', () => {
  const entry = (step: string) => ({
    request_id: 'r1',
    step,
    actor: 'Orchestrator',
    inputs_summary: 's',
    outputs_summary: 'o',
    evidence_refs: [] as string[],
    timestamp: '2026-03-28T12:00:00.000Z',
  });

  it('passes when orchestrationResult is absent', () => {
    const r = validateK3RouteAndRunDecisionLogAlignment({ request_id: 'x', result: { payload: {} } });
    expect(r.valid).toBe(true);
  });

  it('requires explain.decision_log when orchestrationResult.decision_log is non-empty', () => {
    const res = {
      result: {
        payload: {
          orchestrationResult: {
            state: { decision_log: [entry('GATE_EVAL')], errors: [] },
            decision_log: [entry('GATE_EVAL')],
          },
        },
      },
    };
    const r = validateK3RouteAndRunDecisionLogAlignment(res);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('explain.decision_log missing'))).toBe(true);
  });

  it('requires matching step sequences across explain, orchestrationResult.decision_log, state.decision_log', () => {
    const log = [entry('VERIFY'), entry('REPAIR')];
    const res = {
      explain: { decision_log: log },
      result: {
        payload: {
          orchestrationResult: {
            state: { decision_log: log, errors: [] },
            decision_log: log,
          },
        },
      },
    };
    const r = validateK3RouteAndRunDecisionLogAlignment(res);
    expect(r.valid).toBe(true);
  });

  it('fails on step mismatch between explain and orchestrationResult.decision_log', () => {
    const res = {
      explain: { decision_log: [entry('VERIFY')] },
      result: {
        payload: {
          orchestrationResult: {
            state: { decision_log: [entry('REPAIR')], errors: [] },
            decision_log: [entry('REPAIR')],
          },
        },
      },
    };
    const r = validateK3RouteAndRunDecisionLogAlignment(res);
    expect(r.valid).toBe(false);
  });

  it('warns when evidence_refs is not an array', () => {
    const bad = { ...entry('GATE_EVAL'), evidence_refs: 'x' as unknown as string[] };
    const res = {
      explain: { decision_log: [bad] },
      result: {
        payload: {
          orchestrationResult: {
            state: { decision_log: [bad], errors: [] },
            decision_log: [bad],
          },
        },
      },
    };
    const r = validateK3RouteAndRunDecisionLogAlignment(res);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes('evidence_refs'))).toBe(true);
  });

  it('warns when timestamp or inputs_summary missing (CLAUDE_EXEC §4)', () => {
    const bad = {
      request_id: 'r1',
      step: 'VERIFY',
      actor: 'Orchestrator',
      evidence_refs: [] as string[],
    };
    const res = {
      explain: { decision_log: [bad] },
      result: {
        payload: {
          orchestrationResult: {
            state: { decision_log: [bad], errors: [] },
            decision_log: [bad],
          },
        },
      },
    };
    const r = validateK3RouteAndRunDecisionLogAlignment(res);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes('timestamp'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('inputs_summary'))).toBe(true);
  });

  it('fails when orchestrationResult.decision_log and state.decision_log steps diverge', () => {
    const res = {
      explain: { decision_log: [entry('VERIFY'), entry('REPAIR')] },
      result: {
        payload: {
          orchestrationResult: {
            state: { decision_log: [entry('VERIFY'), entry('NARRATE')], errors: [] },
            decision_log: [entry('VERIFY'), entry('REPAIR')],
          },
        },
      },
    };
    const r = validateK3RouteAndRunDecisionLogAlignment(res);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('orchestration vs state'))).toBe(true);
  });
});
