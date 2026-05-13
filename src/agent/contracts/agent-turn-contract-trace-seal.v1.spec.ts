import type { AgentTurnContractV1 } from './agent-turn-contract.v1';
import {
  buildAgentTurnContractTraceSealV1,
  redactAgentTurnContractForTrace,
  resolveAgentTurnPolicyAppliedV1,
} from './agent-turn-contract-trace-seal.v1';

function baseContract(overrides: Partial<AgentTurnContractV1> = {}): AgentTurnContractV1 {
  return {
    version: 'v1',
    input: {
      request_id: 'r1',
      user_id: 'u1',
      trip_id: 't1',
      message: 'secret 用户指令',
      intent_mode: 'AUTO',
    },
    context: {
      snapshot_id: 'snap',
      snapshot_version: 1,
      memory_request_id: 'r1',
      memory_user_id: 'u1',
      memory_trip_id: 't1',
      loaded_at: '2026-05-13T00:00:00.000Z',
      observability_layers: ['x'],
    },
    scope: {
      dry_run: false,
      allow_webbrowse: false,
      enable_live_tools: [],
      live_facts: false,
      intent_recognition_skill: true,
      use_claude_orchestration: false,
      use_state_machine_orchestration: true,
      tool_policy_tags: [],
    },
    budget: { max_seconds: 30, max_steps: 8, max_browser_steps: 12, cost_budget_usd: null },
    profile: { client_profile: null, execution_model_runtime_hint: null },
    preference_weights: null,
    execution_affinity: 'LOCAL',
    ...overrides,
  };
}

describe('agent-turn-contract-trace-seal.v1', () => {
  it('redacts message but keeps byte length', () => {
    const c = baseContract();
    const r = redactAgentTurnContractForTrace(c);
    expect((r.input as any).message).toBeUndefined();
    expect(r.input.message_redacted).toBe(true);
    expect(r.input.message_utf8_bytes).toBeGreaterThan(0);
  });

  it('resolveAgentTurnPolicyAppliedV1 respects readonly_mode', () => {
    expect(
      resolveAgentTurnPolicyAppliedV1({
        contract: baseContract(),
        taskType: 'TRIP_PLANNING',
        readonly_mode: true,
      }),
    ).toBe('INDUSTRIAL_READONLY');
  });

  it('maps client_profile to industrial cost when ccl/sap hinted', () => {
    expect(
      resolveAgentTurnPolicyAppliedV1({
        contract: baseContract({
          profile: { client_profile: 'factory_ccl', execution_model_runtime_hint: null },
        }),
        taskType: 'DATA_LOOKUP',
      }),
    ).toBe('INDUSTRIAL_COST_PRECISION');
  });

  it('buildAgentTurnContractTraceSealV1 produces INIT_ENRICHMENT seal', () => {
    const seal = buildAgentTurnContractTraceSealV1({
      contract: baseContract({ profile: { client_profile: 'danny_strategy', execution_model_runtime_hint: null } }),
      taskType: 'GENERIC_QA',
    });
    expect(seal.schema_id).toBe('agent.turn_contract.trace_seal@v1');
    expect(seal.step).toBe('INIT_ENRICHMENT');
    expect(seal.policy_applied).toBe('STRATEGY_DEEP_THINK');
    expect(seal.contract_snapshot.input.message_redacted).toBe(true);
  });
});
