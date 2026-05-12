import { buildDraftPipelineSyncedWorldEvent } from './draft-pipeline-world-event';
import { createInitialWorldState, reduceWorldState } from './world-state.engine';

describe('buildDraftPipelineSyncedWorldEvent', () => {
  it('folds into trip WorldState (advances time)', () => {
    const ev = buildDraftPipelineSyncedWorldEvent({
      draftId: 'd1',
      tripId: 't1',
      contractMode: 'BOOTSTRAP',
      timestamp: 5000,
    });
    expect(ev.type).toBe('USER_INTERRUPT');
    expect(ev.timestamp).toBe(5000);
    const next = reduceWorldState(createInitialWorldState(1000), ev);
    expect(next.time).toBe(5000);
  });
});
