/**
 * DecisionOption / repairOptions → unified DecisionAction[] (P0-7 adapter layer).
 */

import type {
  DecisionOption,
  DecisionOptionType,
  TradeoffDimension,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { Rfc001DecisionCenterProblemView } from '../../../trips/guardian-decision-core/adapters/decision-center-bridge.adapter';
import type {
  DecisionAction,
  DecisionActionExpectedImpact,
  DecisionWriteChain,
  UnifiedDecisionProblemActionability,
} from '../contracts/unified-decision-ui.types';
import { ENFORCEMENT_ALLOWED_ACTIONS } from './decision-queue-admission.util';
import type { ConstraintEnforcement } from '../../../trips/decision-semantics/types/decision-semantics.types';
import { normalizeDecisionOptionSource } from './decision-option-source.util';

export function inferWriteChain(
  authority: 'CANONICAL' | 'LEGACY' | 'DECISION_CASE',
): DecisionWriteChain {
  if (authority === 'CANONICAL') return 'EVALUATE_AUTHORIZE_EXECUTE';
  if (authority === 'DECISION_CASE') return 'CONSTRAINT_WRITEBACK';
  return 'APPLY_AND_POLL';
}

export function projectDecisionOptionToAction(
  option: DecisionOption,
  ctx: {
    tripId: string;
    problemId: string;
    enforcement: ConstraintEnforcement;
    authority: 'CANONICAL' | 'LEGACY' | 'DECISION_CASE';
  },
): DecisionAction {
  const allowedTypes = ENFORCEMENT_ALLOWED_ACTIONS[ctx.enforcement] ?? [];
  const typeAllowed = allowedTypes.includes(option.type);
  const allowed = typeAllowed && option.executable !== false;

  return {
    actionId: option.id,
    type: option.type,
    source: normalizeDecisionOptionSource(option.source),
    title: option.title,
    summary: option.description,
    expectedImpact: tradeoffsToExpectedImpact(option.tradeoffs),
    requiresConfirmation: option.requiresConfirmation,
    allowed,
    blockedReason: !typeAllowed
      ? `${ctx.enforcement} 不允许 ${option.type}`
      : option.executable === false
        ? option.blockedReason ?? '当前方案不可执行'
        : undefined,
    navigationTarget: buildNavigationTarget(option, ctx),
    ...(option.executionSlipPreview ? { executionSlipPreview: option.executionSlipPreview } : {}),
  };
}

export function projectDecisionOptionsToActions(
  options: DecisionOption[],
  ctx: {
    tripId: string;
    problemId: string;
    enforcement: ConstraintEnforcement;
    authority: 'CANONICAL' | 'LEGACY' | 'DECISION_CASE';
  },
): DecisionAction[] {
  return options.map((opt) => projectDecisionOptionToAction(opt, ctx));
}

/** Product read path — only allowed actions; suppressed returned when includeDebug. */
export function partitionActionsForProductView(
  actions: DecisionAction[],
  includeDebug?: boolean,
): { actions: DecisionAction[]; suppressedActions?: DecisionAction[] } {
  const allowedActions = actions.filter((action) => action.allowed);
  const suppressedActions = actions.filter((action) => !action.allowed);
  if (includeDebug && suppressedActions.length > 0) {
    return { actions: allowedActions, suppressedActions };
  }
  return { actions: allowedActions };
}

export function buildActionabilityWithWriteChain(input: {
  enforcement: ConstraintEnforcement;
  requiresAction: boolean;
  allowedActions: DecisionOptionType[];
  authority: 'CANONICAL' | 'LEGACY' | 'DECISION_CASE';
}): UnifiedDecisionProblemActionability & { writeChain: DecisionWriteChain } {
  return {
    requiresAction: input.requiresAction,
    allowedActions: input.allowedActions,
    recommendedAction: input.allowedActions[0],
    writeChain: inferWriteChain(input.authority),
  };
}

export function extractCanonicalResolution(
  view: Rfc001DecisionCenterProblemView,
): import('../contracts/unified-decision-ui.types').DecisionResolutionSummary | undefined {
  const record = view.record;
  if (!record?.decisionId) return undefined;
  return {
    resolutionId: record.decisionId,
    problemId: view.problemId,
    selectedActionId: record.selectedCandidateId ?? '',
    status: mapRecordStatusToResolutionStatus(record.recordStatus),
    decidedAt: record.decidedAt,
    actionPlanId: view.planVersion?.planVersionId,
  };
}

function mapRecordStatusToResolutionStatus(
  status?: string,
): import('../contracts/unified-decision-ui.types').DecisionResolutionSummary['status'] {
  switch (status) {
    case 'PROPOSED':
      return 'PROPOSED';
    case 'AUTHORIZED':
      return 'AUTHORIZED';
    case 'EFFECTIVE':
    case 'EXECUTED':
      return 'APPLIED';
    case 'ROLLED_BACK':
      return 'ROLLED_BACK';
    default:
      return 'PROPOSED';
  }
}

function tradeoffsToExpectedImpact(tradeoffs: TradeoffDimension[]): DecisionActionExpectedImpact | undefined {
  if (!tradeoffs.length) return undefined;
  const impact: DecisionActionExpectedImpact = {};
  for (const t of tradeoffs) {
    if (t.dimension === 'TIME' && typeof t.value === 'number') {
      impact.durationDelta = t.direction === 'WORSEN' ? t.value : -t.value;
    }
    if (t.dimension === 'COST' && typeof t.value === 'number') {
      impact.budgetDelta = t.direction === 'WORSEN' ? t.value : -t.value;
    }
    const days = t.affectedScope
      ?.filter((s) => s.scopeType === 'DAY')
      .map((s) => Number(s.scopeId))
      .filter((n) => Number.isFinite(n));
    if (days?.length) {
      impact.affectedDays = [...new Set([...(impact.affectedDays ?? []), ...days])];
    }
  }
  return Object.keys(impact).length ? impact : undefined;
}

function resolveActionExternalUrl(option: DecisionOption): string | undefined {
  const fromParams = option.repairCommand?.parameters?.externalUrl;
  if (typeof fromParams === 'string' && /^https?:\/\//.test(fromParams.trim())) {
    return fromParams.trim();
  }

  const urlMatch = option.description?.match(/https?:\/\/[^\s）)]+/);
  if (urlMatch?.[0]) {
    return urlMatch[0];
  }

  return undefined;
}

function buildNavigationTarget(
  option: DecisionOption,
  ctx: {
    tripId: string;
    problemId: string;
    authority: 'CANONICAL' | 'LEGACY' | 'DECISION_CASE';
  },
): DecisionAction['navigationTarget'] {
  const externalUrl = resolveActionExternalUrl(option);
  const withExternalUrl = (
    target: NonNullable<DecisionAction['navigationTarget']>,
  ): NonNullable<DecisionAction['navigationTarget']> =>
    externalUrl ? { ...target, params: { ...target.params, externalUrl } } : target;

  if (ctx.authority === 'CANONICAL' || ctx.authority === 'DECISION_CASE') {
    return withExternalUrl({
      command: 'OPEN_DECISION_SPACE',
      params: {
        tripId: ctx.tripId,
        problemId: ctx.problemId,
        actionId: option.id,
      },
    });
  }

  if (option.repairCommand?.commandType === 'CHANGE_ROUTE') {
    return withExternalUrl({
      command: 'OPEN_CONSTRAINT',
      params: { tripId: ctx.tripId, problemId: ctx.problemId, actionId: option.id },
    });
  }

  const itemRef = option.repairCommand?.targetRefs?.find((r) => r.entityType === 'ITINERARY_ITEM');
  if (itemRef?.entityId) {
    return withExternalUrl({
      command: 'OPEN_SCHEDULE_ITEM',
      params: {
        tripId: ctx.tripId,
        problemId: ctx.problemId,
        itemId: itemRef.entityId,
        actionId: option.id,
      },
    });
  }

  return withExternalUrl({
    command: 'OPEN_PLAN_GATE',
    params: { tripId: ctx.tripId, problemId: ctx.problemId, actionId: option.id },
  });
}
