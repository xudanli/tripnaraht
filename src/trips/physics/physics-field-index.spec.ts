import { buildUnifiedPhysicsField } from './build-unified-physics-field';
import { buildPhysicsFieldIndex } from './build-physics-field-index';
import type { UnifiedPhysicsField } from './unified-physics-field.types';

describe('buildPhysicsFieldIndex (P-Next 1.1)', () => {
  it('indexes by leg, date, and derived bucket', () => {
    const fields: UnifiedPhysicsField[] = [
      {
        legId: 'a',
        date: '2026-06-01',
        stateVector: {
          mobility: 0.8,
          exposure: 0.2,
          energy: 0.9,
          temporalPressure: 0.1,
        },
        constraints: { blocked: false, severity: 'LOW' },
        derived: 'STABLE',
      },
      {
        legId: 'b',
        date: '2026-06-01',
        stateVector: {
          mobility: 0.5,
          exposure: 0.6,
          energy: 0.4,
          temporalPressure: 0.5,
        },
        constraints: { blocked: false, severity: 'MEDIUM' },
        derived: 'DEGRADED',
      },
    ];

    const idx = buildPhysicsFieldIndex(fields);

    expect(idx.byLegId.a?.legId).toBe('a');
    expect(idx.byDate['2026-06-01']).toHaveLength(2);
    expect(idx.byState.STABLE).toContain('a');
    expect(idx.byState.DEGRADED).toContain('b');
    expect(idx.byState.IMPASSABLE).toHaveLength(0);
  });

  it('compose with buildUnifiedPhysicsField produces consistent keys', () => {
    const rows = buildUnifiedPhysicsField({
      executionOverlayFrames: [],
      legDateByLegId: {},
    });
    const idx = buildPhysicsFieldIndex(rows);
    expect(Object.keys(idx.byLegId)).toHaveLength(0);
  });
});
