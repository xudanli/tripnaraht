export type {
  ExecutionSemanticsSpec,
  TemporalSemantics,
  MobilitySemantics,
  EnergySemantics,
  ExposureSemantics,
} from './execution-semantics-spec.types';

export { EXECUTION_SEMANTICS_VERSION } from './execution-semantics-spec.types';

export {
  DEFAULT_EXECUTION_SEMANTICS_V1,
  SEMANTICS_PROFILE_DEFAULT_V1,
} from './default-execution-semantics-v1';

export type {
  SemanticEvaluation,
  SemanticEvaluationResult,
  SemanticViolation,
  SemanticEvaluationDomain,
} from './semantic-evaluation.types';

export {
  evaluateExecutionSemantics,
  type EvaluateExecutionSemanticsInput,
} from './evaluate-execution-semantics';

export { reconstructPhysicsFieldIndexFromWitness } from './reconstruct-physics-from-witness';
