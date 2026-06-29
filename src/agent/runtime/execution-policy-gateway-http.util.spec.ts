import {
  assertExternalApiPolicyAllowed,
  ExecutionPolicyGatewayHttpBlockedError,
  guardExternalApiPolicyDispatch,
} from './execution-policy-gateway-http.util';
import { compileExecutionPolicyGatewayRules } from './execution-policy-gateway-manifest.util';
import { parseAgenticTokenQuotaConfig } from './agentic-token-quota.util';

describe('execution-policy-gateway-http.util', () => {
  const rules = compileExecutionPolicyGatewayRules({
    hitlGovernanceEnabled: false,
    toolPolicies: {},
    tokenQuota: parseAgenticTokenQuotaConfig({}),
  });

  it('throws when enforcement enabled and URL matches destructive pattern', () => {
    expect(() =>
      assertExternalApiPolicyAllowed({
        url: 'https://hooks.example.com/forward-message',
        rules,
        enforcementEnabled: true,
      }),
    ).toThrow(ExecutionPolicyGatewayHttpBlockedError);
  });

  it('observe mode does not throw even for side-effect URL', () => {
    expect(() =>
      assertExternalApiPolicyAllowed({
        url: 'https://hooks.example.com/forward-message',
        rules,
        enforcementEnabled: false,
      }),
    ).not.toThrow();
  });
});
