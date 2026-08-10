#!/usr/bin/env npx tsx
/**
 * 验收 trips/bootstrap 模板分支（逻辑层 + 可选 HTTP）。
 *
 *   npx tsx scripts/smoke-bootstrap-cn-classic.ts
 *   API_BASE=http://127.0.0.1:3000 npx tsx scripts/smoke-bootstrap-cn-classic.ts --http --cleanup
 */
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { UnifiedBootstrapService } from '../src/trips/services/unified-bootstrap.service';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const cleanup = process.argv.includes('--cleanup');
const useHttp = process.argv.includes('--http');
const BASE = (process.env.API_BASE ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const JWT_SECRET =
  process.env.JWT_SECRET ?? 'your-secret-key-change-in-production';

async function verifyResolve() {
  const fakeRd = {
    createTripFromTemplate: async () => {
      throw new Error('should not call create in resolve-only checks');
    },
  };
  const svc = new UnifiedBootstrapService(prisma as any, fakeRd as any);

  const byId = await svc.resolveTemplate({
    destination: 'CN',
    startDate: '2026-09-10',
    endDate: '2026-09-17',
    totalBudget: 1,
    routeTemplateId: 86,
  });
  console.log('resolve routeTemplateId', byId);

  const byUuid = await svc.resolveTemplate({
    destination: 'CN',
    startDate: '2026-09-10',
    endDate: '2026-09-17',
    totalBudget: 1,
    templateUuid: 'cn-classic-cn-route-qinggan_loop-8d',
  });
  console.log('resolve templateUuid', byUuid.uuid, byUuid.classicRouteId);

  const byClassic = await svc.resolveTemplate({
    destination: 'CN',
    startDate: '2026-10-01',
    endDate: '2026-10-14',
    totalBudget: 1,
    classicRouteId: 'cn.route.g318',
  });
  console.log('resolve classicRouteId g318', {
    id: byClassic.id,
    uuid: byClassic.uuid,
    days: byClassic.durationDays,
  });

  const ok =
    byId.id === 86 &&
    byUuid.classicRouteId === 'cn.route.qinggan_loop' &&
    byClassic.uuid.includes('g318') &&
    byClassic.durationDays === 14 &&
    svc.hasTemplateIntent({
      destination: 'CN',
      startDate: 'x',
      endDate: 'y',
      totalBudget: 1,
      routeTemplateId: 86,
    }) &&
    !svc.hasTemplateIntent({
      destination: 'CN',
      startDate: 'x',
      endDate: 'y',
      totalBudget: 1,
    });

  return { ok, byId, byClassic };
}

async function verifyBootstrapWithMockMaterialize() {
  let called = false;
  const tripId = randomUUID();
  const fakeRd = {
    createTripFromTemplate: async (
      templateId: number,
      dto: any,
      userId?: string | null,
    ) => {
      called = true;
      if (templateId !== 86) throw new Error(`unexpected templateId ${templateId}`);
      if (dto.bootstrapSource !== 'trips.bootstrap') {
        throw new Error('missing bootstrapSource');
      }
      if (dto.endDate !== '2026-09-17') {
        throw new Error(`endDate not adjusted: ${dto.endDate}`);
      }
      if (!userId) throw new Error('missing userId');
      return {
        trip: { id: tripId, destination: 'CN' },
        generatedItems: [{ day: 1, items: [] }],
        stats: {
          totalDays: 8,
          totalItems: 23,
          placesMatched: 23,
          placesMissing: 0,
        },
        warnings: undefined,
      };
    },
  };
  const svc = new UnifiedBootstrapService(prisma as any, fakeRd as any);

  // endDate mismatch → should adjust to 8 days
  const result = await svc.bootstrapFromTemplate(
    {
      destination: 'CN',
      startDate: '2026-09-10',
      endDate: '2026-09-20', // wrong; template is 8d → 09-17
      totalBudget: 15000,
      currency: 'CNY',
      routeTemplateId: 86,
      name: 'SMOKE',
    },
    'smoke-user',
  );

  console.log('mock materialize', {
    called,
    source: result.source,
    classicRouteId: result.classicRouteId,
    warnings: result.warnings,
    stats: result.stats,
  });

  const ok =
    called &&
    result.source === 'ROUTE_TEMPLATE' &&
    result.classicRouteId === 'cn.route.qinggan_loop' &&
    result.stats.placesMissing === 0 &&
    result.warnings.some((w) => w.includes('endDate adjusted'));

  return ok;
}

async function verifyHttp() {
  const userId = process.env.SMOKE_USER_ID ?? '00000000-0000-4000-8000-000000000001';
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
      Accept: 'application/json',
    },
    body: JSON.stringify({
      destination: 'CN',
      startDate: '2026-09-10',
      endDate: '2026-09-17',
      totalBudget: 15000,
      currency: 'CNY',
      transport: 'car',
      pacePreference: 'BALANCED',
      routeTemplateId: 86,
      name: 'SMOKE Nest bootstrap 青甘8日',
    }),
  });
  const json = (await res.json()) as any;
  console.log('HTTP status', res.status, 'success', json.success);
  console.log(
    'HTTP data',
    JSON.stringify(
      {
        source: json.data?.source,
        tripId: json.data?.tripId,
        classicRouteId: json.data?.classicRouteId,
        stats: json.data?.stats,
        warnings: json.data?.warnings,
      },
      null,
      2,
    ),
  );

  const tripId = json.data?.tripId as string | undefined;
  if (tripId) {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata || {}) as Record<string, unknown>;
    console.log('HTTP trip metadata', {
      classicRouteId: meta.classicRouteId,
      bootstrapSource: meta.bootstrapSource,
      templateUuid: meta.templateUuid,
    });
    if (cleanup) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ItineraryItem" WHERE "tripDayId" IN (SELECT id FROM "TripDay" WHERE "tripId"=$1)`,
        tripId,
      ).catch(() => undefined);
      await prisma.tripDay.deleteMany({ where: { tripId } }).catch(() => undefined);
      await prisma.tripCollaborator.deleteMany({ where: { tripId } }).catch(() => undefined);
      await prisma.trip.delete({ where: { id: tripId } }).catch(() => undefined);
      console.log('cleaned', tripId);
    }
  }

  return (
    json.success === true &&
    json.data?.source === 'ROUTE_TEMPLATE' &&
    json.data?.stats?.placesMissing === 0
  );
}

async function main() {
  const r1 = await verifyResolve();
  const r2 = await verifyBootstrapWithMockMaterialize();
  console.log('resolve+mock', { resolveOk: r1.ok, mockOk: r2 });

  let httpOk = true;
  if (useHttp) {
    httpOk = await verifyHttp();
    console.log('httpOk', httpOk);
  } else {
    console.log('skip HTTP (pass --http when Nest is up)');
  }

  const ok = r1.ok && r2 && httpOk;
  console.log(ok ? 'PASS' : 'FAIL');
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
