/**
 * Deterministic Decision Space insight selection (no LLM, no new rules).
 *
 * SILENT policy (Decision Space — page already shows the queue):
 * - Default SILENT: routine open decisions are visible in the list; do not nag.
 * - ATTENTION: only when Contract attentionTriggers fire with *extra* value
 *   (material option divergence, stale evidence), or explicitAsk (「问 Nara」).
 * - INTERVENTION: Contract interventionTriggers (blocking / safety).
 */

import type {
  DecisionAction,
  UnifiedDecisionOptionsView,
  UnifiedDecisionProblemListItem,
} from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type {
  InsightAction,
  InsightDimension,
  InsightImpact,
  InsightMode,
  InsightPriority,
  InsightType,
  ImpactSeverity,
} from '../contracts/page-insight.types';
import { DECISION_SPACE_PAGE_AI_CONTRACT } from '../contracts/page-ai-contracts';
import {
  buildInsuranceAdvisorFromContext,
  buildInsuranceContextMissingSelection,
  type InsuranceDecisionContext,
} from '../contracts/insurance-decision-context.types';
import { isRentalInsuranceProblem } from '../contracts/insurance-decision-context.types';
import {
  buildVehicleAdvisorFromContext,
  buildVehicleContextMissingSelection,
  type VehicleDecisionContext,
} from '../contracts/vehicle-decision-context.types';
import { isVehicleRoadFitProblem } from '../contracts/vehicle-decision-context.types';
import {
  getDecisionCaseAIContract,
  preferredInsightModeForCase,
  shouldCaseProactivelySurface,
  type DecisionCaseAIContract,
} from '../contracts/decision-case-ai-contracts';
import {
  buildNoValidatedRecommendationSelection,
  detectDataConflict,
  isGenericScheduleConflictProblem,
  pickValidatedRecommendation,
  type RecommendGatePreview,
} from '../contracts/generic-conflict-ai';

export interface DeterministicInsightSelection {
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
  causalChainRefs?: string[];
  focusedProblemId?: string;
  /** Why mode was chosen — for metrics / debug, not product copy. */
  modeReason?: string;
  /** Resolved Decision Case AI Contract semanticKey (or CANONICAL.GENERIC). */
  caseAiSemanticKey?: string;
  caseAiMode?: DecisionCaseAIContract['aiMode'];
  /** Structured decision card when TravelCausalDecision is attached. */
  causalDecisionCard?: import('../../../travel-causal-decision').CausalDecisionCardView;
}

const ALLOWED = new Set(DECISION_SPACE_PAGE_AI_CONTRACT.allowedActionTypes);
const POLICY = DECISION_SPACE_PAGE_AI_CONTRACT.proactivePolicy;

export function selectDecisionSpaceInsight(input: {
  openProblems: UnifiedDecisionProblemListItem[];
  focused?: UnifiedDecisionProblemListItem;
  optionsView?: UnifiedDecisionOptionsView;
  /** User tapped「问 Nara」/ forceRefresh — allow EXPLANATION even without proactive trigger. */
  explicitAsk?: boolean;
  /**
   * When FE selected a ref that is not in Gateway open queue
   * (problemId/instanceKey miss, terminal, or not admitted).
   */
  focusResolveStatus?: string;
  /**
   * LIST = queue / inbox; DETAIL = already viewing this problem.
   * DETAIL suppresses redundant ATTENTION (options already on screen).
   */
  surface?: 'LIST' | 'DETAIL';
  /** Rental insurance trip pack from Context Builder. */
  insuranceContext?: InsuranceDecisionContext;
  /** Vehicle road-fit trip pack from Context Builder. */
  vehicleContext?: VehicleDecisionContext;
  /**
   * Validated option previews for generic schedule conflicts.
   * Without these, Copilot must NOT invent a recommendation.
   */
  validatedPreviews?: RecommendGatePreview[];
  planVersion?: string | null;
}): DeterministicInsightSelection {
  const {
    openProblems,
    focused,
    optionsView,
    explicitAsk = false,
    focusResolveStatus,
    surface = 'LIST',
    insuranceContext,
    vehicleContext,
    validatedPreviews,
    planVersion,
  } = input;

  if (
    focusResolveStatus === 'SELECTED_NOT_IN_QUEUE' ||
    focusResolveStatus === 'SELECTED_TERMINAL'
  ) {
    return {
      mode: 'SILENT',
      priority: 'P2',
      insightType: 'EXPLANATION',
      title: '当前选中问题不在开放队列',
      observationSummary:
        focusResolveStatus === 'SELECTED_TERMINAL'
          ? '选中的决策问题已结束（已决定/已关闭），无需主动提醒。'
          : '选中的决策问题未出现在 Gateway 开放队列中（可能 key 不一致、未入队或已合并）。',
      explanationSummary:
        'Copilot open 集合来自 listProblems（queueOnly），不是 UI 本地列表，也不是 DecisionWorkspace 行集合。',
      impacts: [],
      actions: [],
      confidence: 1,
      evidenceRefs: [],
      factRefs: [],
      modeReason: focusResolveStatus,
    };
  }

  if (!focused || openProblems.length === 0) {
    return silentEmpty();
  }

  // Insurance hard gate — Context Builder responsibility, before Narrative/LLM
  if (
    isRentalInsuranceProblem({
      problemId: focused.problemId,
      semanticKey: focused.semanticKey,
      domain: focused.decisionCase?.domain,
    })
  ) {
    const missing =
      insuranceContext?.gate.missing ??
      (['ROUTE_SUMMARY', 'VEHICLE_BOOKING'] as Array<'ROUTE_SUMMARY' | 'VEHICLE_BOOKING'>);
    const gateFailed = !insuranceContext || !insuranceContext.gate.ok;
    if (gateFailed) {
      const missingSel = buildInsuranceContextMissingSelection({
        focusedProblemId: focused.problemId,
        missing,
      });
      return {
        ...missingSel,
        actions: missingSel.actions as InsightAction[],
      };
    }
  }

  // Vehicle hard gate — primary Contextual Copilot example
  if (
    isVehicleRoadFitProblem({
      problemId: focused.problemId,
      semanticKey: focused.semanticKey,
      domain: focused.decisionCase?.domain,
    })
  ) {
    const missing =
      vehicleContext?.gate.missing ??
      (['ROUTE_SUMMARY', 'ROAD_EXPOSURE'] as Array<'ROUTE_SUMMARY' | 'ROAD_EXPOSURE'>);
    const gateFailed = !vehicleContext || !vehicleContext.gate.ok;
    if (gateFailed) {
      const missingSel = buildVehicleContextMissingSelection({
        focusedProblemId: focused.problemId,
        missing,
      });
      return {
        ...missingSel,
        actions: missingSel.actions as InsightAction[],
      };
    }
  }

  // Generic schedule conflict — recommend only validated previews
  let validatedPick: ReturnType<typeof pickValidatedRecommendation> = null;
  if (
    isGenericScheduleConflictProblem({
      problemId: focused.problemId,
      semanticKey: focused.semanticKey,
      type: focused.type,
      title: focused.title,
      hasDecisionCase: !!focused.decisionCase,
    })
  ) {
    const factSummaries = [focused.summary, focused.title].filter(Boolean) as string[];
    const options = (optionsView?.actions ?? [])
      .filter((a) => a.allowed && a.type !== 'DEFER')
      .map((a) => ({
        optionId: a.actionId,
        title: a.title,
        allowed: a.allowed,
      }));
    validatedPick =
      validatedPreviews?.length && options.length
        ? pickValidatedRecommendation({
            problem: {
              id: focused.problemId,
              planVersion: planVersion ?? null,
              factSummaries,
            },
            options,
            previews: validatedPreviews,
          })
        : null;

    if (!validatedPick) {
      const dataConflict =
        !!validatedPreviews?.length &&
        validatedPreviews.some((p) =>
          detectDataConflict({
            factSummaries,
            recommendationText: p.claimedLabels?.join(' '),
            claimedLabels: p.claimedLabels,
          }),
        );
      const missingSel = buildNoValidatedRecommendationSelection({
        focusedProblemId: focused.problemId,
        conflictSummary: focused.summary?.trim() || focused.title,
        dataConflict,
      });
      return {
        ...missingSel,
        actions: missingSel.actions as InsightAction[],
        caseAiSemanticKey: 'CANONICAL.SCHEDULE_CONFLICT',
        caseAiMode: 'EXPLAIN_AND_RECOMMEND',
      };
    }
  }

  const triggers = detectTriggers(focused, optionsView);
  const caseContract = getDecisionCaseAIContract({
    semanticKey: focused.semanticKey,
    problemId: focused.problemId,
    hasDecisionCase: !!focused.decisionCase,
    type: focused.type,
    title: focused.title,
  });
  const highImpact =
    triggers.blockingDecision ||
    triggers.safetyRelated ||
    (focused.decisionCase?.materialityScore ?? 0) >= 8 ||
    focused.enforcement === 'BLOCK';
  const matchedOrGated =
    focused.decisionCase?.enrichmentStage === 'ENRICHED' ||
    (focused.evidenceSummary?.count ?? 0) >= 2 ||
    explicitAsk;

  const caseAllowsProactive = shouldCaseProactivelySurface({
    contract: caseContract,
    explicitAsk,
    highImpact,
    matchedOrGated,
  });

  let { mode, priority, modeReason } = resolveMode(triggers, explicitAsk, surface);

  // Opportunity / soft-gate: stay SILENT when Case Contract says not matched
  if (
    !caseAllowsProactive &&
    !explicitAsk &&
    mode !== 'SILENT' &&
    (caseContract.proactiveMode === 'WHEN_MATCHED' ||
      caseContract.proactiveMode === 'AFTER_GATE' ||
      caseContract.proactiveMode === 'WHEN_HIGH_IMPACT')
  ) {
    mode = 'SILENT';
    priority = 'P2';
    modeReason = 'CASE_PROACTIVE_HOLDS';
  }

  // Prefer Case+uiGroup interrupt when proactive (e.g. F-road INTERVENTION)
  if (mode !== 'SILENT' && caseAllowsProactive) {
    const preferred = preferredInsightModeForCase({
      contract: caseContract,
      uiGroup: focused.decisionCase?.uiGroup,
      highImpact,
    });
    if (preferred === 'INTERVENTION' && mode === 'ATTENTION') {
      mode = 'INTERVENTION';
      priority = 'P0';
      modeReason = `CASE_${caseContract.aiMode}`;
    }
  }

  // Proactive SILENT: keep light shell; full card only after explicit ask or real triggers
  if (mode === 'SILENT') {
    return {
      ...silentEmpty(),
      title: '问 Nara：解释当前决策',
      observationSummary: focused.summary?.trim() || focused.title,
      explanationSummary:
        surface === 'DETAIL'
          ? '你已在查看该决策详情；点「问 Nara」可展开方案取舍说明。'
          : '当前问题已在决策队列中展示；需要时再展开解释与方案比较。',
      factRefs: [`decision-problem:${focused.problemId}`],
      focusedProblemId: focused.problemId,
      modeReason,
      caseAiSemanticKey: caseContract.semanticKey,
      caseAiMode: caseContract.aiMode,
      confidence: clampConfidence(focused.evidenceSummary?.confidence),
    };
  }

  const evidenceRefs = collectEvidenceRefs(focused);
  const card = focused.causalDecisionCard;
  const decision = focused.travelCausalDecision;
  const impacts = card
    ? mapImpactsFromCausalCard(card, focused)
    : mapOptionTradeoffImpacts(focused, optionsView);
  const recommended = pickRecommendedAction(optionsView, focused);
  const actions = buildInsightActions(focused, optionsView, surface);

  let observationSummary: string;
  let explanationSummary: string;

  if (card?.whatHappened?.trim()) {
    observationSummary = card.whatHappened.trim();
    explanationSummary =
      (card.whyItMatters?.length ? card.whyItMatters.join(' → ') : undefined) ||
      focused.causalStoryView?.assessment?.trim() ||
      '见因果决策卡说明。';
  } else if (modeReason === 'MATERIAL_OPTION_DIVERGENCE') {
    const allowed = (optionsView?.actions ?? []).filter(
      (a) => a.allowed && a.type !== 'DEFER',
    );
    observationSummary = `当前有 ${allowed.length} 个可选方案，时间/费用/体验取舍不同。`;
    explanationSummary =
      '在详情页直接比较选项即可；Insight 只提示存在实质分歧，不重复问题摘要。';
  } else {
    observationSummary = focused.summary?.trim() || focused.title;
    explanationSummary =
      focused.causalStoryView?.assessment?.trim() ||
      focused.decisionCase?.uiGroupLabelZh ||
      `该决策属于 ${focused.dimension} 维度，当前状态为 ${focused.workflowStatus}。`;
  }

  // Never let explanation === observation (FE looks broken)
  if (explanationSummary.trim() === observationSummary.trim()) {
    explanationSummary =
      focused.decisionCase?.uiGroupLabelZh != null
        ? `分组：${focused.decisionCase.uiGroupLabelZh}；请比较下方可选方案后再确认。`
        : '请比较可选方案的时间、费用与体验差异后再确认。';
  }

  let recommendation: DeterministicInsightSelection['recommendation'];
  if (card?.recommendation) {
    recommendation = {
      summary: `${card.recommendation.title} — ${card.recommendation.summary}`,
      rationale:
        card.recommendation.rationale.join('；') ||
        card.doNothing ||
        '见因果决策卡推荐方案。',
      recommendedOptionId:
        decision?.recommendation?.optionId ?? recommended?.actionId,
    };
  } else if (recommended) {
    recommendation = {
      summary: `建议选择「${recommended.title}」`,
      rationale:
        recommended.summary?.trim() ||
        `该选项来自现有 Decision Options（actionId=${recommended.actionId}）。`,
      recommendedOptionId: recommended.actionId,
    };
  }

  let title = focused.title;

  // Vehicle: replace task-echo copy with route-fit explanation (Contextual Copilot example)
  if (
    vehicleContext?.gate.ok &&
    isVehicleRoadFitProblem({
      problemId: focused.problemId,
      semanticKey: focused.semanticKey,
      domain: focused.decisionCase?.domain,
    })
  ) {
    const v = buildVehicleAdvisorFromContext(vehicleContext);
    title = v.title;
    observationSummary = v.body;
    explanationSummary = `失效条件：${vehicleContext.invalidatedWhen.join('、')}`;
    recommendation = {
      summary: v.advice,
      rationale: vehicleContext.recommendation.reasons.join('；'),
      recommendedOptionId:
        vehicleContext.recommendation.optionId ?? recommended?.actionId,
    };
  }

  // Insurance: responsible tier advice — never "ford → basic CDW"
  if (
    insuranceContext?.gate.ok &&
    isRentalInsuranceProblem({
      problemId: focused.problemId,
      semanticKey: focused.semanticKey,
      domain: focused.decisionCase?.domain,
    })
  ) {
    const ins = buildInsuranceAdvisorFromContext(insuranceContext);
    title = ins.title;
    observationSummary = ins.body;
    explanationSummary =
      '涉水除外是各档共性约束，档位应按碎石/高地/风损等行程暴露选择。';
    const tierToOption: Record<string, string> = {
      BASIC: 'insurance_basic',
      STANDARD_GP: 'insurance_standard',
      FULL: 'insurance_full',
      COMPARE: 'insurance_standard',
    };
    recommendation = {
      summary: ins.advice,
      rationale: explanationSummary,
      recommendedOptionId: tierToOption[ins.recommendedTier] ?? recommended?.actionId,
    };
  }

  // Validated generic conflict recommendation
  if (validatedPick) {
    const cause =
      focused.summary?.trim() ||
      '当前活动时间与后续安排冲突。';
    title = '冲突修复建议';
    observationSummary = cause;
    explanationSummary = '推荐来自已通过 Preview 且无剩余阻塞的方案。';
    recommendation = {
      summary: validatedPick.option.title
        ? `采用「${validatedPick.option.title}」，对后续安排影响较小。`
        : '采用已验证修复方案。',
      rationale: explanationSummary,
      recommendedOptionId: validatedPick.option.optionId,
    };
  }

  // Temporal deadline as an explicit TIME impact when present
  if (card?.interventionDeadline && !impacts.some((i) => i.summary.includes('最晚'))) {
    impacts.unshift({
      dimension: 'TIME',
      severity: severityForProblem(focused),
      summary: `最晚处理时间 ${card.interventionDeadline}`,
    });
  }

  return {
    mode,
    priority,
    insightType: mode === 'ATTENTION' && explicitAsk ? 'EXPLANATION' : 'DECISION_REQUIRED',
    title,
    observationSummary,
    explanationSummary,
    impacts: impacts.slice(0, 6),
    recommendation,
    actions,
    confidence: clampConfidence(
      decision?.temporalForecast.confidence ?? focused.evidenceSummary?.confidence,
    ),
    evidenceRefs: [
      ...evidenceRefs,
      ...(decision?.evidenceRefs ?? []),
    ].slice(0, 24),
    factRefs: [
      `decision-problem:${focused.problemId}`,
      ...(focused.semanticKey ? [`semantic:${focused.semanticKey}`] : []),
      ...(decision ? [`travel-causal-decision:${decision.decisionId}`] : []),
    ],
    causalChainRefs: focused.causalTraceRef?.traceId
      ? [`causal:${focused.causalTraceRef.traceId}`]
      : undefined,
    focusedProblemId: focused.problemId,
    modeReason,
    caseAiSemanticKey: caseContract.semanticKey,
    caseAiMode: caseContract.aiMode,
    causalDecisionCard: card,
  };
}

function silentEmpty(): DeterministicInsightSelection {
  return {
    mode: 'SILENT',
    priority: 'P2',
    insightType: 'EXPLANATION',
    title: '当前页面无需主动提醒',
    observationSummary: '暂无需要在本页主动提示的决策或风险。',
    explanationSummary: '可随时点「问 Nara」获取本页说明。',
    impacts: [],
    actions: [],
    confidence: 1,
    evidenceRefs: [],
    factRefs: [],
    modeReason: 'NO_OPEN_PROBLEM',
  };
}

export interface DecisionSpaceModeTriggers {
  blockingDecision: boolean;
  safetyRelated: boolean;
  materialOptionDivergence: boolean;
  staleEvidence: boolean;
  unresolvedDecision: boolean;
}

export function detectTriggers(
  p: UnifiedDecisionProblemListItem,
  optionsView?: UnifiedDecisionOptionsView,
): DecisionSpaceModeTriggers {
  const req = p.decisionCase?.requiredness;
  const ui = p.decisionCase?.uiGroup;
  const safetyScore = p.decisionCase?.materialityBreakdown?.safety ?? 0;

  return {
    blockingDecision:
      req === 'BLOCKING' || ui === 'MUST_CONFIRM' || p.enforcement === 'BLOCK',
    safetyRelated:
      p.dimension === 'ENVIRONMENT' || safetyScore >= 2,
    materialOptionDivergence: hasMaterialOptionDivergence(optionsView),
    staleEvidence: p.evidenceSummary?.freshness === 'STALE',
    unresolvedDecision: true,
  };
}

/**
 * Decision Space mode resolution.
 * Bare UNRESOLVED_DECISION does **not** proactive-elevate (queue already shows it).
 * DETAIL surface: options/summary already on screen — suppress ATTENTION unless explicitAsk.
 */
export function resolveMode(
  triggers: DecisionSpaceModeTriggers,
  explicitAsk: boolean,
  surface: 'LIST' | 'DETAIL' = 'LIST',
): { mode: InsightMode; priority: InsightPriority; modeReason: string } {
  const interventionOn = new Set(POLICY.interventionTriggers);
  const attentionOn = new Set(POLICY.attentionTriggers);

  if (
    interventionOn.has('BLOCKING_DECISION') &&
    triggers.blockingDecision
  ) {
    // On DETAIL, MUST_CONFIRM chrome already owns the page — don't stack yellow card
    if (surface === 'DETAIL' && !explicitAsk) {
      return {
        mode: 'SILENT',
        priority: 'P2',
        modeReason: 'DETAIL_SURFACE_SUPPRESSES',
      };
    }
    return { mode: 'INTERVENTION', priority: 'P0', modeReason: 'BLOCKING_DECISION' };
  }
  if (
    interventionOn.has('SAFETY_RELATED_DECISION') &&
    triggers.safetyRelated
  ) {
    if (surface === 'DETAIL' && !explicitAsk) {
      return {
        mode: 'SILENT',
        priority: 'P2',
        modeReason: 'DETAIL_SURFACE_SUPPRESSES',
      };
    }
    return { mode: 'INTERVENTION', priority: 'P0', modeReason: 'SAFETY_RELATED_DECISION' };
  }

  if (surface === 'DETAIL' && !explicitAsk) {
    return {
      mode: 'SILENT',
      priority: 'P2',
      modeReason: 'DETAIL_SURFACE_SUPPRESSES',
    };
  }

  if (
    attentionOn.has('MATERIAL_OPTION_DIVERGENCE') &&
    triggers.materialOptionDivergence
  ) {
    return {
      mode: 'ATTENTION',
      priority: 'P1',
      modeReason: 'MATERIAL_OPTION_DIVERGENCE',
    };
  }
  if (attentionOn.has('STALE_EVIDENCE') && triggers.staleEvidence) {
    return { mode: 'ATTENTION', priority: 'P1', modeReason: 'STALE_EVIDENCE' };
  }

  // Explicit ask: explain current focus without claiming a new proactive alert
  if (explicitAsk && triggers.unresolvedDecision) {
    return { mode: 'ATTENTION', priority: 'P2', modeReason: 'EXPLICIT_ASK' };
  }

  // UNRESOLVED_DECISION alone → SILENT on this page (list is the surface)
  return { mode: 'SILENT', priority: 'P2', modeReason: 'QUEUE_ALREADY_SURFACES' };
}

function hasMaterialOptionDivergence(
  optionsView?: UnifiedDecisionOptionsView,
): boolean {
  const actions = (optionsView?.actions ?? []).filter(
    (a) => a.allowed && a.type !== 'DEFER',
  );
  if (actions.length < 2) return false;

  const durations = actions
    .map((a) => a.expectedImpact?.durationDelta)
    .filter((v): v is number => v != null);
  const budgets = actions
    .map((a) => a.expectedImpact?.budgetDelta)
    .filter((v): v is number => v != null);

  if (durations.length >= 2) {
    const spread = Math.max(...durations) - Math.min(...durations);
    if (Math.abs(spread) >= 30) return true; // ≥30 min divergence
  }
  if (budgets.length >= 2) {
    const spread = Math.max(...budgets) - Math.min(...budgets);
    if (Math.abs(spread) > 0) return true;
  }

  // Multiple distinct alternative types without numeric impact still count as divergence
  const types = new Set(actions.map((a) => a.type));
  if (types.size >= 2 && actions.length >= 2) return true;

  // Same type but ≥3 concrete options (e.g. glacier hike/short/cave) → material choice
  if (actions.length >= 3) return true;

  return false;
}

function collectEvidenceRefs(p: UnifiedDecisionProblemListItem): string[] {
  const refs = new Set<string>();
  refs.add(`decision-problem:${p.problemId}`);
  for (const d of p.detectors ?? []) {
    for (const id of d.sourceRefIds ?? []) refs.add(id);
    if (d.detectorId) refs.add(`detector:${d.detectorId}`);
  }
  if (p.causalTraceRef?.traceId) refs.add(`causal:${p.causalTraceRef.traceId}`);
  const caseEvidence = (p as { evidenceRefs?: string[] }).evidenceRefs;
  if (Array.isArray(caseEvidence)) {
    for (const e of caseEvidence) refs.add(e);
  }
  return [...refs].slice(0, 24);
}

function mapImpacts(
  p: UnifiedDecisionProblemListItem,
  optionsView?: UnifiedDecisionOptionsView,
): InsightImpact[] {
  return mapOptionTradeoffImpacts(p, optionsView);
}

/** Prefer option tradeoffs over repeating problem.summary (avoids triple-duplicate FE). */
function mapOptionTradeoffImpacts(
  p: UnifiedDecisionProblemListItem,
  optionsView?: UnifiedDecisionOptionsView,
): InsightImpact[] {
  const impacts: InsightImpact[] = [];
  const allowed = (optionsView?.actions ?? []).filter(
    (a) => a.allowed && a.type !== 'DEFER',
  );

  for (const action of allowed.slice(0, 4)) {
    const bits: string[] = [];
    const impact = action.expectedImpact;
    if (impact?.durationDelta != null) bits.push(`约 ${impact.durationDelta} 分钟`);
    if (impact?.budgetDelta != null) bits.push(`费用影响 ${impact.budgetDelta}`);
    impacts.push({
      dimension: mapDimension(p.dimension),
      severity: 'MEDIUM',
      summary: bits.length
        ? `「${action.title}」：${bits.join('，')}`
        : `「${action.title}」：${action.summary || '见选项说明'}`,
    });
  }

  if (!impacts.length) {
    impacts.push({
      dimension: mapDimension(p.dimension),
      severity: severityForProblem(p),
      summary:
        p.legacySummary?.affectedScopeSummary ||
        '不同方案会影响时间、费用或体验，请在下方比较。',
    });
  }

  return impacts.slice(0, 6);
}

function mapImpactsFromCausalCard(
  card: import('../../../travel-causal-decision').CausalDecisionCardView,
  p: UnifiedDecisionProblemListItem,
): InsightImpact[] {
  const impacts: InsightImpact[] = [];
  for (const step of card.whyItMatters.slice(0, 4)) {
    impacts.push({
      dimension: mapDimension(p.dimension),
      severity: severityForProblem(p),
      summary: step,
    });
  }
  if (card.doNothing) {
    impacts.push({
      dimension: 'SAFETY',
      severity: 'HIGH',
      summary: card.doNothing,
    });
  }
  return impacts;
}

function mapDimension(d: string): InsightDimension {
  switch (d) {
    case 'SCHEDULE':
      return 'TIME';
    case 'TRANSPORT':
      return 'ROUTE';
    case 'BOOKING':
      return 'BOOKING';
    case 'ENVIRONMENT':
      return 'SAFETY';
    case 'TEAM_FIT':
      return 'TEAM';
    case 'BUDGET':
      return 'COST';
    case 'EXPERIENCE':
      return 'EXPERIENCE';
    default:
      return 'EXPERIENCE';
  }
}

function severityForProblem(p: UnifiedDecisionProblemListItem): ImpactSeverity {
  if (p.decisionCase?.requiredness === 'BLOCKING' || p.enforcement === 'BLOCK') {
    return 'CRITICAL';
  }
  if (p.decisionCase?.requiredness === 'IMPORTANT') return 'HIGH';
  if (p.enforcement === 'WARN') return 'MEDIUM';
  return 'MEDIUM';
}

function pickRecommendedAction(
  optionsView: UnifiedDecisionOptionsView | undefined,
  problem: UnifiedDecisionProblemListItem,
): DecisionAction | undefined {
  const actions = (optionsView?.actions ?? []).filter((a) => a.allowed);
  if (!actions.length) return undefined;

  const recommendedType = problem.actionability?.recommendedAction;
  if (recommendedType) {
    const match = actions.find((a) => a.type === recommendedType);
    if (match) return match;
  }

  const preferred = actions.find(
    (a) => a.type === 'ALTERNATIVE' || a.type === 'PLAN_B',
  );
  return preferred ?? actions[0];
}

function buildInsightActions(
  problem: UnifiedDecisionProblemListItem,
  optionsView: UnifiedDecisionOptionsView | undefined,
  surface: 'LIST' | 'DETAIL',
): InsightAction[] {
  const out: InsightAction[] = [];
  const payloadRef = `decision-problem:${problem.problemId}`;

  // DETAIL: already on this problem — no "查看详情" / "打开决策空间" loops
  if (surface === 'DETAIL') {
    if (ALLOWED.has('COMPARE_OPTIONS') && (optionsView?.actions?.length ?? 0) > 1) {
      out.push({
        kind: 'PREVIEW',
        label: '比较方案',
        actionType: 'COMPARE_OPTIONS',
        payloadRef,
      });
    }
    return out;
  }

  if (ALLOWED.has('OPEN_DECISION')) {
    out.push({
      kind: 'PREVIEW',
      label: '查看决策详情',
      actionType: 'OPEN_DECISION',
      payloadRef,
    });
  }

  if (ALLOWED.has('COMPARE_OPTIONS') && (optionsView?.actions?.length ?? 0) > 1) {
    out.push({
      kind: 'PREVIEW',
      label: '比较方案',
      actionType: 'COMPARE_OPTIONS',
      payloadRef,
    });
  }

  return out;
}

function clampConfidence(raw?: number): number {
  if (raw == null || Number.isNaN(raw)) return 0.85;
  return Math.max(0, Math.min(1, raw));
}
