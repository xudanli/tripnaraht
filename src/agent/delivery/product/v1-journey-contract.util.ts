/**
 * Nara V1 Journey 冻结 — 验收单位是用户任务闭环，不是内部 Runtime。
 * 原则：Capability Ready ≠ Product Ready。
 * 禁止新增 Harness / DI / Temporal / Proactive 架构层。
 */

export const V1_JOURNEY_IDS = [
  'QUERY',
  'DECIDE',
  'ADJUST',
  'LIVE',
  'IMPORT',
  'PROACTIVE',
] as const;

export type V1JourneyId = (typeof V1_JOURNEY_IDS)[number];

/** 映射既有 Runtime（投影，不新建 Runtime） */
export type V1JourneyRuntimeBinding =
  | 'TRIP_QUERY'
  | 'DECISION_SUPPORT'
  | 'ITINERARY_ADJUST'
  | 'LIVE_EXECUTION'
  | 'CONTENT_IMPORT'
  | 'PROACTIVE_SURFACE_ONLY';

export type V1JourneyContractV1 = {
  journeyId: V1JourneyId;
  titleZh: string;
  userJobZh: string;
  runtimeBinding: V1JourneyRuntimeBinding;
  /** 产品闭环必经阶段（用户可感知） */
  requiredStages: V1ProductStageId[];
  /** Confirm 前禁止静默 Apply */
  silentApplyForbidden: true;
  autoApplyClosed: true;
  autoCancelClosed: true;
  autoRerouteClosed: true;
  /** Proactive Push 须 Scenario×Level */
  pushRequiresScenarioDeliveryAuthority: boolean;
  noNewArchitectureLayer: true;
};

export const V1_PRODUCT_STAGES = [
  'NATURAL_LANGUAGE_INPUT',
  'CANONICAL_RESULT',
  'CARD',
  'CTA',
  'CONFIRM',
  'APPLY',
  'RECEIPT',
  'PAGE_STATE_REFRESH',
] as const;

export type V1ProductStageId = (typeof V1_PRODUCT_STAGES)[number];

export const V1_JOURNEY_CONTRACTS: Record<V1JourneyId, V1JourneyContractV1> = {
  QUERY: {
    journeyId: 'QUERY',
    titleZh: '查询',
    userJobZh: '用自然语言查清行程事实（住宿/日程/成员等），无需理解内部架构',
    runtimeBinding: 'TRIP_QUERY',
    requiredStages: [
      'NATURAL_LANGUAGE_INPUT',
      'CANONICAL_RESULT',
      'CARD',
      'CTA',
      'PAGE_STATE_REFRESH',
    ],
    silentApplyForbidden: true,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    pushRequiresScenarioDeliveryAuthority: false,
    noNewArchitectureLayer: true,
  },
  DECIDE: {
    journeyId: 'DECIDE',
    titleZh: '选择',
    userJobZh: '看清选项并完成选择/同意；Commit ≠ Apply',
    runtimeBinding: 'DECISION_SUPPORT',
    requiredStages: [
      'NATURAL_LANGUAGE_INPUT',
      'CANONICAL_RESULT',
      'CARD',
      'CTA',
      'CONFIRM',
      'RECEIPT',
      'PAGE_STATE_REFRESH',
    ],
    silentApplyForbidden: true,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    pushRequiresScenarioDeliveryAuthority: false,
    noNewArchitectureLayer: true,
  },
  ADJUST: {
    journeyId: 'ADJUST',
    titleZh: '调整',
    userJobZh: '草稿→确认→写入行程→回执→页面刷新',
    runtimeBinding: 'ITINERARY_ADJUST',
    requiredStages: [
      'NATURAL_LANGUAGE_INPUT',
      'CANONICAL_RESULT',
      'CARD',
      'CTA',
      'CONFIRM',
      'APPLY',
      'RECEIPT',
      'PAGE_STATE_REFRESH',
    ],
    silentApplyForbidden: true,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    pushRequiresScenarioDeliveryAuthority: false,
    noNewArchitectureLayer: true,
  },
  LIVE: {
    journeyId: 'LIVE',
    titleZh: '执行应对',
    userJobZh: '出行中得到可执行结论与风险提示，默认不写行程',
    runtimeBinding: 'LIVE_EXECUTION',
    requiredStages: [
      'NATURAL_LANGUAGE_INPUT',
      'CANONICAL_RESULT',
      'CARD',
      'CTA',
      'CONFIRM',
      'PAGE_STATE_REFRESH',
    ],
    silentApplyForbidden: true,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    pushRequiresScenarioDeliveryAuthority: false,
    noNewArchitectureLayer: true,
  },
  IMPORT: {
    journeyId: 'IMPORT',
    titleZh: '导入',
    userJobZh: '预览导入内容，确认后再写入，禁止静默 Apply',
    runtimeBinding: 'CONTENT_IMPORT',
    requiredStages: [
      'NATURAL_LANGUAGE_INPUT',
      'CANONICAL_RESULT',
      'CARD',
      'CTA',
      'CONFIRM',
      'APPLY',
      'RECEIPT',
      'PAGE_STATE_REFRESH',
    ],
    silentApplyForbidden: true,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    pushRequiresScenarioDeliveryAuthority: false,
    noNewArchitectureLayer: true,
  },
  PROACTIVE: {
    journeyId: 'PROACTIVE',
    titleZh: '主动提示',
    userJobZh: '在授权渠道看到有价值提示；可沉默；Push 须 Scenario×Level',
    runtimeBinding: 'PROACTIVE_SURFACE_ONLY',
    requiredStages: [
      'CANONICAL_RESULT',
      'CARD',
      'CTA',
      'CONFIRM',
      'PAGE_STATE_REFRESH',
    ],
    silentApplyForbidden: true,
    autoApplyClosed: true,
    autoCancelClosed: true,
    autoRerouteClosed: true,
    pushRequiresScenarioDeliveryAuthority: true,
    noNewArchitectureLayer: true,
  },
};

export function getV1JourneyContract(journeyId: V1JourneyId): V1JourneyContractV1 {
  return V1_JOURNEY_CONTRACTS[journeyId];
}

export function listFrozenV1Journeys(): V1JourneyContractV1[] {
  return V1_JOURNEY_IDS.map((id) => V1_JOURNEY_CONTRACTS[id]);
}
