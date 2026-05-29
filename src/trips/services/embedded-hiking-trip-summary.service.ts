import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { HikingRouteReadinessService } from '../../hiking-demo/hiking-route-readiness.service';
import { HikingTrailDetailService } from '../../hiking-demo/services/hiking-trail-detail.service';
import {
  inferHikingProfile,
  parseHikingSegments,
  suggestHikingPhase,
  type HikingPhase,
  type HikingProfile,
  type HikingSegment,
} from '../utils/embedded-hiking-trip-metadata.util';

export type EmbeddedHikingSegmentSummary = HikingSegment & {
  hikePlan?: {
    id: string;
    status: string;
    plannedDate: string | null;
    routeDirectionId: number;
    checklistComplete?: boolean;
    permitsComplete?: boolean;
  };
};

export type EmbeddedHikingTripSummary = {
  tripId: string;
  hikingProfile: HikingProfile;
  hikingPhase: HikingPhase;
  segments: EmbeddedHikingSegmentSummary[];
  hikePlans: Array<{
    id: string;
    status: string;
    routeDirectionId: number;
    tripId: string | null;
    plannedDate: string | null;
    checklistComplete?: boolean;
    permitsComplete?: boolean;
  }>;
  phaseHintZh: string;
};

export type HikingSegmentEvaluateResult = {
  tripId: string;
  segment: HikingSegment;
  segmentDays: number;
  readiness: Awaited<ReturnType<HikingRouteReadinessService['evaluateRoute']>>;
  permits: Array<{
    id: string;
    titleZh: string;
    required: boolean;
    bookingUrl?: string;
    noteZh?: string;
  }>;
  feeLinesZh: string[];
  feeSummaryZh: string;
};

const PHASE_HINTS: Record<HikingPhase, string> = {
  idle: '当前行程未启用徒步片段模式',
  configure_segments: '请添加 1～3 个徒步片段日期与路线',
  link_plans: '请为每个片段创建或关联 HikePlan',
  prep: '完成装备清单与许可后再出发',
  on_trail: '已有进行中的徒步计划',
  wrap_up: '徒步片段已完成，可查看回顾',
};

@Injectable()
export class EmbeddedHikingTripSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeReadiness: HikingRouteReadinessService,
    private readonly trailDetail: HikingTrailDetailService,
  ) {}

  private async assertCollaborator(tripId: string, userId: string): Promise<void> {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collaborator) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在或您没有权限访问`);
    }
  }

  async evaluateSegment(
    tripId: string,
    segmentId: string,
    userId: string,
    options?: { longestHike?: number; plannedDate?: string },
  ): Promise<HikingSegmentEvaluateResult> {
    await this.assertCollaborator(tripId, userId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const segments = parseHikingSegments(trip.metadata);
    const segment = segments.find((s) => s.segmentId === segmentId);
    if (!segment) {
      throw new NotFoundException(`Segment ${segmentId} not found on trip ${tripId}`);
    }

    const start = new Date(`${segment.startDate}T00:00:00.000Z`);
    const end = new Date(`${segment.endDate}T00:00:00.000Z`);
    const segmentDays = Math.max(
      1,
      Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1,
    );

    const readiness = await this.routeReadiness.evaluateRoute(segment.routeDirectionId, {
      longestHike: options?.longestHike,
      userId,
      plannedDate: options?.plannedDate ?? segment.startDate,
      hikePlanId: segment.hikePlanId,
    });

    const rd = await this.prisma.routeDirection.findUnique({
      where: { id: segment.routeDirectionId },
    });
    const detail = rd
      ? await this.trailDetail.build(rd, { longestHike: options?.longestHike ?? 2 })
      : null;

    const permits =
      detail?.permits?.map((p) => ({
        id: p.id,
        titleZh: p.titleZh,
        required: p.required,
        bookingUrl: p.bookingUrl,
        noteZh: p.noteZh,
      })) ?? [];

    const feeLinesZh: string[] = [];
    for (const poi of detail?.supplies?.waterSources ?? []) {
      if (poi.nameZh) feeLinesZh.push(`补给：${poi.nameZh}`);
    }
    for (const shelter of detail?.shelters ?? []) {
      if (shelter.feeZh) {
        feeLinesZh.push(`${shelter.nameCN}：${shelter.feeZh}`);
      }
    }
    for (const p of permits.filter((x) => x.required)) {
      feeLinesZh.push(`许可：${p.titleZh}`);
    }

    const feeSummaryZh =
      feeLinesZh.length > 0
        ? feeLinesZh.join('；')
        : `片段约 ${segmentDays} 天，请在前端结合行程预算查看地面花费`;

    return {
      tripId,
      segment,
      segmentDays,
      readiness,
      permits,
      feeLinesZh,
      feeSummaryZh,
    };
  }

  async getSummary(tripId: string, userId: string): Promise<EmbeddedHikingTripSummary> {
    await this.assertCollaborator(tripId, userId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }

    const hikingProfile = inferHikingProfile(trip.metadata);
    const segments = parseHikingSegments(trip.metadata);

    const planRows = await this.prisma.hikePlan.findMany({
      where: { tripId, userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        routeDirectionId: true,
        tripId: true,
        plannedDate: true,
        prep: true,
      },
    });

    const hikePlans = planRows.map((p) => {
      const prep =
        p.prep && typeof p.prep === 'object'
          ? (p.prep as Record<string, unknown>)
          : {};
      return {
        id: p.id,
        status: p.status,
        routeDirectionId: p.routeDirectionId,
        tripId: p.tripId,
        plannedDate: p.plannedDate
          ? p.plannedDate.toISOString().slice(0, 10)
          : null,
        checklistComplete: prep.checklistComplete === true,
        permitsComplete: prep.permitsComplete === true,
      };
    });

    const planById = new Map(hikePlans.map((p) => [p.id, p]));
    const segmentsOut: EmbeddedHikingSegmentSummary[] = segments.map((seg) => {
      const linked = seg.hikePlanId ? planById.get(seg.hikePlanId) : undefined;
      return {
        ...seg,
        hikePlan: linked
          ? {
              id: linked.id,
              status: linked.status,
              plannedDate: linked.plannedDate,
              routeDirectionId: linked.routeDirectionId,
              checklistComplete: linked.checklistComplete,
              permitsComplete: linked.permitsComplete,
            }
          : undefined,
      };
    });

    const hikingPhase = suggestHikingPhase({
      hikingProfile,
      segments,
      hikePlans: planRows.map((p) => ({
        id: p.id,
        status: p.status,
        tripId: p.tripId,
      })),
    });

    return {
      tripId,
      hikingProfile,
      hikingPhase,
      segments: segmentsOut,
      hikePlans,
      phaseHintZh: PHASE_HINTS[hikingPhase],
    };
  }
}
