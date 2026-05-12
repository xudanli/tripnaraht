import type { AgentLoopTraceStep } from './mcp-agent-executor.service';

/** exercise trace folding logic inline (matches buildMetrics behavior) */
function toolCallCount(steps: AgentLoopTraceStep[]): number {
  return steps.reduce((n, s) => n + (s.tool_calls?.length ?? 0), 0);
}

describe('Agentic loop metrics (tool_call_count)', () => {
  it('sums tool_calls across steps', () => {
    const steps: AgentLoopTraceStep[] = [
      {
        step: 1,
        latency_ms: 10,
        tool_calls: [
          { id: 'a', name: 'weather_getCurrentWeather', args: { location: 'Osaka' } },
        ],
      },
      {
        step: 2,
        latency_ms: 5,
        tool_calls: [
          { id: 'b', name: 'exa_webSearch', args: { query: 'osaka' } },
          { id: 'c', name: 'exa_webSearch', args: { query: 'kyoto' } },
        ],
      },
    ];
    expect(toolCallCount(steps)).toBe(3);
  });

  it('counts zero when final step has no tools', () => {
    const steps: AgentLoopTraceStep[] = [{ step: 1, latency_ms: 3 }];
    expect(toolCallCount(steps)).toBe(0);
  });
});
