/**
 * P25 — Post-system equilibrium: constraint-only dynamics without a controller.
 */

export type {
  AgentState,
  ConstraintField,
  EmergencePattern,
  EnvironmentBounds,
  EnvironmentState,
  PostSystemField,
  StableFlow,
} from './post-system-field.types';

export {
  applyLocalConstraints,
  detectEmergence,
  detectStableFlows,
  relaxTowardsConstraints,
  step,
} from './constraint-dynamics';

export { noDecision } from './no-decision';
