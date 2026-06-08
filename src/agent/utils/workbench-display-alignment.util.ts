/**
 * 规划工作台：时间轴与可执行性提示应对齐同一套 itinerary。
 * 绑定 trip_id 时，若库内 Trip 草案与编排器内存草案不一致，以 Trip 为准（与左侧时间轴读库一致）。
 */

import type { GateResult, Itinerary, OrchestratorState } from '../interfaces/trip-plan.interface';

export type WorkbenchDisplaySource = 'orchestration' | 'trip_persisted';

export type WorkbenchDisplayAlignment = {
  timeline_source: WorkbenchDisplaySource;
  feasibility_source: WorkbenchDisplaySource;
  /** orchestration 指纹与 trip 指纹是否一致 */
  aligned: boolean;
  /** 不一致时 true；前端可提示「决策说明已按当前 Trip 草案过滤」 */
  drift_detected: boolean;
  trip_id?: string;
};

type DayLike = {
  date?: string;
  items?: Array<{
    id?: string;
    type?: string;
    start_window?: string;
    location_ref?: { name?: string; place_id?: string };
  }>;
};

export function fingerprintItineraryDays(days: DayLike[] | undefined | null): string {
  const parts: string[] = [];
  for (const d of days ?? []) {
    const date = String(d.date ?? '').slice(0, 10);
    for (const it of d.items ?? []) {
      const t = String(it.type ?? 'POI').toUpperCase();
      if (t === 'DRIVE' || t === 'TRANSIT' || t === 'WALK') continue;
      parts.push(
        [
          date,
          String(it.id ?? ''),
          String(it.location_ref?.place_id ?? ''),
          String(it.location_ref?.name ?? '').trim(),
          String(it.start_window ?? '').trim(),
        ].join('|'),
      );
    }
  }
  return parts.join('\n');
}

export function resolveWorkbenchDisplaySource(params: {
  tripId?: string;
  orchestratorDays: DayLike[] | undefined;
  tripDays: DayLike[] | undefined | null;
  autoApplyApplied?: boolean;
  entryPoint?: string;
  /** 改排草案待确认：左侧应预览编排草案，而非库内旧 Trip */
  itineraryAdjustDraftPending?: boolean;
  /** 整段多日重规划草案待确认：同改排，左侧预览编排结果 */
  fullTripReplanDraftPending?: boolean;
}): WorkbenchDisplaySource {
  if (!params.tripId?.trim() || !params.tripDays?.length) {
    return 'orchestration';
  }
  const orchFp = fingerprintItineraryDays(params.orchestratorDays);
  const tripFp = fingerprintItineraryDays(params.tripDays);
  if (orchFp === tripFp) {
    return 'orchestration';
  }
  if (params.autoApplyApplied) {
    return 'trip_persisted';
  }
  if (params.itineraryAdjustDraftPending || params.fullTripReplanDraftPending) {
    return 'orchestration';
  }
  if (params.entryPoint === 'planning_workbench') {
    return 'trip_persisted';
  }
  return 'orchestration';
}

export function buildWorkbenchDisplayAlignment(params: {
  tripId?: string;
  orchestratorDays: DayLike[] | undefined;
  tripDays: DayLike[] | undefined | null;
  autoApplyApplied?: boolean;
  entryPoint?: string;
  itineraryAdjustDraftPending?: boolean;
  fullTripReplanDraftPending?: boolean;
}): WorkbenchDisplayAlignment {
  const source = resolveWorkbenchDisplaySource(params);
  const aligned =
    !params.tripDays?.length ||
    fingerprintItineraryDays(params.orchestratorDays) === fingerprintItineraryDays(params.tripDays);
  return {
    timeline_source: source,
    feasibility_source: source,
    aligned,
    drift_detected: !aligned && Boolean(params.tripId?.trim()),
    ...(params.tripId?.trim() ? { trip_id: params.tripId.trim() } : {}),
  };
}

export function pickItineraryDaysForDisplay(
  alignment: WorkbenchDisplayAlignment,
  orchestratorDays: Itinerary['days'] | undefined,
  tripDays: Itinerary['days'] | undefined | null,
): Itinerary['days'] {
  if (alignment.timeline_source === 'trip_persisted' && tripDays?.length) {
    return tripDays;
  }
  return orchestratorDays ?? [];
}

/**
 * BFF 出站：`orchestrationResult.gate_result` 与 `state.gate_result` 常含同一份 violations，
 * 前端若两处都渲染会产生成对重复的 POI_CLOSED 卡片。保留 gate  verdict / guardian，violations 仅走 sibling gate_result。
 */
export function stripGateViolationsFromOrchestratorStateForClient(
  state: OrchestratorState | undefined | null,
): OrchestratorState | undefined {
  if (!state?.gate_result?.violations?.length) return state ?? undefined;
  const gr = state.gate_result;
  return {
    ...state,
    gate_result: {
      ...gr,
      violations: [],
    },
  };
}

export function pickSanitizedGateViolationsForWorkbench(
  gate: GateResult | undefined | null,
): GateResult['violations'] {
  return gate?.violations ?? [];
}
