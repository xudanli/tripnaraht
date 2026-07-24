import type { HumanCapabilityModel } from '../../trips/decision/models/human-capability.model';
import type { TrekkingFitnessBaseline } from '../types/physical-fitness-gate.types';
import { DEFAULT_TREKKING_FITNESS_BASELINE } from '../util/trekking-fitness-baseline.util';

const ELEVATION_TO_ASCENT: Record<number, number> = {
  0: 300,
  1: 450,
  2: 700,
  3: 1000,
  4: 1400,
};

const LONGEST_HIKE_TO_PACK_KG: Record<number, number> = {
  0: 5,
  1: 8,
  2: 12,
  3: 16,
  4: 20,
};

/** HumanCapabilityModel / 问卷 → Layer 0 特征矩阵投影 */
export function projectBaselineFromHumanCapability(
  model: HumanCapabilityModel,
): TrekkingFitnessBaseline {
  const longest = model.questionnaireLongestHike ?? 0;
  const weekly = model.questionnaireLongestHike != null ? inferWeeklyFromModel(model) : 0;

  return {
    maxDailyAscentM: Math.round(model.maxDailyAscentM),
    maxAltitudeM: Math.round(model.maxElevationM ?? 3000),
    maxPackWeightKg: LONGEST_HIKE_TO_PACK_KG[longest] ?? 10,
    heavyPackCampingVerified: longest >= 3 && (model.maxDailyAscentM ?? 0) >= 800,
    recentAerobicSessions30d: weeklyToSessions30d(weekly),
    source: 'questionnaire',
    evidenceLabel: model.completedTripCount
      ? `体能问卷 · 已完成 ${model.completedTripCount} 次行程校准`
      : '体能问卷评估',
    updatedAt: new Date().toISOString(),
  };
}

function inferWeeklyFromModel(model: HumanCapabilityModel): number {
  if (model.fitnessScore != null && model.fitnessScore >= 75) return 3;
  if (model.fitnessScore != null && model.fitnessScore >= 55) return 2;
  return 1;
}

function weeklyToSessions30d(weeklyExerciseBand: number): number {
  if (weeklyExerciseBand >= 4) return 16;
  if (weeklyExerciseBand >= 3) return 12;
  if (weeklyExerciseBand >= 2) return 8;
  if (weeklyExerciseBand >= 1) return 4;
  return 0;
}

/** 问卷档位 → 保守爬升/海拔（无 HumanCapability 完整模型时） */
export function projectBaselineFromQuestionnaireRow(row: {
  weeklyExercise: number;
  longestHike: number;
  elevationExperience: number;
}): TrekkingFitnessBaseline {
  return {
    maxDailyAscentM: ELEVATION_TO_ASCENT[row.elevationExperience] ?? 400,
    maxAltitudeM: row.elevationExperience >= 4 ? 4500 : row.elevationExperience >= 3 ? 3500 : 1200,
    maxPackWeightKg: LONGEST_HIKE_TO_PACK_KG[row.longestHike] ?? 6,
    heavyPackCampingVerified: row.longestHike >= 3 && row.elevationExperience >= 3,
    recentAerobicSessions30d: weeklyToSessions30d(row.weeklyExercise),
    source: 'questionnaire',
    evidenceLabel: '标准化体能问卷',
    updatedAt: new Date().toISOString(),
  };
}

/** 取 stored 与 projected 的逐维最大值；实证标签优先 trip_history */
export function mergeTrekkingFitnessBaselines(
  stored: TrekkingFitnessBaseline | null,
  projected: TrekkingFitnessBaseline | null,
): TrekkingFitnessBaseline {
  const base = stored ?? projected ?? { ...DEFAULT_TREKKING_FITNESS_BASELINE };
  if (!projected) return { ...base };
  if (!stored) return { ...projected };

  const preferStoredEvidence =
    stored.source === 'trip_history' ||
    (stored.evidenceLabel && !stored.evidenceLabel.includes('问卷'));

  return {
    maxDailyAscentM: Math.max(stored.maxDailyAscentM, projected.maxDailyAscentM),
    maxAltitudeM: Math.max(stored.maxAltitudeM, projected.maxAltitudeM),
    maxPackWeightKg: Math.max(stored.maxPackWeightKg, projected.maxPackWeightKg),
    heavyPackCampingVerified: stored.heavyPackCampingVerified || projected.heavyPackCampingVerified,
    recentAerobicSessions30d: Math.max(
      stored.recentAerobicSessions30d,
      projected.recentAerobicSessions30d,
    ),
    source: preferStoredEvidence ? stored.source : projected.source,
    evidenceLabel: preferStoredEvidence
      ? (stored.evidenceLabel ?? projected.evidenceLabel)
      : (projected.evidenceLabel ?? stored.evidenceLabel),
    updatedAt: new Date().toISOString(),
  };
}

const FAILURE_PENALTY_RATIO = 0.65;

/** 行后体能崩溃 / 下撤 — 永久调低硬核匹配特征矩阵 */
export function applyPhysicalFailurePenalty(
  baseline: TrekkingFitnessBaseline,
  input: { eventType: string; evidenceLabel?: string },
): TrekkingFitnessBaseline {
  const severe =
    input.eventType === 'rescue_called' || input.eventType === 'mid_trip_evacuation';

  return {
    maxDailyAscentM: Math.round(baseline.maxDailyAscentM * FAILURE_PENALTY_RATIO),
    maxAltitudeM: Math.round(baseline.maxAltitudeM * (severe ? 0.55 : FAILURE_PENALTY_RATIO)),
    maxPackWeightKg: Math.round(baseline.maxPackWeightKg * FAILURE_PENALTY_RATIO),
    heavyPackCampingVerified: false,
    recentAerobicSessions30d: Math.max(0, baseline.recentAerobicSessions30d - 4),
    source: baseline.source,
    evidenceLabel:
      input.evidenceLabel ??
      `行后风控降权 · ${input.eventType} · 硬核徒步匹配权重已下调`,
    updatedAt: new Date().toISOString(),
  };
}
