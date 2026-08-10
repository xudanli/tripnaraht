/**
 * ROR 冲突识别：从 observed/derived facts + message 检出硬/软冲突。
 * 产出写入 ObservationReflection.conflictingFacts，并可投影到 RealitySnapshot.conflicts。
 */

import type { ObservationExecutionState } from './observation-executor';

export type ConflictSeverity = 'HARD' | 'SOFT';

export type DetectedConflict = {
  id: string;
  code: string;
  severity: ConflictSeverity;
  summary: string;
  evidenceRefs: string[];
};

function pick(
  state: ObservationExecutionState,
  key: string,
): unknown {
  return (
    state.observedFacts.find((f) => f.key === key)?.value ??
    state.derivedFacts.find((d) => d.key === key)?.value
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function textBlob(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const F_ROAD_RE = /\bF-?2\d{2}\b|\bF-?road\b|高地|highland/i;

function driveTypeIs2wd(drive: unknown, profile: unknown): boolean {
  const d = String(drive ?? '').toUpperCase();
  if (d === '2WD') return true;
  const p = asRecord(profile);
  if (p?.is4wd === false) return true;
  if (String(p?.driveType ?? '').toUpperCase() === '2WD') return true;
  return false;
}

function rentalBlocksFroad(restriction: unknown): boolean {
  const r = asRecord(restriction);
  if (!r) return false;
  if (r.froad === false) return true;
  const list = Array.isArray(r.restrictions) ? r.restrictions.map(String) : [];
  return list.some((x) => /no_?f_?road|NO_F_ROAD/i.test(x));
}

function routeMentionsFroad(state: ObservationExecutionState, message?: string): boolean {
  const segments = pick(state, 'route.roadSegments');
  const status = pick(state, 'road.segment.status');
  const activities = pick(state, 'targetDay.activities');
  const blob = [textBlob(segments), textBlob(status), textBlob(activities), message ?? ''].join(
    ' ',
  );
  return F_ROAD_RE.test(blob);
}

function parseTimeToMinutes(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) {
    const d = new Date(iso);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  return null;
}

function detectBookingTimeMismatch(
  state: ObservationExecutionState,
): DetectedConflict | null {
  const bookings = pick(state, 'booking.fixedCommitments');
  const activities = pick(state, 'targetDay.activities');
  if (!Array.isArray(bookings) || !Array.isArray(activities)) return null;

  for (const b of bookings) {
    const br = asRecord(b);
    if (!br) continue;
    const bookedAt =
      parseTimeToMinutes(br.confirmedTime ?? br.startTime ?? br.checkInTime) ?? null;
    if (bookedAt == null) continue;
    const bId = String(br.activityId ?? br.ref ?? br.id ?? '');
    const bTitle = String(br.title ?? br.name ?? '');

    for (const a of activities) {
      const ar = asRecord(a);
      if (!ar) continue;
      const aId = String(ar.id ?? ar.ref ?? '');
      const aTitle = String(ar.title ?? ar.name ?? '');
      const same =
        (bId && aId && bId === aId) ||
        (bTitle && aTitle && bTitle === aTitle) ||
        /冰川|glacier/i.test(bTitle + aTitle);
      if (!same) continue;
      const depart =
        parseTimeToMinutes(ar.departTime ?? ar.startTime ?? ar.departureTime) ?? null;
      if (depart == null) continue;
      if (Math.abs(depart - bookedAt) >= 30) {
        return {
          id: 'conflict_booking_time_mismatch',
          code: 'BOOKING_TIME_MISMATCH',
          severity: 'HARD',
          summary: `活动确认时间与行程出发时间不一致（预订约 ${Math.floor(bookedAt / 60)}:${String(bookedAt % 60).padStart(2, '0')}，行程约 ${Math.floor(depart / 60)}:${String(depart % 60).padStart(2, '0')}）`,
          evidenceRefs: ['booking.fixedCommitments', 'targetDay.activities'],
        };
      }
    }
  }
  return null;
}

function normalizeRegion(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .normalize('NFKD');
}

function detectLodgingActivityRegionConflict(
  state: ObservationExecutionState,
): DetectedConflict | null {
  const lodging = asRecord(pick(state, 'targetDay.accommodation'));
  const activities = pick(state, 'targetDay.activities');
  if (!lodging || !Array.isArray(activities) || activities.length === 0) return null;

  const lodgeRegion =
    lodging.region ?? lodging.area ?? lodging.city ?? lodging.placeName ?? lodging.name;
  const last = asRecord(activities[activities.length - 1]);
  if (!last) return null;
  const lastRegion = last.region ?? last.area ?? last.city ?? last.placeName ?? last.location;
  const a = normalizeRegion(lodgeRegion);
  const b = normalizeRegion(lastRegion);
  if (!a || !b || a === b) return null;

  // 粗粒度跨区：雷克雅未克 vs 霍芬 / Höfn / Reykjavik 等
  const cross =
    (/reykjav|雷克雅/.test(a) && /hofn|höfn|霍芬|vik|维克/.test(b)) ||
    (/hofn|höfn|霍芬/.test(a) && /reykjav|雷克雅/.test(b)) ||
    (/vik|维克/.test(a) && /reykjav|雷克雅|hofn|霍芬/.test(b));
  if (!cross && a.slice(0, 4) === b.slice(0, 4)) return null;

  if (cross || (a.length >= 3 && b.length >= 3 && a !== b)) {
    return {
      id: 'conflict_lodging_activity_region',
      code: 'LODGING_ACTIVITY_REGION_MISMATCH',
      severity: 'HARD',
      summary: `当日末活动区域与住宿区域不一致（活动：${String(lastRegion)}，住宿：${String(lodgeRegion)}）`,
      evidenceRefs: ['targetDay.activities', 'targetDay.accommodation'],
    };
  }
  return null;
}

function detectDrivingPreferenceConflict(
  state: ObservationExecutionState,
  message?: string,
): DetectedConflict | null {
  const driving = pick(state, 'derived.day.totalDrivingMinutes');
  if (typeof driving !== 'number') return null;
  const msg = message ?? '';
  const prefersShort =
    /不想.*开太久|别开太久|少开|驾驶.*短|每天.*轻松|不要.*6\s*小时/i.test(msg);
  if (prefersShort && driving >= 300) {
    return {
      id: 'conflict_driving_preference',
      code: 'DRIVING_LOAD_VS_PREFERENCE',
      severity: 'SOFT',
      summary: `用户希望少开，但当日驾驶约 ${Math.round(driving)} 分钟`,
      evidenceRefs: ['derived.day.totalDrivingMinutes', 'message'],
    };
  }
  if (driving >= 360) {
    return {
      id: 'conflict_driving_load_high',
      code: 'DRIVING_LOAD_HIGH',
      severity: 'SOFT',
      summary: `当日驾驶负荷偏高（约 ${Math.round(driving)} 分钟）`,
      evidenceRefs: ['derived.day.totalDrivingMinutes'],
    };
  }
  return null;
}

function detectPlanVsBookedGap(state: ObservationExecutionState): DetectedConflict | null {
  const activities = pick(state, 'targetDay.activities');
  const bookings = pick(state, 'booking.fixedCommitments');
  const availability = pick(state, 'booking.availability');
  if (!Array.isArray(activities) || activities.length === 0) return null;

  const plannedNeedBook = activities.filter((a) => {
    const ar = asRecord(a);
    if (!ar) return false;
    const status = String(ar.bookingStatus ?? ar.status ?? '').toUpperCase();
    if (status === 'BOOKED' || status === 'CONFIRMED') return false;
    const needs =
      ar.requiresBooking === true ||
      /冰川|glacier|ice\s*cave|船|boat|浮潜|潜水/i.test(textBlob(ar));
    return needs;
  });
  if (plannedNeedBook.length === 0) return null;

  const bookedIds = new Set<string>();
  if (Array.isArray(bookings)) {
    for (const b of bookings) {
      const br = asRecord(b);
      if (!br) continue;
      const st = String(br.status ?? br.bookingStatus ?? 'BOOKED').toUpperCase();
      if (st === 'HOLD' || st === 'AVAILABLE' || st === 'UNKNOWN' || st === 'CANCELLED') continue;
      bookedIds.add(String(br.activityId ?? br.ref ?? br.id ?? br.title ?? ''));
    }
  }

  const unbooked = plannedNeedBook.filter((a) => {
    const ar = asRecord(a)!;
    const id = String(ar.id ?? ar.ref ?? ar.title ?? '');
    return id && !bookedIds.has(id);
  });

  const avail = asRecord(availability);
  const allUnavailable =
    avail?.status === 'UNAVAILABLE' ||
    avail?.bookable === false ||
    (Array.isArray(avail?.items) &&
      (avail.items as unknown[]).every((x) => asRecord(x)?.status === 'UNAVAILABLE'));

  if (unbooked.length > 0 || allUnavailable) {
    return {
      id: 'conflict_plan_vs_booked',
      code: 'PLAN_NOT_BOOKED',
      severity: 'SOFT',
      summary: `有 ${unbooked.length || plannedNeedBook.length} 项活动仍是计划态，尚未真正预订`,
      evidenceRefs: ['targetDay.activities', 'booking.fixedCommitments'],
    };
  }
  return null;
}

function detectVehicleFroadConflict(
  state: ObservationExecutionState,
  message?: string,
): DetectedConflict | null {
  if (!routeMentionsFroad(state, message)) return null;
  const drive = pick(state, 'vehicle.driveType');
  const profile = pick(state, 'vehicle.profile');
  const restriction = pick(state, 'vehicle.rentalRestriction');
  const is2wd = driveTypeIs2wd(drive, profile);
  const blocked = rentalBlocksFroad(restriction);

  if (is2wd || blocked) {
    return {
      id: 'conflict_vehicle_froad',
      code: 'VEHICLE_FROAD_MISMATCH',
      severity: 'HARD',
      summary: is2wd
        ? '车辆为两驱，但路线含 F-road / 高地路段，当前方案不可按原计划执行'
        : '租车合同不允许进入 F-road，但路线含 F-road / 高地路段',
      evidenceRefs: [
        'vehicle.driveType',
        'vehicle.rentalRestriction',
        'route.roadSegments',
      ],
    };
  }
  return null;
}

/**
 * 检测观察态冲突。HARD 冲突应阻止盲目 FREEZE，改为 ASK_USER。
 */
export function detectObservationConflicts(input: {
  state: ObservationExecutionState;
  message?: string;
}): DetectedConflict[] {
  const { state, message } = input;
  const out: DetectedConflict[] = [];
  const push = (c: DetectedConflict | null) => {
    if (c) out.push(c);
  };

  push(detectVehicleFroadConflict(state, message));
  push(detectBookingTimeMismatch(state));
  push(detectLodgingActivityRegionConflict(state));
  push(detectDrivingPreferenceConflict(state, message));
  push(detectPlanVsBookedGap(state));

  return out;
}

export function formatConflictsForReflection(conflicts: DetectedConflict[]): string[] {
  return conflicts.map((c) => `[${c.severity}:${c.code}] ${c.summary}`);
}

export function hasHardObservationConflict(conflicts: DetectedConflict[]): boolean {
  return conflicts.some((c) => c.severity === 'HARD');
}
