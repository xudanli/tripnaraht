/**
 * 由预约库存快照反推拥挤程度
 *
 * 例：09:00 剩余 0 / 11:00 剩余 18 → 09:00–10:30 HIGH
 */

import type {
  PoiCapacitySnapshot,
  PoiCrowdingSnapshot,
  PoiCrowdLevel,
} from '../interfaces/poi-access-capacity.interface';

function parseHour(hhmm?: string): number | undefined {
  if (!hhmm) return undefined;
  const m = /^(\d{1,2}):/.exec(hhmm);
  return m ? Number(m[1]) : undefined;
}

function remainingToCrowdLevel(
  remaining: number | undefined,
  capacity: number | undefined,
): PoiCrowdLevel {
  if (remaining === 0) return 'FULL';
  if (remaining == null || capacity == null || capacity <= 0) return 'MEDIUM';
  const ratio = remaining / capacity;
  if (ratio <= 0.1) return 'HIGH';
  if (ratio <= 0.35) return 'MEDIUM';
  return 'LOW';
}

function estimateWaitFromRemaining(remaining: number, capacity: number): number {
  if (remaining <= 0) return 45;
  const fillRatio = 1 - remaining / capacity;
  return Math.round(5 + fillRatio * 35);
}

/** 从当日库存快照推断目标时段拥挤快照 */
export function inferCrowdingFromCapacitySnapshots(input: {
  poiId: string;
  dateISO: string;
  arrivalTime: string;
  snapshots: PoiCapacitySnapshot[];
}): PoiCrowdingSnapshot | undefined {
  if (!input.snapshots.length) return undefined;

  const arrivalHour = parseHour(input.arrivalTime) ?? 12;
  const daySnaps = input.snapshots.filter(
    (s) => s.dateISO.slice(0, 10) === input.dateISO.slice(0, 10),
  );
  if (!daySnaps.length) return undefined;

  let matched: PoiCapacitySnapshot | undefined;
  for (const snap of daySnaps) {
    const start = parseHour(snap.slotStartTime);
    const end = parseHour(snap.slotEndTime);
    if (start != null && end != null && arrivalHour >= start && arrivalHour < end) {
      matched = snap;
      break;
    }
  }
  matched ??= daySnaps[0];

  const remaining = matched.remaining;
  const capacity = matched.capacity;
  const crowdLevel = remainingToCrowdLevel(remaining, capacity);

  const p50 =
    remaining != null && capacity != null
      ? estimateWaitFromRemaining(remaining, capacity)
      : crowdLevel === 'FULL'
        ? 40
        : crowdLevel === 'HIGH'
          ? 25
          : 10;
  const p90 = Math.round(p50 * 1.7);

  return {
    poiId: input.poiId,
    observedAt: matched.observedAt,
    bookingRemaining: remaining,
    bookingCapacity: capacity,
    predictedWaitP50: p50,
    predictedWaitP90: p90,
    crowdLevel,
    signalSources: ['BOOKING'],
    confidenceScore: matched.confidenceScore ?? 0.75,
  };
}

/** 从相邻班次余量推断当前时段相对拥挤（无精确匹配时） */
export function inferCrowdingFromAdjacentSlots(input: {
  poiId: string;
  snapshots: PoiCapacitySnapshot[];
}): PoiCrowdingSnapshot | undefined {
  const sorted = [...input.snapshots].sort((a, b) => {
    const ah = parseHour(a.slotStartTime) ?? 0;
    const bh = parseHour(b.slotStartTime) ?? 0;
    return ah - bh;
  });
  if (!sorted.length) return undefined;

  const soldOutCount = sorted.filter((s) => s.soldOut || s.remaining === 0).length;
  const ratio = soldOutCount / sorted.length;

  let crowdLevel: PoiCrowdLevel = 'LOW';
  if (ratio >= 0.6) crowdLevel = 'HIGH';
  else if (ratio >= 0.3) crowdLevel = 'MEDIUM';

  return {
    poiId: input.poiId,
    observedAt: sorted[0].observedAt,
    crowdLevel,
    predictedWaitP50: crowdLevel === 'HIGH' ? 28 : crowdLevel === 'MEDIUM' ? 15 : 5,
    predictedWaitP90: crowdLevel === 'HIGH' ? 45 : crowdLevel === 'MEDIUM' ? 25 : 10,
    signalSources: ['BOOKING'],
    confidenceScore: 0.7,
  };
}
