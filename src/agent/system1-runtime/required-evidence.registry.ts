/**
 * System1 Context Requirement Gate。
 *
 * 主序（防 Sufficiency 全局阻塞）：
 *   TaskFrame → Candidate Claim Types → RequiredEvidence → Sufficiency
 *
 * Family 仍是兼容层；软 Claim（推荐/状态）不得继承安全族的天气/路况合同。
 */

import type {
  RequiredEvidenceSpec,
  System1ClaimType,
  System1RuntimeFamily,
} from './system1-runtime.types';

const LIVE_FEASIBILITY: RequiredEvidenceSpec[] = [
  {
    key: 'trip.current_location',
    required: true,
    importance: 'IMPORTANT',
    acceptableSources: ['TRIP_STATE', 'USER_INPUT', 'TOOL'],
    onMissing: 'ANSWER_CONDITIONALLY',
  },
  {
    key: 'route.status',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['WORLD_STATE', 'TOOL', 'EXTERNAL_API', 'ONTOLOGY'],
    freshnessRequirement: { requireLive: true },
    onMissing: 'FETCH',
  },
  {
    key: 'weather.wind',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['WORLD_STATE', 'TOOL', 'EXTERNAL_API'],
    freshnessRequirement: { requireLive: true },
    onMissing: 'FETCH',
  },
  {
    key: 'vehicle.profile',
    required: true,
    importance: 'IMPORTANT',
    acceptableSources: ['TRIP_STATE', 'USER_INPUT'],
    onMissing: 'ANSWER_CONDITIONALLY',
  },
];

const TRIP_QUERY_LODGING: RequiredEvidenceSpec[] = [
  {
    key: 'trip.day_list',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TRIP_STATE'],
    onMissing: 'ASK_USER',
  },
  {
    key: 'trip.accommodation_anchors',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TRIP_STATE'],
    onMissing: 'FETCH',
  },
];

const TRIP_QUERY_TODAY: RequiredEvidenceSpec[] = [
  {
    key: 'trip.current_day',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TRIP_STATE'],
    onMissing: 'FETCH',
  },
  {
    key: 'trip.timeline',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TRIP_STATE'],
    onMissing: 'FETCH',
  },
  {
    key: 'trip.current_position',
    required: false,
    importance: 'OPTIONAL',
    acceptableSources: ['TRIP_STATE', 'TOOL'],
    onMissing: 'ANSWER_CONDITIONALLY',
  },
];

const TRIP_QUERY_NEXT: RequiredEvidenceSpec[] = [
  {
    key: 'trip.current_day',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TRIP_STATE'],
    onMissing: 'FETCH',
  },
  {
    key: 'trip.timeline',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TRIP_STATE'],
    onMissing: 'FETCH',
  },
  {
    key: 'trip.next_activity',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TRIP_STATE'],
    onMissing: 'ANSWER_CONDITIONALLY',
  },
];

const TRIP_QUERY_DAY: RequiredEvidenceSpec[] = TRIP_QUERY_TODAY.map((s) => ({
  ...s,
  acceptableSources: [...s.acceptableSources],
}));

const KNOWLEDGE_QA: RequiredEvidenceSpec[] = [
  {
    key: 'knowledge.hit',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['KNOWLEDGE', 'TOOL'],
    onMissing: 'FETCH',
  },
];

const DECISION_SUPPORT: RequiredEvidenceSpec[] = [
  {
    key: 'decision.options',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TOOL', 'TRIP_STATE'],
    onMissing: 'FETCH',
  },
  {
    key: 'trip.constraints',
    required: true,
    importance: 'IMPORTANT',
    acceptableSources: ['TRIP_STATE', 'USER_INPUT'],
    onMissing: 'ANSWER_CONDITIONALLY',
  },
];

/** 天气/路况轻咨询：实况天气 CRITICAL；路况 IMPORTANT（缺路况可有条件答） */
const WEATHER_ROAD_QA: RequiredEvidenceSpec[] = [
  {
    key: 'weather.wind',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['WORLD_STATE', 'TOOL', 'EXTERNAL_API'],
    freshnessRequirement: { requireLive: true },
    onMissing: 'FETCH',
  },
  {
    key: 'route.status',
    required: false,
    importance: 'IMPORTANT',
    acceptableSources: ['WORLD_STATE', 'TOOL', 'EXTERNAL_API', 'ONTOLOGY'],
    freshnessRequirement: { requireLive: true },
    onMissing: 'ANSWER_CONDITIONALLY',
  },
];

/** 酒店/租车/餐饮/航班/社区库存咨询：检索命中 CRITICAL */
const INVENTORY_CONSULT: RequiredEvidenceSpec[] = [
  {
    key: 'inventory.hit',
    required: true,
    importance: 'CRITICAL',
    acceptableSources: ['TOOL', 'EXTERNAL_API', 'KNOWLEDGE'],
    freshnessRequirement: { requireLive: true },
    onMissing: 'FETCH',
  },
];

const FAMILY_SPECS: Record<System1RuntimeFamily, RequiredEvidenceSpec[]> = {
  LIVE_FEASIBILITY,
  TRIP_QUERY_LODGING,
  TRIP_QUERY_TODAY,
  TRIP_QUERY_NEXT,
  TRIP_QUERY_DAY,
  KNOWLEDGE_QA,
  DECISION_SUPPORT,
  WEATHER_ROAD_QA,
  INVENTORY_CONSULT,
};

/** Claim Type → 取证合同（旅行领域最小集；未列出的类型回退 Family） */
const CLAIM_SPECS: Partial<Record<System1ClaimType, RequiredEvidenceSpec[]>> = {
  FEASIBILITY: [
    LIVE_FEASIBILITY.find((s) => s.key === 'route.status')!,
    LIVE_FEASIBILITY.find((s) => s.key === 'weather.wind')!,
    LIVE_FEASIBILITY.find((s) => s.key === 'vehicle.profile')!,
  ],
  RISK_ASSESSMENT: [
    LIVE_FEASIBILITY.find((s) => s.key === 'weather.wind')!,
    LIVE_FEASIBILITY.find((s) => s.key === 'route.status')!,
  ],
  ACCESSIBILITY: [LIVE_FEASIBILITY.find((s) => s.key === 'route.status')!],
  WORLD_FACT: [
    {
      key: 'weather.wind',
      required: true,
      importance: 'CRITICAL',
      acceptableSources: ['WORLD_STATE', 'TOOL', 'EXTERNAL_API'],
      freshnessRequirement: { requireLive: true },
      onMissing: 'FETCH',
    },
  ],
  STATE_FACT: [],
  RECOMMENDATION: [
    {
      key: 'knowledge.hit',
      required: true,
      importance: 'CRITICAL',
      acceptableSources: ['KNOWLEDGE', 'TOOL'],
      onMissing: 'FETCH',
    },
  ],
  BOOKING_FACT: [
    INVENTORY_CONSULT.find((s) => s.key === 'inventory.hit')!,
  ],
  CONSTRAINT: [
    DECISION_SUPPORT.find((s) => s.key === 'trip.constraints')!,
  ],
  TIME_ESTIMATE: [
    {
      key: 'route.eta',
      required: false,
      importance: 'IMPORTANT',
      acceptableSources: ['WORLD_STATE', 'TOOL', 'EXTERNAL_API'],
      freshnessRequirement: { requireLive: true },
      onMissing: 'ANSWER_CONDITIONALLY',
    },
  ],
};

const SAFETY_CLAIM_TYPES = new Set<System1ClaimType>([
  'FEASIBILITY',
  'RISK_ASSESSMENT',
  'ACCESSIBILITY',
]);

const SAFETY_FAMILIES = new Set<System1RuntimeFamily>([
  'LIVE_FEASIBILITY',
  'WEATHER_ROAD_QA',
]);

function cloneSpecs(specs: RequiredEvidenceSpec[]): RequiredEvidenceSpec[] {
  return specs.map((s) => ({ ...s, acceptableSources: [...s.acceptableSources] }));
}

function mergeSpecsByKey(rows: RequiredEvidenceSpec[]): RequiredEvidenceSpec[] {
  const byKey = new Map<string, RequiredEvidenceSpec>();
  for (const row of rows) {
    const prev = byKey.get(row.key);
    if (!prev) {
      byKey.set(row.key, { ...row, acceptableSources: [...row.acceptableSources] });
      continue;
    }
    const importanceRank = { CRITICAL: 0, IMPORTANT: 1, OPTIONAL: 2 } as const;
    const keep =
      importanceRank[row.importance] < importanceRank[prev.importance] ? row : prev;
    const other = keep === row ? prev : row;
    byKey.set(row.key, {
      ...keep,
      required: keep.required || other.required,
      acceptableSources: [
        ...new Set([...keep.acceptableSources, ...other.acceptableSources]),
      ],
      freshnessRequirement: keep.freshnessRequirement ?? other.freshnessRequirement,
      onMissing:
        keep.onMissing === 'ESCALATE' || other.onMissing === 'ESCALATE'
          ? 'ESCALATE'
          : keep.onMissing === 'FETCH' || other.onMissing === 'FETCH'
            ? 'FETCH'
            : keep.onMissing === 'ASK_USER' || other.onMissing === 'ASK_USER'
              ? 'ASK_USER'
              : keep.onMissing,
    });
  }
  return [...byKey.values()];
}

export function getRequiredEvidenceSpec(
  family: System1RuntimeFamily | null | undefined,
): RequiredEvidenceSpec[] {
  if (!family) return [];
  return cloneSpecs(FAMILY_SPECS[family]);
}

export function getRequiredEvidenceForClaimTypes(
  claimTypes: System1ClaimType[] | null | undefined,
): RequiredEvidenceSpec[] {
  if (!claimTypes?.length) return [];
  const rows: RequiredEvidenceSpec[] = [];
  for (const type of claimTypes) {
    const specs = CLAIM_SPECS[type];
    if (specs?.length) rows.push(...specs);
  }
  return mergeSpecsByKey(rows);
}

export function hasSafetyCandidateClaims(
  claimTypes: System1ClaimType[] | null | undefined,
): boolean {
  return (claimTypes ?? []).some((t) => SAFETY_CLAIM_TYPES.has(t));
}

/**
 * Claim-driven 取证解析：软 Claim 不继承安全 Family 的天气/路况。
 * 有安全 Claim 时优先 Family（LIVE / WEATHER）完整合同。
 */
export function resolveSystem1RequiredEvidence(input: {
  family?: System1RuntimeFamily | null;
  candidateClaimTypes?: System1ClaimType[] | null;
}): RequiredEvidenceSpec[] {
  const familySpecs = getRequiredEvidenceSpec(input.family);
  const claimTypes = input.candidateClaimTypes ?? [];
  const claimSpecs = getRequiredEvidenceForClaimTypes(claimTypes);
  const safetyClaims = hasSafetyCandidateClaims(claimTypes);

  if (!claimTypes.length) return familySpecs;

  if (!safetyClaims) {
    // 软 Claim：有独立合同则用之（推荐不得继承天气/路况）
    if (claimSpecs.length) return claimSpecs;
    if (input.family && !SAFETY_FAMILIES.has(input.family)) return familySpecs;
    // 仅当明确是推荐/库存时，才从误路由的安全 Family 剥离
    if (claimTypes.includes('RECOMMENDATION')) {
      return getRequiredEvidenceForClaimTypes(['RECOMMENDATION']);
    }
    if (claimTypes.includes('BOOKING_FACT')) {
      return getRequiredEvidenceForClaimTypes(['BOOKING_FACT']);
    }
    return familySpecs;
  }

  if (input.family && SAFETY_FAMILIES.has(input.family) && familySpecs.length) {
    return familySpecs;
  }
  if (claimSpecs.length) return mergeSpecsByKey([...claimSpecs, ...familySpecs]);
  return familySpecs;
}
