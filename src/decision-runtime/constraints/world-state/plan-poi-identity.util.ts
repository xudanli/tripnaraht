import {
  isCanonicalTravelPoiId,
  readCanonicalPoiIdFromMetadata,
  resolveCanonicalPoiIdSync,
} from '../../../canonical-poi-resolution/utils/resolve-poi-id-sync.util';
import type { TripPlan } from '../../../trips/decision/plan-model';

export interface PlanPoiIdentitySlotReport {
  slotId: string;
  day: number;
  title: string;
  poiId?: string;
  valid: boolean;
  reason?: string;
}

export interface PlanPoiIdentityAudit {
  slots: PlanPoiIdentitySlotReport[];
  allCanonical: boolean;
  canonicalPoiIds: string[];
}

export { isCanonicalTravelPoiId, readCanonicalPoiIdFromMetadata };

export function auditPlanPoiIdentity(
  plan: TripPlan,
  countryCode = 'IS',
): PlanPoiIdentityAudit {
  const slots: PlanPoiIdentitySlotReport[] = [];
  const canonicalPoiIds = new Set<string>();

  for (const day of plan.days ?? []) {
    for (const slot of day.timeSlots ?? []) {
      const report = auditSlotPoiIdentity(slot, day.day, countryCode);
      slots.push(report);
      if (report.valid && report.poiId) {
        canonicalPoiIds.add(report.poiId);
      }
    }
  }

  const activitySlots = slots.filter((s) => s.poiId || s.title);
  const allCanonical =
    activitySlots.length === 0 ||
    activitySlots.every((s) => s.valid);

  return {
    slots,
    allCanonical,
    canonicalPoiIds: [...canonicalPoiIds],
  };
}

function auditSlotPoiIdentity(
  slot: { id: string; title: string; poiId?: string; type?: string },
  day: number,
  countryCode: string,
): PlanPoiIdentitySlotReport {
  const raw = slot.poiId?.trim();
  if (!raw) {
    if (slot.type === 'hotel' || slot.type === 'transit') {
      return { slotId: slot.id, day, title: slot.title, valid: true };
    }
    return {
      slotId: slot.id,
      day,
      title: slot.title,
      valid: false,
      reason: 'missing_poi_id',
    };
  }

  if (isCanonicalTravelPoiId(raw)) {
    return { slotId: slot.id, day, title: slot.title, poiId: raw, valid: true };
  }

  const resolved = resolveCanonicalPoiIdSync({ name: raw, countryCode });
  if (resolved.status === 'MATCHED' && resolved.poiId) {
    return {
      slotId: slot.id,
      day,
      title: slot.title,
      poiId: resolved.poiId,
      valid: true,
      reason: 'resolved_from_legacy_label',
    };
  }

  return {
    slotId: slot.id,
    day,
    title: slot.title,
    poiId: raw,
    valid: false,
    reason: resolved.status === 'NEEDS_CONFIRMATION' ? 'needs_confirmation' : 'not_canonical',
  };
}

export function normalizePlanPoiIds(plan: TripPlan, countryCode = 'IS'): TripPlan {
  const audit = auditPlanPoiIdentity(plan, countryCode);
  const bySlotId = new Map(audit.slots.map((s) => [s.slotId, s]));

  return {
    ...plan,
    days: (plan.days ?? []).map((day) => ({
      ...day,
      timeSlots: (day.timeSlots ?? []).map((slot) => {
        const report = bySlotId.get(slot.id);
        if (report?.valid && report.poiId && report.poiId !== slot.poiId) {
          return { ...slot, poiId: report.poiId };
        }
        return slot;
      }),
    })),
  };
}
