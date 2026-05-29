import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenStatsService } from '../../agent/services/token-stats.service';
import { LlmCostService } from './llm-cost.service';
import { LlmProvider } from '../dto/llm-request.dto';
import type { OrchestrationStep, SubAgentType } from '../../agent/interfaces/trip-plan.interface';
import { getLlmTraceContext } from '../token-context.storage';

export interface LlmUsageRecordInput {
  request_id: string;
  span_id?: string;
  provider: LlmProvider | string;
  model: string;
  step_name: string;
  sub_agent?: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  is_estimated?: boolean;
  success?: boolean;
  duration_ms?: number;
  error?: string;
  timestamp?: string;
}

export interface LlmUsageQueryFilters {
  subAgent?: string;
  provider?: LlmProvider | string;
  startTime?: string;
  endTime?: string;
}

export interface LlmUsageListFilters extends LlmUsageQueryFilters {
  requestId?: string;
  stepName?: string;
  model?: string;
  success?: boolean;
  page?: number;
  pageSize?: number;
}

export interface LlmTokenLogRowDto {
  id: string;
  requestId: string;
  spanId: string | null;
  provider: string;
  model: string;
  stepName: string;
  subAgent: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isEstimated: boolean;
  success: boolean;
  durationMs: number | null;
  costUsd: number;
  createdAt: string;
}

@Injectable()
export class LlmUsageRecorderService {
  private readonly logger = new Logger(LlmUsageRecorderService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly tokenStatsService?: TokenStatsService,
    @Optional() private readonly llmCostService?: LlmCostService,
  ) {}

  /**
   * Resolve request / step / sub-agent from explicit params + AsyncLocalStorage.
   */
  resolveContext(explicit?: {
    request_id?: string;
    state_machine_step?: OrchestrationStep | string;
    sub_agent?: SubAgentType | string;
  }): { request_id: string; step_name: string; sub_agent: string } {
    const als = getLlmTraceContext();
    return {
      request_id: explicit?.request_id ?? als?.requestId ?? 'SYSTEM_INTERNAL',
      step_name: String(explicit?.state_machine_step ?? als?.stepName ?? 'UNKNOWN'),
      sub_agent: String(explicit?.sub_agent ?? als?.subAgent ?? 'Orchestrator'),
    };
  }

  /**
   * Fire-and-forget: persist to DB + in-memory TokenStats (dev dashboards).
   */
  record(input: LlmUsageRecordInput): void {
    void this.recordAsync(input).catch((err) => {
      this.logger.warn(`[LlmUsageRecorder] record failed: ${err?.message ?? err}`);
    });
  }

  async recordAsync(input: LlmUsageRecordInput): Promise<void> {
    const provider = String(input.provider) as LlmProvider;
    const costUsd =
      this.llmCostService?.calculateCost(
        provider,
        input.model,
        input.prompt_tokens,
        input.completion_tokens,
      ) ?? 0;

    if (this.prisma?.isDbConnected()) {
      try {
        await this.prisma.llmTokenLog.create({
          data: {
            requestId: input.request_id,
            spanId: input.span_id ?? null,
            provider: String(input.provider),
            model: input.model,
            stepName: input.step_name,
            subAgent: input.sub_agent ?? null,
            promptTokens: input.prompt_tokens,
            completionTokens: input.completion_tokens,
            totalTokens: input.total_tokens,
            isEstimated: Boolean(input.is_estimated),
            success: input.success !== false,
            durationMs: input.duration_ms ?? null,
            costUsd: new Prisma.Decimal(costUsd),
          },
        });
      } catch (e: any) {
        this.logger.warn(`[LlmUsageRecorder] DB insert failed: ${e?.message ?? e}`);
      }
    }

    if (this.tokenStatsService) {
      const spanId = input.span_id ?? `llm-${input.step_name}-${Date.now()}`;
      await this.tokenStatsService.recordTokenUsage({
        request_id: input.request_id,
        trace_id: input.request_id,
        span_id: spanId,
        sub_agent: (input.sub_agent ?? 'Orchestrator') as SubAgentType,
        state_machine_step: input.step_name as OrchestrationStep,
        task_type: input.step_name,
        provider,
        model: input.model,
        prompt_tokens: input.prompt_tokens,
        completion_tokens: input.completion_tokens,
        total_tokens: input.total_tokens,
        duration_ms: input.duration_ms ?? 0,
        success: input.success !== false,
        error: input.error,
        timestamp: input.timestamp ?? new Date().toISOString(),
      });
    }
  }

  isDbEnabled(): boolean {
    return Boolean(this.prisma?.isDbConnected());
  }

  async aggregateUsage(filters: LlmUsageQueryFilters = {}): Promise<Record<string, unknown>> {
    if (!this.isDbEnabled()) {
      return { source: 'memory_fallback_unavailable' };
    }

    const where = this.buildWhere(filters);
    const rows = await this.prisma!.llmTokenLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50_000,
    });

    if (filters.subAgent) {
      return { source: 'db', subAgent: this.aggregateSubAgentRows(rows, filters.subAgent) };
    }
    if (filters.provider) {
      return { source: 'db', provider: this.aggregateProviderRows(rows, String(filters.provider)) };
    }

    const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
    const totalCalls = rows.length;
    const successfulCalls = rows.filter((r) => r.success).length;
    const byStep: Record<string, { total_tokens: number; calls: number }> = {};
    for (const r of rows) {
      if (!byStep[r.stepName]) {
        byStep[r.stepName] = { total_tokens: 0, calls: 0 };
      }
      byStep[r.stepName].total_tokens += r.totalTokens;
      byStep[r.stepName].calls += 1;
    }

    return {
      source: 'db',
      totalTokens,
      totalPromptTokens: rows.reduce((s, r) => s + r.promptTokens, 0),
      totalCompletionTokens: rows.reduce((s, r) => s + r.completionTokens, 0),
      totalCalls,
      successfulCalls,
      failedCalls: totalCalls - successfulCalls,
      successRate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
      avgTokensPerCall: totalCalls > 0 ? totalTokens / totalCalls : 0,
      byStep,
      timeRange:
        filters.startTime && filters.endTime
          ? { start: filters.startTime, end: filters.endTime }
          : undefined,
    };
  }

  async aggregateCost(filters: LlmUsageQueryFilters = {}) {
    if (!this.isDbEnabled()) {
      return null;
    }

    const where = this.buildWhere(filters);
    const rows = await this.prisma!.llmTokenLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50_000,
    });

    let totalCost = 0;
    const byProvider: Record<string, number> = {};
    const bySubAgent: Record<string, number> = {};
    const breakdownMap: Record<
      string,
      { provider: string; model: string; calls: number; tokens: number; cost: number }
    > = {};

    for (const r of rows) {
      const cost = Number(r.costUsd);
      totalCost += cost;
      byProvider[r.provider] = (byProvider[r.provider] ?? 0) + cost;
      const sa = r.subAgent ?? 'UNKNOWN';
      bySubAgent[sa] = (bySubAgent[sa] ?? 0) + cost;
      const key = `${r.provider}:${r.model}`;
      if (!breakdownMap[key]) {
        breakdownMap[key] = { provider: r.provider, model: r.model, calls: 0, tokens: 0, cost: 0 };
      }
      breakdownMap[key].calls += 1;
      breakdownMap[key].tokens += r.totalTokens;
      breakdownMap[key].cost += cost;
    }

    return {
      source: 'db',
      totalCost: parseFloat(totalCost.toFixed(6)),
      currency: 'USD',
      byProvider: Object.keys(byProvider).length ? byProvider : undefined,
      bySubAgent: Object.keys(bySubAgent).length ? bySubAgent : undefined,
      breakdown: Object.values(breakdownMap),
      timeRange:
        filters.startTime && filters.endTime
          ? { start: filters.startTime, end: filters.endTime }
          : undefined,
    };
  }

  async getTraceByRequestId(requestId: string) {
    if (!this.isDbEnabled()) {
      return [];
    }
    return this.prisma!.llmTokenLog.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Paginated token audit log for admin list views.
   */
  async listLogs(filters: LlmUsageListFilters = {}): Promise<{
    source: 'db' | 'memory';
    rows: LlmTokenLogRowDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    if (this.isDbEnabled()) {
      const where = this.buildListWhere(filters);
      const [rows, total] = await Promise.all([
        this.prisma!.llmTokenLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
        }),
        this.prisma!.llmTokenLog.count({ where }),
      ]);
      return {
        source: 'db',
        rows: rows.map((r) => this.toLogRowDto(r)),
        total,
        page,
        pageSize,
        totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
      };
    }

    return this.listLogsFromMemory(filters, page, pageSize);
  }

  private listLogsFromMemory(
    filters: LlmUsageListFilters,
    page: number,
    pageSize: number,
  ): {
    source: 'memory';
    rows: LlmTokenLogRowDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    if (!this.tokenStatsService) {
      return { source: 'memory', rows: [], total: 0, page, pageSize, totalPages: 0 };
    }

    let records = this.tokenStatsService.getAllRecords();

    if (filters.requestId?.trim()) {
      const rid = filters.requestId.trim();
      records = records.filter((r) => r.request_id === rid);
    }
    if (filters.subAgent) {
      records = records.filter((r) => String(r.sub_agent) === filters.subAgent);
    }
    if (filters.provider) {
      records = records.filter((r) => String(r.provider) === String(filters.provider));
    }
    if (filters.stepName) {
      records = records.filter((r) => String(r.state_machine_step) === filters.stepName);
    }
    if (filters.model) {
      records = records.filter((r) => r.model === filters.model);
    }
    if (filters.success !== undefined) {
      records = records.filter((r) => r.success === filters.success);
    }
    if (filters.startTime && filters.endTime) {
      const start = new Date(filters.startTime).getTime();
      const end = new Date(filters.endTime).getTime();
      records = records.filter((r) => {
        const t = new Date(r.timestamp).getTime();
        return t >= start && t <= end;
      });
    }

    records.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const total = records.length;
    const slice = records.slice((page - 1) * pageSize, page * pageSize);

    return {
      source: 'memory',
      rows: slice.map((r) => this.memoryRecordToLogRowDto(r)),
      total,
      page,
      pageSize,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  private toLogRowDto(row: {
    id: string;
    requestId: string;
    spanId: string | null;
    provider: string;
    model: string;
    stepName: string;
    subAgent: string | null;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    isEstimated: boolean;
    success: boolean;
    durationMs: number | null;
    costUsd: Prisma.Decimal;
    createdAt: Date;
  }): LlmTokenLogRowDto {
    return {
      id: row.id,
      requestId: row.requestId,
      spanId: row.spanId,
      provider: row.provider,
      model: row.model,
      stepName: row.stepName,
      subAgent: row.subAgent,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      isEstimated: row.isEstimated,
      success: row.success,
      durationMs: row.durationMs,
      costUsd: Number(row.costUsd),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private memoryRecordToLogRowDto(r: {
    request_id: string;
    span_id: string;
    provider: LlmProvider | string;
    model: string;
    state_machine_step: string;
    sub_agent: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    success: boolean;
    duration_ms: number;
    timestamp: string;
  }): LlmTokenLogRowDto {
    const provider = String(r.provider) as LlmProvider;
    const costUsd =
      this.llmCostService?.calculateCost(
        provider,
        r.model,
        r.prompt_tokens,
        r.completion_tokens,
      ) ?? 0;
    return {
      id: `${r.request_id}_${r.span_id}`,
      requestId: r.request_id,
      spanId: r.span_id,
      provider: String(r.provider),
      model: r.model,
      stepName: String(r.state_machine_step),
      subAgent: String(r.sub_agent),
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens,
      isEstimated: false,
      success: r.success,
      durationMs: r.duration_ms,
      costUsd,
      createdAt: r.timestamp,
    };
  }

  private buildWhere(filters: LlmUsageQueryFilters): Prisma.LlmTokenLogWhereInput {
    return this.buildListWhere(filters);
  }

  private buildListWhere(filters: LlmUsageListFilters): Prisma.LlmTokenLogWhereInput {
    const where: Prisma.LlmTokenLogWhereInput = {};
    if (filters.requestId?.trim()) {
      where.requestId = filters.requestId.trim();
    }
    if (filters.subAgent) {
      where.subAgent = filters.subAgent;
    }
    if (filters.provider) {
      where.provider = String(filters.provider);
    }
    if (filters.stepName) {
      where.stepName = filters.stepName;
    }
    if (filters.model) {
      where.model = { contains: filters.model, mode: 'insensitive' };
    }
    if (filters.success !== undefined) {
      where.success = filters.success;
    }
    if (filters.startTime && filters.endTime) {
      where.createdAt = {
        gte: new Date(filters.startTime),
        lte: new Date(filters.endTime),
      };
    } else if (filters.startTime) {
      where.createdAt = { gte: new Date(filters.startTime) };
    } else if (filters.endTime) {
      where.createdAt = { lte: new Date(filters.endTime) };
    }
    return where;
  }

  private aggregateSubAgentRows(
    rows: Array<{ subAgent: string | null; promptTokens: number; completionTokens: number; totalTokens: number; success: boolean; durationMs: number | null; createdAt: Date }>,
    subAgent: string,
  ) {
    const filtered = rows.filter((r) => r.subAgent === subAgent);
    const totalCalls = filtered.length;
    const successfulCalls = filtered.filter((r) => r.success).length;
    const totalTokens = filtered.reduce((s, r) => s + r.totalTokens, 0);
    return {
      sub_agent: subAgent,
      tokens: {
        total_prompt_tokens: filtered.reduce((s, r) => s + r.promptTokens, 0),
        total_completion_tokens: filtered.reduce((s, r) => s + r.completionTokens, 0),
        total_tokens: totalTokens,
        avg_total_tokens: totalCalls > 0 ? totalTokens / totalCalls : 0,
      },
      calls: {
        total_calls: totalCalls,
        successful_calls: successfulCalls,
        failed_calls: totalCalls - successfulCalls,
        success_rate: totalCalls > 0 ? successfulCalls / totalCalls : 0,
      },
    };
  }

  private aggregateProviderRows(
    rows: Array<{ provider: string; promptTokens: number; completionTokens: number; totalTokens: number; success: boolean }>,
    provider: string,
  ) {
    const filtered = rows.filter((r) => r.provider === provider);
    const totalCalls = filtered.length;
    return {
      provider,
      total_tokens: filtered.reduce((s, r) => s + r.totalTokens, 0),
      total_calls: totalCalls,
      success_rate: totalCalls > 0 ? filtered.filter((r) => r.success).length / totalCalls : 0,
    };
  }
}
