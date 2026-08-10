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
import { buildSparseCatalogRestDayPoiSearchHints } from '../../utils/research-poi-retrieval-geography-hint.util';
import type {
  TripPlanRequest,
  Itinerary,
  ItineraryDay,
  ItineraryItem,
  GateResult,
} from '../../interfaces/trip-plan.interface';
import {
  maxGlobalPoiPlacementsForAllocation,
  type SparsePoiDayAllocation,
} from '../utils/sparse-poi-day-allocation.util';
import {
  buildOpeningHoursByPoiId,
  resolvePoiVisitWindow,
} from '../utils/poi-visit-schedule.util';
import { injectCorridorDriveLegsIntoDays } from '../../../skills/itinerary/itinerary-segment-tagger.util';
import type { ResolvedPolicies } from '../../../skills/runtime-os/types/runtime-os.types';
import {
  applyExecutionPolicyHookToItineraryDays,
  shouldSuppressCorridorDriveInjection,
  type ItineraryGovernanceApplyResult,
} from '../../../skills/itinerary/itinerary-execution-policy-hook.util';
import { mapGovernanceRuntimeStateToPlannerMode } from '../../../governance/runtime-state-machine/map-runtime-state-to-planner-mode.util';

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
  /**
   * POI 数少于天数且单日单槽时：block=按天块状铺开；round_robin=按日轮替（用餐/节奏类规划更自然）
   */
  sparsePoiDayAllocation?: SparsePoiDayAllocation;
  /** policy.resolve 输出；控制走廊 DRIVE 注入与行程裁剪 */
  executionPolicyHook?: ResolvedPolicies['executionPolicyHook'];
  /** GRSM：恢复态等由编排水合并注入 */
  governance_runtime_state?: import('../../../governance/runtime-state-machine/governance-runtime-state.types').GovernanceRuntimeState;
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
    governanceApply: ItineraryGovernanceApplyResult;
  }> {
    const {
      request,
      research_data,
      gate_result: _gate_result,
      environment_state,
      minDaysToTrigger = 3,
      sparsePoiDayAllocation = 'block',
      executionPolicyHook,
      governance_runtime_state,
    } = input;
    const requestId = (request as any).request_id ?? 'unknown';

    let researchData = research_data ?? {};
    if (governance_runtime_state != null) {
      researchData = {
        ...researchData,
        planner_governance_mode: mapGovernanceRuntimeStateToPlannerMode(governance_runtime_state),
      };
      if (governance_runtime_state === 'RECOVERING') {
        researchData = {
          ...researchData,
          governance_recovery_v1: {
            conservative_corridors: true,
            suppress_new_region_exploration: true,
            shorter_legs_bias: true,
          },
        };
        this.logger.log(`[GRSM] RECOVERING → conservative incremental search request_id=${requestId}`);
      }
    }

    const driftInfl = request.governance_drift_influences;
    if (Array.isArray(driftInfl) && driftInfl.length > 0) {
      researchData = {
        ...researchData,
        governance_drift_influence_v1: {
          influences: driftInfl,
          source: 'gfil',
        },
      };
      this.logger.debug(`[GFIL] injected ${driftInfl.length} drift influence vector(s) request_id=${requestId}`);
    }

    const { days, startDate, pois } = this.extractParams(request, researchData);

    // 天数不足则使用全量模式（单次生成）
    const useIncremental = days >= minDaysToTrigger;
    if (!useIncremental) {
      const itineraryDays = this.generateAllDaysAtOnce(
        request,
        days,
        startDate,
        pois,
        environment_state,
        researchData,
        sparsePoiDayAllocation,
      );
      const taggedDays = shouldSuppressCorridorDriveInjection(executionPolicyHook)
        ? itineraryDays
        : injectCorridorDriveLegsIntoDays(itineraryDays, requestId);
      const suppressed = shouldSuppressCorridorDriveInjection(executionPolicyHook);
      const gov = applyExecutionPolicyHookToItineraryDays(taggedDays, executionPolicyHook, suppressed);
      return {
        itinerary: { request_id: requestId, days: gov.days },
        daySummaries: this.compressPreviousDays(gov.days),
        mode: 'full',
        governanceApply: gov,
      };
    }

    this.logger.log(
      `[分段规划 POC] 启用 Day1→Day2→...→Day${days} 迭代生成, request_id=${requestId}`,
    );

    const isFullTripReplan = researchData?.__itinerary_full_trip_replan === true;
    const adjustTargetIso =
      !isFullTripReplan &&
      typeof researchData?.__itinerary_adjust_target_date_iso === 'string'
        ? String(researchData.__itinerary_adjust_target_date_iso).slice(0, 10)
        : undefined;
    const itineraryDays: ItineraryDay[] = [];
    let itemsPerDay =
      pois.length === 0 ? 0 : Math.max(1, Math.ceil(pois.length / days));
    if (adjustTargetIso && pois.length > 0) {
      itemsPerDay = Math.min(4, Math.max(2, pois.length));
      this.logger.log(
        `[ITINERARY_ADJUST] corridor day replan target=${adjustTargetIso} pois=${pois.length} itemsPerDay=${itemsPerDay} request_id=${requestId}`,
      );
    }
    const globalPoiPlacementCounts = new Map<string, number>();

    let prevDayLeadPoiKey: string | null = null;

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
        prevDayLeadPoiKey,
        research_data: researchData,
        sparsePoiDayAllocation,
        globalPoiPlacementCounts,
      });

      itineraryDays.push(dayContent);

      const firstPoi = dayContent.items.find((it) => it.type === 'POI');
      prevDayLeadPoiKey =
        firstPoi?.location_ref?.place_id != null
          ? String(firstPoi.location_ref.place_id)
          : firstPoi?.location_ref?.name != null
            ? String(firstPoi.location_ref.name)
            : null;

      this.logger.debug(
        `[分段规划 POC] Day ${dayIndex + 1}/${days} 完成, items=${dayContent.items.length}, ` +
          `priorSummaryLen=${previousSummaries.length}`,
      );
    }

    const taggedDays = shouldSuppressCorridorDriveInjection(executionPolicyHook)
      ? itineraryDays
      : injectCorridorDriveLegsIntoDays(itineraryDays, requestId);
    const suppressed = shouldSuppressCorridorDriveInjection(executionPolicyHook);
    const gov = applyExecutionPolicyHookToItineraryDays(taggedDays, executionPolicyHook, suppressed);
    return {
      itinerary: { request_id: requestId, days: gov.days },
      daySummaries: this.compressPreviousDays(gov.days),
      mode: 'incremental',
      governanceApply: gov,
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
    research_data?: Record<string, any>,
    sparsePoiDayAllocation: SparsePoiDayAllocation = 'block',
  ): ItineraryDay[] {
    const itemsPerDay =
      pois.length === 0 ? 0 : Math.max(1, Math.ceil(pois.length / days));
    const result: ItineraryDay[] = [];
    const globalPoiPlacementCounts = new Map<string, number>();
    let prevDayLeadPoiKey: string | null = null;

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
        prevDayLeadPoiKey,
        research_data,
        sparsePoiDayAllocation,
        globalPoiPlacementCounts,
      });
      result.push(dayContent);
      const firstPoi = dayContent.items.find((it) => it.type === 'POI');
      prevDayLeadPoiKey =
        firstPoi?.location_ref?.place_id != null
          ? String(firstPoi.location_ref.place_id)
          : firstPoi?.location_ref?.name != null
            ? String(firstPoi.location_ref.name)
            : null;
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
    /** 上一日首个 POI 的稳定键（place_id 优先），用于单日单槽时的连续同点说明 */
    prevDayLeadPoiKey?: string | null;
    /** 研究侧数据：按日槽位、POI 自带时间窗、opening_hours_evidence 等 */
    research_data?: Record<string, any>;
    sparsePoiDayAllocation?: SparsePoiDayAllocation;
    globalPoiPlacementCounts?: Map<string, number>;
  }): ItineraryDay {
    const {
      request,
      dayIndex,
      days,
      startDate,
      pois,
      itemsPerDay,
      environment_state,
      prevDayLeadPoiKey,
      research_data,
      sparsePoiDayAllocation = 'block',
      globalPoiPlacementCounts,
    } = params;
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
    /** 全局槽位：超过 pois.length 后循环复用，避免「前几天有地名、后面全是待安排」 */
    const startSlot = dayIndex * itemsPerDay;
    const openingHoursByPoi = buildOpeningHoursByPoiId(research_data);
    const scheduledForDay = IncrementalItineraryGeneratorService.tryScheduledPoisForDay(
      research_data,
      dayIndex,
      days,
      pois,
    );
    const hasResearchScheduleForThisDay =
      Array.isArray(scheduledForDay) && scheduledForDay.some((s) => s != null);
    const maxPlacements = maxGlobalPoiPlacementsForAllocation(sparsePoiDayAllocation);
    const isSparseCatalog =
      pois.length > 0 && pois.length < days && itemsPerDay === 1 && !hasResearchScheduleForThisDay;
    const useIntentionalSlackLayout =
      sparsePoiDayAllocation === 'intentional_slack' && isSparseCatalog;
    /**
     * 研究侧只命中 1 个 POI 且多日单日单槽时，块状公式 `floor(dayIndex * 1 / days)` 恒为 0，
     * 会把同一景点机械复制到每一天（与用户「走廊/改线」预期完全无关）。
     * intentional_slack：前 pois.length 天按目录各落一点，其后刻意留白并提示补检索。
     */
    const skipHeuristicSparseCatalogFill =
      isSparseCatalog &&
      days > 1 &&
      ((pois.length === 1 && dayIndex > 0) ||
        (useIntentionalSlackLayout && dayIndex >= pois.length));

    let dayCursorMinutes = 9 * 60;
    if (!skipHeuristicSparseCatalogFill) {
      for (let i = 0; i < itemsPerDay; i++) {
      if (pois.length === 0) {
        break;
      }
      const globalSlot = startSlot + i;
      const scheduledPoi = scheduledForDay?.[i];
      /**
       * 单日单槽且 POI 少于行程天数：默认按天块状铺开（避免 strict 模 2 交替 A/B/A/B…）；
       * 用餐/节奏类规划用 round_robin；intentional_slack 按目录序各落一次。
       */
      const useRoundRobinSparse =
        sparsePoiDayAllocation === 'round_robin' &&
        itemsPerDay === 1 &&
        pois.length > 0 &&
        pois.length < days;
      const heuristicPoiIndex = useIntentionalSlackLayout
        ? Math.min(dayIndex, pois.length - 1)
        : useRoundRobinSparse
          ? dayIndex % pois.length
          : itemsPerDay === 1
            ? Math.min(pois.length - 1, Math.floor((dayIndex * pois.length) / Math.max(days, 1)))
            : globalSlot % pois.length;
      const resolved = IncrementalItineraryGeneratorService.resolvePoiForSlot({
        scheduledPoi,
        scheduledList: scheduledForDay,
        pois,
        heuristicPoiIndex,
        globalSlot,
      });
      const poi = resolved.poi;
      const poiIndex = resolved.poiIndex;
      const slotFromResearch = resolved.fromResearchSchedule;
      const poiStableKey = String(poi.poi_id ?? poi.id ?? poiIndex);
      if (!slotFromResearch && globalPoiPlacementCounts) {
        const placed = globalPoiPlacementCounts.get(poiStableKey) ?? 0;
        if (placed >= maxPlacements) {
          continue;
        }
      }
      const isRepeatFill =
        itemsPerDay > 1
          ? globalSlot >= pois.length
          : prevDayLeadPoiKey != null && poiStableKey === prevDayLeadPoiKey;
      const poiId = poi.poi_id ?? poi.id ?? `poi_${poiIndex}`;
      const poiName = poi.name ?? poi.nameCN ?? poi.nameEN ?? '未知地点';
      const poiCoords =
        poi.coordinates ??
        (poi.lat && poi.lng ? { lat: poi.lat, lng: poi.lng } : undefined);

      const visit = resolvePoiVisitWindow({
        poi,
        slotIndex: i,
        poiId: String(poiId),
        openingHoursByPoi,
        dayCursorMinutes,
      });
      dayCursorMinutes = visit.nextDayCursorMinutes;

      const visitTip =
        typeof poi.visitTipCN === 'string'
          ? poi.visitTipCN.trim()
          : typeof poi.metadata?.visitTipCN === 'string'
            ? String(poi.metadata.visitTipCN).trim()
            : '';
      const descSnippet =
        typeof poi.description === 'string' ? poi.description.trim().slice(0, 120) : '';
      const smartNotes = isRepeatFill
        ? '研究资料中的参考点复用；请按当日开放时间与路况灵活调整，可替换为同区域其它景点。'
        : [descSnippet, visitTip].filter(Boolean).join(' ') || undefined;

      dayItems.push({
        id: `${requestId}_day${dayIndex + 1}_item${i + 1}`,
        type: 'POI',
        start_window: visit.startTime,
        end_window: visit.endTime,
        location_ref: {
          place_id: poiId,
          name: poiName,
          coordinates: poiCoords,
          address: poi.address,
        },
        ...(smartNotes ? { notes: smartNotes } : {}),
        evidence_refs: poi.evidence_id ? [poi.evidence_id] : [],
        verified: false,
        verification_status: 'UNVERIFIED',
        metadata: {
          duration_minutes: visit.durationMinutes,
          duration_source: visit.durationSource,
          slot_source: slotFromResearch ? 'research_schedule' : 'heuristic',
          time_source: visit.timeSource,
          ...(visitTip ? { visitTipCN: visitTip } : {}),
          ...(descSnippet ? { description_snippet: descSnippet } : {}),
        },
      });
      if (globalPoiPlacementCounts) {
        globalPoiPlacementCounts.set(
          poiStableKey,
          (globalPoiPlacementCounts.get(poiStableKey) ?? 0) + 1,
        );
      }
    }
    }

    if (dayItems.length === 0) {
      const destStr = typeof request.destination === 'string' ? request.destination.trim() : 'destination';
      const userPlanningNl = [
        typeof (request as { intake_user_message?: string }).intake_user_message === 'string'
          ? String((request as { intake_user_message?: string }).intake_user_message).trim()
          : '',
        typeof request.message === 'string' ? request.message.trim() : '',
      ]
        .filter(Boolean)
        .join('\n');
      const sparseGap =
        skipHeuristicSparseCatalogFill ||
        (isSparseCatalog && dayItems.length === 0) ||
        (pois.length > 0 && pois.length < days && !hasResearchScheduleForThisDay);
      const suggestedQueries = sparseGap
        ? buildSparseCatalogRestDayPoiSearchHints({
            tripDestination: destStr,
            userMessage: userPlanningNl,
            dayNumber1Based: dayIndex + 1,
            totalDays: days,
          })
        : [];
      const placeholderReason =
        pois.length === 1 && dayIndex > 0
          ? 'single_poi_catalog_multi_day'
          : sparsePoiDayAllocation === 'intentional_slack'
            ? 'intentional_slack'
            : sparseGap
              ? 'sparse_poi_catalog_gap'
              : undefined;
      dayItems.push({
        id: `${requestId}_day${dayIndex + 1}_placeholder`,
        type: 'REST',
        start_window: '09:00',
        end_window: '18:00',
        location_ref: { name: '待安排' },
        ...(sparseGap
          ? {
              notes:
                (sparsePoiDayAllocation === 'intentional_slack'
                  ? '证据偏稀，本日刻意留白（intentional slack），避免把少量参考点机械铺满；请补充检索或在工作台选定主题后再排点。'
                  : '研究阶段仅命中少量参考点，本日未自动落景点；请按行程意图（如进出点、少回头路）在工作台补充或重试检索。') +
                (suggestedQueries.length
                  ? ` 建议检索（可粘贴到 POI 搜索）：${suggestedQueries.slice(0, 3).join('；')}`
                  : ''),
            }
          : {}),
        evidence_refs: [],
        verified: false,
        verification_status: 'ASSUMPTION',
        ...(sparseGap && placeholderReason
          ? {
              metadata: {
                placeholder_reason: placeholderReason,
                ...(suggestedQueries.length ? { suggested_poi_search_queries: suggestedQueries } : {}),
              },
            }
          : {}),
      });
    }

    return {
      date: currentDate.toISODate() ?? currentDate.toFormat('yyyy-MM-dd'),
      items: dayItems,
    };
  }

  private static normalizePoiDayNumber(p: any): number | undefined {
    const d = p?.day ?? p?.day_number ?? p?.itinerary_day ?? p?.assigned_day;
    if (d == null) return undefined;
    const n = Number(d);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * 优先使用研究侧「按日槽位」：slots_by_day / daily_pois / POI 上 day 字段（均为 1-based day 常见）。
   */
  private static tryScheduledPoisForDay(
    research_data: Record<string, any> | undefined,
    dayIndex: number,
    days: number,
    pois: any[],
  ): any[] | null {
    void days;
    if (!research_data) return null;
    const raw = research_data.poi_evidence;
    const ev = Array.isArray(raw) ? null : raw;
    if (!ev || typeof ev !== 'object') return null;

    const d1 = dayIndex + 1;
    const slots = ev.slots_by_day ?? ev.slotsByDay ?? ev.day_slots;
    if (Array.isArray(slots) && dayIndex < slots.length) {
      const row = slots[dayIndex];
      const arr = Array.isArray(row) ? row : row != null ? [row] : [];
      if (arr.length > 0) return arr;
    }

    const daily = ev.daily_pois ?? ev.day_pois ?? ev.days;
    if (Array.isArray(daily)) {
      const hit = daily.find((x: any) => {
        const day = Number(x?.day ?? x?.day_number ?? x?.itinerary_day ?? x?.assigned_day);
        return Number.isFinite(day) && day === d1;
      });
      const arr = hit?.pois ?? hit?.items;
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }

    const tagged = pois
      .filter((p) => IncrementalItineraryGeneratorService.normalizePoiDayNumber(p) === d1)
      .sort(
        (a, b) =>
          Number(a?.order ?? a?.slot_order ?? a?.rank ?? 0) - Number(b?.order ?? b?.slot_order ?? b?.rank ?? 0),
      );
    if (tagged.length > 0) return tagged;

    return null;
  }

  private static mergeScheduledRefIntoPoisCatalog(ref: any, pois: any[]): { poi: any; poiIndex: number } {
    if (typeof ref === 'string' || typeof ref === 'number') {
      const id = String(ref);
      const idx = pois.findIndex((p) => String(p.poi_id ?? p.id ?? p.place_id) === id);
      return idx >= 0 ? { poi: pois[idx], poiIndex: idx } : { poi: { poi_id: id, id, name: id }, poiIndex: -1 };
    }
    if (ref && typeof ref === 'object') {
      const id = String(ref.poi_id ?? ref.id ?? ref.place_id ?? '').trim();
      const idx = id ? pois.findIndex((p) => String(p.poi_id ?? p.id ?? p.place_id) === id) : -1;
      if (idx >= 0) return { poi: { ...pois[idx], ...ref }, poiIndex: idx };
      return { poi: ref, poiIndex: -1 };
    }
    return { poi: pois[0], poiIndex: 0 };
  }

  private static resolvePoiForSlot(args: {
    scheduledPoi: any | undefined;
    scheduledList: any[] | null;
    pois: any[];
    heuristicPoiIndex: number;
    globalSlot: number;
  }): { poi: any; poiIndex: number; fromResearchSchedule: boolean } {
    const { scheduledPoi, scheduledList, pois, heuristicPoiIndex } = args;
    if (scheduledList && scheduledPoi != null) {
      const { poi, poiIndex } = IncrementalItineraryGeneratorService.mergeScheduledRefIntoPoisCatalog(scheduledPoi, pois);
      return { poi, poiIndex: poiIndex >= 0 ? poiIndex : heuristicPoiIndex, fromResearchSchedule: true };
    }
    return {
      poi: pois[heuristicPoiIndex],
      poiIndex: heuristicPoiIndex,
      fromResearchSchedule: false,
    };
  }
}
