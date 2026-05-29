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

/**
 * Enriches `route_and_run` conversation context before orchestration (e.g. active trip summary).
 */
@Injectable()
export class RouteAndRunContextEnricherService {
  private readonly logger = new Logger(RouteAndRunContextEnricherService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly userStandingPreference?: UserStandingPreferenceService,
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
      const injected = compressWorldStateToNarrative(worldState, tripId);
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
