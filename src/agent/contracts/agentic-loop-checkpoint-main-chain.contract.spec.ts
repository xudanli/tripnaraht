import { buildAgenticLoopCheckpoint, validateAgenticResumeCheckpoint } from '../runtime/agentic-loop-checkpoint.util';

describe('agentic loop checkpoint main chain contract', () => {
  it('checkpoint supports resume after governance hold pause', () => {
    const cp = buildAgenticLoopCheckpoint({
      step: 1,
      taskMessage: 'weather in Tokyo',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'weather in Tokyo' },
        { role: 'assistant', tool_calls: [{ id: 'c1' }] },
        {
          role: 'tool',
          tool_call_id: 'c1',
          content: JSON.stringify({ success: false, error: 'NEED_USER_APPROVAL' }),
        },
      ],
      traceSteps: [{ step: 1, latency_ms: 50 }],
      metrics: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    expect(validateAgenticResumeCheckpoint(cp, 'weather in Tokyo').ok).toBe(true);
    expect(cp.schemaId).toBe('tripnara.agentic_loop_checkpoint@v1');
  });
});
