import { buildAgenticLoopCheckpoint } from '../runtime/agentic-loop-checkpoint.util';
import { resolveAgenticResumeCheckpointFromRequestOptions } from '../runtime/agentic-task-rollback.util';

describe('agentic task rollback main chain contract', () => {
  it('rollback_to_step resolves checkpoint for resume', () => {
    const cp2 = buildAgenticLoopCheckpoint({
      step: 2,
      taskMessage: 'book hotel',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'book hotel' },
        { role: 'assistant', content: 'step2' },
      ],
      traceSteps: [{ step: 2, latency_ms: 20 }],
      metrics: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
    });
    const cp3 = buildAgenticLoopCheckpoint({
      step: 3,
      taskMessage: 'book hotel',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'book hotel' },
        { role: 'assistant', content: 'step3' },
      ],
      traceSteps: [{ step: 3, latency_ms: 30 }],
      metrics: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 },
    });

    const resolved = resolveAgenticResumeCheckpointFromRequestOptions(
      {
        agentic_checkpoint_catalog_v1: [cp2, cp3],
        agentic_rollback_to_step_v1: 2,
      },
      'book hotel',
    );
    expect('checkpoint' in resolved && resolved.checkpoint?.step).toBe(2);
    expect(resolved.rollbackObs.applied).toBe(true);
    expect(resolved.rollbackObs.rolled_back_from_step).toBe(3);
  });
});
