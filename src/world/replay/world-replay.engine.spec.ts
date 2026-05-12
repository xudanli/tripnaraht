import { processWorldDiff } from '../diff';
import { hashWorldConstraintStore } from './world-state-hash';
import {
  buildWorldDiffLogEntry,
  createInitialWorldStore,
  reexecuteFrom,
  replayWorld,
} from './world-replay.engine';
import type { WorldDiffLogEntry } from './world-diff-log.types';

function roadDiff(
  id: string,
  roadId: string,
  after: string,
): import('../diff/world-diff.contract').WorldDiff {
  return {
    id,
    domain: 'ROAD',
    type: 'STATE_CHANGE',
    entityId: roadId,
    stateBefore: 'OPEN',
    stateAfter: after,
    severity: 'HIGH',
    temporalScope: { start: '2026-01-01', end: '2026-01-01' },
    impactedSlots: [],
    propagationHint: 'LOCAL',
    source: 'COMMAND',
  };
}

describe('world replay engine', () => {
  it('replayWorld re-executes diffs deterministically', () => {
    const store = createInitialWorldStore();
    processWorldDiff(roadDiff('d1', 'F208', 'CLOSED'), store);
    const e1 = buildWorldDiffLogEntry(store, roadDiff('d1', 'F208', 'CLOSED'), {
      id: 'log-1',
      timestamp: 100,
    });

    processWorldDiff(roadDiff('d2', 'X', 'RESTRICTED'), store);
    const e2 = buildWorldDiffLogEntry(store, roadDiff('d2', 'X', 'RESTRICTED'), {
      id: 'log-2',
      timestamp: 200,
    });

    const logs: WorldDiffLogEntry[] = [e1, e2];
    const replayed = replayWorld(logs);
    expect(replayed.roads.get('F208')?.state).toBe('CLOSED');
    expect(replayed.roads.get('X')?.state).toBe('RESTRICTED');
    expect(hashWorldConstraintStore(replayed)).toBe(e2.resultingStateHash);
  });

  it('reexecuteFrom skips earlier entries', () => {
    const logs: WorldDiffLogEntry[] = [
      {
        id: 'a',
        timestamp: 1,
        worldVersion: 1,
        diff: roadDiff('d1', 'A', 'CLOSED'),
        resultingStateHash: '',
      },
      {
        id: 'b',
        timestamp: 2,
        worldVersion: 2,
        diff: roadDiff('d2', 'B', 'CLOSED'),
        resultingStateHash: '',
      },
    ];
    const partial = reexecuteFrom(1, logs);
    expect(partial.roads.get('A')).toBeUndefined();
    expect(partial.roads.get('B')?.state).toBe('CLOSED');
  });

  it('reexecuteFrom at length yields initial empty store shape', () => {
    const logs: WorldDiffLogEntry[] = [
      {
        id: 'a',
        timestamp: 1,
        worldVersion: 1,
        diff: roadDiff('d1', 'Z', 'CLOSED'),
        resultingStateHash: '',
      },
    ];
    const empty = reexecuteFrom(1, logs);
    expect(empty.version).toBe(0);
    expect(empty.roads.size).toBe(0);
  });
});
