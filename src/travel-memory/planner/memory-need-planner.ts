/**
 * Memory Need Planner — 按任务规划需要哪类记忆，再路由到 Structured / Episode / Semantic。
 * 不取代 CRE 的 ASK 权威；CRE 管「缺什么事实」，本 Planner 管「需要哪层记忆视图」。
 */

import type { MemoryNeed, MemoryNeedPlan, MemoryNeedType } from '../types/memory-need.types';
import type { TmrLayer } from '../types/memory-layers.types';
import type { MemoryContractV1 } from '../types/memory-contract.types';

export type MemoryNeedPlannerInput = {
  task: string;
  tripId?: string | null;
  day?: number | null;
  /** 可选：CRE operation 字符串，用于增强路由 */
  creOperation?: string | null;
  messageHint?: string | null;
};

type TaskRule = {
  match: RegExp;
  needs: Array<{
    type: MemoryNeedType;
    required: boolean;
    route: MemoryNeed['route'];
    layers: TmrLayer[];
    hint?: string;
  }>;
  reason: string;
};

const TASK_RULES: TaskRule[] = [
  {
    match:
      /GLACIER|冰川|ACTIVITY_SELECTION|DECIDE_ACTIVITY|SHOULD_WE_DO_/i,
    needs: [
      {
        type: 'WORKING_CONTEXT',
        required: true,
        route: 'WORKING',
        layers: ['TMR_L0_WORKING'],
        hint: 'current day / schedule focus — not full history',
      },
      {
        type: 'TRIP_MEMBER_CONSTRAINT',
        required: true,
        route: 'STRUCTURED_TRIP',
        layers: ['TMR_L2_TRIP', 'TMR_L0_WORKING'],
      },
      {
        type: 'PACE_PREFERENCE',
        required: true,
        route: 'STRUCTURED_USER',
        layers: ['TMR_L1_USER_STRUCTURED', 'TMR_L2_TRIP'],
      },
      {
        type: 'ACTIVITY_RISK_PREFERENCE',
        required: false,
        route: 'STRUCTURED_USER',
        layers: ['TMR_L1_USER_STRUCTURED'],
      },
      {
        type: 'PAST_SIMILAR_DECISION',
        required: false,
        route: 'EPISODE',
        layers: ['TMR_L3_EPISODIC'],
        hint: 'similar activity duration / risk overrides; max 3',
      },
      // SEMANTIC 默认不进合同 allow，避免每轮向量灌入
    ],
    reason: 'activity suitability: trip constraints + pace + similar episodes (not all history)',
  },
  {
    match: /ROUTE|南岸|环岛|ITINERARY|PLAN/i,
    needs: [
      {
        type: 'TRIP_INTENT',
        required: true,
        route: 'STRUCTURED_TRIP',
        layers: ['TMR_L2_TRIP'],
      },
      {
        type: 'PACE_PREFERENCE',
        required: true,
        route: 'STRUCTURED_USER',
        layers: ['TMR_L1_USER_STRUCTURED', 'TMR_L2_TRIP'],
      },
      {
        type: 'PAST_SIMILAR_DECISION',
        required: false,
        route: 'EPISODE',
        layers: ['TMR_L3_EPISODIC'],
      },
    ],
    reason: 'route-level planning needs trip intent and pace hierarchy',
  },
  {
    match: /HOTEL|住宿|换酒店|ACCOMMODATION/i,
    needs: [
      {
        type: 'ACCOMMODATION_MOVEMENT',
        required: true,
        route: 'STRUCTURED_USER',
        layers: ['TMR_L1_USER_STRUCTURED'],
      },
      {
        type: 'TRIP_MEMBER_CONSTRAINT',
        required: false,
        route: 'STRUCTURED_TRIP',
        layers: ['TMR_L2_TRIP'],
      },
    ],
    reason: 'accommodation movement is a structured preference, not semantic guess',
  },
];

const DEFAULT_NEEDS: MemoryNeedPlan['memoryNeeds'] = [
  {
    type: 'WORKING_CONTEXT',
    required: true,
    route: 'WORKING',
    layers: ['TMR_L0_WORKING'],
  },
  {
    type: 'PACE_PREFERENCE',
    required: false,
    route: 'STRUCTURED_USER',
    layers: ['TMR_L1_USER_STRUCTURED'],
  },
  {
    type: 'TRIP_INTENT',
    required: false,
    route: 'STRUCTURED_TRIP',
    layers: ['TMR_L2_TRIP'],
  },
];

const PROFILE_FIELD_BY_NEED: Partial<
  Record<MemoryNeedType, MemoryContractV1['includeUserProfileFields'][number]>
> = {
  PACE_PREFERENCE: 'pace',
  RISK_TOLERANCE: 'riskTolerance',
  ACCOMMODATION_MOVEMENT: 'accommodationMovement',
  ACTIVITY_RISK_PREFERENCE: 'preferredExperience',
};

/**
 * Need Plan → Memory Contract（硬 deny 全量历史 / 全量 Episode）。
 */
export function toMemoryContract(
  task: string,
  needs: MemoryNeed[],
  reason: string,
): MemoryContractV1 {
  const allow = needs.map((n) => n.type);
  const includeUserProfileFields = allow
    .map((t) => PROFILE_FIELD_BY_NEED[t])
    .filter((x): x is MemoryContractV1['includeUserProfileFields'][number] => !!x);

  const wantsEpisodes = allow.includes('PAST_SIMILAR_DECISION');
  const wantsTrip =
    allow.includes('TRIP_MEMBER_CONSTRAINT') ||
    allow.includes('TRIP_INTENT') ||
    allow.includes('NIGHT_DRIVING_PREFERENCE');
  const wantsSemantic = allow.includes('SEMANTIC_EVIDENCE');
  const wantsWorking = allow.includes('WORKING_CONTEXT');

  return {
    schemaId: 'tripnara.memory_contract@v1',
    version: 1,
    task,
    allow,
    deny: ['ALL_USER_HISTORY', 'ALL_EPISODES', 'FULL_SEMANTIC_DUMP', 'PROCEDURAL_SKILLS'],
    maxEpisodes: wantsEpisodes ? 3 : 0,
    includeUserProfileFields,
    includeTripMemory: wantsTrip,
    includeSemantic: wantsSemantic,
    // L0 working 极轻；仍须在 allow 中显式出现，避免“每轮自动带全量”
    includeWorking: wantsWorking,
    needs,
    reason,
  };
}

export function planMemoryNeeds(input: MemoryNeedPlannerInput): MemoryNeedPlan {
  const haystack = [input.task, input.creOperation ?? '', input.messageHint ?? '']
    .filter(Boolean)
    .join(' ');

  for (const rule of TASK_RULES) {
    if (rule.match.test(haystack)) {
      return {
        task: input.task,
        tripId: input.tripId ?? null,
        day: input.day ?? null,
        memoryNeeds: rule.needs,
        contract: toMemoryContract(input.task, rule.needs, rule.reason),
        creOperation: input.creOperation ?? null,
        reason: rule.reason,
      };
    }
  }

  return {
    task: input.task,
    tripId: input.tripId ?? null,
    day: input.day ?? null,
    memoryNeeds: DEFAULT_NEEDS,
    contract: toMemoryContract(input.task, DEFAULT_NEEDS, 'default_lightweight_memory_needs'),
    creOperation: input.creOperation ?? null,
    reason: 'default_lightweight_memory_needs',
  };
}
