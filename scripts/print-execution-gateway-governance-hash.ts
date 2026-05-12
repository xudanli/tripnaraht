#!/usr/bin/env npx tsx
/**
 * CI / 本地：打印 Execution Gateway Contract Governance v1 规则集 hash。
 * 输出须与 `EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED` 一致。
 */
import {
  computeExecutionGatewayContractGovernanceRuleSetHashV1,
  EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED,
  EXECUTION_GATEWAY_GOVERNANCE_MATERIAL_V1,
} from '../src/agent/contracts/execution-gateway-contract-governance.v1';

const live = computeExecutionGatewayContractGovernanceRuleSetHashV1();
console.log('execution_gateway_governance_rule_set_hash_v1:', live);
console.log('expected_constant:', EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED);
console.log('match:', live === EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED);
console.log('material:', JSON.stringify(EXECUTION_GATEWAY_GOVERNANCE_MATERIAL_V1, null, 0));
