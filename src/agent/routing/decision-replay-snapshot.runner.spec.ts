import {
  isDecisionReplayAutoSnapshotEnabled,
  maybeSnapshot,
} from './decision-replay-snapshot.runner';
import type { DecisionReplaySnapshotHost } from './decision-replay-snapshot.host';

describe('decision-replay-snapshot.runner', () => {
  it('reads auto snapshot flag', () => {
    const host = {
      logger: { warn: jest.fn() },
      configService: { get: () => 'true' },
    } as unknown as DecisionReplaySnapshotHost;
    expect(isDecisionReplayAutoSnapshotEnabled(host)).toBe(true);
  });

  it('creates snapshot when enabled', () => {
    const createSnapshot = jest.fn();
    const host = {
      logger: { warn: jest.fn() },
      configService: { get: () => 'true' },
      decisionReplay: { createSnapshot },
    } as unknown as DecisionReplaySnapshotHost;
    maybeSnapshot(host, { request_id: 'r1' } as any, 'AUTO');
    expect(createSnapshot).toHaveBeenCalledWith({ request_id: 'r1' }, 'AUTO');
  });
});
