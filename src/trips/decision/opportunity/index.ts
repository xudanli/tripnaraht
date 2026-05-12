export type {
  OpportunityTradeoffInput,
  OpportunityTradeoffResult,
} from './opportunity-tradeoff.types';
export {
  computeOpportunityTradeoff,
  normalizeTradeoffScore01,
} from './compute-opportunity-tradeoff';
export type {
  AuroraMigrationStance,
} from './opportunity-threshold.policy';
export {
  migrationNormalizedThreshold,
  migrationTradeoffThreshold,
  migrationStanceFromObservationIntent,
  migrationStanceFromAuroraIntentWeight,
} from './opportunity-threshold.policy';
export type { OpportunityMigrationEvaluation } from './opportunity-migration.types';
export {
  evaluateOpportunityMigration,
  evaluateOpportunityMigrationsForPlan,
} from './opportunity-migration-evaluator';
export type {
  EvaluateOpportunityMigrationInput,
  EvaluateOpportunityMigrationsOptions,
} from './opportunity-migration-evaluator';
