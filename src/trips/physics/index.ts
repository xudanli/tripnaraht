/**
 * P-Next 1 — Unified physics field compiler (overlay → single leg-wise physics state).
 */

export type {
  PhysicsUncertaintyEnvelope,
  UnifiedPhysicsDerivedState,
  UnifiedPhysicsField,
  UnifiedPhysicsSeverity,
} from './unified-physics-field.types';

export type {
  GaussianScalarProjection,
  ProbabilisticPhysicsProjection,
} from './probabilistic-field-projection.types';

export type {
  PhysicsFieldBucketsByDerivedState,
  PhysicsFieldIndex,
} from './unified-physics-field-index.types';

export { buildPhysicsFieldIndex } from './build-physics-field-index';

export {
  PHYSICS_FIELD_NORMALIZATION_VERSION,
  normalizeUnifiedPhysicsField,
} from './physics-field-normalization';

export {
  assertOverlayFieldConsistency,
  checkOverlayFieldConsistency,
  type OverlayFieldConsistencyIssue,
  type OverlayFieldConsistencyIssueKind,
} from './overlay-field-consistency';

export {
  buildLegDateIndexFromPlan,
  buildUnifiedPhysicsField,
  buildUnifiedPhysicsFieldByLegId,
  computeSeverity,
  deriveUnifiedState,
  type BuildUnifiedPhysicsFieldInput,
} from './build-unified-physics-field';
