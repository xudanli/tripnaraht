// src/agent/services/route-and-run-context-enricher.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { buildBriefItineraryLinesFromTripDays } from '../../trips/utils/trip-prompt-summary.util';
import { UserStandingPreferenceService } from './user-standing-preference.service';
import { TripInsightService } from '../../trips/services/trip-insight.service';
import { TripMetricsService } from '../../trips/services/trip-metrics.service';

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

      const lines: string[] = [];
      lines.push(`[active_trip_summary trip_id=${tripId}]`);
      if (trip.name) lines.push(`名称: ${trip.name}`);
      if (trip.status) lines.push(`状态: ${trip.status}`);
      if (trip.destination) lines.push(`目的地代码: ${trip.destination}`);
      if (trip.startDate) lines.push(`开始: ${trip.startDate.toISOString().slice(0, 10)}`);
      if (trip.endDate) lines.push(`结束: ${trip.endDate.toISOString().slice(0, 10)}`);

      lines.push(...await this.buildTripRiskAndMetricLines(tripId));
      lines.push(...buildBriefItineraryLinesFromTripDays(trip.TripDay));

      const block = lines.join('\n');
      const injected = `[系统注入·当前行程摘要]\n${block}`;
      const prev = request.conversation_context?.recent_messages ?? [];
      request.conversation_context = {
        ...request.conversation_context,
        recent_messages: [injected, ...prev],
      };
    } catch (e: any) {
      this.logger.warn(`[ContextEnricher] active_trip_summary failed: ${e?.message ?? e}`);
    }
  }

  private async buildTripRiskAndMetricLines(tripId: string): Promise<string[]> {
    const lines: string[] = [];
    if (this.tripInsightService) {
      try {
        const insight = await this.tripInsightService.getInsight(tripId);
        lines.push(
          `准备度: status=${insight.readiness.status}, blockers=${insight.readiness.blockers}, must=${insight.readiness.must}, should=${insight.readiness.should}, overall=${insight.overallStatus}`,
        );
        const priorityFindings = (insight.findings ?? [])
          .filter((finding) => finding.type !== 'positive')
          .slice(0, 3)
          .map((finding) => `${finding.title}: ${finding.message}`);
        if (priorityFindings.length > 0) {
          lines.push('关键发现:');
          for (const finding of priorityFindings) {
            lines.push(`- ${finding}`);
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
