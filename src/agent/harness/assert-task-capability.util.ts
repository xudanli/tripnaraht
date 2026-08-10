/**
 * Runtime Guard：本轮 TaskContract 未授权的 Capability 一律拒绝。
 */

import type {
  AgentCapability,
  AgentTaskContractV1,
  AssertCapabilityResult,
} from './agent-task-contract.types';

export function isCapabilityAllowed(
  contract: AgentTaskContractV1,
  capability: AgentCapability,
): boolean {
  if (contract.capabilities.deny.includes(capability)) return false;
  return contract.capabilities.allow.includes(capability);
}

export function assertCapability(
  contract: AgentTaskContractV1,
  capability: AgentCapability,
): AssertCapabilityResult {
  if (isCapabilityAllowed(contract, capability)) {
    return { ok: true };
  }
  return {
    ok: false,
    capability,
    taskType: contract.taskType,
    reason: `capability_denied:${capability}_for_${contract.taskType}`,
  };
}

/** Full Planning / SM 所需能力集合 */
export const FULL_PLANNING_CAPABILITIES: readonly AgentCapability[] = [
  'PLAN',
  'OPTIMIZE',
  'REPAIR',
  'SOLVER',
  'VERIFY',
] as const;

export function assertFullPlanningAllowed(contract: AgentTaskContractV1): AssertCapabilityResult {
  if (!contract.allowFullPlanning) {
    return {
      ok: false,
      capability: 'PLAN',
      taskType: contract.taskType,
      reason: `full_planning_denied:${contract.planningAdmissionReason}`,
    };
  }
  for (const cap of ['PLAN', 'OPTIMIZE'] as AgentCapability[]) {
    const r = assertCapability(contract, cap);
    if (!r.ok) return r;
  }
  return { ok: true };
}

export function assertNoSilentUpgradeFromQuery(
  contract: AgentTaskContractV1,
  attempted: AgentCapability,
): AssertCapabilityResult {
  if (contract.taskType === 'TRIP_QUERY' || contract.taskType === 'GENERAL_RESEARCH') {
    return assertCapability(contract, attempted);
  }
  return { ok: true };
}
