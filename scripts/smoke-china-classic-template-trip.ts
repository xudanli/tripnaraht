#!/usr/bin/env npx tsx
/**
 * 中国经典自驾 RouteTemplate → Trip 冒烟（Prisma 直写，不启 Nest）。
 * 使用模板中已 bind 的 Place id 物化 TripDay / ItineraryItem。
 *
 *   npx tsx scripts/smoke-china-classic-template-trip.ts
 *   npx tsx scripts/smoke-china-classic-template-trip.ts --template cn-classic-cn-route-g318-14d
 *   npx tsx scripts/smoke-china-classic-template-trip.ts --cleanup
 *
 * Nest 官方通路（需 npm run dev）：
 *   POST /api/route-directions/templates/:id/create-trip
 *   青甘 8 日已验证：8 天 / placesMatched=23 / placesMissing=0
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import {
  matchCnClassicRoutes,
  buildCnClassicRouteFindingItems,
} from '../src/trips/readiness/utils/cn-classic-routes.util';
import { selectCnReadinessPacks } from '../src/trips/readiness/utils/cn-regional-pack-select.util';
import { collectTripPlaceNameHints } from '../src/trips/readiness/utils/collect-trip-place-hints.util';

const CN_TZ = 'Asia/Shanghai';

const prisma = new PrismaClient();

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const templateUuid =
    argValue('--template') || 'cn-classic-cn-route-qinggan_loop-8d';
  const cleanup = process.argv.includes('--cleanup');
  const startDate = argValue('--start') || '2026-09-10';

  const template = await prisma.routeTemplate.findUnique({
    where: { uuid: templateUuid },
    include: { routeDirection: true },
  });
  if (!template) throw new Error(`Template not found: ${templateUuid}`);

  const durationDays = template.durationDays;
  const endDate = addDays(startDate, durationDays - 1);
  const dayPlans = (Array.isArray(template.dayPlans) ? template.dayPlans : []) as any[];
  const boundPois = dayPlans
    .flatMap((d) => d.pois || [])
    .filter((p) => p.bindStatus === 'bound' && p.id);

  console.log(
    `Creating trip from ${template.routeDirection.name} · ${template.nameCN}` +
      ` (${durationDays}d, boundPois=${boundPois.length}) ${startDate}→${endDate}`,
  );

  const tripId = randomUUID();
  await prisma.trip.create({
    data: {
      id: tripId,
      name: `SMOKE ${template.nameCN}`,
      destination: 'CN',
      startDate: new Date(startDate + 'T00:00:00Z'),
      endDate: new Date(endDate + 'T00:00:00Z'),
      status: 'PLANNING',
      updatedAt: new Date(),
      pacingConfig: {
        pacePreference: template.defaultPacePreference || 'BALANCED',
        transport: 'car',
      },
      metadata: {
        smoke: true,
        createdFromTemplate: template.id,
        templateUuid: template.uuid,
        templateName: template.nameCN,
        classicRouteId: (template.metadata as any)?.classicRouteId,
        dayThemes: Object.fromEntries(
          dayPlans.map((d) => [d.day, d.theme || '']),
        ),
      },
    },
  });

  let itemCount = 0;
  let linkedPlaces = 0;

  for (let i = 0; i < durationDays; i++) {
    const dayNumber = i + 1;
    const plan = dayPlans.find((d) => d.day === dayNumber) || dayPlans[i];
    const date = new Date(startDate + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + i);

    const tripDay = await prisma.tripDay.create({
      data: {
        id: randomUUID(),
        tripId,
        date,
      },
    });

    const pois = (plan?.pois || []).filter(
      (p: any) => p.bindStatus === 'bound' && p.id,
    );
    let order = 0;
    for (const poi of pois) {
      order += 1;
      // 目的地墙钟：上海 09:00 起按景点顺序顺延（勿写 UTC 墙钟，否则展示成凌晨）
      const dayIso = date.toISOString().slice(0, 10);
      const startHour = 8 + order; // 首项 09:00
      const start = DateTime.fromISO(`${dayIso}T${String(startHour).padStart(2, '0')}:00:00`, {
        zone: CN_TZ,
      }).toJSDate();
      const end = DateTime.fromJSDate(start)
        .plus({ minutes: poi.durationMinutes || 60 })
        .toJSDate();

      await prisma.itineraryItem.create({
        data: {
          id: randomUUID(),
          tripDayId: tripDay.id,
          type: 'ACTIVITY',
          placeId: poi.id,
          order,
          startTime: start,
          endTime: end,
          note: poi.nameCN || poi.resolvedPlaceNameCN || null,
          travelMode: 'car',
        },
      });
      itemCount++;
      linkedPlaces++;
    }
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            include: { Place: { select: { id: true, nameCN: true } } },
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  });

  const sample = (trip?.TripDay || []).slice(0, 3).map((d, idx) => ({
    day: idx + 1,
    date: d.date.toISOString().slice(0, 10),
    items: (d.ItineraryItem || []).map((i) => i.Place?.nameCN || i.note),
  }));

  console.log(`✅ tripId=${tripId}`);
  console.log(
    `days=${trip?.TripDay.length}/${durationDays} items=${itemCount} linkedPlaces=${linkedPlaces}`,
  );
  console.log('sample:', JSON.stringify(sample, null, 2));

  const placeNames = collectTripPlaceNameHints(trip?.TripDay as any);
  const routes = matchCnClassicRoutes([
    template.nameCN,
    String((template.metadata as any)?.classicRouteId || ''),
    ...placeNames,
  ]);
  const classicFindings = buildCnClassicRouteFindingItems(routes, 'zh');
  console.log(
    `classicRoutes=${routes.map((r) => r.id).join(',') || '(none)'} findings=${classicFindings.length}` +
      (classicFindings[0] ? ` first=${classicFindings[0].id}` : ''),
  );

  // 区域 pack 选择（不读 DB pack，只验证 util）
  const fakePacks = [
    { packId: 'pack.cn.china' },
    { packId: 'pack.cn.xizang' },
    { packId: 'pack.cn.sichuan' },
  ] as any;
  const selected = selectCnReadinessPacks(fakePacks, {
    destinationId: 'CN',
    hints: [template.nameCN, ...placeNames],
  });
  console.log(`selectedPacks=${selected.map((p) => p.packId).join(',')}`);

  let ok = true;
  if ((trip?.TripDay.length || 0) !== durationDays) {
    console.warn('FAIL: day count mismatch');
    ok = false;
  }
  if (linkedPlaces < 5) {
    console.warn('FAIL: too few linked places');
    ok = false;
  }
  if (!routes.length) {
    console.warn('FAIL: classic route not detected from trip');
    ok = false;
  }

  if (cleanup) {
    await prisma.itineraryItem.deleteMany({ where: { TripDay: { tripId } } });
    await prisma.tripDay.deleteMany({ where: { tripId } });
    await prisma.trip.delete({ where: { id: tripId } });
    console.log(`🧹 cleaned up trip ${tripId}`);
  } else {
    console.log(`Keep trip (pass --cleanup to delete): ${tripId}`);
  }

  if (!ok) process.exitCode = 1;
  else console.log('SMOKE PASS');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
