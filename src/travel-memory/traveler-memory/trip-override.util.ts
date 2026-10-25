/**
 * Habit summary + Trip Override 纯函数。
 */

import type { TravelerMemoryObjectV1 } from './traveler-memory-contract.types';
import type {
  TravelerHabitCardV1,
  TravelerHabitSummaryV1,
  TripMemoryModeV1,
} from './trip-override.types';
import { TRIP_MEMORY_MODE_KEY } from './trip-override.types';
import type { TravelerMemoryDomain } from '../effective-context/effective-traveler-context.types';

const DOMAIN_ORDER: TravelerMemoryDomain[] = [
  'FOOD',
  'STAY',
  'SLEEP',
  'MOBILITY',
  'EXPERIENCE',
  'PACE',
  'SPENDING',
  'DECISION_STYLE',
];

/** 内部枚举 → 用户可见中文（摘要展示用） */
const VALUE_ZH: Record<string, string> = {
  SLOW: '偏慢节奏',
  MODERATE: '节奏适中',
  FAST: '偏好紧凑行程',
  LOW: '偏保守',
  MEDIUM: '风险适中',
  HIGH: '可接受较高风险',
  SCENIC: '偏风景与自然体验',
  ADVENTURE: '偏冒险探索',
  RELAXED: '偏轻松休闲',
  NATURE: '自然',
  ROAD_TRIP: '自驾',
  HIKING: '徒步',
  CULTURAL: '人文',
  URBAN: '城市',
  SEA: '海滨',
};

const KEY_ZH: Record<string, string> = {
  pace: '行程节奏',
  travel_philosophy: '旅行风格',
  risk_tolerance: '风险偏好',
  preferred_route_types: '偏好路线',
  dietary_restrictions: '饮食禁忌',
  hotel_avoid: '住宿避让',
  max_daily_driving_hours: '日驾上限',
  nationality: '国籍',
};

function displayValue(raw: unknown): string {
  if (typeof raw === 'string') {
    const t = raw.trim();
    const up = t.toUpperCase();
    return VALUE_ZH[up] ?? t;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (Array.isArray(raw)) {
    return raw
      .map((x) => {
        const s = String(x).trim();
        return VALUE_ZH[s.toUpperCase()] ?? s;
      })
      .filter(Boolean)
      .join('、');
  }
  return '';
}

function displayKey(key: string): string {
  if (/[\u4e00-\u9fff]/.test(key)) return key;
  return KEY_ZH[key] ?? key;
}

function formatSnippet(obj: TravelerMemoryObjectV1): string {
  const label = displayKey(obj.key);
  const v = obj.value;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    const shown = displayValue(v);
    return shown ? `${label}：${shown}` : label;
  }
  if (Array.isArray(v)) {
    const joined = displayValue(v);
    return joined ? `${label}：${joined}` : label;
  }
  if (obj.semantic_type === 'TRADEOFF' && v && typeof v === 'object') {
    return `${label}`;
  }
  if (obj.semantic_type === 'CONSTRAINT' || obj.semantic_type === 'AVOIDANCE') {
    const shown = displayValue(v);
    return shown ? `${label}：${shown}` : label;
  }
  return label;
}

/** 同语义字段去重（pace ≡ 行程节奏） */
function facetId(obj: TravelerMemoryObjectV1): string {
  const k = obj.key.trim().toLowerCase();
  const aliases: Record<string, string> = {
    pace: 'pace',
    行程节奏: 'pace',
    travel_philosophy: 'travel_philosophy',
    旅行风格: 'travel_philosophy',
    risk_tolerance: 'risk_tolerance',
    风险偏好: 'risk_tolerance',
    preferred_route_types: 'preferred_route_types',
    偏好路线: 'preferred_route_types',
    dietary_restrictions: 'dietary_restrictions',
    饮食禁忌: 'dietary_restrictions',
    hotel_avoid: 'hotel_avoid',
    住宿避让: 'hotel_avoid',
    max_daily_driving_hours: 'max_daily_driving_hours',
    日驾上限: 'max_daily_driving_hours',
    nationality: 'nationality',
    国籍: 'nationality',
  };
  return `${obj.domain}:${aliases[k] ?? aliases[obj.key] ?? k}`;
}

/**
 * 从 L1 Traveler Memories 生成「Nara 对我的了解」摘要卡。
 */
export function buildTravelerHabitSummary(
  userId: string,
  memories: TravelerMemoryObjectV1[],
): TravelerHabitSummaryV1 {
  const visible = memories.filter(
    (m) =>
      m.visibility === 'USER_VISIBLE' &&
      (m.status === 'STABLE' || m.status === 'CONFIRMED') &&
      m.key !== TRIP_MEMORY_MODE_KEY &&
      m.scope !== 'TRIP',
  );

  // Contract/ledger 优先；同 facet 的 OS 中文投影不重复展示
  const picked: TravelerMemoryObjectV1[] = [];
  const seenFacet = new Set<string>();
  for (const m of visible) {
    const id = facetId(m);
    if (seenFacet.has(id)) continue;
    seenFacet.add(id);
    picked.push(m);
  }

  const byDomain = new Map<TravelerMemoryDomain, string[]>();
  for (const m of picked) {
    const list = byDomain.get(m.domain) ?? [];
    list.push(formatSnippet(m));
    byDomain.set(m.domain, list);
  }

  const cards: TravelerHabitCardV1[] = [];
  for (const domain of DOMAIN_ORDER) {
    const snippets = byDomain.get(domain);
    if (snippets?.length) {
      cards.push({ domain, snippets: snippets.slice(0, 6) });
    }
  }

  const flat = cards.flatMap((c) => c.snippets).slice(0, 8);
  return {
    schemaId: 'tripnara.traveler_habit_summary@v1',
    version: 1,
    subject_id: userId,
    cards,
    appliedSummary: flat.length > 0 ? flat.join(' · ') : '暂无足够的长期旅行偏好',
    memoryCount: picked.length,
  };
}

export function isTripMemoryModeObject(obj: TravelerMemoryObjectV1): boolean {
  return obj.key === TRIP_MEMORY_MODE_KEY;
}

export function readTripMemoryMode(
  tripMemories: TravelerMemoryObjectV1[],
): TripMemoryModeV1 | null {
  for (let i = tripMemories.length - 1; i >= 0; i--) {
    const m = tripMemories[i];
    if (m.key !== TRIP_MEMORY_MODE_KEY) continue;
    if (m.value === 'HABIT_INHERIT' || m.value === 'TRIP_DIFFERENT') {
      return m.value;
    }
  }
  return null;
}

/** 可清除的 trip 覆盖（不含 mode 标记时可选择保留） */
export function selectClearableTripOverrides(
  tripMemories: TravelerMemoryObjectV1[],
  opts?: { includeModeMarker?: boolean },
): TravelerMemoryObjectV1[] {
  return tripMemories.filter((m) => {
    if (m.status === 'REVOKED' || m.status === 'DECAYED') return false;
    if (m.key === TRIP_MEMORY_MODE_KEY) {
      return opts?.includeModeMarker === true;
    }
    return true;
  });
}
