import {
  classifyOrchestratorFailure,
  coerceOrchestratorFailureForWallClockTimeout,
  truncateOrchestratorFailurePreview,
} from './orchestrator-failure-taxonomy.util';

describe('orchestrator-failure-taxonomy.util', () => {
  it('classifies LIVE_TOOL_TIMEOUT as TOOL/MCP', () => {
    const r = classifyOrchestratorFailure(new Error('LIVE_TOOL_TIMEOUT'), {
      orchestrator_step: 'INTAKE',
      tool_id: 'live_tool.mcp.weather',
    });
    expect(r.failure_domain).toBe('TOOL');
    expect(r.failure_code).toBe('LIVE_TOOL_TIMEOUT');
    expect(r.source_layer).toBe('MCP');
    expect(r.retryable_hint).toBe(true);
  });

  it('classifies TIMEOUT: prefix as TIMEOUT orchestrator', () => {
    const r = classifyOrchestratorFailure(new Error('TIMEOUT:CLAUDE_SM'), { orchestrator_step: 'VERIFY' });
    expect(r.failure_domain).toBe('TIMEOUT');
    expect(r.failure_code).toBe('ORCHESTRATION_TIMEOUT');
  });

  it('coerces wall-clock timeout domain', () => {
    const base = classifyOrchestratorFailure(new Error('ECONNABORTED'), { orchestrator_step: 'RESEARCH' });
    const r = coerceOrchestratorFailureForWallClockTimeout(base);
    expect(r.failure_domain).toBe('TIMEOUT');
    expect(r.failure_code).toBe('WALL_CLOCK_OR_DEADLINE');
    expect(r.source_layer).toBe('ORCHESTRATOR');
  });

  it('classifies verification fatal as KERNEL business rule', () => {
    const r = classifyOrchestratorFailure(new Error('VERIFICATION_FATAL: slope'), { orchestrator_step: 'VERIFY' });
    expect(r.failure_domain).toBe('BUSINESS_RULE');
    expect(r.failure_code).toBe('VERIFICATION_FATAL');
    expect(r.source_layer).toBe('KERNEL');
    expect(r.retryable_hint).toBe(false);
  });

  it('classifies generic MCP errors when tool_id present', () => {
    const r = classifyOrchestratorFailure(new Error('upstream exploded'), {
      tool_id: 'live_tool.mcp.hotel',
      orchestrator_step: 'INTAKE',
    });
    expect(r.failure_domain).toBe('TOOL');
    expect(r.failure_code).toBe('MCP_TOOL_ERROR');
    expect(r.source_layer).toBe('MCP');
  });

  it('classifies JSON-RPC -32603 as MCP_JSONRPC_INTERNAL', () => {
    const r = classifyOrchestratorFailure(new Error('RPC error -32603 Internal error'), {
      tool_id: 'mcp.hotel.search',
    });
    expect(r.failure_code).toBe('MCP_JSONRPC_INTERNAL');
  });

  it('classifies skill_name transient vs non-transient', () => {
    const t = classifyOrchestratorFailure(new Error('request ETIMEDOUT'), { skill_name: 'poi.search' });
    expect(t.failure_code).toBe('SKILL_TRANSIENT_ERROR');
    const s = classifyOrchestratorFailure(new Error('some logic failed'), { skill_name: 'poi.search' });
    expect(s.failure_code).toBe('SKILL_EXECUTION_ERROR');
  });

  it('passes through embedded orchestratorRobustness', () => {
    const first = classifyOrchestratorFailure(new Error('oops'), { skill_name: 'x' });
    const r = classifyOrchestratorFailure({ orchestratorRobustness: first } as any);
    expect(r.failure_code).toBe(first.failure_code);
  });

  it('truncates previews safely', () => {
    const long = 'x'.repeat(400);
    expect(truncateOrchestratorFailurePreview(long, 50).length).toBeLessThanOrEqual(51);
  });
});
