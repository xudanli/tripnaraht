/**
 * Control P2+：Execution Policy Gateway 已挂载到 route_and_run 主链（tick hydrate + observability）。
 */
import { mergeExecutionToolPolicies } from '../runtime/agent-execution-policy-gateway.util';
import {
  hydrateRouteAndRunExecutionPolicyInPlace,
  readExecutionPolicyGatewayObservability,
} from '../runtime/execution-policy-gateway-context.util';

describe('execution policy gateway main chain contract', () => {
  it('hydrate produces observability slice for assembler echo', () => {
    const request = { request_id: 'r1', user_id: 'u1', message: 'hi' };
    hydrateRouteAndRunExecutionPolicyInPlace(request as never, undefined, false);
    const obs = readExecutionPolicyGatewayObservability(request as never);
    expect(obs?.schemaId).toBe('tripnara.execution_policy_gateway@v1');
    expect(obs?.policy_manifest_v1?.rule_count).toBeGreaterThan(0);
    expect(obs?.tool_policy_count).toBe(Object.keys(mergeExecutionToolPolicies(false)).length);
  });
});
