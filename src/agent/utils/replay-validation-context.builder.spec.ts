import { buildReplayValidationContextForDedupRequest } from './replay-validation-context.builder';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('buildReplayValidationContextForDedupRequest', () => {
  it('returns undefined without cached provenance', () => {
    expect(buildReplayValidationContextForDedupRequest({ request: {} as RouteAndRunRequestDto })).toBeUndefined();
  });

  it('maps cached vs current freshness for validation', () => {
    const ctx = buildReplayValidationContextForDedupRequest({
      cachedProvenance: {
        freshness: { weatherVersion: 'w1' },
        aggregateWorldStateVersion: 'agg-v1',
      },
      request: {
        options: {
          replay_current_freshness: { weatherVersion: 'w2' },
          replay_current_world_state_version: 'agg-v2',
        },
      } as RouteAndRunRequestDto,
    });
    expect(ctx?.replay_cached_freshness?.weatherVersion).toBe('w1');
    expect(ctx?.replay_current_freshness?.weatherVersion).toBe('w2');
    expect(ctx?.replay_cached_world_state_version).toBe('agg-v1');
    expect(ctx?.replay_current_world_state_version).toBe('agg-v2');
  });
});
