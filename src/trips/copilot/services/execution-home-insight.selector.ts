/**
 * Deterministic Execution Home insight selection.
 * Safety → executability → time window → must confirm. No experience tips.
 */

import type {
  InsightAction,
  InsightImpact,
  InsightMode,
  InsightPriority,
  InsightType,
} from '../contracts/page-insight.types';
import {
  EXEC_CONTEXT_MISSING_COPY,
  EXEC_NO_VALIDATED_FALLBACK,
  EXEC_SILENT_COPY,
} from '../contracts/execution-home-ai';
import type { ExecutionHomeBuiltContext } from './execution-home-page-context.builder';

export interface ExecutionHomeInsightSelection {
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

export function selectExecutionHomeInsight(input: {
  built: ExecutionHomeBuiltContext;
  explicitAsk?: boolean;
}): ExecutionHomeInsightSelection {
  const { built, explicitAsk } = input;
  const tokens = built.allowedFactTokens;

  if (!built.gate.ok) {
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'DATA_UNCERTAINTY',
      title: '缺少上下文',
      observationSummary: EXEC_CONTEXT_MISSING_COPY.summary,
      explanationSummary: `missing=${built.gate.missing.join(',')}`,
      impacts: [],
      actions: [],
      confidence: 0.9,
      evidenceRefs: [],
      factRefs: [],
      modeReason: 'CONTEXT_MISSING',
      ruleSummary: EXEC_CONTEXT_MISSING_COPY.summary,
      ruleSuggestion: EXEC_CONTEXT_MISSING_COPY.suggestion,
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
        observationSummary: EXEC_SILENT_COPY.summary,
        explanationSummary: 'EXEC_ON_TRACK',
        impacts: [],
        actions: [],
        confidence: 0.9,
        evidenceRefs: [],
        factRefs: [],
        modeReason: 'EXEC_ON_TRACK',
        ruleSummary: EXEC_SILENT_COPY.summary,
        ruleSuggestion: EXEC_SILENT_COPY.suggestion,
        hasValidatedRecommendation: false,
        allowedFactTokens: tokens,
      };
    }
    return {
      mode: 'ATTENTION',
      priority: 'P2',
      insightType: 'EXPLANATION',
      title: '进度正常',
      observationSummary: EXEC_SILENT_COPY.summary,
      explanationSummary: 'EXPLICIT_ASK',
      impacts: [],
      recommendation: {
        summary: EXEC_SILENT_COPY.suggestion,
        rationale: EXEC_SILENT_COPY.suggestion,
      },
      actions: [],
      confidence: 0.9,
      evidenceRefs: [],
      factRefs: [],
      modeReason: 'EXPLICIT_ASK',
      ruleSummary: EXEC_SILENT_COPY.summary,
      ruleSuggestion: EXEC_SILENT_COPY.suggestion,
      hasValidatedRecommendation: true,
      allowedFactTokens: tokens,
    };
  }

  const summary = buildSummary(built);
  const suggestion = buildSuggestion(built);
  const actions = buildActions(built);
  const evidenceRefs = [
    ...(built.topRisk ? [`execution-risk:${built.topRisk.riskId}`] : []),
    ...(built.topProblem ? [`decision-problem:${built.topProblem.problemId}`] : []),
    `delay:${built.delayMinutes}`,
  ];

  if (built.severity === 'INTERVENTION') {
    const hasAction = actions.length > 0;
    return {
      mode: 'INTERVENTION',
      priority: 'P0',
      insightType: 'EXECUTION_RISK',
      title: '必须行动',
      observationSummary: summary,
      explanationSummary: built.advisoryHeadline ?? built.topRisk?.summary ?? summary,
      impacts: [
        {
          dimension: 'SAFETY',
          severity: 'CRITICAL',
          summary,
        },
      ],
      recommendation: hasAction
        ? { summary: suggestion, rationale: suggestion }
        : undefined,
      actions,
      confidence: 0.85,
      evidenceRefs,
      factRefs: evidenceRefs,
      modeReason: built.topRisk?.executionGate === 'STOP' ? 'SAFETY_RISK' : 'MUST_ADJUST',
      ruleSummary: summary,
      ruleSuggestion: hasAction ? suggestion : EXEC_NO_VALIDATED_FALLBACK.suggestion,
      hasValidatedRecommendation: hasAction,
      allowedFactTokens: tokens,
    };
  }

  // ATTENTION
  return {
    mode: 'ATTENTION',
    priority: 'P1',
    insightType: 'EXECUTION_RISK',
    title: '即将受影响',
    observationSummary: summary,
    explanationSummary: built.advisoryHeadline ?? summary,
    impacts: [
      {
        dimension: 'TIME',
        severity: 'MEDIUM',
        summary,
      },
    ],
    recommendation: {
      summary: suggestion,
      rationale: suggestion,
    },
    actions,
    confidence: 0.8,
    evidenceRefs,
    factRefs: evidenceRefs,
    modeReason: 'SCHEDULE_AT_RISK',
    ruleSummary: summary,
    ruleSuggestion: suggestion,
    hasValidatedRecommendation: true,
    allowedFactTokens: tokens,
  };
}

function buildSummary(built: ExecutionHomeBuiltContext): string {
  if (built.topRisk && (built.topRisk.level === 'CRITICAL' || built.topRisk.executionGate === 'STOP')) {
    return clampChars(built.topRisk.summary, 45);
  }
  if (built.delayMinutes > 0 && built.nextActivityLabel) {
    const extra = built.missWindowRisk
      ? `继续延误将错过「${built.nextActivityLabel}」时间窗。`
      : `仍可按计划抵达「${built.nextActivityLabel}」。`;
    return clampChars(
      `当前晚点${built.delayMinutes}分钟，${extra}`,
      45,
    );
  }
  if (built.advisoryHeadline) return clampChars(built.advisoryHeadline, 45);
  if (built.topRisk?.summary) return clampChars(built.topRisk.summary, 45);
  if (built.topProblem?.title) {
    return clampChars(`行中待决：「${built.topProblem.title}」。`, 45);
  }
  return clampChars('当前执行存在偏差，需关注下一站时间窗。', 45);
}

function buildSuggestion(built: ExecutionHomeBuiltContext): string {
  if (built.topRisk?.executionGate === 'STOP') return '请立即查看安全风险。';
  if (built.missWindowRisk) return '建议现在直接出发。';
  if (built.topRisk) return '请确认并查看调整建议。';
  if (built.topProblem) return '请打开决策处理。';
  if (built.delayMinutes >= 15) return '请抓紧前往下一站。';
  return '请关注当前风险。';
}

function buildActions(built: ExecutionHomeBuiltContext): InsightAction[] {
  const actions: InsightAction[] = [];
  if (built.topRisk) {
    actions.push({
      kind: 'COMMAND',
      label: '知晓风险',
      actionType: 'ACKNOWLEDGE_RISK',
      commandRef: `execution-risk:${built.topRisk.riskId}`,
      requiresConfirmation: true,
      validationRequired: true,
    });
    actions.push({
      kind: 'PREVIEW',
      label: '查看调整',
      actionType: 'PREVIEW_PLAN_CHANGE',
      payloadRef: `execution-risk-preview:${built.topRisk.riskId}`,
    });
  }
  if (built.topProblem) {
    actions.push({
      kind: 'PREVIEW',
      label: '打开决策',
      actionType: 'OPEN_DECISION',
      payloadRef: `decision-problem:${built.topProblem.problemId}`,
    });
  }
  return actions;
}

function clampChars(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, max).join('');
}
