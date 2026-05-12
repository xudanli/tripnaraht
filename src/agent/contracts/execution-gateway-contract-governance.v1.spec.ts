import {
  computeExecutionGatewayContractGovernanceRuleSetHashV1,
  EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED,
  buildExecutionContractGovernanceEchoV1,
} from './execution-gateway-contract-governance.v1';

describe('execution-gateway-contract-governance.v1', () => {
  it('rule set hash matches pinned EXPECTED (drift gate)', () => {
    expect(computeExecutionGatewayContractGovernanceRuleSetHashV1()).toBe(
      EXECUTION_GATEWAY_CONTRACT_GOVERNANCE_RULE_SET_HASH_V1_EXPECTED,
    );
  });

  it('echo carries same hash as compute()', () => {
    const echo = buildExecutionContractGovernanceEchoV1();
    expect(echo.rule_set_hash).toBe(computeExecutionGatewayContractGovernanceRuleSetHashV1());
    expect(echo.rules.trace_contract).toBe('v1');
  });
});
