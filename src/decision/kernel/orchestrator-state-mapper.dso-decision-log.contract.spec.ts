/**
 * WP-DK-P1-1：`persistDso` 使用 JSON 序列化；Orchestrator 侧 `decision_log` 在 base 上，
 * 经往返后 `decisionStateToOrchestratorState` 仍应保留，便于与 K3 / AO-04 对齐。
 */
import { decisionStateToOrchestratorState } from './orchestrator-state-mapper';
import type { DecisionState } from './decision-state.types';

describe('orchestrator-state-mapper DSO + base.decision_log (persist round-trip)', () => {
  it('preserves base.decision_log after JSON.parse/stringify like DsoFeedbackPersistenceService', () => {
    const ts = new Date().toISOString();
    const decision_log = [
      {
        request_id: 'persist-dl-1',
        step: 'GATE_EVAL',
        actor: 'Orchestrator',
        inputs_summary: 'gate.should_exist',
        outputs_summary: 'ALLOW',
        evidence_refs: [] as string[],
        timestamp: ts,
      },
    ];
    const dso = {
      requestId: 'persist-dl-1',
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId: 'persist-dl-1',
        startedAt: ts,
        lastUpdatedAt: ts,
        version: 1,
        currentPhase: 'GATE_EVAL',
      },
    } as DecisionState;

    const base = {
      request_id: 'persist-dl-1',
      decision_log,
      errors: [] as { step?: string; message?: string }[],
    };

    const roundtrip = JSON.parse(JSON.stringify({ dso, base })) as {
      dso: DecisionState;
      base: typeof base;
    };
    const out = decisionStateToOrchestratorState(roundtrip.dso, roundtrip.base);
    expect(out.decision_log?.length).toBe(1);
    expect(out.decision_log?.[0]?.step).toBe('GATE_EVAL');
    expect(out.decision_log?.[0]?.timestamp).toBe(ts);
  });
});
