/**
 * ITINERARY_ADJUST ↔ itinerary.adaptive_replan 编排接线
 */

import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { resolvePersonaSnapshotFromOdysseyBranch } from '../../skills/itinerary/adaptive-replan-persona.util';
import type {
  AdaptiveReplanEnvironmentalContext,
  AdaptiveReplanOutput,
  TrafficMatrixEntry,
  WeatherSnapshot,
} from '../../skills/itinerary/adaptive-replan.types';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import {
  refreshItineraryAdjustOptimizationResult,
  resolveItineraryAdjustRunContext,
} from './itinerary-adjust-decision-log.util';

export type AdaptiveReplanTrigger =
  | 'pacing'
  | 'weather'
  | 'environment'
  | 'strong_modification'
  | 'default';

const PACING_PATTERNS = [
  /太累|好累|疲惫|轻松|别早起|不要太赶|放缓|慢节奏|休息/i,
  /relax|exhausted|tired|slow\s*down/i,
];

const WEATHER_PATTERNS = [
  /下雨|大雨|暴雨|暴雪|暴风|强风|大风|恶劣天|天气/i,
  /rain|storm|blizzard|weather/i,
];

export function detectAdaptiveReplanTrigger(message: string): AdaptiveReplanTrigger {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (PACING_PATTERNS.some((re) => re.test(t))) return 'pacing';
  if (WEATHER_PATTERNS.some((re) => re.test(t))) return 'weather';
  if (/(?:重新规划|重排|明显不合理|应用到(?:正式)?行程)/.test(t)) return 'strong_modification';
  if (/(?:封路|F\s*路|f-road|路况|拥堵)/i.test(t)) return 'environment';
  return 'default';
}

export function shouldRequestAdaptiveReplan(params: {
  routePrimary?: string;
  itineraryAdjustIntake?: boolean;
}): boolean {
  return (
    params.routePrimary === 'ITINERARY_ADJUST' || params.itineraryAdjustIntake === true
  );
}

export function resolveAdaptiveReplanFatigueLevel(message: string): number | undefined {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (/太累|好累|快累|撑不住|疲惫|exhausted/i.test(t)) return 85;
  if (/有点累|略累|tired/i.test(t)) return 70;
  if (/轻松|慢节奏|relax/i.test(t)) return 45;
  return undefined;
}

function readResearchRecord(state: OrchestratorState): Record<string, unknown> {
  return (state.research_data ?? {}) as Record<string, unknown>;
}

function buildWeatherForecastFromState(
  state: OrchestratorState,
  targetDateIsos: string[],
): WeatherSnapshot[] {
  const rd = readResearchRecord(state);
  const out: WeatherSnapshot[] = [];
  const seen = new Set<string>();

  const debateWx = state.trip_plan_request?.guardian_debate_trip_context?.environment
    ?.weather_snapshot;
  if (debateWx && targetDateIsos.length > 0) {
    const dateIso = targetDateIsos[0];
    if (!seen.has(dateIso)) {
      seen.add(dateIso);
      out.push({
        date_iso: dateIso,
        condition: debateWx.condition ?? 'unknown',
        severity: debateWx.is_extreme ? 'extreme' : debateWx.wind_speed_ms && debateWx.wind_speed_ms > 15 ? 'high' : 'moderate',
        wind_speed_ms: debateWx.wind_speed_ms,
      });
    }
  }

  const forecasts = rd.weather_forecast ?? rd.weatherForecast;
  if (Array.isArray(forecasts)) {
    for (const row of forecasts) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const dateIso = String(r.date_iso ?? r.date ?? '').slice(0, 10);
      if (!dateIso || !targetDateIsos.includes(dateIso) || seen.has(dateIso)) continue;
      seen.add(dateIso);
      out.push({
        date_iso: dateIso,
        condition: String(r.condition ?? r.summary ?? 'unknown'),
        severity: r.severity as WeatherSnapshot['severity'],
        precipitation_mm: typeof r.precipitation_mm === 'number' ? r.precipitation_mm : undefined,
        wind_speed_ms: typeof r.wind_speed_ms === 'number' ? r.wind_speed_ms : undefined,
      });
    }
  }

  return out;
}

function buildTrafficMatrixFromState(state: OrchestratorState): TrafficMatrixEntry[] {
  const rd = readResearchRecord(state);
  const entries: TrafficMatrixEntry[] = [];

  const alerts = rd.safetravel_alerts ?? rd.safetravelAlerts;
  if (Array.isArray(alerts)) {
    for (const alert of alerts) {
      if (!alert || typeof alert !== 'object') continue;
      const a = alert as Record<string, unknown>;
      const blocked = /closed|封|关闭|impassable/i.test(String(a.status ?? a.severity ?? ''));
      entries.push({
        from_place_id: typeof a.from_place_id === 'string' ? a.from_place_id : undefined,
        to_place_id: typeof a.to_place_id === 'string' ? a.to_place_id : undefined,
        base_drive_minutes: 60,
        traffic_factor: blocked ? Infinity : 1.4,
        blocked,
        block_reason: String(a.title ?? a.message ?? a.reason ?? '路段预警'),
      });
    }
  }

  const roadStatus =
    state.trip_plan_request?.guardian_debate_trip_context?.environment?.road_status;
  if (Array.isArray(roadStatus)) {
    for (const row of roadStatus) {
      const blocked = /closed|封|关闭/i.test(String(row.status ?? ''));
      entries.push({
        base_drive_minutes: 60,
        traffic_factor: blocked ? Infinity : 1.25,
        blocked,
        block_reason: row.reason ?? row.id,
      });
    }
  }

  return entries;
}

export function buildAdaptiveReplanEnvironmentalContext(
  state: OrchestratorState,
  targetDateIsos: string[],
): AdaptiveReplanEnvironmentalContext {
  return {
    weatherForecast: buildWeatherForecastFromState(state, targetDateIsos),
    trafficStatus: buildTrafficMatrixFromState(state),
  };
}

export function buildAdaptiveReplanTargetDays(state: OrchestratorState): number[] {
  const ctx = resolveItineraryAdjustRunContext(state);
  if (ctx.targetDayNumber != null && ctx.targetDayNumber >= 1) {
    return [ctx.targetDayNumber];
  }
  const targetIso = ctx.targetDateIso?.slice(0, 10);
  if (!targetIso || !state.itinerary?.days?.length) return [1];

  const idx = state.itinerary.days.findIndex(
    (d) => String(d.date ?? '').slice(0, 10) === targetIso,
  );
  return idx >= 0 ? [idx + 1] : [1];
}

export function collectAdaptiveReplanRationaleZh(output: AdaptiveReplanOutput): string[] {
  return [
    ...(output.corridor_filter?.rationale_zh ?? []),
    ...(output.persona_rearrange?.rationale_zh ?? []),
    ...(output.adjust_result_hints?.rationale_bullets_zh ?? []),
  ].filter(Boolean);
}

/**
 * PLAN_GEN 后：对 ITINERARY_ADJUST 草案执行 adaptive_replan，写回 state.itinerary。
 */
export async function runAdaptiveReplanForAdjustState(
  state: OrchestratorState,
  skillsRegistry: SkillsRegistryService | undefined,
): Promise<boolean> {
  const md = (state.metadata ?? {}) as Record<string, unknown>;
  if (!md.adaptive_replan_requested) return false;
  if (!state.itinerary?.days?.length) return false;

  const skill = skillsRegistry?.getSkill('itinerary.adaptive_replan');
  if (!skill) {
    md.adaptive_replan_result = { skipped: true, reason: 'skill_unavailable' };
    return false;
  }

  const tripId =
    state.trip_plan_request?.trip_id?.trim() ??
    state.trip_plan_request?.ontology_context?.trip_id?.trim();
  if (!tripId) {
    md.adaptive_replan_result = { skipped: true, reason: 'missing_trip_id' };
    return false;
  }

  const intakeMsg =
    (typeof md.intake_user_message === 'string' ? md.intake_user_message : '') ||
    state.trip_plan_request?.message ||
    '';

  const fatigue = resolveAdaptiveReplanFatigueLevel(intakeMsg);
  const personaSnapshot = resolvePersonaSnapshotFromOdysseyBranch(undefined, {
    ...(fatigue != null ? { energyModel: { currentFatigueLevel: fatigue } } : {}),
  });

  const targetDays = buildAdaptiveReplanTargetDays(state);
  const targetDateIsos = targetDays
    .map((n) => state.itinerary?.days?.[n - 1]?.date)
    .filter((d): d is string => typeof d === 'string')
    .map((d) => d.slice(0, 10));

  const output = (await skill.execute({
    tripId,
    targetDays,
    userIntent: intakeMsg || undefined,
    personaSnapshot,
    itinerary: state.itinerary,
    research_data: state.research_data,
    environmentalContext: buildAdaptiveReplanEnvironmentalContext(state, targetDateIsos),
    tokenContext: {
      request_id: state.request_id,
      state_machine_step: 'PLAN_GEN',
      sub_agent: 'Planner',
    },
  })) as AdaptiveReplanOutput;

  if (output.itinerary?.days?.length) {
    state.itinerary = output.itinerary;
  }

  const curatorSkill =
    skillsRegistry?.getSkill('itinerary.experience_curator') ??
    skillsRegistry?.getSkill('itinerary.experience_align');
  if (curatorSkill && state.itinerary) {
    const expOut = (await curatorSkill.execute({
      tripId,
      itinerary: state.itinerary,
      targetDays,
      userIntent: intakeMsg || undefined,
      personaSnapshot,
      research_data: state.research_data,
      apply_curation: true,
      tokenContext: {
        request_id: state.request_id,
        state_machine_step: 'PLAN_GEN',
        sub_agent: 'Planner',
      },
    })) as {
      itinerary?: typeof state.itinerary;
      metrics?: { overall?: number };
      curation_notes_zh?: string[];
      insights_zh?: string[];
      preferences?: { pacingStrategy?: string };
      experience_flow_tempo?: string;
      telemetry?: { narrative?: string };
    };
    if (expOut.itinerary?.days?.length) {
      state.itinerary = expOut.itinerary;
    }
    const notes = expOut.curation_notes_zh ?? expOut.insights_zh ?? [];
    md.experience_curator_result = {
      overall_score: expOut.metrics?.overall,
      pacing_strategy: expOut.preferences?.pacingStrategy,
      tempo: expOut.experience_flow_tempo,
      telemetry: expOut.telemetry,
    };
    md.experience_curator_rationale_zh = notes;
    md.experience_align_rationale_zh = notes;
  }

  const rationale = [
    ...collectAdaptiveReplanRationaleZh(output),
    ...((md.experience_curator_rationale_zh as string[] | undefined) ??
      (md.experience_align_rationale_zh as string[] | undefined) ??
      []),
  ];
  md.adaptive_replan_result = {
    verified: output.verified,
    telemetry: output.telemetry,
    persona_travel_style: personaSnapshot.travelStyle,
    target_days: targetDays,
    trigger: md.adaptive_replan_trigger,
  };
  md.adaptive_replan_rationale_zh = rationale;
  refreshItineraryAdjustOptimizationResult(state);

  state.decision_log.push({
    request_id: state.request_id,
    step: 'PLAN_GEN',
    actor: 'Planner',
    inputs_summary: `adaptive_replan trigger=${String(md.adaptive_replan_trigger ?? 'default')} days=${targetDays.join(',')}`,
    outputs_summary: output.telemetry.narrative,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'ITINERARY_ADAPTIVE_REPLAN_APPLIED',
      adaptive_replan: md.adaptive_replan_result,
      rationale_zh: rationale.slice(0, 8),
    },
  });

  return true;
}
