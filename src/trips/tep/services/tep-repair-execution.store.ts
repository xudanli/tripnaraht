/**
 * WP-TEP-17 — DB SSOT for TEP local repair writeback idempotency / concurrency.
 */

import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';

export type TepRepairExecutionStatus = 'PENDING' | 'APPLIED' | 'FAILED';

/** In-flight repair older than this is treated as stale and reclaimable. */
export const TEP_REPAIR_PENDING_STALE_MS = 120_000;

export type TepRepairExecutionClaim =
  | { action: 'proceed' }
  | { action: 'replay'; planVersionId: string; decisionId: string }
  | { action: 'in_progress' };

@Injectable()
export class TepRepairExecutionStore {
  async claimOrReplay(
    tx: Prisma.TransactionClient,
    input: {
      tripId: string;
      optionId: string;
      idempotencyKey: string;
    },
  ): Promise<TepRepairExecutionClaim> {
    const existing = await tx.tepRepairExecution.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing?.status === 'APPLIED' && existing.planVersionId && existing.decisionId) {
      return {
        action: 'replay',
        planVersionId: existing.planVersionId,
        decisionId: existing.decisionId,
      };
    }

    if (existing?.status === 'PENDING') {
      const ageMs = Date.now() - existing.createdAt.getTime();
      if (ageMs < TEP_REPAIR_PENDING_STALE_MS) {
        return { action: 'in_progress' };
      }
      await tx.tepRepairExecution.update({
        where: { idempotencyKey: input.idempotencyKey },
        data: { status: 'FAILED' },
      });
    }

    await tx.tepRepairExecution.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        id: randomUUID(),
        tripId: input.tripId,
        optionId: input.optionId,
        idempotencyKey: input.idempotencyKey,
        status: 'PENDING',
      },
      update: {
        status: 'PENDING',
        planVersionId: null,
        decisionId: null,
        appliedAt: null,
      },
    });

    return { action: 'proceed' };
  }

  async markApplied(
    tx: Prisma.TransactionClient,
    idempotencyKey: string,
    entry: { planVersionId: string; decisionId: string },
  ): Promise<void> {
    await tx.tepRepairExecution.update({
      where: { idempotencyKey },
      data: {
        status: 'APPLIED',
        planVersionId: entry.planVersionId,
        decisionId: entry.decisionId,
        appliedAt: new Date(),
      },
    });
  }

  async markFailed(tx: Prisma.TransactionClient, idempotencyKey: string): Promise<void> {
    await tx.tepRepairExecution.updateMany({
      where: { idempotencyKey, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  }

  throwRepairInProgress(optionId: string): never {
    throw new ConflictException({
      code: 'REPAIR_IN_PROGRESS',
      message: 'TEP repair is already in progress for this option; retry shortly',
      optionId,
    });
  }
}
