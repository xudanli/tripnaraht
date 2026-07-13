/**
 * Trip-scoped Postgres advisory lock for assertion promotion (transaction-bound).
 */

import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';

export async function withTripAdvisoryLock<T>(
  prisma: PrismaService,
  tripId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${tripId}))`);
    return fn();
  });
}
