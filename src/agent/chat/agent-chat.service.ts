import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentService } from '../services/agent.service';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import {
  assertFlawedDraftNotSilentApply,
  canConfirmInTripShared,
  isItineraryAdjustApplyAllowed,
  normalizeTripCollaboratorRole,
} from './agent-chat-authz.util';
import { AgentChatEventsService } from './agent-chat-events.service';
import type {
  AgentChatScope,
  ApplyItineraryDraftDto,
  ConfirmAgentChatDto,
  CreateAgentConversationDto,
  PostAgentChatMessageDto,
} from './dto/agent-chat.dto';
import { enrichItineraryAdjustResultForChat } from './build-itinerary-adjust-chat-cta.util';
import {
  assembleConversationTurnResult,
  buildTeamNotifyAfterApply,
} from '../delivery/conversation';
import {
  listAgentChatBodyKeys,
  resolveAgentChatMessageText,
} from './resolve-agent-chat-message.util';
import { expandHotelFollowupAffirmation } from './expand-hotel-followup-affirmation.util';
import {
  ACTIVITY_BOOKING_CARDS_SCHEMA,
  buildActivityBookingChatCards,
  isActivityAdvanceBookingConsultQuery,
  mapActivitySearchItemsToChatCards,
  type ActivityBookingCard,
  type TripActivityBookingSeed,
} from './build-activity-booking-chat-cards.util';
import {
  RESTAURANT_CARDS_SCHEMA,
  buildRestaurantChatCards,
  isRestaurantChatCardQuery,
  mapPlacesRestaurantsToChatCards,
  type RestaurantChatCard,
} from './build-restaurant-chat-cards.util';
import {
  CAR_RENTAL_CARDS_SCHEMA,
  buildCarRentalChatCards,
  isCarRentalChatCardQuery,
  type CarRentalChatCard,
} from './build-car-rental-chat-cards.util';
import {
  FLIGHT_CARDS_SCHEMA,
  buildFlightChatCards,
  isFlightChatCardQuery,
  type FlightChatCard,
} from './build-flight-chat-cards.util';
import {
  XHS_NOTE_CARDS_SCHEMA,
  projectXhsNoteCardsFromUnknown,
  type XhsNoteChatCard,
} from './build-xhs-note-chat-cards.util';
import { formatDenseConsultationAnswerWithLineBreaks } from '../utils/lightweight-consultation-brevity.util';
import { randomUUID } from 'crypto';

type ConvRow = {
  id: string;
  scope: AgentChatScope;
  tripId: string | null;
  title: string | null;
  createdByUserId: string;
  lastMessageAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
};

@Injectable()
export class AgentChatService {
  private readonly logger = new Logger(AgentChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AgentChatEventsService,
    @Optional()
    @Inject(forwardRef(() => AgentService))
    private readonly agentService?: AgentService,
  ) {}

  private db() {
    const conversation = (this.prisma as any).agentConversation;
    const message = (this.prisma as any).agentConversationMessage;
    if (!conversation || !message) {
      throw new BadRequestException(
        'AGENT_CHAT_NOT_MIGRATED: run prisma migrate for agent_conversations',
      );
    }
    return { conversation, message };
  }

  async createConversation(
    userId: string,
    dto: CreateAgentConversationDto,
  ): Promise<ConvRow> {
    if (dto.scope === 'TRIP_SHARED') {
      if (!dto.trip_id?.trim()) {
        throw new BadRequestException('trip_id is required for TRIP_SHARED');
      }
      await this.assertTripMember(dto.trip_id, userId);
      return this.ensureTripShared(dto.trip_id, userId, dto.title);
    }

    const db = this.db();
    return db.conversation.create({
      data: {
        scope: 'PERSONAL',
        tripId: dto.trip_id?.trim() || null,
        title: dto.title ?? null,
        createdByUserId: userId,
      },
    });
  }

  async ensureTripShared(
    tripId: string,
    userId: string,
    title?: string,
  ): Promise<ConvRow> {
    await this.assertTripMember(tripId, userId);
    const db = this.db();
    const existing = await db.conversation.findFirst({
      where: { tripId, scope: 'TRIP_SHARED' },
    });
    if (existing) return existing;
    try {
      return await db.conversation.create({
        data: {
          scope: 'TRIP_SHARED',
          tripId,
          title: title ?? '团队行程对话',
          createdByUserId: userId,
        },
      });
    } catch (e: unknown) {
      const again = await db.conversation.findFirst({
        where: { tripId, scope: 'TRIP_SHARED' },
      });
      if (again) return again;
      throw e;
    }
  }

  async listMine(userId: string): Promise<ConvRow[]> {
    const db = this.db();
    return db.conversation.findMany({
      where: {
        OR: [
          { scope: 'PERSONAL', createdByUserId: userId },
          // PERSONAL with explicit visibility later; for now owner-only
        ],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 50,
    });
  }

  async listForTrip(tripId: string, userId: string): Promise<ConvRow[]> {
    await this.assertTripMember(tripId, userId);
    const db = this.db();
    return db.conversation.findMany({
      where: { tripId, scope: 'TRIP_SHARED' },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });
  }

  async listMessages(
    conversationId: string,
    userId: string,
    opts: { cursor?: string; limit?: number },
  ) {
    const conv = await this.getConversationForUser(conversationId, userId);
    const db = this.db();
    const limit = opts.limit ?? 50;
    let cursorCreatedAt: Date | undefined;
    if (opts.cursor) {
      const cur = await db.message.findUnique({ where: { id: opts.cursor } });
      if (cur?.conversationId === conversationId) {
        cursorCreatedAt = cur.createdAt;
      }
    }
    const rows = await db.message.findMany({
      where: {
        conversationId,
        ...(cursorCreatedAt ? { createdAt: { lt: cursorCreatedAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return {
      conversation: this.toConversationDto(conv),
      messages: rows.reverse().map((m: any) => this.toMessageDto(m)),
      next_cursor: rows.length === limit ? rows[0]?.id : null,
    };
  }

  /**
   * Persist user message → route_and_run (with conversation_id + scope) → persist assistant summary.
   * PERSONAL forces ADVICE_ONLY (no silent shared write).
   */
  async postMessage(
    conversationId: string,
    userId: string,
    dto: PostAgentChatMessageDto,
    rawBody?: unknown,
  ) {
    const conv = await this.getConversationForUser(conversationId, userId);
    if (!this.agentService) {
      throw new BadRequestException('AgentService unavailable');
    }

    const text =
      resolveAgentChatMessageText(rawBody) || resolveAgentChatMessageText(dto);
    if (!text) {
      const keys = [
        ...new Set([
          ...listAgentChatBodyKeys(rawBody),
          ...listAgentChatBodyKeys(dto),
        ]),
      ].sort();
      throw new BadRequestException(
        `message is required (also accepts text/content/body/prompt/query/user_message). received_keys=[${keys.join(',')}]`,
      );
    }
    dto.message = text;

    const requestId = dto.request_id?.trim() || `chat-${randomUUID()}`;
    const db = this.db();

    const userMsg = await db.message.create({
      data: {
        conversationId,
        role: 'USER',
        userId,
        displayName: dto.display_name ?? null,
        content: text,
        requestId,
      },
    });
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    this.events.publish({
      type: 'message.created',
      conversation_id: conversationId,
      at: new Date().toISOString(),
      actor_user_id: userId,
      payload: {
        message_id: userMsg.id,
        role: 'USER',
        preview: text.slice(0, 120),
      },
    });
    if (conv.scope === 'TRIP_SHARED') {
      this.events.publish({
        type: 'peer.activity',
        conversation_id: conversationId,
        at: new Date().toISOString(),
        actor_user_id: userId,
        payload: { kind: 'user_message', display_name: dto.display_name ?? null },
      });
    }

    const history = await this.buildRecentMessages(conversationId);
    /** 酒店邀筛后的「需要/好的」→ 显式库存检索，避免误入深规划 repair halt */
    const routeMessage = expandHotelFollowupAffirmation({
      message: text,
      recentMessages: history,
    });
    if (routeMessage !== text) {
      this.logger.log(
        `[agent-chat] hotel follow-up affirm expanded request_id=${requestId} raw=${JSON.stringify(text)} → ${JSON.stringify(routeMessage)}`,
      );
    }
    const executionMode = conv.scope === 'PERSONAL' ? 'ADVICE_ONLY' : 'ADVICE_ONLY';
    // TRIP_SHARED 也默认 ADVICE_ONLY；改排落库走 apply-itinerary-draft（角色门控），非 /confirm。
    // iOS chat 不传行程正文：有 trip_id 时声明 active_trip_summary，由 ContextEnricher 服务端注入摘要。
    const hasTrip = Boolean(conv.tripId?.trim());
    /**
     * 绑定 trip 的 chat 默认同步会跑 RAG+LLM，常 20–60s+；客户端超时后显示「网络不可用」，
     * 但服务端其实已落库成功。有 trip 时默认 FORCE 异步：秒回 task_id，经 SSE/poll 收结果。
     * 显式传入 async_mode 时仍尊重客户端。
     */
    const asyncMode = dto.async_mode ?? (hasTrip ? 'FORCE' : 'OFF');

    const req: RouteAndRunRequestDto = {
      request_id: requestId,
      user_id: userId,
      trip_id: conv.tripId,
      message: routeMessage,
      conversation_context: {
        recent_messages: history,
        locale: 'zh-CN',
        ...(hasTrip ? { context_type: 'active_trip_summary' as const } : {}),
      },
      meta: {
        conversation_id: conversationId,
      } as RouteAndRunRequestDto['meta'],
      options: {
        entry_point: 'agent_chat',
        execution_mode: executionMode,
        async_mode: asyncMode,
      },
    };

    let response: RouteAndRunResponseDto | null = null;
    let taskId: string | null = null;
    let asyncDelegated = false;

    try {
      if (asyncMode === 'FORCE') {
        const init = await this.agentService.routeAndRunAsync(req);
        taskId = init.task_id;
        asyncDelegated = true;
      } else {
        response = await this.agentService.routeAndRun(req);
        if (response.async_task?.task_id) {
          taskId = response.async_task.task_id;
          asyncDelegated = true;
          response = null;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`[agent-chat] route_and_run failed: ${msg}`);
      const errMsg = await db.message.create({
        data: {
          conversationId,
          role: 'SYSTEM',
          content: `AI 调用失败：${msg}`,
          requestId,
          resultStatus: 'FAILED',
        },
      });
      return {
        user_message: this.toMessageDto(userMsg),
        assistant_message: this.toMessageDto(errMsg),
        async_task: null,
        route_and_run: null,
      };
    }

    if (asyncDelegated && taskId) {
      const pending = await db.message.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: '正在规划中…',
          requestId,
          resultStatus: 'PROCESSING',
          taskId,
          summaryJson: { async: true },
        },
      });
      this.events.publish({
        type: 'ai.progress',
        conversation_id: conversationId,
        at: new Date().toISOString(),
        payload: { task_id: taskId, status: 'PROCESSING', message_id: pending.id },
      });
      return {
        user_message: this.toMessageDto(userMsg),
        assistant_message: this.toMessageDto(pending),
        async_task: { task_id: taskId, poll_path: `/api/agent/task/status/${taskId}` },
        route_and_run: null,
      };
    }

    const assistant = await this.persistAssistantFromResponse(
      conversationId,
      requestId,
      response!,
      undefined,
      { tripId: conv.tripId, userMessage: text, chatScope: conv.scope },
    );
    return {
      user_message: this.toMessageDto(userMsg),
      assistant_message: this.toMessageDto(assistant),
      async_task: null,
      route_and_run: {
        status: response!.result?.status,
        delivery_verdict:
          (response!.result?.payload as any)?.trusted_delivery_v1?.delivery_verdict ?? null,
        answer_text: response!.result?.answer_text,
      },
    };
  }

  /**
   * Finalize async task into an assistant message (called by client after SUCCESS poll,
   * or by RouteAndRunAsyncService worker hook).
   */
  async attachAsyncResult(
    conversationId: string,
    userId: string,
    taskId: string,
  ) {
    await this.getConversationForUser(conversationId, userId);
    if (!this.agentService) throw new BadRequestException('AgentService unavailable');
    const status = await this.agentService.getRouteAndRunTaskStatus(taskId);
    if (status.status === 'FAILED') {
      const assistant = await this.finalizeAsyncTaskFromWorker(taskId, {
        status: 'FAILED',
        error: status.error || status.message || '规划失败',
      });
      return assistant
        ? { ready: true, assistant_message: this.toMessageDto(assistant) }
        : { ready: false, task: status };
    }
    if (status.status !== 'SUCCESS' || !status.data) {
      return { ready: false, task: status };
    }
    const assistant = await this.finalizeAsyncTaskFromWorker(taskId, {
      status: 'SUCCESS',
      data: status.data as RouteAndRunResponseDto,
    });
    return assistant
      ? { ready: true, assistant_message: this.toMessageDto(assistant) }
      : { ready: false, task: status };
  }

  /**
   * Worker / client 共用：把 Durable Task 终态写回 chat 占位消息并推 SSE。
   * 无 PROCESSING 占位（非 agent-chat 发起的 task）时静默跳过。
   */
  async finalizeAsyncTaskFromWorker(
    taskId: string,
    outcome:
      | { status: 'SUCCESS'; data: RouteAndRunResponseDto }
      | { status: 'FAILED'; error: string },
  ): Promise<{ id: string; [key: string]: unknown } | null> {
    const tid = taskId?.trim();
    if (!tid) return null;
    const db = this.db();

    const already = await db.message.findFirst({
      where: {
        taskId: tid,
        role: 'ASSISTANT',
        resultStatus: { not: 'PROCESSING' },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (already) return already;

    const placeholder = await db.message.findFirst({
      where: { taskId: tid, role: 'ASSISTANT', resultStatus: 'PROCESSING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!placeholder) return null;

    if (outcome.status === 'SUCCESS') {
      const requestId =
        outcome.data.request_id ||
        placeholder.requestId ||
        `chat-async-${tid}`;
      const conv = await db.conversation.findUnique({
        where: { id: placeholder.conversationId },
        select: { tripId: true, scope: true },
      });
      const userMsg = placeholder.requestId
        ? await db.message.findFirst({
            where: {
              conversationId: placeholder.conversationId,
              requestId: placeholder.requestId,
              role: 'USER',
            },
            orderBy: { createdAt: 'desc' },
            select: { content: true },
          })
        : null;
      const row = await this.persistAssistantFromResponse(
        placeholder.conversationId,
        requestId,
        outcome.data,
        placeholder.id,
        {
          tripId: conv?.tripId ?? null,
          userMessage: userMsg?.content ?? null,
          chatScope: conv?.scope ?? null,
        },
      );
      this.events.publish({
        type: 'ai.progress',
        conversation_id: placeholder.conversationId,
        at: new Date().toISOString(),
        payload: {
          task_id: tid,
          status: 'SUCCESS',
          message_id: row.id,
        },
      });
      return row;
    }

    const errText = (outcome.error || '规划失败').trim() || '规划失败';
    const row = await db.message.update({
      where: { id: placeholder.id },
      data: {
        content: `AI 调用失败：${errText}`,
        resultStatus: 'FAILED',
      },
    });
    await db.conversation.update({
      where: { id: placeholder.conversationId },
      data: { lastMessageAt: new Date() },
    });
    this.events.publish({
      type: 'message.created',
      conversation_id: placeholder.conversationId,
      at: new Date().toISOString(),
      payload: {
        message_id: row.id,
        role: 'ASSISTANT',
        result_status: 'FAILED',
        delivery_verdict: null,
      },
    });
    this.events.publish({
      type: 'ai.progress',
      conversation_id: placeholder.conversationId,
      at: new Date().toISOString(),
      payload: {
        task_id: tid,
        status: 'FAILED',
        message_id: row.id,
        error: errText,
      },
    });
    this.logger.warn(
      `[agent-chat] async task failed → chat message task=${tid} conv=${placeholder.conversationId}`,
    );
    return row;
  }

  async confirm(
    conversationId: string,
    userId: string,
    dto: ConfirmAgentChatDto,
  ) {
    const conv = await this.getConversationForUser(conversationId, userId);
    if (conv.scope === 'PERSONAL') {
      throw new ForbiddenException(
        'PERSONAL_CHAT_NO_APPLY: upgrade to TRIP_SHARED team thread before confirming shared itinerary writes',
      );
    }
    if (!conv.tripId) {
      throw new BadRequestException('TRIP_SHARED conversation missing trip_id');
    }
    const role = await this.getTripRole(conv.tripId, userId);
    if (!canConfirmInTripShared(role)) {
      throw new ForbiddenException(
        `CONFIRM_FORBIDDEN: role=${role} cannot confirm in team chat`,
      );
    }
    if (!this.agentService) throw new BadRequestException('AgentService unavailable');

    const result = await this.agentService.confirmNegotiation({
      session_id: dto.session_id,
      alternative_id: dto.alternative_id,
      expected_negotiation_hash: dto.expected_negotiation_hash,
    });

    const db = this.db();
    const sys = await db.message.create({
      data: {
        conversationId,
        role: 'SYSTEM',
        userId,
        displayName: dto.display_name ?? null,
        content: `已确认协商：${result.resolution_patch_summary}`,
        resultStatus: 'CONFIRMED',
        summaryJson: {
          alternative_id: dto.alternative_id,
          session_id: dto.session_id,
        },
      },
    });
    this.events.publish({
      type: 'confirm.resolved',
      conversation_id: conversationId,
      at: new Date().toISOString(),
      actor_user_id: userId,
      payload: {
        message_id: sys.id,
        alternative_id: dto.alternative_id,
        summary: result.resolution_patch_summary,
      },
    });
    return { confirm: result, system_message: this.toMessageDto(sys) };
  }

  /**
   * 确认写入改排草案：TRIP_SHARED + 角色门控 → route_and_run(apply_itinerary_adjust_draft)。
   * 与 `/confirm`（Abu 协商）及 `decision_consent`（认知授权）无关。
   */
  async applyItineraryDraft(
    conversationId: string,
    userId: string,
    dto: ApplyItineraryDraftDto,
  ) {
    const conv = await this.getConversationForUser(conversationId, userId);
    const role = conv.tripId
      ? await this.getTripRole(conv.tripId, userId)
      : 'UNKNOWN';
    const gate = isItineraryAdjustApplyAllowed({
      scope: conv.scope,
      role,
      deliveryVerdict: null,
      applied: false,
    });
    if (gate.ok === false) {
      if (gate.reason.startsWith('PERSONAL') || gate.reason.startsWith('CONFIRM')) {
        throw new ForbiddenException(gate.reason);
      }
      throw new BadRequestException(gate.reason);
    }
    if (!conv.tripId) {
      throw new BadRequestException('TRIP_SHARED conversation missing trip_id');
    }
    if (!this.agentService) throw new BadRequestException('AgentService unavailable');

    const db = this.db();
    const draftMsg = await this.resolveItineraryAdjustDraftMessage(
      conversationId,
      dto,
    );
    const summary =
      draftMsg.summaryJson && typeof draftMsg.summaryJson === 'object'
        ? (draftMsg.summaryJson as Record<string, unknown>)
        : {};
    const adjust = (summary.itinerary_adjust_result ?? null) as Record<
      string,
      unknown
    > | null;
    if (!adjust) {
      throw new BadRequestException('NO_ITINERARY_ADJUST_DRAFT');
    }

    const deliveryVerdict =
      (typeof summary.delivery_verdict === 'string'
        ? summary.delivery_verdict
        : draftMsg.deliveryVerdict) ?? null;
    try {
      assertFlawedDraftNotSilentApply(deliveryVerdict);
    } catch {
      throw new ForbiddenException('FLAWED_DRAFT_FORBIDDEN');
    }
    if (adjust.applied === true) {
      throw new BadRequestException('ALREADY_APPLIED');
    }

    const applyGate = adjust.apply_gate as { can_apply?: boolean; deny_reason?: string } | undefined;
    if (applyGate && applyGate.can_apply === false) {
      throw new BadRequestException(
        `APPLY_NOT_ELIGIBLE:${applyGate.deny_reason ?? 'unknown'}`,
      );
    }

    const idempotencyKey =
      String(dto.idempotency_key ?? dto.draft_id ?? adjust.draft_id ?? '').trim() ||
      null;
    if (idempotencyKey) {
      const recentApply = await db.message.findMany({
        where: {
          conversationId,
          role: 'ASSISTANT',
          resultStatus: 'OK',
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      const prior = recentApply.find((m) => {
        const sj =
          m.summaryJson && typeof m.summaryJson === 'object'
            ? (m.summaryJson as Record<string, unknown>)
            : null;
        const ar = sj?.itinerary_adjust_apply_result as
          | { idempotency_key?: string; applied?: boolean }
          | undefined;
        return ar?.applied === true && String(ar.idempotency_key ?? '') === idempotencyKey;
      });
      if (prior) {
        return {
          applied: true,
          idempotent: true,
          assistant_message: this.toMessageDto(prior),
          itinerary_adjust_apply_result: (
            prior.summaryJson as Record<string, unknown> | null
          )?.itinerary_adjust_apply_result,
        };
      }
    }

    const snapshotFromDto = dto.apply_snapshot;
    const snapshotFromCard =
      (adjust.apply_snapshot as Record<string, unknown> | undefined) ??
      (adjust.primary_action as { params?: { apply_snapshot?: Record<string, unknown> } } | undefined)
        ?.params?.apply_snapshot;
    const snapshot = (snapshotFromDto ?? snapshotFromCard ?? null) as
      | {
          target_date_iso?: string;
          target_day_number?: number;
          apply_mode?: 'replace_day' | 'append_sparse_days';
          items?: Array<Record<string, unknown>>;
          days?: Array<Record<string, unknown>>;
        }
      | null;

    const targetDateIso = String(
      dto.target_date_iso ??
        snapshot?.target_date_iso ??
        adjust.target_date_iso ??
        '',
    ).slice(0, 10);
    if (!targetDateIso) {
      throw new BadRequestException('MISSING_TARGET_DATE');
    }

    const durableTripRunId =
      String(
        dto.durable_trip_run_id ??
          adjust.durable_trip_run_id ??
          '',
      ).trim() || undefined;

    const requestId = `chat-apply-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const req: RouteAndRunRequestDto = {
      request_id: requestId,
      user_id: userId,
      trip_id: conv.tripId,
      message: '应用到行程',
      meta: {
        conversation_id: conversationId,
      } as RouteAndRunRequestDto['meta'],
      options: {
        entry_point: 'agent_chat',
        execution_mode: 'ADVICE_ONLY',
        async_mode: 'OFF',
        apply_itinerary_adjust_draft: true,
        ...(durableTripRunId ? { durable_trip_run_id: durableTripRunId } : {}),
        itinerary_adjust_draft_snapshot: {
          target_date_iso: targetDateIso,
          ...(snapshot?.target_day_number != null || adjust.target_day_number != null
            ? {
                target_day_number: Number(
                  snapshot?.target_day_number ?? adjust.target_day_number,
                ),
              }
            : {}),
          apply_mode: snapshot?.apply_mode ?? 'replace_day',
          ...(Array.isArray(snapshot?.items) ? { items: snapshot!.items } : {}),
          ...(Array.isArray(snapshot?.days)
            ? {
                days: snapshot!.days as Array<{
                  date_iso: string;
                  day_number?: number;
                  items?: Array<Record<string, unknown>>;
                }>,
              }
            : {}),
        },
      },
    };

    const response = await this.agentService.routeAndRun(req);
    const payload = (response.result?.payload ?? {}) as Record<string, unknown>;
    const applyResult = (payload.itinerary_adjust_apply_result ??
      null) as Record<string, unknown> | null;
    const applied = applyResult?.applied === true;
    const answerText =
      String(
        applyResult?.answer_text ??
          response.result?.answer_text ??
          (applied ? '已写入行程。' : '未能写入行程。'),
      ).trim() || (applied ? '已写入行程。' : '未能写入行程。');

    const collaboratorIds =
      conv.tripId && applied
        ? (
            await this.prisma.tripCollaborator.findMany({
              where: { tripId: conv.tripId },
              select: { userId: true },
            })
          )
            .map((c) => c.userId)
            .filter((id) => id && id !== userId)
        : [];
    const teamNotify =
      applied && collaboratorIds.length
        ? buildTeamNotifyAfterApply({
            trip_id: String(conv.tripId),
            member_ids: collaboratorIds,
            change_summary_zh: String(
              applyResult?.summary_zh ?? `已更新 ${targetDateIso} 行程`,
            ),
            affected_dates_iso: [targetDateIso],
            plan_version_to:
              typeof (payload as any).plan_version === 'number'
                ? (payload as any).plan_version
                : null,
          })
        : null;

    const applyReceiptTurn = assembleConversationTurnResult({
      request_id: requestId,
      trip_id: conv.tripId,
      answer_text: answerText,
      result_status: response.result?.status ?? (applied ? 'OK' : 'FAILED'),
      delivery_verdict:
        (response.result?.payload as { trusted_delivery_v1?: { delivery_verdict?: string } })
          ?.trusted_delivery_v1?.delivery_verdict ?? undefined,
      prefer_primary: 'apply_receipt',
      apply: {
        applied,
        summary_zh: answerText,
        affected_dates_iso: [targetDateIso],
        draft_id: String(dto.draft_id ?? adjust.draft_id ?? ''),
        target_date_iso: targetDateIso,
        can_rollback: applied,
        itinerary_adjust_apply_result: applyResult,
        notified_member_ids: teamNotify?.notified_member_ids,
        changed_summary_zh: [
          String(applyResult?.summary_zh ?? `目标日 ${targetDateIso}`),
        ],
      },
      team: teamNotify
        ? {
            notify_member_ids: teamNotify.notify_member_ids,
            notify_summary_zh: teamNotify.notify_summary_zh,
            answer_text: teamNotify.notify_summary_zh,
          }
        : undefined,
    });

    const assistant = await db.message.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        userId,
        displayName: dto.display_name ?? null,
        content: answerText,
        requestId,
        resultStatus: response.result?.status ?? (applied ? 'OK' : 'FAILED'),
        deliveryVerdict:
          (response.result?.payload as { trusted_delivery_v1?: { delivery_verdict?: string } })
            ?.trusted_delivery_v1?.delivery_verdict ?? null,
        summaryJson: {
          intro: answerText,
          answer_text: answerText,
          text: answerText,
          schema_id: 'tripnara.conversation_turn_result@v1',
          ui_surface: 'conversation_turn',
          conversation_turn_result: applyReceiptTurn,
          itinerary_adjust_apply_result: {
            ...(applyResult ?? { applied, reason: 'unknown' }),
            ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
            draft_id: dto.draft_id ?? adjust.draft_id ?? null,
            target_date_iso: targetDateIso,
            source_message_id: draftMsg.id,
            ...(teamNotify
              ? {
                  notified_member_ids: teamNotify.notified_member_ids,
                  notify_summary_zh: teamNotify.notify_summary_zh,
                }
              : {}),
          },
        },
      },
    });
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // 标记原草案消息已应用，避免重复 CTA
    if (applied && draftMsg.id) {
      const nextSummary = {
        ...summary,
        itinerary_adjust_result: {
          ...adjust,
          applied: true,
          status_label_zh: '已更新行程',
          apply_gate: {
            can_apply: false,
            apply_path: `conversations/${conversationId}/apply-itinerary-draft`,
            deny_reason: 'already_applied',
            flawed_draft_forbidden: false,
          },
        },
      };
      await db.message.update({
        where: { id: draftMsg.id },
        data: { summaryJson: nextSummary },
      });
    }

    this.events.publish({
      type: 'message.created',
      conversation_id: conversationId,
      at: new Date().toISOString(),
      actor_user_id: userId,
      payload: {
        message_id: assistant.id,
        role: 'ASSISTANT',
        result_status: assistant.resultStatus,
        delivery_verdict: assistant.deliveryVerdict,
        intro: answerText,
        answer_text: answerText,
        ui_surface: 'itinerary_adjust_apply_result',
        itinerary_adjust_apply_result: (
          assistant.summaryJson as Record<string, unknown>
        )?.itinerary_adjust_apply_result,
        applied,
      },
    });

    return {
      applied,
      idempotent: false,
      assistant_message: this.toMessageDto(assistant),
      itinerary_adjust_apply_result: (
        assistant.summaryJson as Record<string, unknown>
      )?.itinerary_adjust_apply_result,
      route_and_run: {
        request_id: response.request_id,
        status: response.result?.status,
      },
    };
  }

  private async resolveItineraryAdjustDraftMessage(
    conversationId: string,
    dto: ApplyItineraryDraftDto,
  ) {
    const db = this.db();
    if (dto.message_id?.trim()) {
      const row = await db.message.findFirst({
        where: {
          id: dto.message_id.trim(),
          conversationId,
          role: 'ASSISTANT',
        },
      });
      if (!row) throw new NotFoundException('Draft message not found');
      return row;
    }
    const recent = await db.message.findMany({
      where: { conversationId, role: 'ASSISTANT' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const draftId = dto.draft_id?.trim();
    for (const m of recent) {
      const sj =
        m.summaryJson && typeof m.summaryJson === 'object'
          ? (m.summaryJson as Record<string, unknown>)
          : null;
      const adjust = sj?.itinerary_adjust_result as Record<string, unknown> | undefined;
      if (!adjust) continue;
      if (draftId && String(adjust.draft_id ?? '') !== draftId) continue;
      return m;
    }
    throw new NotFoundException('No itinerary_adjust_result draft in conversation');
  }

  // ── helpers ──────────────────────────────────────────────

  /** 从 route_and_run 响应提取住宿 MCP 卡片（payload 或 result 顶层） */
  private extractHotelCardsFromResponse(response: RouteAndRunResponseDto): {
    accommodations: Array<Record<string, unknown>>;
    hotel_search_meta: Record<string, unknown> | null;
    live_hotel_audit: { ok?: boolean; error?: string; latency_ms?: number } | null;
  } {
    const r = (response.result ?? {}) as Record<string, unknown>;
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    const accommodations = (
      Array.isArray(payload.accommodations)
        ? payload.accommodations
        : Array.isArray(r.accommodations)
          ? r.accommodations
          : []
    ) as Array<Record<string, unknown>>;
    const hotel_search_meta =
      (payload.hotel_search_meta as Record<string, unknown> | undefined) ??
      (r.hotel_search_meta as Record<string, unknown> | undefined) ??
      null;
    const auditRaw =
      (payload.unified_execution_trace as { live_sensor_audit?: unknown } | undefined)
        ?.live_sensor_audit ??
      r.live_sensor_audit;
    let live_hotel_audit: { ok?: boolean; error?: string; latency_ms?: number } | null = null;
    if (Array.isArray(auditRaw)) {
      const hit = auditRaw.find(
        (row) =>
          row &&
          typeof row === 'object' &&
          String((row as { tool_id?: string }).tool_id ?? '') === 'live_tool.mcp.hotel',
      ) as { ok?: boolean; error?: string; latency_ms?: number } | undefined;
      if (hit) live_hotel_audit = hit;
    }
    return { accommodations, hotel_search_meta, live_hotel_audit };
  }

  /** 卡片无管家文案时，用距离/锚点/评分拼一条简短推荐原因 */
  private buildFallbackRecommendReasonZh(card: Record<string, unknown>): string | undefined {
    const parts: string[] = [];
    const hint = String(card.itineraryHintZh ?? '').trim();
    const distance = String(card.distance_label_zh ?? '').trim();
    const stay = String(card.stayLabelZh ?? '').trim();
    const rating =
      typeof card.rating === 'number'
        ? card.rating
        : Number.isFinite(Number(card.rating))
          ? Number(card.rating)
          : undefined;
    if (hint) parts.push(hint);
    if (distance) parts.push(distance);
    if (rating != null && rating >= 4.5) parts.push(`评分 ${rating}，口碑较好`);
    else if (rating != null && rating >= 4) parts.push(`评分 ${rating}`);
    if (stay) parts.push(stay);
    if (!parts.length) return undefined;
    return `${parts.join('；')}。`;
  }

  /**
   * 规范化聊天用住宿卡片：中文展示字段 + 推荐原因，供 summary_json.accommodation_cards。
   */
  private normalizeChatAccommodationCards(
    accommodations: Array<Record<string, unknown>>,
  ): Array<Record<string, unknown>> {
    return accommodations.slice(0, 8).map((card, i) => {
      const name = String(
        card.nameCN ??
          card.nameZh ??
          card.name ??
          card.title ??
          card.label ??
          card.listing_name ??
          `房源 ${i + 1}`,
      ).trim();
      const price = String(
        card.priceLabel ??
          card.priceHint ??
          card.price_text ??
          card.priceText ??
          card.price ??
          (card.structuredDisplayPrice as { primaryLine?: { price?: string } } | undefined)
            ?.primaryLine?.price ??
          '',
      ).trim();
      const rating =
        typeof card.rating === 'number'
          ? card.rating
          : Number.isFinite(Number(card.rating))
            ? Number(card.rating)
            : undefined;
      const url = String(card.url ?? '').trim() || undefined;
      const appUrl = String(card.appUrl ?? '').trim() || undefined;
      const tbOpenUrl = String(card.tbOpenUrl ?? '').trim() || undefined;
      const webUrl = String(card.webUrl ?? '').trim() || undefined;
      const isFliggy =
        String(card.source ?? '') === 'fliggy' ||
        String(card.bookingProvider ?? '') === 'fliggy';
      // 飞猪唤端不稳定：全品类强制 H5
      const openStrategy = isFliggy
        ? ('web' as const)
        : card.openStrategy === 'app_then_web' || card.open_strategy === 'app_then_web'
          ? ('app_then_web' as const)
          : card.openStrategy === 'web' || card.open_strategy === 'web'
            ? ('web' as const)
            : undefined;
      const photos = Array.isArray(card.photos)
        ? card.photos.map((p) => String(p)).filter(Boolean)
        : [];
      const photoUrl =
        String(card.photoUrl ?? card.imageUrl ?? card.coverUrl ?? '').trim() ||
        (photos[0] ? String(photos[0]) : undefined);
      const address = String(card.address ?? card.areaHint ?? card.area ?? '').trim() || undefined;
      const distance = String(card.distance_label_zh ?? '').trim() || undefined;
      const stay = String(card.stayLabelZh ?? '').trim() || undefined;
      const checkIn = String(card.checkIn ?? '').slice(0, 10) || undefined;
      const checkOut = String(card.checkOut ?? '').slice(0, 10) || undefined;
      const itineraryHint = String(card.itineraryHintZh ?? '').trim() || undefined;
      const recommendReason =
        String(
          card.decision_support_zh ??
            card.recommendReasonZh ??
            card.推荐原因 ??
            '',
        ).trim() ||
        this.buildFallbackRecommendReasonZh({
          ...card,
          rating,
          stayLabelZh: stay,
          distance_label_zh: distance,
          itineraryHintZh: itineraryHint,
        });

      const fields_zh: Array<{ key: string; label: string; value: string }> = [];
      if (price) fields_zh.push({ key: 'price', label: '价格', value: price });
      if (rating != null) fields_zh.push({ key: 'rating', label: '评分', value: String(rating) });
      if (stay) fields_zh.push({ key: 'stay', label: '入住', value: stay });
      if (checkIn && checkOut) {
        fields_zh.push({ key: 'dates', label: '日期', value: `${checkIn} → ${checkOut}` });
      }
      if (distance) fields_zh.push({ key: 'distance', label: '距离', value: distance });
      if (itineraryHint) {
        fields_zh.push({ key: 'itinerary_hint', label: '行程锚点', value: itineraryHint });
      }
      if (address) fields_zh.push({ key: 'address', label: '位置', value: address });
      if (recommendReason) {
        fields_zh.push({ key: 'recommend_reason', label: '推荐原因', value: recommendReason });
      }
      const inventoryVerified =
        typeof card.inventoryVerified === 'boolean' ? card.inventoryVerified : undefined;
      const inventoryMode = String(card.inventoryMode ?? '').trim() || undefined;
      const availabilityDisclaimer =
        String(card.availabilityDisclaimerZh ?? '').trim() || undefined;
      if (inventoryMode === 'poi_catalog') {
        fields_zh.push({
          key: 'inventory',
          label: '可订性',
          value: '地点参考，未核验所选日期是否有房',
        });
      } else if (inventoryVerified === true) {
        fields_zh.push({ key: 'inventory', label: '可订性', value: '已粗探所选日期可订' });
      } else       if (availabilityDisclaimer) {
        fields_zh.push({ key: 'inventory', label: '可订性', value: availabilityDisclaimer });
      }

      const existingActions = Array.isArray(card.actions)
        ? (card.actions as Array<Record<string, unknown>>)
        : [];
      const hasAddAction = existingActions.some(
        (a) => String(a.action ?? '') === 'add_accommodation_to_itinerary',
      );
      const otaRef =
        card.otaRef &&
        typeof card.otaRef === 'object' &&
        String((card.otaRef as { provider?: string }).provider ?? '').trim() &&
        String((card.otaRef as { externalId?: string }).externalId ?? '').trim()
          ? {
              provider: String((card.otaRef as { provider: string }).provider).trim() as
                | 'fliggy'
                | 'airbnb'
                | 'google'
                | 'unknown',
              externalId: String((card.otaRef as { externalId: string }).externalId).trim(),
            }
          : isFliggy && String(card.id ?? '').trim()
            ? { provider: 'fliggy' as const, externalId: String(card.id).trim() }
            : undefined;
      const applySnapshot = {
        id: String(card.id ?? `acc-${i}`),
        source: card.source ?? 'airbnb',
        name,
        ...(url || webUrl ? { url: isFliggy ? webUrl || url : url } : {}),
        ...(!isFliggy && appUrl ? { appUrl } : {}),
        ...(webUrl || url ? { webUrl: webUrl || url } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        ...(price ? { priceLabel: price } : {}),
        ...(rating != null ? { rating } : {}),
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        ...(card.nightIndex != null ? { nightIndex: card.nightIndex } : {}),
        ...(typeof card.listing_lat === 'number' ? { listing_lat: card.listing_lat } : {}),
        ...(typeof card.listing_lng === 'number' ? { listing_lng: card.listing_lng } : {}),
        ...(address ? { address } : {}),
        ...(otaRef ? { otaRef } : {}),
        ...(recommendReason ? { decision_support_zh: recommendReason } : {}),
      };
      const viewPrimary = isFliggy
        ? webUrl || url
        : openStrategy === 'app_then_web'
          ? appUrl || tbOpenUrl || url || webUrl
          : webUrl || url;
      const actions = hasAddAction
        ? existingActions
        : [
            ...(viewPrimary
              ? [
                  {
                    action: 'view_accommodation',
                    label: 'View',
                    labelCN: isFliggy ? '去飞猪查看' : '查看',
                    params: {
                      accommodationIndex: i,
                      url: viewPrimary,
                      ...(!isFliggy &&
                      openStrategy === 'app_then_web' &&
                      appUrl
                        ? { appUrl }
                        : {}),
                      ...(!isFliggy &&
                      openStrategy === 'app_then_web' &&
                      tbOpenUrl
                        ? { tbOpenUrl }
                        : {}),
                      ...(webUrl || url
                        ? { webUrl: webUrl || url, fallback_url: webUrl || url }
                        : {}),
                      ...(openStrategy ? { open_strategy: openStrategy } : {}),
                    },
                  },
                ]
              : []),
            {
              action: 'add_accommodation_to_itinerary',
              label: 'Add to Trip',
              labelCN: '加入行程',
              params: { accommodationIndex: i, applySnapshot },
            },
          ];
      // 主 CTA：加入行程；飞猪「去飞猪查看」保留为次要 action
      const primaryAction =
        actions.find((a) => String(a.action) === 'add_accommodation_to_itinerary') ??
        actions.find((a) => String(a.action) === 'view_accommodation') ??
        actions[0];

      const {
        appUrl: _dropAppUrl,
        tbOpenUrl: _dropTbOpenUrl,
        ...cardWithoutAppSchemes
      } = card as Record<string, unknown>;
      return {
        ...(isFliggy ? cardWithoutAppSchemes : card),
        id: String(card.id ?? `acc-${i}`),
        name,
        nameZh: name,
        nameCN: name,
        ...(price ? { priceLabel: price, price, 价格: price } : {}),
        ...(rating != null ? { rating, 评分: rating } : {}),
        ...((isFliggy ? webUrl || url : url) ? { url: isFliggy ? webUrl || url : url } : {}),
        ...(!isFliggy && appUrl ? { appUrl } : {}),
        ...(!isFliggy && tbOpenUrl ? { tbOpenUrl } : {}),
        ...(openStrategy ? { openStrategy, open_strategy: openStrategy } : {}),
        ...(webUrl || url ? { webUrl: webUrl || url } : {}),
        ...(photoUrl ? { photoUrl, imageUrl: photoUrl, coverUrl: photoUrl } : {}),
        ...(photos.length ? { photos } : {}),
        ...(address ? { address, 位置: address } : {}),
        ...(distance ? { distance_label_zh: distance, 距离: distance } : {}),
        ...(stay ? { stayLabelZh: stay, 入住: stay } : {}),
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        ...(itineraryHint ? { itineraryHintZh: itineraryHint } : {}),
        ...(recommendReason
          ? {
              decision_support_zh: recommendReason,
              recommendReasonZh: recommendReason,
              推荐原因: recommendReason,
            }
          : {}),
        ...(inventoryVerified != null ? { inventoryVerified } : {}),
        ...(inventoryMode ? { inventoryMode } : {}),
        ...(availabilityDisclaimer
          ? { availabilityDisclaimerZh: availabilityDisclaimer }
          : {}),
        actions,
        cta_zh: String(primaryAction?.labelCN ?? '加入行程'),
        primary_action: primaryAction,
        fields_zh,
        field_labels_zh: {
          name: '名称',
          price: '价格',
          rating: '评分',
          stay: '入住',
          dates: '日期',
          distance: '距离',
          itinerary_hint: '行程锚点',
          address: '位置',
          recommend_reason: '推荐原因',
          inventory: '可订性',
          url: '查看 / 预订',
        },
        source: card.source ?? 'airbnb',
      };
    });
  }

  /**
   * 正文 Markdown 卡片块（无原生卡片 UI 时的降级）。
   * 有 accommodation_cards 时前端应只渲结构化卡片，勿再拼这段进主气泡。
   */
  private formatHotelCardsForChatContent(
    accommodations: Array<Record<string, unknown>>,
  ): string {
    const cards = this.normalizeChatAccommodationCards(accommodations);
    if (!cards.length) return '';
    const blocks = cards.map((card, i) => {
      const name = String(card.name ?? '房源');
      const lines: string[] = [`### ${i + 1}. ${name}`];
      const photoUrl = String(card.photoUrl ?? '').trim();
      if (photoUrl) {
        lines.push('', `![${name}](${photoUrl})`, '');
      }
      const meta: string[] = [];
      if (card.priceLabel || card.price) meta.push(`价格：${card.priceLabel || card.price}`);
      if (card.rating != null) meta.push(`评分：${card.rating}`);
      if (card.stayLabelZh) meta.push(String(card.stayLabelZh));
      if (card.checkIn && card.checkOut) {
        meta.push(`入住：${card.checkIn} → ${card.checkOut}`);
      }
      if (card.distance_label_zh) meta.push(String(card.distance_label_zh));
      if (card.address) meta.push(`位置：${card.address}`);
      const reason = String(
        card.recommendReasonZh ?? card.decision_support_zh ?? card.推荐原因 ?? '',
      ).trim();
      if (reason) meta.push(`推荐原因：${reason}`);
      if (meta.length) {
        lines.push(...meta.map((m) => `- ${m}`));
      }
      const url = String(card.url ?? '').trim();
      if (url) {
        lines.push(`- [查看 / 预订](${url})`);
      }
      return lines.join('\n');
    });
    return [
      '',
      '---',
      '',
      '## 实时可订住宿',
      '',
      ...blocks.flatMap((b, idx) => (idx === 0 ? [b] : ['', '---', '', b])),
      '',
    ].join('\n');
  }

  /**
   * 从策略正文剥离「实时可订住宿」等房源列表段，避免与下方卡片重复。
   */
  private stripHotelListingBlocksFromIntro(text: string): string {
    let t = String(text ?? '');
    t = t.replace(/\n*[-*]{0,3}\s*\n*##\s*实时可订住宿[\s\S]*$/u, '');
    t = t.replace(/##\s*实时可订住宿[\s\S]*$/u, '');
    t = t.replace(/【实时住宿检索\s*MCP】[\s\S]*$/u, '');
    t = t.replace(/\n*[-*]{0,3}\s*\n*###\s*\d+\.\s+[^\n]+[\s\S]*$/u, (block) => {
      // 仅当块内像房源列表（含图片/查看预订）时才剥掉
      if (/!\[|查看\s*\/\s*预订|airbnb\.com|maps\.google/i.test(block)) return '';
      return block;
    });
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  /** 策略正文：去掉空占位与房源列表，保证前端总能拿到可展示文案 */
  private resolveAssistantIntroText(
    response: RouteAndRunResponseDto,
    cardCount: number,
  ): string {
    const raw = this.stripHotelListingBlocksFromIntro(
      String(response.result?.answer_text ?? '').trim(),
    );
    if (raw && raw !== '(empty)') {
      return formatDenseConsultationAnswerWithLineBreaks(raw);
    }
    if (cardCount > 0) {
      return `按你的日期，找到 ${cardCount} 个住宿可选：`;
    }
    return '';
  }

  private async loadTripActivityBookingSeeds(
    tripId: string | null | undefined,
  ): Promise<{
    seeds: TripActivityBookingSeed[];
    destination?: string | null;
  }> {
    const tid = tripId?.trim();
    if (!tid) return { seeds: [] };
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tid },
        select: { destination: true },
      });
      const days = await this.prisma.tripDay.findMany({
        where: { tripId: tid },
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            orderBy: { order: 'asc' },
            include: { Place: { select: { nameCN: true, nameEN: true } } },
          },
        },
      });
      const seeds: TripActivityBookingSeed[] = [];
      days.forEach((d, idx) => {
        const dayNumber = idx + 1;
        const dayDate = d.date?.toISOString?.() ?? String(d.date ?? '');
        for (const it of d.ItineraryItem ?? []) {
          const name =
            it.Place?.nameCN ||
            it.Place?.nameEN ||
            String(it.note ?? '').trim() ||
            String(it.type ?? '');
          if (!name) continue;
          seeds.push({
            id: it.id,
            name,
            dayNumber,
            dayDate,
            bookingUrl: it.bookingUrl,
            bookingStatus: it.bookingStatus,
          });
        }
      });
      return { seeds, destination: trip?.destination ?? null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[agent-chat] loadTripActivityBookingSeeds failed: ${msg}`);
      return { seeds: [] };
    }
  }

  private async persistAssistantFromResponse(
    conversationId: string,
    requestId: string,
    response: RouteAndRunResponseDto,
    replaceMessageId?: string,
    opts?: {
      tripId?: string | null;
      userMessage?: string | null;
      chatScope?: string | null;
    },
  ) {
    const db = this.db();
    const status = response.result?.status ?? null;
    const verdict =
      (response.result?.payload as any)?.trusted_delivery_v1?.delivery_verdict ?? null;
    const hotel = this.extractHotelCardsFromResponse(response);
    const cards = this.normalizeChatAccommodationCards(hotel.accommodations);
    let intro = this.resolveAssistantIntroText(response, cards.length);
    const cardsMarkdown = cards.length ? this.formatHotelCardsForChatContent(cards) : '';
    /**
     * 主气泡只放策略文案；卡片走 summary_json.accommodation_cards。
     * 无原生卡片 UI 时，把 Markdown 卡片块拼进 content 作降级。
     */
    let text = intro;
    if (hotel.live_hotel_audit && hotel.live_hotel_audit.ok === false && !cards.length) {
      text = `${text || '暂时没有拉到可订房源。'}\n\n（实时住宿检索未成功${
        hotel.live_hotel_audit.error ? `：${String(hotel.live_hotel_audit.error).slice(0, 120)}` : ''
      }，以上为基于行程位置的建议。）`.trim();
    }

    const payload = (response.result?.payload ?? {}) as Record<string, unknown>;
    // 先预读改排草案：REPAIR 停机文案若盖住草案，主气泡改回改排说明，并放宽 status 便于前端画 CTA
    let statusOut: string | null = status;
    let verdictOut: string | null = verdict;
    const rawAdjustPreview =
      payload.itinerary_adjust_result && typeof payload.itinerary_adjust_result === 'object'
        ? (payload.itinerary_adjust_result as Record<string, unknown>)
        : null;
    if (rawAdjustPreview) {
      const chatAns = String(rawAdjustPreview.chat_answer_text_zh ?? '').trim();
      const bullets = Array.isArray(rawAdjustPreview.rationale_bullets_zh)
        ? (rawAdjustPreview.rationale_bullets_zh as unknown[])
            .map((b) => String(b ?? '').trim())
            .filter(Boolean)
        : [];
      const hasSchedule =
        Array.isArray(rawAdjustPreview.draft_schedule_zh) &&
        (rawAdjustPreview.draft_schedule_zh as unknown[]).some((l) => String(l ?? '').trim());
      const repairHaltNoise =
        /拆东墙补西墙|缩小范围|继续自动修复|自动修复后期望效用/i.test(text);
      if (hasSchedule && repairHaltNoise) {
        text = chatAns || (bullets.length ? bullets.join('\n') : text);
        if (statusOut === 'NEED_MORE_INFO') statusOut = 'OK';
        if (String(verdictOut ?? '').toUpperCase() === 'BLOCKED') {
          verdictOut = 'VERIFIED';
        }
      } else if (hasSchedule && chatAns && (!text || text === '(empty)' || repairHaltNoise)) {
        text = chatAns;
      }
    }
    const fromPayloadPriority = payload.booking_priority_list as
      | { items?: Array<Record<string, unknown>> }
      | undefined;
    const liveActivities = (
      Array.isArray(payload.activity_booking_cards)
        ? payload.activity_booking_cards
        : Array.isArray(payload.activities)
          ? payload.activities
          : []
    ) as Array<Record<string, unknown>>;
    let activityCards: ActivityBookingCard[] = [];
    const userMessage = String(opts?.userMessage ?? '').trim();
    const wantActivityCards =
      isActivityAdvanceBookingConsultQuery(userMessage) ||
      liveActivities.length > 0 ||
      /提前(?:预订|预定|预约)|必须提前|需提前购票|活动预订/i.test(text);
    if (!cards.length && liveActivities.length) {
      activityCards = mapActivitySearchItemsToChatCards(liveActivities);
    } else if (wantActivityCards && !cards.length) {
      const { seeds, destination } = await this.loadTripActivityBookingSeeds(
        opts?.tripId,
      );
      activityCards = buildActivityBookingChatCards({
        tripItems: seeds,
        answerText: text,
        userMessage,
        destination,
        countryCode: destination,
        countryName: destination,
      });
    } else if (
      Array.isArray(fromPayloadPriority?.items) &&
      fromPayloadPriority!.items!.length &&
      !cards.length
    ) {
      activityCards = fromPayloadPriority!.items!.slice(0, 6).map((it, i) => {
        const title = String(it.title ?? `预订项 ${i + 1}`);
        const url = String(
          (it.actionPayload as { officialBookingUrl?: string } | undefined)
            ?.officialBookingUrl ?? '',
        ).trim();
        return {
          id: String(it.id ?? `priority-${i}`),
          name: title,
          nameZh: title,
          category:
            String(it.category ?? '') === 'ATTRACTION_TICKET'
              ? ('ATTRACTION_TICKET' as const)
              : ('SPECIAL_EXPERIENCE' as const),
          url: url && url !== '#' ? url : 'https://www.google.com/search?q=' + encodeURIComponent(title),
          cta_zh: '去预订',
          associatedDayNumber:
            typeof it.associatedDayNumber === 'number' ? it.associatedDayNumber : undefined,
          urgencyZh: String(it.urgencyLevel ?? ''),
          fields_zh: [
            ...(typeof it.associatedDayNumber === 'number'
              ? [{ key: 'day', label: '行程日', value: `第${it.associatedDayNumber}天` }]
              : []),
            { key: 'link', label: '订票', value: '点击跳转' },
          ],
          field_labels_zh: { day: '行程日', link: '订票' },
        };
      });
    }

    const activitySearchMeta =
      (payload.activity_search_meta as Record<string, unknown> | undefined) ?? null;

    const liveRestaurants = (
      Array.isArray(payload.restaurant_cards)
        ? payload.restaurant_cards
        : Array.isArray(payload.restaurants)
          ? payload.restaurants
          : []
    ) as Array<Record<string, unknown>>;
    let restaurantCards: RestaurantChatCard[] = [];
    const wantRestaurantCards =
      !cards.length &&
      !activityCards.length &&
      (isRestaurantChatCardQuery(userMessage) ||
        liveRestaurants.length > 0 ||
        /推荐餐厅|找餐厅|吃什么|用餐/i.test(userMessage));
    if (wantRestaurantCards) {
      if (liveRestaurants.length && liveRestaurants[0]?.placeId) {
        restaurantCards = mapPlacesRestaurantsToChatCards(liveRestaurants);
      } else if (liveRestaurants.length && liveRestaurants[0]?.nameZh) {
        restaurantCards = liveRestaurants as unknown as RestaurantChatCard[];
      } else {
        restaurantCards = buildRestaurantChatCards({
          userMessage,
          answerText: text,
        });
      }
    }

    const liveCarRentals = (
      Array.isArray(payload.car_rental_cards)
        ? payload.car_rental_cards
        : Array.isArray(payload.car_rentals)
          ? payload.car_rentals
          : []
    ) as Array<Record<string, unknown>>;
    const carRentalSearchMeta =
      (payload.car_rental_search_meta as Record<string, unknown> | undefined) ?? null;
    const icelandRentalGuidance =
      payload.iceland_rental_guidance && typeof payload.iceland_rental_guidance === 'object'
        ? (payload.iceland_rental_guidance as Record<string, unknown>)
        : null;
    let carRentalCards: CarRentalChatCard[] = [];
    const wantCarRentalCards =
      !cards.length &&
      !activityCards.length &&
      !restaurantCards.length &&
      (isCarRentalChatCardQuery(userMessage) ||
        liveCarRentals.length > 0 ||
        /推荐租车|租车公司|车行推荐|哪家租车/i.test(userMessage));
    if (wantCarRentalCards) {
      // 一律走 build（补 priceLabel / reasonZh / fields_zh）；已成型卡会在 util 内透传
      carRentalCards = buildCarRentalChatCards({
        userMessage,
        answerText: text,
        bookingResults: liveCarRentals.length ? liveCarRentals : undefined,
        icelandRentalGuidance,
        carRentalSearchMeta,
      });
    }

    const liveFlightCards = (
      Array.isArray(payload.flight_cards) ? payload.flight_cards : []
    ) as Array<Record<string, unknown>>;
    const flightInventorySnapshot =
      payload.flight_inventory_snapshot && typeof payload.flight_inventory_snapshot === 'object'
        ? (payload.flight_inventory_snapshot as Record<string, unknown>)
        : null;
    let flightCards: FlightChatCard[] = [];
    const wantFlightCards =
      !cards.length &&
      !activityCards.length &&
      !restaurantCards.length &&
      !carRentalCards.length &&
      (isFlightChatCardQuery(userMessage) ||
        liveFlightCards.length > 0 ||
        flightInventorySnapshot != null);
    if (wantFlightCards) {
      flightCards = liveFlightCards.length
        ? buildFlightChatCards({
            flightInventorySnapshot: {
              legs: [{ sample_offers: liveFlightCards }],
            },
          })
        : buildFlightChatCards({ flightInventorySnapshot, limit: 6 });
    }

    const liveXhsNotes = (
      Array.isArray(payload.xhs_note_cards) ? payload.xhs_note_cards : []
    ) as Array<Record<string, unknown>>;
    let xhsSearchMeta =
      (payload.xhs_search_meta as Record<string, unknown> | undefined) ?? null;
    let xhsNoteCards: XhsNoteChatCard[] = [];
    if (liveXhsNotes.length && liveXhsNotes[0]?.url && liveXhsNotes[0]?.cta_zh) {
      xhsNoteCards = liveXhsNotes as unknown as XhsNoteChatCard[];
    } else {
      const projected = projectXhsNoteCardsFromUnknown({
        payload,
        agentic: payload.agentic_tool_loop_trace,
        research: (payload as { research_data?: unknown }).research_data,
      });
      xhsNoteCards = projected.xhs_note_cards;
      if (!xhsSearchMeta && projected.xhs_search_meta) {
        xhsSearchMeta = projected.xhs_search_meta as unknown as Record<string, unknown>;
      }
    }

    /**
     * 有结构化卡片时：content / text / intro 只放策略正文（卡片走 accommodation_cards）。
     * 无卡片 UI 的旧客户端可读 summary_json.cards_markdown。
     */
    const contentForStore = text || '(empty)';

    const negotiation = (response.result?.payload as any)?.negotiation_payload;
    const rawAdjust =
      payload.itinerary_adjust_result &&
      typeof payload.itinerary_adjust_result === 'object'
        ? (payload.itinerary_adjust_result as Record<string, unknown>)
        : null;
    const itineraryAdjustResult = rawAdjust
      ? enrichItineraryAdjustResultForChat({
          adjust: rawAdjust,
          payload,
          response: {
            request_id: response.request_id ?? requestId,
            result: response.result,
            observability: (response.observability ?? null) as Record<
              string,
              unknown
            > | null,
            durable: (response as { durable?: { trip_run_id?: string | null } })
              .durable,
          },
          conversationId,
          deliveryVerdict: verdictOut,
          chatScope: opts?.chatScope ?? null,
        })
      : null;

    /** 统一领域输出：优先 route_and_run 已投影；改排 enrich 后回填 change_draft */
    let conversationTurn =
      payload.conversation_turn_result &&
      typeof payload.conversation_turn_result === 'object'
        ? (payload.conversation_turn_result as Record<string, unknown>)
        : null;
    if (itineraryAdjustResult && conversationTurn) {
      conversationTurn = assembleConversationTurnResult({
        request_id: requestId,
        trip_id: (payload.trip_id as string) ?? null,
        answer_text: text,
        result_status: statusOut,
        delivery_verdict: verdictOut,
        lifecycle: (conversationTurn as any).lifecycle,
        context: (conversationTurn as any).context,
        itinerary_adjust: { enriched_adjust: itineraryAdjustResult },
        data_lookup: { answer_text: text },
        prefer_primary: 'change_draft',
      }) as any;
    } else if (itineraryAdjustResult && !conversationTurn) {
      conversationTurn = assembleConversationTurnResult({
        request_id: requestId,
        trip_id: (payload.trip_id as string) ?? null,
        answer_text: text,
        result_status: statusOut,
        delivery_verdict: verdictOut,
        itinerary_adjust: { enriched_adjust: itineraryAdjustResult },
        prefer_primary: 'change_draft',
      }) as any;
    }

    const uiSurface = cards.length
      ? 'accommodation_cards'
      : activityCards.length
        ? 'activity_booking_cards'
        : restaurantCards.length
          ? 'restaurant_cards'
          : carRentalCards.length
            ? 'car_rental_cards'
            : flightCards.length
              ? 'flight_cards'
              : xhsNoteCards.length
                ? 'xhs_note_cards'
                : itineraryAdjustResult
                  ? 'itinerary_adjust_result'
                  : conversationTurn
                    ? 'conversation_turn'
                    : undefined;
    const data = {
      conversationId,
      role: 'ASSISTANT' as const,
      content: contentForStore,
      requestId,
      resultStatus: statusOut,
      deliveryVerdict: verdictOut,
      summaryJson: {
        delivery_verdict: verdictOut,
        negotiation_session_id: negotiation?.negotiation_session_id ?? null,
        expected_negotiation_hash: negotiation?.expected_negotiation_hash ?? null,
        ...(conversationTurn ||
        carRentalCards.length ||
        flightCards.length ||
        cards.length ||
        activityCards.length ||
        xhsNoteCards.length
          ? {
              schema_id: conversationTurn
                ? 'tripnara.conversation_turn_result@v1'
                : flightCards.length &&
                    !cards.length &&
                    !activityCards.length &&
                    !carRentalCards.length &&
                    !xhsNoteCards.length
                  ? FLIGHT_CARDS_SCHEMA
                  : carRentalCards.length &&
                      !cards.length &&
                      !activityCards.length &&
                      !xhsNoteCards.length
                    ? CAR_RENTAL_CARDS_SCHEMA
                    : xhsNoteCards.length &&
                        !cards.length &&
                        !activityCards.length &&
                        !carRentalCards.length &&
                        !flightCards.length
                      ? XHS_NOTE_CARDS_SCHEMA
                      : 'tripnara.conversation_turn_result@v1',
              conversation_turn_result: {
                ...(conversationTurn && typeof conversationTurn === 'object'
                  ? conversationTurn
                  : {
                      schema_id: 'tripnara.conversation_turn_result@v1',
                      answer_text: text,
                      primary_card: 'trip_fact',
                      cards: [],
                      actions: [],
                    }),
                ...(cards.length
                  ? {
                      accommodation_cards: cards,
                      accommodations: cards,
                    }
                  : {}),
                ...(activityCards.length
                  ? { activity_booking_cards: activityCards }
                  : {}),
                ...(carRentalCards.length
                  ? {
                      car_rental_cards: carRentalCards,
                      car_rentals: carRentalCards,
                      ui_surface: 'car_rental_cards',
                      ...(carRentalSearchMeta
                        ? { car_rental_search_meta: carRentalSearchMeta }
                        : {}),
                    }
                  : {}),
                ...(flightCards.length
                  ? {
                      flight_cards: flightCards,
                      ui_surface: 'flight_cards',
                      ...(flightInventorySnapshot
                        ? { flight_inventory_snapshot: flightInventorySnapshot }
                        : {}),
                    }
                  : {}),
                ...(xhsNoteCards.length
                  ? {
                      xhs_note_cards: xhsNoteCards,
                      ui_surface: uiSurface ?? 'xhs_note_cards',
                      ...(xhsSearchMeta ? { xhs_search_meta: xhsSearchMeta } : {}),
                    }
                  : {}),
              },
            }
          : {}),
        /** 前端补读文案：优先这些字段，勿只依赖 accommodation_cards */
        ...(text
          ? {
              intro: text,
              summary: text,
              answer_text: text,
              markdown: text,
              text,
            }
          : {}),
        ...(cards.length
          ? {
              schema_id: 'tripnara/chat_accommodation_cards@v1',
              ui_surface: 'accommodation_cards',
              /** 结构化卡片：前端优先渲染；主文案用上面的 intro/answer_text */
              accommodation_cards: cards,
              accommodations: cards,
              hotel_search_meta: hotel.hotel_search_meta,
              ...(cardsMarkdown ? { cards_markdown: cardsMarkdown } : {}),
            }
          : {}),
        ...(activityCards.length
          ? {
              ...(cards.length
                ? {}
                : {
                    schema_id: ACTIVITY_BOOKING_CARDS_SCHEMA,
                    ui_surface: 'activity_booking_cards',
                  }),
              activity_booking_cards: activityCards,
              ...(activitySearchMeta ? { activity_search_meta: activitySearchMeta } : {}),
            }
          : {}),
        ...(restaurantCards.length
          ? {
              ...(cards.length || activityCards.length
                ? {}
                : {
                    schema_id: RESTAURANT_CARDS_SCHEMA,
                    ui_surface: 'restaurant_cards',
                  }),
              restaurant_cards: restaurantCards,
              restaurants: restaurantCards,
            }
          : {}),
        ...(carRentalCards.length
          ? {
              ...(cards.length || activityCards.length || restaurantCards.length
                ? {}
                : {
                    schema_id: CAR_RENTAL_CARDS_SCHEMA,
                    ui_surface: 'car_rental_cards',
                  }),
              car_rental_cards: carRentalCards,
              car_rentals: carRentalCards,
              ...(carRentalSearchMeta ? { car_rental_search_meta: carRentalSearchMeta } : {}),
              ...(Array.isArray(payload.car_rental_guidance_footnotes_zh)
                ? {
                    car_rental_guidance_footnotes_zh: payload.car_rental_guidance_footnotes_zh,
                  }
                : {}),
            }
          : {}),
        ...(flightCards.length
          ? {
              ...(cards.length ||
              activityCards.length ||
              restaurantCards.length ||
              carRentalCards.length
                ? {}
                : {
                    schema_id: FLIGHT_CARDS_SCHEMA,
                    ui_surface: 'flight_cards',
                  }),
              flight_cards: flightCards,
              ...(flightInventorySnapshot
                ? { flight_inventory_snapshot: flightInventorySnapshot }
                : {}),
            }
          : {}),
        ...(xhsNoteCards.length
          ? {
              ...(cards.length ||
              activityCards.length ||
              restaurantCards.length ||
              carRentalCards.length ||
              flightCards.length
                ? {}
                : {
                    schema_id: XHS_NOTE_CARDS_SCHEMA,
                    ui_surface: 'xhs_note_cards',
                  }),
              xhs_note_cards: xhsNoteCards,
              ...(xhsSearchMeta ? { xhs_search_meta: xhsSearchMeta } : {}),
            }
          : {}),
        ...(itineraryAdjustResult
          ? {
              ...(cards.length ||
              activityCards.length ||
              restaurantCards.length ||
              carRentalCards.length ||
              flightCards.length ||
              xhsNoteCards.length
                ? {}
                : conversationTurn
                  ? { ui_surface: 'conversation_turn' }
                  : {
                      schema_id: 'tripnara/chat_itinerary_adjust_result@v1',
                      ui_surface: 'itinerary_adjust_result',
                    }),
              itinerary_adjust_result: itineraryAdjustResult,
            }
          : {}),
        ...(hotel.live_hotel_audit ? { live_hotel_audit: hotel.live_hotel_audit } : {}),
      },
    };
    const row = replaceMessageId
      ? await db.message.update({ where: { id: replaceMessageId }, data })
      : await db.message.create({ data });
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
    this.events.publish({
      type: 'message.created',
      conversation_id: conversationId,
      at: new Date().toISOString(),
      payload: {
        message_id: row.id,
        role: 'ASSISTANT',
        result_status: statusOut,
        delivery_verdict: verdictOut,
        ...(text ? { intro: text, answer_text: text } : {}),
        ...(cards.length
          ? {
              accommodations_count: cards.length,
              ui_surface: 'accommodation_cards',
              accommodation_cards: cards,
            }
          : {}),
        ...(activityCards.length
          ? {
              activity_booking_count: activityCards.length,
              ui_surface: uiSurface,
              activity_booking_cards: activityCards,
            }
          : {}),
        ...(restaurantCards.length
          ? {
              restaurant_count: restaurantCards.length,
              ui_surface: uiSurface,
              restaurant_cards: restaurantCards,
            }
          : {}),
        ...(carRentalCards.length
          ? {
              car_rental_count: carRentalCards.length,
              ui_surface: uiSurface,
              car_rental_cards: carRentalCards,
            }
          : {}),
        ...(flightCards.length
          ? {
              flight_count: flightCards.length,
              ui_surface: uiSurface,
              flight_cards: flightCards,
            }
          : {}),
        ...(xhsNoteCards.length
          ? {
              xhs_note_count: xhsNoteCards.length,
              ui_surface: uiSurface,
              xhs_note_cards: xhsNoteCards,
            }
          : {}),
        ...(itineraryAdjustResult
          ? {
              ui_surface: uiSurface,
              itinerary_adjust_result: itineraryAdjustResult,
            }
          : {}),
      },
    });
    return row;
  }

  private async buildRecentMessages(conversationId: string): Promise<string[]> {
    const db = this.db();
    const rows = await db.message.findMany({
      where: { conversationId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows
      .reverse()
      .map((m: any) =>
        m.role === 'USER' ? `用户: ${m.content}` : `助手: ${m.content}`,
      );
  }

  private async getConversationForUser(
    conversationId: string,
    userId: string,
  ): Promise<ConvRow> {
    const db = this.db();
    const conv = await db.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (conv.scope === 'PERSONAL') {
      if (conv.createdByUserId !== userId) {
        throw new ForbiddenException('PERSONAL conversation is private');
      }
      return conv;
    }
    if (!conv.tripId) throw new BadRequestException('Invalid TRIP_SHARED conversation');
    await this.assertTripMember(conv.tripId, userId);
    return conv;
  }

  private async assertTripMember(tripId: string, userId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { TripCollaborator: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    const ok = trip.TripCollaborator.some((c) => c.userId === userId);
    if (!ok) throw new ForbiddenException('Not a trip collaborator');
  }

  private async getTripRole(tripId: string, userId: string) {
    const c = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    return normalizeTripCollaboratorRole(c?.role);
  }

  toConversationDto(c: ConvRow) {
    return {
      id: c.id,
      scope: c.scope,
      trip_id: c.tripId,
      title: c.title,
      created_by_user_id: c.createdByUserId,
      last_message_at: c.lastMessageAt?.toISOString() ?? null,
      updated_at: c.updatedAt.toISOString(),
      created_at: c.createdAt.toISOString(),
    };
  }

  toMessageDto(m: any) {
    const summary =
      m.summaryJson && typeof m.summaryJson === 'object'
        ? (m.summaryJson as Record<string, unknown>)
        : {};
    const introFromSummary = [
      summary.intro,
      summary.answer_text,
      summary.summary,
      summary.markdown,
      summary.text,
    ]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find((v) => v.length > 0);
    const content = typeof m.content === 'string' ? m.content : '';
    const intro =
      introFromSummary ||
      (content && content !== '(empty)' ? content : undefined);
    return {
      id: m.id,
      conversation_id: m.conversationId,
      role: m.role,
      user_id: m.userId,
      display_name: m.displayName,
      content,
      /** 策略正文优先；兼容只读 text 的客户端 */
      text: intro || content,
      intro: intro || undefined,
      answer_text: intro || undefined,
      request_id: m.requestId,
      result_status: m.resultStatus,
      delivery_verdict: m.deliveryVerdict,
      task_id: m.taskId,
      summary_json: m.summaryJson,
      created_at: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    };
  }
}
