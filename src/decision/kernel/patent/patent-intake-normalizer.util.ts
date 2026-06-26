/**
 * 专利 6.5 步骤 2：INTAKE 年龄/体能 → 约束种子
 */

import type { UserIntent } from '../decision-state.types';

export interface PatentIntakeConstraintSeeds {
  userAge?: number;
  daily_walk?: { max_per_day: number; unit: 'km'; reason?: string };
  drive_time?: { max_per_day: number; unit: 'hours'; reason?: string };
  budget?: { max: number; current: number | null };
}

const AGE_PATTERNS: RegExp[] = [
  /(?:我|本人)?(?:今年)?(\d{2,3})\s*岁/,
  /(?:age|aged)\s*[:：]?\s*(\d{2,3})/i,
  /(\d{2,3})\s*(?:years?\s*old|yo)/i,
];

/** 从自然语言提取年龄（专利实施例：65 岁） */
export function extractUserAgeFromText(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  for (const re of AGE_PATTERNS) {
    const m = t.match(re);
    if (m?.[1]) {
      const age = parseInt(m[1], 10);
      if (Number.isFinite(age) && age >= 1 && age <= 120) return age;
    }
  }
  return undefined;
}

/** 专利：65 岁 → 日步行 ≤5km */
export function deriveDailyWalkLimitKm(age: number): number {
  if (age >= 70) return 4;
  if (age >= 60) return 5;
  if (age >= 50) return 6;
  if (age >= 35) return 8;
  return 10;
}

/** 专利：65 岁 → 日驾驶 ≤6h */
export function deriveMaxDriveHoursPerDay(age: number): number {
  if (age >= 70) return 5;
  if (age >= 60) return 6;
  if (age >= 50) return 7;
  return 8;
}

export function buildPatentIntakeConstraintSeeds(
  userIntent: UserIntent,
  sources?: { message?: string; tripPlanRequest?: Record<string, unknown> },
): PatentIntakeConstraintSeeds {
  const message = sources?.message ?? '';
  const party = sources?.tripPlanRequest?.party as Record<string, unknown> | undefined;
  const hasElderly = party?.has_elderly === true || userIntent.party?.fitnessLevel === 'low';

  let age = extractUserAgeFromText(message);
  if (age === undefined && hasElderly) age = 65;

  const seeds: PatentIntakeConstraintSeeds = {};
  if (typeof userIntent.budget === 'number' && userIntent.budget > 0) {
    seeds.budget = { max: userIntent.budget, current: null };
  }

  if (age !== undefined) {
    seeds.userAge = age;
    seeds.daily_walk = {
      max_per_day: deriveDailyWalkLimitKm(age),
      unit: 'km',
      reason: `用户年龄${age}岁`,
    };
    seeds.drive_time = {
      max_per_day: deriveMaxDriveHoursPerDay(age),
      unit: 'hours',
      reason: `用户年龄${age}岁`,
    };
  }

  return seeds;
}

/**
 * 将专利约束种子写入 userIntent.constraints（不覆盖已有键）。
 * 开关：`DECISION_OS_PATENT_INTAKE_NORMALIZER=1`
 */
export function applyPatentIntakeNormalizer(
  userIntent: UserIntent,
  sources?: { message?: string; tripPlanRequest?: Record<string, unknown> },
): UserIntent {
  if (process.env.DECISION_OS_PATENT_INTAKE_NORMALIZER !== '1') {
    return userIntent;
  }
  const seeds = buildPatentIntakeConstraintSeeds(userIntent, sources);
  if (Object.keys(seeds).length === 0) return userIntent;

  const existing = (userIntent.constraints ?? {}) as Record<string, unknown>;
  return {
    ...userIntent,
    constraints: {
      ...existing,
      ...seeds,
      _patentIntakeSeeds: seeds,
    },
  };
}
