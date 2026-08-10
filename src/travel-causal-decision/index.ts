export {
  TEMPORAL_IMPACT_SCHEMA,
  type TemporalImpact,
} from './types/temporal-impact.types';

export {
  DECISION_OUTCOME_SCHEMA,
  type OutcomeReconciliationStatus,
  type SimulatedOutcomeSnapshot,
  type ActualOutcomeSnapshot,
  type DecisionOutcome,
} from './types/decision-outcome.types';

export {
  TRAVEL_CAUSAL_RULE_SCHEMA,
  type CausalRuleBasis,
  type CausalRuleReviewStatus,
  type CausalCondition,
  type CausalRuleEffect,
  type TravelCausalRule,
} from './types/travel-causal-rule.types';

export {
  TRAVEL_CAUSAL_DECISION_SCHEMA,
  type TravelCausalNodeType,
  type TravelCausalNode,
  type TravelCausalEffectLink,
  type ProposedChange,
  type Tradeoff,
  type ValidationCheckStatus,
  type ValidationCheck,
  type ValidationResult,
  type TravelCausalInterventionOption,
  type TravelCausalRecommendation,
  type TravelCausalDecision,
} from './types/travel-causal-decision.types';

export {
  STANDARD_CAUSAL_RULES,
  listTravelCausalRules,
  listAllTravelCausalRules,
  getTravelCausalRule,
  composeRuleVersionStamp,
} from './registry/travel-causal-rule.registry';

export {
  mapPackRuleToTravelCausalRule,
  mapPackRulesToTravelCausalRules,
} from './registry/map-pack-rule-to-travel-causal-rule';

export {
  loadPackTravelCausalRules,
  clearPackTravelCausalRuleCache,
} from './registry/load-pack-causal-rules';

export {
  actualOutcomeFromObservedOutcomes,
  actualOutcomeFromGpsFix,
  actualOutcomeFromCheckIn,
  actualOutcomeFromLightSignals,
  isHighTrustObservationSource,
  type GpsArrivalFix,
  type CheckInObservation,
} from './observations/ingest-execution-observation.util';

export {
  applyObservationToCausalTrace,
  type ApplyObservationToCausalTraceInput,
} from './observations/apply-observation-to-causal-trace.util';

export type {
  WindPilotCaseArchetype,
  IcelandWindPilotEvidence,
  WindPilotFactSnapshot,
  WindPilotPassCriteria,
} from './pilot/iceland-wind/wind-pilot.types';
export { ICELAND_WIND_PILOT_EVIDENCE_SCHEMA } from './pilot/iceland-wind/wind-pilot.types';
export { buildWindPilotEvidence } from './pilot/iceland-wind/build-wind-pilot-evidence';
export {
  buildIcelandWindPilotCaseRegistry,
  countByArchetype,
} from './pilot/iceland-wind/wind-pilot-case.registry';
export {
  evaluateWindPilotCase,
  evaluateWindPilotSuite,
  DEFAULT_WIND_PILOT_PASS_CRITERIA,
} from './pilot/iceland-wind/evaluate-wind-pilot.util';
export { buildIcelandWindPilotShowcaseCase } from './pilot/iceland-wind/build-wind-pilot-showcase';
export {
  buildWindPilotMetricsReport,
  renderWindPilotReportMarkdown,
  ICELAND_WIND_PILOT_METRICS_SCHEMA,
  type WindPilotMetricsReport,
  type WindPilotCaseMetricsRow,
} from './pilot/iceland-wind/build-wind-pilot-report';

export {
  STANDARD_CAUSAL_CASE_IDS,
  type StandardCausalCaseId,
  buildStrongWindAppointmentFixture,
  buildRoadClosureOvernightFixture,
  buildMemberFatigueFixture,
  listStandardCausalDecisionFixtures,
} from './fixtures';

export {
  assertTravelCausalDecisionComplete,
  CAUSAL_CASE_LOOP_STEPS,
  type CausalCaseLoopStep,
  type CausalDecisionHarnessReport,
} from './harness/assert-travel-causal-decision.util';

export {
  projectCausalDecisionCard,
  type CausalDecisionCardView,
} from './projectors/causal-decision-card.projector';

export {
  toOutcomeReconciliationStatus,
  toLegacyOutcomeValidationVerdict,
  type LegacyOutcomeValidationVerdict,
} from './mappers/map-outcome-validation-verdict.util';

export {
  projectIcelandToTravelCausalDecision,
  type ProjectIcelandTravelCausalDecisionInput,
} from './projectors/project-iceland-to-travel-causal-decision';

export {
  buildIcelandTemporalImpact,
  type IcelandTemporalScheduleAnchors,
} from './projectors/iceland-temporal-impact.util';

export {
  classifyOutcomeReconciliation,
  buildDecisionOutcome,
  attachSelectedOption,
  reconcileTravelCausalDecision,
  type ReconcileDecisionOutcomeInput,
} from './reconciliation/reconcile-decision-outcome.util';

export {
  CAUSAL_DECISION_PRODUCT_SCHEMA,
  type CausalDecisionLifecycleStatus,
  type CausalDecisionProductView,
  type CausalDecisionListView,
  type CausalDecisionOutcomeView,
  type SelectCausalDecisionRequest,
  type ApplyCausalDecisionRequest,
} from './api/causal-decision-product.types';

export {
  toCausalDecisionProductView,
  resolveLifecycleStatus,
  resolveProblemIdFromDecisionId,
  buildStatusMessage,
} from './api/to-causal-decision-product-view';
