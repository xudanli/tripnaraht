// src/agent/contracts/execution-gateway-contract-governance.v1.ts
/**
 * Execution Contract Governance v1（最小 registry）：规则版本 + 规则集 hash，供 CI / replay 对账 / 演进迁移。
 *
 * **Migration v1 → v2（预期做法）**
 * - 新增 `GOVERNANCE_MATERIAL_V2` 与并列 hash；网关 enforcement 按 `gatewayEnforcement` 或显式 options 选择实现。
 * - v1 材料冻结保留，旧 replay 锚仍可对账 `rule_set_hash`。
 * - bump `SEMANTIC_VALIDATION_CONTRACT_REVISION` 时须重算 `EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED`（`npm run exec:gateway-governance-hash`）。
 *
 * @see semantic-validation-contract.md §16
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md (SSC v1 — CI + bump rules)
 * @see change-impact-descriptor.v1.json (CID v1 — change-time impact manifest)
 */
import { executionTimelineInputHash } from '../runtime/execution-timeline-hash.util';
import { SEMANTIC_VALIDATION_CONTRACT_REVISION } from '../runtime/testing/semantic-validation-result-schema';
import {
  ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID,
  ORCHESTRATION_EXECUTION_TRACE_V1_VERSION,
} from './orchestration-execution-trace-v1.types';

export const EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_SCHEMA_ID =
  'agent.execution_gateway.contract_governance@v1' as const;
export const EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_VERSION = 1 as const;

/** 参与 hash 的冻结材料；任一字段语义变更须 bump 对应 rule key 或 revision 并重算 expected hash */
export const EXECUTION_GATEWAY_GOVERNANCE_MATERIAL_V1 = {
  schemaId: EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_SCHEMA_ID,
  version: EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_VERSION,
  gatewayEnforcement: 'v1',
  rules: {
    traceContract: 'v1',
    memoryBindingContract: 'v1',
    routerOutputContract: 'v1',
  },
  traceSchemaId: ORCHESTRATION_EXECUTION_TRACE_V1_SCHEMA_ID,
  traceSchemaVersion: ORCHESTRATION_EXECUTION_TRACE_V1_VERSION,
  semanticValidationContractRevision: SEMANTIC_VALIDATION_CONTRACT_REVISION,
} as const;

/**
 * 稳定规则集指纹：与 ledger / trace 指纹算法族一致（canonical JSON + sha256）。
 * CI：`npm run exec:gateway-governance-hash` 输出须与此常量一致。
 */
export function computeExecutionGatewayContractGovernanceRuleSetHashV1(): string {
  return executionTimelineInputHash(EXECUTION_GATEWAY_GOVERNANCE_MATERIAL_V1) ?? '';
}

/**
 * bump 规则材料或 `SEMANTIC_VALIDATION_CONTRACT_REVISION` 后更新；用于 CI 与运行时自洽断言。
 * 重算：`npm run exec:gateway-governance-hash`
 */
export const EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED =
  '2e13fc57cc1d58376c797ef5ce48f7743e8c37af6635cc7d7253b12e3d60520d' as const;

export type ExecutionContractGovernanceEchoV1 = {
  schemaId: 'agent.execution_contract_governance.echo@v1';
  version: 1;
  semantic_contract_revision: typeof SEMANTIC_VALIDATION_CONTRACT_REVISION;
  rule_set_hash: string;
  rules: {
    trace_contract: string;
    memory_binding_contract: string;
    router_output_contract: string;
  };
};

export function buildExecutionContractGovernanceEchoV1(): ExecutionContractGovernanceEchoV1 {
  const m = EXECUTION_GATEWAY_GOVERNANCE_MATERIAL_V1;
  return {
    schemaId: 'agent.execution_contract_governance.echo@v1',
    version: 1,
    semantic_contract_revision: SEMANTIC_VALIDATION_CONTRACT_REVISION,
    rule_set_hash: computeExecutionGatewayContractGovernanceRuleSetHashV1(),
    rules: {
      trace_contract: m.rules.traceContract,
      memory_binding_contract: m.rules.memoryBindingContract,
      router_output_contract: m.rules.routerOutputContract,
    },
  };
}
