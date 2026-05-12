import type { WorldDiffLogEntry } from './world-diff-log.types';
import { counterfactualBranch } from './world-counterfactual.engine';

function road(id: string, roadId: string, after: string) {
  return {
    id,
    domain: 'ROAD' as const,
    type: 'STATE_CHANGE' as const,
    entityId: roadId,
    stateBefore: 'OPEN',
    stateAfter: after,
    severity: 'HIGH' as const,
    temporalScope: { start: '2026-01-01', end: '2026-01-01' },
    impactedSlots: [] as const,
    propagationHint: 'LOCAL' as const,
    source: 'COMMAND' as const,
  };
}

describe('counterfactualBranch', () => {
  it('branch B replaces last transition with overrideDiff', () => {
    const baseLog: WorldDiffLogEntry[] = [
      {
        id: '1',
        timestamp: 1,
        worldVersion: 1,
        diff: road('d1', 'F208', 'CLOSED'),
        resultingStateHash: 'x',
      },
    ];

    const out = counterfactualBranch({
      baseLog,
      overrideDiff: road('alt', 'F208', 'OPEN'),
    });

    expect(out.branchA.roads.get('F208')?.state).toBe('CLOSED');
    expect(out.branchB.roads.get('F208')?.state).toBe('OPEN');
    expect(out.divergencePoints).toHaveLength(2);
  });
});
