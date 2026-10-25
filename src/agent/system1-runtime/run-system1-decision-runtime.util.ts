/**
 * System1 Decision Runtime：TaskFrame → Authority → Sufficiency → Claims → Trace。
 * 取证仍由调用方（Live / TRIP_QUERY）完成；本函数统一判断能不能答。
 */

import {
  compileSystem1TaskFrame,
  inferSystem1CandidateClaimTypes,
  resolveSystem1RuntimeFamily,
} from './compile-system1-task-frame.util';
import { compileSystem1TaskFrameFromUpstream } from './align-system1-upstream.util';
import { evaluateSystem1Authority } from './assert-system1-authority.util';
import { resolveSystem1RequiredEvidence } from './required-evidence.registry';
import { evaluateEvidenceSufficiency } from './evaluate-evidence-sufficiency.util';
import {
  buildDecisionSupportClaims,
  buildInventoryConsultClaims,
  buildTripQueryStateClaims,
  buildWeatherRoadClaims,
  groundSystem1Claims,
} from './ground-system1-claims.util';
import { diagnoseSystem1Issues } from './diagnose-system1-issue.util';
import {
  compileSystem1AcquisitionPlan,
  ensureSystem1CrePlan,
} from './compile-system1-acquisition-from-cre.util';
import {
  adaptDayTimelineSlice,
  adaptDecisionConstraints,
  adaptInventoryHit,
  adaptLiveEvidenceFactV1,
  adaptLodgingCoverageSlice,
  adaptTravelDecisionProblem,
  mergeSystem1Evidence,
} from './adapt-system1-evidence.util';
import { collectLiveEvidenceFromSensorBlocks } from '../harness/collect-live-sensor-evidence.util';
import {
  evaluateClaimGroundingForHarness,
  projectClaimGroundingEvalForObservability,
} from '../harness/hardening/claim-grounding-eval.util';
import {
  SYSTEM1_RUNTIME_SCHEMA,
  type EvidenceAcquisitionPlan,
  type RequiredEvidenceSpec,
  type System1Claim,
  type System1ClaimType,
  type System1CreOrchestration,
  type System1Evidence,
  type System1RuntimeFamily,
  type System1TurnTrace,
} from './system1-runtime.types';
import type { AgentTaskContractV1 } from '../harness/agent-task-contract.types';
import type { UnifiedIntentDecision } from '../intent/unified-intent.types';
import type { ResolvedTaskContextSlice } from '../harness/resolve-task-context-slice.util';

export function runSystem1DecisionRuntime(input: {
  message: string;
  tripId?: string | null;
  lifecycle?: string | null;
  contract?: AgentTaskContractV1 | null;
  unifiedIntent?: string | null;
  unifiedIntentDecision?: UnifiedIntentDecision | null;
  creOperation?: string | null;
  actionKind?: string | null;
  family?: System1RuntimeFamily | null;
  registryKey?: string | null;
  evidence: System1Evidence[];
  claims?: System1Claim[];
  draftAnswer?: string;
  acquisition?: EvidenceAcquisitionPlan;
  requiredEvidence?: RequiredEvidenceSpec[];
  candidateClaimTypes?: System1ClaimType[];
  cre?: System1CreOrchestration;
}): System1TurnTrace {
  const taskFrame = input.unifiedIntentDecision
    ? compileSystem1TaskFrameFromUpstream({
        message: input.message,
        tripId: input.tripId,
        lifecycle: input.lifecycle,
        contract: input.contract,
        unifiedIntentDecision: input.unifiedIntentDecision,
        creOperation: input.creOperation ?? input.cre?.operation,
        actionKind: input.actionKind,
      })
    : compileSystem1TaskFrame({
        message: input.message,
        tripId: input.tripId,
        lifecycle: input.lifecycle,
        contract: input.contract,
        unifiedIntent: input.unifiedIntent,
        creOperation: input.creOperation ?? input.cre?.operation,
        actionKind: input.actionKind,
        taskType: input.contract?.taskType,
      });
  const authority = evaluateSystem1Authority(taskFrame, input.message);
  const family =
    input.family ??
    resolveSystem1RuntimeFamily(taskFrame, input.registryKey, input.message);
  const candidateClaimTypes =
    input.candidateClaimTypes ?? inferSystem1CandidateClaimTypes(taskFrame);
  const requiredEvidence = authority.allowed
    ? (input.requiredEvidence ??
      resolveSystem1RequiredEvidence({ family, candidateClaimTypes }))
    : [];

  if (!authority.allowed) {
    const trace: System1TurnTrace = {
      schemaId: SYSTEM1_RUNTIME_SCHEMA,
      family: family ?? undefined,
      taskFrame,
      candidateClaimTypes,
      authority,
      requiredEvidence: [],
      acquisition: input.acquisition,
      cre: input.cre,
      retrievedEvidence: input.evidence,
      sufficiency: null,
      claims: [],
      groundingResult: [],
      routeDecision: {
        recommendedRoute: 'SYSTEM2_ASSISTED',
        answerMode: 'NO_ANSWER',
      },
      issues: [],
      finalAnswer: input.draftAnswer ?? '',
    };
    trace.issues = diagnoseSystem1Issues(trace);
    return trace;
  }

  const sufficiency = evaluateEvidenceSufficiency({
    required: requiredEvidence,
    evidence: input.evidence,
  });
  const grounded = groundSystem1Claims({
    claims: input.claims ?? [],
    evidence: input.evidence,
  });
  const answerMode =
    input.acquisition?.askKeys?.length
      ? 'NO_ANSWER'
      : sufficiency.answerMode === 'STRONG' && grounded.dropped.length
        ? 'CONDITIONAL'
        : sufficiency.answerMode;
  const recommendedRoute = input.acquisition?.askKeys?.length
    ? 'ASK_USER'
    : input.acquisition?.escalateKeys?.length
      ? 'SYSTEM2_ASSISTED'
      : answerMode === 'NO_ANSWER'
        ? sufficiency.recommendedRoute
        : sufficiency.recommendedRoute;

  const trace: System1TurnTrace = {
    schemaId: SYSTEM1_RUNTIME_SCHEMA,
    family: family ?? undefined,
    taskFrame,
    candidateClaimTypes,
    authority,
    requiredEvidence,
    acquisition: input.acquisition,
    cre: input.cre,
    retrievedEvidence: input.evidence,
    sufficiency,
    claims: grounded.grounded,
    groundingResult: grounded.result,
    routeDecision: {
      recommendedRoute,
      answerMode,
    },
    issues: [],
    finalAnswer: input.draftAnswer ?? '',
  };
  trace.issues = diagnoseSystem1Issues(trace);
  return trace;
}

export function projectSystem1TurnTrace(trace: System1TurnTrace): Record<string, unknown> {
  const claimGroundingEval = evaluateClaimGroundingForHarness(trace);
  return {
    schema_id: trace.schemaId,
    family: trace.family ?? null,
    question_type: trace.taskFrame.questionType,
    requested_action: trace.taskFrame.requestedAction,
    candidate_claim_types: trace.candidateClaimTypes ?? [],
    authority_allowed: trace.authority.allowed,
    authority_reason: trace.authority.reason,
    required_evidence_keys: trace.requiredEvidence.map((r) => r.key),
    sufficiency: trace.sufficiency?.status ?? null,
    answer_mode: trace.routeDecision.answerMode,
    recommended_route: trace.routeDecision.recommendedRoute,
    missing_evidence: trace.sufficiency?.missingEvidence ?? [],
    stale_evidence: trace.sufficiency?.staleEvidence ?? [],
    claims: trace.claims.map((c) => ({
      claim_id: c.claimId,
      type: c.type,
      text: c.text,
      evidence_keys: c.evidenceKeys,
      strength: c.strength,
    })),
    grounded_claims: trace.claims.map((c) => c.claimId),
    ungrounded_claims: trace.groundingResult
      .filter((g) => g.status === 'UNGROUNDED')
      .map((g) => g.claimId),
    claim_grounding_eval: projectClaimGroundingEvalForObservability(claimGroundingEval),
    issues: trace.issues.map((i) => i.code),
    change_proposal: trace.authority.changeProposal ?? null,
    acquisition: trace.acquisition
      ? {
          fetch_keys: trace.acquisition.fetchKeys,
          fetched_keys: trace.acquisition.fetchedKeys ?? [],
          ask_keys: trace.acquisition.askKeys,
          escalate_keys: trace.acquisition.escalateKeys,
          items: trace.acquisition.items,
          fetch_log: trace.acquisition.fetchLog ?? [],
        }
      : null,
    cre: trace.cre
      ? {
          operation: trace.cre.operation,
          next_action: trace.cre.nextAction,
          cre_fetch_keys: trace.cre.creFetchKeys,
          mapped_fetch_keys: trace.cre.mappedFetchKeys,
          constrained_keys: trace.cre.constrainedKeys,
        }
      : null,
  };
}

const KNOWLEDGE_CAVEAT_ZH =
  '（依据不足，以上为有条件说明，不是知识库核实结论。）';

export function finalizeSystem1KnowledgeAnswer(input: {
  draftAnswer: string;
  trace: System1TurnTrace;
}): string {
  const draft = String(input.draftAnswer ?? '').trim();
  if (input.trace.routeDecision.answerMode === 'NO_ANSWER') return draft;
  if (
    input.trace.routeDecision.answerMode === 'CONDITIONAL' ||
    input.trace.sufficiency?.status === 'PARTIAL'
  ) {
    if (draft.includes('不是知识库核实结论')) return draft;
    return `${draft}\n\n${KNOWLEDGE_CAVEAT_ZH}`;
  }
  return draft;
}

export function runSystem1TripQueryFromSlice(input: {
  message: string;
  tripId?: string | null;
  contract?: AgentTaskContractV1 | null;
  slice: ResolvedTaskContextSlice;
  acquisition?: EvidenceAcquisitionPlan;
  requiredEvidence?: RequiredEvidenceSpec[];
  cre?: System1CreOrchestration;
}): System1TurnTrace {
  const key = input.slice.registryKey;
  const family: System1RuntimeFamily =
    key === 'TRIP_QUERY_LODGING'
      ? 'TRIP_QUERY_LODGING'
      : key === 'TRIP_QUERY_NEXT'
        ? 'TRIP_QUERY_NEXT'
        : key === 'TRIP_QUERY_DAY'
          ? 'TRIP_QUERY_DAY'
          : 'TRIP_QUERY_TODAY';
  const evidence =
    family === 'TRIP_QUERY_LODGING'
      ? adaptLodgingCoverageSlice(input.slice.lodgingCoverage)
      : adaptDayTimelineSlice(
          input.slice.dayTimeline,
          family === 'TRIP_QUERY_NEXT' ? 'TRIP_QUERY_NEXT' : family,
        );
  const draftAnswer = input.slice.directAnswerZh ?? input.slice.promptLines.join('\n');
  return runSystem1DecisionRuntime({
    message: input.message,
    tripId: input.tripId,
    contract: input.contract,
    family,
    registryKey: key,
    evidence,
    claims: buildTripQueryStateClaims({ text: draftAnswer, family }),
    draftAnswer,
    acquisition: input.acquisition,
    requiredEvidence: input.requiredEvidence,
    cre: input.cre,
  });
}

export function runSystem1DecisionSupportFromProblem(input: {
  message: string;
  tripId: string;
  draftAnswer: string;
  committed?: boolean;
  problem: {
    decisionId?: string;
    decisionKey?: string;
    options?: Array<{ optionId: string; label_zh?: string; feasibility?: string }>;
    recommendation?: { optionId: string; reason_zh?: string } | null;
    selection?: { optionId: string } | null;
  };
  constraints?: {
    dayCount?: number | null;
    winterLikely?: boolean;
    vehicleHint?: string | null;
  };
}): System1TurnTrace {
  const crePlan = ensureSystem1CrePlan({
    family: 'DECISION_SUPPORT',
    message: input.message,
    tripId: input.tripId,
  });
  const evidence = [
    ...adaptTravelDecisionProblem(input.problem),
    adaptDecisionConstraints(input.constraints ?? {}),
  ];
  const compiled = compileSystem1AcquisitionPlan({
    family: 'DECISION_SUPPORT',
    evidence,
    tripId: input.tripId,
    skipExternalFetch: true,
    alreadyFetched: ['decision.options'],
    crePlan,
  });
  const conditional =
    compiled.required.some((s) => s.key === 'trip.constraints') &&
    evidence.some((e) => e.key === 'trip.constraints' && e.status !== 'VERIFIED');
  return runSystem1DecisionRuntime({
    message: input.message,
    tripId: input.tripId,
    family: 'DECISION_SUPPORT',
    creOperation: crePlan.operation,
    evidence,
    claims: buildDecisionSupportClaims({
      text: input.draftAnswer,
      conditional,
      committed: input.committed === true,
    }),
    draftAnswer: input.draftAnswer,
    acquisition: compiled.plan,
    requiredEvidence: compiled.required,
    cre: compiled.cre,
  });
}

const WEATHER_CAVEAT_ZH =
  '（缺少实时天气传感器依据，以上为有条件说明；请以 vedur.is / road.is / SafeTravel 官方信息为准。）';

export function finalizeSystem1WeatherRoadAnswer(input: {
  draftAnswer: string;
  trace: System1TurnTrace;
}): string {
  const draft = String(input.draftAnswer ?? '').trim();
  if (
    input.trace.routeDecision.answerMode === 'CONDITIONAL' ||
    input.trace.sufficiency?.status === 'PARTIAL' ||
    input.trace.sufficiency?.status === 'INSUFFICIENT'
  ) {
    if (draft.includes('缺少实时天气传感器依据')) return draft;
    return `${draft}\n\n${WEATHER_CAVEAT_ZH}`;
  }
  return draft;
}

export function runSystem1WeatherRoadConsultFromSensors(input: {
  message: string;
  tripId?: string | null;
  draftAnswer: string;
  weatherBlock?: string | null;
  weatherRiskZh?: string | null;
  roadAlertZh?: string | null;
  ontologyRoadAggregate?: string | null;
  alreadyFetched?: string[];
}): System1TurnTrace {
  const live = collectLiveEvidenceFromSensorBlocks({
    weatherBlock: input.weatherBlock,
    weatherRiskZh: input.weatherRiskZh,
    roadAlertZh: input.roadAlertZh,
    ontologyRoadAggregate: input.ontologyRoadAggregate,
  });
  let evidence = adaptLiveEvidenceFactV1(live);
  if (!evidence.some((e) => e.key === 'weather.wind')) {
    evidence = mergeSystem1Evidence([
      evidence,
      [
        {
          evidenceId: 's1ev:weather.wind:unavailable',
          key: 'weather.wind',
          sourceType: 'WORLD_STATE',
          value: null,
          status: 'UNAVAILABLE',
          provenance: { provider: 'weather_sensor_missing' },
        } satisfies System1Evidence,
      ],
    ]);
  }
  const crePlan = ensureSystem1CrePlan({
    family: 'WEATHER_ROAD_QA',
    message: input.message,
    tripId: input.tripId,
    hints: {
      hasWeather: evidence.some((e) => e.key === 'weather.wind' && e.status === 'VERIFIED'),
      hasRoadStatus: evidence.some((e) => e.key === 'route.status' && e.status === 'VERIFIED'),
      travelMode: 'SELF_DRIVE',
    },
  });
  const compiled = compileSystem1AcquisitionPlan({
    family: 'WEATHER_ROAD_QA',
    evidence,
    tripId: input.tripId,
    skipExternalFetch: true,
    alreadyFetched: input.alreadyFetched ?? ['weather.wind', 'route.status'],
    crePlan,
  });
  const hasWeather = evidence.some(
    (e) => e.key === 'weather.wind' && (e.status === 'VERIFIED' || e.status === 'STALE'),
  );
  const hasRoad = evidence.some(
    (e) => e.key === 'route.status' && (e.status === 'VERIFIED' || e.status === 'STALE'),
  );
  const trace = runSystem1DecisionRuntime({
    message: input.message,
    tripId: input.tripId,
    family: 'WEATHER_ROAD_QA',
    creOperation: crePlan.operation,
    evidence,
    claims: buildWeatherRoadClaims({
      text: input.draftAnswer,
      hasWeather,
      hasRoad,
      conditional: !hasWeather,
    }),
    draftAnswer: input.draftAnswer,
    acquisition: compiled.plan,
    requiredEvidence: compiled.required,
    cre: compiled.cre,
  });
  trace.finalAnswer = finalizeSystem1WeatherRoadAnswer({
    draftAnswer: input.draftAnswer,
    trace,
  });
  return trace;
}

const INVENTORY_CAVEAT_ZH =
  '（缺少实时库存/检索命中，以上为有条件说明；请以预订平台或官方渠道的最新结果为准。）';

export function finalizeSystem1InventoryAnswer(input: {
  draftAnswer: string;
  trace: System1TurnTrace;
}): string {
  const draft = String(input.draftAnswer ?? '').trim();
  if (
    input.trace.routeDecision.answerMode === 'CONDITIONAL' ||
    input.trace.sufficiency?.status === 'PARTIAL' ||
    input.trace.sufficiency?.status === 'INSUFFICIENT'
  ) {
    if (draft.includes('缺少实时库存/检索命中')) return draft;
    return `${draft}\n\n${INVENTORY_CAVEAT_ZH}`;
  }
  return draft;
}

export function runSystem1InventoryConsultFromHits(input: {
  message: string;
  tripId?: string | null;
  draftAnswer: string;
  kind: 'hotel' | 'car_rental' | 'dining' | 'flight' | 'xhs' | 'activity' | string;
  hitCount: number;
  previewZh?: string | null;
  provider?: string;
}): System1TurnTrace {
  const evidence = [
    adaptInventoryHit({
      kind: input.kind,
      hitCount: input.hitCount,
      previewZh: input.previewZh,
      provider: input.provider,
    }),
  ];
  const crePlan = ensureSystem1CrePlan({
    family: 'INVENTORY_CONSULT',
    message: input.message,
    tripId: input.tripId,
  });
  const compiled = compileSystem1AcquisitionPlan({
    family: 'INVENTORY_CONSULT',
    evidence,
    tripId: input.tripId,
    skipExternalFetch: true,
    alreadyFetched: ['inventory.hit'],
    crePlan,
  });
  const hasHit = evidence.some((e) => e.status === 'VERIFIED');
  const trace = runSystem1DecisionRuntime({
    message: input.message,
    tripId: input.tripId,
    family: 'INVENTORY_CONSULT',
    creOperation: crePlan.operation,
    evidence,
    claims: buildInventoryConsultClaims({
      text: input.draftAnswer,
      hasHit,
    }),
    draftAnswer: input.draftAnswer,
    acquisition: compiled.plan,
    requiredEvidence: compiled.required,
    cre: compiled.cre,
  });
  trace.finalAnswer = finalizeSystem1InventoryAnswer({
    draftAnswer: input.draftAnswer,
    trace,
  });
  return trace;
}
