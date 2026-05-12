import {
  FIELD_RELAXATION_EPSILON,
  computeEnergy,
  noEvaluation,
  relaxField,
} from './index';
import type { StabilityField } from './stability-field.types';

describe('field self-stabilization (P29)', () => {
  it('noEvaluation is undefined', () => {
    expect(noEvaluation()).toBeUndefined();
  });

  it('relaxField converges violated points into equilibrium', () => {
    const field: StabilityField = {
      points: [
        { id: 'p0', coords: [-10, 50] },
        { id: 'p1', coords: [100, -5] },
      ],
      energy: Number.POSITIVE_INFINITY,
      constraints: {
        bounds: [
          { min: 0, max: 1 },
          { min: 0, max: 1 },
        ],
      },
      equilibriumState: false,
    };

    const settled = relaxField(field, { maxSteps: 5000 });
    expect(settled.equilibriumState).toBe(true);
    expect(settled.energy).toBeLessThan(FIELD_RELAXATION_EPSILON);
    expect(settled.points.every(p => computeEnergy({ ...settled, points: [p] }) < 1e-6)).toBe(true);
  });

  it('already feasible field is equilibrium', () => {
    const field: StabilityField = {
      points: [{ id: 'x', coords: [0.5, 0.5] }],
      energy: 0,
      constraints: {
        bounds: [
          { min: 0, max: 1 },
          { min: 0, max: 1 },
        ],
      },
      equilibriumState: false,
    };
    const settled = relaxField(field);
    expect(settled.equilibriumState).toBe(true);
    expect(settled.energy).toBe(0);
  });
});
