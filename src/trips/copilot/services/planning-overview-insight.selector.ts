/**
 * Deterministic Planning Overview insight selection.
 * Trip-level prioritization only — no option selection.
 */

import type {
  InsightAction,
  InsightImpact,
  InsightMode,
  InsightPriority,
  InsightType,
} from '../contracts/page-insight.types';
import {
  OVERVIEW_CONTEXT_MISSING_COPY,
  OVERVIEW_NO_PRIORITY_FALLBACK,
  OVERVIEW_SILENT_COPY,
} from '../contracts/planning-overview-ai';
import type { PlanningOverviewBuiltContext } from './planning-overview-page-context.builder';

export interface PlanningOverviewInsightSelection {
  mode: InsightMode;
  priority: InsightPriority;
  insightType: InsightType;
  title: string;
  observationSummary: string;
  explanationSummary: string;
  impacts: InsightImpact[];
  recommendation?: {
    summary: string;
    rationale: string;
  };
  actions: InsightAction[];
  confidence: number;
  evidenceRefs: string[];
  factRefs: string[];
  modeReason?: string;
  ruleSummary: string;
  ruleSuggestion: string;
  hasValidatedRecommendation: boolean;
  allowedFactTokens: string[];
}

export function selectPlanningOverviewInsight(input: {
  built: PlanningOverviewBuiltContext;
  explicitAsk?: boolean;
}): PlanningOverviewInsightSelection {
  const { built, explicitAsk } = input;
  const tokens = built.allowedFactTokens;

  if (!built.gate.ok) {
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'DATA_UNCERTAINTY',
      title: '缺少上下文',
      observationSummary: OVERVIEW_CONTEXT_MISSING_COPY.summary,
      explanationSummary: `missing=${built.gate.missing.join(',')}`,
      impacts: [],
      actions: [],
      confidence: 0.9,
      evidenceRefs: [],
      factRefs: [],
      modeReason: 'CONTEXT_MISSING',
      ruleSummary: OVERVIEW_CONTEXT_MISSING_COPY.summary,
      ruleSuggestion: OVERVIEW_CONTEXT_MISSING_COPY.suggestion,
      hasValidatedRecommendation: false,
      allowedFactTokens: tokens,
    };
  }

  if (built.severity === 'CLEAR') {
    if (!explicitAsk) {
      return {
        mode: 'SILENT',
        priority: 'P2',
        insightType: 'EXPLANATION',
        title: '无需提醒',
        observationSummary: OVERVIEW_SILENT_COPY.summary,
        explanationSummary: 'TRIP_CLEAR',
        impacts: [],
        actions: [],
        confidence: 0.9,
        evidenceRefs: [],
        factRefs: [],
        modeReason: 'TRIP_CLEAR',
        ruleSummary: OVERVIEW_SILENT_COPY.summary,
        ruleSuggestion: OVERVIEW_SILENT_COPY.suggestion,
        hasValidatedRecommendation: false,
        allowedFactTokens: tokens,
      };
    }
    return {
      mode: 'ATTENTION',
      priority: 'P2',
      insightType: 'EXPLANATION',
      title: '规划可继续',
      observationSummary: OVERVIEW_SILENT_COPY.summary,
      explanationSummary: 'EXPLICIT_ASK',
      impacts: [],
      recommendation: {
        summary: OVERVIEW_SILENT_COPY.suggestion,
        rationale: OVERVIEW_SILENT_COPY.suggestion,
      },
      actions: readinessActions(),
      confidence: 0.9,
      evidenceRefs: [],
      factRefs: [],
      modeReason: 'EXPLICIT_ASK',
      ruleSummary: OVERVIEW_SILENT_COPY.summary,
      ruleSuggestion: OVERVIEW_SILENT_COPY.suggestion,
      hasValidatedRecommendation: true,
      allowedFactTokens: tokens,
    };
  }

  const summary = buildSummary(built);
  const suggestion = buildSuggestion(built);
  const actions = buildActions(built);
  const evidenceRefs = [
    ...(built.topProblem ? [`decision-problem:${built.topProblem.problemId}`] : []),
    `queue:open:${built.openProblemCount}`,
  ];

  if (built.severity === 'BLOCKING') {
    return {
      mode: 'INTERVENTION',
      priority: 'P0',
      insightType: 'DECISION_REQUIRED',
      title: '先处理阻塞',
      observationSummary: summary,
      explanationSummary: built.unlockHint ?? summary,
      impacts: [
        {
          dimension: 'ROUTE',
          severity: 'HIGH',
          summary,
        },
      ],
      recommendation: {
        summary: suggestion,
        rationale: built.unlockHint ?? suggestion,
      },
      actions,
      confidence: 0.85,
      evidenceRefs,
      factRefs: evidenceRefs,
      modeReason: 'BLOCKING_READINESS',
      ruleSummary: summary,
      ruleSuggestion: suggestion,
      hasValidatedRecommendation: !!built.topProblem || built.mustConfirmCount > 0,
      allowedFactTokens: tokens,
    };
  }

  // ATTENTION
  if (!built.topProblem && built.importantChoiceCount === 0) {
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'READINESS_GAP',
      title: '待处理事项',
      observationSummary: OVERVIEW_NO_PRIORITY_FALLBACK.summary,
      explanationSummary: 'NO_TOP_PRIORITY',
      impacts: [],
      recommendation: {
        summary: OVERVIEW_NO_PRIORITY_FALLBACK.suggestion,
        rationale: OVERVIEW_NO_PRIORITY_FALLBACK.suggestion,
      },
      actions: [
        {
          kind: 'NAVIGATION',
          label: '打开决策空间',
          target: { pageId: 'DECISION_SPACE' },
        },
        ...readinessActions(),
      ],
      confidence: 0.7,
      evidenceRefs,
      factRefs: evidenceRefs,
      modeReason: 'IMPORTANT_CHOICE_PENDING',
      ruleSummary: OVERVIEW_NO_PRIORITY_FALLBACK.summary,
      ruleSuggestion: OVERVIEW_NO_PRIORITY_FALLBACK.suggestion,
      hasValidatedRecommendation: true,
      allowedFactTokens: tokens,
    };
  }

  return {
    mode: 'ATTENTION',
    priority: 'P1',
    insightType: 'READINESS_GAP',
    title: '建议优先处理',
    observationSummary: summary,
    explanationSummary: built.unlockHint ?? summary,
    impacts: [
      {
        dimension: 'BOOKING',
        severity: 'MEDIUM',
        summary,
      },
    ],
    recommendation: {
      summary: suggestion,
      rationale: built.unlockHint ?? suggestion,
    },
    actions,
    confidence: 0.8,
    evidenceRefs,
    factRefs: evidenceRefs,
    modeReason: 'IMPORTANT_CHOICE_PENDING',
    ruleSummary: summary,
    ruleSuggestion: suggestion,
    hasValidatedRecommendation: true,
    allowedFactTokens: tokens,
  };
}

function buildSummary(built: PlanningOverviewBuiltContext): string {
  if (built.vehicleRelatedOpen) {
    return clampChars('路线已基本可行，但车型未确认，后续道路验证尚未完成。', 55);
  }
  if (built.lodgingRelatedOpen) {
    return clampChars('行程框架已有，但住宿尚未确认，影响后续日程锁定。', 55);
  }
  if (built.topBlockerTitle) {
    const prefix =
      built.mustConfirmCount > 0
        ? `有${built.mustConfirmCount}项必须确认`
        : built.importantChoiceCount > 0
          ? `有${built.importantChoiceCount}项重要选择`
          : '行程仍有待决';
    return clampChars(`${prefix}，优先「${built.topBlockerTitle}」。`, 55);
  }
  if (built.feasibilityMustHandle > 0) {
    return clampChars(
      `可行性仍有${built.feasibilityMustHandle}项必处理，阻塞后续执行。`,
      55,
    );
  }
  return clampChars('行程仍有未完成确认，建议先处理优先项。', 55);
}

function buildSuggestion(built: PlanningOverviewBuiltContext): string {
  if (built.vehicleRelatedOpen) return '先确认车型。';
  if (built.lodgingRelatedOpen) return '先确认住宿。';
  if (built.topProblem?.title) {
    return clampChars(`先处理「${built.topProblem.title}」。`, 24);
  }
  if (built.mustConfirmCount > 0) return '先处理必须确认项。';
  return '先打开决策队列。';
}

function buildActions(built: PlanningOverviewBuiltContext): InsightAction[] {
  const actions: InsightAction[] = [];
  if (built.topProblem) {
    actions.push({
      kind: 'NAVIGATION',
      label: '打开优先决策',
      target: {
        pageId: 'DECISION_SPACE',
        entityRef: {
          entityType: 'DECISION_PROBLEM',
          entityId: built.topProblem.problemId,
        },
      },
    });
    actions.push({
      kind: 'PREVIEW',
      label: '开始依次处理',
      actionType: 'START_SEQUENTIAL_PROCESSING',
      payloadRef: `decision-queue:start:${built.topProblem.problemId}`,
    });
  } else {
    actions.push({
      kind: 'NAVIGATION',
      label: '打开决策空间',
      target: { pageId: 'DECISION_SPACE' },
    });
  }
  actions.push(...readinessActions());
  const dayNum = built.topProblem?.scope?.dayIds?.[0];
  if (dayNum != null) {
    actions.push({
      kind: 'NAVIGATION',
      label: '打开当日编排',
      target: {
        pageId: 'ITINERARY_DAY_EDITOR',
        entityRef: { entityType: 'DAY', entityId: String(dayNum) },
      },
    });
  }
  return actions;
}

function readinessActions(): InsightAction[] {
  return [
    {
      kind: 'NAVIGATION',
      label: '查看准备度',
      target: { pageId: 'READINESS_REPORT' },
    },
  ];
}

function clampChars(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, max).join('');
}
