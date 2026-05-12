#!/usr/bin/env npx tsx
/**
 * CI gate: Execution OS Stability Contract v1 — governance hash drift detection.
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md §1
 */
import {
  computeExecutionGatewayContractGovernanceRuleSetHashV1,
  EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED,
} from '../../src/agent/contracts/execution-gateway-contract-governance.v1';

const live = computeExecutionGatewayContractGovernanceRuleSetHashV1();
const expected = EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED;

if (live !== expected) {
  console.error('[ci:execution-os-stability] GOVERNANCE_HASH_MISMATCH');
  console.error('  live:    ', live);
  console.error('  expected:', expected);
  console.error('  Run: npm run exec:gateway-governance-hash');
  console.error('  Then update EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED if change is intentional.');
  process.exit(1);
}

console.log('[ci:execution-os-stability] governance_hash_ok', live);
process.exit(0);
