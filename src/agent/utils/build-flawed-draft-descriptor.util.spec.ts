import { buildFlawedDraftDescriptorV1 } from './build-flawed-draft-descriptor.util';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { GateResult } from '../interfaces/trip-plan.interface';

function successResult(overrides: Partial<OrchestrationResult['result']> = {}): OrchestrationResult {
  return {
    success: true,
    answerText: 'ok',
    stepsExecuted: [],
    decisionLog: [],
    result: {
      gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.9 },
      state: { metadata: {} } as any,
      ...overrides,
    },
  };
}

describe('buildFlawedDraftDescriptorV1', () => {
  it('returns undefined for clean SUCCESS', () => {
    expect(buildFlawedDraftDescriptorV1({ orchestrationResult: successResult() })).toBeUndefined();
  });

  it('marks ADJUST_REQUIRED gate on SUCCESS', () => {
    const gate: GateResult = {
      gate_result: 'ADJUST_REQUIRED',
      violations: [{ type: 'SCOPE', severity: 'SOFT', detail: 'tight schedule' }],
      required_adjustments: [],
      confidence: 0.7,
    };
    const out = buildFlawedDraftDescriptorV1({
      orchestrationResult: successResult({ gate_result: gate }),
      gateResult: gate,
    });
    expect(out?.schemaId).toBe('tripnara.flawed_draft@v1');
    expect(out?.is_flawed).toBe(true);
    expect(out?.reasons.some((r) => r.code === 'GATE_ADJUST_REQUIRED')).toBe(true);
    expect(out?.user_action_recommended).toBe(true);
  });

  it('marks flawed_draft_narrate metadata from allow_flawed_draft_narrate path', () => {
    const out = buildFlawedDraftDescriptorV1({
      orchestrationResult: successResult({
        state: {
          metadata: { flawed_draft_narrate: true, flawed_draft_reason: 'REPAIR_BUDGET_EXCEEDED' },
        } as any,
        decisionState: { systemState: { repairCount: 3 } } as any,
      }),
      decisionState: { systemState: { repairCount: 3 } } as any,
    });
    expect(out?.reasons.some((r) => r.code === 'REPAIR_BUDGET_EXCEEDED')).toBe(true);
    expect(out?.repair_count).toBe(3);
  });
});
