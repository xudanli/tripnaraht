#!/usr/bin/env npx tsx
/**
 * M4-RA-01 staging intake: ensure 2293028143@qq.com owns 10 Iceland trips.
 *
 * Clones existing TEP pilot_is_01..10 shells → ra01_is_01..10 under the target
 * user. Does NOT steal TEP ownership. Staging only.
 *
 *   npx tsx scripts/m4-ra01-seed-trips-for-user.ts
 *   npx tsx scripts/m4-ra01-seed-trips-for-user.ts --email=2293028143@qq.com
 */
import { randomUUID } from 'crypto';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient, type ItemType, type Prisma } from '@prisma/client';

const PROJECT_ROOT = join(__dirname, '..');
loadEnv({ path: join(PROJECT_ROOT, '.env') });
loadEnv({ path: join(PROJECT_ROOT, '.env.staging'), override: true });

const DEFAULT_EMAIL = '2293028143@qq.com';
/** Align with prod user id when present */
const DEFAULT_USER_ID = '5872f534-4fdf-483d-9e5a-464d3f36935d';

const SOURCE_TRIP_IDS = Array.from(
  { length: 10 },
  (_, i) => `pilot_is_${String(i + 1).padStart(2, '0')}`,
);

/** Map pilot scenarios onto RA-01 sampling cards */
const INTENDED_OPS = [
  'SHIFT',
  'SHIFT',
  'SWAP',
  'SWAP',
  'SHORTEN',
  'SHORTEN',
  'REROUTE',
  'REROUTE',
  'FALLBACK',
  'REJECT',
] as const;

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  return fallback ?? '';
}

function assertStagingDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL not set');
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error('Refusing to seed on production DATABASE_URL');
  }
  if (!/tripnara_staging/i.test(url)) {
    throw new Error(`Expected tripnara_staging, got: ${url.replace(/:[^:@]+@/, ':***@')}`);
  }
}

type ItemRow = {
  id: string;
  startTime: Date | null;
  endTime: Date | null;
  type: string;
  placeId: number | null;
  note: string | null;
  trailId: number | null;
  order: number | null;
  bookedAt: Date | null;
  bookingStatus: string | null;
};

async function main(): Promise<void> {
  assertStagingDb();
  const email = arg('email', DEFAULT_EMAIL);
  const userId = arg('userId', DEFAULT_USER_ID);
  const prisma = new PrismaClient();
  const now = new Date();

  try {
    await prisma.$connect();

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        id: userId,
        email,
        emailVerified: true,
        displayName: 'Danny',
        updatedAt: now,
      },
      update: {
        emailVerified: true,
        displayName: 'Danny',
        updatedAt: now,
      },
    });

    const created: Array<{
      tripId: string;
      sourceTripId: string;
      intendedOperation: string;
      name: string | null;
    }> = [];

    for (let i = 0; i < SOURCE_TRIP_IDS.length; i++) {
      const sourceTripId = SOURCE_TRIP_IDS[i];
      const tripId = `ra01_is_${String(i + 1).padStart(2, '0')}`;
      const intendedOperation = INTENDED_OPS[i];

      const source = await prisma.trip.findUnique({ where: { id: sourceTripId } });
      if (!source) {
        throw new Error(`Source trip missing: ${sourceTripId}. Run: npm run tep:pilot-seed -- --env=staging --template=all`);
      }

      // Clean prior clone
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ItineraryItem" WHERE "tripDayId" IN (SELECT id FROM "TripDay" WHERE "tripId" = $1)`,
        tripId,
      );
      await prisma.tripDay.deleteMany({ where: { tripId } });
      await prisma.tripCollaborator.deleteMany({ where: { tripId } });
      await prisma.trip.deleteMany({ where: { id: tripId } });

      const meta =
        source.metadata && typeof source.metadata === 'object'
          ? { ...(source.metadata as Record<string, unknown>) }
          : {};
      meta.m4Ra01 = {
        intendedOperation,
        sourceTripId,
        seededFor: email,
        seededAt: now.toISOString(),
        purpose: 'M4-RA-01 selected_trips intake (staging)',
      };

      await prisma.trip.create({
        data: {
          id: tripId,
          destination: 'IS',
          startDate: source.startDate,
          endDate: source.endDate,
          updatedAt: now,
          status: source.status ?? 'PLANNING',
          name: `RA01-${String(i + 1).padStart(2, '0')} ${intendedOperation} · ${source.name ?? sourceTripId}`,
          budgetConfig: source.budgetConfig as Prisma.InputJsonValue | undefined,
          pacingConfig: source.pacingConfig as Prisma.InputJsonValue | undefined,
          metadata: meta as Prisma.InputJsonValue,
        },
      });

      await prisma.tripCollaborator.create({
        data: {
          id: randomUUID(),
          tripId,
          userId: user.id,
          role: 'OWNER',
          updatedAt: now,
        },
      });

      const days = await prisma.$queryRaw<
        Array<{ id: string; date: Date }>
      >`SELECT id, date FROM "TripDay" WHERE "tripId" = ${sourceTripId}`;

      for (const day of days) {
        const newDayId = `${tripId}_${day.id}`;
        await prisma.tripDay.create({
          data: { id: newDayId, tripId, date: day.date },
        });

        const items = await prisma.$queryRaw<ItemRow[]>`
          SELECT id, "startTime", "endTime", type, "placeId", note, "trailId", "order",
                 "bookedAt", "bookingStatus"
          FROM "ItineraryItem"
          WHERE "tripDayId" = ${day.id}
          ORDER BY "order" ASC NULLS LAST
        `;

        for (const item of items) {
          await prisma.$executeRaw`
            INSERT INTO "ItineraryItem" (
              id, "startTime", "endTime", type, "placeId", "tripDayId", note, "trailId",
              "order", "bookedAt", "bookingStatus", "isPaid", currency
            ) VALUES (
              ${`${tripId}_${item.id}`},
              ${item.startTime},
              ${item.endTime},
              ${item.type}::"ItemType",
              ${item.placeId},
              ${newDayId},
              ${item.note},
              ${item.trailId},
              ${item.order},
              ${item.bookedAt},
              ${item.bookingStatus},
              false,
              'CNY'
            )
          `;
        }
      }

      created.push({
        tripId,
        sourceTripId,
        intendedOperation,
        name: `RA01-${String(i + 1).padStart(2, '0')} ${intendedOperation}`,
      });
    }

    const owned = await prisma.tripCollaborator.findMany({
      where: { userId: user.id, role: 'OWNER' },
      select: { tripId: true },
      orderBy: { tripId: 'asc' },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          environment: 'staging',
          user: { id: user.id, email: user.email },
          createdCount: created.length,
          created,
          ownedTripIds: owned.map((o) => o.tripId),
          next: [
            'Login as 2293028143@qq.com on staging API to verify trip list',
            'Packs for Dataset READY still need live export (lab:export does not pull DB yet)',
            'npm run lab:pilot-preflight-status',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
