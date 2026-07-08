/**
 * Project Unified Decision Problem list/detail → Consumer Decision Queue items.
 * Engineering fields (engineId, flow, canonicalSummary) stay out of consumer view.
 */

import type {
  UnifiedDecisionProblemListItem,
} from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { DecisionAction } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import { ORIGINAL_CANDIDATE_ID } from '../../guardian-decision-core/adapters/repair-candidate.adapter';
import { mapDecisionActionsToConsumerRepairOptions } from '../../exploration/utils/consumer-repair-option.mapper';
import type {
  ConsumerDecisionActions,
  ConsumerDecisionEvidenceSummary,
  ConsumerDecisionItem,
  ConsumerDecisionRecommendation,
} from '../types/travel-status.types';
import { CONSUMER_DECISION_ITEM_SCHEMA_ID } from '../types/travel-status.types';

export function projectListItemToConsumerDecision(
  item: UnifiedDecisionProblemListItem,
  options?: { actions?: DecisionAction[] },
): ConsumerDecisionItem {
  const severity = mapEnforcementToConsumerSeverity(item.enforcement);
  const repairOptions = options?.actions?.length
    ? mapDecisionActionsToConsumerRepairOptions(options.actions)
    : [];
  const recommended = pickRecommendedOption(item, options?.actions ?? [], repairOptions);
  const consumerActions = buildConsumerActions(
    item,
    options?.actions ?? [],
    recommended?.recommendedActionId,
  );

  return {
    schemaId: CONSUMER_DECISION_ITEM_SCHEMA_ID,
    problemId: item.problemId,
    headline: item.title,
    impact: buildImpactCopy(item),
    explanation: item.summary,
    severity,
    affectedDayNumbers: item.scope.dayIds,
    affectedScopeLabel: formatScopeLabel(item),
    recommendation: recommended,
    actions: consumerActions,
    evidenceSummary: buildEvidenceSummary(item),
  };
}

export function buildDecisionQueueHeadline(openCount: number, blockingCount: number): string {
  if (openCount === 0) return '当前没有需要您决定的事项';
  if (blockingCount > 0) {
    return `今天需要您决定 ${openCount} 件事，其中 ${blockingCount} 项可能影响行程执行`;
  }
  return `今天需要您决定 ${openCount} 件事`;
}

export function buildExecutabilityHeadline(input: {
  blockingCount: number;
  openCount: number;
  pendingVerificationCount: number;
}): { status: 'READY' | 'NEEDS_ATTENTION' | 'BLOCKED'; headline: string } {
  if (input.blockingCount > 0) {
    return {
      status: 'BLOCKED',
      headline: `当前行程有 ${input.blockingCount} 个问题需要先处理才能顺利执行`,
    };
  }
  if (input.openCount > 0) {
    return {
      status: 'NEEDS_ATTENTION',
      headline: `行程总体可执行，但有 ${input.openCount} 个事项建议您确认`,
    };
  }
  if (input.pendingVerificationCount > 0) {
    return {
      status: 'NEEDS_ATTENTION',
      headline: `行程总体可执行，${input.pendingVerificationCount} 个事项将在出发前重新检查`,
    };
  }
  return {
    status: 'READY',
    headline: '当前行程可执行',
  };
}

function mapEnforcementToConsumerSeverity(
  enforcement: UnifiedDecisionProblemListItem['enforcement'],
): ConsumerDecisionItem['severity'] {
  switch (enforcement) {
    case 'BLOCK':
      return 'BLOCK';
    case 'REQUIRE_ADJUSTMENT':
    case 'REQUIRE_CONFIRMATION':
      return 'CONFLICT';
    case 'WARN':
      return 'VERIFY';
    default:
      return 'OPTIMIZE';
  }
}

function buildImpactCopy(item: UnifiedDecisionProblemListItem): string {
  const days = item.scope.dayIds;
  if (days?.length) {
    const dayLabel = days.length === 1 ? `第 ${days[0]} 天` : `第 ${days.join('、')} 天`;
    return `影响 ${dayLabel} 的安排`;
  }
  if (item.affectsPlan) {
    return '可能影响当前可执行行程';
  }
  return '可能影响部分行程安排';
}

function formatScopeLabel(item: UnifiedDecisionProblemListItem): string | undefined {
  const days = item.scope.dayIds;
  if (!days?.length) return undefined;
  if (days.length === 1) return `Day ${days[0]}`;
  return `Day ${days.join(', ')}`;
}

function buildEvidenceSummary(
  item: UnifiedDecisionProblemListItem,
): ConsumerDecisionEvidenceSummary | undefined {
  if (!item.evidenceSummary?.count) return undefined;
  const detector = item.detectors[0];
  return {
    sourceLabel: detector?.label,
    confidence:
      item.evidenceSummary.confidence != null && item.evidenceSummary.confidence >= 0.8
        ? 'HIGH'
        : item.evidenceSummary.confidence != null && item.evidenceSummary.confidence >= 0.5
          ? 'MEDIUM'
          : 'LOW',
    freshness: item.evidenceSummary.freshness,
  };
}

function pickRecommendedOption(
  item: UnifiedDecisionProblemListItem,
  actions: DecisionAction[],
  repairOptions: ReturnType<typeof mapDecisionActionsToConsumerRepairOptions>,
): ConsumerDecisionRecommendation | undefined {
  const allowed = actions.filter((a) => a.allowed && !a.blockedReason);
  if (!allowed.length) return undefined;

  const recommendedType = item.actionability.recommendedAction;
  const preferred =
    (recommendedType
      ? allowed.find((a) => a.type === recommendedType)
      : undefined) ?? allowed[0];

  const repair = repairOptions.find((o) => o.optionId === preferred.actionId);

  return {
    title: preferred.title,
    summary: preferred.summary,
    keeps: repair?.preserves ?? ['尽量保留当前旅行目标'],
    costs: repair?.sacrifices ?? ['可能需要调整部分安排'],
    recommendedActionId: preferred.actionId,
  };
}

function buildConsumerActions(
  item: UnifiedDecisionProblemListItem,
  actions: DecisionAction[],
  recommendedActionId?: string,
): ConsumerDecisionActions {
  const allowed = actions.filter((a) => a.allowed && !a.blockedReason);
  const alternativeCount = Math.max(0, allowed.length - (recommendedActionId ? 1 : 0));
  const keepOriginalAction = resolveKeepOriginalAction(actions);
  const deferAction = resolveDeferAction(actions);
  const canOfferSecondaryActions =
    item.enforcement !== 'BLOCK' && item.actionability.requiresAction;

  return {
    acceptRecommended: {
      enabled: Boolean(recommendedActionId && item.actionability.requiresAction),
      actionId: recommendedActionId,
    },
    keepOriginal: {
      enabled: Boolean(canOfferSecondaryActions && keepOriginalAction?.actionId),
      actionId: keepOriginalAction?.actionId,
    },
    viewAlternatives: {
      enabled: allowed.length > 1,
      count: alternativeCount || allowed.length,
    },
    defer: {
      enabled: Boolean(canOfferSecondaryActions && deferAction?.actionId),
      actionId: deferAction?.actionId,
    },
  };
}

function pickAllowedAction(
  actions: DecisionAction[],
  predicate: (action: DecisionAction) => boolean,
): DecisionAction | undefined {
  return actions.find((action) => action.allowed && !action.blockedReason && predicate(action));
}

/** 保留原计划 — canonical `original` 候选，或 legacy ACCEPT_RISK。 */
function resolveKeepOriginalAction(actions: DecisionAction[]): DecisionAction | undefined {
  return (
    pickAllowedAction(actions, (action) => action.actionId === ORIGINAL_CANDIDATE_ID) ??
    pickAllowedAction(actions, (action) => action.type === 'ACCEPT_RISK')
  );
}

function resolveDeferAction(actions: DecisionAction[]): DecisionAction | undefined {
  return pickAllowedAction(actions, (action) => action.type === 'DEFER');
}
