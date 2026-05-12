import { WorldConstraintStore } from './world-constraint.store';
import { applyRoadFactMutation } from './world-mutation.gateway';

describe('applyRoadFactMutation', () => {
  it('routes GRAPH_SSOT_DIFF through applyRoadDiff semantics', () => {
    const store = new WorldConstraintStore();
    const out = applyRoadFactMutation(store, {
      channel: 'GRAPH_SSOT_DIFF',
      diff: {
        roadId: 'F208',
        state: 'CLOSED',
        severity: 85,
        impactedEntities: { poiIds: [], blockedRoadIds: ['F208'] },
        requiresReplan: true,
      },
      options: { atMs: 1 },
    });
    expect(out.channel).toBe('GRAPH_SSOT_DIFF');
    expect(store.roads.get('F208')?.state).toBe('CLOSED');
    expect(out.constraintDiff.domains).toContain('ROAD');
  });

  it('routes USER_COMMAND BLOCK_ROAD through pipeline', () => {
    const store = new WorldConstraintStore();
    applyRoadFactMutation(
      store,
      {
        channel: 'USER_COMMAND',
        cmd: {
          type: 'BLOCK_ROAD',
          roadId: 'X',
        },
      },
      { atMs: 2 },
    );
    expect(store.roads.get('X')?.state).toBe('CLOSED');
  });
});
