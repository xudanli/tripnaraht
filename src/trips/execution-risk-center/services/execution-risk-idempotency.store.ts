/**
 * ERC apply/confirm idempotency store.
 * L1: in-process Map · L2 (when Prisma present): Trip.metadata.ercIdempotencyV1
 * Multi-instance safe via Trip row FOR UPDATE on durable reads/writes.
 */

import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';

export type ExecutionRiskIdempotentOperation = 'apply' | 'confirm';

export interface IdempotencyLookupResult<T> {
  hit: boolean;
  response?: T;
}

export const ERC_IDEMPOTENCY_META_KEY = 'ercIdempotencyV1' as const;
const MAX_DURABLE_KEYS = 100;

type DurableRecord = {
  bodyHash: string;
  response: unknown;
  createdAt: string;
};

type DurableBlock = {
  keys: Record<string, DurableRecord>;
};

export type ExecutionRiskIdempotencyPrisma = {
  $transaction: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
};

export function hashIdempotencyBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

export function buildIdempotencyStoreKey(input: {
  operation: ExecutionRiskIdempotentOperation;
  tripId: string;
  riskId: string;
  recommendationId: string;
  idempotencyKey: string;
}): string {
  return `${input.operation}:${input.tripId}:${input.riskId}:${input.recommendationId}:${input.idempotencyKey}`;
}

function assertBodyHashOrConflict(
  existing: DurableRecord,
  bodyHash: string,
  storeKey: string,
): void {
  if (existing.bodyHash !== bodyHash) {
    throw new ConflictException({
      code: 'IDEMPOTENCY_CONFLICT',
      message: `Key already used with different payload`,
      details: { storeKey },
    });
  }
}

async function lockTripForUpdate(
  tx: Prisma.TransactionClient,
  tripId: string,
): Promise<void> {
  if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return;
  await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
}

function readBlock(meta: Record<string, unknown>): DurableBlock {
  const raw = meta[ERC_IDEMPOTENCY_META_KEY];
  if (!raw || typeof raw !== 'object') return { keys: {} };
  const keys = (raw as DurableBlock).keys;
  return { keys: keys && typeof keys === 'object' ? { ...keys } : {} };
}

function pruneKeys(keys: Record<string, DurableRecord>): Record<string, DurableRecord> {
  const entries = Object.entries(keys);
  if (entries.length <= MAX_DURABLE_KEYS) return keys;
  entries.sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));
  return Object.fromEntries(entries.slice(entries.length - MAX_DURABLE_KEYS));
}

/**
 * Dual-layer idempotency: memory always; Trip.metadata when prisma is injected.
 */
export class ExecutionRiskIdempotencyStore {
  private readonly records = new Map<
    string,
    { bodyHash: string; response: unknown; createdAt: number }
  >();

  constructor(private readonly prisma?: ExecutionRiskIdempotencyPrisma) {}

  /** Sync memory lookup (unit tests / L1). Prefer {@link lookupAsync} in services. */
  lookup<T>(storeKey: string, bodyHash: string): IdempotencyLookupResult<T> {
    const existing = this.records.get(storeKey);
    if (!existing) return { hit: false };
    assertBodyHashOrConflict(
      {
        bodyHash: existing.bodyHash,
        response: existing.response,
        createdAt: new Date(existing.createdAt).toISOString(),
      },
      bodyHash,
      storeKey,
    );
    return { hit: true, response: existing.response as T };
  }

  /** Sync memory save. Prefer {@link saveAsync} in services. */
  save(storeKey: string, bodyHash: string, response: unknown): void {
    this.records.set(storeKey, { bodyHash, response, createdAt: Date.now() });
  }

  findApplyRecord(input: {
    tripId: string;
    riskId: string;
    recommendationId: string;
    idempotencyKey: string;
  }): boolean {
    const key = buildIdempotencyStoreKey({ ...input, operation: 'apply' });
    return this.records.has(key);
  }

  clear(): void {
    this.records.clear();
  }

  async lookupAsync<T>(
    tripId: string,
    storeKey: string,
    bodyHash: string,
  ): Promise<IdempotencyLookupResult<T>> {
    const mem = this.lookup<T>(storeKey, bodyHash);
    if (mem.hit) return mem;

    if (!this.prisma) return { hit: false };

    const durable = await this.prisma.$transaction(async (tx) => {
      await lockTripForUpdate(tx, tripId);
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip) return null;
      const block = readBlock((trip.metadata ?? {}) as Record<string, unknown>);
      return block.keys[storeKey] ?? null;
    });

    if (!durable) return { hit: false };
    assertBodyHashOrConflict(durable, bodyHash, storeKey);
    this.save(storeKey, durable.bodyHash, durable.response);
    return { hit: true, response: durable.response as T };
  }

  async saveAsync(
    tripId: string,
    storeKey: string,
    bodyHash: string,
    response: unknown,
  ): Promise<void> {
    this.save(storeKey, bodyHash, response);
    if (!this.prisma) return;

    await this.prisma.$transaction(async (tx) => {
      await lockTripForUpdate(tx, tripId);
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip) return;
      const meta = {
        ...((trip.metadata ?? {}) as Record<string, unknown>),
      };
      const block = readBlock(meta);
      block.keys[storeKey] = {
        bodyHash,
        response,
        createdAt: new Date().toISOString(),
      };
      block.keys = pruneKeys(block.keys);
      meta[ERC_IDEMPOTENCY_META_KEY] = block;
      await tx.trip.update({
        where: { id: tripId },
        data: {
          metadata: toInputJsonValue(meta),
          updatedAt: new Date(),
        },
      });
    });
  }

  async findApplyRecordAsync(input: {
    tripId: string;
    riskId: string;
    recommendationId: string;
    idempotencyKey: string;
  }): Promise<boolean> {
    if (this.findApplyRecord(input)) return true;
    if (!this.prisma) return false;

    const storeKey = buildIdempotencyStoreKey({ ...input, operation: 'apply' });
    return this.prisma.$transaction(async (tx) => {
      await lockTripForUpdate(tx, input.tripId);
      const trip = await tx.trip.findUnique({
        where: { id: input.tripId },
        select: { metadata: true },
      });
      if (!trip) return false;
      const block = readBlock((trip.metadata ?? {}) as Record<string, unknown>);
      const hit = Boolean(block.keys[storeKey]);
      if (hit) {
        const rec = block.keys[storeKey]!;
        this.save(storeKey, rec.bodyHash, rec.response);
      }
      return hit;
    });
  }
}
