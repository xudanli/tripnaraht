/**
 * Task E1 — PostgreSQL benchmark run store (claim / lease / staged transitions).
 */

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  BenchmarkInstanceExecution,
  BenchmarkInstanceExecutionStatus,
  BenchmarkRunConfig,
  BenchmarkRunRecord,
  BenchmarkRunStatus,
} from './benchmark-run.types';
import { hashRunConfig, stableRequestId, hashInstanceInput } from './benchmark-config.util';
import { isTerminalInstanceStatus } from './benchmark-resume.util';
import { assertBenchmarkTransition } from './benchmark-transition.util';
import type { BenchmarkDatasetInstance } from './benchmark-run.types';

const DEFAULT_LEASE_MS = 120_000;

export interface BenchmarkRunStoreOptions {
  leaseMs?: number;
  nowFn?: () => number;
}

export class BenchmarkRunStore {
  private readonly leaseMs: number;
  private readonly nowFn: () => number;

  constructor(
    private readonly prisma: PrismaClient,
    options?: BenchmarkRunStoreOptions,
  ) {
    this.leaseMs = options?.leaseMs ?? DEFAULT_LEASE_MS;
    this.nowFn = options?.nowFn ?? Date.now;
  }

  async createRun(input: {
    benchmarkRunId: string;
    config: BenchmarkRunConfig;
    instances: BenchmarkDatasetInstance[];
    forkedFromRunId?: string;
  }): Promise<BenchmarkRunRecord> {
    const configHash = hashRunConfig(input.config);
    const row = await this.prisma.decisionBenchmarkRun.create({
      data: {
        benchmarkRunId: input.benchmarkRunId,
        benchmarkVersion: input.config.benchmarkVersion,
        datasetVersion: input.config.datasetVersion,
        datasetChecksum: input.config.datasetChecksum,
        split: input.config.split,
        runtimeMode: input.config.runtimeMode,
        authorityStrategyId: input.config.authorityStrategyId,
        shadowStrategyId: input.config.shadowStrategyId,
        solverEngine: input.config.solverEngine,
        objectiveRegistryVersion: input.config.objectiveRegistryVersion,
        constraintPolicyVersion: input.config.constraintPolicyVersion,
        configJson: input.config as unknown as Prisma.InputJsonValue,
        configHash,
        status: 'CREATED',
        totalInstances: input.instances.length,
        concurrency: input.config.concurrency,
        maxAttempts: input.config.maxAttempts,
        shadowWaitTimeoutMs: input.config.shadowWaitTimeoutMs,
        gitCommit: input.config.gitCommit,
        environmentHash: input.config.environmentHash,
        forkedFromRunId: input.forkedFromRunId,
        instances: {
          create: input.instances.map((inst) => ({
            instanceId: inst.instanceId,
            strategyVariant: inst.strategyVariant ?? 'default',
            seed: inst.seed ?? 0,
            partition: inst.partition,
            status: 'PENDING',
            maxAttempts: input.config.maxAttempts,
            requestId: stableRequestId({
              benchmarkRunId: input.benchmarkRunId,
              instanceId: inst.instanceId,
              seed: inst.seed ?? 0,
              strategyVariant: inst.strategyVariant ?? 'default',
            }),
            inputHash: hashInstanceInput(inst),
          })),
        },
      },
      include: { instances: true },
    });
    return mapRunRow(row);
  }

  async getRun(benchmarkRunId: string): Promise<BenchmarkRunRecord | undefined> {
    const row = await this.prisma.decisionBenchmarkRun.findUnique({
      where: { benchmarkRunId },
    });
    return row ? mapRunRow(row) : undefined;
  }

  async updateRunStatus(
    benchmarkRunId: string,
    status: BenchmarkRunStatus,
  ): Promise<void> {
    await this.prisma.decisionBenchmarkRun.update({
      where: { benchmarkRunId },
      data: {
        status,
        completedAt:
          status === 'COMPLETED' ||
          status === 'COMPLETED_WITH_FAILURES' ||
          status === 'FAILED' ||
          status === 'CANCELLED'
            ? new Date()
            : undefined,
      },
    });
  }

  async aggregateRunCounters(benchmarkRunId: string): Promise<void> {
    const instances = await this.prisma.decisionBenchmarkInstanceExecution.findMany({
      where: { benchmarkRunId },
      select: { status: true, exclusionReason: true, reviewCaseId: true },
    });
    let completed = 0;
    let failed = 0;
    let excluded = 0;
    for (const i of instances) {
      if (i.status === 'COMPLETED') completed += 1;
      if (i.status === 'TERMINAL_FAILED') failed += 1;
      if (i.status === 'EXCLUDED') excluded += 1;
      if (i.status === 'COMPLETED' && i.exclusionReason) excluded += 1;
    }
    const allTerminal = instances.every((i) =>
      isTerminalInstanceStatus(i.status as BenchmarkInstanceExecutionStatus),
    );
    let runStatus: BenchmarkRunStatus = 'RUNNING';
    if (allTerminal) {
      runStatus = failed > 0 ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED';
    }
    await this.prisma.decisionBenchmarkRun.update({
      where: { benchmarkRunId },
      data: {
        completedInstances: completed,
        failedInstances: failed,
        excludedInstances: excluded,
        status: runStatus,
        completedAt: allTerminal ? new Date() : undefined,
      },
    });
  }

  async listInstances(benchmarkRunId: string): Promise<BenchmarkInstanceExecution[]> {
    const rows = await this.prisma.decisionBenchmarkInstanceExecution.findMany({
      where: { benchmarkRunId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapInstanceRow);
  }

  async getInstance(id: string): Promise<BenchmarkInstanceExecution | undefined> {
    const row = await this.prisma.decisionBenchmarkInstanceExecution.findUnique({
      where: { id },
    });
    return row ? mapInstanceRow(row) : undefined;
  }

  /** Claim next instance with lease (SKIP LOCKED). */
  async claimNextInstance(input: {
    benchmarkRunId: string;
    runnerId: string;
    onlyInstanceIds?: string[];
  }): Promise<BenchmarkInstanceExecution | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const onlyFilter =
        input.onlyInstanceIds?.length ?
          Prisma.sql`AND instance_id IN (${Prisma.join(input.onlyInstanceIds)})`
        : Prisma.empty;

      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM decision_benchmark_instance_execution
        WHERE benchmark_run_id = ${input.benchmarkRunId}
          AND status NOT IN ('COMPLETED', 'EXCLUDED', 'TERMINAL_FAILED')
          AND (
            status IN (
              'PENDING',
              'RETRYABLE_FAILED',
              'AUTHORITY_COMPLETED',
              'SHADOW_COMPLETED',
              'REVIEW_MATERIALIZED'
            )
            OR (status = 'RUNNING' AND lease_expires_at < NOW())
          )
          AND (
            locked_by IS NULL
            OR lease_expires_at IS NULL
            OR lease_expires_at < NOW()
          )
          ${onlyFilter}
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;

      const claimed = rows[0];
      if (!claimed) return undefined;

      const leaseExpiresAt = new Date(this.nowFn() + this.leaseMs);
      const freshStart = claimed.status === 'PENDING' || claimed.status === 'RETRYABLE_FAILED';
      const reclaimRunning = claimed.status === 'RUNNING';
      const nextStatus =
        freshStart || reclaimRunning ? 'RUNNING' : claimed.status;

      const updated = await tx.decisionBenchmarkInstanceExecution.update({
        where: { id: claimed.id },
        data: {
          status: nextStatus,
          lockedBy: input.runnerId,
          leaseExpiresAt,
          heartbeatAt: new Date(),
          ...(freshStart ? { attemptCount: { increment: 1 } } : {}),
          ...(freshStart ? { startedAt: new Date() } : {}),
        },
      });
      return mapInstanceRow(updated);
    });
  }

  async heartbeat(id: string, runnerId: string): Promise<void> {
    await this.prisma.decisionBenchmarkInstanceExecution.updateMany({
      where: { id, lockedBy: runnerId },
      data: {
        heartbeatAt: new Date(this.nowFn()),
        leaseExpiresAt: new Date(this.nowFn() + this.leaseMs),
      },
    });
  }

  async releaseLease(id: string, runnerId: string): Promise<void> {
    await this.prisma.decisionBenchmarkInstanceExecution.updateMany({
      where: { id, lockedBy: runnerId },
      data: {
        lockedBy: null,
        leaseExpiresAt: new Date(0),
      },
    });
  }

  async advanceInstance(
    id: string,
    patch: Partial<{
      status: BenchmarkInstanceExecutionStatus;
      decisionRunId: string;
      comparisonId: string;
      reviewCaseId: string;
      requestHash: string;
      authorityResponseHash: string;
      shadowEventHash: string;
      authorityWinnerId: string;
      shadowWinnerId: string;
      eligibleForStrategyComparison: boolean;
      divergenceTypes: string[];
      exclusionReason: string;
      failureClass: string;
      lastErrorCode: string;
      lastErrorMessage: string;
      lastErrorStage: string;
      artifactDirectory: string;
      authorityCompletedAt: Date;
      shadowCompletedAt: Date;
      startedAt: Date;
      completedAt: Date;
    }>,
  ): Promise<BenchmarkInstanceExecution> {
    const current = await this.prisma.decisionBenchmarkInstanceExecution.findUnique({
      where: { id },
    });
    if (!current) {
      throw new Error(`Benchmark instance execution not found: ${id}`);
    }
    if (patch.status) {
      assertBenchmarkTransition(
        current.status as BenchmarkInstanceExecutionStatus,
        patch.status,
      );
    }

    const row = await this.prisma.decisionBenchmarkInstanceExecution.update({
      where: { id },
      data: {
        ...patch,
        lockedBy: isTerminalInstanceStatus(patch.status as BenchmarkInstanceExecutionStatus)
          ? null
          : undefined,
        leaseExpiresAt: isTerminalInstanceStatus(patch.status as BenchmarkInstanceExecutionStatus)
          ? null
          : undefined,
      },
    });
    return mapInstanceRow(row);
  }

  async countClaimable(benchmarkRunId: string): Promise<number> {
    return this.prisma.decisionBenchmarkInstanceExecution.count({
      where: {
        benchmarkRunId,
        status: {
          notIn: ['COMPLETED', 'EXCLUDED', 'TERMINAL_FAILED'],
        },
        OR: [
          {
            status: {
              in: [
                'PENDING',
                'RETRYABLE_FAILED',
                'AUTHORITY_COMPLETED',
                'SHADOW_COMPLETED',
                'REVIEW_MATERIALIZED',
              ],
            },
            OR: [{ lockedBy: null }, { leaseExpiresAt: { lt: new Date() } }],
          },
          { status: 'RUNNING', leaseExpiresAt: { lt: new Date() } },
        ],
      },
    });
  }
}

function mapRunRow(row: {
  benchmarkRunId: string;
  benchmarkVersion: string;
  datasetVersion: string;
  datasetChecksum: string;
  split: string;
  runtimeMode: string;
  authorityStrategyId: string;
  shadowStrategyId: string;
  solverEngine: string;
  configHash: string;
  configJson: unknown;
  status: string;
  totalInstances: number;
  completedInstances: number;
  failedInstances: number;
  excludedInstances: number;
  gitCommit: string | null;
  environmentHash: string | null;
  forkedFromRunId: string | null;
  startedAt: Date;
  completedAt: Date | null;
}): BenchmarkRunRecord {
  return {
    benchmarkRunId: row.benchmarkRunId,
    benchmarkVersion: row.benchmarkVersion,
    datasetVersion: row.datasetVersion,
    datasetChecksum: row.datasetChecksum,
    split: row.split as BenchmarkRunRecord['split'],
    runtimeMode: row.runtimeMode,
    authorityStrategyId: row.authorityStrategyId,
    shadowStrategyId: row.shadowStrategyId,
    solverEngine: row.solverEngine,
    configHash: row.configHash,
    config: row.configJson as BenchmarkRunConfig,
    status: row.status as BenchmarkRunStatus,
    totalInstances: row.totalInstances,
    completedInstances: row.completedInstances,
    failedInstances: row.failedInstances,
    excludedInstances: row.excludedInstances,
    gitCommit: row.gitCommit ?? undefined,
    environmentHash: row.environmentHash ?? undefined,
    forkedFromRunId: row.forkedFromRunId ?? undefined,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

function mapInstanceRow(row: {
  id: string;
  benchmarkRunId: string;
  instanceId: string;
  strategyVariant: string;
  seed: number;
  partition: string | null;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  requestId: string;
  decisionRunId: string | null;
  comparisonId: string | null;
  reviewCaseId: string | null;
  inputHash: string;
  requestHash: string | null;
  authorityResponseHash: string | null;
  shadowEventHash: string | null;
  authorityWinnerId: string | null;
  shadowWinnerId: string | null;
  eligibleForStrategyComparison: boolean | null;
  divergenceTypes: string[];
  exclusionReason: string | null;
  failureClass: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorStage: string | null;
  lockedBy: string | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
  artifactDirectory: string | null;
  startedAt: Date | null;
  authorityCompletedAt: Date | null;
  shadowCompletedAt: Date | null;
  completedAt: Date | null;
}): BenchmarkInstanceExecution {
  return {
    id: row.id,
    benchmarkRunId: row.benchmarkRunId,
    instanceId: row.instanceId,
    strategyVariant: row.strategyVariant,
    seed: row.seed,
    partition: row.partition ?? undefined,
    status: row.status as BenchmarkInstanceExecutionStatus,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    requestId: row.requestId,
    decisionRunId: row.decisionRunId ?? undefined,
    comparisonId: row.comparisonId ?? undefined,
    reviewCaseId: row.reviewCaseId ?? undefined,
    inputHash: row.inputHash,
    requestHash: row.requestHash ?? undefined,
    authorityResponseHash: row.authorityResponseHash ?? undefined,
    shadowEventHash: row.shadowEventHash ?? undefined,
    authorityWinnerId: row.authorityWinnerId ?? undefined,
    shadowWinnerId: row.shadowWinnerId ?? undefined,
    eligibleForStrategyComparison: row.eligibleForStrategyComparison ?? undefined,
    divergenceTypes: row.divergenceTypes,
    exclusionReason: row.exclusionReason ?? undefined,
    failureClass: row.failureClass as BenchmarkInstanceExecution['failureClass'],
    lastErrorCode: row.lastErrorCode ?? undefined,
    lastErrorMessage: row.lastErrorMessage ?? undefined,
    lastErrorStage: row.lastErrorStage ?? undefined,
    lockedBy: row.lockedBy ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt?.toISOString(),
    heartbeatAt: row.heartbeatAt?.toISOString(),
    artifactDirectory: row.artifactDirectory ?? undefined,
    startedAt: row.startedAt?.toISOString(),
    authorityCompletedAt: row.authorityCompletedAt?.toISOString(),
    shadowCompletedAt: row.shadowCompletedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
  };
}

export function newBenchmarkRunId(): string {
  return `bench_${randomUUID()}`;
}
