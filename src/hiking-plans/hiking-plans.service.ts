import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HikingTrailDetailService } from '../hiking-demo/services/hiking-trail-detail.service';
import type {
  HikePlanLiveState,
  HikePlanPrepState,
  HikePlanReviewState,
  HikePlanStatus,
  HikeTrackPointInput,
  HikeTrackSummary,
} from './types/hike-plan.types';
import type { CreateHikePlanDto, PatchHikePlanDto } from './dto/hike-plan.dto';
import {
  buildPrepFromHikingDetail,
  emptyPrep,
  mergePrepTemplatePreservingUserState,
  normalizePrepState,
  normalizeChecklistGroups,
  recomputePrepFlags,
} from './utils/hike-plan-prep-builder.util';
import {
  defaultLiveStateForStart,
  normalizeLiveState,
} from './utils/hike-plan-live-state.util';
import {
  applyRouteDeviationToLiveState,
  minDistanceToPolylineM,
} from './utils/hike-plan-route-deviation.util';
import { randomUUID } from 'crypto';
import {
  assertMetadataSizeLimit,
  embeddedHikingBadRequest,
  getMaxHikingSegments,
  isEmbeddedHikingSegmentsFlagEnabled,
  isHikeStartReadinessRequired,
  mergeTripMetadata,
  parseHikingSegments,
  validateHikingMetadataFields,
  type HikingSegment,
} from '../trips/utils/embedded-hiking-trip-metadata.util';
import type { CreateHikePlanWithSegmentDto } from './dto/create-hike-plan-with-segment.dto';

@Injectable()
export class HikingPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trailDetail: HikingTrailDetailService,
  ) {}

  async create(userId: string, dto: CreateHikePlanDto) {
    const rd = await this.prisma.routeDirection.findUnique({
      where: { id: dto.routeDirectionId },
    });
    if (!rd) {
      throw new NotFoundException(`Route direction ${dto.routeDirectionId} not found`);
    }
    if (!this.trailDetail.isHikingRoute(rd)) {
      throw new BadRequestException('Route direction is not a hiking trail');
    }

    const prep = await this.buildDefaultPrep(rd.id);

    await this.assertTripIdForCreate(userId, dto.tripId);

    const plan = await this.prisma.hikePlan.create({
      data: {
        userId,
        routeDirectionId: dto.routeDirectionId,
        tripId: dto.tripId ?? null,
        status: 'prep',
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
        plannedStartTime: dto.plannedStartTime ?? null,
        prep,
      },
      include: { routeDirection: true },
    });

    return this.serializePlan(plan);
  }

  /** 原子：创建 HikePlan 并追加 Trip.metadata.hikingSegments 一条 */
  async createWithSegment(userId: string, dto: CreateHikePlanWithSegmentDto) {
    await this.assertTripIdForCreate(userId, dto.tripId);

    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      select: { id: true, metadata: true, startDate: true, endDate: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${dto.tripId} not found`);
    }
    await this.assertTripCollaborator(dto.tripId, userId);

    const segmentId = dto.segmentId?.trim() || randomUUID();
    const existingMeta = (trip.metadata as Record<string, unknown>) || {};
    const existingSegments = parseHikingSegments(existingMeta);

    const newSegment: HikingSegment = {
      segmentId,
      startDate: dto.startDate.slice(0, 10),
      endDate: dto.endDate.slice(0, 10),
      routeDirectionId: dto.routeDirectionId,
      label: dto.label,
    };

    const nextSegments = [...existingSegments, newSegment];
    if (nextSegments.length > getMaxHikingSegments()) {
      throw embeddedHikingBadRequest(
        'TRIP_SEGMENT_LIMIT',
        `hikingSegments length must not exceed ${getMaxHikingSegments()}`,
      );
    }

    const mergedMeta = mergeTripMetadata(existingMeta, {
      hikingProfile: 'embedded',
      hikingSegments: nextSegments,
    });
    validateHikingMetadataFields(mergedMeta, {
      startDate: trip.startDate,
      endDate: trip.endDate,
    });
    assertMetadataSizeLimit(mergedMeta);

    const serializedPlan = await this.prisma.$transaction(async (tx) => {
      const plan = await this.createHikePlanInTx(tx, userId, {
        routeDirectionId: dto.routeDirectionId,
        tripId: dto.tripId,
        plannedDate: dto.plannedDate,
        plannedStartTime: dto.plannedStartTime,
      });

      newSegment.hikePlanId = plan.id;
      const segmentsWithPlan = nextSegments.map((s) =>
        s.segmentId === segmentId ? { ...s, hikePlanId: plan.id } : s,
      );
      const finalMeta = mergeTripMetadata(existingMeta, {
        hikingProfile: 'embedded',
        hikingSegments: segmentsWithPlan,
      });
      assertMetadataSizeLimit(finalMeta);

      await tx.trip.update({
        where: { id: dto.tripId },
        data: { metadata: finalMeta as object },
      });

      return { plan, segment: { ...newSegment, hikePlanId: plan.id } };
    });

    return {
      hikePlan: this.serializePlan(serializedPlan.plan),
      segment: serializedPlan.segment,
    };
  }

  private async createHikePlanInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    dto: {
      routeDirectionId: number;
      tripId: string;
      plannedDate?: string;
      plannedStartTime?: string;
    },
  ) {
    const rd = await tx.routeDirection.findUnique({
      where: { id: dto.routeDirectionId },
    });
    if (!rd) {
      throw new NotFoundException(`Route direction ${dto.routeDirectionId} not found`);
    }
    if (!this.trailDetail.isHikingRoute(rd)) {
      throw new BadRequestException('Route direction is not a hiking trail');
    }
    const prep = await this.buildDefaultPrep(rd.id);
    return tx.hikePlan.create({
      data: {
        userId,
        routeDirectionId: dto.routeDirectionId,
        tripId: dto.tripId,
        status: 'prep',
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
        plannedStartTime: dto.plannedStartTime ?? null,
        prep,
      },
      include: { routeDirection: true },
    });
  }

  async list(
    userId: string,
    filters: { status?: string; routeDirectionId?: number; tripId?: string },
  ) {
    const where: Record<string, unknown> = { userId };
    if (filters.status) where.status = filters.status;
    if (filters.routeDirectionId != null) {
      where.routeDirectionId = filters.routeDirectionId;
    }
    if (filters.tripId) {
      await this.assertTripCollaborator(filters.tripId, userId);
      where.tripId = filters.tripId;
    }

    const rows = await this.prisma.hikePlan.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { routeDirection: true },
    });
    return rows.map((p: any) => this.serializePlan(p));
  }

  async findOne(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);
    return this.serializePlan(plan);
  }

  async patch(userId: string, id: string, dto: PatchHikePlanDto) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);

    const updated = await this.prisma.hikePlan.update({
      where: { id },
      data: {
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        plannedStartTime: dto.plannedStartTime,
        status: dto.status,
      },
      include: { routeDirection: true },
    });
    return this.serializePlan(updated);
  }

  async start(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);
    if (plan.status === 'completed' || plan.status === 'cancelled') {
      throw new BadRequestException(`Cannot start plan in status ${plan.status}`);
    }

    this.assertPrepReadyForStart(plan);

    const liveState =
      plan.status === 'in_progress'
        ? normalizeLiveState(plan.liveState)
        : defaultLiveStateForStart();

    const updated = await this.prisma.hikePlan.update({
      where: { id },
      data: {
        status: 'in_progress',
        startedAt: plan.startedAt ?? new Date(),
        liveState,
      },
      include: { routeDirection: true },
    });
    return this.serializePlan(updated);
  }

  async complete(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);

    const updated = await this.prisma.hikePlan.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      include: { routeDirection: true },
    });
    return this.serializePlan(updated);
  }

  async getPrep(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);
    let prep = normalizePrepState(plan.prep);

    if (prep.checklist.length === 0 && prep.permits.length === 0) {
      prep = await this.buildDefaultPrep(plan.routeDirectionId);
      await this.prisma.hikePlan.update({
        where: { id },
        data: { prep },
      });
    }

    return prep;
  }

  async patchPrep(userId: string, id: string, patch: Partial<HikePlanPrepState>) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);

    const current = normalizePrepState(plan.prep);
    const merged: HikePlanPrepState = recomputePrepFlags({
      ...current,
      ...patch,
      checklist:
        patch.checklist !== undefined
          ? normalizeChecklistGroups(patch.checklist)
          : current.checklist,
      permits: patch.permits ?? current.permits,
      transport:
        patch.transport !== undefined
          ? { ...current.transport, ...patch.transport }
          : current.transport,
      offlineReady: patch.offlineReady ?? current.offlineReady,
    });

    await this.prisma.hikePlan.update({
      where: { id },
      data: { prep: merged, status: plan.status === 'draft' ? 'prep' : plan.status },
    });
    return merged;
  }

  /** 运营更新路线模板后，用户可主动同步 prep（保留已勾选状态） */
  async refreshPrepTemplate(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);

    const current = normalizePrepState(plan.prep);
    const fresh = await this.buildDefaultPrep(plan.routeDirectionId);
    const merged = mergePrepTemplatePreservingUserState(current, fresh);

    await this.prisma.hikePlan.update({
      where: { id },
      data: { prep: merged },
    });
    return merged;
  }

  async getLiveState(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);
    const state =
      plan.status === 'in_progress'
        ? await this.refreshRouteDeviationLiveState(plan)
        : normalizeLiveState(plan.liveState);
    return this.withActiveRisks(state);
  }

  private withActiveRisks(state: HikePlanLiveState): HikePlanLiveState {
    const routeEvents = (state.events ?? []).filter((e) => e.type === 'route');
    return { ...state, activeRisks: routeEvents };
  }

  async patchLiveState(userId: string, id: string, patch: Partial<HikePlanLiveState>) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);

    const merged = normalizeLiveState({
      ...normalizeLiveState(plan.liveState),
      ...patch,
    });
    await this.prisma.hikePlan.update({
      where: { id },
      data: { liveState: merged },
    });
    return merged;
  }

  async appendTrackPoints(
    userId: string,
    id: string,
    clientBatchId: string | undefined,
    points: HikeTrackPointInput[],
  ) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);
    if (!points.length) {
      throw new BadRequestException('points must not be empty');
    }

    const batchIds: string[] = plan.trackBatchIds ?? [];
    if (clientBatchId && batchIds.includes(clientBatchId)) {
      return { inserted: 0, duplicateBatch: true };
    }

    await this.prisma.hikeTrackPoint.createMany({
      data: points.map((p) => ({
        hikePlanId: id,
        lat: p.lat,
        lng: p.lng,
        altitudeM: p.altitudeM ?? null,
        accuracyM: p.accuracyM ?? null,
        recordedAt: new Date(p.recordedAt),
        clientBatchId: clientBatchId ?? null,
      })),
    });

    if (clientBatchId) {
      await this.prisma.hikePlan.update({
        where: { id },
        data: { trackBatchIds: [...batchIds, clientBatchId] },
      });
    }

    if (plan.status === 'in_progress') {
      const refreshed = await this.loadPlanOrThrow(id);
      await this.refreshRouteDeviationLiveState(refreshed);
    }

    return { inserted: points.length, duplicateBatch: false };
  }

  async getTrack(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);

    const rows = await this.prisma.hikeTrackPoint.findMany({
      where: { hikePlanId: id },
      orderBy: { recordedAt: 'asc' },
    });

    const points = rows.map((r: any) => ({
      lat: r.lat,
      lng: r.lng,
      altitudeM: r.altitudeM ?? undefined,
      accuracyM: r.accuracyM ?? undefined,
      recordedAt: r.recordedAt.toISOString(),
    }));

    return { points, summary: this.computeTrackSummary(points) };
  }

  async getReview(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);
    return (plan.review as HikePlanReviewState) ?? {};
  }

  async generateReview(userId: string, id: string) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);

    const { points, summary } = await this.getTrack(userId, id);
    const rd = plan.routeDirection;
    const draft: HikePlanReviewState = {
      summaryZh: `完成 ${rd?.nameCN ?? rd?.name ?? '徒步'}，全程约 ${summary.distanceKm.toFixed(1)} km，累计爬升 ${Math.round(summary.elevationGainM)} m。`,
      highlights: points.length
        ? ['GPS 轨迹已记录', `耗时约 ${Math.round(summary.durationSec / 3600)} 小时`]
        : ['未记录 GPS，建议下次开启轨迹记录'],
      lessons: ['关注天气窗口与过河时段', '提前预订山屋'],
      rating: summary.distanceKm > 0 ? 4 : 3,
      generatedAt: new Date().toISOString(),
    };

    await this.prisma.hikePlan.update({
      where: { id },
      data: { review: draft },
    });
    return draft;
  }

  async patchReview(userId: string, id: string, patch: Partial<HikePlanReviewState>) {
    const plan = await this.loadPlanOrThrow(id);
    this.assertOwner(plan, userId);

    const merged = {
      ...((plan.review as HikePlanReviewState) ?? {}),
      ...patch,
      editedAt: new Date().toISOString(),
    };
    await this.prisma.hikePlan.update({
      where: { id },
      data: { review: merged },
    });
    return merged;
  }

  /** 根据最新 GPS 与路线折线更新偏离告警事件 */
  private async refreshRouteDeviationLiveState(plan: {
    id: string;
    status: string;
    liveState: unknown;
    routeDirection: { id: number; name: string; nameCN: string | null; tags: string[]; metadata: unknown; constraints: unknown; countryCode: string | null } | null;
  }): Promise<HikePlanLiveState> {
    const base = normalizeLiveState(plan.liveState);
    if (plan.status !== 'in_progress' || !plan.routeDirection) {
      return base;
    }

    const latest = await this.prisma.hikeTrackPoint.findFirst({
      where: { hikePlanId: plan.id },
      orderBy: { recordedAt: 'desc' },
    });
    if (!latest) return base;

    const polyline = await this.resolveRoutePolyline(plan.routeDirection);
    const distanceM = polyline
      ? minDistanceToPolylineM({ lat: latest.lat, lng: latest.lng }, polyline)
      : null;

    const merged = applyRouteDeviationToLiveState(base, distanceM);
    await this.prisma.hikePlan.update({
      where: { id: plan.id },
      data: { liveState: merged },
    });
    return this.withActiveRisks(merged);
  }

  private async resolveRoutePolyline(rd: {
    id: number;
    name: string;
    nameCN: string | null;
    tags: string[];
    metadata: unknown;
    constraints: unknown;
    countryCode: string | null;
  }): Promise<Array<{ lat: number; lng: number }> | null> {
    const detail = await this.trailDetail.build(rd, {
      longestHike: 2,
      useCachedProfileFallback: true,
    });
    const poly = detail?.geometry?.polyline;
    if (!poly?.length) return null;
    return poly.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  private async buildDefaultPrep(routeDirectionId: number): Promise<HikePlanPrepState> {
    const rd = await this.prisma.routeDirection.findUnique({
      where: { id: routeDirectionId },
    });
    const detail = rd ? await this.trailDetail.build(rd, { longestHike: 2 }) : null;
    return buildPrepFromHikingDetail(detail);
  }

  private computeTrackSummary(
    points: Array<{ lat: number; lng: number; altitudeM?: number; recordedAt: string }>,
  ): HikeTrackSummary {
    if (points.length < 2) {
      return { distanceKm: 0, durationSec: 0, elevationGainM: 0, elevationLossM: 0 };
    }

    let distanceM = 0;
    let gain = 0;
    let loss = 0;

    for (let i = 1; i < points.length; i++) {
      distanceM += haversineM(points[i - 1], points[i]);
      const a0 = points[i - 1].altitudeM;
      const a1 = points[i].altitudeM;
      if (a0 != null && a1 != null) {
        const d = a1 - a0;
        if (d > 0) gain += d;
        else loss += -d;
      }
    }

    const t0 = new Date(points[0].recordedAt).getTime();
    const t1 = new Date(points[points.length - 1].recordedAt).getTime();

    return {
      distanceKm: distanceM / 1000,
      durationSec: Math.max(0, Math.round((t1 - t0) / 1000)),
      elevationGainM: gain,
      elevationLossM: loss,
    };
  }

  private async loadPlanOrThrow(id: string) {
    const plan = await this.prisma.hikePlan.findUnique({
      where: { id },
      include: { routeDirection: true },
    });
    if (!plan) throw new NotFoundException(`Hike plan ${id} not found`);
    return plan;
  }

  private assertOwner(plan: { userId: string }, userId: string) {
    if (plan.userId !== userId) {
      throw new ForbiddenException('Not your hike plan');
    }
  }

  private async assertTripCollaborator(tripId: string, userId: string): Promise<void> {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collaborator) {
      throw new ForbiddenException('You do not have access to this trip');
    }
  }

  private assertPrepReadyForStart(plan: { prep: unknown }): void {
    if (!isHikeStartReadinessRequired()) return;
    const prep = normalizePrepState(plan.prep);
    if (!prep.checklistComplete || !prep.permitsComplete) {
      throw new ForbiddenException({
        message: 'Complete required checklist and permits before starting',
        errorCode: 'READINESS_REQUIRED',
      });
    }
  }

  private async assertTripIdForCreate(
    userId: string,
    tripId: string | undefined,
  ): Promise<void> {
    if (!tripId) {
      if (isEmbeddedHikingSegmentsFlagEnabled()) {
        throw embeddedHikingBadRequest(
          'MISSING_TRIP_ID',
          'tripId is required when embedded hiking segments are enabled',
        );
      }
      return;
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    await this.assertTripCollaborator(tripId, userId);
  }

  private serializePlan(plan: any) {
    return {
      id: plan.id,
      userId: plan.userId,
      routeDirectionId: plan.routeDirectionId,
      routeDirectionName: plan.routeDirection?.name,
      nameCN: plan.routeDirection?.nameCN,
      tripId: plan.tripId,
      status: plan.status as HikePlanStatus,
      plannedDate: plan.plannedDate
        ? plan.plannedDate.toISOString().slice(0, 10)
        : null,
      plannedStartTime: plan.plannedStartTime,
      prep: plan.prep,
      liveState: plan.liveState,
      review: plan.review,
      startedAt: plan.startedAt?.toISOString() ?? null,
      completedAt: plan.completedAt?.toISOString() ?? null,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }
}

function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
