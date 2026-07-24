import { DateTime } from 'luxon';

/** Next future itinerary start on the execution day; omit when all have passed. */
export function resolveExecutionActionDeadlineFromStartTimes(
  startTimes: Array<Date | string | null | undefined>,
  now: DateTime = DateTime.now(),
): string | undefined {
  const upcoming = startTimes
    .filter((t): t is Date | string => t != null)
    .map((t) => (t instanceof Date ? DateTime.fromJSDate(t) : DateTime.fromISO(String(t))))
    .filter((dt) => dt.isValid && dt >= now)
    .sort((a, b) => a.toMillis() - b.toMillis())[0];

  return upcoming?.toISO() ?? undefined;
}

/** Mobile today-row slots (`HH:mm`) on the current local calendar day. */
export function resolveExecutionActionDeadlineFromTimeSlots(
  items: Array<{ time?: string; status?: string }>,
  now: DateTime = DateTime.now(),
): string | undefined {
  const eligibleStatuses = new Set(['upcoming', 'inProgress', 'risk']);
  const candidates = items
    .filter((i) => i.time && (!i.status || eligibleStatuses.has(i.status)))
    .map((i) => {
      const [hh, mm] = i.time!.split(':').map(Number);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
      const dt = now.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
      return dt.isValid ? dt : null;
    })
    .filter((dt): dt is DateTime => dt != null && dt >= now)
    .sort((a, b) => a.toMillis() - b.toMillis());

  return candidates[0]?.toISO() ?? undefined;
}
