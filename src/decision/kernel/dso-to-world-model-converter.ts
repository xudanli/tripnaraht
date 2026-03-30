/**
 * DSO → WorldModelContext 转换器
 *
 * Scheme A: Monte Carlo 与 Kernel 集成
 * 将 DSO 转为 ProbabilisticWorldModelService.fromDeterministicModel 所需的 WorldModelContext
 *
 * 策略：当 DSO 数据不足时构建最小可用 stub，满足 fromDeterministicModel 不抛错
 */

import type { DecisionState } from './decision-state.types';
import type { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import type { PhysicalRealityModel } from '../../trips/decision/models/physical-reality.model';
import type { HumanCapabilityModel, PreferredPace } from '../../trips/decision/models/human-capability.model';
import type { RouteDirectionWithPhilosophy } from '../../trips/decision/shared/world-model.types';

/**
 * 从 DSO 构建最小可用的 WorldModelContext
 * 用于 Monte Carlo 概率期望效用计算
 */
export function dsoToMinimalWorldModelContext(state: DecisionState): WorldModelContext | null {
  const env = state.environmentState ?? {};
  const intent = state.userIntent ?? {};
  const routeDirectionId = env.routeDirectionId ?? (state as any).research_data?.route_direction_id ?? 'unknown';

  const month = env.month ?? (intent.dateRange?.startDate ? new Date(intent.dateRange.startDate).getMonth() + 1 : new Date().getMonth() + 1);
  const countryCode = env.countryCode ?? 'IS'; // 默认冰岛
  const weatherRisk = env.weatherRisk ?? (env.failureRiskLevel === 'HIGH' ? 0.6 : env.failureRiskLevel === 'MEDIUM' ? 0.35 : 0.15);

  const physical: PhysicalRealityModel = {
    demEvidence: [
      {
        segmentId: 'stub-1',
        elevationProfile: [0, 100, 200],
        cumulativeAscent: 200,
        maxSlopePct: 5,
        rollingAscent3Days: 400,
        fatigueIndex: 20,
        violation: 'NONE',
        explanation: 'Stub from DSO',
      },
    ],
    roadStates: [],
    hazardZones: [],
    ferryStates: [],
    countryCode,
    month,
    climateSeasonality: {
      countryCode,
      month,
      accessibilityScore: Math.max(0.1, 1 - weatherRisk),
      typicalWeather: {
        windSpeedMps: 10,
        precipitationMmPerHour: 2,
        visibilityMeters: 5000,
        temperatureCelsius: 10,
      },
    },
  };

  const party = intent.party;
  const rawFitness = String((party as any)?.fitnessLevel ?? 'MEDIUM').toUpperCase();
  const preferredPace: PreferredPace =
    rawFitness === 'LOW' || rawFitness === 'MEDIUM_LOW'
      ? 'SLOW'
      : rawFitness === 'HIGH' || rawFitness === 'MEDIUM_HIGH'
        ? 'FAST'
        : 'MEDIUM';
  const riskTolerance = (party as any)?.riskTolerance ?? 'MEDIUM';

  const human: HumanCapabilityModel = {
    profileId: 'dso-stub',
    maxDailyAscentM: 800,
    rollingAscent3DaysM: 2000,
    maxSlopePct: 15,
    preferredPace,
    riskTolerance: riskTolerance as 'LOW' | 'MEDIUM' | 'HIGH',
    highAltitudeExperience: 'BASIC',
    bufferDayBias: 'MEDIUM',
  };

  const routeDirection: RouteDirectionWithPhilosophy = {
    id: routeDirectionId,
    countryCode,
    name: routeDirectionId,
    nameCN: routeDirectionId,
    nameEN: routeDirectionId,
    tags: [],
    philosophy: '',
  } as RouteDirectionWithPhilosophy;

  return {
    physical,
    human,
    routeDirection,
  };
}
