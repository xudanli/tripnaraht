// src/agent/services/route-and-run-context-enricher.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { compressWorldStateToNarrative } from '../runtime/decision-os-narrative-projection.util';
import {
  formatDecisionOsTripTime,
  type DecisionOsWorldState,
} from '../runtime/decision-os-world-state.types';
import { UserStandingPreferenceService } from './user-standing-preference.service';
import { TripInsightService } from '../../trips/services/trip-insight.service';
import { TripMetricsService } from '../../trips/services/trip-metrics.service';
import {
  filterScheduleFocusedInsightFindings,
  shouldSkipAgentReadinessPackCheck,
} from '../utils/agent-readiness-phase.util';
import { loadWishlistPromptInjectionForAgent } from '../../trips/wishlist/utils/wish-prompt-injection.util';
import { TripIntentDigestService } from '../memory/services/trip-intent-digest.service';
import { formatTripIntentDigestPromptInjection } from '../memory/utils/trip-intent-context-blocks.util';
import { TripBudgetProfileService } from '../../trips/budget-os/services/trip-budget-profile.service';
import { formatBudgetProfilePromptBlock } from '../../trips/services/budget-comparison.util';
import {
  attachTripConversationContextToRequest,
  buildTripConversationContextSnapshot,
} from '../delivery/conversation';

/**
 * Enriches `route_and_run` conversation context before orchestration (e.g. active trip summary).
 */
@Injectable()
export class RouteAndRunContextEnricherService {
  private readonly logger = new Logger(RouteAndRunContextEnricherService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly userStandingPreference?: UserStandingPreferenceService,
    @Optional() private readonly tripInsightService?: TripInsightService,
    @Optional() private readonly tripMetricsService?: TripMetricsService,
    @Optional() private readonly tripIntentDigest?: TripIntentDigestService,
    @Optional() private readonly budgetProfileService?: TripBudgetProfileService,
  ) {}

  /**
   * When `conversation_context.context_type === 'active_trip_summary'` and `trip_id` is set,
   * prepends a compact itinerary summary into `recent_messages` for the orchestrator.
   * Unknown `context_type` values are ignored (no-op).
   */
  async maybeInjectActiveTripSummary(request: RouteAndRunRequestDto): Promise<void> {
    const ctxType = request.conversation_context?.context_type?.trim();
    if (!ctxType || ctxType !== 'active_trip_summary') {
      return;
    }
    const tripId = request.trip_id?.trim();
    if (!tripId) {
      return;
    }
    if (!this.prisma) {
      this.logger.debug('[ContextEnricher] Prisma unavailable; skip active_trip_summary');
      return;
    }

    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          destination: true,
          TripDay: {
            orderBy: { date: 'asc' },
            select: {
              date: true,
              ItineraryItem: {
                orderBy: { startTime: 'asc' },
                select: {
                  note: true,
                  type: true,
                  startTime: true,
                  endTime: true,
                  Place: { select: { nameCN: true, nameEN: true } },
                },
              },
            },
          },
        },
      });

      if (!trip) {
        return;
      }

      // Phase 2：水合 TripConversationContextSnapshot（供 Conversation Assembler）
      try {
        const collaborators = await this.prisma.tripCollaborator.findMany({
          where: { tripId },
          select: { userId: true },
        });
        const userIds = collaborators.map((c) => c.userId).filter(Boolean);
        let submitted = 0;
        if (userIds.length) {
          const answers = await this.prisma.fitness_questionnaire_answers.findMany({
            where: { user_id: { in: userIds } },
            select: { user_id: true },
            distinct: ['user_id'],
          });
          submitted = answers.length;
        }
        const pending = Math.max(0, userIds.length - submitted);
        const tz =
          request.conversation_context?.timezone?.trim() || 'Atlantic/Reykjavik';
        const todayYmd = new Date().toISOString().slice(0, 10);
        const snap = buildTripConversationContextSnapshot({
          trip_id: tripId,
          trip_status: trip.status,
          start_date: trip.startDate?.toISOString().slice(0, 10) ?? null,
          end_date: trip.endDate?.toISOString().slice(0, 10) ?? null,
          today_ymd: todayYmd,
          timezone: tz,
          destination: trip.destination,
          day_count: trip.TripDay?.length ?? null,
          member_count: userIds.length,
          fitness_submitted_count: submitted,
          fitness_pending_count: pending,
          unresolved_risks_zh: [],
          open_decisions_zh: [],
        });
        attachTripConversationContextToRequest(
          request as unknown as Record<string, unknown>,
          snap,
        );
      } catch (e: any) {
        this.logger.debug(
          `[ContextEnricher] trip_conversation_context hydrate skipped: ${e?.message ?? e}`,
        );
      }

      const worldState: DecisionOsWorldState = {
        revision: 'v1',
        tripId,
        name: trip.name,
        status: trip.status,
        destination: trip.destination,
        startDate: trip.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: trip.endDate?.toISOString().slice(0, 10) ?? null,
        days: (trip.TripDay ?? []).map((day) => ({
          date: day.date?.toISOString().slice(0, 10) ?? '?',
          items: (day.ItineraryItem ?? []).map((it) => ({
            type: it.type,
            note: it.note,
            placeName: it.Place?.nameCN ?? it.Place?.nameEN ?? null,
            startTime: formatDecisionOsTripTime(it.startTime),
            endTime: formatDecisionOsTripTime(it.endTime),
          })),
        })),
      };
      let injected = compressWorldStateToNarrative(worldState, tripId);
      const riskLines = await this.buildTripRiskAndMetricLines(
        request,
        tripId,
        trip.startDate ?? undefined,
      );
      if (riskLines.length > 0 && injected.trim()) {
        const prefix = '[系统注入·当前行程摘要]\n';
        const body = injected.startsWith(prefix) ? injected.slice(prefix.length) : injected;
        injected = `${prefix}${body}\n${riskLines.join('\n')}`;
      } else       if (riskLines.length > 0 && !injected.trim()) {
        injected = `[系统注入·当前行程摘要]\n${riskLines.join('\n')}`;
      }
      const budgetBlock = await this.buildBudgetProfileLines(tripId);
      if (budgetBlock) {
        injected = injected.trim()
          ? `${injected}\n${budgetBlock}`
          : budgetBlock;
      }
      if (!injected.trim()) {
        return;
      }
      const prev = request.conversation_context?.recent_messages ?? [];
      request.conversation_context = {
        ...request.conversation_context,
        recent_messages: [injected, ...prev],
      };
    } catch (e: any) {
      this.logger.warn(`[ContextEnricher] active_trip_summary failed: ${e?.message ?? e}`);
    }
  }

  private async buildTripRiskAndMetricLines(
    request: RouteAndRunRequestDto,
    tripId: string,
    tripStartDate?: Date,
  ): Promise<string[]> {
    const lines: string[] = [];
    const skipReadinessPack = shouldSkipAgentReadinessPackCheck(
      request,
      tripStartDate,
      request.message,
    );
    if (this.tripInsightService) {
      try {
        const insight = await this.tripInsightService.getInsight(tripId, { skipReadinessPack });
        if (!skipReadinessPack && insight.readiness) {
          lines.push(
            `准备度: status=${insight.readiness.status}, blockers=${insight.readiness.blockers}, must=${insight.readiness.must}, should=${insight.readiness.should}, overall=${insight.overallStatus}`,
          );
        }
        const priorityFindings = filterScheduleFocusedInsightFindings(insight.findings ?? []).slice(0, 3);
        if (priorityFindings.length > 0) {
          lines.push('关键发现:');
          for (const finding of priorityFindings) {
            lines.push(`- ${finding.title}: ${finding.message}`);
          }
        }
      } catch (e: any) {
        this.logger.debug(`[ContextEnricher] trip insight summary skipped: ${e?.message ?? e}`);
      }
    }

    if (this.tripMetricsService) {
      try {
        const metrics = await this.tripMetricsService.getTripMetrics(tripId, undefined, {
          includeConflicts: false,
        });
        lines.push(
          `行程指标: 总驾驶约${metrics.summary.totalDrive}分钟, 日均驾驶约${metrics.summary.averageDrivePerDay}分钟, 总缓冲约${metrics.summary.totalBuffer}分钟, 预算估算=${metrics.summary.totalCost}`,
        );
        const conflicts = (metrics.days ?? [])
          .flatMap((day) =>
            (day.conflicts ?? []).map((conflict: any) => ({
              date: day.date,
              severity: conflict.severity,
              title: conflict.title,
              description: conflict.description,
            })),
          )
          .slice(0, 5);
        if (conflicts.length > 0) {
          lines.push('日程冲突:');
          for (const conflict of conflicts) {
            lines.push(`- ${conflict.date} [${conflict.severity}] ${conflict.title}: ${conflict.description}`);
          }
        }
      } catch (e: any) {
        this.logger.debug(`[ContextEnricher] trip metrics summary skipped: ${e?.message ?? e}`);
      }
    }

    return lines;
  }

  private async buildBudgetProfileLines(tripId: string): Promise<string | null> {
    if (!this.budgetProfileService) {
      return null;
    }
    try {
      const profile = await this.budgetProfileService.getProfile(tripId, ['actuals']);
      if (!profile.intent && !profile.structure && !profile.actuals) {
        return null;
      }
      return formatBudgetProfilePromptBlock({
        intentTotal: profile.intent?.total,
        currency: profile.intent?.currency ?? profile.actuals?.currency ?? 'CNY',
        dailyBudget: profile.intent?.dailyBudget,
        spendingPersona: profile.structure?.spendingPersona,
        structureAllocations: profile.structure?.allocations,
        actualsTotalEstimated: profile.actuals?.totalEstimated,
        budgetUsagePercent: profile.actuals?.budgetUsagePercent,
        gateVerdict: profile.gateStatus?.verdict,
        unpaidCount: profile.actuals?.unpaidCount,
      });
    } catch (e: any) {
      this.logger.debug(`[ContextEnricher] budget profile skipped: ${e?.message ?? e}`);
      return null;
    }
  }

  /**
   * 绑定 trip_id 时注入私密 + 团队愿望单（供推荐活动/规划类问法使用）。
   */
  async maybeInjectTripWishlistContext(request: RouteAndRunRequestDto): Promise<void> {
    const tripId = request.trip_id?.trim();
    const userId = request.user_id?.trim();
    if (!tripId || !userId || !this.prisma) {
      return;
    }

    try {
      const block = await loadWishlistPromptInjectionForAgent(this.prisma, tripId, userId);
      if (!block) {
        return;
      }
      const prev = request.conversation_context?.recent_messages ?? [];
      request.conversation_context = {
        ...request.conversation_context,
        recent_messages: [block, ...prev],
      };
      this.logger.debug(
        `[ContextEnricher] wishlist injected trip_id=${tripId} user_id=${userId} chars=${block.length}`,
      );
    } catch (e: any) {
      this.logger.warn(`[ContextEnricher] trip wishlist inject failed: ${e?.message ?? e}`);
    }
  }

  /**
   * 注入决策风格、私密清单、协商结果摘要（与 Memory digest / Context Engine 对齐）。
   */
  async maybeInjectTripIntentDigestContext(request: RouteAndRunRequestDto): Promise<void> {
    const tripId = request.trip_id?.trim();
    const userId = request.user_id?.trim();
    if (!tripId || !userId || userId === 'anonymous' || !this.tripIntentDigest) {
      return;
    }

    try {
      const bundle = await this.tripIntentDigest.loadForMemoryContext(tripId, userId);
      const block = formatTripIntentDigestPromptInjection(bundle);
      if (!block) {
        return;
      }
      const prev = request.conversation_context?.recent_messages ?? [];
      request.conversation_context = {
        ...request.conversation_context,
        recent_messages: [block, ...prev],
      };
      this.logger.debug(
        `[ContextEnricher] trip intent digest injected trip_id=${tripId} user_id=${userId} chars=${block.length}`,
      );
    } catch (e: any) {
      this.logger.warn(`[ContextEnricher] trip intent digest inject failed: ${e?.message ?? e}`);
    }
  }

  /**
   * 将已持久化的「用户长期偏好摘要」注入 recent_messages，供编排 / LLM 遵守（与 active_trip_summary 独立）。
   */
  async maybeInjectUserStandingSummary(request: RouteAndRunRequestDto): Promise<void> {
    const uid = request.user_id?.trim();
    if (!this.userStandingPreference || !uid) {
      return;
    }
    try {
      const block = await this.userStandingPreference.buildPromptInjectionBlock(uid);
      if (!block) return;
      const prev = request.conversation_context?.recent_messages ?? [];
      request.conversation_context = {
        ...request.conversation_context,
        recent_messages: [block, ...prev],
      };
    } catch (e: any) {
      this.logger.warn(`[ContextEnricher] user_standing_summary failed: ${e?.message ?? e}`);
    }
  }
}
