/**
 * 纯函数：观测 + 规则 + 车型 → TravelHazard[] + ExecutionState + Quality
 *
 * 不与 Nest 耦合，便于单测与日后迁入独立包。
 */

import type { WeatherDecisionRules, WeatherViolationType } from '../interfaces/weather-decision-evidence.interface';
import type {
  ExecutionQualitySummary,
  ExecutionState,
  HazardSeverityLevel,
  TravelHazard,
  TravelHazardKind,
  VehicleClass,
  VehicleProfile,
} from './travel-hazard.types';

export interface NormalizedObservationInput {
  windSpeedMs: number;
  windGustMs?: number;
  windDirectionDeg: number;
  precipitationMm: number;
  visibilityKm?: number;
}

const DEFAULT_VEHICLE: VehicleProfile = { vehicleClass: 'SEDAN' };

/** 车型对侧风/阵风的敏感系数（>1 表示更早升级为高风险） */
function vehicleWindSensitivity(v: VehicleClass): number {
  switch (v) {
    case 'SEDAN':
      return 1;
    case 'SUV_4WD':
      return 0.85;
    case 'CAMPERVAN':
      return 1.45;
    case 'EV_CAMPERVAN':
      return 1.5;
    default:
      return 1;
  }
}

function crosswindComponentMps(effectiveWindMs: number, windDirectionDeg: number): number {
  return Math.abs(effectiveWindMs * Math.sin((windDirectionDeg * Math.PI) / 180));
}

function crosswindRiskTier(
  effectiveWindMs: number,
  windDirectionDeg: number,
): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
  const c = crosswindComponentMps(effectiveWindMs, windDirectionDeg);
  if (c > 12) return 'HIGH';
  if (c > 8) return 'MEDIUM';
  if (c > 4) return 'LOW';
  return 'NONE';
}

function hazardId(kind: TravelHazardKind, suffix: string): string {
  return `${kind.toLowerCase()}_${suffix}`;
}

function deriveViolation(
  input: NormalizedObservationInput,
  effectiveWindMs: number,
  rules?: WeatherDecisionRules,
): WeatherViolationType {
  const maxWindSpeed = rules?.maxWindSpeed ?? 15;
  const maxCrosswindSpeed = rules?.maxCrosswindSpeed ?? 12;
  const maxPrecipitation = rules?.maxPrecipitation ?? 50;
  const minVisibility = rules?.minVisibility ?? 1;

  if (effectiveWindMs > maxWindSpeed) {
    return 'HARD';
  }

  const cross = crosswindRiskTier(effectiveWindMs, input.windDirectionDeg);
  if (cross === 'HIGH' && effectiveWindMs > maxCrosswindSpeed) {
    return 'HARD';
  }

  if (input.precipitationMm > maxPrecipitation) {
    return 'HARD';
  }

  if (input.visibilityKm !== undefined && input.visibilityKm < minVisibility) {
    return 'HARD';
  }

  if (effectiveWindMs > maxWindSpeed * 0.8) {
    return 'SOFT';
  }

  if (input.precipitationMm > maxPrecipitation * 0.7) {
    return 'SOFT';
  }

  return 'NONE';
}

function buildHazards(
  input: NormalizedObservationInput,
  effectiveWindMs: number,
  rules: WeatherDecisionRules | undefined,
  vehicle: VehicleProfile,
): TravelHazard[] {
  const hazards: TravelHazard[] = [];
  const maxWind = rules?.maxWindSpeed ?? 15;
  const minVis = rules?.minVisibility ?? 1;
  const maxPrecip = rules?.maxPrecipitation ?? 50;
  const sens = vehicleWindSensitivity(vehicle.vehicleClass);

  const cw = crosswindComponentMps(effectiveWindMs, input.windDirectionDeg);
  const adjustedCw = cw * sens;

  let cwSeverity: HazardSeverityLevel = 'LOW';
  if (adjustedCw > 12) cwSeverity = 'EXTREME';
  else if (adjustedCw > 8) cwSeverity = 'HIGH';
  else if (adjustedCw > 4) cwSeverity = 'MEDIUM';

  if (cwSeverity !== 'LOW' || cw > 4) {
    const rank: Record<HazardSeverityLevel, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      EXTREME: 4,
    };
    hazards.push({
      id: hazardId('CROSSWIND', `${effectiveWindMs.toFixed(0)}_${input.windDirectionDeg}`),
      kind: 'CROSSWIND',
      severity: cwSeverity,
      confidence: input.windDirectionDeg != null ? 0.85 : 0.5,
      primaryVehicleSensitivity:
        vehicle.vehicleClass === 'CAMPERVAN' || vehicle.vehicleClass === 'EV_CAMPERVAN'
          ? ['CAMPERVAN', 'EV_CAMPERVAN']
          : undefined,
      narrative:
        rank[cwSeverity] >= rank['HIGH']
          ? '侧风分量升高，高车身车辆需特别谨慎'
          : '存在可感知侧风分量',
      evidence: [
        { metric: 'crosswind_component_mps', value: Math.round(cw * 10) / 10, unit: 'm/s' },
        { metric: 'effective_wind_mps', value: Math.round(effectiveWindMs * 10) / 10, unit: 'm/s' },
      ],
    });
  }

  const gust = input.windGustMs ?? 0;
  if (gust >= 25) {
    hazards.push({
      id: hazardId('GUST_EXTREME', '25'),
      kind: 'GUST_EXTREME',
      severity: 'EXTREME',
      confidence: 0.9,
      narrative: '极端阵风，车门与横向稳定性风险显著',
      evidence: [{ metric: 'wind_gust_mps', value: gust, unit: 'm/s' }],
    });
  } else if (gust >= 18) {
    hazards.push({
      id: hazardId('GUST_EXTREME', '18'),
      kind: 'GUST_EXTREME',
      severity: 'HIGH',
      confidence: 0.85,
      narrative: '强阵风，需注意开门与横风突变',
      evidence: [{ metric: 'wind_gust_mps', value: gust, unit: 'm/s' }],
    });
  }

  if (effectiveWindMs > maxWind * 0.95) {
    hazards.push({
      id: hazardId('WIND_SPEED', 'high'),
      kind: 'WIND_SPEED',
      severity: effectiveWindMs > maxWind ? 'EXTREME' : 'HIGH',
      confidence: 0.88,
      evidence: [{ metric: 'effective_wind_mps', value: effectiveWindMs, unit: 'm/s' }],
    });
  } else if (effectiveWindMs > maxWind * 0.75) {
    hazards.push({
      id: hazardId('WIND_SPEED', 'elevated'),
      kind: 'WIND_SPEED',
      severity: 'MEDIUM',
      confidence: 0.8,
      evidence: [{ metric: 'effective_wind_mps', value: effectiveWindMs, unit: 'm/s' }],
    });
  }

  const vk = input.visibilityKm;
  if (vk !== undefined) {
    if (vk < minVis) {
      hazards.push({
        id: hazardId('LOW_VISIBILITY', 'below_min'),
        kind: 'LOW_VISIBILITY',
        severity: 'EXTREME',
        confidence: 0.9,
        narrative: '能见度低于行程最小阈值',
        evidence: [
          { metric: 'visibility_km', value: vk, unit: 'km' },
          { metric: 'min_visibility_km', value: minVis, unit: 'km' },
        ],
      });
    } else if (vk < 2) {
      hazards.push({
        id: hazardId('LOW_VISIBILITY', 'poor'),
        kind: 'LOW_VISIBILITY',
        severity: 'HIGH',
        confidence: 0.82,
        narrative: '能见度较差，行车需降速',
        evidence: [{ metric: 'visibility_km', value: vk, unit: 'km' }],
      });
    } else if (vk < 5) {
      hazards.push({
        id: hazardId('LOW_VISIBILITY', 'reduced'),
        kind: 'LOW_VISIBILITY',
        severity: 'MEDIUM',
        confidence: 0.75,
        evidence: [{ metric: 'visibility_km', value: vk, unit: 'km' }],
      });
    }
  }

  if (input.precipitationMm > maxPrecip) {
    hazards.push({
      id: hazardId('HEAVY_PRECIP', 'over'),
      kind: 'HEAVY_PRECIP',
      severity: 'EXTREME',
      confidence: 0.85,
      evidence: [
        { metric: 'precipitation_mm', value: input.precipitationMm, unit: 'mm' },
      ],
    });
  } else if (input.precipitationMm > maxPrecip * 0.7) {
    hazards.push({
      id: hazardId('HEAVY_PRECIP', 'elevated'),
      kind: 'HEAVY_PRECIP',
      severity: 'MEDIUM',
      confidence: 0.78,
      evidence: [{ metric: 'precipitation_mm', value: input.precipitationMm, unit: 'mm' }],
    });
  }

  if (vk !== undefined && vk < 1 && effectiveWindMs > 12) {
    hazards.push({
      id: hazardId('WHITEOUT_EMERGENCE', 'combo'),
      kind: 'WHITEOUT_EMERGENCE',
      severity: 'HIGH',
      confidence: 0.72,
      narrative: '低能见度与强风叠加，白化/吹雪风险上升（涌现 hazard）',
      evidence: [
        { metric: 'visibility_km', value: vk, unit: 'km' },
        { metric: 'effective_wind_mps', value: effectiveWindMs, unit: 'm/s' },
      ],
    });
  }

  return hazards;
}

function maxSeverity(hazards: TravelHazard[]): HazardSeverityLevel | 'NONE' {
  const rank: Record<HazardSeverityLevel, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    EXTREME: 4,
  };
  let maxR = 0;
  let best: HazardSeverityLevel | 'NONE' = 'NONE';
  for (const h of hazards) {
    const r = rank[h.severity];
    if (r > maxR) {
      maxR = r;
      best = h.severity;
    }
  }
  return best;
}

function deriveExecutionState(
  violation: WeatherViolationType,
  hazards: TravelHazard[],
): ExecutionState {
  if (violation === 'HARD') {
    return 'BLOCKED';
  }

  const ms = maxSeverity(hazards);
  if (violation === 'SOFT') {
    return 'DEGRADED';
  }

  if (ms === 'EXTREME' || ms === 'HIGH') {
    return 'HIGH_RISK';
  }
  if (ms === 'MEDIUM') {
    return 'DEGRADED';
  }

  return 'EXECUTABLE';
}

function deriveExecutionQuality(
  input: NormalizedObservationInput,
  effectiveWindMs: number,
  hazards: TravelHazard[],
  executionState: ExecutionState,
): ExecutionQualitySummary {
  const maxWind = 25;
  const windNorm = Math.min(1, effectiveWindMs / maxWind);
  const vk = input.visibilityKm;
  const visNorm =
    vk === undefined ? 0 : Math.min(1, Math.max(0, (5 - Math.min(vk, 5)) / 5));
  const precipNorm = Math.min(1, input.precipitationMm / 80);

  let safeScore =
    1 - (0.38 * windNorm + 0.34 * visNorm + 0.22 * precipNorm);
  safeScore = Math.max(0, Math.min(1, safeScore));

  if (executionState === 'BLOCKED') {
    safeScore = Math.min(safeScore, 0.15);
  } else if (executionState === 'HIGH_RISK') {
    safeScore *= 0.72;
  } else if (executionState === 'DEGRADED') {
    safeScore *= 0.88;
  }

  const delayFactor =
    1 +
    0.06 * effectiveWindMs +
    (vk !== undefined && vk < 5 ? 0.12 * (5 - vk) / 5 : 0) +
    (input.precipitationMm > 10 ? 0.08 : 0);

  const visibilityPenalty = Math.min(0.45, visNorm * 0.45);
  const fatigueCost =
    executionState === 'HIGH_RISK' || executionState === 'BLOCKED' ? 0.25 : 0.08;

  const hazardPenalty = Math.min(0.5, hazards.filter(h => h.severity === 'EXTREME').length * 0.15);

  return {
    safeScore: Math.round(safeScore * 1000) / 1000,
    delayFactor: Math.round(delayFactor * 1000) / 1000,
    visibilityPenalty: Math.round(visibilityPenalty * 1000) / 1000,
    fatigueCost: Math.round(fatigueCost * 1000) / 1000,
    riskBudget: Math.max(0, Math.round((safeScore - hazardPenalty) * 1000) / 1000),
  };
}

export interface HazardDerivationResult {
  hazards: TravelHazard[];
  crosswindRisk: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  violation: WeatherViolationType;
  executionState: ExecutionState;
  executionQuality: ExecutionQualitySummary;
  explanationParts: string[];
}

export function deriveTravelHazards(
  input: NormalizedObservationInput,
  rules?: WeatherDecisionRules,
  vehicle?: VehicleProfile,
): HazardDerivationResult {
  const v = vehicle ?? DEFAULT_VEHICLE;
  const effectiveWindMs = Math.max(input.windSpeedMs, input.windGustMs ?? 0);

  const hazards = buildHazards(input, effectiveWindMs, rules, v);
  const violation = deriveViolation(input, effectiveWindMs, rules);
  const crosswindRisk = crosswindRiskTier(effectiveWindMs, input.windDirectionDeg);
  const executionState = deriveExecutionState(violation, hazards);
  const executionQuality = deriveExecutionQuality(input, effectiveWindMs, hazards, executionState);

  const explanationParts: string[] = [];
  const maxWind = rules?.maxWindSpeed ?? 15;
  if (effectiveWindMs > maxWind) {
    explanationParts.push(`有效风速（含阵风）${effectiveWindMs.toFixed(1)} m/s 超过安全阈值`);
  }
  if (crosswindRisk === 'HIGH') {
    explanationParts.push('侧风风险高，不适合驾驶');
  }
  if (input.precipitationMm > (rules?.maxPrecipitation ?? 50)) {
    explanationParts.push(`降水量 ${input.precipitationMm.toFixed(1)} mm 超过安全阈值`);
  }
  if (input.visibilityKm !== undefined && input.visibilityKm < (rules?.minVisibility ?? 1)) {
    explanationParts.push(`能见度 ${input.visibilityKm.toFixed(1)} km 低于安全阈值`);
  }

  return {
    hazards,
    crosswindRisk,
    violation,
    executionState,
    executionQuality,
    explanationParts,
  };
}
