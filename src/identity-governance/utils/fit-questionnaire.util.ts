import { FIT_SOFT_DIMENSIONS } from '../constants/project-fit.constants';

export type FitQuestionnairePhase = 'preview' | 'full';

export type FitQuestionDefinition = {
  questionKey: string;
  dimension: 'hard' | 'soft';
  ruleId?: string;
  label: string;
  helpText: string;
  sensitivityLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  required: boolean;
  answerType: 'boolean' | 'number' | 'scale' | 'currency_cents' | 'text' | 'multi_select';
  visibility: {
    applicant: true;
    leaderSeesAnswer: false;
    leaderSeesAggregate: boolean;
  };
  options?: Array<{ value: string | number | boolean; label: string }>;
  validation?: Record<string, unknown>;
};

const QUESTION_BANK: Record<string, Omit<FitQuestionDefinition, 'questionKey' | 'ruleId'>> = {
  dates_available: {
    dimension: 'hard',
    label: '你是否能够完整参与项目标注的出发与返回日期？',
    helpText: '仅用于判断硬性日期约束，不对其他成员公开。',
    sensitivityLevel: 'LOW',
    required: true,
    answerType: 'boolean',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
  },
  age_in_range: {
    dimension: 'hard',
    label: '你的年龄是否在项目允许范围内？',
    helpText: '请填写真实年龄，仅审核员可见具体数值。',
    sensitivityLevel: 'MEDIUM',
    required: true,
    answerType: 'number',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
    validation: { min: 1, max: 120 },
  },
  budget_affordable: {
    dimension: 'hard',
    label: '你是否能够承担项目总价及已披露的必要额外费用？',
    helpText: '请填写你可承担的总预算（分），不会向其他成员公开精确金额。',
    sensitivityLevel: 'HIGH',
    required: true,
    answerType: 'currency_cents',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
  },
  budget_cents: {
    dimension: 'hard',
    label: '你可承担的项目总预算（含必要额外费用）是多少？',
    helpText: '仅生成 Privacy-Safe 预算冲突提示，不向其他成员公开精确预算。',
    sensitivityLevel: 'HIGH',
    required: true,
    answerType: 'currency_cents',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
  },
  equipment_ready: {
    dimension: 'hard',
    label: '你是否拥有或愿意租赁项目列出的必要装备？',
    helpText: '用于判断装备硬条件或待确认事项。',
    sensitivityLevel: 'LOW',
    required: true,
    answerType: 'boolean',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
  },
  qualification_required: {
    dimension: 'hard',
    label: '你是否持有项目要求的资质/证照？',
    helpText: '请选择你已持有且有效的资质类型。',
    sensitivityLevel: 'MEDIUM',
    required: true,
    answerType: 'multi_select',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
  },
  pace_acceptance: {
    dimension: 'soft',
    label: '你对连续早起、长途驾驶和多活动日的接受程度？',
    helpText: '1=很难接受，5=完全可接受。仅生成体验差异提示，不评价人格。',
    sensitivityLevel: 'MEDIUM',
    required: true,
    answerType: 'scale',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
    options: [
      { value: 1, label: '很难接受' },
      { value: 2, label: '较难接受' },
      { value: 3, label: '一般' },
      { value: 4, label: '可以接受' },
      { value: 5, label: '完全可接受' },
    ],
  },
  risk_acceptance: {
    dimension: 'soft',
    label: '你是否接受天气可能导致活动取消或临时改线？',
    helpText: '用于判断风险偏好差异，不用于道德评价。',
    sensitivityLevel: 'MEDIUM',
    required: true,
    answerType: 'scale',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
    options: [
      { value: 1, label: '很难接受' },
      { value: 3, label: '视情况' },
      { value: 5, label: '完全可接受' },
    ],
  },
  accommodation_shared: {
    dimension: 'soft',
    label: '你是否接受与团队成员合住？',
    helpText: '仅生成住宿安排提示，不公开个人原因。',
    sensitivityLevel: 'HIGH',
    required: true,
    answerType: 'boolean',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
  },
  activity_interest: {
    dimension: 'soft',
    label: '你对项目核心活动的参与意愿？',
    helpText: '1=明确不参加核心活动，5=非常愿意参加。',
    sensitivityLevel: 'LOW',
    required: false,
    answerType: 'scale',
    visibility: { applicant: true, leaderSeesAnswer: false, leaderSeesAggregate: true },
  },
};

const SOFT_DIMENSION_TO_QUESTION: Record<string, string> = {
  pace: 'pace_acceptance',
  risk: 'risk_acceptance',
  accommodation: 'accommodation_shared',
  activity: 'activity_interest',
  budget_flexibility: 'budget_cents',
};

const PREVIEW_KEYS = ['dates_available', 'budget_cents', 'pace_acceptance', 'risk_acceptance'];

export type ListingFitConfig = {
  enabledSoftDimensions?: string[];
  previewQuestionKeys?: string[];
};

export function parseListingFitConfig(metadata: unknown): ListingFitConfig {
  if (!metadata || typeof metadata !== 'object') return {};
  const fitConfig = (metadata as { fitConfig?: ListingFitConfig }).fitConfig;
  return fitConfig ?? {};
}

export function buildDynamicQuestionnaire(input: {
  rules: Array<{ id: string; conditionKey: string }>;
  fitConfig: ListingFitConfig;
  phase: FitQuestionnairePhase;
}): FitQuestionDefinition[] {
  const questions: FitQuestionDefinition[] = [];
  const seen = new Set<string>();

  const addQuestion = (questionKey: string, ruleId?: string) => {
    if (seen.has(questionKey)) return;
    const bank = QUESTION_BANK[questionKey];
    if (!bank) return;
    seen.add(questionKey);
    questions.push({ questionKey, ruleId, ...bank });
  };

  if (input.phase === 'preview') {
    const previewKeys = input.fitConfig.previewQuestionKeys ?? PREVIEW_KEYS;
    for (const key of previewKeys) {
      addQuestion(key);
    }
    return questions;
  }

  for (const rule of input.rules) {
    const key =
      rule.conditionKey === 'budget_affordable' ? 'budget_cents' : rule.conditionKey;
    addQuestion(key, rule.id);
  }

  const enabledSoft =
    input.fitConfig.enabledSoftDimensions ??
    [...FIT_SOFT_DIMENSIONS];

  for (const dimension of enabledSoft) {
    const questionKey = SOFT_DIMENSION_TO_QUESTION[dimension];
    if (questionKey) addQuestion(questionKey);
  }

  return questions;
}

export function validateRequiredAnswers(
  questions: FitQuestionDefinition[],
  answers: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const q of questions) {
    if (!q.required) continue;
    const value = answers[q.questionKey];
    if (value === undefined || value === null || value === '') {
      missing.push(q.questionKey);
    }
  }
  return missing;
}

export function deriveLeaderRecommendation(input: {
  overallResult: string;
  teamImpactLevel: string;
}): 'APPROVE' | 'CLARIFY' | 'WAITLIST' | 'REJECT' {
  if (input.overallResult === 'NOT_RECOMMENDED' || input.teamImpactLevel === 'BLOCKING') {
    return 'REJECT';
  }
  if (input.overallResult === 'CONDITIONAL' || input.teamImpactLevel === 'HIGH') {
    return 'CLARIFY';
  }
  if (input.teamImpactLevel === 'MEDIUM') {
    return 'CLARIFY';
  }
  if (input.overallResult === 'BASIC_FIT') {
    return 'APPROVE';
  }
  return 'APPROVE';
}
