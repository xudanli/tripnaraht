/**
 * 预约凭证 — trip.metadata.reservationEvidence
 */

import type { PoiAccessTargetResource } from '../interfaces/poi-access-capacity.interface';

export const TRIP_RESERVATION_EVIDENCE_METADATA_KEY = 'reservationEvidence' as const;

export type TripReservationEvidenceItem = {
  id: string;
  tripItemId: string;
  poiId: string;
  resource: PoiAccessTargetResource;
  dateISO: string;
  slotStartTime?: string;
  slotEndTime?: string;
  confirmationCode?: string;
  attachmentId?: string;
  createdAt: string;
  source?: 'manual' | 'booking_sync';
};

export type TripReservationEvidenceStore = {
  revision: 1;
  items: TripReservationEvidenceItem[];
};

export type TripReservationEvidenceInput = {
  id?: string;
  tripItemId: string;
  poiId: string;
  resource?: PoiAccessTargetResource;
  /** 访问日 YYYY-MM-DD；可省略，后端从 tripItem 所属 TripDay 推导 */
  dateISO?: string;
  /** 与 dateISO 二选一/互补；前端表单常用字段名 */
  plannedArrival?: string;
  slotStartTime?: string;
  slotEndTime?: string;
  confirmationCode?: string;
  /** 前端 apply-repair / 表单别名 */
  parkingReservationRef?: string;
  attachmentId?: string;
};

/** 归一化 POST body（兼容 parkingReservationRef / plannedArrival 别名） */
export function normalizeTripReservationEvidenceInput(
  raw: TripReservationEvidenceInput & Record<string, unknown>,
): TripReservationEvidenceInput {
  const confirmationCode =
    (typeof raw.confirmationCode === 'string' ? raw.confirmationCode : undefined) ??
    (typeof raw.parkingReservationRef === 'string' ? raw.parkingReservationRef : undefined);

  const plannedArrival =
    typeof raw.plannedArrival === 'string'
      ? raw.plannedArrival
      : typeof raw.slotStartTime === 'string'
        ? raw.slotStartTime
        : undefined;

  return {
    id: typeof raw.id === 'string' ? raw.id : undefined,
    tripItemId: String(raw.tripItemId ?? ''),
    poiId: String(raw.poiId ?? ''),
    resource: raw.resource,
    dateISO: typeof raw.dateISO === 'string' ? raw.dateISO.trim().slice(0, 10) : undefined,
    plannedArrival,
    slotStartTime: typeof raw.slotStartTime === 'string' ? raw.slotStartTime : plannedArrival,
    slotEndTime: typeof raw.slotEndTime === 'string' ? raw.slotEndTime : undefined,
    confirmationCode,
    attachmentId: typeof raw.attachmentId === 'string' ? raw.attachmentId : undefined,
  };
}

export function formatDateISO(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim().slice(0, 10);
}

export function readReservationEvidenceStore(
  metadata: unknown,
): TripReservationEvidenceStore {
  if (!metadata || typeof metadata !== 'object') {
    return { revision: 1, items: [] };
  }
  const raw = (metadata as Record<string, unknown>)[TRIP_RESERVATION_EVIDENCE_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return { revision: 1, items: [] };
  const store = raw as TripReservationEvidenceStore;
  return {
    revision: 1,
    items: Array.isArray(store.items) ? store.items : [],
  };
}

export function parseArrivalMinutes(hhmm: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 凭证是否覆盖计划到达 ±2h */
export function hasReservationEvidenceForSlot(input: {
  evidence: TripReservationEvidenceStore;
  tripItemId: string;
  poiId: string;
  resource: PoiAccessTargetResource;
  dateISO: string;
  plannedArrival: string;
}): boolean {
  const day = input.dateISO.slice(0, 10);
  const arrivalMin = parseArrivalMinutes(input.plannedArrival);
  if (arrivalMin == null) return false;

  return input.evidence.items.some((item) => {
    if (item.tripItemId !== input.tripItemId && item.poiId !== input.poiId) {
      if (item.poiId !== input.poiId || item.dateISO.slice(0, 10) !== day) return false;
    }
    if (item.dateISO.slice(0, 10) !== day) return false;
    if (item.resource !== input.resource && item.poiId !== input.poiId) return false;
    if (!item.confirmationCode && !item.attachmentId) return false;

    if (item.slotStartTime) {
      const slotStart = parseArrivalMinutes(item.slotStartTime);
      if (slotStart != null && Math.abs(slotStart - arrivalMin) <= 120) return true;
    }
    return item.tripItemId === input.tripItemId || item.poiId === input.poiId;
  });
}

export function evidenceToUserReservations(
  store: TripReservationEvidenceStore,
): Array<{
  resource: PoiAccessTargetResource;
  dateISO: string;
  slotStartTime?: string;
  slotEndTime?: string;
}> {
  return store.items
    .filter((i) => i.confirmationCode || i.attachmentId)
    .map((i) => ({
      resource: i.resource,
      dateISO: i.dateISO,
      slotStartTime: i.slotStartTime,
      slotEndTime: i.slotEndTime,
    }));
}
