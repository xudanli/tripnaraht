/**
 * Shared CI-only verdict builder for Execution OS stability observability.
 * No runtime imports from Nest; pure governance + axis constants.
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md §8
 */
import {
  CID_AXIS_STABILITY_LOCK,
  CID_AXIS_VERSION,
} from '../../src/agent/contracts/execution-os-change-impact-descriptor.v1';
import {
  computeExecutionGatewayContractGovernanceRuleSetHashV1,
  EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED,
} from '../../src/agent/contracts/execution-gateway-contract-governance.v1';

export type ExecutionOsVerdictV1 = {
  schemaId: 'agent.execution_os.verdict@v1';
  version: 1;
  status: 'PASS' | 'FAIL';
  mode: 'cid-aware';
  cid_axis_version: typeof CID_AXIS_VERSION;
  cid_axis_stability_lock: typeof CID_AXIS_STABILITY_LOCK;
  fingerprint_match: true;
  governance_match: boolean;
  replay_safe: true;
  note: string;
};

const CI_CONTRACT_PROFILE_MODE = 'cid-aware' as const;

export function buildExecutionOsVerdictV1(): ExecutionOsVerdictV1 {
  const governanceMatch =
    computeExecutionGatewayContractGovernanceRuleSetHashV1() ===
    EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED;

  return {
    schemaId: 'agent.execution_os.verdict@v1',
    version: 1,
    status: governanceMatch ? 'PASS' : 'FAIL',
    mode: CI_CONTRACT_PROFILE_MODE,
    cid_axis_version: CID_AXIS_VERSION,
    cid_axis_stability_lock: CID_AXIS_STABILITY_LOCK,
    fingerprint_match: true,
    governance_match: governanceMatch,
    replay_safe: true,
    note:
      'fingerprint_match and replay_safe are implied by jest exit 0 in this script chain; run `npm run ci:cid-v1` for CID manifest closure.',
  };
}
