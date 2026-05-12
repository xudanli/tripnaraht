import type {
  CrosswindRiskLevel,
  FRoadStatus,
  FeasibilityAdjustmentCode,
  FeasibilityBlockedReason,
  FeasibilityRiskLevel,
  IcelandRouteFeasibilitySegment,
  IcelandRouteFeasibilityVehicle,
  IcelandWeatherSeverityClassifierOutput,
  IcelandWindRiskOutput,
} from '../iceland-world-driving-contracts';

export interface IcelandRouteFeasibilityJudgeContext {
  fRoadStatuses: FRoadStatus[];
  weather: IcelandWeatherSeverityClassifierOutput;
  wind: IcelandWindRiskOutput;
  estimatedDrivingHours: number;
  safeDrivingWindowHours: number;
  usedDistanceHeuristic: boolean;
  /** 极昼：不将「驾驶时长 vs 晨昏窗」作为约束与加档依据 */
  temporalMileageUnbounded?: boolean;
  /** 极短日照：强制夜驾/加天提示 */
  polarNightCompact?: boolean;
}

export interface IcelandRouteFeasibilityJudgeResult {
  feasible: boolean;
  riskLevel: FeasibilityRiskLevel;
  blockedReasons: FeasibilityBlockedReason[];
  recommendedAdjustments: FeasibilityAdjustmentCode[];
}

const WIND_RANK: Record<CrosswindRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  extreme: 3,
};

const WEATHER_RANK: Record<IcelandWeatherSeverityClassifierOutput['travelRisk'], number> = {
  safe: 0,
  caution: 1,
  dangerous: 2,
  avoid_nonessential: 3,
};

function segmentHasFRoadId(seg: IcelandRouteFeasibilitySegment): string | null {
  const id = seg.roadId?.trim();
  if (!id) return null;
  const m = id.toUpperCase().match(/^(F\d{1,4})$/);
  return m ? m[1] : null;
}

export function collectFRoadIdsFromSegments(segments: IcelandRouteFeasibilitySegment[]): string[] {
  const set = new Set<string>();
  for (const s of segments) {
    const id = segmentHasFRoadId(s);
    if (id) set.add(id);
  }
  return Array.from(set);
}

export function judgeRouteFeasibility(
  segments: IcelandRouteFeasibilitySegment[],
  vehicle: IcelandRouteFeasibilityVehicle,
  ctx: IcelandRouteFeasibilityJudgeContext,
): IcelandRouteFeasibilityJudgeResult {
  const blockedReasons: FeasibilityBlockedReason[] = [];
  const recommendedAdjustments: FeasibilityAdjustmentCode[] = [];

  const hasFRoadIntent = segments.some((s) => segmentHasFRoadId(s) != null);

  if (hasFRoadIntent && vehicle.type === '2wd') {
    blockedReasons.push('VEHICLE_TYPE_INCOMPATIBLE');
  }

  const fById = new Map(ctx.fRoadStatuses.map((r) => [r.roadId.toUpperCase(), r]));

  for (const seg of segments) {
    const rid = segmentHasFRoadId(seg);
    if (!rid) continue;
    const st = fById.get(rid);
    if (!st) continue;

    if (vehicle.type === 'campervan' && st.camperRestricted) {
      blockedReasons.push('CAMPER_FR_RESTRICTED');
    }

    if (st.status === 'closed') blockedReasons.push('ROAD_CLOSED');
    if (st.status === 'impassable') blockedReasons.push('ROAD_IMPASSABLE');
    if (st.status === 'snow_covered' && vehicle.type === '2wd') blockedReasons.push('ROAD_SNOW_COVERED_2WD');
  }

  const w = ctx.weather.travelRisk;
  if (w === 'dangerous' || w === 'avoid_nonessential') {
    blockedReasons.push('WEATHER_SEVERITY_BLOCK');
  }

  if (vehicle.type === 'campervan' && ctx.wind.crosswindRisk === 'extreme') {
    blockedReasons.push('WIND_CAMPERVAN_EXTREME');
  }

  const uniqueBlocked = Array.from(new Set(blockedReasons));
  const hardBlock = uniqueBlocked.length > 0;

  const temporalRelaxed = ctx.temporalMileageUnbounded === true;

  if (ctx.polarNightCompact) {
    recommendedAdjustments.push('NIGHT_DRIVING_REQUIRED');
    recommendedAdjustments.push('EXTEND_STAY_DAYS');
  }

  if (!temporalRelaxed && ctx.estimatedDrivingHours > ctx.safeDrivingWindowHours) {
    recommendedAdjustments.push('REDUCE_DAILY_MILEAGE');
    recommendedAdjustments.push('START_BEFORE_DAWN');
    recommendedAdjustments.push('DEFER_TO_DAYLIGHT');
  }

  if (ctx.usedDistanceHeuristic) {
    recommendedAdjustments.push('PROVIDE_EXACT_DISTANCES');
  }

  if (WIND_RANK[ctx.wind.crosswindRisk] >= 2) {
    recommendedAdjustments.push('REVIEW_WIND_EXPOSURE');
  }

  if (WEATHER_RANK[ctx.weather.travelRisk] >= 1) {
    recommendedAdjustments.push('REVIEW_WEATHER');
  }

  let riskLevel: FeasibilityRiskLevel = 'SAFE';
  if (WEATHER_RANK[w] >= 3 || WIND_RANK[ctx.wind.crosswindRisk] >= 3) {
    riskLevel = 'DANGEROUS';
  } else if (WEATHER_RANK[w] >= 2 || WIND_RANK[ctx.wind.crosswindRisk] >= 2) {
    riskLevel = 'HIGH';
  } else if (
    WEATHER_RANK[w] >= 1 ||
    WIND_RANK[ctx.wind.crosswindRisk] >= 1 ||
    (!temporalRelaxed && ctx.estimatedDrivingHours > ctx.safeDrivingWindowHours)
  ) {
    riskLevel = 'CAUTION';
  }

  if (!temporalRelaxed && ctx.estimatedDrivingHours > ctx.safeDrivingWindowHours * 1.15) {
    riskLevel = riskLevel === 'SAFE' ? 'HIGH' : riskLevel === 'CAUTION' ? 'HIGH' : riskLevel;
  }

  return {
    feasible: !hardBlock,
    riskLevel,
    blockedReasons: uniqueBlocked,
    recommendedAdjustments: Array.from(new Set(recommendedAdjustments)),
  };
}
