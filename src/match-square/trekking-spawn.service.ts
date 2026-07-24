import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { MatchSquareRecruitmentPost } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HikingPlansService } from '../hiking-plans/hiking-plans.service';
import { HikingOfflinePackService } from '../hiking-demo/services/hiking-offline-pack.service';
import { HardTrekTripMetadataService } from '../hiking-demo/services/hard-trek-trip-metadata.service';
import { TrailPlanningAdapter } from '../trips/decision/adapters/trail-planning.adapter';
import { PreferenceEvolutionService } from '../agent/services/preference-evolution.service';
import { readTrekkingOrchestrationFromSnapshot } from './engine/trekking-vibe-orchestration.engine';
import {
  attachTrekkingSpawnResultSnapshot,
  buildTrekkingSpawnTripMetadata,
  listPlannedRouteCandidates,
  pickLiveRouteCandidate,
  readTrekkingSpawnResultFromSnapshot,
  toRouteResolution,
} from './engine/trekking-spawn.engine';
import {
  mergeTripMetadata,
  parseHikingSegments,
} from '../trips/utils/embedded-hiking-trip-metadata.util';
import {
  addDaysIso,
  resolveTrekCoreDayCount,
} from '../trips/utils/hiking-day-schedule.util';
import type { TrekkingSpawnPreviewView, TrekkingSpawnResultView } from './types/trekking-spawn.types';
import type { TrekkingVibeOrchestrationPlan } from './types/trekking-vibe-orchestration.types';
import { assertValidPostId } from './util/post-id.util';

@Injectable()
export class TrekkingSpawnService {
  private readonly logger = new Logger(TrekkingSpawnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hikingPlans: HikingPlansService,
    private readonly offlinePackService: HikingOfflinePackService,
    private readonly hardTrekMetadata: HardTrekTripMetadataService,
    private readonly trailAdapter: TrailPlanningAdapter,
    @Optional() private readonly preferenceEvolution?: PreferenceEvolutionService,
  ) {}

  async previewSpawnFromPost(
    userId: string,
    postId: string,
  ): Promise<TrekkingSpawnPreviewView> {
    const post = await this.loadCaptainPost(userId, postId);
    const orchestration = this.requireOrchestration(post);
    const existingSpawn = readTrekkingSpawnResultFromSnapshot(post.captainPersonaSnapshot);

    const liveCandidate = pickLiveRouteCandidate(orchestration);
    const liveRouteId = liveCandidate
      ? await this.resolveRouteDirectionId(liveCandidate.routeDirectionName)
      : null;

    const selectedRoute = liveCandidate ? toRouteResolution(liveCandidate, liveRouteId) : null;
    const plannedRoutes = await Promise.all(
      listPlannedRouteCandidates(orchestration).map(async (candidate) =>
        toRouteResolution(candidate, await this.resolveRouteDirectionId(candidate.routeDirectionName)),
      ),
    );

    let canSpawn = Boolean(selectedRoute?.routeDirectionId);
    let blockReason: string | null = null;

    if (existingSpawn) {
      canSpawn = false;
      blockReason = `已生成 Trip ${existingSpawn.tripId}，请勿重复 spawn`;
    } else if (!liveCandidate) {
      canSpawn = false;
      blockReason = '当前剧本路线均为 planned，待 GIS fixture 上线后再 spawn';
    } else if (!liveRouteId) {
      canSpawn = false;
      blockReason = `路线 ${liveCandidate.routeDirectionName} 尚未入库 RouteDirection`;
    }

    return {
      status: 'preview',
      canSpawn,
      blockReason,
      orchestration,
      selectedRoute,
      plannedRoutes,
      offlinePreloadRequired: orchestration.worldModel.offlineDataPreloadRequired,
      existingSpawn,
    };
  }

  async spawnTripFromRecruitmentPost(
    userId: string,
    postId: string,
    input?: { tripId?: string },
  ): Promise<TrekkingSpawnResultView> {
    const preview = await this.previewSpawnFromPost(userId, postId);
    if (!preview.canSpawn || !preview.selectedRoute?.routeDirectionId || !preview.orchestration) {
      throw new BadRequestException(preview.blockReason ?? '当前无法从招募帖 spawn 徒步 Trip');
    }

    const post = await this.loadCaptainPost(userId, postId);
    const orchestration = preview.orchestration;
    const routeDirectionId = preview.selectedRoute.routeDirectionId;
    const routeDirectionName = preview.selectedRoute.routeDirectionName;

    const tripId =
      input?.tripId?.trim() ||
      (await this.createMinimalTrip(userId, post, orchestration)).id;

    await this.assertTripOwnedByCaptain(tripId, userId);

    const startDate = this.formatDate(post.startDate);
    const endDate = this.formatDate(post.endDate);
    const segmentLabel = `${preview.selectedRoute.labelZh} · ${orchestration.scriptId}`;

    const { hikePlan, segment } = await this.hikingPlans.createWithSegment(userId, {
      tripId,
      routeDirectionId,
      startDate,
      endDate,
      label: segmentLabel,
      plannedDate: startDate,
    });

    const offlinePack = await this.tryLoadOfflinePack(
      orchestration,
      routeDirectionId,
    );

    await this.tryPersistHardTrekPlan(tripId, routeDirectionName);
    await this.syncTrekSegmentDateRange(tripId, startDate);

    const spawnMeta = buildTrekkingSpawnTripMetadata(postId, {
      status: 'spawned',
      postId,
      tripId,
      hikePlanId: hikePlan.id,
      segmentId: segment.segmentId,
      routeDirectionId,
      routeDirectionName,
      routeLabelZh: preview.selectedRoute.labelZh,
      orchestration,
      offlinePack,
      offlinePreloadRequired: orchestration.worldModel.offlineDataPreloadRequired,
      sharedGearDeficits: orchestration.sharedGearDeficits,
      eventStreamMilestones: orchestration.eventStreamMilestones,
      toolchain: orchestration.toolchain,
      dnaEvolutionScheduled: false,
      dnaEvolutionReason: null,
      spawnedAt: new Date().toISOString(),
    });

    await this.mergeTripSpawnMetadata(tripId, spawnMeta, orchestration, offlinePack);

    const dnaReason = orchestration.dnaEvolution.preferenceEvolutionReasonPlanned;
    const dnaEvolutionScheduled = this.scheduleDnaEvolution(userId, tripId, dnaReason);

    const result: TrekkingSpawnResultView = {
      status: 'spawned',
      postId,
      tripId,
      hikePlanId: hikePlan.id,
      segmentId: segment.segmentId,
      routeDirectionId,
      routeDirectionName,
      routeLabelZh: preview.selectedRoute.labelZh,
      orchestration,
      offlinePack,
      offlinePreloadRequired: orchestration.worldModel.offlineDataPreloadRequired,
      sharedGearDeficits: orchestration.sharedGearDeficits,
      eventStreamMilestones: orchestration.eventStreamMilestones,
      toolchain: orchestration.toolchain,
      dnaEvolutionScheduled,
      dnaEvolutionReason: dnaEvolutionScheduled ? dnaReason : null,
      spawnedAt: spawnMeta.trekkingSpawn.spawnedAt,
    };

    await this.persistSpawnResultOnPost(postId, post.captainPersonaSnapshot, result);

    this.logger.log(
      `Spawned trek trip post=${postId} trip=${tripId} hikePlan=${hikePlan.id} route=${routeDirectionName}`,
    );

    return result;
  }

  private scheduleDnaEvolution(
    userId: string,
    tripId: string,
    reason: string,
  ): boolean {
    if (!this.preferenceEvolution) return false;
    const evolutionReason = reason as 'TREK_VIBE_CONFIRMED' | 'TREK_READINESS_ACK' | 'TREK_POST_RATING_FIVE_STAR';
    if (
      evolutionReason !== 'TREK_VIBE_CONFIRMED' &&
      evolutionReason !== 'TREK_READINESS_ACK' &&
      evolutionReason !== 'TREK_POST_RATING_FIVE_STAR'
    ) {
      return false;
    }
    this.preferenceEvolution.scheduleDecisionDnaSync({
      userId,
      tripId,
      reason: evolutionReason,
    });
    return true;
  }

  private async persistSpawnResultOnPost(
    postId: string,
    snapshotRaw: unknown,
    result: TrekkingSpawnResultView,
  ): Promise<void> {
    const snapshot =
      snapshotRaw && typeof snapshotRaw === 'object'
        ? (snapshotRaw as Record<string, unknown>)
        : {};
    const nextSnapshot = attachTrekkingSpawnResultSnapshot(snapshot, result);

    await this.prisma.matchSquareRecruitmentPost.update({
      where: { id: postId },
      data: {
        captainPersonaSnapshot: nextSnapshot as object,
      },
    });
  }

  private async mergeTripSpawnMetadata(
    tripId: string,
    spawnMeta: ReturnType<typeof buildTrekkingSpawnTripMetadata>,
    orchestration: TrekkingVibeOrchestrationPlan,
    offlinePack: TrekkingSpawnResultView['offlinePack'],
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) return;

    const prev =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};

    const merged = mergeTripMetadata(prev, {
      hikingProfile: 'embedded',
      ...spawnMeta,
      trekkingOrchestration: orchestration,
      trekkingOfflinePack: offlinePack
        ? {
            geojsonUrl: offlinePack.geojsonUrl,
            tileManifestUrl: offlinePack.tileManifestUrl,
            checksum: offlinePack.checksum,
            version: offlinePack.version,
          }
        : undefined,
      trekkingSharedGearDeficits: orchestration.sharedGearDeficits,
      trekkingToolchain: orchestration.toolchain,
      trekkingEventStreamMilestones: orchestration.eventStreamMilestones,
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: merged as object, updatedAt: new Date() },
    });
  }

  /** 将 hikingSegments 结束日对齐 hardTrekTrailPlan 核心徒步天数（非整段招募帖跨度） */
  private async syncTrekSegmentDateRange(tripId: string, trekStartDate: string): Promise<void> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip?.metadata || typeof trip.metadata !== 'object') return;

      const meta = trip.metadata as Record<string, unknown>;
      const coreDays = resolveTrekCoreDayCount(meta);
      if (coreDays <= 0) return;

      const segments = parseHikingSegments(meta);
      if (!segments.length) return;

      const start = trekStartDate.slice(0, 10);
      const trekEnd = addDaysIso(start, coreDays - 1);
      const updated = segments.map((seg, index) =>
        index === 0 ? { ...seg, startDate: start, endDate: trekEnd } : seg,
      );

      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: mergeTripMetadata(meta, { hikingSegments: updated }) as object,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `syncTrekSegmentDateRange skipped trip=${tripId}: ${(error as Error).message}`,
      );
    }
  }

  private async tryPersistHardTrekPlan(tripId: string, routeDirectionName: string): Promise<void> {
    try {
      const preview = await this.trailAdapter.buildPreview({
        routeDirectionName,
        longestHike: 2,
        placeIds: [],
      });
      await this.hardTrekMetadata.persistHardTrekTrailPlan(tripId, preview);
    } catch (error) {
      this.logger.warn(
        `hardTrekTrailPlan persist skipped for trip ${tripId}: ${(error as Error).message}`,
      );
    }
  }

  private async tryLoadOfflinePack(
    orchestration: TrekkingVibeOrchestrationPlan,
    routeDirectionId: number,
  ) {
    if (!orchestration.worldModel.offlineDataPreloadRequired) return null;
    try {
      return await this.offlinePackService.getOfflinePack(routeDirectionId);
    } catch (error) {
      this.logger.warn(
        `offline pack unavailable for route ${routeDirectionId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async createMinimalTrip(
    userId: string,
    post: MatchSquareRecruitmentPost,
    orchestration: TrekkingVibeOrchestrationPlan,
  ) {
    const tripId = randomUUID();
    const startDate = post.startDate;
    const endDate = post.endDate;
    const durationDays = Math.max(
      1,
      Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1,
    );

    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          id: tripId,
          name: `${post.destination} · Premium Trek`,
          destination: this.normalizeTripDestination(post.destination),
          startDate,
          endDate,
          status: 'PLANNING',
          metadata: {
            matchSquareRecruitmentPostId: post.id,
            trekkingScriptId: orchestration.scriptId,
            trekkingOrchestrationVersion: orchestration.version,
          },
          updatedAt: new Date(),
        },
      });

      for (let i = 0; i < durationDays; i++) {
        const dayDate = new Date(startDate.getTime() + i * 86400000);
        await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId: trip.id,
            date: dayDate,
          },
        });
      }

      await tx.tripCollaborator.create({
        data: {
          id: randomUUID(),
          tripId: trip.id,
          userId,
          role: 'OWNER',
          updatedAt: new Date(),
        },
      });

      return trip;
    });
  }

  private normalizeTripDestination(destination: string): string {
    const trimmed = destination.trim();
    if (/^CN|^IS|^NP|^[A-Z]{2}$/.test(trimmed)) return trimmed.slice(0, 2).toUpperCase();
    return 'CN';
  }

  private async assertTripOwnedByCaptain(tripId: string, userId: string): Promise<void> {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collaborator) {
      throw new ForbiddenException('仅可关联本人协作的 Trip');
    }
  }

  private async resolveRouteDirectionId(routeDirectionName: string): Promise<number | null> {
    const rd = await this.prisma.routeDirection.findFirst({
      where: { name: routeDirectionName },
      select: { id: true },
    });
    return rd?.id ?? null;
  }

  private requireOrchestration(post: MatchSquareRecruitmentPost): TrekkingVibeOrchestrationPlan {
    const plan = readTrekkingOrchestrationFromSnapshot(post.captainPersonaSnapshot);
    if (!plan) {
      throw new BadRequestException('该招募帖未命中 Premium Trekking 编排计划，无法 spawn Trip');
    }
    return plan;
  }

  private async loadCaptainPost(
    userId: string,
    postId: string,
  ): Promise<MatchSquareRecruitmentPost> {
    assertValidPostId(postId);
    const post = await this.prisma.matchSquareRecruitmentPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('招募帖不存在');
    if (post.captainUserId !== userId) {
      throw new ForbiddenException('仅队长可 spawn 徒步 Trip');
    }
    return post;
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
