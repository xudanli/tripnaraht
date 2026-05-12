/**
 * P29 — Field self-stabilization: constraint relaxation equilibrium without execution/decision verbs.
 */

export type { ConstraintSet, FieldPoint, StabilityField } from './stability-field.types';

export { applyConstraints, projectToFeasibleRegion } from './constraint-projection';

export {
  FIELD_RELAXATION_EPSILON,
  computeEnergy,
  diffuse,
  relaxField,
  type RelaxFieldOptions,
} from './field-relaxation';

export { noEvaluation } from './no-evaluation';
