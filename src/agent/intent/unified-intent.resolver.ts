/**
 * Unified Intent Resolver + Policy Arbiter（P0 规则层）。
 * LLM 消歧留待 P1；此处只做确定性动作/否定/范围裁决。
 */

import { extractUnifiedIntentSignals } from './unified-intent-signals.util';
import type {
  ExecutionRouteClass,
  MutationPolicy,
  RequestedOperation,
  SemanticIntent,
  UnifiedIntentConflict,
  UnifiedIntentDecision,
  UnifiedIntentEvidence,
  UnifiedIntentSecondary,
  UnifiedIntentSignals,
} from './unified-intent.types';
import { isHotelInventorySearchQuery } from '../utils/orchestration-signals.util';

function routeClassFor(
  intent: SemanticIntent,
  requested: RequestedOperation,
  requiresTripState: boolean,
): ExecutionRouteClass {
  if (requested === 'APPLY_DRAFT') return 'APPLY_CONFIRMED_DRAFT';
  switch (intent) {
    case 'ASSESS_IMPACT':
      return 'IMPACT_SIMULATION';
    case 'LOCAL_EDIT':
      return 'LOCAL_EDIT_DRAFT';
    case 'GLOBAL_PLAN':
      return 'FULL_PLAN_DRAFT';
    case 'CONSULT':
    default:
      return requiresTripState ? 'STATEFUL_QA' : 'LIGHT_QA';
  }
}

function requestedOpFor(
  intent: SemanticIntent,
  applyDraft: boolean,
): RequestedOperation {
  if (applyDraft) return 'APPLY_DRAFT';
  switch (intent) {
    case 'ASSESS_IMPACT':
      return 'SIMULATE';
    case 'LOCAL_EDIT':
    case 'GLOBAL_PLAN':
      return 'CREATE_DRAFT';
    case 'CONSULT':
    default:
      return 'ANSWER';
  }
}

function mutationFor(
  intent: SemanticIntent,
  applyDraft: boolean,
  noMutation: boolean,
): MutationPolicy {
  if (noMutation) return 'READ_ONLY';
  if (applyDraft) return 'CONFIRMED_APPLY';
  if (intent === 'LOCAL_EDIT' || intent === 'GLOBAL_PLAN') return 'DRAFT_ONLY';
  return 'READ_ONLY';
}

/**
 * 规则候选：按动作优先级，主题不参与抢占。
 */
export function resolveUnifiedIntentCandidate(
  signals: UnifiedIntentSignals,
): {
  semanticIntent: SemanticIntent;
  confidence: number;
  evidence: UnifiedIntentEvidence[];
  conflicts: UnifiedIntentConflict[];
  secondaryIntents: UnifiedIntentSecondary[];
} {
  const evidence: UnifiedIntentEvidence[] = [];
  const conflicts: UnifiedIntentConflict[] = [];
  const secondaryIntents: UnifiedIntentSecondary[] = [];

  const push = (signal: string, weight: number, source: UnifiedIntentEvidence['source'] = 'UTTERANCE') => {
    evidence.push({ source, signal, weight });
  };

  if (signals.hasGlobalPlanAct) push('global_plan_act', 1.0);
  if (signals.hasLocalEditAct) push('local_edit_act', 1.0);
  if (signals.hasAssessAct) push('assess_act', 1.0);
  if (signals.hasConsultAct) push('consult_act', 0.85);
  if (signals.explicitNoMutation) push('explicit_no_mutation', 1.0);
  if (signals.explicitApplyDraft) push('explicit_apply_draft', 1.0);
  if (signals.dayIndex != null) push(`day_anchor:${signals.dayIndex}`, 0.9);
  if (signals.tripId?.trim()) {
    evidence.push({
      source: 'TRIP_BINDING',
      signal: 'trip_id_present_context_only',
      weight: 0,
    });
  }
  if (signals.frontendSuggestedIntent) {
    evidence.push({
      source: 'FRONTEND_HINT',
      signal: `suggested:${signals.frontendSuggestedIntent}`,
      weight: 0.5,
    });
    conflicts.push({
      source: 'FRONTEND_HINT',
      proposedIntent: signals.frontendSuggestedIntent,
    });
  }

  let semanticIntent: SemanticIntent = 'CONSULT';
  let confidence = 0.55;

  if (signals.hasGlobalPlanAct) {
    semanticIntent = 'GLOBAL_PLAN';
    confidence = 0.92;
  } else if (signals.hasLocalEditAct) {
    semanticIntent = 'LOCAL_EDIT';
    confidence = 0.94;
  } else if (signals.hasAssessAct) {
    semanticIntent = 'ASSESS_IMPACT';
    confidence = 0.93;
  } else if (signals.hasConsultAct) {
    semanticIntent = 'CONSULT';
    confidence = 0.9;
  }

  /**
   * 包装层/「规划…行程」误触 GLOBAL 时：若用户话术是单日局部改稿（加活动/挪点等），降回 LOCAL_EDIT。
   */
  if (
    semanticIntent === 'GLOBAL_PLAN' &&
    signals.hasLocalEditAct &&
    (signals.scope === 'DAY' ||
      signals.scope === 'ACTIVITY' ||
      signals.dayIndex != null)
  ) {
    secondaryIntents.push({ intent: 'GLOBAL_PLAN', topic: signals.topic });
    semanticIntent = 'LOCAL_EDIT';
    confidence = 0.93;
    push('demote_global_wrapper_to_local_edit', 0.85);
  }

  /** 复合：主改稿 + 次要影响 */
  if (semanticIntent === 'LOCAL_EDIT' && signals.hasAssessAct) {
    secondaryIntents.push({ intent: 'ASSESS_IMPACT', topic: signals.topic });
    push('secondary_assess_with_local_edit', 0.7);
  }
  if (semanticIntent === 'ASSESS_IMPACT' && signals.hasLocalEditAct) {
    /** 若同时有强改稿动词，主意图已是 LOCAL_EDIT；此处兜底 */
    secondaryIntents.push({ intent: 'LOCAL_EDIT', topic: signals.topic });
  }

  /** 弱咨询兜底：有 trip 的短句无动作时仍 CONSULT，绝不因 trip 升 GLOBAL */
  if (
    !signals.hasGlobalPlanAct &&
    !signals.hasLocalEditAct &&
    !signals.hasAssessAct &&
    !signals.hasConsultAct
  ) {
    semanticIntent = 'CONSULT';
    confidence = 0.5;
    push('fallback_consult', 0.4);
  }

  return { semanticIntent, confidence, evidence, conflicts, secondaryIntents };
}

/**
 * Policy Arbiter：否定 / 应用草案 / 前端 hint 冲突的确定性裁决。
 */
export function applyIntentPolicy(input: {
  signals: UnifiedIntentSignals;
  candidate: ReturnType<typeof resolveUnifiedIntentCandidate>;
}): UnifiedIntentDecision {
  const { signals, candidate } = input;
  let intent = candidate.semanticIntent;
  const evidence = [...candidate.evidence];
  const conflicts = [...candidate.conflicts];
  let confidence = candidate.confidence;

  if (signals.explicitNoMutation) {
    if (intent === 'LOCAL_EDIT' || intent === 'GLOBAL_PLAN') {
      conflicts.push({ source: 'POLICY_NO_MUTATION', proposedIntent: intent });
      intent = signals.hasAssessAct ? 'ASSESS_IMPACT' : 'CONSULT';
      evidence.push({
        source: 'UTTERANCE',
        signal: 'policy_downgrade_due_to_no_mutation',
        weight: 1,
      });
      confidence = Math.min(confidence, 0.88);
    }
  }

  if (
    signals.frontendSuggestedIntent &&
    signals.frontendSuggestedIntent !== intent &&
    (signals.hasLocalEditAct ||
      signals.hasAssessAct ||
      signals.hasGlobalPlanAct ||
      signals.hasConsultAct)
  ) {
    /** 本轮明确动作压过前端 hint */
    evidence.push({
      source: 'FRONTEND_HINT',
      signal: 'hint_overridden_by_utterance_act',
      weight: 0.2,
    });
  }

  const applyDraft = signals.explicitApplyDraft && !signals.explicitNoMutation;
  const requestedOperation = requestedOpFor(intent, applyDraft);
  const mutationPolicy = mutationFor(intent, applyDraft, signals.explicitNoMutation);

  const requiresTripState =
    Boolean(signals.tripId?.trim()) ||
    intent === 'ASSESS_IMPACT' ||
    intent === 'LOCAL_EDIT' ||
    intent === 'GLOBAL_PLAN' ||
    signals.scope === 'DAY' ||
    signals.scope === 'MULTI_DAY' ||
    signals.scope === 'TRIP';

  const requiresRealityData =
    intent === 'ASSESS_IMPACT' ||
    intent === 'LOCAL_EDIT' ||
    intent === 'GLOBAL_PLAN' ||
    signals.topic === 'WEATHER' ||
    signals.topic === 'ROAD';

  const requiresDecisionSimulation =
    intent === 'ASSESS_IMPACT' || intent === 'GLOBAL_PLAN' || intent === 'LOCAL_EDIT';

  const routeClass = routeClassFor(intent, requestedOperation, requiresTripState);

  return {
    schema: 'tripnara.unified_intent_decision@v1',
    semanticIntent: intent,
    requestedOperation,
    topic: signals.topic,
    scope: signals.scope,
    target: {
      ...(signals.tripId?.trim() ? { tripId: signals.tripId.trim() } : {}),
      ...(signals.dayIndex != null ? { dayIndex: signals.dayIndex } : {}),
    },
    mutationPolicy,
    requiresTripState,
    requiresRealityData,
    requiresDecisionSimulation,
    confidence,
    evidence,
    conflicts,
    routeClass,
    ...(candidate.secondaryIntents.length
      ? { secondaryIntents: candidate.secondaryIntents }
      : {}),
  };
}

export type ResolveUnifiedIntentInput = {
  message: string;
  tripId?: string | null;
  entryPoint?: string | null;
  /** 前端 hint（非权威） */
  frontendSuggestedIntent?: SemanticIntent | null;
};

/**
 * 统一意图入口：信号 → 候选 → 裁决 → 冻结决策。
 */
export function resolveUnifiedIntent(
  input: ResolveUnifiedIntentInput,
): UnifiedIntentDecision {
  const signals = extractUnifiedIntentSignals(input);
  let candidate = resolveUnifiedIntentCandidate(signals);
  /**
   * 「我要有替换上的酒店选择」含「替换」会触 LOCAL_EDIT，但实质是 DayN 住宿库存检索。
   * 降为 CONSULT，便于 ModeLock 旁路 + LIGHTWEIGHT 出酒店卡，避免 ROR REPLACE 追问阻断。
   */
  if (
    candidate.semanticIntent === 'LOCAL_EDIT' &&
    isHotelInventorySearchQuery(String(input.message ?? ''))
  ) {
    candidate = {
      ...candidate,
      semanticIntent: 'CONSULT',
      confidence: Math.max(candidate.confidence, 0.9),
      secondaryIntents: [
        ...candidate.secondaryIntents,
        { intent: 'LOCAL_EDIT', topic: signals.topic },
      ],
      evidence: [
        ...candidate.evidence,
        {
          source: 'UTTERANCE',
          signal: 'demote_lodging_inventory_local_edit_to_consult',
          weight: 0.95,
        },
      ],
    };
  }
  return applyIntentPolicy({ signals, candidate });
}
