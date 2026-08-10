import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildIdempotencyStoreKey,
  ERC_IDEMPOTENCY_META_KEY,
  ExecutionRiskIdempotencyStore,
  hashIdempotencyBody,
} from './execution-risk-idempotency.store';

describe('ExecutionRiskIdempotencyStore durable Trip.metadata', () => {
  const tripId = 'trip-erc-idem';
  const storeKey = buildIdempotencyStoreKey({
    operation: 'confirm',
    tripId,
    riskId: 'risk-1',
    recommendationId: 'rec-1',
    idempotencyKey: '550e8400-e29b-41d4-a716-446655440010',
  });

  function buildSharedPrisma() {
    let meta: Record<string, unknown> = {};
    const prisma = {
      $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const tx = {
          $queryRaw: async () => [{ id: tripId }],
          trip: {
            findUnique: async () => ({ id: tripId, metadata: { ...meta } }),
            update: async ({
              data,
            }: {
              data: { metadata: Record<string, unknown> };
            }) => {
              meta = { ...data.metadata };
              return { id: tripId };
            },
          },
        } as unknown as Prisma.TransactionClient;
        return fn(tx);
      },
      getMeta: () => meta,
    };
    return prisma;
  }

  it('instance A save → instance B lookupAsync hits durable metadata', async () => {
    const prisma = buildSharedPrisma();
    const a = new ExecutionRiskIdempotencyStore(prisma);
    const b = new ExecutionRiskIdempotencyStore(prisma);
    const bodyHash = hashIdempotencyBody({ confirm: true });
    const response = { applied: true, newPlanVersionId: 'pv_erc_1' };

    await a.saveAsync(tripId, storeKey, bodyHash, response);
    a.clear();
    b.clear();

    const hit = await b.lookupAsync<typeof response>(tripId, storeKey, bodyHash);
    expect(hit.hit).toBe(true);
    expect(hit.response?.newPlanVersionId).toBe('pv_erc_1');

    const block = prisma.getMeta()[ERC_IDEMPOTENCY_META_KEY] as {
      keys: Record<string, { bodyHash: string }>;
    };
    expect(block.keys[storeKey]?.bodyHash).toBe(bodyHash);
  });

  it('findApplyRecordAsync reads durable apply key across instances', async () => {
    const prisma = buildSharedPrisma();
    const a = new ExecutionRiskIdempotencyStore(prisma);
    const b = new ExecutionRiskIdempotencyStore(prisma);
    const applyKey = buildIdempotencyStoreKey({
      operation: 'apply',
      tripId,
      riskId: 'risk-1',
      recommendationId: 'rec-1',
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440011',
    });
    await a.saveAsync(tripId, applyKey, hashIdempotencyBody({ preview: 1 }), {
      executionStatus: 'PREVIEW',
    });
    a.clear();
    expect(
      await b.findApplyRecordAsync({
        tripId,
        riskId: 'risk-1',
        recommendationId: 'rec-1',
        idempotencyKey: '550e8400-e29b-41d4-a716-446655440011',
      }),
    ).toBe(true);
  });

  it('durable bodyHash mismatch → IDEMPOTENCY_CONFLICT', async () => {
    const prisma = buildSharedPrisma();
    const store = new ExecutionRiskIdempotencyStore(prisma);
    await store.saveAsync(tripId, storeKey, hashIdempotencyBody({ a: 1 }), { ok: true });
    store.clear();
    await expect(
      store.lookupAsync(tripId, storeKey, hashIdempotencyBody({ a: 2 })),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
