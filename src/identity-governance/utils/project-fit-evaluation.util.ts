import {
  DimensionResult,
  EligibilitySeverity,
  FitEvaluationOutput,
  FitOverallResult,
  HardRuleResult,
  TeamImpactLevel,
  TeamImpactResult,
} from '../constants/project-fit.constants';
import { SupplyContext } from './supply-context.util';

type RuleRow = {
  id: string;
  conditionKey: string;
  operator: string;
  value: unknown;
  severity: EligibilitySeverity;
  waiverPolicy: string;
  explanationTemplate: string | null;
};

type AnswerMap = Record<string, unknown>;

type ListingContext = {
  budgetMinCents: number | null;
  budgetMaxCents: number | null;
  slotsTotal: number;
  slotsFilled: number;
  startDate: Date;
  endDate: Date;
};

function evaluateHardRule(
  rule: RuleRow,
  answers: AnswerMap,
  listing: ListingContext,
): HardRuleResult {
  const template = rule.explanationTemplate ?? rule.conditionKey;
  let passed = true;
  let message = template;

  switch (rule.conditionKey) {
    case 'dates_available': {
      passed = answers.dates_available === true;
      message = passed ? '日期满足项目要求' : template || '无法完整参与项目日期';
      break;
    }
    case 'age_in_range': {
      const age = Number(answers.age ?? answers.age_in_range);
      const range = rule.value as { min?: number; max?: number };
      passed =
        Number.isFinite(age) &&
        (range.min == null || age >= range.min) &&
        (range.max == null || age <= range.max);
      message = passed ? '年龄在允许范围内' : template || '年龄不在项目允许范围';
      break;
    }
    case 'budget_affordable': {
      const budgetCents = Number(answers.budget_cents ?? answers.budget_affordable);
      const minRequired = listing.budgetMinCents ?? Number((rule.value as { minCents?: number })?.minCents ?? 0);
      passed = Number.isFinite(budgetCents) && budgetCents >= minRequired;
      message = passed ? '预算满足项目最低要求' : template || '预算低于项目最低必要费用';
      break;
    }
    case 'qualification_required': {
      const required = (rule.value as { types?: string[] })?.types ?? [];
      const held =
        (answers.qualifications_held as string[] | undefined) ??
        (answers.qualification_required as string[] | undefined) ??
        [];
      passed = required.length === 0 || required.every((t) => held.includes(t));
      message = passed ? '必要资质已满足' : template || '缺少项目要求的资质';
      break;
    }
    case 'equipment_ready': {
      passed = answers.equipment_ready === true;
      message = passed ? '装备条件满足' : template || '必要装备未就绪';
      break;
    }
    default: {
      passed = answers[rule.conditionKey] === (rule.value as { expected?: unknown })?.expected;
      message = passed ? `${rule.conditionKey} 通过` : template || `${rule.conditionKey} 未满足`;
    }
  }

  return {
    ruleId: rule.id,
    conditionKey: rule.conditionKey,
    severity: rule.severity,
    passed,
    message,
    waiverPolicy: rule.waiverPolicy,
  };
}

function evaluateSoftDimension(dimension: string, answers: AnswerMap): DimensionResult {
  const levelKey = `${dimension}_acceptance`;
  const raw = answers[levelKey] ?? answers[dimension];
  if (raw == null) {
    return {
      dimension,
      status: 'NOT_APPLICABLE',
      summary: '未涉及',
      privacySafeSummary: '当前项目未采集该维度',
    };
  }

  const level = Number(raw);
  if (!Number.isFinite(level)) {
    return {
      dimension,
      status: 'NEEDS_CONFIRMATION',
      summary: '需与领队确认',
      privacySafeSummary: '存在需进一步确认的偏好差异',
    };
  }

  if (level >= 4) {
    return {
      dimension,
      status: 'MATCH',
      summary: '基本兼容',
      privacySafeSummary: '与项目体验偏好基本兼容',
    };
  }
  if (level === 3) {
    return {
      dimension,
      status: 'ACCEPTABLE_GAP',
      summary: '存在可接受差异',
      privacySafeSummary: '存在已知差异，可通过沟通或分流处理',
    };
  }
  if (level === 2) {
    return {
      dimension,
      status: 'NEEDS_CONFIRMATION',
      summary: '需确认',
      privacySafeSummary: '需与领队确认安排是否可接受',
    };
  }
  return {
    dimension,
    status: 'HIGH_FRICTION',
    summary: '可能显著影响体验',
    privacySafeSummary: '当前方案可能与成员偏好存在较高摩擦',
  };
}

function evaluateTeamImpact(
  listing: ListingContext,
  answers: AnswerMap,
  supply?: SupplyContext,
): TeamImpactResult {
  const factors: string[] = [];
  let level: TeamImpactLevel = 'LOW';

  const remainingSlots = listing.slotsTotal - listing.slotsFilled;
  if (remainingSlots <= 0) {
    return {
      level: 'BLOCKING',
      summary: '项目名额已满',
      privacySafeSummary: '当前项目容量已满，无法加入',
      factors: ['capacity_full'],
    };
  }
  if (remainingSlots === 1) {
    factors.push('last_slot');
    level = 'MEDIUM';
  }

  if (supply) {
    if (supply.pendingApplications >= 3 && supply.slotsRemaining <= supply.pendingApplications) {
      factors.push('supply_pressure');
      level = level === 'LOW' ? 'MEDIUM' : 'HIGH';
    }

    const budgetCents = Number(answers.budget_cents);
    if (
      supply.avgPendingBudgetCents &&
      Number.isFinite(budgetCents) &&
      budgetCents < supply.avgPendingBudgetCents * 0.85
    ) {
      factors.push('budget_below_queue_average');
      level = level === 'LOW' ? 'MEDIUM' : level;
    }

    if (
      supply.pricePerSlotCents &&
      Number.isFinite(budgetCents) &&
      budgetCents < supply.pricePerSlotCents
    ) {
      factors.push('price_per_slot_gap');
      level = level === 'LOW' ? 'MEDIUM' : 'HIGH';
    }
  }

  const pace = Number(answers.pace_acceptance);
  if (Number.isFinite(pace) && pace <= 2) {
    factors.push('pace_low');
    level = level === 'LOW' ? 'MEDIUM' : level;
  }

  if (answers.accommodation_shared === false) {
    factors.push('private_room_needed');
    level = level === 'LOW' ? 'MEDIUM' : 'HIGH';
  }

  const budgetCents = Number(answers.budget_cents);
  if (listing.budgetMaxCents && Number.isFinite(budgetCents) && budgetCents < listing.budgetMaxCents * 0.9) {
    factors.push('budget_structure');
    level = level === 'LOW' ? 'MEDIUM' : level;
  }

  const privacySafeSummary =
    level === 'LOW'
      ? '加入后团队方案基本可执行'
      : level === 'MEDIUM'
        ? '加入后可能需要局部调整或额外确认'
        : level === 'HIGH'
          ? '加入后可能需要调整资源、路线或成本结构'
          : '加入后项目可能不可执行';

  return { level, summary: privacySafeSummary, privacySafeSummary, factors };
}

function deriveOverallResult(
  hardResults: HardRuleResult[],
  dimensionResults: DimensionResult[],
  teamImpact: TeamImpactResult,
): FitOverallResult {
  if (hardResults.some((r) => r.severity === 'BLOCKER' && !r.passed) || teamImpact.level === 'BLOCKING') {
    return 'NOT_RECOMMENDED';
  }

  const mustConfirmFailed = hardResults.some((r) => r.severity === 'MUST_CONFIRM' && !r.passed);
  const needsConfirmDims = dimensionResults.filter((d) =>
    ['NEEDS_CONFIRMATION', 'HIGH_FRICTION'].includes(d.status),
  );

  if (mustConfirmFailed || needsConfirmDims.length > 0 || teamImpact.level === 'HIGH') {
    return 'CONDITIONAL';
  }

  if (teamImpact.level === 'MEDIUM' || dimensionResults.some((d) => d.status === 'ACCEPTABLE_GAP')) {
    return 'BASIC_FIT';
  }

  return 'HIGH_FIT';
}

export function evaluateProjectFit(input: {
  rules: RuleRow[];
  answers: AnswerMap;
  listing: ListingContext;
  enabledSoftDimensions?: string[];
  supplyContext?: SupplyContext;
}): FitEvaluationOutput {
  const hardResults = input.rules.map((rule) => evaluateHardRule(rule, input.answers, input.listing));
  const dimensionResults = (input.enabledSoftDimensions ?? ['pace', 'risk', 'accommodation', 'activity', 'budget_flexibility']).map(
    (dimension) => evaluateSoftDimension(dimension, input.answers),
  );
  const teamImpactResult = evaluateTeamImpact(input.listing, input.answers, input.supplyContext);
  const overallResult = deriveOverallResult(hardResults, dimensionResults, teamImpactResult);

  const requiredConfirmations = [
    ...hardResults.filter((r) => !r.passed && r.severity === 'MUST_CONFIRM').map((r) => r.message),
    ...dimensionResults
      .filter((d) => d.status === 'NEEDS_CONFIRMATION' || d.status === 'HIGH_FRICTION')
      .map((d) => d.privacySafeSummary),
  ];

  const leaderLines = [
    `系统建议：${overallResult}`,
    ...hardResults.map((r) => `${r.passed ? '通过' : '未通过'} · ${r.conditionKey} · ${r.severity}`),
    `团队影响：${teamImpactResult.level} — ${teamImpactResult.privacySafeSummary}`,
  ];

  return {
    overallResult,
    hardResults,
    dimensionResults,
    teamImpactResult,
    requiredConfirmations,
    explanationBundle: {
      applicant: [
        `总体结论：${overallResult}`,
        ...hardResults.filter((r) => r.passed).map((r) => `✓ ${r.message}`),
        ...requiredConfirmations.map((c) => `待确认：${c}`),
      ],
      leader: leaderLines,
      operator: leaderLines,
    },
  };
}

export function buildReportForRole(
  assessment: FitEvaluationOutput,
  role: 'applicant' | 'leader' | 'operator',
) {
  const lines =
    role === 'applicant' ? assessment.explanationBundle.applicant : assessment.explanationBundle.leader;

  return {
    overallResult: assessment.overallResult,
    hardResults: assessment.hardResults.map((r) => ({
      conditionKey: r.conditionKey,
      severity: r.severity,
      passed: r.passed,
      message: r.message,
    })),
    dimensionResults: assessment.dimensionResults.map((d) => ({
      dimension: d.dimension,
      status: d.status,
      summary: role === 'applicant' ? d.summary : d.privacySafeSummary,
    })),
    teamImpact: {
      level: assessment.teamImpactResult.level,
      summary: assessment.teamImpactResult.privacySafeSummary,
      factors: role === 'applicant' ? assessment.teamImpactResult.factors : undefined,
    },
    requiredConfirmations: assessment.requiredConfirmations,
    explanations: lines,
  };
}
