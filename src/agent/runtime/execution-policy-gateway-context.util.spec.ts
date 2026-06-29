import {
  buildExecutionPolicyGatewayObservability,
  hydrateRouteAndRunExecutionPolicyInPlace,
  readExecutionPolicyGatewayObservability,
  readExecutionPolicyGatewayApproved,
  readExecutionPolicyGatewayPolicies,
} from './execution-policy-gateway-context.util';
import { mergeExecutionToolPolicies } from './agent-execution-policy-gateway.util';

describe('execution-policy-gateway-context.util', () => {
  it('hydrates policies and observability on request carrier', () => {
    const request = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'book hotel',
      options: {
        agentic_approved_tool_invocations: [{ toolCallId: 'c1', mcpToolName: 'exa.deepSearch' }],
      },
    };
    const obs = hydrateRouteAndRunExecutionPolicyInPlace(
      request as never,
      {
        activeTripState: {
          constraints: {
            tool_policies: { 'custom.tool': { mode: 'deny', reason: 'test' } },
          },
        },
      } as never,
      true,
    );
    expect(obs.schemaId).toBe('tripnara.execution_policy_gateway@v1');
    expect(obs.hitl_governance_enabled).toBe(true);
    expect(obs.approved_invocation_count).toBe(1);
    expect(obs.policy_manifest_v1?.schemaId).toBe('tripnara.execution_policy_manifest@v1');
    expect(obs.policy_manifest_v1?.channels.mcp_tool.rule_count).toBeGreaterThan(0);
    expect(readExecutionPolicyGatewayPolicies(request as never)?.['custom.tool']?.mode).toBe('deny');
    expect(readExecutionPolicyGatewayApproved(request as never)).toHaveLength(1);
    expect(readExecutionPolicyGatewayObservability(request as never)).toBe(obs);
  });

  it('buildExecutionPolicyGatewayObservability lists restrictive tools', () => {
    const policies = mergeExecutionToolPolicies(false, undefined);
    const obs = buildExecutionPolicyGatewayObservability({
      hitlGovernanceEnabled: false,
      policies,
      approvedInvocations: [],
    });
    expect(obs.restrictive_tool_names.length).toBeGreaterThan(0);
    expect(obs.tool_policy_count).toBeGreaterThan(0);
  });
});
