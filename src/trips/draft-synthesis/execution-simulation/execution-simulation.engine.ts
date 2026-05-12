import type { DraftDay } from '../../dto/trip-draft.dto';
import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import type { TripDraftState } from '../state/trip-draft-state.types';
import type {
  ExecutionSimulationDimensions,
  ExecutionSimulationIssue,
  ExecutionSimulationRecommendation,
  ExecutionSimulationReport,
  SimulationIssueType,
  SimulationSeverity,
} from './execution-simulation.types';
import type { SimulationLevel } from '../persona-policy/execution-policy.types';

const SLOT_ORDER = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'] as const;

const DEFAULT_SLOT_MIN: Record<(typeof SLOT_ORDER)[number], number> = {
  morning: 180,
  lunch: 75,
  afternoon: 240,
  dinner: 90,
  evening: 120,
};

const DAY_ACTIVE_BUDGET_MIN = 600;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function transportSpeedKmh(transport?: string): number {
  const t = (transport || 'walk').toLowerCase();
  if (t === 'car') return 60;
  if (t === 'transit') return 25;
  return 4;
}

function parseSlotDurationMin(
  slot: (typeof SLOT_ORDER)[number],
  item: { startTime?: string; endTime?: string } | undefined,
): number {
  if (!item?.startTime || !item?.endTime) return DEFAULT_SLOT_MIN[slot];
  const s = Date.parse(item.startTime);
  const e = Date.parse(item.endTime);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return DEFAULT_SLOT_MIN[slot];
  return Math.max(15, Math.round((e - s) / 60000));
}

function outdoorSensitivity(place: CandidatePlace | undefined): number {
  if (!place) return 0.35;
  const cat = String(place.category || '').toUpperCase();
  if (cat.includes('PARK') || cat.includes('NATURE') || cat.includes('BEACH') || cat.includes('HIK')) return 0.85;
  if (cat.includes('MUSEUM') || cat.includes('RESTAURANT') || cat.includes('SHOP')) return 0.25;
  return 0.45;
}

function queueRisk(place: CandidatePlace | undefined): number {
  if (!place) return 0.45;
  const pop = place.popularity ?? 5;
  return Math.min(1, 0.35 + (pop / 10) * 0.45);
}

function closureRisk(place: CandidatePlace | undefined): number {
  if (!place?.openingHours || (typeof place.openingHours === 'object' && Object.keys(place.openingHours as object).length === 0)) {
    return 0.4;
  }
  return 0.15;
}

export interface RunExecutionSimulationParams {
  tripDraftState: TripDraftState;
  candidatesById: Map<number, CandidatePlace>;
  validatedDays: DraftDay[];
  /** RELAXER / FREE_SPIRIT 等：减轻告警噪声（Policy Engine） */
  simulationLevel?: SimulationLevel;
}

function makeIssue(
  type: SimulationIssueType,
  severity: SimulationSeverity,
  affectedSlots: string[],
  detail?: string,
): ExecutionSimulationIssue {
  return { type, severity, affectedSlots, detail };
}

function severityFromDelta(excess: number, t1: number, t2: number): SimulationSeverity {
  if (excess >= t2) return 'high';
  if (excess >= t1) return 'medium';
  return 'low';
}

/**
 * 执行前物理世界仿真：时间 / 地理 / 疲劳 / 风险（可同步调用、可单测）。
 */
export function runExecutionSimulation(params: RunExecutionSimulationParams): ExecutionSimulationReport {
  const { tripDraftState, candidatesById, validatedDays, simulationLevel } = params;
  const lightSim = simulationLevel === 'LIGHT';
  const transport = tripDraftState.intent.transport;
  const intensity = tripDraftState.intent.intensity || 'balanced';
  const speed = transportSpeedKmh(transport);

  const issues: ExecutionSimulationIssue[] = [];
  let totalTravelMin = 0;
  let totalVisitMin = 0;
  let compressedSlotsTotal = 0;
  let cumulativeWalkingKm = 0;
  let peakDayFatigue = 0;
  let maxDensity = 0;
  let recoveryShortfallTotal = 0;
  let zoneTransitions = 0;
  let clusterUniquePeak = 0;
  let backtrackSegments = 0;

  let weatherSensSum = 0;
  let queueSum = 0;
  let closureSum = 0;
  let seasonalSamples = 0;

  const daysByNum = new Map(validatedDays.map((d) => [d.day, d]));

  for (const cal of tripDraftState.calendar) {
    const dayRow = daysByNum.get(cal.day);
    const slots = dayRow?.slots || {};

    const orderedSlotKeys: string[] = [];
    let dayVisitMin = 0;
    let dayCompressed = 0;
    const placeSeq: CandidatePlace[] = [];

    for (const slot of SLOT_ORDER) {
      const raw = slots[slot] as
        | {
            placeId?: number;
            startTime?: string;
            endTime?: string;
            evidence?: { compressedMin?: number };
          }
        | undefined;
      if (!raw?.placeId) continue;

      orderedSlotKeys.push(`${cal.day}:${slot}`);
      const p = candidatesById.get(raw.placeId);
      if (p) placeSeq.push(p);

      let dur = parseSlotDurationMin(slot, raw);
      const cm = raw.evidence?.compressedMin;
      if (typeof cm === 'number' && cm > 0) {
        dayCompressed += 1;
        compressedSlotsTotal += 1;
        dur -= Math.min(cm, dur * 0.5);
      }
      dayVisitMin += dur;

      weatherSensSum += outdoorSensitivity(p);
      queueSum += queueRisk(p);
      closureSum += closureRisk(p);
      seasonalSamples += 1;
    }

    let dayTravelMin = 0;
    let dayLegKm = 0;
    for (let i = 1; i < placeSeq.length; i++) {
      const km = haversineKm(placeSeq[i - 1], placeSeq[i]);
      dayLegKm += km;
      cumulativeWalkingKm += km;
      dayTravelMin += (km / speed) * 60;
    }
    totalTravelMin += dayTravelMin;
    totalVisitMin += dayVisitMin;

    const clusters = new Set(placeSeq.map((p) => p.clusterId).filter((x): x is number => x != null));
    clusterUniquePeak = Math.max(clusterUniquePeak, clusters.size);

    for (let i = 1; i < placeSeq.length; i++) {
      if (
        placeSeq[i - 1].clusterId != null &&
        placeSeq[i].clusterId != null &&
        placeSeq[i - 1].clusterId !== placeSeq[i].clusterId
      ) {
        zoneTransitions += 1;
      }
    }

    if (placeSeq.length >= 3) {
      for (let i = 2; i < placeSeq.length; i++) {
        const a = placeSeq[i - 2];
        const b = placeSeq[i - 1];
        const c = placeSeq[i];
        const d1 = haversineKm(a, b);
        const d2 = haversineKm(b, c);
        const dSkip = haversineKm(a, c);
        if (d1 + d2 > dSkip * 1.35 && dSkip > 1.5) backtrackSegments += 1;
      }
    }

    const dayBudgetUsed = dayTravelMin + dayVisitMin;
    const density = orderedSlotKeys.length / Math.max(1, DAY_ACTIVE_BUDGET_MIN / 120);
    maxDensity = Math.max(maxDensity, density);

    const fatigueDay =
      0.35 * Math.min(15, dayLegKm) + 0.25 * orderedSlotKeys.length + 0.2 * Math.min(4, dayTravelMin / 60);
    peakDayFatigue = Math.max(peakDayFatigue, fatigueDay);

    const lunch = slots.lunch as { placeId?: number; startTime?: string; endTime?: string } | undefined;
    if (lunch?.placeId) {
      const lmin = parseSlotDurationMin('lunch', lunch);
      if (orderedSlotKeys.length >= 4 && lmin < 45) recoveryShortfallTotal += 30;
    }

    if (dayBudgetUsed > DAY_ACTIVE_BUDGET_MIN) {
      const excess = dayBudgetUsed - DAY_ACTIVE_BUDGET_MIN;
      issues.push(
        makeIssue(
          'time_overflow',
          severityFromDelta(excess, 30, 90),
          orderedSlotKeys,
          `第 ${cal.day} 天估算活跃 ${Math.round(dayBudgetUsed)}min > 预算 ${DAY_ACTIVE_BUDGET_MIN}min`,
        ),
      );
    }
    if (dayCompressed > 0 && dayBudgetUsed > DAY_ACTIVE_BUDGET_MIN * 0.85) {
      issues.push(makeIssue('overlap_risk', 'medium', orderedSlotKeys, '存在时间压缩且当日日程偏满'));
    }
  }

  const nDays = Math.max(1, tripDraftState.calendar.length);
  const overflowVsBudget = totalVisitMin + totalTravelMin - DAY_ACTIVE_BUDGET_MIN * nDays;

  const fragmentationScore = Math.min(1, clusterUniquePeak / 5 + backtrackSegments / 4);
  if (clusterUniquePeak >= 4) {
    issues.push(makeIssue('geo_fragmentation', 'medium', [], `单日最大集群数 ${clusterUniquePeak}`));
  }
  if (backtrackSegments >= 2) {
    issues.push(
      makeIssue('backtracking', backtrackSegments >= 4 ? 'high' : 'medium', [], `${backtrackSegments} 段折返倾向`),
    );
  }
  if (zoneTransitions >= tripDraftState.selections.length * 0.5 && tripDraftState.selections.length >= 4) {
    issues.push(makeIssue('zone_churn', 'medium', [], `跨区切换 ${zoneTransitions} 次`));
  }

  let maxFatigueAllowed = intensity === 'relaxed' ? 4 : intensity === 'intense' ? 8 : 6;
  if (lightSim) maxFatigueAllowed *= 1.22;
  if (peakDayFatigue > maxFatigueAllowed) {
    issues.push(
      makeIssue(
        'fatigue_peak',
        peakDayFatigue > maxFatigueAllowed + 2 ? 'high' : 'medium',
        [],
        `峰值疲劳信号 ${peakDayFatigue.toFixed(2)} > 强度上限 ${maxFatigueAllowed}`,
      ),
    );
  }
  const walkKmThreshold = lightSim ? 16 : 12;
  if ((transport || 'walk').toLowerCase() === 'walk' && cumulativeWalkingKm / nDays > walkKmThreshold) {
    issues.push(
      makeIssue(
        'walking_overload',
        cumulativeWalkingKm / nDays > (lightSim ? 22 : 18) ? 'high' : 'medium',
        [],
        `均日步行相关距离约 ${(cumulativeWalkingKm / nDays).toFixed(1)}km`,
      ),
    );
  }

  const nVol = Math.max(1, seasonalSamples);
  const weatherSensitivityScore = weatherSensSum / nVol;
  const queueRiskScore = queueSum / nVol;
  const closureRiskScore = closureSum / nVol;
  const seasonalRiskScore = 0.2;

  if (weatherSensitivityScore > 0.65) {
    issues.push(makeIssue('weather_sensitivity', 'medium', [], '户外敏感点占比较高'));
  }
  if (queueRiskScore > 0.72) {
    issues.push(makeIssue('queue_risk', 'low', [], '热门点排队概率偏高'));
  }
  if (closureRiskScore > 0.35) {
    issues.push(makeIssue('closure_risk', closureRiskScore > 0.45 ? 'medium' : 'low', [], '部分点营业时间数据不足'));
  }

  const issuesForReport =
    lightSim
      ? issues.filter(
          (i) =>
            i.severity === 'high' ||
            (i.severity === 'medium' &&
              (i.type === 'time_overflow' || i.type === 'fatigue_peak' || i.type === 'walking_overload')),
        )
      : issues;

  const geoRisk = Math.min(
    1,
    0.45 * fragmentationScore + 0.35 * Math.min(1, backtrackSegments / 6) + 0.2 * Math.min(1, zoneTransitions / 8),
  );
  const timeRisk = Math.min(
    1,
    0.55 * Math.max(0, overflowVsBudget / (400 * nDays)) +
      0.25 * Math.min(1, compressedSlotsTotal / (4 * nDays)) +
      0.2 * Math.min(1, recoveryShortfallTotal / (120 * nDays)),
  );
  const fatigueRisk = Math.min(1, peakDayFatigue / 10);

  const riskScore = Math.min(
    1,
    0.28 * timeRisk +
      0.22 * geoRisk +
      0.22 * fatigueRisk +
      0.12 * weatherSensitivityScore +
      0.08 * queueRiskScore +
      0.08 * closureRiskScore,
  );

  const feasibilityScore = Math.max(0, Math.min(1, 1 - 0.85 * riskScore));

  const predictedExecutionFailureRate = Math.min(
    0.45,
    0.12 +
      riskScore * 0.38 +
      (compressedSlotsTotal > 0 ? 0.06 : 0) +
      (issuesForReport.some((i) => i.severity === 'high') ? 0.06 : 0),
  );

  let recommendation: ExecutionSimulationRecommendation = 'APPROVE';
  if (
    feasibilityScore < 0.45 ||
    riskScore > 0.65 ||
    issuesForReport.some((i) => i.type === 'time_overflow' && i.severity === 'high')
  ) {
    recommendation = 'REPAIR_REQUIRED';
  } else if (feasibilityScore < 0.72 || riskScore > 0.38 || issuesForReport.length > 0) {
    recommendation = 'WARN';
  }

  const dimensions: ExecutionSimulationDimensions = {
    time: {
      totalTravelMinEstimate: Math.round(totalTravelMin),
      totalVisitMinEstimate: Math.round(totalVisitMin),
      totalScheduledActiveMin: Math.round(totalTravelMin + totalVisitMin),
      overflowVsBudgetMin: Math.round(overflowVsBudget),
      compressedSlotsCount: compressedSlotsTotal,
    },
    geo: {
      zoneTransitionCount: zoneTransitions,
      clusterUniqueCount: clusterUniquePeak,
      backtrackSegments,
      fragmentationScore,
    },
    fatigue: {
      peakDayScore: Math.round(peakDayFatigue * 100) / 100,
      cumulativeWalkingKm: Math.round(cumulativeWalkingKm * 10) / 10,
      recoveryGapShortfallMin: Math.round(recoveryShortfallTotal),
      activityDensityPeak: Math.round(maxDensity * 100) / 100,
    },
    volatility: {
      weatherSensitivityScore: Math.round(weatherSensitivityScore * 1000) / 1000,
      queueRiskScore: Math.round(queueRiskScore * 1000) / 1000,
      closureRiskScore: Math.round(closureRiskScore * 1000) / 1000,
      seasonalRiskScore,
    },
  };

  return {
    feasibilityScore: Math.round(feasibilityScore * 1000) / 1000,
    riskScore: Math.round(riskScore * 1000) / 1000,
    issues: issuesForReport,
    predictedExecutionFailureRate: Math.round(predictedExecutionFailureRate * 1000) / 1000,
    recommendation,
    dimensions,
  };
}
