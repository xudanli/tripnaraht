#!/usr/bin/env npx tsx
/**
 * 验收冰岛经典线 bootstrap 解析（可选 HTTP）。
 *
 *   npx tsx scripts/smoke-bootstrap-iceland-classic.ts
 *   API_BASE=http://127.0.0.1:3000 npx tsx scripts/smoke-bootstrap-iceland-classic.ts --http --cleanup
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { UnifiedBootstrapService } from '../src/trips/services/unified-bootstrap.service';

const prisma = new PrismaClient();
const useHttp = process.argv.includes('--http');
const cleanup = process.argv.includes('--cleanup');
const BASE = (process.env.API_BASE ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const JWT_SECRET =
  process.env.JWT_SECRET ?? 'your-secret-key-change-in-production';

async function main() {
  const svc = new UnifiedBootstrapService(prisma as any, {
    createTripFromTemplate: async () => {
      throw new Error('resolve-only');
    },
  } as any);

  const ring = await svc.resolveTemplate({
    destination: 'IS',
    startDate: '2026-07-01',
    endDate: '2026-07-07',
    totalBudget: 1,
    classicRouteId: 'is.route.ring_road',
  });
  const gc = await svc.resolveTemplate({
    destination: 'IS',
    startDate: '2026-07-10',
    endDate: '2026-07-11',
    totalBudget: 1,
    classicRouteId: 'is.route.golden_circle',
  });

  console.log('ring_road@7d →', {
    id: ring.id,
    uuid: ring.uuid,
    days: ring.durationDays,
  });
  console.log('golden_circle@2d →', {
    id: gc.id,
    uuid: gc.uuid,
    days: gc.durationDays,
  });

  const resolveOk =
    ring.uuid.includes('ring_road-7d') &&
    ring.classicRouteId === 'is.route.ring_road' &&
    gc.uuid.includes('golden_circle') &&
    (gc.durationDays === 2 || gc.durationDays === 1);

  let httpOk = true;
  if (useHttp) {
    const userId =
      process.env.SMOKE_USER_ID ?? '00000000-0000-4000-8000-000000000001';
    const token = jwt.sign(
      { sub: userId, email: `${userId}@smoke.local` },
      JWT_SECRET,
      { expiresIn: '1h' },
    );
    const res = await fetch(`${BASE}/api/trips/bootstrap`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        destination: 'IS',
        startDate: '2026-07-10',
        endDate: '2026-07-11',
        totalBudget: 8000,
        currency: 'ISK',
        transport: 'car',
        pacePreference: 'BALANCED',
        templateUuid: 'is-classic-is-route-golden_circle-2d',
        name: 'SMOKE IS Golden Circle 2d',
      }),
    });
    const json = (await res.json()) as any;
    console.log('HTTP', res.status, {
      success: json.success,
      source: json.data?.source,
      classicRouteId: json.data?.classicRouteId,
      stats: json.data?.stats,
    });
    httpOk =
      json.success === true &&
      json.data?.source === 'ROUTE_TEMPLATE' &&
      (json.data?.stats?.placesMissing ?? 1) === 0;
    const tripId = json.data?.tripId as string | undefined;
    if (cleanup && tripId) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ItineraryItem" WHERE "tripDayId" IN (SELECT id FROM "TripDay" WHERE "tripId"=$1)`,
        tripId,
      ).catch(() => undefined);
      await prisma.tripDay.deleteMany({ where: { tripId } }).catch(() => undefined);
      await prisma.tripCollaborator
        .deleteMany({ where: { tripId } })
        .catch(() => undefined);
      await prisma.trip.delete({ where: { id: tripId } }).catch(() => undefined);
      console.log('cleaned', tripId);
    }
  }

  console.log(resolveOk && httpOk ? 'PASS' : 'FAIL', { resolveOk, httpOk });
  if (!(resolveOk && httpOk)) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
