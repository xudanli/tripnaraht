/**
 * 将 CGUSOptimizationPolicy 应用到候选集（硬边界 → Feasible Set）
 * 与软偏好评分（preferenceScore，非权重硬映射）。
 */

import type { CGUSCandidate } from './cgus-search.service';
import type {
  CGUSOptimizationPolicy,
  CgusHardConstraintSpec,
  CgusScoringHints,
} from './cgus-optimization-policy.types';

function segmentLooksLikeFRoad(seg: {
  metadata?: Record<string, unknown>;
  roadId?: string;
  segmentId?: string;
}): boolean {
  const meta = seg.metadata ?? {};
  if (meta.fRoad === true || meta.isFRoad === true) return true;
  const roadClass = String(meta.roadClass ?? meta.road_class ?? '').toUpperCase();
  if (roadClass.includes('F-ROAD') || roadClass.startsWith('F')) return true;
  const id = String(seg.roadId ?? seg.segmentId ?? meta.roadId ?? '');
  return /(?:^|[^a-z])f\d{1,3}(?:[^a-z]|$)/i.test(id);
}

function candidateHasFRoad(candidate: CGUSCandidate): boolean {
  return (candidate.plan?.segments ?? []).some((s) => segmentLooksLikeFRoad(s as any));
}

function estimateMaxDailyDriveHours(candidate: CGUSCandidate): number {
  const segments = candidate.plan?.segments ?? [];
  const byDay = new Map<number, number>();
  for (const seg of segments) {
    const dist = Number((seg as any).distanceKm) || 0;
    const minutes = dist > 0 ? (dist / 55) * 60 : 25;
    const dayIdx = Number((seg as any).dayIndex);
    const key = Number.isFinite(dayIdx) && dayIdx > 0 ? dayIdx : 1;
    byDay.set(key, (byDay.get(key) ?? 0) + minutes / 60);
  }
  let max = 0;
  for (const h of byDay.values()) max = Math.max(max, h);
  return max;
}

function candidatePlaceIds(candidate: CGUSCandidate): Set<string> {
  const ids = new Set<string>();
  for (const seg of candidate.plan?.segments ?? []) {
    const meta = ((seg as any).metadata ?? {}) as Record<string, unknown>;
    for (const key of ['placeId', 'place_id', 'poiId', 'poi_id', 'toPlaceId', 'fromPlaceId']) {
      const v = meta[key];
      if (typeof v === 'string' && v.trim()) ids.add(v.trim());
    }
    const to = (seg as any).toPlaceId ?? (seg as any).fromPlaceId;
    if (typeof to === 'string' && to.trim()) ids.add(to.trim());
  }
  return ids;
}

function applyOneHard(
  candidate: CGUSCandidate,
  hard: CgusHardConstraintSpec,
): CGUSCandidate {
  const violations = [...(candidate.constraintViolations ?? [])];
  let feasible = candidate.feasible;

  if (hard.kind === 'F_ROAD_FORBIDDEN' && candidateHasFRoad(candidate)) {
    feasible = false;
    violations.push({
      type: 'F_ROAD_FORBIDDEN',
      severity: 'HARD',
      degree: 1,
    });
  }

  if (hard.kind === 'MAX_DAILY_DRIVE_HOURS') {
    const cap = Number(hard.params?.maxDailyDriveHours);
    if (Number.isFinite(cap) && cap > 0) {
      const observed = estimateMaxDailyDriveHours(candidate);
      if (observed > cap + 0.25) {
        // 超过硬上限：可行域剔除；接近时已由 soft 偏好处理
        feasible = false;
        violations.push({
          type: 'MAX_DAILY_DRIVE_HOURS',
          severity: 'HARD',
          degree: Math.min(1, (observed - cap) / Math.max(1, cap)),
        });
      }
    }
  }

  if (hard.kind === 'LOCKED_ACTIVITY') {
    const placeId = String(hard.params?.placeId ?? '').trim();
    if (placeId) {
      const ids = candidatePlaceIds(candidate);
      // 仅当候选计划已带 place 引用时才强制；空骨架不误杀
      if (ids.size > 0 && !ids.has(placeId)) {
        feasible = false;
        violations.push({
          type: 'LOCKED_ACTIVITY_MISSING',
          severity: 'HARD',
          degree: 1,
        });
      }
    }
  }

  // VEHICLE_TYPE / CHANGE_STRATEGY_CAP：P0 记入 policy，候选级物理判定依赖上游 plan 标注；此处不臆造违规
  if (feasible === candidate.feasible && violations.length === (candidate.constraintViolations?.length ?? 0)) {
    return candidate;
  }
  return { ...candidate, feasible, constraintViolations: violations };
}

export function applyCgusHardConstraintsToCandidates(
  candidates: CGUSCandidate[],
  policy: CGUSOptimizationPolicy,
): CGUSCandidate[] {
  if (!policy.hardConstraints.length) return candidates;
  return candidates.map((c) =>
    policy.hardConstraints.reduce((acc, hard) => applyOneHard(acc, hard), c),
  );
}

/**
 * 软偏好 → preferenceScore（0–1），不改 EU 权重表。
 * 基于候选 id / 违规类型与 scoringHints 的轻量对齐。
 */
export function scoreCandidatePreferenceAgainstPolicy(
  candidate: CGUSCandidate,
  hints: CgusScoringHints,
): number {
  let score = 0.5;
  const id = String(candidate.id ?? '').toLowerCase();
  const softTypes = new Set(
    (candidate.constraintViolations ?? [])
      .filter((v) => v.severity === 'SOFT')
      .map((v) => String(v.type).toUpperCase()),
  );

  const density = hints.densityPreference ?? 'balanced';
  if (density === 'relaxed') {
    if (id.includes('relax') || id.includes('easy') || id.includes('pace')) score += 0.18;
    if (id.includes('high-density') || id.includes('dense') || id.includes('coverage')) score -= 0.12;
    if (softTypes.has('FATIGUE_HIGH') || softTypes.has('TIME_WINDOW_BREACH')) score -= 0.1;
  } else if (density === 'dense') {
    if (id.includes('high-density') || id.includes('coverage') || id.includes('philosophy')) {
      score += 0.12;
    }
    if (id.includes('relax')) score -= 0.08;
  }

  const fatigue = hints.fatigueSensitivity ?? 0.45;
  if (fatigue >= 0.7 && (softTypes.has('FATIGUE_HIGH') || softTypes.has('EXPERIENCE_DENSITY_LOW'))) {
    score -= fatigue * 0.15;
  }

  const cost = hints.costSensitivity ?? 0.35;
  if (cost >= 0.65) {
    if (id.includes('budget')) score += 0.12;
    if (softTypes.has('BUDGET_OVERRUN')) score -= 0.15;
  }

  const hotel = hints.hotelChangeSensitivity ?? 0.35;
  if (hotel >= 0.65 && (id.includes('hub') || id.includes('stable'))) score += 0.1;

  const safety = hints.safetyBias ?? 0.5;
  if (safety >= 0.7 && softTypes.has('SAFETY_RISK')) score -= 0.2;

  return Math.max(0, Math.min(1, score));
}
