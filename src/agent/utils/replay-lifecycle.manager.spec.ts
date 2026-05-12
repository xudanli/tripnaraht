import { replayLifecycleManager } from './replay-lifecycle.manager';
import { AGGREGATE_COGNITION_REPLAY_DOMAIN } from './runtime-execution-profile.validation';

describe('ReplayLifecycleManager', () => {
  it('invalidateReplay returns NONE when no actionable anomalies', () => {
    expect(replayLifecycleManager.invalidateReplay({ anomalies: [] })).toEqual({
      scope: 'NONE',
    });
  });

  it('invalidateReplay maps INVALIDATE_REPLAY with aggregate domain to FULL_RESPONSE', () => {
    const r = replayLifecycleManager.invalidateReplay({
      anomalies: [
        {
          code: 'INV.REPLAY_WORLD_STATE_DRIFT',
          severity: 'ERROR',
          category: 'SEMANTIC_DRIFT',
          message: 'drift',
          suggestedAction: 'INVALIDATE_REPLAY',
          affectedCognitiveDomains: [AGGREGATE_COGNITION_REPLAY_DOMAIN],
        },
      ],
    });
    expect(r.scope).toBe('FULL_RESPONSE');
    expect(r.reasonCodes).toContain('INV.REPLAY_WORLD_STATE_DRIFT');
    expect(r.domains).toContain(AGGREGATE_COGNITION_REPLAY_DOMAIN);
  });

  it('invalidateReplay maps dimension-scoped drift to PARTIAL when domains present', () => {
    const r = replayLifecycleManager.invalidateReplay({
      anomalies: [
        {
          code: 'INV.REPLAY_WORLD_STATE_DRIFT',
          severity: 'ERROR',
          category: 'SEMANTIC_DRIFT',
          message: 'drift',
          suggestedAction: 'INVALIDATE_REPLAY',
          affectedCognitiveDomains: ['INVENTORY'],
        },
      ],
    });
    expect(r.scope).toBe('PARTIAL_COGNITIVE_BRANCH');
    expect(r.domains).toEqual(['INVENTORY']);
  });

  it('shouldReplay reflects cache hit gate', () => {
    expect(replayLifecycleManager.shouldReplay({ cacheHit: true }).allow).toBe(true);
    expect(replayLifecycleManager.shouldReplay({ cacheHit: false }).allow).toBe(false);
  });
});
