/**
 * Iceland Storm Golden Path — 三阶段集成 harness（Incident → Replan → Delivery）。
 *
 * 纯函数 + 可注入服务，供 E2E 与 capture 脚本复用。
 */
import fs from 'fs';
import path from 'path';
import type { RouteAndRunRequestDto } from '../../agent/dto/route-and-run.dto';
import type { PlanDeltaIR } from '../../agent/contracts/plan-delta-ir.types';
import type { RouteAndRunTaskProgressPayload } from '../../agent/events/route-and-run-task.events';
import {
  applyResearchTraceSignalsToResearchData,
  computeResearchTraceSignalsFromNegotiation,
} from '../../agent/memory/emotional-resonance/research-member-stability.util';
import type { ResearchConflictNegotiationReport } from '../../agent/teams/research/research-conflict-negotiation.types';
import { mapVoiceToneModifierForNegotiationAndBudget } from '../../agent/utils/narrator-ebp-tone.util';
import { computePartialReplanScope } from '../../agent/runtime/compute-partial-replan-scope.util';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { MetaPolicyService } from '../../trips/decision/optimization/meta/meta-policy.service';
import {
  enrichWorldContextWithExperienceFlow,
  projectExperienceFlowFromTraceSignals,
  readExperienceFlowFromResearchData,
  type ExperienceFlowModel,
} from '../../trips/decision/models/experience-flow.model';
import {
  resolveExperienceRoutingWeights,
  type ExperienceRoutingWeights,
} from '../../trips/decision/policies/experience-routing-policy';
import { mapResearchTraceSignalsToLogMetadata } from '../../trips/decision/shared/research-trace-signals-log-metadata.util';
import type { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { icelandStormIcecaveFailureCase } from '../../trips/decision/evaluation/e2e-cases/iceland-storm-icecave-failure.example';
import { buildDecisionLogsForFixture } from '../../trips/decision/evaluation/e2e-replay.fixture-mocks';
import {
  enrichSseProgressWithCanvasHint,
  GOLDEN_PATH_DELIVERY_PHASES,
} from '../../agent/runtime/golden-path-sse-canvas-contract.util';
import type { CGUSSearchResult } from '../../trips/decision/optimization/cgus-search.service';
import {
  runGoldenPathCgusSearch,
  validateGoldenPathExperienceRoutingAudit,
} from './golden-path-cgus.util';
import { buildEmotionalContext } from '../../agent/narrator/emotion-narrator-orchestrator.util';
import {
  projectEmotionalContextForClient,
  type EmotionalContextClientProjection,
} from '../../agent/narrator/emotional-context-client-projection.util';
import { buildAnchoringPresenceBlockZh } from '../../agent/narrator/anchoring-presence-narration.util';
import type { EmotionalContext } from '../../agent/narrator/types/emotional-context.type';

export type GoldenPathCgusResult = {
  incident: GoldenPathIncidentResult;
  cgus: CGUSSearchResult;
  experienceRoutingAudit: NonNullable<CGUSSearchResult['experienceRoutingAudit']>;
};

/** Anchor 1.5 — 真实 CGUS 搜索 + ExperienceRoutingPolicy 审计 */
export async function runGoldenPathCgusPhase(
  metaPolicy: MetaPolicyService = new MetaPolicyService(),
): Promise<GoldenPathCgusResult> {
  const incident = runGoldenPathIncidentPhase(metaPolicy);
  const cgus = await runGoldenPathCgusSearch(incident, metaPolicy);
  const experienceRoutingAudit = validateGoldenPathExperienceRoutingAudit(cgus);
  return { incident, cgus, experienceRoutingAudit };
}

export type StormFixtureDoc = {
  caseId: string;
  user_emotional_account: ResearchConflictNegotiationReport['user_emotional_account'];
  negotiationReportOverlay: Partial<ResearchConflictNegotiationReport>;
};

const STORM_JSON_PATH = path.join(
  __dirname,
  '../../trips/decision/evaluation/e2e-cases/iceland-storm-icecave-failure.json',
);

export function loadIcelandStormFixtureDoc(): StormFixtureDoc {
  const raw = JSON.parse(fs.readFileSync(STORM_JSON_PATH, 'utf8')) as Record<string, unknown>;
  return {
    caseId: String(raw.caseId ?? 'iceland-storm-icecave-failure-001'),
    user_emotional_account: raw.user_emotional_account as StormFixtureDoc['user_emotional_account'],
    negotiationReportOverlay: (raw.negotiationReportOverlay ??
      {}) as StormFixtureDoc['negotiationReportOverlay'],
  };
}

function minimalIcelandWorldContext(): WorldModelContext {
  return {
    physical: {
      countryCode: 'IS',
      month: 1,
      demEvidence: [],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
    },
    human: {
      profileId: 'golden-path-iceland',
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 25,
      preferredPace: 'MEDIUM',
      riskTolerance: 'LOW',
      highAltitudeExperience: 'BASIC',
    },
    routeDirection: {
      id: 1,
      name: 'Iceland South Coast',
      nameCN: '冰岛南岸',
      countryCode: 'IS',
      tags: ['iceland', 'south-coast'],
      metadata: { uuid: 'rd-iceland-south-v1' },
    },
  };
}

export type GoldenPathIncidentResult = {
  researchData: Record<string, unknown>;
  experienceFlow: ExperienceFlowModel;
  world: WorldModelContext;
  metaPolicyOutput: ReturnType<MetaPolicyService['selectPolicy']>;
  routingWeights: ExperienceRoutingWeights;
};

/** Anchor 1 — 冰洞崩溃：风暴信号 → ExperienceFlow + MetaPolicy 权重切换 */
export function runGoldenPathIncidentPhase(
  metaPolicy: MetaPolicyService = new MetaPolicyService(),
): GoldenPathIncidentResult {
  const doc = loadIcelandStormFixtureDoc();
  const researchData: Record<string, unknown> = {};
  applyResearchTraceSignalsToResearchData(researchData, {
    user_emotional_account: doc.user_emotional_account,
    mental_offset_hints: doc.negotiationReportOverlay.mental_offset_hints,
  });

  const experienceFlow = readExperienceFlowFromResearchData(researchData)!;
  const world = enrichWorldContextWithExperienceFlow(minimalIcelandWorldContext(), researchData);

  const dso = {
    tripState: { experienceFlow },
    environmentState: { weatherRisk: 0.92, failureRiskLevel: 'HIGH' as const },
    uncertaintyProfile: { hasUncertainty: true, entropy01: 0.91 },
    systemState: { currentPhase: 'PLAN_GEN' },
  } as unknown as DecisionState;

  const metaPolicyOutput = metaPolicy.selectPolicy(dso, { latencyBudgetMs: 3000 });
  const routingWeights = resolveExperienceRoutingWeights({
    experienceFlow,
    mode: 'EMPATHY_RECOVERY',
  });

  return { researchData, experienceFlow, world, metaPolicyOutput, routingWeights };
}

export type GoldenPathReplanResult = {
  scope: NonNullable<ReturnType<typeof computePartialReplanScope>>;
  request: RouteAndRunRequestDto;
  delta: PlanDeltaIR;
};

/** Anchor 2 — D3 POI 替换 → 时空锥局部重算作用域 */
export function runGoldenPathReplanPhase(totalDays = 7): GoldenPathReplanResult {
  const delta: PlanDeltaIR = {
    op: 'REPLACE',
    target: { type: 'POI', dayIndex: 2, id: 'poi_reynisfjara' },
    payload: {
      query: 'Sólheimasandur plane wreck',
      patchMeta: { refinement: 'storm_recovery_alternative' },
    },
  };

  const scope = computePartialReplanScope([delta], { totalDays, forwardConeDays: 1 });
  if (!scope) {
    throw new Error('Golden Path replan: computePartialReplanScope returned null');
  }

  const request = {
    request_id: 'golden-path-iceland-replan-001',
    user_id: 'user-golden-path',
    message: '把第3天黑沙滩换成飞机残骸，避开风暴影响路段',
    trip_id: 'trip_iceland_storm_001',
    options: {
      itinerary_context: { is_replan: true },
      refinement_signal: { type: 'REPLACEMENT' as const },
      intent_flags: { modification_targets: ['poi'] },
    },
  } as RouteAndRunRequestDto;

  return { scope, request, delta };
}

export type GoldenPathDeliveryResult = {
  logMetadata: ReturnType<typeof mapResearchTraceSignalsToLogMetadata>;
  narratorVoiceTone: string;
  ssePayloads: Array<RouteAndRunTaskProgressPayload & { canvas_render?: { active_layers: string[] } }>;
};

/** Anchor 3 — 语义交割：决策日志 + Narrator 基调 + SSE Canvas 契约 */
export function runGoldenPathDeliveryPhase(
  incident: GoldenPathIncidentResult,
): GoldenPathDeliveryResult {
  const trace = computeResearchTraceSignalsFromNegotiation({
    user_emotional_account: incident.researchData.user_emotional_account as
      | ResearchConflictNegotiationReport['user_emotional_account']
      | undefined,
    mental_offset_hints: (
      incident.researchData.__research_conflict_negotiation as
        | { mental_offset_hints?: ResearchConflictNegotiationReport['mental_offset_hints'] }
        | undefined
    )?.mental_offset_hints,
  });

  const logMetadata = mapResearchTraceSignalsToLogMetadata(incident.researchData);
  const narratorVoiceTone =
    mapVoiceToneModifierForNegotiationAndBudget(
      {
        user_emotional_account: loadIcelandStormFixtureDoc().user_emotional_account,
        mental_offset_hints: { frustration_circuit_active: true },
      } as ResearchConflictNegotiationReport,
      incident.researchData,
    ) ?? 'empathetic_reassurance';

  const fixtureLogs = buildDecisionLogsForFixture(icelandStormIcecaveFailureCase);
  const planScoreMeta = fixtureLogs.find((l) => l.decisionStage === 'PLAN_SCORE')?.metadata as
    | Record<string, unknown>
    | undefined;

  if (planScoreMeta?.experience_flow) {
    Object.assign(logMetadata, { experience_flow: planScoreMeta.experience_flow });
  } else if (!logMetadata.experience_flow) {
    logMetadata.experience_flow = projectExperienceFlowFromTraceSignals(trace);
  }

  const ssePayloads = GOLDEN_PATH_DELIVERY_PHASES.map((phase, idx) =>
    enrichSseProgressWithCanvasHint({
      task_id: 'task_golden_path_iceland',
      request_id: 'golden-path-iceland-001',
      type: phase === 'DONE' ? 'RESULT' : 'PHASE',
      current_phase: phase,
      progress_percentage: (idx + 1) * (100 / GOLDEN_PATH_DELIVERY_PHASES.length),
      message: `Golden Path ${phase}`,
      status: phase === 'DONE' ? 'SUCCESS' : 'PROCESSING',
      ts: new Date().toISOString(),
    }),
  );

  return { logMetadata, narratorVoiceTone, ssePayloads };
}

export type GoldenPathEmotionalDeliveryAudit = {
  emotionalContext: EmotionalContext;
  clientProjection: EmotionalContextClientProjection;
  anchoringBlock?: string;
};

/** Anchor 3.5 — 情绪矩阵 + 锚定叙事（风暴场景 DPO / BFF 守卫） */
export function runGoldenPathEmotionalDeliveryAudit(
  incident: GoldenPathIncidentResult,
): GoldenPathEmotionalDeliveryAudit {
  const doc = loadIcelandStormFixtureDoc();
  const emotionalContext = buildEmotionalContext({
    userId: 'user-golden-path',
    tripId: 'trip_iceland_storm_001',
    userEmotionalAccount: doc.user_emotional_account,
    experienceFlow: incident.experienceFlow,
    weatherWindLockActive: true,
    lastUserMessage: '风暴封路了怎么办',
  });

  const clientProjection = projectEmotionalContextForClient(emotionalContext)!;
  const anchoringBlock = buildAnchoringPresenceBlockZh(emotionalContext, {
    weatherWindLockActive: true,
    offlineMapsSynced: true,
  });

  return { emotionalContext, clientProjection, anchoringBlock };
}
