/**
 * Deterministic Itinerary Day Editor insight selection.
 * Day planning advisor: completeness → conflicts → gaps/booking — not system tips.
 */

import type {
  InsightAction,
  InsightImpact,
  InsightMode,
  InsightPriority,
  InsightType,
} from '../contracts/page-insight.types';
import {
  DAY_CONTEXT_MISSING_COPY,
  DAY_NO_VALIDATED_FALLBACK,
  DAY_SILENT_COPY,
  dayPlanStatusTitle,
} from '../contracts/itinerary-day-editor-ai';
import type {
  DayGapSummary,
  ItineraryDayEditorBuiltContext,
} from './itinerary-day-editor-page-context.builder';
import type { PlanProposal } from '../../arrange-itinerary/types/plan-proposal.types';

export interface ItineraryDayEditorInsightSelection {
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
  ruleSummary: string;
  ruleSuggestion: string;
  hasValidatedRecommendation: boolean;
  allowedFactTokens: string[];
  dayPlanStatus?: string;
}

export function selectItineraryDayEditorInsight(input: {
  built: ItineraryDayEditorBuiltContext;
  explicitAsk?: boolean;
}): ItineraryDayEditorInsightSelection {
  const { built, explicitAsk } = input;
  const tokens = built.allowedFactTokens;

  if (!built.gate.ok) {
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'DATA_UNCERTAINTY',
      title: '缺少上下文',
      observationSummary: DAY_CONTEXT_MISSING_COPY.summary,
      explanationSummary: `missing=${built.gate.missing.join(',')}`,
      impacts: [],
      actions: [],
      confidence: 0.9,
      evidenceRefs: [],
      factRefs: [],
      modeReason: 'CONTEXT_MISSING',
      ruleSummary: DAY_CONTEXT_MISSING_COPY.summary,
      ruleSuggestion: DAY_CONTEXT_MISSING_COPY.suggestion,
      hasValidatedRecommendation: false,
      allowedFactTokens: tokens,
      dayPlanStatus: undefined,
    };
  }

  if (built.dayPlanStatus === 'READY') {
    if (!explicitAsk) {
      return {
        mode: 'SILENT',
        priority: 'P2',
        insightType: 'EXPLANATION',
        title: dayPlanStatusTitle('READY', built.dayIndex),
        observationSummary: DAY_SILENT_COPY.summary,
        explanationSummary: 'DAY_READY',
        impacts: [],
        actions: [],
        confidence: 0.9,
        evidenceRefs: factRefs(built),
        factRefs: factRefs(built),
        modeReason: 'DAY_CLEAR',
        ruleSummary: DAY_SILENT_COPY.summary,
        ruleSuggestion: DAY_SILENT_COPY.suggestion,
        hasValidatedRecommendation: false,
        allowedFactTokens: tokens,
        dayPlanStatus: 'READY',
      };
    }
    return {
      mode: 'ATTENTION',
      priority: 'P2',
      insightType: 'EXPLANATION',
      title: dayPlanStatusTitle('READY', built.dayIndex),
      observationSummary: DAY_SILENT_COPY.summary,
      explanationSummary: 'EXPLICIT_ASK',
      impacts: [],
      actions: [],
      confidence: 0.9,
      evidenceRefs: factRefs(built),
      factRefs: factRefs(built),
      modeReason: 'EXPLICIT_ASK',
      ruleSummary: DAY_SILENT_COPY.summary,
      ruleSuggestion: DAY_SILENT_COPY.suggestion,
      hasValidatedRecommendation: false,
      allowedFactTokens: tokens,
      dayPlanStatus: 'READY',
    };
  }

  if (built.dayPlanStatus === 'INCOMPLETE') {
    const summary = buildIncompleteSummary(built);
    const suggestion = '先生成当天活动草案。';
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'OPTIMIZATION',
      title: dayPlanStatusTitle('INCOMPLETE', built.dayIndex),
      observationSummary: summary,
      explanationSummary: built.incompleteReason ?? 'INCOMPLETE',
      impacts: [
        {
          dimension: 'TIME',
          severity: 'MEDIUM',
          summary,
        },
      ],
      recommendation: { summary: suggestion, rationale: suggestion },
      actions: incompleteActions(built),
      confidence: 0.9,
      evidenceRefs: factRefs(built),
      factRefs: factRefs(built),
      modeReason: 'DAY_INCOMPLETE',
      ruleSummary: summary,
      ruleSuggestion: suggestion,
      hasValidatedRecommendation: true,
      allowedFactTokens: tokens,
      dayPlanStatus: 'INCOMPLETE',
    };
  }

  if (built.dayPlanStatus === 'BLOCKED') {
    return selectBlocked(built, tokens);
  }

  // TIGHT / OPTIMIZABLE — prefer concrete day facts over raw feasibility text
  const planning = buildPlanningCopy(built);
  const proposal = built.proposal;
  const actions = buildPrimaryActions(built, proposal, planning.primaryKind);

  if (built.dayPlanStatus === 'TIGHT') {
    const hasValidated =
      !!proposal &&
      proposal.validation.status !== 'BLOCK' &&
      planning.primaryKind === 'REPAIR';
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      insightType: 'OPTIMIZATION',
      title: dayPlanStatusTitle('TIGHT', built.dayIndex),
      observationSummary: planning.summary,
      explanationSummary: built.topIssue?.message ?? planning.summary,
      impacts: [
        {
          dimension: 'TIME',
          severity: 'MEDIUM',
          summary: planning.summary,
        },
      ],
      recommendation: hasValidated
        ? {
            summary: planning.suggestion,
            rationale: planning.suggestion,
            recommendedOptionId: proposal?.proposalId,
          }
        : { summary: planning.suggestion, rationale: planning.suggestion },
      actions,
      confidence: 0.85,
      evidenceRefs: [
        ...factRefs(built),
        ...(proposal ? [`plan-proposal:${proposal.proposalId}`] : []),
      ],
      factRefs: factRefs(built),
      modeReason: hasValidated ? 'DAY_SOFT_CONFLICT' : 'DAY_TIGHT',
      ruleSummary: planning.summary,
      ruleSuggestion: planning.suggestion,
      hasValidatedRecommendation: true,
      allowedFactTokens: tokens,
      dayPlanStatus: 'TIGHT',
    };
  }

  // OPTIMIZABLE
  const hasValidated =
    !!proposal &&
    (proposal.validation.status === 'WARN' || proposal.validation.status === 'PASS') &&
    planning.primaryKind === 'REPAIR';
  return {
    mode: 'ATTENTION',
    priority: 'P1',
    insightType: 'OPTIMIZATION',
    title: dayPlanStatusTitle('OPTIMIZABLE', built.dayIndex),
    observationSummary: planning.summary,
    explanationSummary: built.topIssue?.message ?? planning.summary,
    impacts: [
      {
        dimension: planning.primaryKind === 'BOOKING' ? 'BOOKING' : 'TIME',
        severity: 'MEDIUM',
        summary: planning.summary,
      },
    ],
    recommendation: {
      summary: planning.suggestion,
      rationale: planning.suggestion,
      recommendedOptionId: hasValidated ? proposal?.proposalId : undefined,
    },
    actions,
    confidence: 0.85,
    evidenceRefs: [
      ...factRefs(built),
      ...(proposal ? [`plan-proposal:${proposal.proposalId}`] : []),
    ],
    factRefs: factRefs(built),
    modeReason: hasValidated ? 'DAY_SOFT_CONFLICT' : 'DAY_OPTIMIZABLE',
    ruleSummary: planning.summary,
    ruleSuggestion: planning.suggestion,
    hasValidatedRecommendation: true,
    allowedFactTokens: tokens,
    dayPlanStatus: 'OPTIMIZABLE',
  };
}

function selectBlocked(
  built: ItineraryDayEditorBuiltContext,
  tokens: string[],
): ItineraryDayEditorInsightSelection {
  const proposal = built.proposal;
  const summary =
    built.localOverlap?.detail ||
    (built.topIssue && !built.topIssue.systemMaintenance
      ? clampChars(built.topIssue.message, 45)
      : '当天存在硬冲突，当前安排无法按计划完成。');
  const actions = proposal
    ? buildActionsFromProposal(built, proposal)
    : [
        {
          kind: 'NAVIGATION' as const,
          label: '打开冲突',
          target: {
            pageId: 'DECISION_SPACE' as const,
            entityRef: built.topIssue
              ? {
                  entityType: 'FEASIBILITY_ISSUE',
                  entityId: built.topIssue.issueId,
                }
              : { entityType: 'DAY', entityId: String(built.dayIndex ?? '') },
          },
        },
      ];
  const validated =
    !!proposal && proposal.validation.status !== 'BLOCK';
  const suggestion = validated
    ? clampChars(proposal!.tradeoffs[0] || '先预览调序方案。', 20)
    : DAY_NO_VALIDATED_FALLBACK.suggestion;

  return {
    mode: 'INTERVENTION',
    priority: 'P0',
    insightType: 'DECISION_REQUIRED',
    title: dayPlanStatusTitle('BLOCKED', built.dayIndex),
    observationSummary: summary,
    explanationSummary: built.proposalError ?? built.topIssue?.message ?? summary,
    impacts: [{ dimension: 'TIME', severity: 'HIGH', summary }],
    recommendation: validated
      ? {
          summary: suggestion,
          rationale: suggestion,
          recommendedOptionId: proposal!.proposalId,
        }
      : undefined,
    actions,
    confidence: 0.85,
    evidenceRefs: [
      ...factRefs(built),
      ...(proposal ? [`plan-proposal:${proposal.proposalId}`] : []),
    ],
    factRefs: factRefs(built),
    modeReason: validated ? 'UNRESOLVED_CONFLICT' : 'NO_VALIDATED_RECOMMENDATION',
    ruleSummary: summary,
    ruleSuggestion: suggestion,
    hasValidatedRecommendation: validated,
    allowedFactTokens: tokens,
    dayPlanStatus: 'BLOCKED',
  };
}

type PrimaryKind = 'BOOKING' | 'GAP' | 'REPAIR' | 'GENERIC';

function buildPlanningCopy(built: ItineraryDayEditorBuiltContext): {
  summary: string;
  suggestion: string;
  primaryKind: PrimaryKind;
} {
  const lodgingPending = built.dayItems.filter(
    (i) => i.needsBooking && /ACCOMMODATION|HOTEL|LODGING|STAY/i.test(i.type),
  );
  const gap = built.longestGap;
  const pending = built.pendingBookingLabels;

  // Prefer lodging confirm when activities exist and lodging is pending
  if (lodgingPending.length > 0 && built.activityCount > 0) {
    const confirmed = built.confirmedActivityLabels.slice(0, 2);
    const gapHint =
      gap != null ? `${gap.startTime}后仍有空档；` : '';
    const names =
      confirmed.length > 0
        ? `${confirmed.join('和')}已确认，`
        : '';
    return {
      summary: clampChars(
        `${names}${gapHint}今晚「${lodgingPending[0]!.label}」尚未预订。`,
        45,
      ),
      suggestion: '先确认今晚住宿。',
      primaryKind: 'BOOKING',
    };
  }

  // Gaps + multiple pending bookings
  if (gap && pending.length >= 2) {
    const names = pending.slice(0, 3).join('、');
    return {
      summary: clampChars(
        `${describeGaps(built.gaps)}，${names}均待预订。`,
        45,
      ),
      suggestion: '先确认预订，再决定是否补活动。',
      primaryKind: 'BOOKING',
    };
  }

  if (gap && pending.length === 1) {
    return {
      summary: clampChars(
        `${gap.startTime}至${gap.endTime}有空档；「${pending[0]}」待预订。`,
        45,
      ),
      suggestion: '先确认待预订项。',
      primaryKind: 'BOOKING',
    };
  }

  if (pending.length > 0 && !gap) {
    const names = pending.slice(0, 3).join('、');
    return {
      summary: clampChars(`当天路线基本完整，但${names}尚未确认预订。`, 45),
      suggestion: '先确认会影响时间窗的预订。',
      primaryKind: 'BOOKING',
    };
  }

  if (gap) {
    return {
      summary: clampChars(
        `${gap.startTime}至${gap.endTime}有较长空档，可补充一项附近活动。`,
        45,
      ),
      suggestion: '查看顺路且无需预订的活动。',
      primaryKind: 'GAP',
    };
  }

  if (built.localOverlap) {
    return {
      summary: clampChars(built.localOverlap.detail, 45),
      suggestion: '先预览调序避开重叠。',
      primaryKind: 'REPAIR',
    };
  }

  if (
    built.topIssue &&
    !built.topIssue.systemMaintenance &&
    built.proposal &&
    built.proposal.validation.status !== 'BLOCK'
  ) {
    const suggestion = clampChars(
      built.proposal.tradeoffs[0] || '预览调序方案。',
      20,
    );
    return {
      summary: clampChars(built.topIssue.message, 45),
      suggestion,
      primaryKind: 'REPAIR',
    };
  }

  if (built.topIssue && !built.topIssue.systemMaintenance) {
    return {
      summary: clampChars(built.topIssue.message, 45),
      suggestion: DAY_NO_VALIDATED_FALLBACK.suggestion,
      primaryKind: 'REPAIR',
    };
  }

  return {
    summary: clampChars(`第${built.dayIndex ?? '?'}天安排仍可优化。`, 45),
    suggestion: '先核对空档与预订。',
    primaryKind: 'GENERIC',
  };
}

function describeGaps(gaps: DayGapSummary[]): string {
  if (gaps.length >= 2) return `下午有${gaps.length}段空档`;
  if (gaps.length === 1) {
    const g = gaps[0]!;
    return `${g.startTime}至${g.endTime}有空档`;
  }
  return '当天存在空档';
}

function buildIncompleteSummary(built: ItineraryDayEditorBuiltContext): string {
  const lodging = built.dayItems.find((i) =>
    /ACCOMMODATION|HOTEL|LODGING|STAY/i.test(i.type),
  );
  if (lodging && built.activityCount === 0) {
    return clampChars(
      `Day ${built.dayIndex ?? '?'} 目前只有住宿，关键活动与往返路线尚未安排。`,
      45,
    );
  }
  return clampChars(
    built.incompleteReason
      ? `Day ${built.dayIndex ?? '?'} ${built.incompleteReason}。`
      : `Day ${built.dayIndex ?? '?'} 规划不完整，暂时无法验证可行性。`,
    45,
  );
}

function incompleteActions(built: ItineraryDayEditorBuiltContext): InsightAction[] {
  return [
    {
      kind: 'PREVIEW',
      label: '生成当天草案',
      actionType: 'GENERATE_DAY_DRAFT',
      payloadRef: `day-draft:${built.dayIndex}`,
    },
    {
      kind: 'PREVIEW',
      label: '安排活动',
      actionType: 'FILL_GAP',
      payloadRef: `day-fill:${built.dayIndex}`,
    },
  ];
}

function buildPrimaryActions(
  built: ItineraryDayEditorBuiltContext,
  proposal: PlanProposal | undefined,
  primaryKind: PrimaryKind,
): InsightAction[] {
  const actions: InsightAction[] = [];

  if (primaryKind === 'BOOKING') {
    const lodging = built.dayItems.find(
      (i) => i.needsBooking && /ACCOMMODATION|HOTEL|LODGING|STAY/i.test(i.type),
    );
    actions.push({
      kind: 'PREVIEW',
      label: lodging ? '确认住宿' : '确认待预订',
      actionType: lodging ? 'OPEN_LODGING' : 'CONFIRM_BOOKING',
      payloadRef: lodging
        ? `lodging:${lodging.itemId}`
        : `day-booking:${built.dayIndex}`,
    });
    if (built.longestGap) {
      actions.push({
        kind: 'PREVIEW',
        label: '补充活动',
        actionType: 'FILL_GAP',
        payloadRef: `day-gap:${built.dayIndex}:${built.longestGap.startTime}`,
      });
    }
    return actions;
  }

  if (primaryKind === 'GAP') {
    actions.push({
      kind: 'PREVIEW',
      label: '补充活动',
      actionType: 'FILL_GAP',
      payloadRef: `day-gap:${built.dayIndex}:${built.longestGap?.startTime ?? ''}`,
    });
    return actions;
  }

  if (proposal) {
    return buildActionsFromProposal(built, proposal);
  }

  if (built.topIssue && !built.topIssue.systemMaintenance) {
    actions.push({
      kind: 'NAVIGATION',
      label: '查看原因',
      target: {
        pageId: 'DECISION_SPACE',
        entityRef: {
          entityType: 'FEASIBILITY_ISSUE',
          entityId: built.topIssue.issueId,
        },
      },
    });
  }
  return actions;
}

function buildActionsFromProposal(
  built: ItineraryDayEditorBuiltContext,
  proposal: PlanProposal,
): InsightAction[] {
  const actionType = built.proposalActionType ?? 'PREVIEW_REORDER';
  const label =
    actionType === 'ADD_BUFFER'
      ? '预览加缓冲'
      : actionType === 'MOVE_TO_ANOTHER_DAY'
        ? '预览移日'
        : '预览调序';
  const actions: InsightAction[] = [
    {
      kind: 'PREVIEW',
      label,
      actionType,
      payloadRef: `plan-proposal:${proposal.proposalId}`,
    },
  ];
  if (built.topIssue && !built.topIssue.systemMaintenance && built.topIssue.issueId !== 'local_overlap') {
    actions.push({
      kind: 'NAVIGATION',
      label: '打开冲突',
      target: {
        pageId: 'DECISION_SPACE',
        entityRef: {
          entityType: 'FEASIBILITY_ISSUE',
          entityId: built.topIssue.issueId,
        },
      },
    });
  }
  return actions;
}

function factRefs(built: ItineraryDayEditorBuiltContext): string[] {
  const refs: string[] = [];
  if (built.dayIndex != null) refs.push(`day:${built.dayIndex}`);
  if (built.dayId) refs.push(`day-id:${built.dayId}`);
  return refs;
}

function clampChars(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return chars.slice(0, max).join('');
}
