import {
  buildToolInvocationMetadataPatch,
  buildToolInvocationSummary,
} from './trip-run-tool-invocation.util';

describe('trip-run-tool-invocation.util', () => {
  it('classifies skill / mcp / live_tool from audits', () => {
    const summary = buildToolInvocationSummary({
      observability: {
        live_sensor_audit: [
          { tool_id: 'skill.route.suggest', ok: true, latency_ms: 12 },
          { tool_id: 'live_tool.mcp.hotel', ok: false, latency_ms: 40, error: 'timeout' },
          { tool_id: 'live_tool.weather', ok: true, latency_ms: 8 },
        ],
        tool_calls: 3,
      },
    });

    expect(summary).toMatchObject({
      toolCallsCount: 3,
      skillNames: ['skill.route.suggest'],
      mcpNames: ['live_tool.mcp.hotel'],
    });
    expect(summary?.skills).toHaveLength(1);
    expect(summary?.mcp).toHaveLength(1);
    expect(summary?.liveTools).toHaveLength(1);
  });

  it('reads live_hotel_audit and steps_executed', () => {
    const summary = buildToolInvocationSummary({
      live_hotel_audit: { tool_id: 'live_tool.mcp.hotel', ok: true, latency_ms: 5 },
      steps_executed: ['PLAN', 'EXECUTE'],
    });
    expect(summary?.mcpNames).toEqual(['live_tool.mcp.hotel']);
    expect(summary?.stepsExecuted).toEqual(['PLAN', 'EXECUTE']);
  });

  it('builds metadata patch for TripRun', () => {
    const patch = buildToolInvocationMetadataPatch({
      observability: {
        skill_audit: [{ tool_id: 'skill.foo', ok: true }],
      },
    });
    expect(patch.skills_invoked).toEqual(['skill.foo']);
    expect(patch.tool_invocation_summary).toBeTruthy();
  });

  it('returns empty patch when nothing to report', () => {
    expect(buildToolInvocationMetadataPatch({})).toEqual({});
    expect(buildToolInvocationSummary(null)).toBeNull();
  });
});
