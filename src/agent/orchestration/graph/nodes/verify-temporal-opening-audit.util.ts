import {
  formatVerifyPoiClosedOutputsZh,
  formatVerifyTemporalOpeningInputsZh,
} from '../../../utils/decision-log-user-facing.zh.util';
import type { OrchestratorState } from '../../../interfaces/trip-plan.interface';

/** C1 strict：将 POI_CLOSED 与 opening_hours_evidence 对齐，写入 temporal_opening_v1 审计证据 */
export function appendVerifyTemporalOpeningAuditProof(
  state: OrchestratorState,
  issues: unknown[],
): void {
  try {
    const poiClosed = (issues as any[]).filter(
      (i) => i?.code === 'POI_CLOSED' && i?.entityRef?.type === 'POI',
    );
    if (poiClosed.length === 0 || !state.itinerary || !state.research_data?.opening_hours_evidence) {
      return;
    }
    const ohData = state.research_data.opening_hours_evidence;
    const openingHoursMap = new Map<string, any>();
    const rows = Array.isArray(ohData)
      ? ohData
      : Array.isArray((ohData as any)?.opening_hours)
        ? (ohData as any).opening_hours
        : [];
    for (const r of rows) {
      if (r && r.poi_id && r.opening_hours) openingHoursMap.set(String(r.poi_id), r);
    }
    const day0 = (state.itinerary as any)?.days?.[0];
    const dayDate = String(day0?.date ?? '');
    const items: any[] = Array.isArray(day0?.items) ? day0.items : [];
    for (const it of items) {
      const poiId = String(it?.location_ref?.place_id ?? '');
      if (!poiId) continue;
      const hit = poiClosed.find((x) => String(x?.entityRef?.id ?? '') === String(it?.id ?? ''));
      if (!hit) continue;
      const oh = openingHoursMap.get(poiId);
      const openWindow =
        oh?.opening_hours ??
        (oh?.open_time && oh?.close_time ? `${oh.open_time}-${oh.close_time}` : undefined) ??
        'UNKNOWN';
      state.decision_log.push({
        request_id: state.request_id,
        step: 'VERIFY',
        actor: 'Orchestrator',
        inputs_summary: formatVerifyTemporalOpeningInputsZh(),
        outputs_summary: formatVerifyPoiClosedOutputsZh(
          String(it?.location_ref?.name ?? poiId),
          String(it?.start_window ?? ''),
          String(it?.end_window ?? ''),
        ),
        evidence_refs: oh?.evidence_id ? [String(oh.evidence_id)] : [],
        timestamp: new Date().toISOString(),
        metadata: {
          rule_id: 'temporal_opening_v1',
          details: {
            evidence: {
              type: 'opening_hours',
              source: 'OPENING_HOURS',
              poi_id: poiId,
              date: dayDate || undefined,
              timezone: 'UTC',
              planned_start:
                dayDate && it?.start_window
                  ? `${dayDate}T${String(it.start_window)}:00.000Z`
                  : null,
              planned_end:
                dayDate && it?.end_window ? `${dayDate}T${String(it.end_window)}:00.000Z` : null,
              open_window: openWindow,
              is_violated: true,
              item_id: String(it?.id ?? ''),
            },
          },
        },
      } as any);
    }
  } catch {
    // best-effort only
  }
}
