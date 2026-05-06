/**
 * Plan 1 — whole-itinerary temporal shift (same Δt for every scheduled node; no local compression in MVP).
 */

const MS_PER_DAY = 86400000;

/** Shift anchor date by whole UTC calendar days (Plan 1 deferral). */
export function addUtcCalendarDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + Math.floor(days));
  return d;
}

/** Parse MM-DD in UTC against reference year (from Physical static policy cards). */
export function utcDateFromMonthDay(year: number, mmDd: string, hourUtc = 12): Date {
  const [mm, dd] = mmDd.split('-').map((x) => Number(x));
  return new Date(Date.UTC(year, mm - 1, dd, hourUtc, 0, 0, 0));
}

/**
 * Iceland F-Road fallback: open corridor starts inclusive Jun 20 (see static policy inclusive_from).
 * Returns suggested physical_domain.enter_at after moving to first open day + buffer.
 */
export function computeIcelandFrRoadTemporalShift(params: {
  current_enter_at: Date;
  open_window_inclusive_from: string;
  buffer_days: number;
}): {
  earliest_open_utc: Date;
  suggested_enter_at: Date;
  shift_days: number;
} {
  const y = params.current_enter_at.getUTCFullYear();
  const earliestOpen = utcDateFromMonthDay(y, params.open_window_inclusive_from, 12);
  let base = earliestOpen;
  if (params.current_enter_at.getTime() >= earliestOpen.getTime()) {
    base = new Date(params.current_enter_at);
  }
  const suggested = new Date(base);
  suggested.setUTCDate(suggested.getUTCDate() + params.buffer_days);
  const shift_days = Math.max(0, Math.ceil((suggested.getTime() - params.current_enter_at.getTime()) / MS_PER_DAY));
  return { earliest_open_utc: earliestOpen, suggested_enter_at: suggested, shift_days };
}

export function riskFromShiftDays(shift_days: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (shift_days > 21) return 'HIGH';
  if (shift_days > 7) return 'MEDIUM';
  return 'LOW';
}
