// src/trips/decision/services/decision-log-storage.service.ts
/**
 * Decision Log Storage Service（决策日志存储服务）
 * 
 * 负责将 DecisionLogEntry 写入数据库
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrometheusMetricsService } from '../../../monitoring/prometheus-metrics.service';
import { buildAxiomMatchContext } from '../../../agent/axioms/build-axiom-match-context.util';
import { matchAxioms, pickDominantAxiom } from '../../../agent/axioms/axiom-matchers';
import {
  analyzeDecisionLogTraceability,
  type DecisionLogTraceabilityResult,
} from '../contracts/decision-log-traceability.contract';
import {
  DecisionLogEntry,
  DecisionPersona,
  DecisionSource,
  DecisionStage,
  DecisionAction,
} from '../shared/decision-result.types';
import {
  extractJepaTraceFromMetadata,
  mergeMetadataWithJepaTrace,
} from '../shared/decision-trace-jepa.types';
import {
  mergeTriggeredAssertions,
  normalizeHardRuleSnapshot,
} from '../shared/hard-rule-snapshot.types';
import { deriveFactsFromMetadata } from '../shared/fact-derivation.util';
import { normalizeDecisionLogEntryForPersistence } from '../shared/decision-log-entry-normalize.util';

@Injectable()
export class DecisionLogStorageService {
  private readonly logger = new Logger(DecisionLogStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly promMetrics?: PrometheusMetricsService,
  ) {}

  /**
   * Best-effort: derive `metadata.assertions_triggered` from `metadata.details.evidence`.
   * This ensures QA/DPO mining works even when callers forget to write facts explicitly.
   */
  private enrichMetadataWithFacts(params: {
    metadata: Record<string, unknown>;
    entry: Pick<DecisionLogEntry, 'reasonCodes' | 'timestamp' | 'action'>;
  }): Record<string, unknown> {
    const meta = params.metadata ?? {};
    const existing = normalizeHardRuleSnapshot(meta).assertions_triggered;
    if (existing.length > 0) return meta;

    const facts = deriveFactsFromMetadata({
      metadata: meta,
      reasonCodes: params.entry.reasonCodes,
      timestampIso: params.entry.timestamp,
    });
    if (facts.length === 0) return meta;
    const merged = mergeTriggeredAssertions(meta, facts);
    return { ...meta, ...merged };
  }

  /** Map Prisma row → `DecisionLogEntry` (includes `metadata.jepaTrace` when present). */
  private mapRowToDecisionLogEntry(log: {
    persona: string;
    action: string;
    explanation: string;
    reasonCodes: string[];
    evidenceRefs: string[];
    timestamp: Date;
    decisionSource: string;
    decisionStage?: string | null;
    metadata?: unknown;
  }): DecisionLogEntry {
    const entry: DecisionLogEntry = {
      persona: log.persona as DecisionPersona,
      action: log.action as DecisionAction,
      explanation: log.explanation,
      reasonCodes: log.reasonCodes,
      evidenceRefs: log.evidenceRefs,
      timestamp: log.timestamp.toISOString(),
      decisionSource: log.decisionSource as DecisionSource,
      decisionStage: ((log as { decisionStage?: string }).decisionStage || 'FINALIZE') as DecisionStage,
    };
    if (log.metadata && typeof log.metadata === 'object') {
      entry.metadata = log.metadata as Record<string, unknown>;
    }
    const jt = extractJepaTraceFromMetadata(log.metadata);
    if (jt) {
      entry.jepaTrace = jt;
    }
    return entry;
  }

  /** 集成/预发：`DECISION_LOG_STRICT_WRITE=1` 时，traceability **errors** 将 **跳过** `create`/`createMany` */
  private isDecisionLogStrictWrite(): boolean {
    const v = process.env.DECISION_LOG_STRICT_WRITE;
    return v === '1' || v === 'true';
  }

  /**
   * TD-04：写入/读出时记录可追溯性结论；默认不阻断持久化（严格模式见 `isDecisionLogStrictWrite`）
   */
  private logTraceabilityAnalysis(
    entries: DecisionLogEntry[],
    phase: 'save' | 'read',
    tripHint?: string,
  ): DecisionLogTraceabilityResult {
    const r = analyzeDecisionLogTraceability(entries);
    if (r.errors.length === 0 && r.warnings.length === 0) {
      return r;
    }
    const hint = tripHint ? ` context=${tripHint}` : '';
    if (r.errors.length > 0) {
      const sample = r.errors.slice(0, 5).join('; ');
      this.logger.warn(
        `[TD-04][${phase}]${hint} ${r.errors.length} traceability error(s): ${sample}${r.errors.length > 5 ? '…' : ''}`,
      );
    }
    if (r.warnings.length > 0) {
      const sample = r.warnings.slice(0, 3).join('; ');
      this.logger.warn(
        `[TD-04][${phase}]${hint} ${r.warnings.length} traceability warning(s): ${sample}${r.warnings.length > 3 ? '…' : ''}`,
      );
    }
    return r;
  }

  /**
   * 验证 UUID 格式
   */
  private isValidUUID(str: string | null | undefined): boolean {
    if (!str) {
      return false;
    }
    // UUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * 保存单个决策日志条目
   */
  async saveLogEntry(
    entry: DecisionLogEntry,
    options?: {
      tripId?: string;
      countryCode?: string;
      routeDirectionId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const normalized = normalizeDecisionLogEntryForPersistence(entry);
      const tr = this.logTraceabilityAnalysis([normalized], 'save', options?.tripId);
      if (this.isDecisionLogStrictWrite() && tr.errors.length > 0) {
        this.logger.error(
          `[TD-04][save] DECISION_LOG_STRICT_WRITE: skip persist (${tr.errors.length} traceability error(s))`,
        );
        return;
      }

      // 验证 tripId 是否为有效的 UUID，如果不是则设置为 null
      const validTripId = options?.tripId && this.isValidUUID(options.tripId) 
        ? options.tripId 
        : null;

      // 如果 tripId 不是有效的 UUID，记录警告
      if (options?.tripId && !this.isValidUUID(options.tripId)) {
        this.logger.warn(
          `tripId "${options.tripId}" 不是有效的 UUID 格式，将设置为 null。` +
          `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        );
      }

      await this.prisma.decisionLog.create({
        data: {
          tripId: validTripId,
          countryCode: options?.countryCode,
          routeDirectionId: options?.routeDirectionId,
          persona: normalized.persona,
          action: normalized.action,
          decisionSource: normalized.decisionSource,
          decisionStage: normalized.decisionStage,
          explanation: normalized.explanation,
          reasonCodes: normalized.reasonCodes,
          evidenceRefs: normalized.evidenceRefs || [],
          timestamp: new Date(normalized.timestamp),
          metadata: mergeMetadataWithJepaTrace(
            this.enrichMetadataWithFacts({
              metadata: {
                ...(((options?.metadata as Record<string, unknown> | undefined) ?? undefined) || {}),
                ...((normalized.metadata ?? {}) as Record<string, unknown>),
              },
              entry: {
                reasonCodes: normalized.reasonCodes,
                timestamp: normalized.timestamp,
                action: normalized.action,
              },
            }),
            normalized.jepaTrace,
          ) as Prisma.InputJsonValue,
        },
      });
      this.logger.debug(`Saved decision log: ${normalized.persona} ${normalized.action} (${normalized.decisionSource})${validTripId ? ` for tripId: ${validTripId}` : ''}`);
    } catch (error) {
      this.logger.error(`Failed to save decision log: ${error}`, error instanceof Error ? error.stack : undefined);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 批量保存决策日志条目
   */
  async saveLogEntries(
    entries: DecisionLogEntry[],
    options?: {
      tripId?: string;
      countryCode?: string;
      routeDirectionId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    try {
      const normalizedEntries = entries.map((e) => normalizeDecisionLogEntryForPersistence(e));
      const tr = this.logTraceabilityAnalysis(normalizedEntries, 'save', options?.tripId);
      if (this.isDecisionLogStrictWrite() && tr.errors.length > 0) {
        this.logger.error(
          `[TD-04][save] DECISION_LOG_STRICT_WRITE: skip batch persist (${tr.errors.length} traceability error(s))`,
        );
        return;
      }

      // 验证 tripId 是否为有效的 UUID，如果不是则设置为 null
      const validTripId = options?.tripId && this.isValidUUID(options.tripId) 
        ? options.tripId 
        : null;

      // 如果 tripId 不是有效的 UUID，记录警告
      if (options?.tripId && !this.isValidUUID(options.tripId)) {
        this.logger.warn(
          `tripId "${options.tripId}" 不是有效的 UUID 格式，将设置为 null。` +
          `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
        );
      }

      await this.prisma.decisionLog.createMany({
        data: normalizedEntries.map((entry) => ({
          tripId: validTripId,
          countryCode: options?.countryCode,
          routeDirectionId: options?.routeDirectionId,
          persona: entry.persona,
          action: entry.action,
          decisionSource: entry.decisionSource,
          decisionStage: entry.decisionStage,
          explanation: entry.explanation,
          reasonCodes: entry.reasonCodes,
          evidenceRefs: entry.evidenceRefs || [],
          timestamp: new Date(entry.timestamp),
          metadata: mergeMetadataWithJepaTrace(
            this.enrichMetadataWithFacts({
              metadata: {
                ...(((options?.metadata as Record<string, unknown> | undefined) ?? undefined) || {}),
                ...((entry.metadata ?? {}) as Record<string, unknown>),
              },
              entry: { reasonCodes: entry.reasonCodes, timestamp: entry.timestamp, action: entry.action },
            }),
            entry.jepaTrace,
          ) as Prisma.InputJsonValue,
        })),
      });
      this.logger.debug(`Saved ${normalizedEntries.length} decision logs${validTripId ? ` for tripId: ${validTripId}` : ' (no tripId)'}`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to save decision logs: ${errMsg}`, stack);

      // Runtime Proof: audit persistence failure must not fail request nor kill process.
      // Emit a single structured event for Loki drill-down + increment a dedicated metric.
      try {
        const sample: any = entries?.[0] ?? {};
        const requestId =
          sample?.metadata?.route_and_run?.request_id ??
          sample?.metadata?.request_id ??
          sample?.metadata?.requestId ??
          undefined;
        const stage = 'decision_logs';
        const requestMessage =
          typeof (options as any)?.metadata?.request_message === 'string'
            ? String((options as any).metadata.request_message)
            : undefined;
        const ax = (() => {
          try {
            if (!requestMessage) return undefined;
            const matches = matchAxioms(buildAxiomMatchContext({ message: requestMessage }));
            return pickDominantAxiom(matches);
          } catch {
            return undefined;
          }
        })();
        const errorTypeRaw =
          typeof (error as any)?.code === 'string'
            ? String((error as any).code)
            : /23514/.test(errMsg)
              ? '23514'
              : 'UNKNOWN';
        const errorType = errorTypeRaw === '23514' ? 'DB_CHECK_CONSTRAINT' : errorTypeRaw;
        this.logger.warn(
          JSON.stringify({
            event: 'decision_os_audit_persist_failed',
            stage,
            request_id: requestId,
            trip_id: options?.tripId,
            axiom_id: ax?.axiom_id ?? 'UNKNOWN',
            cid: ax?.axiom.cid ?? 'UNKNOWN',
            error: errMsg,
            error_type: errorType,
          }),
        );
        this.promMetrics?.recordAuditPersistFailed({
          axiom_id: ax?.axiom_id,
          cid: ax?.axiom.cid,
          stage,
          error_type: errorType,
        });
      } catch {
        // best-effort
      }
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 查询决策日志
   */
  async queryLogs(filters: {
    tripId?: string;
    requestId?: string;
    countryCode?: string;
    routeDirectionId?: string;
    persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
    action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    decisionStage?: DecisionStage;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<DecisionLogEntry[]> {
    const where: any = {};

    // 验证 tripId 是否为有效的 UUID，如果不是则跳过该查询条件
    if (filters.tripId) {
      if (this.isValidUUID(filters.tripId)) {
        where.tripId = filters.tripId;
      } else {
        // Replay / request-bound reads may use requestId instead of a persisted trip UUID.
        this.logger.warn(
          `queryLogs: tripId "${filters.tripId}" 不是有效的 UUID 格式，将跳过该查询条件。` +
            `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`,
        );
        if (!filters.requestId) {
          return [];
        }
      }
    }
    if (filters.requestId) {
      where.metadata = {
        path: ['requestId'],
        equals: filters.requestId,
      };
    }
    if (filters.countryCode) {
      where.countryCode = filters.countryCode;
    }
    if (filters.routeDirectionId) {
      where.routeDirectionId = filters.routeDirectionId;
    }
    if (filters.persona) {
      where.persona = filters.persona;
    }
    if (filters.decisionSource) {
      where.decisionSource = filters.decisionSource;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.decisionStage) {
      where.decisionStage = filters.decisionStage;
    }
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    const logs = await this.prisma.decisionLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 1000,
    });

    const mapped = logs.map((log) => this.mapRowToDecisionLogEntry(log));

    this.logTraceabilityAnalysis(mapped, 'read', filters.tripId ?? filters.requestId);

    return mapped;
  }

  /**
   * 根据 ID 获取单个决策日志
   */
  async getLogById(logId: string): Promise<DecisionLogEntry | null> {
    try {
      const log = await this.prisma.decisionLog.findUnique({
        where: { id: logId },
      });

      if (!log) {
        return null;
      }

      const entry = this.mapRowToDecisionLogEntry(log);
      this.logTraceabilityAnalysis([entry], 'read', log.tripId ?? undefined);
      return entry;
    } catch (error: any) {
      this.logger.error(`获取决策日志失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 更新决策日志的元数据
   */
  async updateLogMetadata(
    logId: string,
    metadata: Record<string, any>,
  ): Promise<DecisionLogEntry> {
    try {
      // 先获取现有日志
      const existingLog = await this.prisma.decisionLog.findUnique({
        where: { id: logId },
      });

      if (!existingLog) {
        throw new Error(`决策日志 ${logId} 不存在`);
      }

      // 合并元数据
      const updatedMetadata = {
        ...((existingLog.metadata as Record<string, any>) || {}),
        ...metadata,
      };

      // 更新日志
      const updatedLog = await this.prisma.decisionLog.update({
        where: { id: logId },
        data: {
          metadata: updatedMetadata,
        },
      });

      const entry = this.mapRowToDecisionLogEntry(updatedLog);
      this.logTraceabilityAnalysis([entry], 'read', updatedLog.tripId ?? undefined);
      return entry;
    } catch (error: any) {
      this.logger.error(`更新决策日志元数据失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 将 DecisionLog + metadata 投影为 Admin 可读字段（列表/详情共用）。
   * 近年数据的细节多在 metadata（route_and_run / request_message / statistics），列字段如
   * availableOptions / confidenceLevel 多为空，需提升 metadata 才能「够详细」。
   */
  private asMetaRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private truncateText(value: string | null | undefined, max: number): string | null {
    if (!value) return null;
    const t = value.trim();
    if (!t) return null;
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  }

  private promoteDecisionLogAdminFields(
    log: {
      id: string;
      tripId: string | null;
      countryCode: string | null;
      routeDirectionId: string | null;
      persona: string;
      action: string;
      decisionSource: string;
      decisionStage: string;
      explanation: string;
      reasonCodes: string[];
      evidenceRefs: string[];
      timestamp: Date;
      metadata: unknown;
      availableOptions?: unknown;
      userChoice?: unknown;
      userReasoning?: string | null;
      confidenceLevel?: number | null;
      systemRecommendation?: unknown;
      alignmentScore?: number | null;
    },
    opts?: {
      trip?: {
        id: string;
        name: string | null;
        destination: string | null;
        status: string | null;
      } | null;
      outcomeCount?: number;
      outcomes?: unknown[];
      detail?: boolean;
    },
  ): Record<string, unknown> {
    const meta = this.asMetaRecord(log.metadata);
    const routeAndRun = this.asMetaRecord(meta.route_and_run);
    const statistics = this.asMetaRecord(meta.statistics);
    const requestMessage =
      typeof meta.request_message === 'string' ? meta.request_message : null;
    const durationMs =
      typeof meta.duration_ms === 'number'
        ? meta.duration_ms
        : typeof meta.durationMs === 'number'
          ? meta.durationMs
          : null;
    const requestId =
      (typeof meta.request_id === 'string' && meta.request_id) ||
      (typeof routeAndRun.request_id === 'string' && routeAndRun.request_id) ||
      null;
    const tripRunId =
      (typeof meta.tripRunId === 'string' && meta.tripRunId) ||
      (typeof meta.trip_run_id === 'string' && meta.trip_run_id) ||
      null;
    const step =
      (typeof routeAndRun.step === 'string' && routeAndRun.step) ||
      (typeof meta.step === 'string' && meta.step) ||
      null;
    const actor =
      (typeof routeAndRun.actor === 'string' && routeAndRun.actor) ||
      (typeof meta.actor === 'string' && meta.actor) ||
      null;
    const inputsSummary =
      typeof routeAndRun.inputs_summary === 'string' ? routeAndRun.inputs_summary : null;
    const outputsSummary =
      typeof routeAndRun.outputs_summary === 'string' ? routeAndRun.outputs_summary : null;
    const source =
      (typeof meta.source === 'string' && meta.source) || null;
    const planVersion =
      typeof meta.plan_version === 'number'
        ? meta.plan_version
        : typeof meta.planVersion === 'number'
          ? meta.planVersion
          : null;

    const contentKind: 'orchestration' | 'engine' =
      source === 'route_and_run' ? 'orchestration' : 'engine';

    const base: Record<string, unknown> = {
      id: log.id,
      tripId: log.tripId,
      countryCode: log.countryCode,
      routeDirectionId: log.routeDirectionId,
      persona: log.persona,
      action: log.action,
      decisionSource: log.decisionSource,
      decisionStage: log.decisionStage || 'FINALIZE',
      explanation: log.explanation,
      explanationPreview: this.truncateText(log.explanation, opts?.detail ? 2000 : 240),
      reasonCodes: log.reasonCodes || [],
      evidenceRefs: log.evidenceRefs || [],
      evidenceRefsCount: (log.evidenceRefs || []).length,
      timestamp: log.timestamp.toISOString(),
      confidenceLevel: log.confidenceLevel ?? null,
      alignmentScore: log.alignmentScore ?? null,
      /** orchestration=route_and_run 步骤；engine=更接近决策引擎 */
      contentKind,
      // 从 metadata 提升的观测字段
      source,
      requestId,
      tripRunId,
      durationMs,
      planVersion,
      step,
      actor,
      requestMessagePreview: this.truncateText(requestMessage, opts?.detail ? 4000 : 160),
      inputsSummaryPreview: this.truncateText(inputsSummary, opts?.detail ? 2000 : 160),
      outputsSummaryPreview: this.truncateText(outputsSummary, opts?.detail ? 2000 : 160),
      statistics: Object.keys(statistics).length > 0 ? statistics : null,
      cognitionMarker:
        typeof meta.cognition_marker === 'string' ? meta.cognition_marker : null,
      outcomeCount: opts?.outcomeCount ?? (opts?.outcomes?.length ?? 0),
      trip: opts?.trip
        ? {
            id: opts.trip.id,
            name: opts.trip.name,
            destination: opts.trip.destination,
            status: opts.trip.status,
          }
        : null,
    };

    if (opts?.detail) {
      base.requestMessage = requestMessage;
      base.inputsSummary = inputsSummary;
      base.outputsSummary = outputsSummary;
      base.routeAndRun = Object.keys(routeAndRun).length > 0 ? routeAndRun : null;
      base.availableOptions = log.availableOptions ?? null;
      base.userChoice = log.userChoice ?? null;
      base.userReasoning = log.userReasoning ?? null;
      base.systemRecommendation = log.systemRecommendation ?? null;
      base.outcomes = opts.outcomes ?? [];
      base.hallucinationAuditZh =
        typeof meta.hallucination_audit_zh === 'string'
          ? meta.hallucination_audit_zh
          : null;
      base.hallucinationDeliveryGate =
        meta.hallucination_delivery_gate_v1 ?? null;
      base.ebpStance = typeof meta.ebp_stance === 'string' ? meta.ebp_stance : null;
      base.conflictCount =
        typeof meta.conflict_count === 'number' ? meta.conflict_count : null;
      base.effectiveVoiceTone = meta.effective_voice_tone ?? null;
      base.metadata = meta;
      // 便于 Admin 跳转 Agent Run
      base.links = {
        tripRunAdminPath: tripRunId ? `/api/agent/admin/runs/${tripRunId}` : null,
        tripAdminPath: log.tripId ? `/api/trips/admin/${log.tripId}` : null,
      };
    } else {
      // 列表仍带精简 metadata，避免前端丢字段；大字段已提升到顶层
      base.metadata = {
        source,
        request_id: requestId,
        tripRunId,
        duration_ms: durationMs,
        plan_version: planVersion,
        step,
        actor,
        statistics: Object.keys(statistics).length > 0 ? statistics : undefined,
        cognition_marker: base.cognitionMarker,
      };
    }

    return base;
  }

  private async loadTripsForAdmin(
    tripIds: string[],
  ): Promise<
    Map<
      string,
      { id: string; name: string | null; destination: string | null; status: string | null }
    >
  > {
    const map = new Map<
      string,
      { id: string; name: string | null; destination: string | null; status: string | null }
    >();
    const cleaned = [...new Set(tripIds.filter((id) => typeof id === 'string' && id.trim()))];
    if (cleaned.length === 0) return map;
    try {
      const trips = await this.prisma.trip.findMany({
        where: { id: { in: cleaned } },
        select: { id: true, name: true, destination: true, status: true },
      });
      for (const t of trips) {
        map.set(t.id, {
          id: t.id,
          name: t.name ?? null,
          destination: t.destination ?? null,
          status: t.status ?? null,
        });
      }
    } catch (e: any) {
      this.logger.warn(`加载 DecisionLog 关联行程失败: ${e?.message ?? e}`);
    }
    return map;
  }

  /**
   * 分页查询决策日志（后台管理）
   */
  async queryLogsPaginated(filters: {
    tripId?: string;
    userId?: string; // 通过 tripId 关联查询
    persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
    action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    /** all | orchestration(route_and_run) | engine(非 route_and_run 或 PHYSICAL) */
    contentKind?: 'all' | 'orchestration' | 'engine';
    source?: string;
    excludeSource?: string;
    reasonCode?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    items: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.tripId) {
      where.tripId = filters.tripId;
    }
    if (filters.persona) {
      where.persona = filters.persona;
    }
    if (filters.decisionSource) {
      where.decisionSource = filters.decisionSource;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    if (filters.reasonCode?.trim()) {
      where.reasonCodes = { has: filters.reasonCode.trim() };
    }

    // metadata.source 精确 / 排除
    const sourceEquals = (value: string) => ({
      metadata: { path: ['source'], equals: value },
    });
    const sourceNotEquals = (value: string) => ({
      NOT: { metadata: { path: ['source'], equals: value } },
    });

    const contentKind = filters.contentKind ?? 'all';
    if (contentKind === 'orchestration') {
      Object.assign(where, sourceEquals('route_and_run'));
    } else if (contentKind === 'engine') {
      // 决策引擎向：非 route_and_run，或明确 PHYSICAL（路况/封闭等）
      where.AND = [
        ...(where.AND || []),
        {
          OR: [sourceNotEquals('route_and_run'), { decisionSource: 'PHYSICAL' }],
        },
      ];
    }

    if (filters.source?.trim()) {
      Object.assign(where, sourceEquals(filters.source.trim()));
    }
    if (filters.excludeSource?.trim()) {
      where.AND = [...(where.AND || []), sourceNotEquals(filters.excludeSource.trim())];
    }

    // DecisionLog 无 Trip 关系字段；按协作者 userId 先解析 tripId 再过滤
    if (filters.userId) {
      try {
        const collabs = await this.prisma.tripCollaborator.findMany({
          where: { userId: filters.userId },
          select: { tripId: true },
          take: 5000,
        });
        const tripIds = [...new Set(collabs.map((c) => c.tripId).filter(Boolean))];
        where.tripId = tripIds.length > 0 ? { in: tripIds } : '__no_match__';
      } catch (e: any) {
        this.logger.warn(`按 userId 过滤 DecisionLog 失败: ${e?.message ?? e}`);
        where.tripId = '__no_match__';
      }
    }

    // 排序
    const orderBy: any = {};
    const sortBy = filters.sortBy || 'timestamp';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    // 查询总数
    const total = await this.prisma.decisionLog.count({ where });

    // 查询数据（含 outcome 计数；DecisionLog 无 Trip 关系，行程另批查）
    const logs = await this.prisma.decisionLog.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        _count: { select: { outcomes: true } },
      },
    });

    const tripMap = await this.loadTripsForAdmin(
      logs.map((l) => l.tripId).filter((id): id is string => !!id),
    );

    const items = logs.map((log) =>
      this.promoteDecisionLogAdminFields(log, {
        trip: log.tripId ? tripMap.get(log.tripId) ?? null : null,
        outcomeCount: (log as any)._count?.outcomes ?? 0,
        detail: false,
      }),
    );

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取决策日志详情（包含完整信息）
   */
  async getLogDetailById(logId: string): Promise<any | null> {
    try {
      const log = await this.prisma.decisionLog.findUnique({
        where: { id: logId },
        include: {
          outcomes: true,
        },
      });

      if (!log) {
        return null;
      }

      const tripMap = await this.loadTripsForAdmin(log.tripId ? [log.tripId] : []);

      return this.promoteDecisionLogAdminFields(log, {
        trip: log.tripId ? tripMap.get(log.tripId) ?? null : null,
        outcomes: log.outcomes || [],
        outcomeCount: log.outcomes?.length ?? 0,
        detail: true,
      });
    } catch (error: any) {
      this.logger.error(`获取决策日志详情失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 查询原始决策日志（用于导出）
   */
  async queryRawLogs(filters: {
    tripId?: string;
    persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
    decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
    action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    const where: any = {};

    if (filters.tripId) {
      where.tripId = filters.tripId;
    }
    if (filters.persona) {
      where.persona = filters.persona;
    }
    if (filters.decisionSource) {
      where.decisionSource = filters.decisionSource;
    }
    if (filters.action) {
      where.action = filters.action;
    }
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }

    return await this.prisma.decisionLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters.limit || 10000,
    });
  }
}

