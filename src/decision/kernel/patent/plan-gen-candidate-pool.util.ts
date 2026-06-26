/**
 * 专利 6.5 步骤 6：PLAN_GEN 多候选池（轻量壳层）
 *
 * 从单一 itinerary 生成专利形状候选（plan_C / plan_D 等），
 * 做约束可行域粗过滤与 IG 启发式排序；完整 CGUS 终选仍在 OPTIMIZE。
 */

import type { DecisionState } from '../decision-state.types';
import type { ItineraryLike } from '../interfaces/phase-executor.interface';

export interface PatentPlanCandidateDay {
  day: number;
  activity: string;
  location?: string;
  walk_km?: number;
  drive_h?: number;
  note?: string;
}

export interface PatentPlanCandidate {
  id: string;
  days: PatentPlanCandidateDay[];
  cost?: number;
  utility_pre?: number;
  ig?: number;
  feasible?: boolean;
  rejectedReason?: string;
}

export interface PlanGenCandidatePoolResult {
  /** 全部生成候选（含被淘汰） */
  all: PatentPlanCandidate[];
  /** 通过粗过滤、进入 OPTIMIZE/CGUS 的 Top-K */
  retained: PatentPlanCandidate[];
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function itineraryToPatentDays(itinerary: ItineraryLike, dayCount: number): PatentPlanCandidateDay[] {
  const rawDays = Array.isArray(itinerary.days) ? itinerary.days : [];
  return Array.from({ length: dayCount }, (_, i) => {
    const d = rawDays[i] as Record<string, unknown> | undefined;
    const items = Array.isArray(d?.items) ? d!.items : [];
    const first = items[0] as Record<string, unknown> | undefined;
    const locRef = first?.location_ref as Record<string, unknown> | undefined;
    const name =
      (typeof locRef?.name === 'string' && locRef.name) ||
      (typeof first?.title === 'string' && first.title) ||
      `Day ${i + 1} activity`;
    return {
      day: i + 1,
      activity: name,
      location: typeof locRef?.name === 'string' ? locRef.name : undefined,
      walk_km: 2 + (i % 3),
      drive_h: i === 2 ? 0 : 1 + (i % 4),
    };
  });
}

function cloneDays(days: PatentPlanCandidateDay[]): PatentPlanCandidateDay[] {
  return days.map((d) => ({ ...d }));
}

function patchDay3(days: PatentPlanCandidateDay[], activity: string, note?: string): PatentPlanCandidateDay[] {
  const next = cloneDays(days);
  const idx = next.findIndex((d) => d.day === 3);
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      activity,
      location: activity.includes('SPA') ? '皇后镇' : next[idx].location,
      walk_km: activity.includes('徒步') ? 8 : activity.includes('博物馆') ? 4 : 3,
      drive_h: activity.includes('米尔福德') ? 5 : next[idx].drive_h,
      note,
    };
  }
  return next;
}

function estimateUtilityPre(c: PatentPlanCandidate, weatherRisk: number): number {
  let u = 0.78;
  if (c.id.includes('indoor') || c.id.includes('spa')) u += 0.04;
  if (c.feasible === false) u -= 0.35;
  if (weatherRisk >= 0.7 && c.days.some((d) => d.day === 3 && /徒步|游船|峡湾/.test(d.activity))) u -= 0.2;
  const maxWalk = Math.max(...c.days.map((d) => d.walk_km ?? 0));
  if (maxWalk > 5) u -= 0.15;
  return clamp01(u);
}

function estimateInformationGain(c: PatentPlanCandidate, weatherRisk: number): number {
  if (c.feasible === false) return 0.02;
  if (/spa|indoor/i.test(c.id)) return clamp01(0.12 + weatherRisk * 0.05);
  if (/museum|winery/i.test(c.id)) return 0.05;
  return 0.08;
}

function violatesPatentConstraints(
  c: PatentPlanCandidate,
  opts: { maxWalkKm: number; maxWeatherRisk: number; weatherRiskDay3: number },
): string | undefined {
  const maxWalk = Math.max(...c.days.map((d) => d.walk_km ?? 0));
  if (maxWalk > opts.maxWalkKm) return `日步行 ${maxWalk}km 超过 ${opts.maxWalkKm}km`;
  const day3 = c.days.find((d) => d.day === 3);
  if (
    opts.weatherRiskDay3 > opts.maxWeatherRisk &&
    day3 &&
    /徒步|游船|峡湾|outdoor/i.test(day3.activity)
  ) {
    return `第3天天气风险 ${opts.weatherRiskDay3} 超过阈值 ${opts.maxWeatherRisk}`;
  }
  return undefined;
}

/**
 * 从主 itinerary 构建专利实施例形状的多候选池。
 */
export function buildPatentPlanCandidatePool(
  dso: DecisionState,
  primaryItinerary: ItineraryLike,
  options?: { topK?: number; explorationBeta?: number },
): PlanGenCandidatePoolResult {
  const dayCount = dso.userIntent?.days ?? (Array.isArray(primaryItinerary.days) ? primaryItinerary.days.length : 5);
  const baseDays = itineraryToPatentDays(primaryItinerary, dayCount);
  const weatherRisk = clamp01(dso.environmentState?.weatherRisk ?? dso.uncertaintyProfile?.entropy01 ?? 0.5);
  const budget = dso.userIntent?.budget ?? 20000;
  const maxWalkKm = 5;
  const maxWeatherRisk = 0.5;
  const beta = options?.explorationBeta ?? 0.4;
  const topK = options?.topK ?? dso.uncertaintyProfile?.rolloutTopK ?? 2;

  const raw: PatentPlanCandidate[] = [
    {
      id: 'plan_hike',
      days: patchDay3(baseDays, '米尔福德峡湾徒步', '高步行强度方案'),
    },
    {
      id: 'plan_cruise',
      days: patchDay3(baseDays, '米尔福德峡湾游船', '暴风雨日户外游船'),
    },
    {
      id: 'plan_c_indoor_spa',
      days: patchDay3(baseDays, '皇后镇温泉SPA', '规避第3天高风险天气'),
    },
    {
      id: 'plan_d_museum',
      days: patchDay3(baseDays, '皇后镇博物馆+酒庄'),
    },
    {
      id: 'plan_primary',
      days: cloneDays(baseDays),
    },
  ];

  const evaluated = raw.map((c) => {
    const rejectedReason = violatesPatentConstraints(c, {
      maxWalkKm,
      maxWeatherRisk,
      weatherRiskDay3: weatherRisk,
    });
    const feasible = !rejectedReason;
    const utility_pre = estimateUtilityPre({ ...c, feasible }, weatherRisk);
    const ig = estimateInformationGain({ ...c, feasible }, weatherRisk);
    const cost = Math.round(budget * (0.9 + 0.05 * (c.id === 'plan_d_museum' ? 1 : 0)));
    return { ...c, feasible, rejectedReason, utility_pre, ig, cost };
  });

  const scoreCandidate = (c: PatentPlanCandidate): number => {
    let s = c.utility_pre! + beta * c.ig!;
    if (weatherRisk >= 0.5 && c.id === 'plan_primary') s -= 0.12;
    return s;
  };

  const retained = evaluated
    .filter((c) => c.feasible)
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a))
    .slice(0, topK);

  return { all: evaluated, retained };
}

/** 将 retained 候选写入 DSO.candidates（专利 audit 形状） */
export function patentCandidatesToDsoField(result: PlanGenCandidatePoolResult): unknown[] {
  return result.retained.map((c) => ({
    id: c.id,
    days: c.days,
    cost: c.cost,
    utility_pre: c.utility_pre,
    ig: c.ig,
    feasible: c.feasible,
  }));
}
