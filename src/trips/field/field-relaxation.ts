import type { ConstraintSet, FieldPoint, StabilityField } from './stability-field.types';
import { projectToFeasibleRegion } from './constraint-projection';

/** Energy threshold — equilibrium when violations sink below this (L2 slack). */
export const FIELD_RELAXATION_EPSILON = 1e-8;

const DEFAULT_MAX_STEPS = 10_000;

function violationEnergy(coords: number[], constraints: ConstraintSet): number {
  const proj = projectToFeasibleRegion(coords, constraints);
  let s = 0;
  for (let i = 0; i < coords.length; i++) {
    const d = coords[i]! - proj[i]!;
    s += d * d;
  }
  return s;
}

export function computeEnergy(field: StabilityField): number {
  return field.points.reduce((sum, p) => sum + violationEnergy(p.coords, field.constraints), 0);
}

/**
 * Laplacian-like smoothing: each point moves toward its neighbors' average + toward feasible projection blend.
 */
export function diffuse(points: FieldPoint[], constraints: ConstraintSet): FieldPoint[] {
  if (points.length === 0) {
    return [];
  }
  const dim = constraints.bounds.length;
  const blendTowardFeasible = 0.42;
  const neighborBlend = points.length > 1 ? 0.18 : 0;

  return points.map((p, idx) => {
    const projected = projectToFeasibleRegion(p.coords, constraints);
    let coords = p.coords.map((c, i) => {
      const pull = blendTowardFeasible * (projected[i]! - c);
      return c + pull;
    });

    if (neighborBlend > 0) {
      const prev = points[(idx - 1 + points.length) % points.length]!.coords;
      const next = points[(idx + 1) % points.length]!.coords;
      coords = coords.map((c, i) => {
        const avg = (prev[i]! + next[i]!) / 2;
        return c + neighborBlend * (avg - c);
      });
    }

    if (coords.length < dim) {
      coords = [...coords, ...Array(dim - coords.length).fill(0)];
    }
    return { ...p, coords: coords.slice(0, dim) };
  });
}

export interface RelaxFieldOptions {
  maxSteps?: number;
  epsilon?: number;
}

/**
 * Iterative relaxation until energy drops below epsilon or max steps — emergent equilibrium, not evaluation.
 */
export function relaxField(field: StabilityField, options?: RelaxFieldOptions): StabilityField {
  const epsilon = options?.epsilon ?? FIELD_RELAXATION_EPSILON;
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;

  let current: StabilityField = {
    ...field,
    equilibriumState: false,
    energy: computeEnergy(field),
  };

  let steps = 0;
  while (!current.equilibriumState && steps < maxSteps) {
    const nextPoints = diffuse(current.points, current.constraints);
    current = {
      ...current,
      points: nextPoints,
      energy: 0,
    };
    current.energy = computeEnergy(current);

    if (current.energy < epsilon) {
      current.equilibriumState = true;
      break;
    }
    steps++;
  }

  return current;
}
