/**
 * Registered Page AI Contracts (ADR-010).
 * Live: DECISION_SPACE + ACTIVITY_EDITOR.
 * Stubs: day editor / planning overview / execution — do not wire UI evaluate yet.
 */

import type { PageAIContract, PageId } from './page-insight.types';

/** Decision Space Vertical Slice. */
export const DECISION_SPACE_PAGE_AI_CONTRACT: PageAIContract = {
  pageId: 'DECISION_SPACE',
  pageContractVersion: 'decision_space@1.4',
  userGoal: '理解待决问题、比较方案影响，并确认决策',
  relevantContext: {
    projections: [
      'TRIP_SNAPSHOT',
      'ROUTE_SUMMARY',
      'ROAD_EXPOSURE',
      'WEATHER_RISK',
      'VEHICLE_BOOKING',
      'MEMBER_DRIVER_PROFILE',
      'TEAM_CAPACITY',
      'BUDGET',
      'EXISTING_INSURANCE',
      'decisionWorkspace',
      'constraintAssessments',
      'causalChains',
    ],
    entityTypes: ['DECISION_PROBLEM', 'DECISION_OPTION', 'PLAN_PROPOSAL'],
    includeDraftDelta: false,
    includeDecisionEvidence: true,
  },
  decisionContextRequirements: {
    VEHICLE_ROAD_FIT: {
      projections: [
        'TRIP_SNAPSHOT',
        'ROUTE_SUMMARY',
        'ROAD_EXPOSURE',
        'WEATHER_RISK',
        'TEAM_CAPACITY',
        'MEMBER_DRIVER_PROFILE',
        'BUDGET',
      ],
      hardRequired: ['ROUTE_SUMMARY', 'ROAD_EXPOSURE'],
      ragPolicy: 'EXPLANATORY_CLAUSES_ONLY',
    },
    RENTAL_INSURANCE: {
      projections: [
        'TRIP_SNAPSHOT',
        'ROUTE_SUMMARY',
        'ROAD_EXPOSURE',
        'WEATHER_RISK',
        'VEHICLE_BOOKING',
        'MEMBER_DRIVER_PROFILE',
        'BUDGET',
        'EXISTING_INSURANCE',
      ],
      hardRequired: ['ROUTE_SUMMARY', 'VEHICLE_BOOKING'],
      ragPolicy: 'EXPLANATORY_CLAUSES_ONLY',
    },
  },
  contextHashFields: [
    'pageId',
    'lifecycle',
    'selectedEntityRefs',
    'relevantTripProjectionVersion',
    'relevantConstraintVersion',
    'relevantDecisionWorkspaceVersion',
    'activeTab',
  ],
  focusDimensions: ['TIME', 'SAFETY', 'FATIGUE', 'COST', 'EXPERIENCE', 'TEAM', 'BOOKING'],
  supportedInsightTypes: [
    'EXPLANATION',
    'DECISION_REQUIRED',
    'OPTIMIZATION',
    'DATA_UNCERTAINTY',
  ],
  allowedActionTypes: [
    'OPEN_DECISION',
    'COMPARE_OPTIONS',
    'PREVIEW_PLAN_CHANGE',
    'CONFIRM_DECISION',
  ],
  proactivePolicy: {
    attentionTriggers: [
      'MATERIAL_OPTION_DIVERGENCE',
      'STALE_EVIDENCE',
      'EXPLICIT_ASK',
      'CONTEXT_MISSING',
    ],
    interventionTriggers: ['BLOCKING_DECISION', 'SAFETY_RELATED_DECISION'],
    maxVisibleInsights: 1,
    cooldownMinutes: 30,
  },
  presentation: {
    defaultSurface: 'RIGHT_RAIL',
  },
};

/** Activity Editor — object-level Copilot (live Vertical Slice). */
export const ACTIVITY_EDITOR_PAGE_AI_CONTRACT: PageAIContract = {
  pageId: 'ACTIVITY_EDITOR',
  pageContractVersion: 'activity_editor@1.0',
  userGoal: '判断加入或修改该活动对当日行程的影响，并打开已有预览',
  relevantContext: {
    projections: [
      'TRIP_SNAPSHOT',
      'DAY_PLAN',
      'ACTIVITY',
      'TIME_WINDOWS',
      'TRANSPORT_LEGS',
      'MEMBER_CONSTRAINTS',
      'BUDGET',
      'BOOKING_STATUS',
      'draftDelta',
      'planProposalValidation',
    ],
    entityTypes: ['POI', 'ACTIVITY_PRODUCT', 'DAY', 'ITINERARY_ITEM'],
    includeDraftDelta: true,
    includeDecisionEvidence: false,
  },
  contextHashFields: [
    'pageId',
    'pageMode',
    'insightScope',
    'lifecycle',
    'selectedEntityRefs',
    'selectedDayId',
    'relevantTripProjectionVersion',
    'relevantConstraintVersion',
    'relevantWorldStateVersion',
    'draftRevision',
  ],
  focusDimensions: ['TIME', 'FATIGUE', 'ROUTE', 'BOOKING', 'EXPERIENCE', 'COST'],
  supportedInsightTypes: [
    'EXPLANATION',
    'OPTIMIZATION',
    'DECISION_REQUIRED',
    'DATA_UNCERTAINTY',
  ],
  allowedActionTypes: [
    'PREVIEW_ADD_ACTIVITY',
    'COMPARE_TARGET_DAYS',
    'REPLACE_ACTIVITY',
    'ADJUST_DURATION',
    'OPEN_DECISION',
  ],
  proactivePolicy: {
    attentionTriggers: ['MATERIAL_SCHEDULE_IMPACT', 'TIME_WINDOW_RISK', 'EXPLICIT_ASK'],
    interventionTriggers: ['INFEASIBILITY', 'ACCESS_BLOCKED', 'HARD_TIME_CONFLICT'],
    maxVisibleInsights: 1,
    cooldownMinutes: 10,
  },
  presentation: {
    defaultSurface: 'INLINE',
  },
};

/** Day-level Copilot — live Vertical Slice. */
export const ITINERARY_DAY_EDITOR_PAGE_AI_CONTRACT: PageAIContract = {
  pageId: 'ITINERARY_DAY_EDITOR',
  pageContractVersion: 'itinerary_day_editor@1.1',
  userGoal: '判断当天是否完整、合理、可执行，并给出唯一最值得的下一步',
  relevantContext: {
    projections: [
      'DAY_PLAN',
      'TIME_WINDOWS',
      'DAY_GAPS',
      'BOOKING_STATUS',
      'LODGING_ANCHOR',
      'TRANSPORT_LEGS',
      'LOAD_ASSESSMENT',
      'draftDelta',
      'constraintAssessments',
      'feasibilityValidateScope',
      'planProposalValidation',
    ],
    entityTypes: ['DAY', 'ITINERARY_ITEM', 'POI'],
    includeDraftDelta: true,
  },
  contextHashFields: [
    'pageId',
    'pageMode',
    'insightScope',
    'lifecycle',
    'selectedEntityRefs',
    'selectedDayId',
    'relevantTripProjectionVersion',
    'relevantConstraintVersion',
    'relevantWorldStateVersion',
    'draftRevision',
  ],
  focusDimensions: ['TIME', 'FATIGUE', 'ROUTE', 'BOOKING', 'EXPERIENCE'],
  supportedInsightTypes: [
    'EXPLANATION',
    'OPTIMIZATION',
    'DECISION_REQUIRED',
    'EXECUTION_RISK',
  ],
  allowedActionTypes: [
    'PREVIEW_REORDER',
    'MOVE_TO_ANOTHER_DAY',
    'ADD_BUFFER',
    'RUN_WHAT_IF',
    'OPEN_CONFLICT',
    'FILL_GAP',
    'GENERATE_DAY_DRAFT',
    'CONFIRM_BOOKING',
    'OPEN_LODGING',
  ],
  proactivePolicy: {
    attentionTriggers: [
      'DAY_INCOMPLETE',
      'DAY_OPTIMIZABLE',
      'DAY_TIGHT',
      'DAY_SOFT_CONFLICT',
      'EXPLICIT_ASK',
    ],
    interventionTriggers: ['UNRESOLVED_CONFLICT', 'INFEASIBILITY', 'DAY_BLOCKED'],
    maxVisibleInsights: 1,
    cooldownMinutes: 15,
  },
  presentation: {
    defaultSurface: 'RIGHT_RAIL',
  },
};

/** @deprecated alias stub — not live; use ITINERARY_DAY_EDITOR. */
export const ITINERARY_EDITOR_PAGE_AI_CONTRACT_STUB: PageAIContract = {
  pageId: 'ITINERARY_EDITOR',
  pageContractVersion: 'itinerary_editor@0-stub',
  userGoal: '检查当日安排是否合理，并用已验证方案修复',
  relevantContext: {
    projections: ['DAY_PLAN', 'constraintAssessments', 'draftDelta'],
    entityTypes: ['DAY', 'ITINERARY_ITEM', 'POI'],
    includeDraftDelta: true,
  },
  contextHashFields: [
    'pageId',
    'lifecycle',
    'selectedEntityRefs',
    'selectedDayId',
    'relevantTripProjectionVersion',
    'draftRevision',
  ],
  focusDimensions: ['TIME', 'FATIGUE', 'ROUTE'],
  supportedInsightTypes: ['EXPLANATION', 'OPTIMIZATION', 'DECISION_REQUIRED'],
  allowedActionTypes: ['PREVIEW_REORDER', 'ADD_BUFFER', 'OPEN_CONFLICT'],
  proactivePolicy: {
    attentionTriggers: ['DAY_SOFT_CONFLICT'],
    interventionTriggers: ['UNRESOLVED_CONFLICT'],
    maxVisibleInsights: 1,
    cooldownMinutes: 15,
  },
  presentation: {
    defaultSurface: 'RIGHT_RAIL',
  },
};

/** Trip-level Copilot — live; navigation/ordering only, no SELECT_OPTION. */
export const PLANNING_OVERVIEW_PAGE_AI_CONTRACT: PageAIContract = {
  pageId: 'PLANNING_OVERVIEW',
  pageContractVersion: 'planning_overview@1.0',
  userGoal: '总结行程完成度，指出应先处理的一两件事',
  relevantContext: {
    projections: [
      'READINESS',
      'ROUTE_STATUS',
      'PLANNING_DIMENSIONS',
      'DECISION_QUEUE',
      'BLOCKING_ISSUES',
      'FEASIBILITY_FAST',
    ],
    entityTypes: ['TRIP', 'DECISION_PROBLEM', 'DAY'],
    includeDraftDelta: false,
    includeDecisionEvidence: true,
  },
  contextHashFields: [
    'pageId',
    'pageMode',
    'insightScope',
    'lifecycle',
    'relevantTripProjectionVersion',
    'relevantDecisionWorkspaceVersion',
    'relevantWorldStateVersion',
  ],
  focusDimensions: ['TIME', 'SAFETY', 'BOOKING', 'TEAM', 'COST', 'ROUTE'],
  supportedInsightTypes: ['EXPLANATION', 'READINESS_GAP', 'DECISION_REQUIRED'],
  allowedActionTypes: [
    'OPEN_DECISION_CASE',
    'OPEN_DAY_EDITOR',
    'OPEN_READINESS_DETAIL',
    'START_SEQUENTIAL_PROCESSING',
  ],
  proactivePolicy: {
    attentionTriggers: ['MUST_CONFIRM_PENDING', 'IMPORTANT_CHOICE_PENDING', 'EXPLICIT_ASK'],
    interventionTriggers: ['BLOCKING_READINESS'],
    maxVisibleInsights: 1,
    cooldownMinutes: 30,
  },
  presentation: {
    defaultSurface: 'BANNER',
  },
};

/** Execution Copilot — live; highest freshness / safety bar. */
export const EXECUTION_HOME_PAGE_AI_CONTRACT: PageAIContract = {
  pageId: 'EXECUTION_HOME',
  pageContractVersion: 'execution_home@1.0',
  userGoal: '判断当前是否还能按计划执行，以及最晚何时必须行动',
  relevantContext: {
    projections: [
      'CURRENT_LOCATION',
      'EXECUTION_PROGRESS',
      'NEXT_ACTIVITY',
      'WORLD_STATE',
      'MEMBER_STATE',
      'EXECUTION_RISK',
      'EXECUTION_ADVISORY',
      'DECISION_QUEUE',
    ],
    entityTypes: ['ITINERARY_ITEM', 'DAY', 'MEMBER', 'DECISION_PROBLEM'],
    includeDraftDelta: false,
    includeDecisionEvidence: true,
  },
  contextHashFields: [
    'pageId',
    'pageMode',
    'insightScope',
    'lifecycle',
    'selectedEntityRefs',
    'relevantTripProjectionVersion',
    'relevantWorldStateVersion',
  ],
  focusDimensions: ['SAFETY', 'TIME', 'ROUTE', 'FATIGUE', 'BOOKING'],
  supportedInsightTypes: ['EXECUTION_RISK', 'EXPLANATION', 'DECISION_REQUIRED'],
  allowedActionTypes: [
    'ACKNOWLEDGE_RISK',
    'OPEN_DECISION',
    'PREVIEW_PLAN_CHANGE',
  ],
  proactivePolicy: {
    attentionTriggers: ['SCHEDULE_AT_RISK', 'DELAY_THRESHOLD', 'EXPLICIT_ASK'],
    interventionTriggers: ['SAFETY_RISK', 'MUST_ADJUST', 'MISS_WINDOW'],
    maxVisibleInsights: 1,
    cooldownMinutes: 5,
  },
  presentation: {
    defaultSurface: 'BANNER',
  },
};

const LIVE_REGISTRY: Partial<Record<PageId, PageAIContract>> = {
  DECISION_SPACE: DECISION_SPACE_PAGE_AI_CONTRACT,
  ACTIVITY_EDITOR: ACTIVITY_EDITOR_PAGE_AI_CONTRACT,
  ITINERARY_DAY_EDITOR: ITINERARY_DAY_EDITOR_PAGE_AI_CONTRACT,
  PLANNING_OVERVIEW: PLANNING_OVERVIEW_PAGE_AI_CONTRACT,
  EXECUTION_HOME: EXECUTION_HOME_PAGE_AI_CONTRACT,
};

const STUB_REGISTRY: Partial<Record<PageId, PageAIContract>> = {
  ITINERARY_EDITOR: ITINERARY_EDITOR_PAGE_AI_CONTRACT_STUB,
};

export function getPageAIContract(pageId: PageId): PageAIContract | undefined {
  return LIVE_REGISTRY[pageId];
}

export function getPageAIContractOrStub(pageId: PageId): PageAIContract | undefined {
  return LIVE_REGISTRY[pageId] ?? STUB_REGISTRY[pageId];
}

export function listRegisteredPageAIContracts(): PageAIContract[] {
  return Object.values(LIVE_REGISTRY).filter(Boolean) as PageAIContract[];
}

export function isPageAIContractLive(pageId: PageId): boolean {
  return pageId in LIVE_REGISTRY;
}
