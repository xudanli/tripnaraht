import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttractionExploreRouteDetourService } from '../../attraction-explore/services/attraction-explore-route-detour.service';
import { resolvePlaceCoordsOrNull } from '../../attraction-explore/utils/attraction-explore-place.util';
import { PlanningModeService, type PlanningWorkbenchMode } from './planning-mode.service';
import { PlanProposalStoreService } from './plan-proposal-store.service';
import type { PlanningDecisionOption } from '../types/planning-decision-pack.types';
import { enrichOptionSolutionCard } from '../utils/plan-option-solution-card.util';

export interface CopilotSuggestion {
  id: string;
  kind:
    | 'unplaced_must_go'
    | 'time_gap'
    | 'high_detour_candidate'
    | 'active_proposal'
    | 'fill_gaps_action';
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
  actionHint?: {
    method: 'GET' | 'POST';
    path: string;
    body?: Record<string, unknown>;
  };
  /** P0 结构化选项语义 */
  option?: PlanningDecisionOption;
}

export interface CopilotSuggestionsView {
  tripId: string;
  mode: PlanningWorkbenchMode;
  suggestions: CopilotSuggestion[];
}

@Injectable()
export class ArrangeItineraryCopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planningMode: PlanningModeService,
    private readonly proposalStore: PlanProposalStoreService,
    private readonly routeDetour: AttractionExploreRouteDetourService,
  ) {}

  async getSuggestions(tripId: string): Promise<CopilotSuggestionsView> {
    const mode = await this.planningMode.getMode(tripId);
    const suggestions: CopilotSuggestion[] = [];

    const [candidates, tripDays, placedPlaceIds, routeItems] = await Promise.all([
      this.prisma.tripAttractionExploreCandidate.findMany({
        where: { tripId },
        include: { Place: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.tripDay.findMany({
        where: { tripId },
        orderBy: { date: 'asc' },
        select: { id: true, date: true },
      }),
      this.loadPlacedPlaceIds(tripId),
      this.prisma.itineraryItem.findMany({
        where: { TripDay: { tripId }, placeId: { not: null } },
        select: { placeId: true },
      }),
    ]);

    const activeProposal = this.proposalStore
      .listByTrip(tripId, ['AWAITING_CONFIRMATION', 'PREVIEW'])
      .at(0);
    if (activeProposal) {
      suggestions.push({
        id: `proposal-${activeProposal.proposalId}`,
        kind: 'active_proposal',
        title: '有待确认的行程草案',
        detail: `${activeProposal.intent} · ${activeProposal.changes.length} 项变更`,
        priority: 'high',
        actionHint: {
          method: 'GET',
          path: `/api/trips/${tripId}/arrange-itinerary/proposals/${activeProposal.proposalId}`,
        },
        option: activeProposal.decisionPack?.options[0],
      });
    }

    const unplacedMustGo = candidates.filter(
      (c) => c.priority === 'must_go' && !placedPlaceIds.has(c.placeId),
    );
    for (const row of unplacedMustGo.slice(0, 3)) {
      suggestions.push({
        id: `must-go-${row.id}`,
        kind: 'unplaced_must_go',
        title: `必去景点尚未编排：${row.Place.nameCN}`,
        detail: mode.mode === 'copilot'
          ? '可一键生成地图插入草案'
          : '建议打开编排页安排到具体日期',
        priority: 'high',
        actionHint: {
          method: 'POST',
          path: `/api/trips/${tripId}/attraction-explore/map/place-proposal`,
          body: { placeId: row.placeId, candidateId: row.id },
        },
        option: enrichOptionSolutionCard(
          {
            id: `must-go-opt-${row.id}`,
            optionKind: 'SHIFT_LATER',
            title: `编排必去：${row.Place.nameCN}`,
            recommended: true,
            outcomes: ['景点进入正式日程', '从候选池移除（可选）'],
            costs: ['可能增加当日驾驶与空档占用'],
            impactScope: {
              scope: 'DAY',
              affectedDays: [],
              itemIds: [],
              candidateIds: [row.id],
              placeIds: [row.placeId],
            },
            counterfactualRows: [
              {
                id: `cf_${row.id}`,
                label: row.Place.nameCN,
                before: '（仅在候选池）',
                after: '（排入行程）',
                placeId: row.placeId,
              },
            ],
          },
          { letterIndex: 0 },
        ),
      });
    }

    const routeAnchors = (
      await this.prisma.place.findMany({
        where: { id: { in: [...new Set(routeItems.map((r) => r.placeId!).filter(Boolean))] } },
      })
    )
      .map((p) => resolvePlaceCoordsOrNull(p))
      .filter((c): c is { lat: number; lng: number } => c != null);

    const unplaced = candidates.filter((c) => !placedPlaceIds.has(c.placeId));
    for (const row of unplaced.slice(0, 5)) {
      const coords = resolvePlaceCoordsOrNull(row.Place);
      if (!coords || routeAnchors.length < 2) continue;
      const detour = await this.routeDetour.estimatePlaceDetourToRouteAsync({
        place: coords,
        routeAnchors,
      });
      if (detour && detour.detourMinutes > 50) {
        suggestions.push({
          id: `detour-${row.id}`,
          kind: 'high_detour_candidate',
          title: `${row.Place.nameCN} 绕路约 ${detour.detourMinutes} 分钟`,
          detail: '加入行程可能显著增加驾驶时间',
          priority: 'medium',
        });
      }
    }

    for (let dayIndex = 0; dayIndex < tripDays.length; dayIndex += 1) {
      const tripDay = tripDays[dayIndex]!;
      const gap = await this.findLargestGap(tripDay.id, tripDay.date);
      if (gap && gap.durationMinutes >= 120) {
        const dayNum = dayIndex + 1;
        suggestions.push({
          id: `gap-day-${dayNum}`,
          kind: 'time_gap',
          title: `第 ${dayNum} 天有 ${Math.round(gap.durationMinutes / 60)} 小时空档`,
          detail: `约 ${this.formatTime(gap.start)} 起可安排活动`,
          priority: mode.mode === 'copilot' ? 'medium' : 'low',
          actionHint:
            mode.mode === 'copilot'
              ? {
                  method: 'POST',
                  path: `/api/trips/${tripId}/arrange-itinerary/ai-actions`,
                  body: { action: 'fill_gaps', dayIndex: dayNum, commitMode: 'proposal' },
                }
              : undefined,
          option: enrichOptionSolutionCard(
            {
              id: `gap-opt-day-${dayNum}`,
              optionKind: 'SHIFT_LATER',
              title: `填补第 ${dayNum} 天空档`,
              recommended: mode.mode === 'copilot',
              outcomes: [`利用约 ${Math.round(gap.durationMinutes / 60)} 小时安排活动`],
              costs: ['可能增加当日驾驶或压缩相邻时段'],
              impactScope: {
                scope: 'DAY',
                affectedDays: [dayNum],
                itemIds: [],
                candidateIds: [],
                placeIds: [],
              },
              counterfactualRows: [
                {
                  id: `cf_gap_${dayNum}`,
                  label: `第 ${dayNum} 天空档`,
                  dayIndex: dayNum,
                  before: `${this.formatTime(gap.start)} 起空闲`,
                  after: '（安排候选活动）',
                },
              ],
            },
            { letterIndex: 0 },
          ),
        });
      }
    }

    if (mode.mode === 'copilot' && unplacedMustGo.length > 0 && !activeProposal) {
      suggestions.push({
        id: 'copilot-fill-gaps',
        kind: 'fill_gaps_action',
        title: '协同模式：可自动填补空档',
        detail: `仍有 ${unplacedMustGo.length} 个必去候选未安排`,
        priority: 'medium',
        actionHint: {
          method: 'POST',
          path: `/api/trips/${tripId}/arrange-itinerary/ai-actions`,
          body: { action: 'fill_gaps', commitMode: 'proposal' },
        },
        option: {
          id: 'copilot-fill-gaps-opt',
          optionKind: 'SHIFT_LATER',
          title: '自动填补空档并编排候选',
          outcomes: ['尝试将未排候选填入日程空档'],
          costs: ['生成草案，需用户确认后写入'],
          impactScope: {
            scope: 'TRIP',
            affectedDays: [],
            itemIds: [],
            candidateIds: unplacedMustGo.map((c) => c.id),
            placeIds: unplacedMustGo.map((c) => c.placeId),
          },
          counterfactualRows: unplacedMustGo.slice(0, 3).map((c, i) => ({
            id: `cf_fill_${i}`,
            label: c.Place.nameCN,
            before: '（候选池）',
            after: '（尝试排入空档）',
            placeId: c.placeId,
          })),
        },
      });
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return {
      tripId,
      mode: mode.mode,
      suggestions: suggestions.slice(0, 12),
    };
  }

  private async loadPlacedPlaceIds(tripId: string): Promise<Set<number>> {
    const rows = await this.prisma.itineraryItem.findMany({
      where: { TripDay: { tripId }, placeId: { not: null } },
      select: { placeId: true },
    });
    return new Set(rows.map((r) => r.placeId!).filter(Boolean));
  }

  private async findLargestGap(
    tripDayId: string,
    dayDate: Date,
  ): Promise<{ start: Date; durationMinutes: number } | null> {
    const items = await this.prisma.itineraryItem.findMany({
      where: { tripDayId, startTime: { not: null }, endTime: { not: null } },
      orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
      select: { startTime: true, endTime: true },
    });

    if (items.length === 0) {
      const start = DateTime.fromJSDate(dayDate, { zone: 'utc' })
        .set({ hour: 9, minute: 0 })
        .toJSDate();
      const end = DateTime.fromJSDate(dayDate, { zone: 'utc' })
        .set({ hour: 18, minute: 0 })
        .toJSDate();
      return { start, durationMinutes: 540 };
    }

    let best: { start: Date; durationMinutes: number } | null = null;
    let cursor = DateTime.fromJSDate(dayDate, { zone: 'utc' })
      .set({ hour: 9, minute: 0 })
      .toJSDate();

    for (const item of items) {
      if (!item.startTime || !item.endTime) continue;
      const gapMinutes = DateTime.fromJSDate(item.startTime, { zone: 'utc' }).diff(
        DateTime.fromJSDate(cursor, { zone: 'utc' }),
        'minutes',
      ).minutes;
      if (gapMinutes >= 90 && (!best || gapMinutes > best.durationMinutes)) {
        best = { start: cursor, durationMinutes: gapMinutes };
      }
      cursor = item.endTime;
    }

    return best;
  }

  private formatTime(value: Date): string {
    return DateTime.fromJSDate(value, { zone: 'utc' }).toFormat('HH:mm');
  }
}
