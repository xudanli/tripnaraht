/**
 * Unified Intent P1 — LLM 结构化消歧（固定 Schema）。
 * 仅用于 Shadow / 评测；不得直接决定现网执行器（须经 Policy Arbiter）。
 */

import { parseJsonFromLlmText } from '../../llm/utils/parse-llm-json.util';
import { extractUnifiedIntentSignals } from './unified-intent-signals.util';
import type {
  IntentScope,
  IntentTopic,
  RequestedOperation,
  SemanticIntent,
  UnifiedIntentDecision,
  UnifiedIntentSignals,
} from './unified-intent.types';
import {
  INTENT_SCOPES,
  INTENT_TOPICS,
  REQUESTED_OPERATIONS,
  SEMANTIC_INTENTS,
} from './unified-intent.types';

export const UNIFIED_INTENT_LLM_SCHEMA = 'tripnara.unified_intent_llm@v1' as const;

export type UnifiedIntentLlmOutput = {
  schema: typeof UNIFIED_INTENT_LLM_SCHEMA;
  semanticIntent: SemanticIntent;
  requestedOperation: RequestedOperation;
  topic: IntentTopic;
  scope: IntentScope;
  dayIndex?: number | null;
  mutationPolicy: 'READ_ONLY' | 'DRAFT_ONLY' | 'CONFIRMED_APPLY';
  confidence: number;
  rationale?: string;
};

export type UnifiedIntentLlmShadowCompare = {
  schema: 'tripnara.unified_intent_llm_shadow@v1';
  ran: boolean;
  reasonSkipped?: string;
  ruleIntent: SemanticIntent;
  ruleConfidence: number;
  llm?: UnifiedIntentLlmOutput | null;
  agree: boolean | null;
  disagreement?: string[];
  error?: string;
};

const SEMANTIC_SET = new Set<string>(SEMANTIC_INTENTS);
const OP_SET = new Set<string>(REQUESTED_OPERATIONS);
const TOPIC_SET = new Set<string>(INTENT_TOPICS);
const SCOPE_SET = new Set<string>(INTENT_SCOPES);
const MUT_SET = new Set(['READ_ONLY', 'DRAFT_ONLY', 'CONFIRMED_APPLY']);

/** 规则层是否需要 LLM 消歧（多动作冲突 / 低置信 / 复合句） */
export function shouldDisambiguateUnifiedIntentWithLlm(input: {
  signals: UnifiedIntentSignals;
  decision: UnifiedIntentDecision;
}): boolean {
  const { signals, decision } = input;
  const actCount = [
    signals.hasConsultAct,
    signals.hasAssessAct,
    signals.hasLocalEditAct,
    signals.hasGlobalPlanAct,
  ].filter(Boolean).length;

  if (actCount >= 2) return true;
  if (decision.confidence < 0.75) return true;
  if ((decision.secondaryIntents?.length ?? 0) > 0) return true;
  if (decision.conflicts.some((c) => c.source === 'FRONTEND_HINT')) return true;
  /** 主题强、动作弱：易被关键词误判 */
  if (
    decision.confidence < 0.9 &&
    (signals.topic === 'MEAL' || signals.topic === 'WEATHER') &&
    !signals.hasLocalEditAct &&
    !signals.hasAssessAct &&
    !signals.hasGlobalPlanAct
  ) {
    return true;
  }
  return false;
}

export function buildUnifiedIntentLlmPrompt(input: {
  utterance: string;
  tripExists: boolean;
  entryPoint?: string | null;
  ruleSignals: UnifiedIntentSignals;
  ruleDecision: UnifiedIntentDecision;
}): string {
  const { utterance, tripExists, entryPoint, ruleSignals, ruleDecision } = input;
  return [
    'You classify ONE user utterance for a trip-planning assistant into a fixed JSON schema.',
    'Do NOT invent fields. Topic is NOT intent (weather/meal are topics).',
    'SemanticIntent: CONSULT | ASSESS_IMPACT | LOCAL_EDIT | GLOBAL_PLAN',
    'RequestedOperation: ANSWER | SIMULATE | CREATE_DRAFT | APPLY_DRAFT',
    'Scope: POINT | ACTIVITY | DAY | MULTI_DAY | TRIP',
    'mutationPolicy: READ_ONLY | DRAFT_ONLY | CONFIRMED_APPLY',
    'Rules:',
    '- Explicit "先别改/不要写入" → READ_ONLY; prefer ASSESS_IMPACT or CONSULT over LOCAL_EDIT.',
    '- "安排/加到/换成" with day → LOCAL_EDIT + CREATE_DRAFT.',
    '- "会不会影响/赶不上" → ASSESS_IMPACT + SIMULATE.',
    '- "重新规划整个行程" → GLOBAL_PLAN.',
    '- tripExists does NOT imply GLOBAL_PLAN.',
    'Return ONLY a JSON object (no markdown) with keys:',
    'schema, semanticIntent, requestedOperation, topic, scope, dayIndex, mutationPolicy, confidence, rationale',
    `schema must be "${UNIFIED_INTENT_LLM_SCHEMA}".`,
    '',
    `utterance: ${JSON.stringify(utterance)}`,
    `tripExists: ${tripExists}`,
    `entryPoint: ${JSON.stringify(entryPoint ?? null)}`,
    `ruleSignals: ${JSON.stringify({
      hasConsultAct: ruleSignals.hasConsultAct,
      hasAssessAct: ruleSignals.hasAssessAct,
      hasLocalEditAct: ruleSignals.hasLocalEditAct,
      hasGlobalPlanAct: ruleSignals.hasGlobalPlanAct,
      explicitNoMutation: ruleSignals.explicitNoMutation,
      topic: ruleSignals.topic,
      scope: ruleSignals.scope,
      dayIndex: ruleSignals.dayIndex ?? null,
    })}`,
    `ruleDecision: ${JSON.stringify({
      semanticIntent: ruleDecision.semanticIntent,
      requestedOperation: ruleDecision.requestedOperation,
      routeClass: ruleDecision.routeClass,
      confidence: ruleDecision.confidence,
    })}`,
  ].join('\n');
}

export function parseUnifiedIntentLlmOutput(raw: string): UnifiedIntentLlmOutput {
  const parsed = parseJsonFromLlmText(raw) as Record<string, unknown>;
  const semanticIntent = String(parsed.semanticIntent ?? '');
  const requestedOperation = String(parsed.requestedOperation ?? '');
  const topic = String(parsed.topic ?? 'GENERAL');
  const scope = String(parsed.scope ?? 'TRIP');
  const mutationPolicy = String(parsed.mutationPolicy ?? 'READ_ONLY');
  const confidence = Number(parsed.confidence);

  if (!SEMANTIC_SET.has(semanticIntent)) {
    throw new Error(`invalid semanticIntent: ${semanticIntent}`);
  }
  if (!OP_SET.has(requestedOperation)) {
    throw new Error(`invalid requestedOperation: ${requestedOperation}`);
  }
  if (!TOPIC_SET.has(topic)) {
    throw new Error(`invalid topic: ${topic}`);
  }
  if (!SCOPE_SET.has(scope)) {
    throw new Error(`invalid scope: ${scope}`);
  }
  if (!MUT_SET.has(mutationPolicy)) {
    throw new Error(`invalid mutationPolicy: ${mutationPolicy}`);
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`invalid confidence: ${parsed.confidence}`);
  }

  let dayIndex: number | null | undefined = undefined;
  if (parsed.dayIndex != null && parsed.dayIndex !== '') {
    const n = Number(parsed.dayIndex);
    if (Number.isFinite(n) && n > 0) dayIndex = Math.floor(n);
    else dayIndex = null;
  }

  return {
    schema: UNIFIED_INTENT_LLM_SCHEMA,
    semanticIntent: semanticIntent as SemanticIntent,
    requestedOperation: requestedOperation as RequestedOperation,
    topic: topic as IntentTopic,
    scope: scope as IntentScope,
    dayIndex,
    mutationPolicy: mutationPolicy as UnifiedIntentLlmOutput['mutationPolicy'],
    confidence,
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 240) : undefined,
  };
}

export type UnifiedIntentLlmCaller = (prompt: string) => Promise<string>;

/**
 * 跑 LLM 消歧并与规则决策对比（P1 Shadow，不改路由）。
 */
export async function runUnifiedIntentLlmShadow(input: {
  message: string;
  tripId?: string | null;
  entryPoint?: string | null;
  ruleDecision: UnifiedIntentDecision;
  callLlm: UnifiedIntentLlmCaller;
  /** 强制跑（忽略 shouldDisambiguate） */
  force?: boolean;
}): Promise<UnifiedIntentLlmShadowCompare> {
  const signals = extractUnifiedIntentSignals({
    message: input.message,
    tripId: input.tripId,
    entryPoint: input.entryPoint,
  });

  if (
    !input.force &&
    !shouldDisambiguateUnifiedIntentWithLlm({
      signals,
      decision: input.ruleDecision,
    })
  ) {
    return {
      schema: 'tripnara.unified_intent_llm_shadow@v1',
      ran: false,
      reasonSkipped: 'rules_confident_no_conflict',
      ruleIntent: input.ruleDecision.semanticIntent,
      ruleConfidence: input.ruleDecision.confidence,
      llm: null,
      agree: null,
    };
  }

  try {
    const prompt = buildUnifiedIntentLlmPrompt({
      utterance: signals.utterance,
      tripExists: Boolean(input.tripId?.trim()),
      entryPoint: input.entryPoint,
      ruleSignals: signals,
      ruleDecision: input.ruleDecision,
    });
    const raw = await input.callLlm(prompt);
    const llm = parseUnifiedIntentLlmOutput(raw);
    const disagreement: string[] = [];
    if (llm.semanticIntent !== input.ruleDecision.semanticIntent) {
      disagreement.push(
        `semanticIntent rule=${input.ruleDecision.semanticIntent} llm=${llm.semanticIntent}`,
      );
    }
    if (llm.requestedOperation !== input.ruleDecision.requestedOperation) {
      disagreement.push(
        `requestedOperation rule=${input.ruleDecision.requestedOperation} llm=${llm.requestedOperation}`,
      );
    }
    if (llm.mutationPolicy !== input.ruleDecision.mutationPolicy) {
      disagreement.push(
        `mutationPolicy rule=${input.ruleDecision.mutationPolicy} llm=${llm.mutationPolicy}`,
      );
    }
    return {
      schema: 'tripnara.unified_intent_llm_shadow@v1',
      ran: true,
      ruleIntent: input.ruleDecision.semanticIntent,
      ruleConfidence: input.ruleDecision.confidence,
      llm,
      agree: disagreement.length === 0,
      ...(disagreement.length ? { disagreement } : {}),
    };
  } catch (e: unknown) {
    return {
      schema: 'tripnara.unified_intent_llm_shadow@v1',
      ran: true,
      ruleIntent: input.ruleDecision.semanticIntent,
      ruleConfidence: input.ruleDecision.confidence,
      llm: null,
      agree: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function serializeUnifiedIntentLlmShadow(
  shadow: UnifiedIntentLlmShadowCompare,
): Record<string, unknown> {
  return {
    schema: shadow.schema,
    ran: shadow.ran,
    reasonSkipped: shadow.reasonSkipped,
    ruleIntent: shadow.ruleIntent,
    ruleConfidence: shadow.ruleConfidence,
    agree: shadow.agree,
    disagreement: shadow.disagreement,
    error: shadow.error,
    llm: shadow.llm
      ? {
          semanticIntent: shadow.llm.semanticIntent,
          requestedOperation: shadow.llm.requestedOperation,
          topic: shadow.llm.topic,
          scope: shadow.llm.scope,
          dayIndex: shadow.llm.dayIndex ?? null,
          mutationPolicy: shadow.llm.mutationPolicy,
          confidence: shadow.llm.confidence,
          rationale: shadow.llm.rationale,
        }
      : null,
  };
}
