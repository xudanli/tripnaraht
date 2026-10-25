// src/agent/services/agent-run-admin.service.ts
/**
 * Agent Run Admin Service
 * 
 * 用于后台管理 Agent 运行（TripRun）和尝试（TripAttempt）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostgreSQLMcpService } from '../../mcp/postgresql-mcp.service';
import { MemorySnapshotPersistenceService } from '../memory/persistence/memory-snapshot-persistence.service';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import {
  buildToolInvocationSummary,
  type ToolInvocationSummary,
} from './trip-run-tool-invocation.util';
import { resolveTripRunObservabilityFromStored } from './trip-run-observability.util';
import type { TripRunObservabilityV1 } from './trip-run-observability.util';
import {
  mergeTripRunFeedbackIntoMetadata,
  overlayFeedbackOntoObservability,
  type TripRunBehaviorInput,
  type TripRunFeedbackInput,
  type TripRunOutcomeEventInput,
} from './trip-run-feedback.util';
import {
  aggregateFailurePatterns,
  aggregatePolicyMetrics,
  compareDecisionObservability,
  loadObservabilityFromRun,
} from './agent-policy-optimization.util';
import { mergeBenchmarkIntoMetadata } from './trip-run-observability.util';

@Injectable()
export class AgentRunAdminService {
  private readonly logger = new Logger(AgentRunAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly postgresqlMcp?: PostgreSQLMcpService,
    @Optional() private readonly memorySnapshotPersistence?: MemorySnapshotPersistenceService,
  ) {}

  /**
   * 验证 UUID 格式
   * UUID 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 十六进制字符)
   */
  private isValidUUID(uuid: string): boolean {
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid.trim());
  }

  /**
   * 分页查询 TripRun 列表
   */
  async getRuns(filters: {
    tripId?: string;
    userId?: string;
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    planningPhase?: string;
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
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    // 验证并过滤无效的 UUID（如占位符 "trip-uuid", "user-uuid"）
    if (filters.tripId) {
      if (this.isValidUUID(filters.tripId)) {
        where.tripId = filters.tripId.trim();
      } else {
        this.logger.warn(`Invalid tripId format: ${filters.tripId}, ignoring filter`);
      }
    }
    if (filters.userId) {
      if (this.isValidUUID(filters.userId)) {
        where.userId = filters.userId.trim();
      } else {
        this.logger.warn(`Invalid userId format: ${filters.userId}, ignoring filter`);
      }
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.planningPhase) {
      where.planningPhase = filters.planningPhase;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const orderBy: any = {};
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    const total = await this.prisma.tripRun.count({ where });

    const runs = await this.prisma.tripRun.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        TripAttempt: {
          orderBy: { attemptNumber: 'desc' },
          take: 1, // 只取最新的 attempt
        },
        _count: {
          select: { TripAttempt: true },
        },
      },
    });

    const { tripMap, userMap } = await this.loadTripAndUserMaps(runs);
    const requestIds = runs.map((r) => {
      const meta = this.asRecord(r.metadata);
      return this.promoteRunMetadata(meta).requestId;
    });
    const [responseByRequestId, summaryByRequestId] = await Promise.all([
      this.loadResponsePreviewsByRequestIds(requestIds),
      this.loadAssistantSummaryJsonByRequestIds(requestIds),
    ]);

    const items = runs.map((run) => {
      const meta = this.asRecord(run.metadata);
      const promoted = this.promoteRunMetadata(meta);
      const latest = run.TripAttempt[0] || null;
      const durationSeconds = run.completedAt
        ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
        : null;
      const response = promoted.requestId
        ? responseByRequestId.get(promoted.requestId) ?? null
        : null;
      const tools = this.resolveToolInvocationForRun({
        meta,
        promoted,
        summaryJson: promoted.requestId
          ? summaryByRequestId.get(promoted.requestId) ?? null
          : null,
        attempts: run.TripAttempt,
      });
      const observability = overlayFeedbackOntoObservability(
        resolveTripRunObservabilityFromStored({
          metadata: meta,
          summaryJson: promoted.requestId
            ? summaryByRequestId.get(promoted.requestId) ?? null
            : null,
          userQuery: run.userQuery,
          status: run.status,
        }),
        meta,
      );

      return {
        id: run.id,
        tripId: run.tripId,
        userId: run.userId,
        userQuery: run.userQuery,
        planningPhase: run.planningPhase,
        currentAgent: run.currentAgent,
        status: run.status,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        startedAt: run.createdAt.toISOString(),
        metadata: meta,
        latestAttempt: latest
          ? {
              id: latest.id,
              attemptNumber: latest.attemptNumber,
              status: latest.status,
              createdAt: latest.createdAt.toISOString(),
              failureNotes: latest.failureNotes ?? null,
              resultSummary: latest.resultSummary ?? null,
            }
          : null,
        attemptCount: run._count.TripAttempt || 0,
        duration: durationSeconds,
        durationSeconds,
        latencyMs: promoted.latencyMs ?? (durationSeconds != null ? durationSeconds * 1000 : null),
        entryPoint: promoted.entryPoint,
        modeFinal: promoted.modeFinal,
        requestId: promoted.requestId,
        fallbackUsed: promoted.fallbackUsed,
        errorMessage: promoted.errorMessage,
        failureCode: promoted.failureCode,
        inputContext: promoted.inputContext,
        memorySummary: promoted.memorySummary,
        memorySnapshotId: promoted.memorySnapshotId,
        responsePreview: response?.preview ?? null,
        responseStatus: response?.resultStatus ?? null,
        skillsInvoked: tools.skillsInvoked,
        skillsInvokedCount: tools.skillsInvoked.length,
        mcpInvoked: tools.mcpInvoked,
        mcpInvokedCount: tools.mcpInvoked.length,
        toolCallsCount: tools.toolCallsCount,
        stepsExecuted: tools.stepsExecuted,
        toolInvocationSummary: tools.summary,
        toolsSource: tools.source,
        /** Decision OS 决策审计（列表摘要） */
        decisionSelected: observability?.decisionTrace?.finalDecision.selected ?? null,
        decisionReason: observability?.decisionTrace?.finalDecision.reason ?? null,
        decisionCompleteness: observability?.decisionCompleteness ?? null,
        evidenceBucket: observability?.evidenceTrace?.bucket ?? null,
        stepCount: observability?.steps?.length ?? tools.stepsExecuted.length,
        failure: observability?.failure ?? null,
        failureCategory: observability?.failure?.category ?? null,
        failureRecoverable: observability?.failure?.recoverable ?? null,
        qualityMetrics: observability?.qualityMetrics ?? null,
        feedback: observability?.feedback ?? null,
        behavior: observability?.behavior ?? null,
        feedbackRating: observability?.feedback?.rating ?? null,
        feedbackAccepted: observability?.feedback?.accepted ?? null,
        outcomeLatestEvent: observability?.outcome?.latestEvent ?? null,
        outcomeTrustSignal: observability?.outcome?.trustSignal ?? null,
        outcomeVerified: observability?.outcome?.verified ?? false,
        toolEfficiency: observability?.qualityMetrics?.toolEfficiency ?? null,
        benchmarkTaskId: observability?.benchmark?.taskId ?? null,
        benchmarkPass: observability?.benchmark?.pass ?? null,
        trip: run.tripId ? tripMap.get(run.tripId) ?? null : null,
        user: run.userId ? userMap.get(run.userId) ?? { userId: run.userId } : null,
      };
    });

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
   * 获取 TripRun 详情
   */
  async getRunById(runId: string): Promise<any | null> {
    // 验证 UUID 格式
    if (!this.isValidUUID(runId)) {
      this.logger.warn(`Invalid runId format: ${runId}`);
      return null;
    }

    const run = await this.prisma.tripRun.findUnique({
      where: { id: runId.trim() },
      include: {
        TripAttempt: {
          orderBy: { attemptNumber: 'asc' },
        },
      },
    });

    if (!run) {
      return null;
    }

    const { tripMap, userMap } = await this.loadTripAndUserMaps([run]);
    const meta = this.asRecord(run.metadata);
    const promoted = this.promoteRunMetadata(meta);
    const durationSeconds = run.completedAt
      ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
      : Math.floor((Date.now() - run.createdAt.getTime()) / 1000);

    const conversationTrail = await this.loadConversationTrail(promoted, run.tripId);
    const memorySnapshot = await this.loadMemorySnapshotForRun(promoted);
    const response = await this.loadRunResponse(promoted.requestId, conversationTrail);
    const summaryByRequestId = await this.loadAssistantSummaryJsonByRequestIds([
      promoted.requestId,
    ]);
    const tools = this.resolveToolInvocationForRun({
      meta,
      promoted,
      summaryJson: promoted.requestId
        ? summaryByRequestId.get(promoted.requestId) ?? null
        : null,
      attempts: run.TripAttempt,
    });
    const observability: TripRunObservabilityV1 | null = overlayFeedbackOntoObservability(
      resolveTripRunObservabilityFromStored({
        metadata: meta,
        summaryJson: promoted.requestId
          ? summaryByRequestId.get(promoted.requestId) ?? null
          : null,
        userQuery: run.userQuery,
        status: run.status,
      }),
      meta,
    );

    return {
      id: run.id,
      tripId: run.tripId,
      userId: run.userId,
      userQuery: run.userQuery,
      planningPhase: run.planningPhase,
      currentAgent: run.currentAgent,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      startedAt: run.createdAt.toISOString(),
      metadata: meta,
      attempts: run.TripAttempt.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        planOutline: attempt.planOutline,
        openQuestions: attempt.openQuestions || [],
        constraintsAssumed: attempt.constraintsAssumed || [],
        nextActions: attempt.nextActions || [],
        failureNotes: attempt.failureNotes,
        status: attempt.status,
        resultSummary: attempt.resultSummary,
        artifacts: attempt.artifacts || {},
        createdAt: attempt.createdAt.toISOString(),
        updatedAt: attempt.updatedAt.toISOString(),
        completedAt: attempt.completedAt?.toISOString() ?? null,
        metadata: attempt.metadata || {},
      })),
      attemptCount: run.TripAttempt.length,
      duration: durationSeconds,
      durationSeconds,
      latencyMs: promoted.latencyMs ?? durationSeconds * 1000,
      entryPoint: promoted.entryPoint,
      modeFinal: promoted.modeFinal,
      requestId: promoted.requestId,
      fallbackUsed: promoted.fallbackUsed,
      errorMessage: promoted.errorMessage,
      failureCode: promoted.failureCode,
      orchestratorRobustness: promoted.orchestratorRobustness,
      inputContext: promoted.inputContext,
      memorySummary: promoted.memorySummary,
      memorySnapshotId: promoted.memorySnapshotId,
      /** Redis TTL 内可取回的完整记忆快照（admin 调试）；过期则为 null */
      memorySnapshot,
      /** 会话消息轨迹（若有 conversation_id / request_id） */
      conversationTrail,
      /** Agent 返回内容（来自会话 ASSISTANT 消息；TripRun 本身不存全文） */
      response,
      skillsInvoked: tools.skillsInvoked,
      skillsInvokedCount: tools.skillsInvoked.length,
      mcpInvoked: tools.mcpInvoked,
      mcpInvokedCount: tools.mcpInvoked.length,
      toolCallsCount: tools.toolCallsCount,
      stepsExecuted: tools.stepsExecuted,
      toolInvocationSummary: tools.summary,
      toolsSource: tools.source,
      /** Decision OS：完整决策审计包 */
      observability,
      decisionCompleteness: observability?.decisionCompleteness ?? null,
      decisionTrace: observability?.decisionTrace ?? null,
      evidenceTrace: observability?.evidenceTrace ?? null,
      steps: observability?.steps ?? [],
      failure: observability?.failure ?? null,
      memoryTrace: observability?.memoryTrace ?? null,
      toolEvaluation: observability?.toolEvaluation ?? null,
      feedback: observability?.feedback ?? null,
      behavior: observability?.behavior ?? null,
      outcome: observability?.outcome ?? null,
      qualityMetrics: observability?.qualityMetrics ?? null,
      benchmark: observability?.benchmark ?? null,
      trip: run.tripId ? tripMap.get(run.tripId) ?? null : null,
      user: run.userId ? userMap.get(run.userId) ?? { userId: run.userId } : null,
    };
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private promoteRunMetadata(meta: Record<string, any>): {
    latencyMs: number | null;
    entryPoint: string | null;
    modeFinal: string | null;
    requestId: string | null;
    fallbackUsed: boolean | null;
    errorMessage: string | null;
    failureCode: string | null;
    orchestratorRobustness: Record<string, any> | null;
    inputContext: Record<string, any> | null;
    memorySummary: Record<string, any> | null;
    memorySnapshotId: string | null;
    skillsInvoked: string[];
    mcpInvoked: string[];
    toolCallsCount: number | null;
    stepsExecuted: string[];
    toolInvocationSummary: ToolInvocationSummary | null;
  } {
    const robustness =
      meta.orchestrator_robustness && typeof meta.orchestrator_robustness === 'object'
        ? (meta.orchestrator_robustness as Record<string, any>)
        : null;

    const errorMessage =
      (typeof meta.error === 'string' && meta.error) ||
      (typeof robustness?.message_preview === 'string' && robustness.message_preview) ||
      (typeof meta.errorMessage === 'string' && meta.errorMessage) ||
      null;

    const failureCode =
      (typeof robustness?.failure_code === 'string' && robustness.failure_code) ||
      (typeof meta.failure_code === 'string' && meta.failure_code) ||
      null;

    const latencyMs =
      typeof meta.latency_ms === 'number'
        ? meta.latency_ms
        : typeof meta.latencyMs === 'number'
          ? meta.latencyMs
          : null;

    const inputContext =
      meta.input_context && typeof meta.input_context === 'object'
        ? (meta.input_context as Record<string, any>)
        : null;

    const memorySummary =
      meta.memory_summary && typeof meta.memory_summary === 'object'
        ? (meta.memory_summary as Record<string, any>)
        : null;

    const memorySnapshotId =
      (typeof meta.memory_snapshot_id === 'string' && meta.memory_snapshot_id) ||
      (typeof memorySummary?.snapshot_id === 'string' && memorySummary.snapshot_id) ||
      null;

    const skillsInvoked = this.asStringArray(meta.skills_invoked ?? meta.skillsInvoked);
    const mcpInvoked = this.asStringArray(meta.mcp_invoked ?? meta.mcpInvoked);
    const stepsExecuted = this.asStringArray(meta.steps_executed ?? meta.stepsExecuted);
    const toolCallsCount =
      typeof meta.tool_calls_count === 'number'
        ? meta.tool_calls_count
        : typeof meta.toolCallsCount === 'number'
          ? meta.toolCallsCount
          : null;
    const toolInvocationSummary =
      meta.tool_invocation_summary && typeof meta.tool_invocation_summary === 'object'
        ? (meta.tool_invocation_summary as ToolInvocationSummary)
        : null;

    return {
      latencyMs,
      entryPoint:
        (typeof meta.entry_point === 'string' && meta.entry_point) ||
        (typeof meta.entryPoint === 'string' && meta.entryPoint) ||
        null,
      modeFinal:
        (typeof meta.mode_final === 'string' && meta.mode_final) ||
        (typeof meta.modeFinal === 'string' && meta.modeFinal) ||
        null,
      requestId:
        (typeof meta.request_id === 'string' && meta.request_id) ||
        (typeof meta.requestId === 'string' && meta.requestId) ||
        null,
      fallbackUsed:
        typeof meta.fallback_used === 'boolean'
          ? meta.fallback_used
          : typeof meta.fallbackUsed === 'boolean'
            ? meta.fallbackUsed
            : null,
      errorMessage,
      failureCode,
      orchestratorRobustness: robustness,
      inputContext,
      memorySummary,
      memorySnapshotId,
      skillsInvoked,
      mcpInvoked,
      toolCallsCount,
      stepsExecuted,
      toolInvocationSummary,
    };
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter((v): v is string => !!v),
      ),
    ];
  }

  private resolveToolInvocationForRun(args: {
    meta: Record<string, any>;
    promoted: ReturnType<AgentRunAdminService['promoteRunMetadata']>;
    summaryJson: unknown;
    attempts: Array<{ nextActions?: string[] | null; metadata?: unknown }>;
  }): {
    skillsInvoked: string[];
    mcpInvoked: string[];
    toolCallsCount: number | null;
    stepsExecuted: string[];
    summary: ToolInvocationSummary | null;
    source: string | null;
  } {
    const { meta, promoted, summaryJson, attempts } = args;

    if (
      promoted.toolInvocationSummary ||
      promoted.skillsInvoked.length ||
      promoted.mcpInvoked.length ||
      (promoted.toolCallsCount != null && promoted.toolCallsCount > 0)
    ) {
      return {
        skillsInvoked: promoted.skillsInvoked.length
          ? promoted.skillsInvoked
          : promoted.toolInvocationSummary?.skillNames ?? [],
        mcpInvoked: promoted.mcpInvoked.length
          ? promoted.mcpInvoked
          : promoted.toolInvocationSummary?.mcpNames ?? [],
        toolCallsCount:
          promoted.toolCallsCount ??
          promoted.toolInvocationSummary?.toolCallsCount ??
          null,
        stepsExecuted: promoted.stepsExecuted.length
          ? promoted.stepsExecuted
          : promoted.toolInvocationSummary?.stepsExecuted ?? [],
        summary: promoted.toolInvocationSummary,
        source: 'trip_run_metadata',
      };
    }

    const fromSummary = buildToolInvocationSummary(summaryJson);
    if (fromSummary) {
      return {
        skillsInvoked: fromSummary.skillNames,
        mcpInvoked: fromSummary.mcpNames,
        toolCallsCount: fromSummary.toolCallsCount,
        stepsExecuted: fromSummary.stepsExecuted,
        summary: fromSummary,
        source: 'conversation_summary_json',
      };
    }

    const fromMetaDeep = buildToolInvocationSummary(meta);
    if (fromMetaDeep) {
      return {
        skillsInvoked: fromMetaDeep.skillNames,
        mcpInvoked: fromMetaDeep.mcpNames,
        toolCallsCount: fromMetaDeep.toolCallsCount,
        stepsExecuted: fromMetaDeep.stepsExecuted,
        summary: fromMetaDeep,
        source: 'trip_run_metadata_scan',
      };
    }

    const attemptSkills = [
      ...new Set(
        attempts.flatMap((a) => this.asStringArray(a.nextActions)).filter(Boolean),
      ),
    ];
    if (attemptSkills.length) {
      return {
        skillsInvoked: attemptSkills,
        mcpInvoked: [],
        toolCallsCount: attemptSkills.length,
        stepsExecuted: attemptSkills,
        summary: null,
        source: 'trip_attempt_next_actions',
      };
    }

    return {
      skillsInvoked: [],
      mcpInvoked: [],
      toolCallsCount: null,
      stepsExecuted: [],
      summary: null,
      source: null,
    };
  }

  private async loadAssistantSummaryJsonByRequestIds(
    requestIds: Array<string | null>,
  ): Promise<Map<string, unknown>> {
    const ids = [...new Set(requestIds.filter((id): id is string => !!id))];
    const map = new Map<string, unknown>();
    if (ids.length === 0) return map;

    try {
      const messages = await this.prisma.agentConversationMessage.findMany({
        where: {
          requestId: { in: ids },
          role: 'ASSISTANT',
          NOT: { resultStatus: 'PROCESSING' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          requestId: true,
          summaryJson: true,
        },
      });
      for (const msg of messages) {
        if (!msg.requestId || map.has(msg.requestId) || msg.summaryJson == null) continue;
        map.set(msg.requestId, msg.summaryJson);
      }
    } catch (err: any) {
      this.logger.warn(`批量加载 summaryJson 失败: ${err?.message ?? err}`);
    }
    return map;
  }

  private async loadRunResponse(
    requestId: string | null,
    conversationTrail: Array<{
      id: string;
      role: string;
      content: string;
      requestId: string | null;
      createdAt: string;
    }> | null,
  ): Promise<{
    content: string;
    preview: string;
    resultStatus: string | null;
    deliveryVerdict: string | null;
    messageId: string | null;
    createdAt: string | null;
    source: string;
  } | null> {
    try {
      if (requestId) {
        const msg = await this.prisma.agentConversationMessage.findFirst({
          where: {
            requestId,
            role: 'ASSISTANT',
            NOT: { resultStatus: 'PROCESSING' },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            resultStatus: true,
            deliveryVerdict: true,
            createdAt: true,
            summaryJson: true,
          },
        });
        if (msg?.content) {
          const preview =
            msg.content.length > 200 ? `${msg.content.slice(0, 200)}…` : msg.content;
          return {
            content: msg.content,
            preview,
            resultStatus: msg.resultStatus,
            deliveryVerdict: msg.deliveryVerdict,
            messageId: msg.id,
            createdAt: msg.createdAt.toISOString(),
            source: 'agent_conversation_message',
          };
        }
      }

      const fromTrail = (conversationTrail || [])
        .filter((m) => m.role === 'ASSISTANT')
        .slice(-1)[0];
      if (fromTrail?.content) {
        const preview =
          fromTrail.content.length > 200
            ? `${fromTrail.content.slice(0, 200)}…`
            : fromTrail.content;
        return {
          content: fromTrail.content,
          preview,
          resultStatus: null,
          deliveryVerdict: null,
          messageId: fromTrail.id,
          createdAt: fromTrail.createdAt,
          source: 'conversation_trail',
        };
      }
    } catch (err: any) {
      this.logger.warn(`加载运行返回内容失败: ${err?.message ?? err}`);
    }
    return null;
  }

  private async loadResponsePreviewsByRequestIds(
    requestIds: Array<string | null>,
  ): Promise<
    Map<
      string,
      { preview: string; resultStatus: string | null }
    >
  > {
    const ids = [...new Set(requestIds.filter((id): id is string => !!id))];
    const map = new Map<string, { preview: string; resultStatus: string | null }>();
    if (ids.length === 0) return map;

    try {
      const messages = await this.prisma.agentConversationMessage.findMany({
        where: {
          requestId: { in: ids },
          role: 'ASSISTANT',
          NOT: { resultStatus: 'PROCESSING' },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          requestId: true,
          content: true,
          resultStatus: true,
        },
      });
      for (const msg of messages) {
        if (!msg.requestId || map.has(msg.requestId) || !msg.content) continue;
        map.set(msg.requestId, {
          preview: msg.content.length > 160 ? `${msg.content.slice(0, 160)}…` : msg.content,
          resultStatus: msg.resultStatus,
        });
      }
    } catch (err: any) {
      this.logger.warn(`批量加载返回预览失败: ${err?.message ?? err}`);
    }
    return map;
  }

  private async loadMemorySnapshotForRun(promoted: {
    memorySnapshotId: string | null;
    requestId: string | null;
  }): Promise<Record<string, unknown> | null> {
    if (!this.memorySnapshotPersistence) return null;
    try {
      let ctx: AgentMemoryContext | null = null;
      if (promoted.memorySnapshotId) {
        ctx = await this.memorySnapshotPersistence.loadBySnapshotId(promoted.memorySnapshotId);
      }
      if (!ctx && promoted.requestId) {
        ctx = await this.memorySnapshotPersistence.loadByRequestId(promoted.requestId);
      }
      if (!ctx) return null;
      return this.summarizeMemorySnapshotPayload(ctx);
    } catch (err: any) {
      this.logger.warn(`加载记忆快照失败: ${err?.message ?? err}`);
      return null;
    }
  }

  private summarizeMemorySnapshotPayload(ctx: AgentMemoryContext): Record<string, unknown> {
    return {
      snapshotId: ctx.snapshotId,
      snapshotVersion: ctx.snapshotVersion,
      requestId: ctx.requestId,
      userId: ctx.userId,
      tripId: ctx.tripId,
      loadedAt: ctx.loadedAt,
      layers: ctx.observability?.layers ?? [],
      userBasics: ctx.userBasics,
      travelPreference: ctx.travelPreference,
      routePartyProfile: ctx.routePartyProfile,
      recentDecisionsCount: ctx.recentDecisions?.length ?? 0,
      recentDecisionsPreview: (ctx.recentDecisions ?? []).slice(0, 5).map((d) => ({
        id: (d as any)?.id ?? null,
        routeDirectionId: (d as any)?.routeDirectionId ?? null,
        countryCode: (d as any)?.countryCode ?? null,
        decidedAt: (d as any)?.decidedAt ?? (d as any)?.createdAt ?? null,
      })),
      recentWorldDecisionsCount: ctx.recentWorldDecisions?.length ?? 0,
      hasActiveTripState: !!ctx.activeTripState,
      activeTripStateSummary: ctx.activeTripState
        ? {
            taskId: (ctx.activeTripState as any)?.taskId ?? null,
            status: (ctx.activeTripState as any)?.status ?? null,
            phase: (ctx.activeTripState as any)?.phase ?? null,
          }
        : null,
      failurePatterns: ctx.failurePatterns ?? [],
      recentTripFeedbacksCount: ctx.recentTripFeedbacks?.length ?? 0,
      hasDecisionLedger: !!ctx.decisionLedger,
      domainInfluenceDigest: ctx.domainInfluenceDigest,
      wishConstraintDigest: ctx.wishConstraintDigest
        ? {
            mustDoCount: (ctx.wishConstraintDigest as any)?.mustDo?.length ?? null,
            mustAvoidCount: (ctx.wishConstraintDigest as any)?.mustAvoid?.length ?? null,
          }
        : null,
      privateWishDigest: ctx.privateWishDigest
        ? { count: (ctx.privateWishDigest as any)?.items?.length ?? null }
        : null,
      decisionProfilingDigest: ctx.decisionProfilingDigest,
      negotiationDigest: ctx.negotiationDigest
        ? { hasActive: true }
        : null,
      available: true,
      source: 'redis_memory_snapshot',
    };
  }

  private async loadConversationTrail(
    promoted: {
      inputContext: Record<string, any> | null;
      requestId: string | null;
    },
    tripId: string | null,
  ): Promise<Array<{
    id: string;
    role: string;
    content: string;
    requestId: string | null;
    createdAt: string;
  }> | null> {
    try {
      const conversationId =
        (typeof promoted.inputContext?.conversation_id === 'string' &&
          promoted.inputContext.conversation_id) ||
        null;

      if (conversationId && this.isValidUUID(conversationId)) {
        const messages = await this.prisma.agentConversationMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
          take: 40,
          select: {
            id: true,
            role: true,
            content: true,
            requestId: true,
            createdAt: true,
          },
        });
        return messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content.length > 500 ? `${m.content.slice(0, 500)}…` : m.content,
          requestId: m.requestId,
          createdAt: m.createdAt.toISOString(),
        }));
      }

      if (promoted.requestId) {
        const byRequest = await this.prisma.agentConversationMessage.findMany({
          where: { requestId: promoted.requestId },
          orderBy: { createdAt: 'asc' },
          take: 20,
          select: {
            id: true,
            role: true,
            content: true,
            requestId: true,
            createdAt: true,
          },
        });
        if (byRequest.length > 0) {
          return byRequest.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content.length > 500 ? `${m.content.slice(0, 500)}…` : m.content,
            requestId: m.requestId,
            createdAt: m.createdAt.toISOString(),
          }));
        }
      }

      // 旧 run：无 input_context 时，用行程会话最近消息作参考（非本请求精确快照）
      if (tripId) {
        const conv = await this.prisma.agentConversation.findFirst({
          where: { tripId, scope: 'TRIP_SHARED' },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (conv) {
          const messages = await this.prisma.agentConversationMessage.findMany({
            where: { conversationId: conv.id },
            orderBy: { createdAt: 'desc' },
            take: 12,
            select: {
              id: true,
              role: true,
              content: true,
              requestId: true,
              createdAt: true,
            },
          });
          return messages
            .reverse()
            .map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content.length > 500 ? `${m.content.slice(0, 500)}…` : m.content,
              requestId: m.requestId,
              createdAt: m.createdAt.toISOString(),
            }));
        }
      }
    } catch (err: any) {
      this.logger.warn(`加载会话轨迹失败: ${err?.message ?? err}`);
    }
    return null;
  }

  private async loadTripAndUserMaps(
    runs: Array<{ tripId: string | null; userId: string | null }>,
  ): Promise<{
    tripMap: Map<string, { id: string; name: string | null; destination: string; status: string | null }>;
    userMap: Map<string, { userId: string; email: string | null; displayName: string | null; avatarUrl: string | null }>;
  }> {
    const tripIds = [
      ...new Set(runs.map((r) => r.tripId).filter((id): id is string => !!id && this.isValidUUID(id))),
    ];
    const userIds = [
      ...new Set(runs.map((r) => r.userId).filter((id): id is string => !!id && this.isValidUUID(id))),
    ];

    const [trips, users] = await Promise.all([
      tripIds.length > 0
        ? this.prisma.trip.findMany({
            where: { id: { in: tripIds } },
            select: { id: true, name: true, destination: true, status: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, displayName: true, avatarUrl: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      tripMap: new Map(
        trips.map((t) => [
          t.id,
          { id: t.id, name: t.name ?? null, destination: t.destination, status: t.status ?? null },
        ]),
      ),
      userMap: new Map(
        users.map((u) => [
          u.id,
          {
            userId: u.id,
            email: u.email ?? null,
            displayName: u.displayName ?? null,
            avatarUrl: u.avatarUrl ?? null,
          },
        ]),
      ),
    };
  }

  /**
   * 获取 TripRun 统计
   */
  async getRunStats(filters?: {
    startDate?: Date;
    endDate?: Date;
    planningPhase?: string;
  }): Promise<any> {
    const where: any = {};
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }
    if (filters?.planningPhase) {
      where.planningPhase = filters.planningPhase;
    }

    const total = await this.prisma.tripRun.count({ where });

    const byStatus = await this.prisma.tripRun.groupBy({
      by: ['status'],
      where,
      _count: true,
    });

    const byPhase = await this.prisma.tripRun.groupBy({
      by: ['planningPhase'],
      where,
      _count: true,
    });

    // 计算平均耗时
    const completedRuns = await this.prisma.tripRun.findMany({
      where: {
        ...where,
        status: 'COMPLETED',
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    });

    const durations = completedRuns
      .map(run => run.completedAt 
        ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
        : null
      )
      .filter((d): d is number => d !== null);

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      summary: {
        totalRuns: total,
        completedRuns: byStatus.find(s => s.status === 'COMPLETED')?._count || 0,
        failedRuns: byStatus.find(s => s.status === 'FAILED')?._count || 0,
        inProgressRuns: byStatus.find(s => s.status === 'IN_PROGRESS')?._count || 0,
        successRate: total > 0 
          ? (byStatus.find(s => s.status === 'COMPLETED')?._count || 0) / total
          : 0,
        avgDuration,
      },
      byStatus: byStatus.map(s => ({
        status: s.status,
        count: s._count,
        percentage: total > 0 ? (s._count / total) * 100 : 0,
      })),
      byPhase: byPhase.map(p => ({
        phase: p.planningPhase,
        count: p._count,
        percentage: total > 0 ? (p._count / total) * 100 : 0,
      })),
    };
  }

  /**
   * 分页查询 TripAttempt 列表
   */
  async getAttempts(filters: {
    tripRunId?: string;
    tripId?: string;
    userId?: string;
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
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
    const page = Number(filters.page) || 1;
    const limit = Math.min(Number(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.tripRunId) {
      if (this.isValidUUID(filters.tripRunId)) {
        where.tripRunId = filters.tripRunId.trim();
      } else {
        this.logger.warn(`Invalid tripRunId format: ${filters.tripRunId}, ignoring filter`);
      }
    }
    if (filters.status) {
      where.status = filters.status;
    }

    const runWhere: any = {};
    if (filters.tripId && this.isValidUUID(filters.tripId)) {
      runWhere.tripId = filters.tripId.trim();
    }
    if (filters.userId && this.isValidUUID(filters.userId)) {
      runWhere.userId = filters.userId.trim();
    }
    if (Object.keys(runWhere).length > 0) {
      where.TripRun = { is: runWhere };
    }

    const orderBy: any = {};
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    const total = await this.prisma.tripAttempt.count({ where });

    const attempts = await this.prisma.tripAttempt.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        TripRun: {
          select: {
            id: true,
            tripId: true,
            userId: true,
            userQuery: true,
            planningPhase: true,
            currentAgent: true,
            status: true,
            createdAt: true,
            completedAt: true,
            metadata: true,
          },
        },
      },
    });

    const { tripMap, userMap } = await this.loadTripAndUserMaps(
      attempts.map((a) => ({
        tripId: a.TripRun.tripId,
        userId: a.TripRun.userId,
      })),
    );

    const requestIds = attempts.map((a) => {
      const promoted = this.promoteRunMetadata(this.asRecord(a.TripRun.metadata));
      return promoted.requestId;
    });
    const responseByRequestId = await this.loadResponsePreviewsByRequestIds(requestIds);

    const items = attempts.map((attempt) => {
      const runMeta = this.asRecord(attempt.TripRun.metadata);
      const promoted = this.promoteRunMetadata(runMeta);
      const durationSeconds = attempt.completedAt
        ? Math.floor((attempt.completedAt.getTime() - attempt.createdAt.getTime()) / 1000)
        : null;
      const artifacts = this.asRecord(attempt.artifacts);
      const response = promoted.requestId
        ? responseByRequestId.get(promoted.requestId) ?? null
        : null;

      return {
        id: attempt.id,
        tripRunId: attempt.tripRunId,
        attemptNumber: attempt.attemptNumber,
        planOutline: attempt.planOutline,
        planOutlinePreview: this.truncateText(attempt.planOutline, 120),
        openQuestions: attempt.openQuestions || [],
        openQuestionsCount: (attempt.openQuestions || []).length,
        constraintsAssumed: attempt.constraintsAssumed || [],
        constraintsCount: (attempt.constraintsAssumed || []).length,
        nextActions: attempt.nextActions || [],
        skillsInvoked: attempt.nextActions || [],
        skillsInvokedCount: (attempt.nextActions || []).length,
        failureNotes: attempt.failureNotes,
        status: attempt.status,
        resultSummary: attempt.resultSummary,
        resultPreview: this.truncateText(attempt.resultSummary, 160),
        artifacts,
        artifactsSummary: this.summarizeArtifacts(artifacts),
        createdAt: attempt.createdAt.toISOString(),
        updatedAt: attempt.updatedAt.toISOString(),
        completedAt: attempt.completedAt?.toISOString() ?? null,
        startedAt: attempt.createdAt.toISOString(),
        metadata: this.asRecord(attempt.metadata),
        userAction:
          (typeof this.asRecord(attempt.metadata).userAction === 'string' &&
            this.asRecord(attempt.metadata).userAction) ||
          null,
        duration: durationSeconds,
        durationSeconds,
        latencyMs: durationSeconds != null ? durationSeconds * 1000 : null,
        responsePreview: response?.preview ?? null,
        responseStatus: response?.resultStatus ?? null,
        run: {
          id: attempt.TripRun.id,
          tripId: attempt.TripRun.tripId,
          userId: attempt.TripRun.userId,
          userQuery: attempt.TripRun.userQuery,
          userQueryPreview: this.truncateText(attempt.TripRun.userQuery, 120),
          planningPhase: attempt.TripRun.planningPhase,
          currentAgent: attempt.TripRun.currentAgent,
          status: attempt.TripRun.status,
          entryPoint: promoted.entryPoint,
          requestId: promoted.requestId,
          modeFinal: promoted.modeFinal,
          errorMessage: promoted.errorMessage,
        },
        trip: attempt.TripRun.tripId
          ? tripMap.get(attempt.TripRun.tripId) ?? null
          : null,
        user: attempt.TripRun.userId
          ? userMap.get(attempt.TripRun.userId) ?? { userId: attempt.TripRun.userId }
          : null,
      };
    });

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
   * 获取 TripAttempt 详情
   */
  async getAttemptById(attemptId: string): Promise<any | null> {
    if (!this.isValidUUID(attemptId)) {
      this.logger.warn(`Invalid attemptId format: ${attemptId}`);
      return null;
    }

    const attempt = await this.prisma.tripAttempt.findUnique({
      where: { id: attemptId.trim() },
      include: {
        TripRun: true,
      },
    });

    if (!attempt) {
      return null;
    }

    const { tripMap, userMap } = await this.loadTripAndUserMaps([
      { tripId: attempt.TripRun.tripId, userId: attempt.TripRun.userId },
    ]);
    const runMeta = this.asRecord(attempt.TripRun.metadata);
    const promoted = this.promoteRunMetadata(runMeta);
    const durationSeconds = attempt.completedAt
      ? Math.floor((attempt.completedAt.getTime() - attempt.createdAt.getTime()) / 1000)
      : Math.floor((Date.now() - attempt.createdAt.getTime()) / 1000);
    const artifacts = this.asRecord(attempt.artifacts);
    const attemptMeta = this.asRecord(attempt.metadata);

    const siblingCount = await this.prisma.tripAttempt.count({
      where: { tripRunId: attempt.tripRunId },
    });

    const conversationTrail = await this.loadConversationTrail(
      promoted,
      attempt.TripRun.tripId,
    );
    const response = await this.loadRunResponse(promoted.requestId, conversationTrail);
    const memorySnapshot = await this.loadMemorySnapshotForRun(promoted);

    return {
      id: attempt.id,
      tripRunId: attempt.tripRunId,
      attemptNumber: attempt.attemptNumber,
      planOutline: attempt.planOutline,
      openQuestions: attempt.openQuestions || [],
      openQuestionsCount: (attempt.openQuestions || []).length,
      constraintsAssumed: attempt.constraintsAssumed || [],
      constraintsCount: (attempt.constraintsAssumed || []).length,
      nextActions: attempt.nextActions || [],
      skillsInvoked: attempt.nextActions || [],
      skillsInvokedCount: (attempt.nextActions || []).length,
      failureNotes: attempt.failureNotes,
      status: attempt.status,
      resultSummary: attempt.resultSummary,
      artifacts,
      artifactsSummary: this.summarizeArtifacts(artifacts),
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
      startedAt: attempt.createdAt.toISOString(),
      metadata: attemptMeta,
      userAction: (typeof attemptMeta.userAction === 'string' && attemptMeta.userAction) || null,
      duration: durationSeconds,
      durationSeconds,
      latencyMs: durationSeconds * 1000,
      siblingAttemptCount: siblingCount,
      response,
      conversationTrail,
      memorySummary: promoted.memorySummary,
      memorySnapshotId: promoted.memorySnapshotId,
      memorySnapshot,
      inputContext: promoted.inputContext,
      run: {
        id: attempt.TripRun.id,
        tripId: attempt.TripRun.tripId,
        userId: attempt.TripRun.userId,
        userQuery: attempt.TripRun.userQuery,
        planningPhase: attempt.TripRun.planningPhase,
        currentAgent: attempt.TripRun.currentAgent,
        status: attempt.TripRun.status,
        createdAt: attempt.TripRun.createdAt.toISOString(),
        updatedAt: attempt.TripRun.updatedAt.toISOString(),
        completedAt: attempt.TripRun.completedAt?.toISOString() ?? null,
        entryPoint: promoted.entryPoint,
        requestId: promoted.requestId,
        modeFinal: promoted.modeFinal,
        fallbackUsed: promoted.fallbackUsed,
        errorMessage: promoted.errorMessage,
        failureCode: promoted.failureCode,
        latencyMs: promoted.latencyMs,
        metadata: runMeta,
      },
      trip: attempt.TripRun.tripId
        ? tripMap.get(attempt.TripRun.tripId) ?? null
        : null,
      user: attempt.TripRun.userId
        ? userMap.get(attempt.TripRun.userId) ?? { userId: attempt.TripRun.userId }
        : null,
    };
  }

  private truncateText(value: string | null | undefined, max: number): string | null {
    if (!value) return null;
    const s = String(value).trim();
    if (!s) return null;
    return s.length > max ? `${s.slice(0, max)}…` : s;
  }

  private summarizeArtifacts(artifacts: Record<string, any>): {
    keys: string[];
    keyCount: number;
    highlights: Record<string, unknown>;
  } {
    const keys = Object.keys(artifacts);
    const highlights: Record<string, unknown> = {};
    for (const key of keys.slice(0, 8)) {
      const val = artifacts[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>;
        highlights[key] = {
          optionCount: obj.optionCount ?? null,
          recommendation:
            obj.recommendation && typeof obj.recommendation === 'object'
              ? {
                  optionId: (obj.recommendation as any).optionId ?? null,
                  reason: this.truncateText((obj.recommendation as any).reason, 80),
                }
              : null,
          fieldCount: Object.keys(obj).length,
        };
      } else if (Array.isArray(val)) {
        highlights[key] = { arrayLength: val.length };
      } else {
        highlights[key] = { valuePreview: this.truncateText(String(val), 80) };
      }
    }
    return { keys, keyCount: keys.length, highlights };
  }

  /**
   * 写入用户反馈 / 行为信号到 TripRun.metadata（observability_v1.feedback / behavior）
   */
  async recordRunFeedback(
    runId: string,
    input: {
      feedback?: TripRunFeedbackInput | null;
      behavior?: TripRunBehaviorInput | null;
      outcomeEvent?: TripRunOutcomeEventInput | null;
      source?: string | null;
      decisionPointId?: string | null;
      userId?: string | null;
      context?: Record<string, unknown> | null;
    },
  ): Promise<{
    runId: string;
    feedback: NonNullable<TripRunObservabilityV1['feedback']>;
    behavior: NonNullable<TripRunObservabilityV1['behavior']>;
    outcome: NonNullable<TripRunObservabilityV1['outcome']>;
    updatedAt: string;
  } | null> {
    if (!this.isValidUUID(runId)) {
      this.logger.warn(`Invalid runId format: ${runId}`);
      return null;
    }

    const id = runId.trim();
    const existing = await this.prisma.tripRun.findUnique({
      where: { id },
      select: { id: true, metadata: true, userId: true },
    });
    if (!existing) return null;

    const source = input.source ?? 'api';
    const feedbackIn = input.feedback
      ? { ...input.feedback, source }
      : null;
    const behaviorIn = input.behavior
      ? { ...input.behavior, source }
      : null;
    const outcomeIn = input.outcomeEvent
      ? { ...input.outcomeEvent, source: input.outcomeEvent.source ?? source }
      : null;

    if (!feedbackIn && !behaviorIn && !outcomeIn) {
      throw new Error('feedback, behavior, or outcomeEvent is required');
    }

    const merged = mergeTripRunFeedbackIntoMetadata(existing.metadata, {
      feedback: feedbackIn,
      behavior: behaviorIn,
      outcomeEvent: outcomeIn,
    });

    await this.prisma.tripRun.update({
      where: { id },
      data: { metadata: merged.metadata as any },
    });

    // 旁路写入 RLHF 表（若表存在）；失败不影响主路径
    void this.persistRlhfMirror({
      tripRunId: id,
      userId: input.userId ?? existing.userId,
      decisionPointId: input.decisionPointId ?? 'run_feedback',
      feedback: feedbackIn ?? merged.feedback,
      behavior: behaviorIn ?? merged.behavior,
      context: {
        ...(input.context ?? {}),
        ...(outcomeIn ? { outcomeEvent: outcomeIn } : {}),
      },
    }).catch((err: any) =>
      this.logger.warn(`RLHF mirror persist skipped: ${err?.message ?? err}`),
    );

    return {
      runId: id,
      feedback: merged.feedback,
      behavior: merged.behavior,
      outcome: merged.outcome,
      updatedAt: merged.metadata.feedback_updated_at,
    };
  }

  /**
   * 写入 / 更新 Golden Set benchmark 结果
   */
  async recordRunBenchmark(
    runId: string,
    input: {
      taskId: string;
      pass?: boolean | null;
      score?: number | null;
      failedDimension?: string[];
    },
  ): Promise<{
    runId: string;
    benchmark: NonNullable<TripRunObservabilityV1['benchmark']>;
    updatedAt: string;
  } | null> {
    if (!this.isValidUUID(runId)) {
      this.logger.warn(`Invalid runId format: ${runId}`);
      return null;
    }
    const id = runId.trim();
    const existing = await this.prisma.tripRun.findUnique({
      where: { id },
      select: { id: true, metadata: true },
    });
    if (!existing) return null;

    const metadata = mergeBenchmarkIntoMetadata(existing.metadata, {
      taskId: input.taskId,
      pass: typeof input.pass === 'boolean' ? input.pass : null,
      score: typeof input.score === 'number' ? input.score : null,
      failedDimension: input.failedDimension ?? [],
    });

    await this.prisma.tripRun.update({
      where: { id },
      data: { metadata: metadata as any },
    });

    return {
      runId: id,
      benchmark: metadata.benchmark_v1,
      updatedAt: metadata.benchmark_updated_at,
    };
  }

  private async persistRlhfMirror(args: {
    tripRunId: string;
    userId?: string | null;
    decisionPointId: string;
    feedback?: TripRunFeedbackInput | null;
    behavior?: TripRunBehaviorInput | null;
    context: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date().toISOString();
    if (args.feedback) {
      let feedbackType = 'COMMENT';
      if (typeof args.feedback.rating === 'number') feedbackType = 'RATING';
      if (args.feedback.accepted === true) feedbackType = 'ACCEPT';
      if (args.feedback.accepted === false && args.feedback.modified !== true) {
        feedbackType = 'REJECT';
      }
      if (args.feedback.modified === true) feedbackType = 'MODIFY';

      const signalId = `fb_admin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await this.prisma.$executeRaw`
        INSERT INTO rlhf_feedback_signals (
          signal_id, trip_run_id, user_id, decision_point_id, feedback_type,
          rating, choice, modification, comment, context, timestamp
        )
        VALUES (
          ${signalId},
          ${args.tripRunId},
          ${args.userId || null},
          ${args.decisionPointId},
          ${feedbackType},
          ${args.feedback.rating ?? null},
          ${null},
          ${null}::jsonb,
          ${args.feedback.userCorrection ?? args.feedback.comment ?? null},
          ${JSON.stringify(args.context)}::jsonb,
          ${now}::timestamptz
        )
        ON CONFLICT (signal_id) DO NOTHING
      `;
    }

    if (args.behavior?.clickedRecommend === true) {
      const signalId = `beh_admin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await this.prisma.$executeRaw`
        INSERT INTO rlhf_behavior_signals (
          signal_id, trip_run_id, user_id, signal_type, element_type, element_id,
          element_context, duration_ms, scroll_depth, viewport_visible, timestamp
        )
        VALUES (
          ${signalId},
          ${args.tripRunId},
          ${args.userId || null},
          ${'CLICK'},
          ${'PLAN'},
          ${'recommend'},
          ${'admin_feedback_api'},
          ${null},
          ${null},
          ${null},
          ${now}::timestamptz
        )
        ON CONFLICT (signal_id) DO NOTHING
      `;
    }
  }

  /**
   * 取消 TripRun
   */
  async cancelRun(runId: string): Promise<boolean> {
    // 验证 UUID 格式
    if (!this.isValidUUID(runId)) {
      this.logger.warn(`Invalid runId format: ${runId}`);
      return false;
    }

    try {
      await this.prisma.tripRun.update({
        where: { id: runId.trim() },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          metadata: {
            cancelled: true,
            cancelledAt: new Date().toISOString(),
          },
        },
      });
      return true;
    } catch (error: any) {
      this.logger.error(`取消运行失败: ${error.message}`, error.stack);
      return false;
    }
  }

  /**
   * Outcome → Evaluation：聚合失败模式（驱动 Policy/Prompt 改进）
   */
  async getFailurePatterns(filters?: {
    startDate?: Date;
    endDate?: Date;
    patternId?: string;
    minCount?: number;
    limit?: number;
  }): Promise<{
    window: { start: string | null; end: string | null };
    totalRunsScanned: number;
    negativeRuns: number;
    patterns: ReturnType<typeof aggregateFailurePatterns>['patterns'];
  }> {
    const limit = Math.min(Math.max(filters?.limit ?? 500, 1), 2000);
    const where: any = {};
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const runs = await this.prisma.tripRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userQuery: true,
        status: true,
        currentAgent: true,
        metadata: true,
        createdAt: true,
      },
    });

    const agg = aggregateFailurePatterns(runs, {
      minCount: filters?.minCount ?? 1,
      patternId: filters?.patternId,
    });

    return {
      window: {
        start: filters?.startDate?.toISOString() ?? null,
        end: filters?.endDate?.toISOString() ?? null,
      },
      ...agg,
    };
  }

  /**
   * Agent / Tool / Memory 级 Policy Metrics
   */
  async getPolicyMetrics(filters?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<{
    window: { start: string | null; end: string | null };
    scanned: number;
    agents: ReturnType<typeof aggregatePolicyMetrics>['agents'];
    tools: ReturnType<typeof aggregatePolicyMetrics>['tools'];
    memory: ReturnType<typeof aggregatePolicyMetrics>['memory'];
  }> {
    const limit = Math.min(Math.max(filters?.limit ?? 500, 1), 2000);
    const where: any = {};
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const runs = await this.prisma.tripRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userQuery: true,
        status: true,
        currentAgent: true,
        metadata: true,
      },
    });

    const metrics = aggregatePolicyMetrics(runs);
    return {
      window: {
        start: filters?.startDate?.toISOString() ?? null,
        end: filters?.endDate?.toISOString() ?? null,
      },
      scanned: runs.length,
      ...metrics,
    };
  }

  /**
   * 对比两个已存在的 TripRun（无需重跑）
   */
  async compareRuns(sourceRunId: string, targetRunId: string): Promise<any | null> {
    if (!this.isValidUUID(sourceRunId) || !this.isValidUUID(targetRunId)) return null;
    const [a, b] = await Promise.all([
      this.prisma.tripRun.findUnique({
        where: { id: sourceRunId.trim() },
        select: {
          id: true,
          userQuery: true,
          status: true,
          currentAgent: true,
          metadata: true,
        },
      }),
      this.prisma.tripRun.findUnique({
        where: { id: targetRunId.trim() },
        select: {
          id: true,
          userQuery: true,
          status: true,
          currentAgent: true,
          metadata: true,
        },
      }),
    ]);
    if (!a || !b) return null;
    const before = loadObservabilityFromRun(a);
    const after = loadObservabilityFromRun(b);
    return {
      sourceRunId: a.id,
      targetRunId: b.id,
      compare: compareDecisionObservability(before, after),
      beforeSummary: {
        decisionSelected: before?.decisionTrace?.finalDecision.selected ?? null,
        completeness: before?.decisionCompleteness ?? null,
        outcome: before?.outcome ?? null,
      },
      afterSummary: {
        decisionSelected: after?.decisionTrace?.finalDecision.selected ?? null,
        completeness: after?.decisionCompleteness ?? null,
        outcome: after?.outcome ?? null,
      },
    };
  }

  /**
   * 获取性能分析
   */
  async getPerformanceAnalysis(filters?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<any> {
    const where: any = {
      status: 'COMPLETED',
      completedAt: { not: null },
    };

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const runs = await this.prisma.tripRun.findMany({
      where,
      select: {
        createdAt: true,
        completedAt: true,
        planningPhase: true,
        status: true,
      },
    });

    const durations = runs
      .map(run => run.completedAt 
        ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
        : null
      )
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        avgDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        minDuration: 0,
        maxDuration: 0,
        totalRuns: 0,
      };
    }

    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50Duration: durations[p50Index] || 0,
      p95Duration: durations[p95Index] || 0,
      p99Duration: durations[p99Index] || 0,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      totalRuns: durations.length,
    };
  }

  /**
   * 批量更新 TripRun 状态（使用 PostgreSQL MCP）
   */
  async batchUpdateRunStatus(
    runIds: string[],
    status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  ): Promise<number> {
    if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
      // 降级：逐个更新（较慢）
      this.logger.warn('PostgreSQL MCP service not available, falling back to individual updates');
      let updated = 0;
      for (const runId of runIds) {
        try {
          await this.prisma.tripRun.update({
            where: { id: runId },
            data: { status },
          });
          updated++;
        } catch (error: any) {
          this.logger.warn(`Failed to update run ${runId}: ${error.message}`);
        }
      }
      return updated;
    }

    try {
      const query = `
        UPDATE "TripRun"
        SET 
          status = $1,
          updated_at = NOW()
        WHERE id = ANY($2::uuid[])
      `;

      const result = await this.postgresqlMcp.execute(query, [status, runIds]);
      return result.rowCount || 0;
    } catch (error: any) {
      this.logger.error(`批量更新 TripRun 状态失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 清理过期的 TripRun（使用 PostgreSQL MCP）
   */
  async cleanupExpiredRuns(retentionDays: number = 90): Promise<number> {
    if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
      throw new Error('PostgreSQL MCP service not available for cleanup operation');
    }

    try {
      const query = `
        DELETE FROM "TripRun"
        WHERE status = 'COMPLETED'
          AND completed_at < NOW() - INTERVAL '${retentionDays} days'
      `;

      const result = await this.postgresqlMcp.execute(query);
      return result.rowCount || 0;
    } catch (error: any) {
      this.logger.error(`清理过期 TripRun 失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
