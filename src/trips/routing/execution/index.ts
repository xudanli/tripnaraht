export type { ExecutionEnrichedTravelLeg, RouteExecutionTemporalImpact } from './execution-enriched-travel-leg.types';
export { buildExecutionEnrichedTravelLeg } from './build-execution-enriched-travel-leg';
export {
  routeExecutionToTemporalDrifts,
  type RouteExecutionTemporalBridgeInput,
} from './route-execution-temporal-bridge';

export type {
  RouteExecutionAssessment,
  RouteTerrainDifficulty,
} from './route-execution-assessment.types';
export type { RouteExecutionSegment, RouteExecutionSegmentExposure } from './route-execution-segment.types';
export type { ReliabilityAwareEta } from './route-reliability-eta.types';
export type {
  ProjectRouteExecutionHazardsInput,
  RouteGeometryRef,
  RouteElevationProfile,
  ElevationProfileSample,
  WeatherAlongRouteGrid,
  WeatherAlongRouteSample,
  RoadConditionAlongRoute,
  RouteExecutionWindow,
} from './route-execution-inputs.types';

export {
  TERRAIN_VEHICLE_COMPATIBILITY_MATRIX,
  lookupTerrainVehicleExecutionState,
  type TerrainScenario,
} from './terrain-vehicle-compatibility';

export { segmentRouteCorridor, type CorridorSegmentMeta } from './segment-route-corridor';
export {
  projectRouteExecutionHazards,
  type RouteExecutionProjection,
} from './project-route-execution-hazards';
