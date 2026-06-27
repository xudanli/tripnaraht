/**
 * POI 准入 Plan B → Repair 动作映射
 */

import { CONSTRAINT_IDS } from '../../agent/services/constraint-registry';
import type { VerificationIssue } from '../../decision/kernel/decision-state.types';
import type { AccessCapacityPlanB } from '../interfaces/poi-access-capacity.interface';
import {
  getPrimaryAlternative,
  ICELAND_POI_ALTERNATIVES,
} from '../fixtures/iceland-poi-alternatives';

export type ItineraryLike = {
  days?: Array<{
    items?: Array<{
      id?: string;
      start_window?: string;
      notes?: string;
      metadata?: Record<string, unknown>;
      location_ref?: Record<string, unknown>;
    }>;
  }>;
  metadata?: Record<string, unknown>;
  request_id?: string;
};

export function isPoiAccessConstraintIssue(issue: VerificationIssue): boolean {
  const meta = issue.metadata as { poi_access_constraint_id?: string } | undefined;
  const cid = meta?.poi_access_constraint_id;
  if (!cid) {
    return (
      issue.message.includes('停车需要预约') ||
      issue.message.includes('需要预约') ||
      issue.message.includes('步道') ||
      issue.message.includes('准入规则待')
    );
  }
  return (
    cid === CONSTRAINT_IDS.ENTITY_ACCESS_BLOCKED ||
    cid === CONSTRAINT_IDS.ENTITY_PARKING_RESERVATION_MISSING ||
    cid === CONSTRAINT_IDS.ENTITY_MANDATORY_RESERVATION ||
    cid === CONSTRAINT_IDS.ENTITY_INVENTORY_SOLD_OUT ||
    cid === CONSTRAINT_IDS.ENTITY_VEHICLE_INCOMPATIBLE ||
    cid === CONSTRAINT_IDS.ENTITY_PARKING_WAIT_HIGH
  );
}

/** REORDER：将 POI 到达时刻提前（Plan B SHIFT_ARRIVAL） */
export function applyPoiAccessShiftArrivalRepair(
  issue: VerificationIssue,
  itinerary: ItineraryLike,
): { ok: boolean; itinerary?: ItineraryLike; shiftMinutes?: number } {
  const itemId = issue.entityRef?.id;
  if (!itemId) return { ok: false };

  const suggested = issue.suggestedActions?.find(
    (a) => a.action === 'REORDER' && a.detail?.includes('提前'),
  );
  const shiftMatch = suggested?.detail?.match(/(\d+)\s*分钟/);
  const shiftMin = shiftMatch ? Number(shiftMatch[1]) : 45;

  const next: ItineraryLike = {
    ...itinerary,
    days: (itinerary.days ?? []).map((d) => ({
      ...d,
      items: [...(d.items ?? [])],
    })),
  };

  for (const day of next.days ?? []) {
    const items = day.items ?? [];
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx < 0) continue;

    const item = items[idx];
    const start = item.start_window;
    if (!start || !/^\d{1,2}:\d{2}$/.test(start)) return { ok: false };

    const [h, m] = start.split(':').map(Number);
    const total = Math.max(0, h * 60 + m - shiftMin);
    const newH = Math.floor(total / 60);
    const newM = total % 60;
    const newStart = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;

    items[idx] = {
      ...item,
      start_window: newStart,
      metadata: {
        ...(item.metadata ?? {}),
        poi_access_repair: 'SHIFT_ARRIVAL',
        poi_access_repair_shift_min: shiftMin,
        poi_access_repair_from: start,
      },
      notes: `${item.notes ?? ''} [POI Access Repair] 提前 ${shiftMin} 分钟到达`.trim(),
    };
    day.items = items;

    next.metadata = {
      ...(next.metadata ?? {}),
      explain_logs: [
        `[POI Access Repair] SHIFT_ARRIVAL ${itemId}: ${start} → ${newStart}`,
        ...((next.metadata?.explain_logs as string[]) ?? []),
      ],
    };
    return { ok: true, itinerary: next, shiftMinutes: shiftMin };
  }

  return { ok: false };
}

export function resolveAlternativePoiIdFromIssue(issue: VerificationIssue): {
  poiId: string;
  name: string;
} | undefined {
  const meta = issue.metadata as { poi_access_alternative_poi_id?: string } | undefined;
  if (meta?.poi_access_alternative_poi_id) {
    const alt = Object.values(ICELAND_POI_ALTERNATIVES)
      .flat()
      .find((a) => a.poiId === meta.poi_access_alternative_poi_id);
    return {
      poiId: meta.poi_access_alternative_poi_id,
      name: alt?.name ?? meta.poi_access_alternative_poi_id,
    };
  }

  const replaceAction = issue.suggestedActions?.find((a) => a.action === 'REPLACE');
  if (replaceAction) {
    const blockedFromMeta = (
      issue.metadata as { poi_access_blocked_poi_id?: string } | undefined
    )?.poi_access_blocked_poi_id;
    if (blockedFromMeta) {
      const primary = getPrimaryAlternative(blockedFromMeta);
      if (primary) return { poiId: primary.poiId, name: primary.name };
    }
  }

  return undefined;
}

/** REPLACE：按 Plan B alternativePoiId 替换行程 POI */
export function applyPoiAccessReplaceRepair(
  issue: VerificationIssue,
  itinerary: ItineraryLike,
  blockedPoiSlug?: string,
): { ok: boolean; itinerary?: ItineraryLike; alternativePoiId?: string } {
  const itemId = issue.entityRef?.id;
  if (!itemId) return { ok: false };

  const alt =
    resolveAlternativePoiIdFromIssue(issue) ??
    (blockedPoiSlug ? (() => {
      const p = getPrimaryAlternative(blockedPoiSlug);
      return p ? { poiId: p.poiId, name: p.name } : undefined;
    })() : undefined);

  if (!alt) return { ok: false };

  const next: ItineraryLike = {
    ...itinerary,
    days: (itinerary.days ?? []).map((d) => ({
      ...d,
      items: [...(d.items ?? [])],
    })),
  };

  for (const day of next.days ?? []) {
    const items = day.items ?? [];
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx < 0) continue;

    const item = items[idx];
    items[idx] = {
      ...item,
      location_ref: {
        ...(item.location_ref ?? {}),
        name: alt.name,
        poi_access_slug: alt.poiId,
      },
      metadata: {
        ...(item.metadata ?? {}),
        poi_access_repair: 'REPLACE',
        poi_access_repair_from: blockedPoiSlug ?? item.location_ref?.name,
        poi_access_repair_to: alt.poiId,
      },
      notes: `${item.notes ?? ''} [POI Access Repair] 替换为 ${alt.name}`.trim(),
    };
    day.items = items;

    next.metadata = {
      ...(next.metadata ?? {}),
      explain_logs: [
        `[POI Access Repair] REPLACE ${itemId} → ${alt.poiId} (${alt.name})`,
        ...((next.metadata?.explain_logs as string[]) ?? []),
      ],
    };
    return { ok: true, itinerary: next, alternativePoiId: alt.poiId };
  }

  return { ok: false };
}

export function planBToSuggestedActions(
  planB: AccessCapacityPlanB[],
): VerificationIssue['suggestedActions'] {
  return planB.map((p) => ({
    action:
      p.action === 'BOOK_NOW'
        ? 'ASK_USER'
        : p.action === 'CHANGE_DATE' || p.action === 'USE_ALTERNATIVE'
          ? 'REPLACE'
          : 'REORDER',
    detail: p.suggestedArrivalTime
      ? `${p.detail}（建议 ${p.suggestedArrivalTime}）`
      : p.detail,
  }));
}
