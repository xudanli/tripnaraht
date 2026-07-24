export * from './contracts';
export {
  WEATHER_TEMPORAL_PREDICTOR_ID,
  WEATHER_TEMPORAL_PREDICTION_VERSION,
  predictWeatherTemporalImpact,
  findPredictedOnset,
  findPredictedDeterioration,
  findPredictedPeak,
  parseTemporalRiskLevel,
} from './weather-shadow/weather-temporal-predictor.shadow';
export {
  DEFAULT_INTERVENTION_LEAD_MINUTES,
  computeInterventionDeadline,
} from './weather-shadow/intervention-deadline.from-temporal';
export {
  SHADOW_CONTROL_SEALS,
  buildShadowWeatherPredictionRecord,
} from './weather-shadow/build-shadow-prediction-record';
export type {
  WeatherActualPoint,
  WeatherForecastPoint,
  WeatherOfflineAccuracyCase,
} from './weather-shadow/weather-forecast-series.types';
export { reconcileWeatherPrediction } from './reconciliation/reconcile-prediction.util';
export {
  P2_ACCURACY_HARNESS_SCHEMA_ID,
  runWeatherOfflineAccuracyHarness,
} from './accuracy/weather-accuracy-harness';
export type {
  AccuracyCaseResult,
  AccuracyHarnessReport,
  AccuracyHarnessSummary,
} from './accuracy/weather-accuracy-harness';
export {
  WEATHER_OFFLINE_ACCURACY_FIXTURES,
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
  WEATHER_OFFLINE_CASE_FALSE_POSITIVE,
  WEATHER_OFFLINE_CASE_FALSE_NEGATIVE,
  WEATHER_OFFLINE_CASE_PARTIAL_ONSET,
} from './accuracy/weather-offline-fixtures';
export {
  P2_GATE0_SCHEMA_ID,
  evaluateP2Gate0Offline,
} from './gate0/evaluate-p2-gate0-offline';
export type { Gate0Check, P2Gate0Report } from './gate0/evaluate-p2-gate0-offline';

export {
  P2_QUALITY_GATE_SCHEMA_ID,
  P2_QUALITY_BASELINE_SCHEMA_ID,
  P2_HUMAN_REVIEW_LEDGER_SCHEMA_ID,
} from './quality-gate/weather-quality.types';
export type {
  WeatherQualityBaseline,
  WeatherQualityMetrics,
  WeatherQualityGateReport,
  HumanReviewLedger,
  QualityDiscrepancy,
  QualityCaseBundle,
  QualityClassification,
  QualityDiscrepancyKind,
} from './quality-gate/weather-quality.types';
export {
  computeWeatherQualityMetrics,
  isActionableFalseNegative,
  isPredictionReversal,
} from './quality-gate/weather-quality.metrics';
export {
  buildHumanReviewLedger,
  collectQualityDiscrepancies,
  freezeWeatherQualityBaseline,
} from './quality-gate/human-review.ledger';
export { buildWeatherQualityCorpus } from './quality-gate/weather-quality.corpus';
export {
  evaluateWeatherTemporalPredictionQualityGate,
  submit02BInternalTemporalAdvisoryApplication,
  buildBlocked02BAuthorization,
  INTERNAL_TEMPORAL_ADVISORY_TRIP_IDS,
} from './quality-gate/evaluate-quality-gate';
export type { InternalTemporalAdvisoryAuthorization } from './quality-gate/evaluate-quality-gate';
export {
  emitInternalShadowTemporalAdvisory,
  INTERNAL_SHADOW_ADVISORY_SCHEMA_ID,
} from './quality-gate/internal-shadow-advisory';
export type { InternalShadowTemporalAdvisory } from './quality-gate/internal-shadow-advisory';

export * from './internal-advisory';
export * from './selected-user-advisory';

export {
  WEATHER_SHADOW_PILOT_SEMANTIC,
  WEATHER_SHADOW_PILOT_COUNTRY,
} from './shadow-pilot/weather-shadow-pilot.types';
export type {
  ControlBoundarySnapshot,
  PredictionLifecycleStatus,
  StoredShadowPrediction,
  WeatherShadowPilotAuthorization,
  WeatherShadowPilotReport,
  WeatherShadowPilotTickResult,
  WeatherShadowWorldView,
} from './shadow-pilot/weather-shadow-pilot.types';
export {
  isOntologyP2WeatherShadowKillSwitchEngaged,
  assertWeatherShadowPilotEnabled,
} from './shadow-pilot/weather-shadow.kill-switch';
export {
  getWeatherShadowSelectedTripIds,
  isWeatherShadowSelectedTrip,
  assertWeatherShadowSelectedTrip,
} from './shadow-pilot/weather-shadow-selected-trips';
export { ShadowPredictionVersionStore } from './shadow-pilot/prediction-version.store';
export {
  ShadowControlBoundaryProbe,
  createCleanControlBoundary,
} from './shadow-pilot/control-boundary.metrics';
export { tickWeatherShadowPilot } from './shadow-pilot/weather-shadow-pilot.runtime';
export {
  buildWeatherShadowPilotFixtureViews,
  runWeatherShadowProductionPilot,
} from './shadow-pilot/weather-shadow-production-pilot';
export {
  buildWeatherShadowPilotReport,
  computeWeatherShadowReplayFingerprint,
  exportWeatherShadowProductionReplay,
} from './shadow-pilot/production-replay.export';
export {
  P2_SHADOW_GATE_SCHEMA_ID,
  approveWeatherShadowPilotAuthorization,
  buildWeatherShadowPilotAuthorization,
  evaluateP2WeatherShadowGate,
  submitWeatherShadowPilotAuthorization,
} from './shadow-pilot/shadow-gate.evaluate';
export type { P2ShadowGateReport } from './shadow-pilot/shadow-gate.evaluate';
export {
  observeContextRevision,
  worldViewToOfflineCase,
} from './shadow-pilot/weather-world-view.reader';
