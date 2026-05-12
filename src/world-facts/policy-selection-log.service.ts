import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { ExecutionPlanningContext } from './execution-planning-context.types';
import type { ResolvedRoutePlanningPolicyBundle } from './policy-registry.types';
import { PrismaService } from '../prisma/prisma.service';

export interface PolicySelectionLogRecord {
  id: string;
  createdAt: Date;
  countryCode: string;
  tripId: string | null;
  contextSnapshot: unknown;
  selectedBundleId: string;
  routingRuleId: string | null;
  selectionReason: string;
  effectiveRevision: string;
  bundleVersionId: string | null;
}

/**
 * Policy Lifecycle v1：持久化 bundle 快照 + selection 日志（回放 / 审计）。
 * 开启：`POLICY_SELECTION_LOG_ENABLED=true`（默认关闭，异步写入不阻塞请求）。
 */
@Injectable()
export class PolicySelectionLogService {
  private readonly logger = new Logger(PolicySelectionLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nestConfig: ConfigService,
  ) {}

  isEnabled(): boolean {
    const v =
      this.nestConfig.get<string>('POLICY_SELECTION_LOG_ENABLED') ??
      process.env.POLICY_SELECTION_LOG_ENABLED;
    return v === '1' || v?.toLowerCase() === 'true';
  }

  /**
   * 异步持久化；失败仅打 warn，不影响策略路径。
   */
  scheduleRecord(args: {
    planningContext?: ExecutionPlanningContext | null;
    resolved: ResolvedRoutePlanningPolicyBundle;
    effectiveRevision: string;
  }): void {
    if (!this.isEnabled()) return;
    void this.persistRecord(args).catch((e: unknown) =>
      this.logger.warn(`PolicySelectionLog persist failed: ${e instanceof Error ? e.message : e}`),
    );
  }

  async findById(id: string): Promise<PolicySelectionLogRecord | null> {
    const row = await this.prisma.policySelectionLog.findUnique({ where: { id } });
    return row ? mapRow(row) : null;
  }

  async findRecentByTripId(tripId: string, limit: number): Promise<PolicySelectionLogRecord[]> {
    const rows = await this.prisma.policySelectionLog.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map(mapRow);
  }

  private async persistRecord(args: {
    planningContext?: ExecutionPlanningContext | null;
    resolved: ResolvedRoutePlanningPolicyBundle;
    effectiveRevision: string;
  }): Promise<void> {
    const { planningContext, resolved, effectiveRevision } = args;
    const bundle = resolved.bundle;

    const existing = await this.prisma.routePlanningPolicyBundleVersion.findUnique({
      where: {
        bundleKey_revision: {
          bundleKey: bundle.id,
          revision: bundle.revision,
        },
      },
    });

    const bundleVersion =
      existing ??
      (await this.prisma.routePlanningPolicyBundleVersion.create({
        data: {
          bundleKey: bundle.id,
          revision: bundle.revision,
          scope: 'GLOBAL',
          definition: {
            parameters: bundle.parameters,
            policyDeclarations: bundle.policyDeclarations ?? [],
          } as unknown as Prisma.InputJsonValue,
          status: 'ACTIVE',
        },
      }));

    const countryCode = planningContext?.countryCode?.trim() || 'UNKNOWN';
    const tripId = planningContext?.tripId?.trim() ?? null;

    await this.prisma.policySelectionLog.create({
      data: {
        countryCode,
        tripId,
        contextSnapshot: buildContextSnapshot(planningContext) as Prisma.InputJsonValue,
        selectedBundleId: bundle.id,
        routingRuleId: resolved.routingRuleId ?? null,
        selectionReason: resolved.selectionReason,
        effectiveRevision,
        bundleVersionId: bundleVersion.id,
      },
    });
  }
}

function buildContextSnapshot(
  ctx?: ExecutionPlanningContext | null,
): Prisma.InputJsonObject {
  if (!ctx) {
    return { note: 'no_execution_planning_context' };
  }
  return {
    countryCode: ctx.countryCode,
    tripId: ctx.tripId ?? null,
    tripExecutionHistoryLength: ctx.tripExecutionHistory?.length ?? 0,
    hasLastCountryDispatchFact: Boolean(ctx.lastCountryDispatchFact),
    ambientDegradeEvents: ctx.hints?.ambientDegradeEvents ?? 0,
    routeDegradeDirectionCount: Object.keys(ctx.hints?.routeDegradeCountByRouteDirectionId ?? {})
      .length,
  };
}

function mapRow(row: {
  id: string;
  createdAt: Date;
  countryCode: string;
  tripId: string | null;
  contextSnapshot: unknown;
  selectedBundleId: string;
  routingRuleId: string | null;
  selectionReason: string;
  effectiveRevision: string;
  bundleVersionId: string | null;
}): PolicySelectionLogRecord {
  return {
    id: row.id,
    createdAt: row.createdAt,
    countryCode: row.countryCode,
    tripId: row.tripId,
    contextSnapshot: row.contextSnapshot,
    selectedBundleId: row.selectedBundleId,
    routingRuleId: row.routingRuleId,
    selectionReason: row.selectionReason,
    effectiveRevision: row.effectiveRevision,
    bundleVersionId: row.bundleVersionId,
  };
}
