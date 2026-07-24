/**
 * Decision Case AI Contracts — semanticKey owns context / explain strategy / actions.
 * uiGroup owns page section + interrupt level (see UI_GROUP_AI_POLICY).
 *
 * @see FRONTEND_INSIGHT_CARD.md · DECISION_CASE_AI_POLICY.md
 */

export type DecisionCaseAiMode =
  | 'EXPLAIN_ONLY'
  | 'EXPLAIN_AND_RECOMMEND'
  | 'COMPARE_OPTIONS'
  | 'INTERVENTION';

export type MissingContextPolicy = 'SILENT' | 'CONTEXT_MISSING';

export type CaseProactiveMode =
  | 'ALWAYS'
  | 'WHEN_HIGH_IMPACT'
  | 'WHEN_MATCHED'
  | 'AFTER_GATE';

export type DecisionCaseUiGroup = 'MUST_CONFIRM' | 'IMPORTANT_CHOICE' | 'NICE_TO_HAVE';

/**
 * uiGroup → interrupt / presentation (NOT used as context template key).
 */
export const UI_GROUP_AI_POLICY: Record<
  DecisionCaseUiGroup | 'CANONICAL',
  {
    /** Default proactive interrupt when Case Contract allows. */
    defaultProactive: 'INTERVENTION' | 'ATTENTION' | 'SILENT';
    aiRole: string;
    presentation: string;
  }
> = {
  MUST_CONFIRM: {
    defaultProactive: 'INTERVENTION',
    aiRole: '解释为什么必须确认、影响什么、推荐哪个选项',
    presentation: '默认展开，靠近确认按钮',
  },
  IMPORTANT_CHOICE: {
    defaultProactive: 'ATTENTION',
    aiRole: '比较取舍，说明推荐倾向与失去什么',
    presentation: '轻量卡片，可展开',
  },
  NICE_TO_HAVE: {
    defaultProactive: 'SILENT',
    aiRole: '高匹配时轻提示',
    presentation: '折叠 / 问 Nara',
  },
  CANONICAL: {
    defaultProactive: 'SILENT',
    aiRole: '只翻译 Gateway / Canonical 已有判断，不创造新建议',
    presentation: '通用问题卡',
  },
};

export interface DecisionCaseAIContract {
  semanticKey: string;
  /** Human label for docs / debug. */
  labelZh: string;
  requiredContext: string[];
  /** Hard-required keys → missingContextPolicy when absent. */
  hardRequired?: string[];
  aiMode: DecisionCaseAiMode;
  missingContextPolicy: MissingContextPolicy;
  proactiveMode: CaseProactiveMode;
  allowedActions: string[];
  maxChineseChars: number;
  /** Injected into Nara base prompt. */
  promptHint: string;
  /**
   * Example advisor tone (product). Not used as live copy unless rule fallback picks it.
   */
  exampleOutput?: { summary: string; suggestion: string };
}

export const NARA_CASE_ADVISOR_BASE_PROMPT = `你是 Nara 行程决策顾问。

根据系统提供的行程事实、决策结果和候选方案，向用户简短解释当前决策。

要求：
1. 只使用提供的信息，不自行判断规则。
2. 说明与当前行程直接相关的依据。
3. 先说结论，再说影响，最后给出下一步。
4. 不重复页面标题和选项文案。
5. 最多60个汉字。
6. 依据不足时返回 silent=true（CONTEXT_MISSING 由服务端门禁处理）。
7. 无实际价值时返回 silent=true。

输出 JSON：
{"silent":false,"title":"不超过12字","body":"说明一句话","advice":"建议一句话"}
（兼容字段 summary↔body、suggestion↔advice）`;

export const DECISION_CASE_AI_CONTRACTS: Record<string, DecisionCaseAIContract> = {
  'REQUIRED_CHOICE.VEHICLE_ROAD_FIT': {
    semanticKey: 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT',
    labelZh: '车型道路适配',
    requiredContext: [
      'ROUTE_SUMMARY',
      'ROAD_EXPOSURE',
      'SEASON',
      'ROAD_OPEN_STATUS',
      'TEAM_CAPACITY',
      'BUDGET',
      'DRIVER_EXPERIENCE',
    ],
    hardRequired: ['ROUTE_SUMMARY', 'ROAD_EXPOSURE'],
    aiMode: 'EXPLAIN_AND_RECOMMEND',
    missingContextPolicy: 'CONTEXT_MISSING',
    proactiveMode: 'ALWAYS',
    allowedActions: ['COMPARE_OPTIONS', 'OPEN_DECISION', 'CONFIRM_DECISION'],
    maxChineseChars: 60,
    promptHint:
      '先说明影响车型的行程事实（尤其是否含 F-road），再推荐车型及原因，最后说明失效条件。禁止「请确认车型」任务复述。',
    exampleOutput: {
      summary: '当前路线不含F-road，两驱车型已满足通行要求且成本更低。',
      suggestion: '优先选两驱；进入高地后重新验证。',
    },
  },
  'REQUIRED_CHOICE.RENTAL_INSURANCE': {
    semanticKey: 'REQUIRED_CHOICE.RENTAL_INSURANCE',
    labelZh: '租车保险',
    requiredContext: [
      'VEHICLE_BOOKING',
      'ROUTE_SUMMARY',
      'ROAD_EXPOSURE',
      'WEATHER_RISK',
      'SEASON',
      'EXISTING_INSURANCE',
      'TEAM_RISK_TOLERANCE',
    ],
    hardRequired: ['ROUTE_SUMMARY', 'VEHICLE_BOOKING'],
    aiMode: 'EXPLAIN_AND_RECOMMEND',
    missingContextPolicy: 'CONTEXT_MISSING',
    proactiveMode: 'ALWAYS',
    allowedActions: ['COMPARE_OPTIONS', 'OPEN_DECISION', 'CONFIRM_DECISION'],
    maxChineseChars: 60,
    promptHint:
      '必须基于车型、路线暴露、季节与已有保障推荐；不得只讲通用保险知识。缺上下文时勿生成保险科普。',
    exampleOutput: {
      summary: '本次路线碎石暴露偏高，基础险对主要风险覆盖不足。',
      suggestion: '优先选择含碎石保障的方案。',
    },
  },
  'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH': {
    semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
    labelZh: 'F-road 与车型不匹配',
    requiredContext: ['ROUTE_SUMMARY', 'ROAD_EXPOSURE', 'VEHICLE_BOOKING'],
    hardRequired: ['ROUTE_SUMMARY', 'VEHICLE_BOOKING'],
    aiMode: 'INTERVENTION',
    missingContextPolicy: 'CONTEXT_MISSING',
    proactiveMode: 'ALWAYS',
    allowedActions: ['OPEN_DECISION', 'COMPARE_OPTIONS', 'PREVIEW_PLAN_CHANGE'],
    maxChineseChars: 60,
    promptHint:
      '只解释规则结果：路线含 F-road 但车型不合格。动作限于换车型、改路线、查看受影响路段；不重新发明规则。',
    exampleOutput: {
      summary: '路线含 F-road，当前车型不具备通行资格。',
      suggestion: '更换合规四驱或移除高地路线。',
    },
  },
  'RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE': {
    semanticKey: 'RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE',
    labelZh: '日驾过长',
    requiredContext: ['ROUTE_SUMMARY', 'DRIVE_LOAD', 'TEAM_CAPACITY', 'BUDGET'],
    aiMode: 'EXPLAIN_AND_RECOMMEND',
    missingContextPolicy: 'SILENT',
    proactiveMode: 'WHEN_HIGH_IMPACT',
    allowedActions: ['COMPARE_OPTIONS', 'PREVIEW_PLAN_CHANGE', 'OPEN_DECISION'],
    maxChineseChars: 60,
    promptHint:
      '说明哪一天驾驶多久、相对团队上限差多少；建议拆宿或删次要景点。已与 Canonical 日载去重时勿重复结论。',
    exampleOutput: {
      summary: '第5天预计驾驶超团队上限。',
      suggestion: '建议拆分住宿或移除次要景点。',
    },
  },
  'RULE_TRIGGER.LANDING_LONG_DRIVE': {
    semanticKey: 'RULE_TRIGGER.LANDING_LONG_DRIVE',
    labelZh: '落地长驾',
    requiredContext: [
      'ARRIVAL_FLIGHT',
      'PICKUP_BUFFER',
      'DAY1_DRIVE',
      'JETLAG',
      'WEATHER_RISK',
      'FIRST_NIGHT_LODGING',
    ],
    aiMode: 'COMPARE_OPTIONS',
    missingContextPolicy: 'SILENT',
    proactiveMode: 'WHEN_HIGH_IMPACT',
    allowedActions: ['COMPARE_OPTIONS', 'OPEN_DECISION', 'PREVIEW_PLAN_CHANGE'],
    maxChineseChars: 60,
    promptHint:
      '解释落地后驾驶与抵达时刻；通常为重要选择非绝对阻塞。仅安全门槛时升级干预。',
    exampleOutput: {
      summary: '落地后仍需长驾，抵达可能偏晚。',
      suggestion: '首晚机场附近，次日再进南岸。',
    },
  },
  'RULE_TRIGGER.RING_VS_SOUTH_SCOPE': {
    semanticKey: 'RULE_TRIGGER.RING_VS_SOUTH_SCOPE',
    labelZh: '环岛 vs 南岸',
    requiredContext: [
      'TRIP_DAYS',
      'TOTAL_MILEAGE',
      'DRIVE_LOAD',
      'MUST_SEE',
      'LODGING_SPREAD',
      'TEAM_PACING',
    ],
    aiMode: 'COMPARE_OPTIONS',
    missingContextPolicy: 'SILENT',
    proactiveMode: 'ALWAYS',
    allowedActions: ['COMPARE_OPTIONS', 'OPEN_DECISION'],
    maxChineseChars: 60,
    promptHint:
      '权衡解释：环岛获得什么、南岸获得什么、依据是什么；不要简单命令用户选哪个。',
    exampleOutput: {
      summary: '9天环岛可行但日驾偏高；南岸更从容并保留冰川体验。',
      suggestion: '按节奏偏好比较两案后再确认。',
    },
  },
  'OPPORTUNITY.GLACIER_EXPERIENCE': {
    semanticKey: 'OPPORTUNITY.GLACIER_EXPERIENCE',
    labelZh: '冰川体验',
    requiredContext: [
      'TIME_WINDOW',
      'SEASON',
      'TEAM_FITNESS',
      'ROUTE_PROXIMITY',
      'BUDGET',
      'HIGHER_PRIORITY_ACTIVITIES',
    ],
    aiMode: 'EXPLAIN_AND_RECOMMEND',
    missingContextPolicy: 'SILENT',
    proactiveMode: 'WHEN_MATCHED',
    allowedActions: ['COMPARE_OPTIONS', 'OPEN_DECISION'],
    maxChineseChars: 60,
    promptHint:
      '仅在时间/季节/体力/顺路/预算均匹配时推荐；不匹配则 SILENT，勿为体现 AI 硬推。',
    exampleOutput: {
      summary: '第4天途经冰川集合点，加徒步仅需调整次要景点。',
      suggestion: '适合当前节奏时可加入短线体验。',
    },
  },
  'OPPORTUNITY.HIGH_IMPACT_EXPERIENCE': {
    semanticKey: 'OPPORTUNITY.HIGH_IMPACT_EXPERIENCE',
    labelZh: '高影响体验',
    requiredContext: [
      'ELIGIBILITY_GATE',
      'TIME_WINDOW',
      'BUDGET',
      'TEAM_FIT',
      'ITINERARY_COST',
    ],
    aiMode: 'COMPARE_OPTIONS',
    missingContextPolicy: 'SILENT',
    proactiveMode: 'AFTER_GATE',
    allowedActions: ['COMPARE_OPTIONS', 'OPEN_DECISION'],
    maxChineseChars: 60,
    promptHint:
      '过闸后才解释；必须说清时间与预算代价。禁止因「热门」推荐。同页最多一项高影响机会。',
    exampleOutput: {
      summary: '直升机可显著提升体验，但增约2小时与高预算。',
      suggestion: '确认是否愿意压缩当天下午安排。',
    },
  },
};

const GENERIC_CONFLICT_HINT = `根据当前冲突事实和已验证方案解释推荐。
不重复标题/方案数量；只说原因、影响与推荐理由。
推荐必须来自已通过 Preview/Validate 的方案。
时间/距离/费用不一致 → DATA_CONFLICT。
无有效推荐 → 只解释冲突，不强行选方案。最多55字。`;

/** Canonical schedule / lunch / time-window conflicts (no DecisionCase). */
export const CANONICAL_SCHEDULE_CONFLICT_AI_CONTRACT: DecisionCaseAIContract = {
  semanticKey: 'CANONICAL.SCHEDULE_CONFLICT',
  labelZh: '通用日程冲突',
  requiredContext: [
    'TRIP_SNAPSHOT',
    'PLAN_DAY',
    'CONSTRAINT_ASSESSMENTS',
    'VALIDATED_OPTION_PREVIEW',
  ],
  hardRequired: ['VALIDATED_OPTION_PREVIEW'],
  aiMode: 'EXPLAIN_AND_RECOMMEND',
  missingContextPolicy: 'CONTEXT_MISSING',
  proactiveMode: 'WHEN_HIGH_IMPACT',
  allowedActions: ['COMPARE_OPTIONS', 'OPEN_DECISION', 'PREVIEW_PLAN_CHANGE'],
  maxChineseChars: 55,
  promptHint: GENERIC_CONFLICT_HINT,
  exampleOutput: {
    summary: '上一活动将延迟至12:30，占用原午餐时间。',
    suggestion: '午餐后移30分钟，对后续安排影响最小。',
  },
};

/** Canonical / no-decisionCase fallback. */
export const CANONICAL_PROBLEM_AI_CONTRACT: DecisionCaseAIContract = {
  semanticKey: 'CANONICAL.GENERIC',
  labelZh: '通用 Gateway 问题',
  requiredContext: ['TRIP_SNAPSHOT', 'CONSTRAINT_ASSESSMENTS'],
  aiMode: 'EXPLAIN_ONLY',
  missingContextPolicy: 'SILENT',
  proactiveMode: 'WHEN_HIGH_IMPACT',
  allowedActions: ['OPEN_DECISION', 'COMPARE_OPTIONS'],
  maxChineseChars: 60,
  promptHint: '只翻译系统已发现的问题与影响，不生成新结论或新推荐。',
};

export function resolveSemanticKeyForContract(input: {
  semanticKey?: string | null;
  problemId?: string;
}): string | null {
  const sk = input.semanticKey?.trim();
  if (sk && DECISION_CASE_AI_CONTRACTS[sk]) return sk;
  // Prefix / family match for HIGH_IMPACT variants
  if (sk?.startsWith('OPPORTUNITY.HIGH_IMPACT')) {
    return 'OPPORTUNITY.HIGH_IMPACT_EXPERIENCE';
  }
  const id = input.problemId ?? '';
  if (id.startsWith('dc_vehicle')) return 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT';
  if (id.startsWith('dc_insurance')) return 'REQUIRED_CHOICE.RENTAL_INSURANCE';
  if (id.startsWith('dc_froad')) return 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH';
  if (id.startsWith('dc_drive')) return 'RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE';
  if (id.startsWith('dc_landing')) return 'RULE_TRIGGER.LANDING_LONG_DRIVE';
  if (id.startsWith('dc_ring')) return 'RULE_TRIGGER.RING_VS_SOUTH_SCOPE';
  if (id.startsWith('dc_glacier')) return 'OPPORTUNITY.GLACIER_EXPERIENCE';
  if (id.startsWith('dc_exp_')) return 'OPPORTUNITY.HIGH_IMPACT_EXPERIENCE';
  return sk || null;
}

export function getDecisionCaseAIContract(input: {
  semanticKey?: string | null;
  problemId?: string;
  hasDecisionCase?: boolean;
  type?: string | null;
  title?: string | null;
}): DecisionCaseAIContract {
  const key = resolveSemanticKeyForContract(input);
  if (key && DECISION_CASE_AI_CONTRACTS[key]) {
    return DECISION_CASE_AI_CONTRACTS[key];
  }
  if (key === 'CANONICAL.SCHEDULE_CONFLICT') {
    return CANONICAL_SCHEDULE_CONFLICT_AI_CONTRACT;
  }
  // Schedule / lunch conflicts without DecisionCase
  const blob = [input.semanticKey, input.problemId, input.type, input.title]
    .filter(Boolean)
    .join(' ');
  if (
    !input.hasDecisionCase &&
    (/lunch|午餐|TIME_CONFLICT|schedule|same_day|时间冲突|时间窗/i.test(blob) ||
      input.type === 'TIME_CONFLICT')
  ) {
    return CANONICAL_SCHEDULE_CONFLICT_AI_CONTRACT;
  }
  if (input.hasDecisionCase === false || !input.semanticKey) {
    return CANONICAL_PROBLEM_AI_CONTRACT;
  }
  return CANONICAL_PROBLEM_AI_CONTRACT;
}

export function listDecisionCaseAIContracts(): DecisionCaseAIContract[] {
  return Object.values(DECISION_CASE_AI_CONTRACTS);
}

/**
 * Whether Copilot should proactively surface for this Case (before DETAIL suppress).
 */
export function shouldCaseProactivelySurface(input: {
  contract: DecisionCaseAIContract;
  explicitAsk: boolean;
  /** High impact: blocking, safety, materiality, hard drive overrun, etc. */
  highImpact: boolean;
  /** Opportunity matched / eligibility gate passed. */
  matchedOrGated: boolean;
}): boolean {
  if (input.explicitAsk) return true;
  switch (input.contract.proactiveMode) {
    case 'ALWAYS':
      return true;
    case 'WHEN_HIGH_IMPACT':
      return input.highImpact;
    case 'WHEN_MATCHED':
      return input.matchedOrGated;
    case 'AFTER_GATE':
      return input.matchedOrGated;
    default:
      return false;
  }
}

/**
 * Map Case AI mode + uiGroup policy → preferred Insight mode when proactive.
 */
export function preferredInsightModeForCase(input: {
  contract: DecisionCaseAIContract;
  uiGroup?: string | null;
  highImpact: boolean;
}): 'INTERVENTION' | 'ATTENTION' {
  if (input.contract.aiMode === 'INTERVENTION') return 'INTERVENTION';
  if (input.uiGroup === 'MUST_CONFIRM') return 'INTERVENTION';
  if (
    input.contract.semanticKey === 'RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE' &&
    input.highImpact
  ) {
    return 'INTERVENTION';
  }
  if (
    input.contract.semanticKey === 'RULE_TRIGGER.LANDING_LONG_DRIVE' &&
    input.highImpact
  ) {
    return 'INTERVENTION';
  }
  return 'ATTENTION';
}
