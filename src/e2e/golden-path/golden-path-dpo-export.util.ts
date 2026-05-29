/**
 * Golden Path → 离线 DPO JSONL（体验流路由偏好对）。
 *
 * 与 capture:decision-closure:storm 联用，为 Python LoRA/DPO 飞轮提供本地 Ground Truth。
 */
import type { CGUSSearchResult } from '../../trips/decision/optimization/cgus-search.service';
import type { DpoPreferenceJsonlRecord } from '../../agent/training/interfaces/decision-trajectory-etl.types';
import { MetaPolicyService } from '../../trips/decision/optimization/meta/meta-policy.service';
import {
  runGoldenPathDeliveryPhase,
  runGoldenPathIncidentPhase,
  runGoldenPathReplanPhase,
  loadIcelandStormFixtureDoc,
  type GoldenPathIncidentResult,
} from './iceland-storm-golden-path.harness';
import {
  buildGoldenPathStormCandidates,
  runGoldenPathCgusSearch as runGoldenPathCgusSearchForIncident,
} from './golden-path-cgus.util';

export const GOLDEN_PATH_STORM_CASE_ID = 'iceland-storm-icecave-failure-001';

export { buildGoldenPathStormCandidates } from './golden-path-cgus.util';

function clampStr(s: unknown, max = 12000): string {
  const t = typeof s === 'string' ? s : JSON.stringify(s ?? '');
  return t.length <= max ? t : `${t.slice(0, max)}…[truncated]`;
}

export function serializeGoldenPathDpoPrompt(args: {
  incident: GoldenPathIncidentResult;
  deliveryNarrativeTone: string;
  cgus?: CGUSSearchResult;
}): string {
  const doc = loadIcelandStormFixtureDoc();
  const replan = runGoldenPathReplanPhase(7);
  return clampStr({
    schema: 'tripnara.experience_flow_dpo_prompt@v1',
    case_id: GOLDEN_PATH_STORM_CASE_ID,
    user_query:
      '冰岛南岸暴风雪，蓝冰洞取消；需要同理心恢复叙事与安全室内/低摩擦替代路径',
    strategy_signals: {
      weather_severity: 'RED_ALERT',
      roads_closed: ['IS-R1-SOUTH'],
      poi_unavailable: ['blue-ice-cave-tour'],
    },
    experience_flow: args.incident.experienceFlow,
    narrative_tone: args.deliveryNarrativeTone,
    meta_policy: {
      use_exploration: args.incident.metaPolicyOutput.useExploration,
      exploration_beta: args.incident.metaPolicyOutput.explorationBeta,
    },
    routing_weights: {
      w1: args.incident.routingWeights.wPhysicalTime,
      w2: args.incident.routingWeights.wFriction,
      beta: args.incident.routingWeights.betaInformationGain,
    },
    partial_replan: {
      anchor_day: replan.scope.anchorDayIndex,
      replan_range: replan.scope.replanDayRange,
      frozen_days: replan.scope.frozenDayIndices,
    },
    user_emotional_account: doc.user_emotional_account,
    cgus_experience_routing_audit: args.cgus?.experienceRoutingAudit,
  });
}

/**
 * 构造体验流路由 DPO 偏好对：低摩擦庇护路径 (chosen) vs F-road 高摩擦路径 (rejected)。
 */
export function buildExperienceFlowRoutingDpoRecord(args?: {
  cgus?: CGUSSearchResult;
  requestId?: string;
}): DpoPreferenceJsonlRecord {
  const incident = runGoldenPathIncidentPhase();
  const delivery = runGoldenPathDeliveryPhase(incident);
  const replan = runGoldenPathReplanPhase(7);
  const { highFriction, lowFriction } = buildGoldenPathStormCandidates();

  const chosenPlan = lowFriction.plan;
  const rejectedPlan = highFriction.plan;

  return {
    prompt: serializeGoldenPathDpoPrompt({
      incident,
      deliveryNarrativeTone: delivery.narratorVoiceTone,
      cgus: args?.cgus,
    }),
    chosen: clampStr({
      plan_id: 'shelter-first',
      itinerary_segments: chosenPlan?.segments,
      narrative_tone: delivery.logMetadata.experience_flow?.narrativeTone,
      experience_flow: delivery.logMetadata.experience_flow,
    }),
    rejected: clampStr({
      plan_id: 'froad-heavy',
      itinerary_segments: rejectedPlan?.segments,
      defect: 'high_friction_froad_storm_exposure',
    }),
    trajectory_id: `golden-path-${GOLDEN_PATH_STORM_CASE_ID}`,
    request_id: args?.requestId ?? `golden-path-${GOLDEN_PATH_STORM_CASE_ID}`,
    pair_type: 'experience_flow_routing',
    metadata: {
      case_id: GOLDEN_PATH_STORM_CASE_ID,
      source: 'golden_path_harness',
      experience_flow: delivery.logMetadata.experience_flow as Record<string, unknown>,
      cgus_weights: args?.cgus?.experienceRoutingAudit?.weights ?? {
        w1: incident.routingWeights.wPhysicalTime,
        w2: incident.routingWeights.wFriction,
        beta: incident.routingWeights.betaInformationGain,
      },
      partial_replan: {
        frozen_days: replan.scope.frozenDayIndices,
        replan_from: replan.scope.replanDayRange.from,
        replan_to: replan.scope.replanDayRange.to,
      },
    },
  };
}

export function buildGoldenPathDpoRecords(args?: {
  cgus?: CGUSSearchResult;
}): DpoPreferenceJsonlRecord[] {
  return [buildExperienceFlowRoutingDpoRecord({ cgus: args?.cgus })];
}

export function goldenPathDpoJsonlContent(records: DpoPreferenceJsonlRecord[]): string {
  if (!records.length) {
    return '';
  }
  return `${records.map((r) => JSON.stringify(r)).join('\n')}\n`;
}

export function defaultGoldenPathDpoOutPath(caseId: string): string {
  const slug = caseId.replace(/-001$/, '');
  return `data/training/golden-path/${slug}.dpo.jsonl`;
}

/** 真实 CGUSSearchService.search() — capture / DPO 脚本便捷入口 */
export async function runGoldenPathCgusSearch(
  metaPolicy: MetaPolicyService = new MetaPolicyService(),
): Promise<CGUSSearchResult> {
  const incident = runGoldenPathIncidentPhase(metaPolicy);
  return runGoldenPathCgusSearchForIncident(incident, metaPolicy);
}

export function buildGoldenPathDpoRecordsWithCgus(
  cgus: CGUSSearchResult,
): DpoPreferenceJsonlRecord[] {
  return buildGoldenPathDpoRecords({ cgus });
}
