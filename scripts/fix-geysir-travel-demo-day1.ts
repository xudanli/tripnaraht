/**
 * Restore Geysir demo trip day1 for travel-timing T1/T5 smoke:
 * 1) Canonical item order (机场 → Geysir → …)
 * 2) Cascade startTime/endTime from travel-info durations
 *
 * Usage: npx tsx scripts/fix-geysir-travel-demo-day1.ts [tripId]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_TRIP = '492ff5d0-8461-461a-b975-3f65474e8108';
const DEFAULT_DAY = 'b754825e-6e7c-4d68-ad91-ef027a406696';
const BASE_DATE = '2026-06-20T08:00:00.000Z';
const VISIT_MINUTES = 45;
const BUFFER_MINUTES = 10;

const CANONICAL_ORDER = [
  '凯夫拉维克国际机场',
  'Geysir租车公司',
  '盖歇尔间歇泉',
  '塞里雅兰瀑布',
  '黑沙滩套房酒店',
  '钻石沙滩',
] as const;

function matchPlace(nameCN: string | null | undefined, key: string): boolean {
  if (!nameCN) return false;
  if (key === 'Geysir租车公司') return nameCN.includes('Geysir') && nameCN.includes('租');
  if (key === '凯夫拉维克国际机场') return nameCN.includes('凯夫拉维克') || nameCN.includes('国际机场');
  if (key === '盖歇尔间歇泉') return nameCN.includes('盖歇尔') || nameCN.includes('间歇泉');
  if (key === '塞里雅兰瀑布') return nameCN.includes('塞里雅兰');
  if (key === '黑沙滩套房酒店') return nameCN.includes('黑沙滩');
  if (key === '钻石沙滩') return nameCN.includes('钻石');
  return nameCN.includes(key);
}

async function syncTravelViaApi(tripId: string, backend: string): Promise<void> {
  const res = await fetch(`${backend}/api/trips/${tripId}/feasibility-report/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    console.warn('validate HTTP', res.status, await res.text());
  }
}

async function main() {
  const tripId = process.argv[2] ?? DEFAULT_TRIP;
  const dayId = DEFAULT_DAY;
  const backend = process.env.BACKEND ?? 'http://127.0.0.1:3000';

  const day = await prisma.tripDay.findFirst({ where: { id: dayId, tripId } });
  if (!day) throw new Error(`Day ${dayId} not found on trip ${tripId}`);

  const items = await prisma.itineraryItem.findMany({
    where: { tripDayId: dayId },
    include: { Place: { select: { nameCN: true } } },
  });

  const ordered: typeof items = [];
  for (const key of CANONICAL_ORDER) {
    const hit = items.find((it) => matchPlace(it.Place?.nameCN, key));
    if (hit) ordered.push(hit);
  }
  for (const it of items) {
    if (!ordered.some((o) => o.id === it.id)) ordered.push(it);
  }

  // Phase 1: equal hourly slots so travel-info can compute segments
  let slot = new Date(BASE_DATE);
  for (const item of ordered) {
    await prisma.itineraryItem.update({
      where: { id: item.id },
      data: {
        startTime: new Date(slot),
        endTime: new Date(slot.getTime() + VISIT_MINUTES * 60 * 1000),
        ...(item.travelMode === 'WALKING' ? { travelMode: null } : {}),
      },
    });
    slot = new Date(slot.getTime() + 60 * 60 * 1000);
  }

  try {
    await syncTravelViaApi(tripId, backend);
  } catch (e) {
    console.warn('validate skipped (server unavailable):', e);
  }

  const refreshed = await prisma.itineraryItem.findMany({
    where: { tripDayId: dayId, id: { in: ordered.map((o) => o.id) } },
  });
  const byId = new Map(refreshed.map((it) => [it.id, it]));

  // Phase 2: cascade realistic start/end from travelFromPreviousDuration
  let cursor = new Date(BASE_DATE);
  const log: string[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const item = byId.get(ordered[i].id)!;
    const travelMin = i === 0 ? 0 : Math.max(0, item.travelFromPreviousDuration ?? 0);
    if (i > 0) {
      cursor = new Date(cursor.getTime() + (travelMin + BUFFER_MINUTES) * 60 * 1000);
    }
    const startTime = new Date(cursor);
    const endTime = new Date(startTime.getTime() + VISIT_MINUTES * 60 * 1000);
    cursor = endTime;

    await prisma.itineraryItem.update({
      where: { id: item.id },
      data: { startTime, endTime },
    });
    log.push(
      `${startTime.toISOString()}–${endTime.toISOString()} ${ordered[i].Place?.nameCN} (travel=${travelMin}min)`,
    );
  }

  try {
    await syncTravelViaApi(tripId, backend);
  } catch {
    /* optional */
  }

  console.log(log.join('\n'));
  console.log(JSON.stringify({ tripId, dayId, itemCount: ordered.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
