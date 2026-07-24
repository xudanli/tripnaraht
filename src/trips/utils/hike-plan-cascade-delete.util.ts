/**
 * Optional HikePlan cascade on trip delete — skips when hike_plan table is not migrated yet.
 *
 * Must run OUTSIDE a Prisma interactive transaction: a failed query inside `$transaction`
 * aborts the Postgres transaction (25P02) even if the error is caught in JS.
 */

import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const logger = new Logger('HikePlanCascadeDelete');

type HikePlanClient = {
  hikePlan: {
    findMany: (args: {
      where: { tripId: string };
      select: { id: true };
    }) => Promise<Array<{ id: string }>>;
    deleteMany: (args: { where: { tripId: string } }) => Promise<unknown>;
  };
  hikeTrackPoint: {
    deleteMany: (args: { where: { hikePlanId: { in: string[] } } }) => Promise<unknown>;
  };
};

type HikePlanTableProbe = {
  $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export function isMissingHikePlanTableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('hike_plan') &&
    (message.includes('does not exist') || message.includes('relation') || message.includes('table'))
  );
}

/** Probe via to_regclass — safe to call before entering a transaction. */
export async function isHikePlanTableAvailable(prisma: HikePlanTableProbe): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean | null }>>`
      SELECT to_regclass('public.hike_plan') IS NOT NULL AS "exists"
    `;
    return rows[0]?.exists === true;
  } catch (error) {
    if (isMissingHikePlanTableError(error)) return false;
    throw error;
  }
}

export async function cascadeDeleteTripHikePlansIfPresent(
  client: HikePlanClient,
  tripId: string,
): Promise<void> {
  const hikePlans = await client.hikePlan.findMany({
    where: { tripId },
    select: { id: true },
  });
  if (hikePlans.length === 0) return;

  const hikePlanIds = hikePlans.map((p) => p.id);
  await client.hikeTrackPoint.deleteMany({
    where: { hikePlanId: { in: hikePlanIds } },
  });
  await client.hikePlan.deleteMany({
    where: { tripId },
  });
}

export async function cascadeDeleteTripHikePlansWhenTableExists(
  prisma: HikePlanClient & HikePlanTableProbe,
  tripId: string,
): Promise<void> {
  const available = await isHikePlanTableAvailable(prisma);
  if (!available) {
    logger.warn(
      `hike_plan table missing; skipping HikePlan cascade delete for trip ${tripId}. Run prisma migrate.`,
    );
    return;
  }

  await cascadeDeleteTripHikePlansIfPresent(prisma, tripId);
}
