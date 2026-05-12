/**
 * P4-A Route hazard projection — weather & road physics sampled along corridor segments.
 *
 * Correctness-first: deterministic stubs where grid sampling is not wired yet.
 * Does not mutate routing providers or TripDecisionEngine state.
 */

import type { ExecutionState, VehicleClass } from '../../decision/hazard/travel-hazard.types';
import type {
  RouteExecutionAssessment,
  RouteTerrainDifficulty,
} from './route-execution-assessment.types';
import type { RouteExecutionSegment } from './route-execution-segment.types';
import type {
  ProjectRouteExecutionHazardsInput,
  WeatherAlongRouteSample,
} from './route-execution-inputs.types';
import type { ReliabilityAwareEta } from './route-reliability-eta.types';
import {
  lookupTerrainVehicleExecutionState,
  type TerrainScenario,
} from './terrain-vehicle-compatibility';
import { segmentRouteCorridor } from './segment-route-corridor';

export interface RouteExecutionProjection {
  assessment: RouteExecutionAssessment;
  segments: RouteExecutionSegment[];
  eta: ReliabilityAwareEta;
}

const STATE_RANK: Record<ExecutionState, number> = {
  EXECUTABLE: 0,
  DEGRADED: 1,
  HIGH_RISK: 2,
  BLOCKED: 3,
};

function worseState(a: ExecutionState, b: ExecutionState): ExecutionState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

function scenarioRank(s: TerrainScenario): number {
  switch (s) {
    case 'F_ROAD_WET_GRAVEL':
      return 3;
    case 'HIGH_CROSSWIND_PASS':
      return 2;
    default:
      return 1;
  }
}

function pickTerrainScenario(args: {
  roadFRoad: boolean;
  crosswind: number;
}): TerrainScenario {
  if (args.roadFRoad) return 'F_ROAD_WET_GRAVEL';
  if (args.crosswind > 0.55) return 'HIGH_CROSSWIND_PASS';
  return 'GENERAL_PAVED_CORRIDOR';
}

function nearestWeatherSample(
  samples: ReadonlyArray<WeatherAlongRouteSample> | undefined,
  alongRatio: number,
): WeatherAlongRouteSample {
  if (!samples?.length) {
    return {
      alongRatio,
      crosswindRisk: 0.15,
      snowExposure: 0.05,
      whiteoutProbability: 0.02,
    };
  }
  let best = samples[0];
  let bestD = Infinity;
  for (const s of samples) {
    const d = Math.abs(s.alongRatio - alongRatio);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function difficultyFromMaxGrade(gradeAbsPct: number): RouteTerrainDifficulty {
  if (gradeAbsPct >= 12) return 'EXTREME';
  if (gradeAbsPct >= 8) return 'HIGH';
  if (gradeAbsPct >= 4) return 'MODERATE';
  return 'LOW';
}

function maxGradeInSlice(
  samples: ProjectRouteExecutionHazardsInput['elevationProfile']['samples'],
  segmentIndex: number,
  segmentCount: number,
): number {
  if (!samples.length) return 0;
  const per = Math.max(1, Math.ceil(samples.length / segmentCount));
  const start = segmentIndex * per;
  const slice = samples.slice(start, start + per);
  let maxG = 0;
  for (const s of slice) {
    const g = Math.abs(s.gradePct ?? 0);
    if (g > maxG) maxG = g;
  }
  return maxG;
}

function speedPenaltyFromExposure(exp: RouteExecutionSegment['exposure']): number {
  const visLoss = 1 - Math.min(1, Math.max(0, exp.visibility));
  return (
    1 +
    exp.crosswind * 0.45 +
    exp.icing * 0.55 +
    visLoss * 0.65
  );
}

function icingBumpState(base: ExecutionState, icing: number): ExecutionState {
  if (icing > 0.7) return worseState(base, 'HIGH_RISK');
  if (icing > 0.4) return worseState(base, 'DEGRADED');
  return base;
}

function rollupTerrainDifficulty(levels: RouteTerrainDifficulty[]): RouteTerrainDifficulty {
  const order: RouteTerrainDifficulty[] = ['LOW', 'MODERATE', 'HIGH', 'EXTREME'];
  let bestIdx = 0;
  for (const l of levels) {
    const i = order.indexOf(l);
    if (i > bestIdx) bestIdx = i;
  }
  return order[bestIdx]!;
}

function computeEta(args: {
  baselineMinutes: number;
  segmentPenalties: number[];
  reliabilityScore: number;
}): ReliabilityAwareEta {
  const n = Math.max(1, args.segmentPenalties.length);
  const expected = args.segmentPenalties.reduce(
    (acc, p, _i) => acc + (args.baselineMinutes / n) * p,
    0,
  );
  const maxPenalty = Math.max(...args.segmentPenalties, 1);
  const pessimistic = Math.round(expected * Math.min(2.2, 1 + (maxPenalty - 1) * 0.85));
  const optimistic = Math.round(Math.min(args.baselineMinutes, expected * 0.92));

  return {
    optimisticMinutes: optimistic,
    expectedMinutes: Math.round(expected),
    pessimisticMinutes: pessimistic,
    reliabilityScore: args.reliabilityScore,
  };
}

/**
 * If the driver's vehicle class is stressed by the hardest corridor scenario, suggest the next tier up.
 */
function recommendVehicleUpgrade(
  worstScenario: TerrainScenario,
  current: VehicleClass,
): VehicleClass | undefined {
  const st = lookupTerrainVehicleExecutionState(worstScenario, current);
  if (STATE_RANK[st] <= STATE_RANK.DEGRADED) {
    return undefined;
  }
  const order: VehicleClass[] = ['SEDAN', 'SUV_4WD', 'CAMPERVAN', 'EV_CAMPERVAN'];
  const start = order.indexOf(current);
  for (let j = start + 1; j < order.length; j++) {
    const vc = order[j]!;
    const st2 = lookupTerrainVehicleExecutionState(worstScenario, vc);
    if (STATE_RANK[st2] < STATE_RANK[st]) {
      return vc;
    }
  }
  return undefined;
}

/**
 * Project corridor-local hazards into segment physics + leg rollup + reliability ETA.
 */
export function projectRouteExecutionHazards(
  input: ProjectRouteExecutionHazardsInput,
): RouteExecutionProjection {
  const baselineMinutes = input.baselineDurationMin ?? 60;
  const metas = segmentRouteCorridor({
    legId: input.legId,
    geometry: input.geometry,
    segmentCount: input.segmentCount,
  });

  const samples = input.weatherGrid.samples;
  const roadFRoad = Boolean(input.roadCondition.fRoad);

  const segments: RouteExecutionSegment[] = [];
  const terrainLevels: RouteTerrainDifficulty[] = [];

  let maxCross = 0;
  let maxSnow = 0;
  let maxWhiteout = 0;
  let worstScenario: TerrainScenario = 'GENERAL_PAVED_CORRIDOR';

  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i]!;
    const w = nearestWeatherSample(samples, meta.alongMidRatio);
    const cw = w.crosswindRisk ?? 0;
    const snow = w.snowExposure ?? 0;
    const wo = w.whiteoutProbability ?? 0;

    maxCross = Math.max(maxCross, cw);
    maxSnow = Math.max(maxSnow, snow);
    maxWhiteout = Math.max(maxWhiteout, wo);

    const visibility = Math.max(0, Math.min(1, 1 - wo - snow * 0.35));
    const icing = Math.min(1, snow * 0.7 + wo * 0.9);

    const exposure: RouteExecutionSegment['exposure'] = {
      crosswind: cw,
      icing,
      visibility,
    };

    const scenario = pickTerrainScenario({ roadFRoad, crosswind: cw });
    if (scenarioRank(scenario) > scenarioRank(worstScenario)) {
      worstScenario = scenario;
    }
    let executionState = lookupTerrainVehicleExecutionState(
      scenario,
      input.vehicleProfile.vehicleClass,
    );
    executionState = icingBumpState(executionState, icing);

    const estimatedSpeedPenalty = speedPenaltyFromExposure(exposure);

    terrainLevels.push(difficultyFromMaxGrade(maxGradeInSlice(input.elevationProfile.samples, i, metas.length)));

    segments.push({
      segmentId: meta.segmentId,
      exposure,
      executionState,
      estimatedSpeedPenalty,
      startIndex: meta.startIndex,
      endIndex: meta.endIndex,
    });
  }

  const legExecutionState = segments.reduce(
    (acc, s) => worseState(acc, s.executionState),
    'EXECUTABLE' as ExecutionState,
  );

  const penalties = segments.map((s) => s.estimatedSpeedPenalty);
  const meanPenalty =
    penalties.reduce((a, b) => a + b, 0) / Math.max(1, penalties.length);
  const executionReliability = Math.max(
    0,
    Math.min(1, 1 - (meanPenalty - 1) * 0.55 - STATE_RANK[legExecutionState] * 0.12),
  );

  const eta = computeEta({
    baselineMinutes,
    segmentPenalties: penalties,
    reliabilityScore: executionReliability,
  });

  const assessment: RouteExecutionAssessment = {
    legId: input.legId,
    terrainDifficulty: rollupTerrainDifficulty(terrainLevels),
    weatherExposure: {
      crosswindRisk: maxCross,
      snowExposure: maxSnow,
      whiteoutProbability: maxWhiteout,
    },
    roadAccessibility: {
      fRoad: roadFRoad,
      requires4WD: input.roadCondition.requires4WD,
      seasonalClosureRisk: input.roadCondition.seasonalClosureRisk,
    },
    executionReliability,
    estimatedDelayFactor: meanPenalty,
    recommendedVehicleClass: recommendVehicleUpgrade(
      worstScenario,
      input.vehicleProfile.vehicleClass,
    ),
    executionState: legExecutionState,
  };

  return { assessment, segments, eta };
}
