/**
 * Control P3：Subagent 权限沙箱主链契约。
 */
import {
  applySubagentSandboxToMcpAllowlist,
  hydrateSubagentPermissionSandboxInPlace,
  readSubagentPermissionSandboxObservability,
} from '../runtime/subagent-permission-sandbox-context.util';

describe('subagent permission sandbox main chain contract', () => {
  it('hydrate strips option allowlist when sandbox enabled', () => {
    const request = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'hi',
      options: { agentic_runtime_tool_allowlist: ['exa.deepSearch'] },
    };
    hydrateSubagentPermissionSandboxInPlace(request as never, 'Planner', {
      HARNESS_SUBAGENT_SANDBOX: '1',
    });
    const obs = readSubagentPermissionSandboxObservability(request as never);
    expect(obs?.schemaId).toBe('tripnara.subagent_permission_sandbox@v1');
    expect(obs?.enabled).toBe(true);
    expect(obs?.option_escalation_strips).toBe(1);
    expect(request.options?.agentic_runtime_tool_allowlist).toBeUndefined();
  });

  it('applySubagentSandboxToMcpAllowlist narrows tools for Narrator', () => {
    const request = { request_id: 'r2', message: 'x' };
    hydrateSubagentPermissionSandboxInPlace(request as never, 'Narrator', {
      HARNESS_SUBAGENT_SANDBOX: '1',
    });
    const out = applySubagentSandboxToMcpAllowlist(
      request as never,
      ['exa.webSearch', 'weather.getCurrentWeather'],
      'Narrator',
    );
    expect(out).toBeUndefined();
    expect(readSubagentPermissionSandboxObservability(request as never)?.mcp_tools_after_cap).toBe(0);
  });
});
