/**
 * WP-TEP-17 — Trip + option scoped Postgres transaction advisory lock.
 */

import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export function buildTepRepairAdvisoryLockKey(tripId: string, optionId: string): string {
  return `${tripId}:${optionId}`;
}

export async function withTepRepairAdvisoryLock<T>(
  prisma: PrismaService,
  tripId: string,
  optionId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const lockKey = buildTepRepairAdvisoryLockKey(tripId, optionId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    return fn(tx);
  });
}
