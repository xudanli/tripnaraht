/**
 * Promotion ledger — trip.metadata scoped idempotency for assertion promotion.
 */

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import {
  RFC001_ASSERTION_PROMOTION_LEDGER_KEY,
  type AssertionPromotionLedgerEntry,
  type AssertionPromotionLedgerStatus,
  type StoredAssertionPromotionLedger,
} from './assertion-promotion.types';

const MAX_FAILED_QUEUE = 200;

@Injectable()
export class AssertionPromotionLedgerStore {
  constructor(private readonly prisma: PrismaService) {}

  async read(tripId: string): Promise<StoredAssertionPromotionLedger> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const raw = (trip?.metadata as Record<string, unknown> | null)?.[
      RFC001_ASSERTION_PROMOTION_LEDGER_KEY
    ] as StoredAssertionPromotionLedger | undefined;
    return {
      byPromotionKey: raw?.byPromotionKey ?? {},
      failedQueue: raw?.failedQueue ?? [],
      lastUpdatedAt: raw?.lastUpdatedAt,
    };
  }

  async getByKey(
    tripId: string,
    promotionKey: string,
  ): Promise<AssertionPromotionLedgerEntry | undefined> {
    const state = await this.read(tripId);
    return state.byPromotionKey[promotionKey];
  }

  async upsert(
    tripId: string,
    entry: AssertionPromotionLedgerEntry,
  ): Promise<AssertionPromotionLedgerEntry> {
    const state = await this.read(tripId);
    state.byPromotionKey[entry.promotionKey] = entry;

    if (entry.status === 'FAILED') {
      const queue = new Set(state.failedQueue);
      queue.add(entry.promotionKey);
      state.failedQueue = [...queue].slice(-MAX_FAILED_QUEUE);
    } else {
      state.failedQueue = state.failedQueue.filter((k) => k !== entry.promotionKey);
    }

    await this.write(tripId, state);
    return entry;
  }

  async listRetryable(
    tripId: string,
    nowMs: number,
  ): Promise<AssertionPromotionLedgerEntry[]> {
    const state = await this.read(tripId);
    return state.failedQueue
      .map((key) => state.byPromotionKey[key])
      .filter((entry): entry is AssertionPromotionLedgerEntry => {
        if (!entry || entry.status !== 'FAILED') return false;
        if (!entry.nextRetryAt) return true;
        return Date.parse(entry.nextRetryAt) <= nowMs;
      });
  }

  createEntry(input: {
    promotionKey: string;
    signal: AssertionPromotionLedgerEntry['signal'];
    status: AssertionPromotionLedgerStatus;
    shadowMode: boolean;
    assertionId?: string;
    eventId?: string;
    detail?: string;
    problemId?: string;
    recoveredProblemId?: string;
    ingestId?: string;
    attempts?: number;
    nextRetryAt?: string;
    lastError?: string;
  }): AssertionPromotionLedgerEntry {
    return {
      ledgerId: `apl_${randomUUID()}`,
      promotionKey: input.promotionKey,
      signal: input.signal,
      assertionId: input.assertionId,
      eventId: input.eventId,
      status: input.status,
      shadowMode: input.shadowMode,
      attempts: input.attempts ?? 1,
      lastAttemptAt: new Date().toISOString(),
      nextRetryAt: input.nextRetryAt,
      lastError: input.lastError,
      detail: input.detail,
      problemId: input.problemId,
      recoveredProblemId: input.recoveredProblemId,
      ingestId: input.ingestId,
    };
  }

  private async write(tripId: string, state: StoredAssertionPromotionLedger): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = { ...((trip?.metadata ?? {}) as Record<string, unknown>) };
    meta[RFC001_ASSERTION_PROMOTION_LEDGER_KEY] = {
      ...state,
      lastUpdatedAt: new Date().toISOString(),
    };
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(meta) },
    });
  }
}
