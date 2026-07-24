import { Injectable, Logger, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_GUIDE_SOURCE_CONFIDENCE,
  GUIDE_PLAN_VARIANT,
  type GuidePlanVariant,
} from '../constants/guide-to-plan-status.constants';
import type {
  GuideComparisonDiffRow,
  GuideTravelContext,
  ExtractedRoute,
} from '../types/guide-to-plan.types';
import type { GuideRouteRequest } from '../types/guide-spatial.types';
import { enrichCandidatesFromGuideRoutes } from '../utils/guide-plan-route.util';
import { nearestNeighborVisitOrder } from '../utils/guide-route-order.util';
import {
  appendAccommodationHotelItems,
  fillMissingDayAccommodation,
  splitHotelItemsFromDays,
  type GuideHotelCandidateRef,
} from '../utils/guide-itinerary-accommodation.util';
import { GuideRoutingGatewayService } from './guide-routing-gateway.service';
import { GuideRouteConstraintGateway } from './route-constraint/guide-route-constraint.gateway.service';
import type { GuideRouteAvailability } from '../types/guide-spatial.types';

const PARKING_MINUTES = 10;
const BUFFER_MINUTES = 15;

export interface GuideItineraryDayAccommodation {
  candidateId?: string;
  placeId?: number | null;
  name: string;
  nameEn?: string | null;
  /** hotel=具体酒店/住宿点；area=攻略仅提到区域 */
  type: 'hotel' | 'area';
  source: 'guide' | 'adjusted' | 'inferred';
  checkInTime?: string;
  areaHint?: string;
  geo?: { lat?: number; lng?: number };
}

export interface GuideItineraryDraftItem {
  candidateId?: string;
  placeId?: number | null;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  source: 'guide' | 'adjusted';
  /** 从上一站路网/启发式交通时间（分钟） */
  travelMinutesFromPrev?: number;
  visitDurationMinutes?: number;
  routeSource?: 'road_network' | 'heuristic';
}

export interface GuideItineraryDraftDay {
  day: number;
  date?: string;
  items: GuideItineraryDraftItem[];
  /** 当日晚住宿（BFF 展示；与 items 末尾 hotel 节点对应） */
  accommodation?: GuideItineraryDayAccommodation;
  drivingMinutesEstimate?: number;
  activityCount: number;
  /** 冰岛等目的地：当日路线四层可用性裁决 */
  routeAvailability?: GuideRouteAvailability;
}

export interface GuideItineraryDraft {
  days: GuideItineraryDraftDay[];
  totalDays: number;
  variant: GuidePlanVariant;
  sourceConfidence: number;
  warnings: string[];
}

export interface GuidePlanBuildResult {
  itineraryDraft: GuideItineraryDraft;
  comparisonDiff: GuideComparisonDiffRow[];
  retainedItems: object[];
  modifiedItems: object[];
  rejectedItems: object[];
  decisionReasons: object[];
  drivingIssueCount: number;
}

interface CandidateRow {
  id: string;
  candidateType: string;
  rawName: string;
  rawNameEn?: string | null;
  placeId: number | null;
  suggestedDay: number | null;
  routeOrder: number | null;
  lat?: number;
  lng?: number;
}

@Injectable()
export class GuidePlanBuilderService {
  private readonly logger = new Logger(GuidePlanBuilderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly routingGateway?: GuideRoutingGatewayService,
    @Optional() private readonly routeConstraint?: GuideRouteConstraintGateway,
  ) {}

  async build(params: {
    sessionId: string;
    variant: GuidePlanVariant;
    travelContext?: GuideTravelContext | null;
    themeNarrative?: string | null;
    suggestedTripDays?: number | null;
  }): Promise<GuidePlanBuildResult> {
    let candidates = await this.loadCandidates(params.sessionId);
    candidates = await this.enrichCandidatesFromGuideRoutes(params.sessionId, candidates);

    const totalDays = this.inferTripDays(
      params.travelContext,
      candidates,
      params.suggestedTripDays,
    );
    const maxPerDay = this.maxActivitiesPerDay(params.variant, params.travelContext);
    const startDate = params.travelContext?.startDate;
    const originalDays = this.buildOriginalDayPlan(candidates, totalDays, startDate);
    const hotelCandidates = this.toHotelCandidateRefs(candidates);
    splitHotelItemsFromDays(originalDays);
    fillMissingDayAccommodation(
      originalDays,
      hotelCandidates,
      params.travelContext?.destination ?? undefined,
    );

    const adjustedDays = this.applyVariantAdjustments(
      originalDays,
      maxPerDay,
      params.variant,
      params.travelContext,
      startDate,
    );

    const routeMode = this.mapTransportMode(params.travelContext?.transportMode);
    const countryCode = params.travelContext?.countryCode;
    let orderOptimizedDays = 0;

    if (this.routingGateway) {
      for (const day of adjustedDays) {
        const optimized = await this.optimizeDayVisitOrder(
          day,
          candidates,
          routeMode,
          countryCode,
        );
        if (optimized) orderOptimizedDays++;
        await this.assignScheduleWithRouting(day, candidates, routeMode, countryCode);
      }
    } else {
      adjustedDays.forEach((day) => this.assignDefaultTimes(day));
    }

    appendAccommodationHotelItems(adjustedDays);

    const drivingIssues = await this.detectDrivingOverload(
      adjustedDays,
      candidates,
      routeMode,
      countryCode,
    );

    if (this.routeConstraint) {
      for (const day of adjustedDays) {
        day.routeAvailability = await this.routeConstraint.assessDayRoute({
          countryCode,
          travelDate: day.date,
          placeNames: day.items.map((i) => i.name),
          drivingMinutes: day.drivingMinutesEstimate,
          routeExists: day.items.length > 0,
          travelContext: params.travelContext,
        });
      }
    }

    const constraintWarnings = adjustedDays.flatMap((d) => d.routeAvailability?.warnings ?? []);
    const constraintBlocks = adjustedDays.some(
      (d) => d.routeAvailability && !d.routeAvailability.operationallyAvailable,
    );

    const comparisonDiff = this.buildComparisonDiff(
      originalDays,
      adjustedDays,
      drivingIssues,
      orderOptimizedDays,
      constraintWarnings,
    );

    const { retained, modified, rejected } = this.classifyItems(originalDays, adjustedDays);

    const warnings = [
      '攻略来源信息默认 L1 可信度，部分约束尚未官方验证',
      this.routingGateway
        ? '每日顺序与驾驶时间基于路网计算（不可路由段降级为启发式估算）'
        : '路网服务不可用，驾驶时间为直线距离估算',
      '路线可用性经 RouteConstraintGateway 评估（Exists → Allowed → Available → Recommended）',
      ...constraintWarnings,
      ...drivingIssues.map((d) => d.message),
    ];

    if (constraintBlocks) {
      warnings.push('部分日期路线存在硬约束拦截，请调整出行条件、车型或日期');
    }

    return {
      itineraryDraft: {
        days: adjustedDays,
        totalDays: adjustedDays.length,
        variant: params.variant,
        sourceConfidence: DEFAULT_GUIDE_SOURCE_CONFIDENCE,
        warnings,
      },
      comparisonDiff,
      retainedItems: retained,
      modifiedItems: modified,
      rejectedItems: rejected,
      decisionReasons: comparisonDiff.map((d) => ({
        code: 'GUIDE_ADJUSTMENT',
        aspect: d.aspect,
        message: d.reason ?? d.adjustedPlan,
      })),
      drivingIssueCount: drivingIssues.length,
    };
  }

  private async loadCandidates(sessionId: string): Promise<CandidateRow[]> {
    const rows = await this.prisma.guideInspirationCandidate.findMany({
      where: {
        sessionId,
        candidateType: { in: ['poi', 'activity', 'restaurant', 'hotel'] },
      },
      orderBy: [{ suggestedDay: 'asc' }, { routeOrder: 'asc' }],
    });

    const placeIds = rows.map((r) => r.placeId).filter((id): id is number => id != null);
    const coords = new Map<number, { lat: number; lng: number }>();
    if (placeIds.length > 0) {
      const geoRows = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
        SELECT p.id, ST_Y(p.location::geometry) as lat, ST_X(p.location::geometry) as lng
        FROM "Place" p
        WHERE p.id = ANY(${placeIds}::int[]) AND p.location IS NOT NULL
      `;
      for (const g of geoRows) {
        coords.set(g.id, { lat: g.lat, lng: g.lng });
      }
    }

    return rows.map((r) => {
      const c = r.placeId ? coords.get(r.placeId) : undefined;
      return {
        id: r.id,
        candidateType: r.candidateType,
        rawName: r.rawName,
        rawNameEn: r.rawNameEn,
        placeId: r.placeId,
        suggestedDay: r.suggestedDay,
        routeOrder: r.routeOrder,
        lat: c?.lat ?? undefined,
        lng: c?.lng ?? undefined,
      };
    });
  }

  private toHotelCandidateRefs(candidates: CandidateRow[]): GuideHotelCandidateRef[] {
    return candidates
      .filter((c) => c.candidateType === 'hotel')
      .map((c) => ({
        id: c.id,
        rawName: c.rawName,
        rawNameEn: c.rawNameEn,
        placeId: c.placeId,
        suggestedDay: c.suggestedDay,
        lat: c.lat,
        lng: c.lng,
      }));
  }

  private async enrichCandidatesFromGuideRoutes(
    sessionId: string,
    candidates: CandidateRow[],
  ): Promise<CandidateRow[]> {
    const guides = await this.prisma.importedGuide.findMany({
      where: { sessionId },
      select: { extractedRoutes: true },
    });
    const routes = guides.flatMap(
      (g) => (g.extractedRoutes as unknown as ExtractedRoute[] | null) ?? [],
    );
    if (routes.length === 0) return candidates;

    return enrichCandidatesFromGuideRoutes(candidates, routes);
  }

  private inferTripDays(
    travelContext: GuideTravelContext | null | undefined,
    candidates: CandidateRow[],
    suggestedTripDays?: number | null,
  ): number {
    if (travelContext?.startDate && travelContext?.endDate) {
      const start = DateTime.fromISO(travelContext.startDate);
      const end = DateTime.fromISO(travelContext.endDate);
      const days = Math.ceil(end.diff(start, 'days').days) + 1;
      if (days >= 1 && days <= 30) return days;
    }
    if (suggestedTripDays && suggestedTripDays >= 1 && suggestedTripDays <= 30) {
      return suggestedTripDays;
    }
    const maxSuggested = candidates.reduce((m, c) => Math.max(m, c.suggestedDay ?? 0), 0);
    return Math.max(3, maxSuggested || 3);
  }

  private maxActivitiesPerDay(
    variant: GuidePlanVariant,
    ctx?: GuideTravelContext | null,
  ): number {
    const hasSeniors = (ctx?.travelers?.seniors ?? 0) > 0;
    const hasChildren = (ctx?.travelers?.children ?? 0) > 0;

    switch (variant) {
      case GUIDE_PLAN_VARIANT.FAITHFUL:
        return 7;
      case GUIDE_PLAN_VARIANT.COMFORTABLE:
        return hasSeniors || hasChildren ? 2 : 3;
      case GUIDE_PLAN_VARIANT.RISK_MIN:
        return 2;
      case GUIDE_PLAN_VARIANT.PHOTOGRAPHY:
        return 4;
      default:
        return hasSeniors || hasChildren ? 3 : 4;
    }
  }

  private buildOriginalDayPlan(
    candidates: CandidateRow[],
    totalDays: number,
    startDate?: string,
  ): GuideItineraryDraftDay[] {
    const tripStart = startDate ? DateTime.fromISO(startDate) : null;
    const days: GuideItineraryDraftDay[] = Array.from({ length: totalDays }, (_, i) => ({
      day: i + 1,
      date: tripStart?.plus({ days: i }).toISODate() ?? undefined,
      items: [],
      activityCount: 0,
    }));

    const unassigned: CandidateRow[] = [];
    const byDay = new Map<number, CandidateRow[]>();
    for (const c of candidates) {
      if (c.suggestedDay && c.suggestedDay >= 1 && c.suggestedDay <= totalDays) {
        const list = byDay.get(c.suggestedDay) ?? [];
        list.push(c);
        byDay.set(c.suggestedDay, list);
      } else {
        unassigned.push(c);
      }
    }

    for (const [dayNum, list] of byDay) {
      list.sort((a, b) => (a.routeOrder ?? 999) - (b.routeOrder ?? 999));
      for (const c of list) {
        days[dayNum - 1].items.push(
          this.toDraftItem(c, 'guide', days[dayNum - 1].date),
        );
      }
    }

    let dayIdx = 0;
    for (const c of unassigned) {
      while (dayIdx < totalDays && days[dayIdx].items.length >= 6) dayIdx++;
      if (dayIdx >= totalDays) dayIdx = totalDays - 1;
      days[dayIdx].items.push(this.toDraftItem(c, 'guide', days[dayIdx].date));
      dayIdx++;
    }

    for (const day of days) {
      day.activityCount = day.items.length;
      this.assignDefaultTimes(day);
    }
    return days;
  }

  private applyVariantAdjustments(
    original: GuideItineraryDraftDay[],
    maxPerDay: number,
    variant: GuidePlanVariant,
    ctx?: GuideTravelContext | null,
    startDate?: string,
  ): GuideItineraryDraftDay[] {
    const tripStart = startDate ? DateTime.fromISO(startDate) : null;
    const adjusted: GuideItineraryDraftDay[] = original.map((d) => ({
      ...d,
      items: d.items.map((i) => ({ ...i })),
    }));

    const preserve = new Set(
      (ctx?.preserveExperiences ?? []).map((s) => s.trim().toLowerCase()),
    );

    const overflow: GuideItineraryDraftItem[] = [];
    for (const day of adjusted) {
      if (day.items.length <= maxPerDay) continue;

      const originalLen = day.items.length;
      const pinned = day.items.filter((i) => preserve.has(i.name.toLowerCase()));
      const rest = day.items.filter((i) => !preserve.has(i.name.toLowerCase()));
      const keepCount = Math.max(maxPerDay, pinned.length);
      const kept = [...pinned, ...rest].slice(0, keepCount);
      overflow.push(...day.items.filter((i) => !kept.some((k) => k.name === i.name)));
      day.items = kept.map((i) => ({
        ...i,
        source: kept.length < originalLen ? ('adjusted' as const) : i.source,
      }));
      day.activityCount = day.items.length;
    }

    if (overflow.length > 0 && variant !== GUIDE_PLAN_VARIANT.FAITHFUL) {
      let targetDay = adjusted.length - 1;
      for (const item of overflow) {
        while (targetDay >= 0 && adjusted[targetDay].items.length >= maxPerDay) {
          targetDay--;
        }
        if (targetDay < 0) {
          const newDayIndex = adjusted.length;
          adjusted.push({
            day: newDayIndex + 1,
            date: tripStart?.plus({ days: newDayIndex }).toISODate() ?? undefined,
            items: [],
            activityCount: 0,
          });
          targetDay = adjusted.length - 1;
        }
        adjusted[targetDay].items.push({ ...item, source: 'adjusted' });
        adjusted[targetDay].activityCount = adjusted[targetDay].items.length;
        this.assignDefaultTimes(adjusted[targetDay]);
      }
    }

    if (variant === GUIDE_PLAN_VARIANT.RISK_MIN) {
      for (const day of adjusted) {
        day.items = day.items.map((i) => {
          const hour = parseInt(i.startTime.slice(11, 13), 10);
          if (hour >= 18) {
            return {
              ...i,
              startTime: i.startTime.replace(/T\d{2}:/, 'T10:'),
              endTime: i.endTime.replace(/T\d{2}:/, 'T12:'),
              source: 'adjusted' as const,
            };
          }
          return i;
        });
      }
    }

    adjusted.forEach((day, idx) => {
      day.day = idx + 1;
      day.date = tripStart?.plus({ days: idx }).toISODate() ?? day.date;
      this.assignDefaultTimes(day);
    });

    return adjusted;
  }

  private toDraftItem(
    c: CandidateRow,
    source: 'guide' | 'adjusted',
    baseDate?: string,
  ): GuideItineraryDraftItem {
    const datePrefix = baseDate ?? '1970-01-01';
    return {
      candidateId: c.id,
      placeId: c.placeId,
      name: c.rawName,
      type: c.candidateType,
      startTime: `${datePrefix}T09:00:00.000Z`,
      endTime: `${datePrefix}T11:00:00.000Z`,
      source,
    };
  }

  private assignDefaultTimes(day: GuideItineraryDraftDay) {
    const baseDate = day.date ?? '1970-01-01';
    let cursor = DateTime.fromISO(`${baseDate}T09:00:00.000Z`, { zone: 'utc' });
    for (const item of day.items) {
      const visitMin = this.visitDurationMinutes(item.type);
      item.visitDurationMinutes = visitMin;
      item.startTime = cursor.toISO()!;
      item.endTime = cursor.plus({ minutes: visitMin }).toISO()!;
      cursor = cursor.plus({ minutes: visitMin + BUFFER_MINUTES });
    }
  }

  private mapTransportMode(
    mode?: GuideTravelContext['transportMode'],
  ): GuideRouteRequest['mode'] {
    if (mode === 'bus') return 'TRANSIT';
    return 'DRIVING';
  }

  private visitDurationMinutes(type: string): number {
    if (type === 'restaurant') return 90;
    if (type === 'hotel') return 30;
    return 120;
  }

  private coordForItem(
    item: GuideItineraryDraftItem,
    candidates: CandidateRow[],
  ): { lat: number; lng: number } | null {
    if (!item.placeId) return null;
    const row = candidates.find((c) => c.placeId === item.placeId);
    if (row?.lat == null || row?.lng == null) return null;
    return { lat: row.lat, lng: row.lng };
  }

  private async optimizeDayVisitOrder(
    day: GuideItineraryDraftDay,
    candidates: CandidateRow[],
    mode: GuideRouteRequest['mode'],
    countryCode?: string,
  ): Promise<boolean> {
    if (!this.routingGateway) return false;

    const routable = day.items
      .map((item, index) => ({ item, index, coord: this.coordForItem(item, candidates) }))
      .filter((x): x is typeof x & { coord: { lat: number; lng: number } } => x.coord != null);

    if (routable.length < 2) return false;

    const matrix = await this.routingGateway.calculateMatrix(
      routable.map((r) => ({
        id: r.item.candidateId ?? `${day.day}-${r.index}`,
        placeId: r.item.placeId ?? undefined,
        lat: r.coord.lat,
        lng: r.coord.lng,
      })),
      mode,
      countryCode,
    );

    const order = nearestNeighborVisitOrder(matrix.minutes, 0);
    const reordered = order.map((idx) => routable[idx].item);
    const withoutCoords = day.items.filter((i) => !this.coordForItem(i, candidates));
    const originalNames = day.items.map((i) => i.name).join('|');
    day.items = [...reordered, ...withoutCoords];
    day.activityCount = day.items.length;

    const changed = day.items.map((i) => i.name).join('|') !== originalNames;
    if (changed) {
      for (const item of reordered) {
        if (item.source === 'guide') item.source = 'adjusted';
      }
    }
    return changed;
  }

  private async assignScheduleWithRouting(
    day: GuideItineraryDraftDay,
    candidates: CandidateRow[],
    mode: GuideRouteRequest['mode'],
    countryCode?: string,
  ) {
    const baseDate = day.date ?? '1970-01-01';
    let cursor = DateTime.fromISO(`${baseDate}T09:00:00.000Z`, { zone: 'utc' });

    for (let i = 0; i < day.items.length; i++) {
      const item = day.items[i];
      const visitMin = this.visitDurationMinutes(item.type);
      item.visitDurationMinutes = visitMin;

      if (i > 0 && this.routingGateway) {
        const prev = day.items[i - 1];
        const from = this.coordForItem(prev, candidates);
        const to = this.coordForItem(item, candidates);
        if (from && to) {
          const route = await this.routingGateway.calculateRoute({
            from: { ...from, placeId: prev.placeId ?? undefined },
            to: { ...to, placeId: item.placeId ?? undefined },
            mode,
            countryCode,
          });
          const travelMin = route.durationMinutes + PARKING_MINUTES;
          item.travelMinutesFromPrev = travelMin;
          item.routeSource = route.source;
          cursor = cursor.plus({ minutes: travelMin });
        }
      }

      item.startTime = cursor.toISO()!;
      item.endTime = cursor.plus({ minutes: visitMin }).toISO()!;
      cursor = cursor.plus({ minutes: visitMin + BUFFER_MINUTES });
    }
  }

  private async detectDrivingOverload(
    days: GuideItineraryDraftDay[],
    candidates: CandidateRow[],
    mode: GuideRouteRequest['mode'],
    countryCode?: string,
  ) {
    const issues: Array<{ day: number; minutes: number; message: string }> = [];

    for (const day of days) {
      let totalMinutes = 0;
      for (let i = 1; i < day.items.length; i++) {
        const prev = day.items[i - 1];
        const curr = day.items[i];
        if (curr.travelMinutesFromPrev != null) {
          totalMinutes += curr.travelMinutesFromPrev;
          continue;
        }
        const from = this.coordForItem(prev, candidates);
        const to = this.coordForItem(curr, candidates);
        if (!from || !to) continue;

        if (this.routingGateway) {
          const route = await this.routingGateway.calculateRoute({
            from: { ...from, placeId: prev.placeId ?? undefined },
            to: { ...to, placeId: curr.placeId ?? undefined },
            mode,
            countryCode,
          });
          totalMinutes += route.durationMinutes + PARKING_MINUTES;
        }
      }

      day.drivingMinutesEstimate = totalMinutes;
      if (totalMinutes > 360) {
        issues.push({
          day: day.day,
          minutes: totalMinutes,
          message: `第 ${day.day} 天预计驾驶约 ${Math.round(totalMinutes / 60)} 小时（路网估算），存在疲劳驾驶风险`,
        });
      }
    }
    return issues;
  }

  private buildComparisonDiff(
    original: GuideItineraryDraftDay[],
    adjusted: GuideItineraryDraftDay[],
    drivingIssues: Array<{ day: number; minutes: number; message: string }>,
    orderOptimizedDays = 0,
    constraintWarnings: string[] = [],
  ): GuideComparisonDiffRow[] {
    const rows: GuideComparisonDiffRow[] = [];

    const origCount = original.reduce((s, d) => s + d.items.length, 0);
    const adjCount = adjusted.reduce((s, d) => s + d.items.length, 0);
    if (origCount !== adjCount || adjusted.length !== original.length) {
      rows.push({
        aspect: '行程天数/活动数',
        originalGuide: `${original.length} 天，约 ${origCount} 个活动`,
        adjustedPlan: `${adjusted.length} 天，约 ${adjCount} 个活动`,
        reason: '根据成员节奏与可执行性重新分配',
      });
    }

    for (const issue of drivingIssues) {
      rows.push({
        aspect: `Day ${issue.day} 驾驶`,
        originalGuide: `约 ${Math.round(issue.minutes / 60)} 小时`,
        adjustedPlan: '建议拆分或调整顺序',
        reason: issue.message,
      });
    }

    if (orderOptimizedDays > 0) {
      rows.push({
        aspect: '日内顺序',
        originalGuide: '按攻略文本顺序',
        adjustedPlan: `${orderOptimizedDays} 天已按路网耗时重排`,
        reason: '减少折返与无效驾驶',
      });
    }

    if (constraintWarnings.length > 0) {
      rows.push({
        aspect: '道路约束',
        originalGuide: '攻略未验证 F-road/季节',
        adjustedPlan: constraintWarnings.slice(0, 2).join('；'),
        reason: '道路约束 Pack 裁决',
      });
    }

    const movedItems = adjusted.flatMap((d) => d.items.filter((i) => i.source === 'adjusted'));
    if (movedItems.length > 0) {
      rows.push({
        aspect: '活动安排',
        originalGuide: '按攻略原顺序/密度',
        adjustedPlan: `${movedItems.length} 项已调整时间或日期`,
        reason: '提升可执行性与安全裕度',
      });
    }

    return rows;
  }

  private classifyItems(original: GuideItineraryDraftDay[], adjusted: GuideItineraryDraftDay[]) {
    const origNames = new Set(original.flatMap((d) => d.items.map((i) => i.name)));
    const adjNames = new Set(adjusted.flatMap((d) => d.items.map((i) => i.name)));

    const retained = [...adjNames].filter((n) => origNames.has(n)).map((name) => ({ name }));
    const rejected = [...origNames].filter((n) => !adjNames.has(n)).map((name) => ({ name }));
    const modified = adjusted
      .flatMap((d) => d.items)
      .filter((i) => i.source === 'adjusted')
      .map((i) => ({ name: i.name, placeId: i.placeId }));

    return { retained, modified, rejected };
  }
}
