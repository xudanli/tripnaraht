/**
 * Deterministic Activity Editor insight selection (no LLM inventing recommendations).
 */

import type {
  InsightAction,
  InsightImpact,
  InsightMode,
  InsightPriority,
  InsightType,
} from '../contracts/page-insight.types';
import {
  ACTIVITY_CONTEXT_MISSING_COPY,
  ACTIVITY_NO_VALIDATED_FALLBACK,
  ACTIVITY_SILENT_COPY,
} from '../contracts/activity-editor-ai';
import type { ActivityEditorBuiltContext } from './activity-editor-page-context.builder';
import type { PlanProposal } from '../../arrange-itinerary/types/plan-proposal.types';

export interface ActivityEditorInsightSelection {
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
    recommendedOptionId?: string;
  };
  actions: InsightAction[];
  confidence: number;
  evidenceRefs: string[];
  factRefs: string[];
  modeReason?: string;
  /** Rule advisor body/advice before LLM polish. */
  ruleSummary: string;
  ruleSuggestion: string;
  hasValidatedRecommendation: boolean;
  allowedFactTokens: string[];
}

export function selectActivityEditorInsight(input: {
  built: ActivityEditorBuiltContext;
  explicitAsk?: boolean;
}): ActivityEditorInsightSelection {
  const { built, explicitAsk } = input;
  const tokens = built.allowedFactTokens;

  if (!built.gate.ok) {
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'DATA_UNCERTAINTY',
      title: '缺少上下文',
      observationSummary: ACTIVITY_CONTEXT_MISSING_COPY.summary,
      explanationSummary: `missing=${built.gate.missing.join(',')}`,
      impacts: [],
      actions: [],
      confidence: 0.9,
      evidenceRefs: [],
      factRefs: [],
      modeReason: 'CONTEXT_MISSING',
      ruleSummary: ACTIVITY_CONTEXT_MISSING_COPY.summary,
      ruleSuggestion: ACTIVITY_CONTEXT_MISSING_COPY.suggestion,
      hasValidatedRecommendation: false,
      allowedFactTokens: tokens,
    };
  }

  const proposal = built.proposal;
  if (!proposal) {
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'EXPLANATION',
      title: '方案未验证',
      observationSummary: ACTIVITY_NO_VALIDATED_FALLBACK.summary,
      explanationSummary: built.proposalError ?? 'NO_PROPOSAL',
      impacts: [],
      actions: [],
      confidence: 0.7,
      evidenceRefs: [],
      factRefs: factRefs(built),
      modeReason: 'NO_VALIDATED_RECOMMENDATION',
      ruleSummary: ACTIVITY_NO_VALIDATED_FALLBACK.summary,
      ruleSuggestion: ACTIVITY_NO_VALIDATED_FALLBACK.suggestion,
      hasValidatedRecommendation: false,
      allowedFactTokens: tokens,
    };
  }

  const materialImpact = hasMaterialImpact(proposal);
  const status = proposal.validation.status;
  const actions = buildActions(proposal);
  const evidenceRefs = [`plan-proposal:${proposal.proposalId}`];

  if (status === 'BLOCK') {
    const summary = buildBlockSummary(built, proposal);
    return {
      mode: 'INTERVENTION',
      priority: 'P0',
      insightType: 'DECISION_REQUIRED',
      title: '无法加入',
      observationSummary: summary,
      explanationSummary: proposal.validation.conflicts.map((c) => c.message).join('；') || summary,
      impacts: [
        {
          dimension: 'TIME',
          severity: 'HIGH',
          summary,
        },
      ],
      recommendation: undefined,
      actions: actions.filter((a) => a.kind === 'PREVIEW' || a.kind === 'NAVIGATION'),
      confidence: 0.85,
      evidenceRefs,
      factRefs: factRefs(built),
      modeReason: 'HARD_TIME_CONFLICT',
      ruleSummary: summary,
      ruleSuggestion: '请先比较方案影响。',
      hasValidatedRecommendation: false,
      allowedFactTokens: tokens,
    };
  }

  if (status === 'WARN' || materialImpact) {
    const summary = buildWarnSummary(built, proposal);
    const suggestion = buildWarnSuggestion(built, proposal);
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'OPTIMIZATION',
      title: '加入有影响',
      observationSummary: summary,
      explanationSummary: proposal.diff.summary || summary,
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
        recommendedOptionId: proposal.proposalId,
      },
      actions,
      confidence: 0.8,
      evidenceRefs,
      factRefs: factRefs(built),
      modeReason: materialImpact ? 'MATERIAL_SCHEDULE_IMPACT' : 'VALIDATION_WARN',
      ruleSummary: summary,
      ruleSuggestion: suggestion,
      hasValidatedRecommendation: true,
      allowedFactTokens: tokens,
    };
  }

  // PASS + no material impact
  if (!explicitAsk) {
    return {
      mode: 'SILENT',
      priority: 'P2',
      insightType: 'EXPLANATION',
      title: '无需提醒',
      observationSummary: ACTIVITY_SILENT_COPY.summary,
      explanationSummary: proposal.diff.summary || 'PASS',
      impacts: [],
      recommendation: {
        summary: ACTIVITY_SILENT_COPY.suggestion,
        rationale: ACTIVITY_SILENT_COPY.suggestion,
        recommendedOptionId: proposal.proposalId,
      },
      actions: [],
      confidence: 0.9,
      evidenceRefs,
      factRefs: factRefs(built),
      modeReason: 'NO_MATERIAL_IMPACT',
      ruleSummary: ACTIVITY_SILENT_COPY.summary,
      ruleSuggestion: ACTIVITY_SILENT_COPY.suggestion,
      hasValidatedRecommendation: true,
      allowedFactTokens: tokens,
    };
  }

  // Explicit ask on clean PASS — light ATTENTION with preview action
  return {
    mode: 'ATTENTION',
    priority: 'P2',
    insightType: 'EXPLANATION',
    title: '可直接加入',
    observationSummary: ACTIVITY_SILENT_COPY.summary,
    explanationSummary: proposal.diff.summary || 'PASS',
    impacts: [],
    recommendation: {
      summary: ACTIVITY_SILENT_COPY.suggestion,
      rationale: ACTIVITY_SILENT_COPY.suggestion,
      recommendedOptionId: proposal.proposalId,
    },
    actions,
    confidence: 0.9,
    evidenceRefs,
    factRefs: factRefs(built),
    modeReason: 'EXPLICIT_ASK',
    ruleSummary: ACTIVITY_SILENT_COPY.summary,
    ruleSuggestion: ACTIVITY_SILENT_COPY.suggestion,
    hasValidatedRecommendation: true,
    allowedFactTokens: tokens,
  };
}

function factRefs(built: ActivityEditorBuiltContext): string[] {
  const refs: string[] = [];
  if (built.placeId != null) refs.push(`poi:${built.placeId}`);
  if (built.dayIndex != null) refs.push(`day:${built.dayIndex}`);
  return refs;
}

function hasMaterialImpact(proposal: PlanProposal): boolean {
  if (proposal.validation.warnings.length > 0) return true;
  if (proposal.validation.conflicts.length > 0) return true;
  return proposal.diff.timelineChanges.some(
    (c) => c.impact === 'medium' || c.impact === 'high',
  );
}

function buildActions(proposal: PlanProposal): InsightAction[] {
  return [
    {
      kind: 'PREVIEW',
      label: '预览加入',
      actionType: 'PREVIEW_ADD_ACTIVITY',
      payloadRef: `plan-proposal:${proposal.proposalId}`,
    },
  ];
}

function buildBlockSummary(
  built: ActivityEditorBuiltContext,
  proposal: PlanProposal,
): string {
  const conflict = proposal.validation.conflicts[0]?.message;
  if (conflict) return clampChars(conflict, 45);
  const hours = Math.round((built.durationMinutes ?? 120) / 60);
  return clampChars(
    `加入后与当日安排冲突，约延长${hours}小时，当前目标日不可行。`,
    45,
  );
}

function buildWarnSummary(
  built: ActivityEditorBuiltContext,
  proposal: PlanProposal,
): string {
  const warn = proposal.validation.warnings[0];
  if (warn) return clampChars(warn, 45);
  const high = proposal.diff.timelineChanges.find(
    (c) => c.impact === 'high' || c.impact === 'medium',
  );
  if (high) {
    return clampChars(
      `加入后影响「${high.label}」${high.to ? `（${high.to}）` : ''}。`,
      45,
    );
  }
  const hours = Math.round((built.durationMinutes ?? 120) / 60);
  const day = built.dayIndex ?? '?';
  return clampChars(`加入后第${day}天将延长约${hours}小时。`, 45);
}

function buildWarnSuggestion(
  built: ActivityEditorBuiltContext,
  proposal: PlanProposal,
): string {
  const tradeoff = proposal.tradeoffs[0];
  if (tradeoff) return clampChars(tradeoff, 22);
  if (built.dayIndex != null) {
    return clampChars(`建议预览第${built.dayIndex}天影响。`, 22);
  }
  return '建议先预览加入影响。';
}

function clampChars(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, max).join('');
}
