#!/usr/bin/env npx tsx
/**
 * 对指定 Trip 运行 itinerary.temporalOptimize 逻辑并（可选）写回 DB。
 *
 * Usage:
 *   npx tsx scripts/run-temporal-optimize-trip.ts <tripId> [--apply]
 */

import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';
import dotenv from 'dotenv';
import {
  isInSleepLock,
  optimizeTemporalConstraints,
  parseItemWindowMinutes,
} from '../src/skills/itinerary/temporal-constraint-optimizer.util';
import type { Itinerary, ItineraryItem } from '../src/agent/interfaces/trip-plan.interface';

dotenv.config();

const prisma = new PrismaClient();

const TZ_BY_DEST: Record<string, string> = {
  IS: 'Atlantic/Reykjavik',
  CN: 'Asia/Shanghai',
  JP: 'Asia/Tokyo',
};

function mapDbType(type: string): ItineraryItem['type'] {
  if (type === 'MEAL_ANCHOR' || type === 'MEAL_FLOATING') return 'MEAL';
  if (type === 'REST') return 'REST';
  if (type === 'TRANSPORT') return 'TRANSPORT';
  return 'POI';
}

function hmFromDate(d: Date | null | undefined, tz: string): string | undefined {
  if (!d) return undefined;
  return DateTime.fromJSDate(d, { zone: tz }).toFormat('HH:mm');
}

function dateToIso(d: Date): string {
  return DateTime.fromJSDate(d, { zone: 'utc' }).toISODate() ?? d.toISOString().slice(0, 10);
}

function buildItineraryFromTrip(trip: {
  id: string;
  destination: string;
  TripDay: Array<{
    date: Date;
    ItineraryItem: Array<{
      id: string;
      type: string;
      startTime: Date | null;
      endTime: Date | null;
      note: string | null;
      Place: { id: number; nameCN: string; nameEN: string | null } | null;
    }>;
  }>;
}): { itinerary: Itinerary; tz: string; itemIdByItineraryItemId: Map<string, string> } {
  const tz = TZ_BY_DEST[trip.destination] ?? 'UTC';
  const days = trip.TripDay.map((day) => {
    const date = dateToIso(day.date);
    const items: ItineraryItem[] = day.ItineraryItem.map((it) => ({
      id: it.id,
      type: mapDbType(it.type),
      start_window: hmFromDate(it.startTime, tz) ?? '09:00',
      end_window: hmFromDate(it.endTime, tz) ?? '11:00',
      location_ref: {
        place_id: it.Place ? String(it.Place.id) : undefined,
        name: it.Place?.nameCN || it.Place?.nameEN || it.note || it.type,
      },
      notes: it.note ?? undefined,
      evidence_refs: [],
      verified: false,
      metadata: { source: 'trip_db', db_type: it.type },
    }));
    return { date, items };
  });

  return {
    itinerary: { request_id: trip.id, days },
    tz,
    itemIdByItineraryItemId: new Map(trip.TripDay.flatMap((d) => d.ItineraryItem.map((it) => [it.id, it.id]))),
  };
}

function countSleepViolations(itinerary: Itinerary, tz: string): number {
  let n = 0;
  for (const day of itinerary.days) {
    for (const item of day.items) {
      const { startMin } = parseItemWindowMinutes(day.date, item, tz);
      if (startMin != null && isInSleepLock(startMin)) n++;
    }
  }
  return n;
}

function printSchedule(label: string, itinerary: Itinerary, tz: string) {
  console.log(`\n${label}`);
  console.log('-'.repeat(70));
  for (let i = 0; i < itinerary.days.length; i++) {
    const day = itinerary.days[i]!;
    console.log(`Day ${i + 1} (${day.date})`);
    for (const item of day.items) {
      const name = item.location_ref?.name ?? item.id;
      console.log(`  ${item.start_window}-${item.end_window}  ${name} [${item.type}]`);
    }
  }
  console.log(`睡眠锁定期违规: ${countSleepViolations(itinerary, tz)} 项`);
}

async function main() {
  const tripId = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!tripId) {
    console.error('Usage: npx tsx scripts/run-temporal-optimize-trip.ts <tripId> [--apply]');
    process.exit(1);
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
            include: { Place: true },
          },
        },
      },
    },
  });

  if (!trip) {
    console.error(`Trip not found: ${tripId}`);
    process.exit(1);
  }

  const { itinerary: before, tz } = buildItineraryFromTrip(trip);
  console.log(`Trip: ${(trip as { name?: string }).name ?? tripId}`);
  console.log(`Destination: ${trip.destination} | Timezone: ${tz} | Days: ${before.days.length}`);

  printSchedule('=== 优化前 ===', before, tz);

  const result = optimizeTemporalConstraints({
    itinerary: before,
    environment_context: { timezone: tz },
  });

  printSchedule('=== 优化后 ===', result.itinerary, tz);

  if (result.changelog.length) {
    console.log('\n=== Changelog ===');
    for (const c of result.changelog) {
      console.log(`  [${c.action}] ${c.detail}`);
    }
  } else {
    console.log('\n无调整（已符合时间约束）');
  }

  if (result.issues.length) {
    console.log(`\n审计问题: ${result.issues.length}（ERROR: ${result.issues.filter((i) => i.severity === 'ERROR').length}）`);
  }

  if (result.needs_regeneration) {
    console.log(`\n⚠️ 建议重新规划: ${result.needs_regeneration.reason}`);
  }

  if (!apply) {
    console.log('\n(dry-run) 加 --apply 写回数据库');
    return;
  }

  let updated = 0;
  let inserted = 0;
  await prisma.$transaction(async (tx) => {
    for (const day of result.itinerary.days) {
      const tripDay = trip.TripDay.find((d) => dateToIso(d.date) === day.date);
      if (!tripDay) continue;

      const existingIds = new Set(tripDay.ItineraryItem.map((it) => it.id));

      for (const item of day.items) {
        const start = DateTime.fromISO(`${day.date}T${item.start_window}`, { zone: tz });
        const end = DateTime.fromISO(`${day.date}T${item.end_window}`, { zone: tz });
        if (!start.isValid || !end.isValid) continue;

        if (existingIds.has(item.id)) {
          await tx.itineraryItem.update({
            where: { id: item.id },
            data: {
              startTime: start.toJSDate(),
              endTime: end.toJSDate(),
            },
          });
          updated++;
        } else if (item.type === 'MEAL' && item.metadata?.placeholder_reason === 'meal_anchor_inserted') {
          // 仅更新已有项；不自动插入新餐饮行（避免污染用户行程结构）
          continue;
        } else if (item.type === 'REST' && item.metadata?.placeholder_reason?.includes('rest')) {
          continue;
        }
      }
    }
  });

  console.log(`\n✅ 已写回 ${updated} 个行程项时间`);
  if (inserted) console.log(`   新增 ${inserted} 个占位项`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
