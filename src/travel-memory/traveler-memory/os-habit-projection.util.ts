/**
 * 从旧 OS L0/L1 投影「习惯摘要」用的伪 Traveler Memory（只读，不写 Ledger）。
 * 值面向用户：优先中文自然语言。
 */

import { randomUUID } from 'crypto';
import {
  TRAVELER_MEMORY_OBJECT_SCHEMA,
  type TravelerMemoryObjectV1,
} from './traveler-memory-contract.types';
import type { TravelerMemoryDomain } from '../effective-context/effective-traveler-context.types';

const PACE_ZH: Record<string, string> = {
  SLOW: '偏慢节奏',
  MODERATE: '节奏适中',
  FAST: '偏好紧凑行程',
};

const RISK_ZH: Record<string, string> = {
  LOW: '偏保守',
  MEDIUM: '风险适中',
  HIGH: '可接受较高风险',
};

const PHILOSOPHY_ZH: Record<string, string> = {
  SCENIC: '偏风景与自然体验',
  ADVENTURE: '偏冒险探索',
  RELAXED: '偏轻松休闲',
};

const COUNTRY_ZH: Record<string, string> = {
  CN: '中国',
  US: '美国',
  IS: '冰岛',
  JP: '日本',
  KR: '韩国',
  GB: '英国',
  AU: '澳大利亚',
};

function nowIso(): string {
  return new Date().toISOString();
}

function synth(input: {
  subject_id: string;
  domain: TravelerMemoryDomain;
  semantic_type: TravelerMemoryObjectV1['semantic_type'];
  key: string;
  value: unknown;
  confidence?: number;
}): TravelerMemoryObjectV1 {
  const t = nowIso();
  return {
    schemaId: TRAVELER_MEMORY_OBJECT_SCHEMA,
    version: 1,
    memory_id: `os_proj_${randomUUID()}`,
    subject_id: input.subject_id,
    domain: input.domain,
    semantic_type: input.semantic_type,
    key: input.key,
    value: input.value,
    scope: 'GLOBAL_USER',
    confidence: input.confidence ?? 0.9,
    status: 'CONFIRMED',
    source: ['EXPLICIT'],
    evidence_refs: [{ type: 'USER_EXPLICIT', id: `os_proj:${input.key}` }],
    evidence_count: 1,
    sensitivity: input.key.includes('diet') ? 'SENSITIVE' : 'NORMAL',
    visibility: 'USER_VISIBLE',
    override_policy: 'L2_WINS',
    created_at: t,
    last_observed_at: t,
    last_confirmed_at: t,
  };
}

export type OsHabitProjectionInput = {
  userId: string;
  /** UserProfile.preferences */
  preferences?: Record<string, unknown> | null;
  /** UserTravelProfile row */
  travelProfile?: {
    pacePreference?: string | null;
    riskTolerance?: string | null;
    travelPhilosophy?: string | null;
    preferredRouteTypes?: string[] | null;
    extendedProfile?: unknown;
  } | null;
};

/**
 * 把 OS 画像投影为习惯摘要条目（中文值）。
 */
export function projectOsProfileToHabitMemories(
  input: OsHabitProjectionInput,
): TravelerMemoryObjectV1[] {
  const uid = input.userId.trim();
  if (!uid) return [];
  const prefs = input.preferences ?? {};
  const tp = input.travelProfile;
  const out: TravelerMemoryObjectV1[] = [];

  const diet = Array.isArray(prefs.dietaryRestrictions)
    ? prefs.dietaryRestrictions.map(String).filter((s) => s.trim())
    : [];
  if (diet.length) {
    out.push(
      synth({
        subject_id: uid,
        domain: 'FOOD',
        semantic_type: 'CONSTRAINT',
        key: '饮食禁忌',
        value: diet.join('、'),
      }),
    );
  }

  const nationality = String(prefs.nationality ?? '').trim().toUpperCase();
  if (nationality) {
    out.push(
      synth({
        subject_id: uid,
        domain: 'DECISION_STYLE',
        semantic_type: 'HABIT',
        key: '国籍',
        value: COUNTRY_ZH[nationality] ?? nationality,
      }),
    );
  }

  const residency = String(prefs.residencyCountry ?? '').trim().toUpperCase();
  if (residency && residency !== nationality) {
    out.push(
      synth({
        subject_id: uid,
        domain: 'DECISION_STYLE',
        semantic_type: 'HABIT',
        key: '常住地',
        value: COUNTRY_ZH[residency] ?? residency,
      }),
    );
  }

  const hotelAvoid = Array.isArray(prefs.hotelAvoid)
    ? prefs.hotelAvoid.map(String).filter((s) => s.trim())
    : [];
  const ext =
    tp?.extendedProfile &&
    typeof tp.extendedProfile === 'object' &&
    !Array.isArray(tp.extendedProfile)
      ? (tp.extendedProfile as Record<string, unknown>)
      : {};
  const extAvoid = Array.isArray(ext.hotelAvoid)
    ? ext.hotelAvoid.map(String).filter((s) => s.trim())
    : [];
  const avoid = [...new Set([...hotelAvoid, ...extAvoid])];
  if (avoid.length) {
    out.push(
      synth({
        subject_id: uid,
        domain: 'STAY',
        semantic_type: 'AVOIDANCE',
        key: '住宿避让',
        value: avoid.join('、'),
      }),
    );
  }

  const pace = String(tp?.pacePreference ?? '').trim().toUpperCase();
  if (pace) {
    out.push(
      synth({
        subject_id: uid,
        domain: 'PACE',
        semantic_type: 'PREFERENCE',
        key: '行程节奏',
        value: PACE_ZH[pace] ?? pace,
      }),
    );
  }

  const risk = String(tp?.riskTolerance ?? '').trim().toUpperCase();
  if (risk) {
    out.push(
      synth({
        subject_id: uid,
        domain: 'DECISION_STYLE',
        semantic_type: 'PREFERENCE',
        key: '风险偏好',
        value: RISK_ZH[risk] ?? risk,
      }),
    );
  }

  const ph = String(tp?.travelPhilosophy ?? '').trim().toUpperCase();
  if (ph) {
    out.push(
      synth({
        subject_id: uid,
        domain: 'EXPERIENCE',
        semantic_type: 'PREFERENCE',
        key: '旅行风格',
        value: PHILOSOPHY_ZH[ph] ?? ph,
      }),
    );
  }

  const routes = (tp?.preferredRouteTypes ?? []).map(String).filter(Boolean);
  if (routes.length) {
    const routeZh = routes.map((r) => {
      const u = r.toUpperCase();
      if (u === 'NATURE') return '自然';
      if (u === 'ROAD_TRIP') return '自驾';
      if (u === 'HIKING') return '徒步';
      if (u === 'CULTURAL') return '人文';
      if (u === 'URBAN') return '城市';
      if (u === 'SEA') return '海滨';
      return r;
    });
    out.push(
      synth({
        subject_id: uid,
        domain: 'EXPERIENCE',
        semantic_type: 'PREFERENCE',
        key: '偏好路线',
        value: routeZh.join('、'),
      }),
    );
  }

  const driveH = Number(ext.maxDailyDrivingHours);
  if (Number.isFinite(driveH) && driveH > 0) {
    out.push(
      synth({
        subject_id: uid,
        domain: 'MOBILITY',
        semantic_type: 'CONSTRAINT',
        key: '日驾上限',
        value: `约${driveH}小时`,
      }),
    );
  }

  // 结构化中文偏好（若有）
  const structured = prefs.tripnara_structured_preferences;
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    const s = structured as Record<string, unknown>;
    if (typeof s.dining_preferences === 'string' && s.dining_preferences.trim()) {
      // 已有饮食禁忌则不重复整段
      if (diet.length === 0) {
        out.push(
          synth({
            subject_id: uid,
            domain: 'FOOD',
            semantic_type: 'PREFERENCE',
            key: '餐饮偏好',
            value: s.dining_preferences.trim().slice(0, 80),
            confidence: 0.7,
          }),
        );
      }
    }
    if (typeof s.hotel_style === 'string' && s.hotel_style.trim()) {
      const style = s.hotel_style
        .trim()
        .split(/[；;]/)[0]
        ?.trim()
        .slice(0, 24);
      if (style) {
        out.push(
          synth({
            subject_id: uid,
            domain: 'STAY',
            semantic_type: 'PREFERENCE',
            key: '住宿风格',
            value: style,
            confidence: 0.65,
          }),
        );
      }
    }
  }

  return out;
}
