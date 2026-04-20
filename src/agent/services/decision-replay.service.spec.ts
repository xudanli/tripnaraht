import { DecisionReplayService } from './decision-replay.service';

describe('DecisionReplayService', () => {
  it('supports deterministic snapshot ids via setSnapshotIdFactory', () => {
    const svc = new DecisionReplayService(undefined as any);
    let i = 0;
    svc.setSnapshotIdFactory(() => `snap-fixed-${++i}`);

    const state: any = {
      request_id: 'trip-1',
      current_step: 'INTAKE',
    };

    const a = svc.createSnapshot(state, 'AUTO');
    const b = svc.createSnapshot(state, 'AUTO');

    expect(a.snapshot_id).toBe('snap-fixed-1');
    expect(b.snapshot_id).toBe('snap-fixed-2');
  });
});

