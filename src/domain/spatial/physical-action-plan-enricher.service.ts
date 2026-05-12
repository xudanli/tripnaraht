/**
 * POI → SpatialDomainSegment projection: fills `action_input.physical_domain` so PhysicalValidator
 * can evaluate segments without relying on narrative regex (Gatekeeper FRoadCheck remains separate).
 */

import { Injectable, Logger } from '@nestjs/common';
import { SpatialGraphService } from './spatial-graph.service';
import type { Itinerary, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';

function parseNumericPlaceId(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Combine day date + item start_window into ISO (UTC interpretation of local clock). */
export function combineDateAndStartWindowToIso(dateStr: string, startWindow?: string): string {
  const d = dateStr.slice(0, 10);
  let hh = 12;
  let mm = 0;
  if (startWindow && /^\d{1,2}:\d{2}/.test(startWindow.trim())) {
    const parts = startWindow.trim().slice(0, 5).split(':');
    hh = parseInt(parts[0]!, 10) || 12;
    mm = parseInt(parts[1]!, 10) || 0;
  }
  return new Date(Date.UTC(parseInt(d.slice(0, 4), 10), parseInt(d.slice(5, 7), 10) - 1, parseInt(d.slice(8, 10), 10), hh, mm, 0, 0)).toISOString();
}

/**
 * 与 `poi_cards[].itinerary_item_id` / `place_id` 对齐的稳定关联键（去重保序）。
 * 可选在行程项 `metadata.itinerary_item_id_aliases` / `legacy_item_id` / `duplicate_item_id` 上扩展别名。
 */
export function collectPoiCardMatchKeys(item: ItineraryItem): string[] {
  const seen = new Set<string>();
  const add = (s: unknown) => {
    if (typeof s === 'string' && s.trim()) seen.add(s.trim());
  };
  add(item.id);
  const pid = item.location_ref?.place_id;
  if (pid !== undefined && pid !== null) add(String(pid));

  const meta = item.metadata as Record<string, unknown> | undefined;
  if (meta) {
    add(meta['legacy_item_id']);
    add(meta['duplicate_item_id']);
    const aliases = meta['itinerary_item_id_aliases'];
    if (Array.isArray(aliases)) aliases.forEach(add);
  }
  return [...seen];
}

@Injectable()
export class PhysicalActionPlanEnricherService {
  private readonly logger = new Logger(PhysicalActionPlanEnricherService.name);
  private static readonly PROJECTION_VERSION = 'poi_segment_projection_v1';

  constructor(private readonly spatialGraph: SpatialGraphService) {}

  /**
   * Mutates `payload.orchestrationResult.itinerary.action_plan` when POIs map to spatial segments.
   * Skips when consultation UI stripped days or no POI place_ids.
   */
  async enrichRouteAndRunPayload(payload: Record<string, unknown>): Promise<void> {
    const ui = payload['ui_surface'];
    if (typeof ui === 'string' && ui.toLowerCase() === 'consultation') {
      return;
    }
    if (payload['consultation_itinerary_payload_suppressed'] === true) {
      return;
    }

    const orch = payload['orchestrationResult'] as { itinerary?: Itinerary } | undefined;
    const itinerary = orch?.itinerary;
    if (!itinerary?.days?.length) return;

    const projected = await this.buildProjectedActions(itinerary);

    const existing = Array.isArray(itinerary.action_plan) ? [...itinerary.action_plan] : [];
    const seenSeg = new Set<string>(
      existing.flatMap((a: unknown) => {
        if (!a || typeof a !== 'object') return [];
        const ai = (a as Record<string, unknown>).action_input as Record<string, unknown> | undefined;
        const pd = ai?.physical_domain as Record<string, unknown> | undefined;
        const sid = pd?.segment_id;
        return typeof sid === 'string' && sid.trim() ? [sid.trim()] : [];
      }),
    );

    let appended = 0;
    for (const p of projected) {
      const pd = p.action_input?.physical_domain as { segment_id?: string } | undefined;
      const sid = pd?.segment_id;
      if (sid && !seenSeg.has(sid)) {
        existing.push(p as any);
        seenSeg.add(sid);
        appended++;
      }
    }

    (itinerary as Itinerary).action_plan = existing as any;
    if (appended > 0) {
      this.logger.debug(`[PhysicalActionPlanEnricher] appended ${appended} action(s) with physical_domain`);
    }

    this.normalizePhysicalActionTargets(itinerary);
  }

  /**
   * ① 缺 `target_ref` 时从 `spatial_projection.itinerary_item_id`（或旧数据的 target_ref）回填；
   * ② 补全 `spatial_projection.poi_card_match_keys`，便于前端与 `poi_cards.itinerary_item_id` / place_id 对齐。
   */
  private normalizePhysicalActionTargets(itinerary: Itinerary): void {
    const plan = itinerary.action_plan as unknown;
    if (!Array.isArray(plan)) return;

    const itemById = new Map<string, ItineraryItem>();
    for (const day of itinerary.days ?? []) {
      for (const item of day.items ?? []) {
        itemById.set(item.id, item);
      }
    }

    for (const raw of plan as Record<string, unknown>[]) {
      if (!raw || typeof raw !== 'object') continue;
      const ai = raw['action_input'];
      if (!ai || typeof ai !== 'object') continue;
      const aiRec = ai as Record<string, unknown>;
      const pd = aiRec['physical_domain'];
      if (!pd || typeof pd !== 'object') continue;
      const segId = (pd as Record<string, unknown>)['segment_id'];
      if (typeof segId !== 'string' || !segId.trim()) continue;

      const spRaw = aiRec['spatial_projection'];
      const sp =
        spRaw && typeof spRaw === 'object'
          ? ({ ...(spRaw as Record<string, unknown>) } as Record<string, unknown>)
          : {};

      const iidFromSp = sp['itinerary_item_id'];
      const iidStr = typeof iidFromSp === 'string' && iidFromSp.trim() ? iidFromSp.trim() : '';

      const tr = raw['target_ref'];
      const trStr = typeof tr === 'string' && tr.trim() ? tr.trim() : '';

      if (!trStr && iidStr) {
        raw['target_ref'] = iidStr;
      }

      const trAfter = typeof raw['target_ref'] === 'string' && raw['target_ref'].trim() ? String(raw['target_ref']).trim() : '';

      const item =
        (iidStr ? itemById.get(iidStr) : undefined) ??
        (trAfter ? itemById.get(trAfter) : undefined);

      const keysMissing =
        !Array.isArray(sp['poi_card_match_keys']) || (sp['poi_card_match_keys'] as unknown[]).length === 0;

      if (item && keysMissing) {
        sp['itinerary_item_id'] = item.id;
        sp['poi_card_match_keys'] = collectPoiCardMatchKeys(item);
      } else if (keysMissing) {
        const fallbackKeys: string[] = [];
        if (iidStr) fallbackKeys.push(iidStr);
        if (trAfter && trAfter !== iidStr) fallbackKeys.push(trAfter);
        const pid = sp['place_id'];
        if (typeof pid === 'number' && Number.isFinite(pid)) fallbackKeys.push(String(pid));
        if (fallbackKeys.length > 0) {
          sp['poi_card_match_keys'] = [...new Set(fallbackKeys)];
        }
      }

      aiRec['spatial_projection'] = sp;
    }
  }

  private async buildProjectedActions(itinerary: Itinerary): Promise<
    Array<{
      action_id: string;
      action_type: 'ADJUST';
      target_type: 'ACTIVITY';
      target_ref?: string;
      requires_confirmation: boolean;
      risk_level: 'MEDIUM';
      action_input: Record<string, unknown>;
    }>
  > {
    const seenSegmentIds = new Set<string>();
    const out: Array<{
      action_id: string;
      action_type: 'ADJUST';
      target_type: 'ACTIVITY';
      target_ref?: string;
      requires_confirmation: boolean;
      risk_level: 'MEDIUM';
      action_input: Record<string, unknown>;
    }> = [];

    for (const day of itinerary.days ?? []) {
      const date = day.date;
      for (const item of day.items ?? []) {
        if (item.type !== 'POI') continue;
        const placeId = parseNumericPlaceId(item.location_ref?.place_id as string | undefined);
        if (placeId === null) continue;

        const spatialPoiId = await this.spatialGraph.resolveSpatialPoiIdFromPlaceId(placeId);
        if (!spatialPoiId) continue;

        const segments = await this.spatialGraph.findSegmentsTouchingSpatialPoi(spatialPoiId);
        const seg = this.spatialGraph.pickSegmentForPhysicalGate(segments);
        if (!seg) continue;
        if (seenSegmentIds.has(seg.id)) continue;
        seenSegmentIds.add(seg.id);

        const enterAt = combineDateAndStartWindowToIso(date, item.start_window);
        const roadHints = this.spatialGraph.extractRoadIdsFromEvidence(seg.evidence);
        const poiCardMatchKeys = collectPoiCardMatchKeys(item);

        out.push({
          action_id: `spatial_proj_${seg.id}_${item.id}`.slice(0, 191),
          action_type: 'ADJUST',
          target_type: 'ACTIVITY',
          target_ref: item.id,
          requires_confirmation: false,
          risk_level: 'MEDIUM',
          action_input: {
            physical_domain: {
              segment_id: seg.id,
              enter_at: enterAt,
            },
            spatial_projection: {
              version: PhysicalActionPlanEnricherService.PROJECTION_VERSION,
              place_id: placeId,
              spatial_poi_id: spatialPoiId,
              itinerary_item_id: item.id,
              poi_card_match_keys: poiCardMatchKeys,
              segment_type: seg.segmentType,
              preferred_for_physical_gate: seg.segmentType === 'F_ROAD',
            },
            ...(roadHints.length > 0 ? { froad_check_hints: { road_ids: roadHints } } : {}),
          },
        });
      }
    }

    return out;
  }
}
