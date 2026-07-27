export { WEATHER_DETERIORATION_SEMANTIC } from './weather-deterioration.types';
export type {
  WeatherDecisionProblem,
  WeatherLoopResult,
  WeatherPlanImpact,
  WeatherPlanView,
  WeatherProductBehavior,
  WeatherRepairCandidate,
  WeatherTimeline,
  WeatherWarningLevel,
  WeatherWarningObservation,
} from './weather-deterioration.types';
export {
  applyWeatherFactLifecycle,
  expireStaleWeatherFacts,
  parseWeatherWarningLevel,
  weatherWarningObservationToTravelWorldFact,
  WEATHER_WARNING_RANK,
} from './weather-warning-to-travel-world-fact.adapter';
export {
  buildWeatherTimeline,
  resolveWeatherPlanImpact,
  resolveWeatherProductBehavior,
} from './weather-plan-impact.resolver';
export {
  annotateWeatherAssessmentWithProblem,
  assertSingleWeatherRootProblem,
  buildWeatherDecisionProblem,
  buildWeatherRootAssessment,
  shouldOpenWeatherUserDecision,
} from './weather-decision.builder';
export {
  buildWeatherRepairCandidates,
  ensureVehicleClassFact,
} from './weather-repair.proposals';
export {
  assertWeatherDeteriorationSemanticEnabled,
  isOntologyP1WeatherDeteriorationKillSwitchEngaged,
} from './weather-deterioration.kill-switch';
export {
  applyWeatherDeteriorationRepair,
  ingestWeatherWarningObservations,
  runWeatherDeteriorationDetection,
} from './weather-loop.orchestrator';
export { buildWeatherDeteriorationDecisionScope } from './build-weather-deterioration-decision-scope';
export {
  createIdleWeatherMonitorState,
  DEFAULT_WEATHER_MONITOR_CONFIG,
  tickWeatherDeteriorationMonitor,
  weatherMonitorFingerprint,
  WeatherDeteriorationMonitorStore,
} from './weather-monitoring.runtime';
export type {
  WeatherMonitorConfig,
  WeatherMonitorNotifyKind,
  WeatherMonitorPhase,
  WeatherMonitorState,
  WeatherMonitorTickResult,
} from './weather-monitoring.runtime';
export { runWeatherDeteriorationProductionPilot } from './weather-production-pilot';
export type {
  WeatherPilotPoll,
  WeatherPilotReport,
  WeatherPilotStep,
} from './weather-production-pilot';
