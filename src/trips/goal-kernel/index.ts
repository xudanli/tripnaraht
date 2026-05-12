export type {
  ExecutionGoal,
  ExecutionGoalSource,
  ExecutionGoalType,
} from './execution-goal.types';

export type { GoalCompilationContext } from './goal-to-dag.compiler';
export { compileGoalToDAG } from './goal-to-dag.compiler';

export type {
  ConstraintPressureMetrics,
  GoalGenerationContext,
  GoalSignalSnapshot,
} from './generate-goals-from-system';

export {
  deriveFromConstraintStress,
  deriveFromMemory,
  deriveFromSignals,
  generateExecutionGoals,
  rankGoals,
} from './generate-goals-from-system';
