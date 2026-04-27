import { extractWallHitDistanceMsFromDecisionLog, mergeWallHitDistanceMs, resolveWallHitDistanceMsForConstraints } from './wall-hit-distance.util';

describe('wall-hit-distance.util', () => {
  it('extracts wall_hit_distance_ms from decision_log metadata', () => {
    const log = [
      { metadata: { system_action: 'OTHER' } },
      { metadata: { wall_hit_distance_ms: 2_700_000 } },
    ];
    expect(extractWallHitDistanceMsFromDecisionLog(log as any)).toBe(2_700_000);
  });

  it('prefers event metadata over audit fallback', () => {
    expect(mergeWallHitDistanceMs({ wall_hit_distance_ms: 9_000_000 } as any, 120_000)).toBe(9_000_000);
    expect(mergeWallHitDistanceMs({} as any, 120_000)).toBe(120_000);
  });

  it('resolves from orchestrator state metadata then log', () => {
    const ms = resolveWallHitDistanceMsForConstraints({
      orchestratorState: { metadata: { wall_hit_distance_ms: 5_000_000 } },
      decisionLog: [{ metadata: { wall_hit_distance_ms: 1_000_000 } }],
    });
    expect(ms).toBe(5_000_000);
  });
});
