import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';

export type RepairIssueDayHint = {
  day?: string;
  dayIndex?: number;
  entityRef?: { type?: string; id?: string };
};

function normalizeDateKey(date: string | undefined): string | undefined {
  if (!date?.trim()) return undefined;
  return date.trim().slice(0, 10);
}

function dayIndexFromIssue(
  issue: RepairIssueDayHint,
  itinerary: Itinerary,
): number | undefined {
  if (typeof issue.dayIndex === 'number' && issue.dayIndex >= 0) {
    return issue.dayIndex;
  }
  const dayKey = normalizeDateKey(issue.day);
  if (!dayKey) return undefined;
  const idx = itinerary.days.findIndex((d) => normalizeDateKey(d.date) === dayKey);
  return idx >= 0 ? idx : undefined;
}

function fingerprintDayItems(day: Itinerary['days'][number] | undefined): string {
  if (!day?.items?.length) return '';
  return day.items
    .map((item) => {
      const name = item.location_ref?.name ?? item.notes ?? item.type;
      const poi = (item.metadata as Record<string, unknown> | undefined)?.canonical_poi_id ?? '';
      return `${item.id}:${item.type}:${name}:${poi}`;
    })
    .join('|');
}

/** REPAIR 后推断需增量重编译的 dayIndex 集合 */
export function inferRepairAffectedDayIndices(params: {
  itineraryBefore?: Itinerary;
  itineraryAfter: Itinerary;
  verificationIssues?: RepairIssueDayHint[];
}): number[] {
  const { itineraryBefore, itineraryAfter, verificationIssues } = params;
  const affected = new Set<number>();

  for (const issue of verificationIssues ?? []) {
    const idx = dayIndexFromIssue(issue, itineraryAfter);
    if (idx !== undefined) affected.add(idx);
  }

  if (itineraryBefore?.days?.length) {
    const maxDays = Math.max(itineraryBefore.days.length, itineraryAfter.days.length);
    for (let i = 0; i < maxDays; i += 1) {
      const before = itineraryBefore.days[i];
      const after = itineraryAfter.days[i];
      if (fingerprintDayItems(before) !== fingerprintDayItems(after)) {
        affected.add(i);
      }
    }
  }

  if (affected.size === 0 && itineraryAfter.days.length > 0) {
    affected.add(0);
  }

  return [...affected].sort((a, b) => a - b);
}
