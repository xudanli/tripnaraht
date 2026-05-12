import { routeDecisionContext } from './neptune-decision-router';
import type { PhysicsFieldIndex } from '../../physics/unified-physics-field-index.types';

describe('neptune decision router (P-Next 2)', () => {
  it('prefers PHYSICS_FIRST when index has legs', () => {
    const idx: PhysicsFieldIndex = {
      byLegId: { a: {} as any },
      byDate: {},
      byState: { STABLE: [], DEGRADED: [], UNSTABLE: [], IMPASSABLE: [] },
    };
    expect(
      routeDecisionContext({
        physicsFieldIndex: idx,
        executionOverlayFrames: [{ legId: 'x' } as any],
        executionTruthDAG: { nodes: [{ id: 'n' }], edges: [] } as any,
      }),
    ).toBe('PHYSICS_FIRST');
  });

  it('uses OVERLAY_LEGACY when no physics index', () => {
    expect(
      routeDecisionContext({
        physicsFieldIndex: undefined,
        executionOverlayFrames: [{ legId: 'x' } as any],
        executionTruthDAG: null,
      }),
    ).toBe('OVERLAY_LEGACY');
  });
});
