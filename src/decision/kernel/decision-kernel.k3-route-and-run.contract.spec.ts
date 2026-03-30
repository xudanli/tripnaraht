/**
 * WP-DK-P1-1 抽样：Kernel 相关出口若组装为 route_and_run 包络，应满足 K3（三处 decision_log 对齐）
 */
import { validateK3RouteAndRunDecisionLogAlignment } from '../../agent/contracts/route-and-run-k3-decision-log.contract';

describe('DecisionKernel K3 / route_and_run envelope (sample)', () => {
  it('accepts explain + orchestrationResult.state + orchestrationResult.decision_log aligned (GATE_EVAL)', () => {
    const ts = new Date().toISOString();
    const decision_log = [
      {
        request_id: 'dso-k3-sample',
        step: 'GATE_EVAL',
        actor: 'Orchestrator',
        inputs_summary: 'gate.should_exist',
        outputs_summary: 'BLOCK',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
    ];
    const res = {
      request_id: 'dso-k3-sample',
      explain: { decision_log },
      result: {
        payload: {
          orchestrationResult: {
            state: {
              request_id: 'dso-k3-sample',
              decision_log,
              errors: [],
            },
            decision_log,
          },
        },
      },
    };
    const r = validateK3RouteAndRunDecisionLogAlignment(res);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('accepts multi-step log with evidence_refs (INTAKE → PLAN_GEN)', () => {
    const ts = new Date().toISOString();
    const decision_log = [
      {
        request_id: 'dso-k3-multi',
        step: 'INTAKE',
        actor: 'Orchestrator',
        inputs_summary: 'user message',
        outputs_summary: 'parsed',
        evidence_refs: ['ev-1'],
        timestamp: ts,
      },
      {
        request_id: 'dso-k3-multi',
        step: 'PLAN_GEN',
        actor: 'Planner',
        inputs_summary: 'context',
        outputs_summary: 'draft',
        evidence_refs: ['ev-1', 'ev-2'],
        timestamp: ts,
      },
    ];
    const res = {
      request_id: 'dso-k3-multi',
      explain: { decision_log },
      result: {
        payload: {
          orchestrationResult: {
            state: {
              request_id: 'dso-k3-multi',
              decision_log,
              errors: [],
            },
            decision_log,
          },
        },
      },
    };
    const r = validateK3RouteAndRunDecisionLogAlignment(res);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });
});
