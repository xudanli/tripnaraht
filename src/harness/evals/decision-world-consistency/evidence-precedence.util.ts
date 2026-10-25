/**
 * Re-export production evidence precedence for harness imports.
 */
export {
  WEATHER_EVIDENCE_PRECEDENCE,
  ROAD_EVIDENCE_PRECEDENCE,
  resolveDecisionWindSpeedMps,
  peakWindFromWeatherEvidence,
  resolveWindFromPhysicalReality,
  type WeatherEvidenceBand,
  type RoadEvidenceBand,
  type ResolvedDecisionWind,
} from '../../../trips/decision/shared/evidence-precedence.util';
