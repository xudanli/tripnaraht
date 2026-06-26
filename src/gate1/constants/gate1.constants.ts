export const GATE1_COHORTS = ['PLANNING', 'NEAR_DEPARTURE', 'IN_TRIP_RECENT'] as const;
export type Gate1Cohort = (typeof GATE1_COHORTS)[number];

export const GATE1_PROJECT_STATUSES = [
  'DRAFT',
  'BASELINE_READY',
  'COLLECTING',
  'ANALYZING',
  'ADVISOR_DECIDING',
  'READY',
  'ACTIVE',
  'COMPLETED',
  'WITHDRAWN',
] as const;
export type Gate1ProjectStatus = (typeof GATE1_PROJECT_STATUSES)[number];

export const GATE1_PARTICIPANT_STATUSES = [
  'INVITED',
  'OPENED',
  'JOINED',
  'CONSENTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'DECLINED',
  'WITHDRAWN',
  'DELETED',
] as const;
export type Gate1ParticipantStatus = (typeof GATE1_PARTICIPANT_STATUSES)[number];

export const GATE1_PARTICIPANT_ROLES = [
  'PARTICIPANT',
  'ORGANIZER',
  'DECISION_MAKER',
  'PAYER',
  'GUARDIAN',
] as const;
export type Gate1ParticipantRole = (typeof GATE1_PARTICIPANT_ROLES)[number];

export const GATE1_CONSENT_TYPES = [
  'BASE_SERVICE',
  'HUMAN_ASSISTED',
  'RESEARCH',
  'ANONYMIZED_CASE',
] as const;
export type Gate1ConsentType = (typeof GATE1_CONSENT_TYPES)[number];

export const GATE1_PROPOSAL_FEEDBACK_RESPONSES = [
  'ACCEPT',
  'CONCERN',
  'REJECT',
  'NEED_INFO',
  'PRIVATE_CONTACT',
] as const;
export type Gate1ProposalFeedbackResponse = (typeof GATE1_PROPOSAL_FEEDBACK_RESPONSES)[number];

export const GATE1_PROPOSAL_FEEDBACK_STATUSES = ['SUBMITTED', 'INVALIDATED', 'RESOLVED'] as const;

export const GATE1_TASK_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

export const GATE1_CONSENT_ITEMS: Record<
  Gate1ConsentType,
  { required: boolean; label: string; description: string }
> = {
  BASE_SERVICE: {
    required: true,
    label: '加入项目与基础数据处理',
    description: '用于本次旅行项目协作与服务交付。',
  },
  HUMAN_ASSISTED: {
    required: true,
    label: '人工协助分析',
    description:
      'Gate 1 验证必需：部分步骤由 TripNARA 团队人工完成；拒绝后将无法填写私密约束。',
  },
  RESEARCH: {
    required: false,
    label: '研究与产品改进',
    description: '可选，不与基础服务捆绑。',
  },
  ANONYMIZED_CASE: {
    required: false,
    label: '匿名化案例使用',
    description: '可选，用于内部培训或研究时单独授权。',
  },
};

export const GATE1_TASK_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'WAITING',
  'COMPLETED',
  'WAIVED',
] as const;
export type Gate1TaskStatus = (typeof GATE1_TASK_STATUSES)[number];

export const GATE1_CHANGE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const;
export type Gate1ChangeSeverity = (typeof GATE1_CHANGE_SEVERITIES)[number];

export const GATE1_PARTICIPANT_TASK_CATEGORIES = [
  'DOCUMENTS',
  'BOOKINGS',
  'WEATHER_ROAD',
  'TRANSPORT',
  'HEALTH',
  'COMMS',
  'EQUIPMENT',
  'OTHER',
] as const;

export const GATE1_OUTPUT_STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export type Gate1OutputStatus = (typeof GATE1_OUTPUT_STATUSES)[number];

export const GATE1_SOURCE_TYPES = ['AUTOMATED', 'HUMAN_ASSISTED', 'HYBRID', 'ADVISOR'] as const;
export type Gate1SourceType = (typeof GATE1_SOURCE_TYPES)[number];

export const GATE1_MATERIAL_CHANGE_TYPES = [
  'ROUTE',
  'ACTIVITY',
  'ACCOMMODATION',
  'TRANSPORT',
  'SPLIT',
  'BUDGET',
  'BUFFER',
  'BOOKING',
  'PLAN_B',
] as const;
export type Gate1MaterialChangeType = (typeof GATE1_MATERIAL_CHANGE_TYPES)[number];

export const GATE1_CONFLICT_BASELINE_STATUSES = ['ADVISOR_KNOWN', 'NEWLY_FOUND', 'PARTIALLY_KNOWN'] as const;

export const GATE1_CONSENT_VERSION = 'gate1-v1.0-2026-06';

export const GATE1_CONSENT_TEXT = `TripNARA Gate 1 验证研究知情同意

本服务为 Human-Assisted Concierge 验证型产品：部分能力由系统自动完成，部分由 TripNARA 团队人工协助完成。

我们收集您的公开偏好与可选私密约束，用于本次旅行方案协作。私密信息默认不向旅行顾问或其他成员展示，仅经脱敏后用于方案决策。

您可随时撤回授权并请求删除数据。`;

export const GATE1_CONSENT_TEXT_BY_TYPE: Record<Gate1ConsentType, string> = {
  BASE_SERVICE: GATE1_CONSENT_ITEMS.BASE_SERVICE.description,
  HUMAN_ASSISTED: GATE1_CONSENT_ITEMS.HUMAN_ASSISTED.description,
  RESEARCH: GATE1_CONSENT_ITEMS.RESEARCH.description,
  ANONYMIZED_CASE: GATE1_CONSENT_ITEMS.ANONYMIZED_CASE.description,
};

export const GATE1_READINESS_DIMENSIONS = [
  'DOCUMENTS',
  'BOOKINGS',
  'WEATHER_ROAD',
  'TRANSPORT',
  'HEALTH',
  'COMMS',
  'OTHER',
] as const;

export const GATE1_READINESS_STATUSES = ['GREEN', 'YELLOW', 'RED'] as const;

export const GATE1_READINESS_FEEDBACK = [
  'USEFUL',
  'KNOWN',
  'ERROR',
  'NOT_APPLICABLE',
] as const;

export const GATE1_PLAN_B_PRE_DECISIONS = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;

export const GATE1_READINESS_COHORTS: Gate1Cohort[] = ['PLANNING', 'NEAR_DEPARTURE'];

export const GATE1_PLAN_B_COHORTS: Gate1Cohort[] = ['NEAR_DEPARTURE', 'IN_TRIP_RECENT', 'PLANNING'];

export const GATE1_TRAVEL_EVENT_TYPES = ['INCIDENT', 'CHANGE', 'PLAN_B_ACTIVATION', 'OTHER'] as const;

export const GATE1_SECOND_ORDER_INTENTS = ['VERBAL', 'CONFIRMED', 'PROVIDED'] as const;

export const GATE1_PAYMENT_COMMITMENT_TYPES = [
  'GATE2_DEPOSIT',
  'POC_AGREEMENT',
  'MARGIN_DEPOSIT',
  'OTHER',
] as const;

export const GATE1_PROJECT_TRANSITIONS: Record<Gate1ProjectStatus, Gate1ProjectStatus[]> = {
  DRAFT: ['BASELINE_READY', 'WITHDRAWN'],
  BASELINE_READY: ['COLLECTING', 'WITHDRAWN'],
  COLLECTING: ['ANALYZING', 'WITHDRAWN'],
  ANALYZING: ['ADVISOR_DECIDING', 'WITHDRAWN'],
  ADVISOR_DECIDING: ['READY', 'WITHDRAWN'],
  READY: ['ACTIVE', 'COMPLETED', 'WITHDRAWN'],
  ACTIVE: ['COMPLETED', 'WITHDRAWN'],
  COMPLETED: [],
  WITHDRAWN: [],
};
