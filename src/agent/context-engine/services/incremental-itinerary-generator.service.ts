// src/agent/context-engine/services/incremental-itinerary-generator.service.ts
/**
 * Incremental Itinerary Generator (分段规划 POC)
 *
 * Context Orchestrator Phase 2: Day1 → Day2 → Day3 迭代生成
 * 目标：降低长行程 Token 压力，每次只生成一天，注入前一天摘要 + 全局约束
 *
 * 参考：docs/CONTEXT_ORCHESTRATOR_IMPLEMENTATION_PLAN.md 7.3
 */

import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type {
  TripPlanRequest,
  Itinerary,
  ItineraryDay,
  ItineraryItem,
  GateResult,
} from '../../interfaces/trip-plan.interface';

/** 单日行程摘要（用于下一日的 Context 注入） */
export interface DaySummary {
  day: number;
  date: string;
  itemCount: number;
  keyLocations: string[];
}

export interface IncrementalItineraryEnvironmentState {
  flights?: Array<{ flight?: string; status?: string; price?: number }>;
}

export interface IncrementalItineraryInput {
  request: TripPlanRequest;
  research_data?: Record<string, any>;
  gate_result?: GateResult;
  /** 环境状态（如 REPLAN 后的替代航班），供 Day1 使用 */
  environment_state?: IncrementalItineraryEnvironmentState;
  /** 最小天数才启用分段生成，默认 3 */
  minDaysToTrigger?: number;
}

@Injectable()
export class IncrementalItineraryGeneratorService {
  private readonly logger = new Logger(IncrementalItineraryGeneratorService.name);

  /**
   * 将已生成的天数压缩为摘要（供下一日 Context 使用）
   */
  compressPreviousDays(days: ItineraryDay[]): DaySummary[] {
    return days.map((d, idx) => ({
      day: idx + 1,
      date: d.date,
      itemCount: d.items?.length ?? 0,
      keyLocations: (d.items ?? [])
        .slice(0, 5)
        .map((it) => it.location_ref?.name ?? '')
        .filter(Boolean),
    }));
  }

  /**
   * 分段生成行程：Day1 → Day2 → Day3 → ...
   * 每次迭代只生成一天，将前几日摘要传入（供未来 Context 按需注入）
   */
  async generateIncremental(input: IncrementalItineraryInput): Promise<{
    itinerary: Itinerary;
    daySummaries: DaySummary[];
    mode: 'incremental' | 'full';
  }> {
    const { request, research_data, gate_result: _gate_result, environment_state, minDaysToTrigger = 3 } = input;
    const requestId = (request as any).request_id ?? 'unknown';

    const { days, startDate, pois } = this.extractParams(request, research_data);

    // 天数不足则使用全量模式（单次生成）
    const useIncremental = days >= minDaysToTrigger;
    if (!useIncremental) {
      const itineraryDays = this.generateAllDaysAtOnce(request, days, startDate, pois, environment_state);
      return {
        itinerary: { request_id: requestId, days: itineraryDays },
        daySummaries: this.compressPreviousDays(itineraryDays),
        mode: 'full',
      };
    }

    this.logger.log(
      `[分段规划 POC] 启用 Day1→Day2→...→Day${days} 迭代生成, request_id=${requestId}`,
    );

    const itineraryDays: ItineraryDay[] = [];
    const itemsPerDay = Math.ceil(pois.length / days);

    for (let dayIndex = 0; dayIndex < days; dayIndex++) {
      const previousSummaries = this.compressPreviousDays(itineraryDays);

      const dayContent = this.generateSingleDay({
        request,
        dayIndex,
        days,
        startDate,
        pois,
        itemsPerDay,
        previousSummaries,
        environment_state,
      });

      itineraryDays.push(dayContent);

      this.logger.debug(
        `[分段规划 POC] Day ${dayIndex + 1}/${days} 完成, items=${dayContent.items.length}, ` +
          `priorSummaryLen=${previousSummaries.length}`,
      );
    }

    return {
      itinerary: { request_id: requestId, days: itineraryDays },
      daySummaries: this.compressPreviousDays(itineraryDays),
      mode: 'incremental',
    };
  }

  private extractParams(
    request: TripPlanRequest,
    research_data?: Record<string, any>,
  ): { days: number; startDate: DateTime; pois: any[] } {
    let days: number;
    if (request.days) {
      days = request.days;
    } else if (request.date_range) {
      const start = DateTime.fromISO(request.date_range.start_date);
      const end = DateTime.fromISO(request.date_range.end_date);
      days = end.diff(start, 'days').days + 1;
    } else {
      days = 5;
    }

    let startDate: DateTime;
    if (request.date_range) {
      startDate = DateTime.fromISO(request.date_range.start_date);
    } else if (request.start_date) {
      startDate = DateTime.fromISO(request.start_date);
    } else {
      startDate = DateTime.now().plus({ days: 1 });
    }

    const poiEvidence = research_data?.poi_evidence;
    const pois = Array.isArray(poiEvidence)
      ? poiEvidence
      : poiEvidence?.pois ?? [];

    return { days, startDate, pois };
  }

  private generateAllDaysAtOnce(
    request: TripPlanRequest,
    days: number,
    startDate: DateTime,
    pois: any[],
    environment_state?: IncrementalItineraryEnvironmentState,
  ): ItineraryDay[] {
    const itemsPerDay = Math.ceil(pois.length / days);
    const result: ItineraryDay[] = [];

    for (let dayIndex = 0; dayIndex < days; dayIndex++) {
      const dayContent = this.generateSingleDay({
        request,
        dayIndex,
        days,
        startDate,
        pois,
        itemsPerDay,
        previousSummaries: [],
        environment_state,
      });
      result.push(dayContent);
    }
    return result;
  }

  private generateSingleDay(params: {
    request: TripPlanRequest;
    dayIndex: number;
    days: number;
    startDate: DateTime;
    pois: any[];
    itemsPerDay: number;
    previousSummaries: DaySummary[];
    environment_state?: IncrementalItineraryEnvironmentState;
  }): ItineraryDay {
    const { request, dayIndex, days: _days, startDate, pois, itemsPerDay, environment_state } = params;
    const requestId = (request as any).request_id ?? 'unknown';
    const currentDate = startDate.plus({ days: dayIndex });

    const dayItems: ItineraryItem[] = [];

    // 专利实施例 2：Day1 且有替代航班时，首位加入航班项
    if (dayIndex === 0 && environment_state?.flights?.length) {
      const first = environment_state.flights.find((f) => (f?.status ?? '').toLowerCase() === 'scheduled');
      if (first?.flight && request.origin && request.destination && request.origin !== request.destination) {
        dayItems.push({
          id: `${requestId}_day1_flight`,
          type: 'TRANSIT',
          start_window: '08:00',
          end_window: '14:00',
          location_ref: {
            name: `${request.origin} → ${request.destination}（${first.flight}）`,
          },
          evidence_refs: [],
          verified: false,
          verification_status: 'ASSUMPTION',
          metadata: { flight: first.flight, price: first.price },
        });
      }
    }
    const startPoiIndex = dayIndex * itemsPerDay;
    const endPoiIndex = Math.min(startPoiIndex + itemsPerDay, pois.length);
    const dayPois = pois.slice(startPoiIndex, endPoiIndex);

    for (let i = 0; i < dayPois.length; i++) {
      const poi = dayPois[i];
      const poiId = poi.poi_id ?? poi.id ?? `poi_${startPoiIndex + i}`;
      const poiName = poi.name ?? poi.nameCN ?? poi.nameEN ?? '未知地点';
      const poiCoords =
        poi.coordinates ??
        (poi.lat && poi.lng ? { lat: poi.lat, lng: poi.lng } : undefined);

      // 🆕 限制在 08:00-22:00 内，避免半夜安排行程
      const rawStartHour = 9 + i * 2;
      const startHour = Math.min(Math.max(rawStartHour, 8), 20);
      const endHour = Math.min(startHour + 2, 22);
      const startTime = `${startHour.toString().padStart(2, '0')}:00`;
      const endTime = `${endHour.toString().padStart(2, '0')}:00`;

      dayItems.push({
        id: `${requestId}_day${dayIndex + 1}_item${i + 1}`,
        type: 'POI',
        start_window: startTime,
        end_window: endTime,
        location_ref: {
          place_id: poiId,
          name: poiName,
          coordinates: poiCoords,
          address: poi.address,
        },
        evidence_refs: poi.evidence_id ? [poi.evidence_id] : [],
        verified: false,
        verification_status: 'UNVERIFIED',
        metadata: { duration_minutes: 120 },
      });
    }

    if (dayItems.length === 0) {
      dayItems.push({
        id: `${requestId}_day${dayIndex + 1}_placeholder`,
        type: 'REST',
        start_window: '09:00',
        end_window: '18:00',
        location_ref: { name: '待安排' },
        evidence_refs: [],
        verified: false,
        verification_status: 'ASSUMPTION',
      });
    }

    return {
      date: currentDate.toISODate() ?? currentDate.toFormat('yyyy-MM-dd'),
      items: dayItems,
    };
  }
}
