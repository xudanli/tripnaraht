/**
 * WP3 — optimistic trip revision lock between authorize and execute.
 */

import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { resolveTripRevision, revisionToString } from '../../trip-constraint-solver/utils/trip-revision.util';

const LOCKS_KEY = 'rfc001ExecutionLocks';

export interface Rfc001ExecutionLock {
  decisionId: string;
  expectedRevision: number;
  revisionLabel: string;
  lockedAt: string;
}

export class Rfc001TripRevisionStaleError extends BadRequestException {
  constructor(message: string) {
    super({ guardCode: 'TRIP_REVISION_STALE', message });
  }
}

function readLocks(meta: Record<string, unknown>): Record<string, Rfc001ExecutionLock> {
  const block = meta[LOCKS_KEY];
  if (!block || typeof block !== 'object') return {};
  return block as Record<string, Rfc001ExecutionLock>;
}

export async function stampExecutionLock(
  prisma: PrismaService,
  tripId: string,
  decisionId: string,
): Promise<Rfc001ExecutionLock> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true, updatedAt: true },
  });
  if (!trip) {
    throw new BadRequestException(`Trip ${tripId} not found`);
  }
  const rev = resolveTripRevision(trip);
  const lock: Rfc001ExecutionLock = {
    decisionId,
    expectedRevision: rev.revision,
    revisionLabel: revisionToString(rev),
    lockedAt: new Date().toISOString(),
  };
  const meta = ((trip.metadata ?? {}) as Record<string, unknown>) ?? {};
  const locks = readLocks(meta);
  locks[decisionId] = lock;
  await prisma.trip.update({
    where: { id: tripId },
    data: {
      metadata: toInputJsonValue({
        ...meta,
        [LOCKS_KEY]: locks,
      }),
    },
  });
  return lock;
}

export async function readExecutionLock(
  prisma: PrismaService,
  tripId: string,
  decisionId: string,
): Promise<Rfc001ExecutionLock | undefined> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) return undefined;
  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  return readLocks(meta)[decisionId];
}

export async function assertExecutionLock(
  prisma: PrismaService,
  tripId: string,
  decisionId: string,
): Promise<void> {
  const lock = await readExecutionLock(prisma, tripId, decisionId);
  if (!lock) return;

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true, updatedAt: true },
  });
  if (!trip) {
    throw new Rfc001TripRevisionStaleError(`Trip ${tripId} not found`);
  }
  const current = resolveTripRevision(trip);
  if (current.revision !== lock.expectedRevision) {
    throw new Rfc001TripRevisionStaleError(
      `Trip revision ${current.revision} != authorized ${lock.expectedRevision}`,
    );
  }
}

export async function clearExecutionLock(
  prisma: PrismaService,
  tripId: string,
  decisionId: string,
): Promise<void> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) return;
  const meta = { ...((trip.metadata ?? {}) as Record<string, unknown>) };
  const locks = readLocks(meta);
  delete locks[decisionId];
  await prisma.trip.update({
    where: { id: tripId },
    data: { metadata: toInputJsonValue({ ...meta, [LOCKS_KEY]: locks }) },
  });
}
