/**
 * Unified Intent Shadow — P0 观测：新旧路由对比，不改变现网分发。
 */

import { resolveUnifiedIntent } from './unified-intent.resolver';
import type {
  ExecutionRouteClass,
  SemanticIntent,
  UnifiedIntentDecision,
  UnifiedIntentShadowCompare,
} from './unified-intent.types';

function mapLegacyRouteLabel(input: {
  taskType?: string;
  actionKind?: string;
  creOperation?: string;
  routeMode?: string;
}): string {
  const mode = input.routeMode ?? '';
  const cre = input.creOperation ?? '';
  const action = input.actionKind ?? '';
  const task = input.taskType ?? '';

  if (mode === 'LIGHTWEIGHT' || cre === 'ASK_TRIP_QUESTION') {
    return task === 'DATA_LOOKUP' || action === 'TRIP_SCOPED_CONSULTATION'
      ? 'STATEFUL_QA_OR_LIGHT_QA'
      : 'LIGHT_QA';
  }
  if (cre === 'CHECK_EXECUTABILITY' || action === 'SAFETY_OR_TRADEOFF_REVIEW') {
    return 'IMPACT_OR_SAFETY';
  }
  if (
    cre === 'ADD_ACTIVITY_TO_DAY' ||
    cre === 'REPLACE_ACTIVITY' ||
    cre === 'MOVE_ACTIVITY' ||
    action === 'LOCAL_ITINERARY_EDIT'
  ) {
    return 'LOCAL_EDIT_DRAFT';
  }
  if (
    cre === 'OPTIMIZE_TRIP' ||
    cre === 'OPTIMIZE_DAY' ||
    cre === 'REPLAN_DUE_TO_RISK' ||
    action === 'FULL_TRIP_PLANNING' ||
    task === 'TRIP_PLANNING'
  ) {
    return 'FULL_PLAN_DRAFT';
  }
  return `LEGACY:${task || 'unknown'}/${action || 'unknown'}/${cre || 'unknown'}`;
}

function expectedLegacyCompatible(routeClass: ExecutionRouteClass): string[] {
  switch (routeClass) {
    case 'LIGHT_QA':
      return ['LIGHT_QA', 'STATEFUL_QA_OR_LIGHT_QA'];
    case 'STATEFUL_QA':
      return ['STATEFUL_QA_OR_LIGHT_QA', 'LIGHT_QA'];
    case 'IMPACT_SIMULATION':
      return ['IMPACT_OR_SAFETY'];
    case 'LOCAL_EDIT_DRAFT':
      return ['LOCAL_EDIT_DRAFT'];
    case 'FULL_PLAN_DRAFT':
      return ['FULL_PLAN_DRAFT'];
    case 'APPLY_CONFIRMED_DRAFT':
      return ['APPLY_CONFIRMED_DRAFT', 'LOCAL_EDIT_DRAFT', 'FULL_PLAN_DRAFT'];
    default:
      return [];
  }
}

export function buildUnifiedIntentShadowCompare(input: {
  message: string;
  tripId?: string | null;
  entryPoint?: string | null;
  frontendSuggestedIntent?: SemanticIntent | null;
  legacyTaskType?: string;
  legacyActionKind?: string;
  legacyCreOperation?: string;
  legacyRouteMode?: string;
  legacyDecisionDepth?: string;
  decision?: UnifiedIntentDecision;
}): UnifiedIntentShadowCompare {
  const decision =
    input.decision ??
    resolveUnifiedIntent({
      message: input.message,
      tripId: input.tripId,
      entryPoint: input.entryPoint,
      frontendSuggestedIntent: input.frontendSuggestedIntent,
    });

  const legacyRouteLabel = mapLegacyRouteLabel({
    taskType: input.legacyTaskType,
    actionKind: input.legacyActionKind,
    creOperation: input.legacyCreOperation,
    routeMode: input.legacyRouteMode,
  });

  const compatible = expectedLegacyCompatible(decision.routeClass);
  const routeMismatch = !compatible.some(
    (c) => legacyRouteLabel === c || legacyRouteLabel.startsWith(c),
  );

  const mismatchReasons: string[] = [];
  if (routeMismatch) {
    mismatchReasons.push(
      `new_route=${decision.routeClass} legacy_label=${legacyRouteLabel}`,
    );
  }
  if (
    decision.semanticIntent === 'LOCAL_EDIT' &&
    (input.legacyCreOperation === 'ASK_TRIP_QUESTION' ||
      input.legacyTaskType === 'DATA_LOOKUP')
  ) {
    mismatchReasons.push('local_edit_misrouted_as_consult');
  }
  if (
    decision.semanticIntent === 'CONSULT' &&
    (input.legacyCreOperation === 'OPTIMIZE_TRIP' ||
      input.legacyActionKind === 'FULL_TRIP_PLANNING')
  ) {
    mismatchReasons.push('consult_misrouted_as_global_plan');
  }
  if (
    decision.semanticIntent === 'ASSESS_IMPACT' &&
    input.legacyCreOperation === 'ASK_TRIP_QUESTION'
  ) {
    mismatchReasons.push('assess_misrouted_as_slim_qa');
  }

  return {
    schema: 'tripnara.unified_intent_shadow@v1',
    legacyTaskType: input.legacyTaskType,
    legacyActionKind: input.legacyActionKind,
    legacyCreOperation: input.legacyCreOperation,
    legacyRouteMode: input.legacyRouteMode,
    legacyDecisionDepth: input.legacyDecisionDepth,
    legacyRouteLabel,
    decision,
    routeMismatch: mismatchReasons.length > 0 || routeMismatch,
    mismatchReasons: [...new Set(mismatchReasons)],
  };
}

export function serializeUnifiedIntentShadow(
  shadow: UnifiedIntentShadowCompare,
): Record<string, unknown> {
  return {
    schema: shadow.schema,
    legacyTaskType: shadow.legacyTaskType,
    legacyActionKind: shadow.legacyActionKind,
    legacyCreOperation: shadow.legacyCreOperation,
    legacyRouteMode: shadow.legacyRouteMode,
    legacyDecisionDepth: shadow.legacyDecisionDepth,
    legacyRouteLabel: shadow.legacyRouteLabel,
    routeMismatch: shadow.routeMismatch,
    mismatchReasons: shadow.mismatchReasons,
    newSemanticIntent: shadow.decision.semanticIntent,
    newRoute: shadow.decision.routeClass,
    newTopic: shadow.decision.topic,
    newScope: shadow.decision.scope,
    newMutationPolicy: shadow.decision.mutationPolicy,
    confidence: shadow.decision.confidence,
    target: shadow.decision.target,
    secondaryIntents: shadow.decision.secondaryIntents ?? [],
  };
}
