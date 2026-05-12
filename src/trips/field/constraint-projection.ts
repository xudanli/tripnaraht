import type { ConstraintSet, FieldPoint } from './stability-field.types';

export function projectToFeasibleRegion(coords: number[], constraints: ConstraintSet): number[] {
  const out: number[] = [];
  const n = Math.min(coords.length, constraints.bounds.length);
  for (let i = 0; i < n; i++) {
    const { min, max } = constraints.bounds[i]!;
    const x = coords[i]!;
    out.push(Math.min(max, Math.max(min, x)));
  }
  return out;
}

/** Constraint application as geometric projection — no repair/plan semantics. */
export function applyConstraints(point: FieldPoint, constraints: ConstraintSet): FieldPoint {
  return {
    ...point,
    coords: projectToFeasibleRegion(point.coords, constraints),
  };
}
