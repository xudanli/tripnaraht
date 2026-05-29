import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getLlmTraceContext } from '../../llm/token-context.storage';
import type { OrchestrationStep, SubAgentType } from '../../agent/interfaces/trip-plan.interface';
import { setSkillExecutionRecorder } from './skill-execution-recorder.bridge';

/** Legacy alias → canonical skill name (mirror SkillsRegistryService). */
const SKILL_NAME_LEGACY_ALIASES: Record<string, string> = {
  'dem.get.profile': 'dem.get_profile',
  'dem.getProfile': 'dem.get_profile',
  'geo.check.hazard.zones': 'geo.checkHazardZones',
};

export interface SkillExecutionRecordInput {
  request_id: string;
  span_id?: string;
  skill_name: string;
  step_name: string;
  sub_agent?: string;
  route_path?: string;
  category?: string;
  success?: boolean;
  duration_ms: number;
  error?: string;
}

export interface SkillExecutionListFilters {
  requestId?: string;
  skillName?: string;
  routePath?: string;
  success?: boolean;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class SkillExecutionRecorderService implements OnModuleInit {
  private readonly logger = new Logger(SkillExecutionRecorderService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  onModuleInit(): void {
    setSkillExecutionRecorder(this);
  }

  resolveCanonicalSkillName(skillName: string): string {
    return SKILL_NAME_LEGACY_ALIASES[skillName] ?? skillName;
  }

  resolveContext(explicit?: {
    request_id?: string;
    state_machine_step?: OrchestrationStep | string;
    sub_agent?: SubAgentType | string;
    route_path?: string;
    category?: string;
  }): {
    request_id: string;
    step_name: string;
    sub_agent: string;
    route_path?: string;
    category?: string;
  } {
    const als = getLlmTraceContext();
    return {
      request_id: explicit?.request_id ?? als?.requestId ?? 'SYSTEM_INTERNAL',
      step_name: String(explicit?.state_machine_step ?? als?.stepName ?? 'UNKNOWN'),
      sub_agent: String(explicit?.sub_agent ?? als?.subAgent ?? 'Orchestrator'),
      route_path: explicit?.route_path ?? als?.routePath,
      category: explicit?.category,
    };
  }

  record(input: SkillExecutionRecordInput): void {
    void this.recordAsync(input).catch((err) => {
      this.logger.warn(`[SkillExecutionRecorder] record failed: ${err?.message ?? err}`);
    });
  }

  async recordAsync(input: SkillExecutionRecordInput): Promise<void> {
    if (!this.prisma?.isDbConnected()) {
      return;
    }

    const canonicalName = this.resolveCanonicalSkillName(input.skill_name);

    try {
      await this.prisma.skillExecutionLog.create({
        data: {
          requestId: input.request_id,
          spanId: input.span_id ?? null,
          skillName: input.skill_name,
          canonicalName,
          stepName: input.step_name,
          subAgent: input.sub_agent ?? null,
          routePath: input.route_path ?? null,
          category: input.category ?? null,
          success: input.success !== false,
          durationMs: input.duration_ms,
          error: input.error ?? null,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[SkillExecutionRecorder] DB insert failed: ${msg}`);
    }
  }

  isDbEnabled(): boolean {
    return Boolean(this.prisma?.isDbConnected());
  }

  async listExecutions(filters: SkillExecutionListFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    if (!this.isDbEnabled()) {
      return { source: 'db_unavailable' as const, rows: [], total: 0, page, pageSize, totalPages: 0 };
    }

    const where = this.buildWhere(filters);
    const [rows, total] = await Promise.all([
      this.prisma!.skillExecutionLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma!.skillExecutionLog.count({ where }),
    ]);

    return {
      source: 'db' as const,
      rows: rows.map((r) => this.toDto(r)),
      total,
      page,
      pageSize,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    };
  }

  async getTraceByRequestId(requestId: string) {
    if (!this.isDbEnabled()) {
      return [];
    }
    const rows = await this.prisma!.skillExecutionLog.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async aggregateSummary(filters: Pick<SkillExecutionListFilters, 'startTime' | 'endTime' | 'requestId'> = {}) {
    if (!this.isDbEnabled()) {
      return { source: 'db_unavailable' as const };
    }

    const where = this.buildWhere(filters);
    const rows = await this.prisma!.skillExecutionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50_000,
    });

    const bySkill: Record<string, { calls: number; success: number; total_duration_ms: number }> = {};
    const byRoutePath: Record<string, number> = {};
    const byStep: Record<string, number> = {};

    for (const r of rows) {
      const key = r.canonicalName ?? r.skillName;
      if (!bySkill[key]) {
        bySkill[key] = { calls: 0, success: 0, total_duration_ms: 0 };
      }
      bySkill[key].calls += 1;
      if (r.success) bySkill[key].success += 1;
      bySkill[key].total_duration_ms += r.durationMs;

      const rp = r.routePath ?? 'UNKNOWN';
      byRoutePath[rp] = (byRoutePath[rp] ?? 0) + 1;
      byStep[r.stepName] = (byStep[r.stepName] ?? 0) + 1;
    }

    return {
      source: 'db' as const,
      totalCalls: rows.length,
      successfulCalls: rows.filter((r) => r.success).length,
      bySkill,
      byRoutePath,
      byStep,
    };
  }

  private buildWhere(filters: SkillExecutionListFilters): Prisma.SkillExecutionLogWhereInput {
    const where: Prisma.SkillExecutionLogWhereInput = {};
    if (filters.requestId?.trim()) {
      where.requestId = filters.requestId.trim();
    }
    if (filters.skillName?.trim()) {
      const name = filters.skillName.trim();
      where.OR = [{ skillName: name }, { canonicalName: name }];
    }
    if (filters.routePath?.trim()) {
      where.routePath = filters.routePath.trim();
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

  private toDto(row: {
    id: string;
    requestId: string;
    spanId: string | null;
    skillName: string;
    canonicalName: string | null;
    stepName: string;
    subAgent: string | null;
    routePath: string | null;
    category: string | null;
    success: boolean;
    durationMs: number;
    error: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      requestId: row.requestId,
      spanId: row.spanId,
      skillName: row.skillName,
      canonicalName: row.canonicalName,
      stepName: row.stepName,
      subAgent: row.subAgent,
      routePath: row.routePath,
      category: row.category,
      success: row.success,
      durationMs: row.durationMs,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
