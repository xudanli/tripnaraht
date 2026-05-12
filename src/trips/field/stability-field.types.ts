/**
 * P29 — Field self-stabilization: no evaluator role; only relaxation toward constraint equilibrium.
 */

export interface FieldPoint {
  id: string;
  /** State coordinates in constraint manifold embedding (dimension = bounds.length). */
  coords: number[];
}

/** Axis-aligned feasible region — projection replaces discrete decisions. */
export interface ConstraintSet {
  bounds: Array<{ min: number; max: number }>;
}

export interface StabilityField {
  points: FieldPoint[];
  energy: number;
  constraints: ConstraintSet;
  equilibriumState: boolean;
}
