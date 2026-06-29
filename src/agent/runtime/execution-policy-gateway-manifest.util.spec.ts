import { mergeExecutionToolPolicies } from './agent-execution-policy-gateway.util';
import { parseAgenticTokenQuotaConfig } from './agentic-token-quota.util';
import {
  buildExecutionPolicyGatewayManifest,
  compileExecutionPolicyGatewayRules,
  evaluatePolicyGatewayDispatch,
} from './execution-policy-gateway-manifest.util';

describe('execution-policy-gateway-manifest.util', () => {
  it('compiles three channels from tool policies + env', () => {
    const policies = mergeExecutionToolPolicies(true, undefined);
    const rules = compileExecutionPolicyGatewayRules({
      hitlGovernanceEnabled: true,
      toolPolicies: policies,
      tokenQuota: parseAgenticTokenQuotaConfig({ AGENTIC_SESSION_TOKEN_CAP: '5000' }),
      env: { AGENTIC_LOOP_MAX_TOTAL_TOKENS: '4000' },
    });
    const manifest = buildExecutionPolicyGatewayManifest({
      rules,
      externalApiEnforcementEnabled: false,
    });
    expect(manifest.schemaId).toBe('tripnara.execution_policy_manifest@v1');
    expect(manifest.channels.mcp_tool.rule_count).toBeGreaterThan(0);
    expect(manifest.channels.llm_call.rule_count).toBeGreaterThan(0);
    expect(manifest.channels.external_api.enforcement).toBe('observe');
  });

  it('evaluatePolicyGatewayDispatch holds destructive MCP pattern', () => {
    const policies = mergeExecutionToolPolicies(false, undefined);
    const rules = compileExecutionPolicyGatewayRules({
      hitlGovernanceEnabled: false,
      toolPolicies: policies,
      tokenQuota: parseAgenticTokenQuotaConfig({}),
    });
    const d = evaluatePolicyGatewayDispatch({
      channel: 'mcp_tool',
      target: 'vendor.deleteAllRecords',
      rules,
    });
    expect(d.action).toBe('hold');
    expect(d.mode).toBe('ask');
  });

  it('external API enforce mode holds destructive path', () => {
    const rules = compileExecutionPolicyGatewayRules({
      hitlGovernanceEnabled: false,
      toolPolicies: {},
      tokenQuota: parseAgenticTokenQuotaConfig({}),
    });
    const d = evaluatePolicyGatewayDispatch({
      channel: 'external_api',
      target: 'https://api.example.com/v1/users/42/delete',
      rules,
      externalApiEnforcementEnabled: true,
    });
    expect(d.action).toBe('hold');
    expect(d.mode).toBe('ask');
  });

  it('external API observe mode allows hold-worthy URL', () => {
    const rules = compileExecutionPolicyGatewayRules({
      hitlGovernanceEnabled: false,
      toolPolicies: {},
      tokenQuota: parseAgenticTokenQuotaConfig({}),
    });
    const d = evaluatePolicyGatewayDispatch({
      channel: 'external_api',
      target: 'https://api.example.com/send-email',
      rules,
      externalApiEnforcementEnabled: false,
    });
    expect(d.action).toBe('allow');
  });
});
