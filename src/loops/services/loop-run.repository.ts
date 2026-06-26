import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { LoopIterationDecision, LoopRunStatus, LoopType } from '../types/loop-definition.types';
import type { LoopIterationRecord } from '../types/loop-iteration.types';
import type { LoopRunRecord } from '../types/loop-run.types';
import { getLoopDefinition } from '../registry/loop-definition.registry';

@Injectable()
export class LoopRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(input: {
    tripId: string;
    loopType: LoopType;
    triggerEventId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<LoopRunRecord> {
    const def = getLoopDefinition(input.loopType);
    const id = `loop_${randomUUID()}`;
    const row = await this.prisma.loopRun.create({
      data: {
        id,
        tripId: input.tripId,
        loopType: input.loopType,
        status: 'RUNNING',
        triggerEventId: input.triggerEventId,
        currentIteration: 0,
        tokenBudget: def.budgetPolicy.maxIterations * 1000,
        costBudgetUsd: def.budgetPolicy.maxTokenCostUsd,
        timeBudgetMs: def.budgetPolicy.timeBudgetMs,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this.toRunRecord(row);
  }

  async appendIteration(input: {
    loopRunId: string;
    sequence: number;
    observedState: Record<string, unknown>;
    diagnosis: Record<string, unknown>;
    proposedAction: Record<string, unknown>;
    validationResult: Record<string, unknown>;
    decision: LoopIterationDecision;
    modelUsage?: LoopIterationRecord['modelUsage'];
  }): Promise<LoopIterationRecord> {
    const id = `loop_iter_${randomUUID()}`;
    const row = await this.prisma.loopIteration.create({
      data: {
        id,
        loopRunId: input.loopRunId,
        sequence: input.sequence,
        observedState: input.observedState as Prisma.InputJsonValue,
        diagnosis: input.diagnosis as Prisma.InputJsonValue,
        proposedAction: input.proposedAction as Prisma.InputJsonValue,
        validationResult: input.validationResult as Prisma.InputJsonValue,
        decision: input.decision,
        modelUsage: input.modelUsage as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.loopRun.update({
      where: { id: input.loopRunId },
      data: { currentIteration: input.sequence },
    });

    return this.toIterationRecord(row);
  }

  async updateRunStatus(
    loopRunId: string,
    status: LoopRunStatus,
    finalOutcome?: Record<string, unknown>,
  ): Promise<LoopRunRecord> {
    const row = await this.prisma.loopRun.update({
      where: { id: loopRunId },
      data: {
        status,
        completedAt: ['COMPLETED', 'FAILED', 'WAITING_FOR_HUMAN', 'PAUSED'].includes(status)
          ? new Date()
          : undefined,
        finalOutcome: finalOutcome as Prisma.InputJsonValue | undefined,
      },
    });
    return this.toRunRecord(row);
  }

  async findRunWithIterations(loopRunId: string) {
    const row = await this.prisma.loopRun.findUnique({
      where: { id: loopRunId },
      include: { LoopIteration: { orderBy: { sequence: 'asc' } } },
    });
    if (!row) return null;
    return {
      ...this.toRunRecord(row),
      iterations: row.LoopIteration.map((it) => this.toIterationRecord(it)),
    };
  }

  async findLatestRun(tripId: string, loopType: LoopType): Promise<LoopRunRecord | null> {
    const row = await this.prisma.loopRun.findFirst({
      where: { tripId, loopType },
      orderBy: { startedAt: 'desc' },
    });
    return row ? this.toRunRecord(row) : null;
  }

  async listRecentRuns(input: {
    tripId?: string;
    loopRunId?: string;
    loopTypes?: LoopType[];
    limit?: number;
  }): Promise<LoopRunRecord[]> {
    if (input.loopRunId) {
      const row = await this.prisma.loopRun.findUnique({ where: { id: input.loopRunId } });
      return row ? [this.toRunRecord(row)] : [];
    }

    const rows = await this.prisma.loopRun.findMany({
      where: {
        ...(input.tripId ? { tripId: input.tripId } : {}),
        ...(input.loopTypes?.length ? { loopType: { in: input.loopTypes } } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: input.limit ?? 20,
    });
    return rows.map((r) => this.toRunRecord(r));
  }

  private toRunRecord(row: {
    id: string;
    tripId: string;
    loopType: string;
    status: string;
    triggerEventId: string | null;
    currentIteration: number;
    tokenBudget: number | null;
    costBudgetUsd: number | null;
    timeBudgetMs: number | null;
    startedAt: Date;
    completedAt: Date | null;
    finalOutcome: unknown;
    metadata: unknown;
  }): LoopRunRecord {
    return {
      id: row.id,
      tripId: row.tripId,
      loopType: row.loopType as LoopType,
      status: row.status as LoopRunStatus,
      triggerEventId: row.triggerEventId ?? undefined,
      currentIteration: row.currentIteration,
      tokenBudget: row.tokenBudget ?? undefined,
      costBudgetUsd: row.costBudgetUsd ?? undefined,
      timeBudgetMs: row.timeBudgetMs ?? undefined,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
      finalOutcome: (row.finalOutcome as Record<string, unknown> | null) ?? undefined,
      metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    };
  }

  private toIterationRecord(row: {
    id: string;
    loopRunId: string;
    sequence: number;
    observedState: unknown;
    diagnosis: unknown;
    proposedAction: unknown;
    validationResult: unknown;
    decision: string;
    modelUsage: unknown;
    createdAt: Date;
  }): LoopIterationRecord {
    return {
      id: row.id,
      loopRunId: row.loopRunId,
      sequence: row.sequence,
      observedState: row.observedState as Record<string, unknown>,
      diagnosis: row.diagnosis as Record<string, unknown>,
      proposedAction: row.proposedAction as Record<string, unknown>,
      validationResult: row.validationResult as Record<string, unknown>,
      decision: row.decision as LoopIterationDecision,
      modelUsage: (row.modelUsage as LoopIterationRecord['modelUsage']) ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
