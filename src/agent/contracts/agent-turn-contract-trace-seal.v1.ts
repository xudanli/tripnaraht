/**
 * Observability seal for AgentTurnContract v1 — sibling to `execution_trace_v1` under `observability.trace`.
 * Message body is never persisted here (length only).
 */
import type { AgentTurnContractV1 } from './agent-turn-contract.v1';

export const AGENT_TURN_CONTRACT_TRACE_SEAL_SCHEMA_ID = 'agent.turn_contract.trace_seal@v1' as const;

export type AgentTurnContractTraceSealStep = 'INIT_ENRICHMENT';

/** High-level policy bucket for audit / dashboards (Gateway table may refine later). */
export type AgentTurnPolicyAppliedTag =
  | 'INDUSTRIAL_READONLY'
  | 'FACTORY_HIGH_DETERMINISM'
  | 'INDUSTRIAL_COST_PRECISION'
  | 'STRATEGY_DEEP_THINK'
  | 'DEFAULT_TOURISM';

export type AgentTurnContractRedactedSnapshotV1 = Omit<AgentTurnContractV1, 'input'> & {
  input: Omit<AgentTurnContractV1['input'], 'message'> & {
    message_redacted: true;
    message_utf8_bytes: number;
  };
};

export type AgentTurnContractTraceSealV1 = {
  schema_id: typeof AGENT_TURN_CONTRACT_TRACE_SEAL_SCHEMA_ID;
  version: 1;
  step: AgentTurnContractTraceSealStep;
  policy_applied: AgentTurnPolicyAppliedTag;
  /** Same family as `trace.route_decision.task_type` for join queries. */
  task_type_route_signal: string;
  contract_snapshot: AgentTurnContractRedactedSnapshotV1;
};

export function resolveAgentTurnPolicyAppliedV1(args: {
  contract: AgentTurnContractV1;
  taskType: string;
  readonly_mode?: boolean;
}): AgentTurnPolicyAppliedTag {
  const { contract, readonly_mode } = args;
  const profile = (contract.profile.client_profile ?? '').toLowerCase();

  if (readonly_mode === true) {
    return 'INDUSTRIAL_READONLY';
  }
  if (profile.includes('ccl') || profile.includes('sap') || profile.includes('cost_ledger')) {
    return 'INDUSTRIAL_COST_PRECISION';
  }
  if (profile.includes('factory') || profile.includes('deterministic') || profile.includes('aps')) {
    return 'FACTORY_HIGH_DETERMINISM';
  }
  if (profile.includes('strategy') || profile.includes('founder') || profile.includes('board')) {
    return 'STRATEGY_DEEP_THINK';
  }
  return 'DEFAULT_TOURISM';
}

function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

export function redactAgentTurnContractForTrace(contract: AgentTurnContractV1): AgentTurnContractRedactedSnapshotV1 {
  const { message, ...inputRest } = contract.input;
  return {
    ...contract,
    input: {
      ...inputRest,
      message_redacted: true,
      message_utf8_bytes: utf8ByteLength(message),
    },
  };
}

export function buildAgentTurnContractTraceSealV1(args: {
  contract: AgentTurnContractV1;
  taskType: string;
  readonly_mode?: boolean;
}): AgentTurnContractTraceSealV1 {
  const { contract, taskType, readonly_mode } = args;
  return {
    schema_id: AGENT_TURN_CONTRACT_TRACE_SEAL_SCHEMA_ID,
    version: 1,
    step: 'INIT_ENRICHMENT',
    policy_applied: resolveAgentTurnPolicyAppliedV1({ contract, taskType, readonly_mode }),
    task_type_route_signal: taskType,
    contract_snapshot: redactAgentTurnContractForTrace(contract),
  };
}
