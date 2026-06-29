import { buildAgenticLoopCheckpoint } from './agentic-loop-checkpoint.util';
import {
  parseAgenticCheckpointCatalogV1,
  resolveAgenticResumeCheckpointFromRequestOptions,
  resolveAgenticTaskRollback,
} from './agentic-task-rollback.util';

describe('agentic-task-rollback.util', () => {
  const catalog = [1, 2, 3].map((step) =>
    buildAgenticLoopCheckpoint({
      step,
      taskMessage: 'plan trip',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'plan trip' },
        { role: 'assistant', content: `step ${step}` },
      ],
      traceSteps: [{ step, latency_ms: step * 10 }],
      metrics: { prompt_tokens: step * 10, completion_tokens: 5, total_tokens: step * 10 + 5 },
    }),
  );

  it('resolveAgenticTaskRollback picks checkpoint by step', () => {
    const r = resolveAgenticTaskRollback({
      taskMessage: 'plan trip',
      catalog,
      targetStep: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rolled_back_to_step).toBe(2);
    expect(r.rolled_back_from_step).toBe(3);
    expect(r.checkpoint.step).toBe(2);
  });

  it('resolveAgenticTaskRollback picks by checkpoint_id', () => {
    const r = resolveAgenticTaskRollback({
      taskMessage: 'plan trip',
      catalog,
      targetCheckpointId: catalog[0].checkpoint_id,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.selection).toBe('checkpoint_id');
    expect(r.rolled_back_to_step).toBe(1);
  });

  it('resolveAgenticResumeCheckpointFromRequestOptions prefers rollback target over direct resume', () => {
    const resolved = resolveAgenticResumeCheckpointFromRequestOptions(
      {
        agentic_checkpoint_catalog_v1: catalog,
        agentic_rollback_to_step_v1: 1,
        agentic_resume_checkpoint_v1: catalog[2] as unknown as Record<string, unknown>,
      },
      'plan trip',
    );
    expect('checkpoint' in resolved && resolved.checkpoint?.step).toBe(1);
    if (!('rollbackObs' in resolved)) return;
    expect(resolved.rollbackObs.applied).toBe(true);
    expect(resolved.rollbackObs.selection).toBe('step');
  });

  it('parseAgenticCheckpointCatalogV1 filters invalid entries', () => {
    const parsed = parseAgenticCheckpointCatalogV1([catalog[0], { bad: true }, catalog[1]]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].step).toBe(1);
  });
});
