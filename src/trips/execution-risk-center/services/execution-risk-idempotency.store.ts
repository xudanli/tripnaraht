import { createHash } from 'crypto';
import { ConflictException } from '@nestjs/common';

export type ExecutionRiskIdempotentOperation = 'apply' | 'confirm';

export interface IdempotencyLookupResult<T> {
  hit: boolean;
  response?: T;
}

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

/**
 * In-process idempotency cache for apply/confirm (AC-012).
 * Production may swap for Redis/DB — interface kept narrow for that cutover.
 */
export class ExecutionRiskIdempotencyStore {
  private readonly records = new Map<
    string,
    { bodyHash: string; response: unknown; createdAt: number }
  >();

  lookup<T>(storeKey: string, bodyHash: string): IdempotencyLookupResult<T> {
    const existing = this.records.get(storeKey);
    if (!existing) return { hit: false };
    if (existing.bodyHash !== bodyHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: `Key already used with different payload`,
        details: { storeKey },
      });
    }
    return { hit: true, response: existing.response as T };
  }

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
}
