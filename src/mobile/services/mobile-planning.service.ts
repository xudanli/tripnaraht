import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { PlanningOrchestratorFacadeService } from '../../trips/arrange-itinerary/services/planning-orchestrator-facade.service';
import { ArrangeItineraryItemsService } from '../../trips/arrange-itinerary/services/arrange-itinerary-items.service';
import { ItemType } from '../../itinerary-items/dto/create-itinerary-item.dto';
import { TripContextSnapshotAssemblerService } from '../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import { loadPlaceCoordinatesBatch } from '../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import { mapCollaboratorRole, computeMobileContextVersion } from '../utils/mobile-execution.util';
import { resolveTravelerCount } from '../../trips/utils/collab-overview.util';
import {
  hasCompletedProfile,
  readStoredField,
  readStoredString,
} from '../../trips/member-invites/utils/member-onboarding-profile.projection.util';
import type {
  MobileDayThemesBatchResultDto,
  MobileDayThemeUpdateResultDto,
  MobilePlanningTeamStatusDto,
  MobileRouteBlueprintDto,
  MobileRouteBlueprintOverviewSummaryDto,
  PatchDayThemeBodyDto,
  PatchDayThemesBodyDto,
  AddPlanningActivityBodyDto,
} from '../dto/mobile-planning.types';
import type { AttractionExploreAutoArrangeDto } from '../../trips/attraction-explore/dto/attraction-explore.dto';
import {
  projectPlanningTeamMember,
  truncateFocusAreas,
  type PlanningMemberProfilingFacts,
} from '../utils/planning-team-status.projection.util';
import {
  classifyBlueprintStop,
  projectRouteBlueprint,
  projectRouteBlueprintOverviewSummary,
  type RouteBlueprintDayFact,
} from '../utils/route-blueprint.projection.util';
import {
  applyDayThemeMutation,
  lookupDayTheme,
  normalizeLabelWriteInput,
  normalizeThemeWriteInput,
  readDayLabelMap,
  readDayThemeMap,
} from '../utils/day-theme-write.util';
import { TripContextChangeNotifierService } from '../ws/trip-context-change-notifier.service';
import { ContextualRecommendationsCommitService } from '../../trips/contextual-recommendations/services/contextual-recommendations-commit.service';
import type { ContextualRecommendationsCommitDto } from '../../trips/contextual-recommendations/dto/contextual-recommendations.dto';
import type { ContextualCommitResult } from '../../trips/contextual-recommendations/services/contextual-recommendations-commit.service';

type MobilePlanningIdempotentResponse =
  | MobileDayThemeUpdateResultDto
  | MobileDayThemesBatchResultDto
  | (ContextualCommitResult & { contextVersion: number; planVersion: number });

@Injectable()
export class MobilePlanningService {
  private readonly idempotency = new Map<
    string,
    { bodyHash: string; response: MobilePlanningIdempotentResponse }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly orchestrator: PlanningOrchestratorFacadeService,
    private readonly arrangeItems: ArrangeItineraryItemsService,
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly contextNotifier: TripContextChangeNotifierService,
    private readonly contextualCommit: ContextualRecommendationsCommitService,
  ) {}

  /**
   * Planning-phase route blueprint (day structure summary, not map geometry).
   * GET /api/mobile/trips/:tripId/planning/route-blueprint
   */
  async getRouteBlueprint(
    tripId: string,
    userId: string,
    opts?: { locale?: string; focusDayNumber?: number },
  ): Promise<MobileRouteBlueprintDto> {
    await this.access.assertTripMember(tripId, userId);
    void opts?.locale;

    const [tripRow, versions] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          name: true,
          destination: true,
          startDate: true,
          endDate: true,
          metadata: true,
          updatedAt: true,
          TripDay: {
            orderBy: { date: 'asc' },
            include: {
              ItineraryItem: {
                include: {
                  Place: {
                    include: {
                      City: { select: { name: true, nameCN: true, nameEN: true } },
                    },
                  },
                },
                orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
              },
            },
          },
        },
      }),
      this.resolvePlanVersions(tripId),
    ]);

    if (!tripRow) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `行程 ${tripId} 不存在` });
    }

    const placeIds: number[] = [];
    for (const day of tripRow.TripDay) {
      for (const item of day.ItineraryItem) {
        if (item.placeId) placeIds.push(item.placeId);
      }
    }
    const coordsMap = await loadPlaceCoordinatesBatch(this.prisma, placeIds);
    const dayThemes = this.resolveDayThemes(tripRow.metadata);
    const dayLabels = this.resolveDayLabels(tripRow.metadata);

    const days: RouteBlueprintDayFact[] = tripRow.TripDay.map((day, index) => {
      const dayNumber = index + 1;
      const themeRaw = dayThemes[dayNumber] ?? dayThemes[String(dayNumber)];
      const labelRaw = dayLabels[dayNumber] ?? dayLabels[String(dayNumber)];
      const stops = day.ItineraryItem.map((item) => {
        const title =
          item.Place?.nameCN?.trim() ||
          item.Place?.nameEN?.trim() ||
          item.note?.trim() ||
          '未命名地点';
        const category = item.Place?.category ? String(item.Place.category) : null;
        const classified = classifyBlueprintStop({
          type: String(item.type ?? ''),
          category,
          costCategory: item.costCategory,
          name: title,
        });
        const city =
          item.Place?.City?.nameCN?.trim() ||
          item.Place?.City?.name?.trim() ||
          item.Place?.City?.nameEN?.trim() ||
          null;
        return {
          itemId: item.id,
          title,
          type: String(item.type ?? ''),
          category,
          bookingStatus: item.bookingStatus,
          coords: item.placeId ? coordsMap.get(item.placeId) ?? null : null,
          cityName: city,
          isCoreAttraction: classified.isCoreAttraction,
          isAccommodation: classified.isAccommodation,
        };
      });
      return {
        id: day.id,
        dayNumber,
        label: typeof labelRaw === 'string' ? labelRaw : typeof themeRaw === 'string' ? themeRaw : null,
        theme: typeof themeRaw === 'string' ? themeRaw : null,
        stops,
      };
    });

    const nightCount = this.resolveNightCount(tripRow);

    return projectRouteBlueprint({
      tripName: tripRow.name ?? '',
      destinationLabel: tripRow.destination ?? '',
      nightCount,
      days,
      focusDayNumber: opts?.focusDayNumber,
      contextVersion: versions.contextVersion,
      planVersion: versions.planVersion,
    });
  }

  /**
   * Slim route-blueprint card for planning-overview embedding.
   */
  async getRouteBlueprintOverviewSummary(
    tripId: string,
    userId: string,
  ): Promise<MobileRouteBlueprintOverviewSummaryDto> {
    const full = await this.getRouteBlueprint(tripId, userId);
    return projectRouteBlueprintOverviewSummary(full);
  }

  /**
   * PATCH /api/mobile/trips/:tripId/planning/days/:dayIndex
   * Writes metadata.dayThemes / dayLabels only — no itinerary / geometry changes.
   */
  async updateDayTheme(
    tripId: string,
    userId: string,
    dayIndexRaw: number,
    body: PatchDayThemeBodyDto,
    opts: { ifMatch?: number; idempotencyKey?: string },
  ): Promise<MobileDayThemeUpdateResultDto> {
    await this.access.assertTripMember(tripId, userId);
    this.assertWriteHeaders(opts);

    const dayIndex = this.normalizeDayIndex(dayIndexRaw);
    const bodyHash = this.hashBody({ dayIndex, ...body });
    const cached = this.lookupIdempotency(tripId, 'day-theme', opts.idempotencyKey!, bodyHash);
    if (cached) return cached as MobileDayThemeUpdateResultDto;

    await this.assertIfMatch(tripId, opts.ifMatch!);

    const themeNorm = normalizeThemeWriteInput({
      theme: body.theme,
      clearTheme: body.clearTheme,
    });
    if (themeNorm.ok === false) {
      throw new BadRequestException({ code: themeNorm.code, message: themeNorm.message });
    }
    const labelNorm = normalizeLabelWriteInput(body.label);
    if (labelNorm.ok === false) {
      throw new BadRequestException({ code: labelNorm.code, message: labelNorm.message });
    }

    const dayCount = await this.countTripDays(tripId);
    if (dayIndex > dayCount) {
      throw new NotFoundException({
        code: 'DAY_NOT_FOUND',
        message: `dayIndex ${dayIndex} 超出行程天数（共 ${dayCount} 天）`,
      });
    }

    const source = body.source ?? 'user';
    const { updatedAt, contextVersion, planVersion, theme, label } =
      await this.persistDayThemeMutations(
        tripId,
        [{ dayIndex, theme: themeNorm.value, label: labelNorm.value }],
        source,
      );

    const result: MobileDayThemeUpdateResultDto = {
      dayIndex,
      theme,
      label,
      updatedAt,
      contextVersion,
      planVersion,
    };
    this.saveIdempotency(tripId, 'day-theme', opts.idempotencyKey!, bodyHash, result);
    return result;
  }

  /**
   * PATCH /api/mobile/trips/:tripId/planning/day-themes
   * Atomic multi-day theme update.
   */
  async updateDayThemesBatch(
    tripId: string,
    userId: string,
    body: PatchDayThemesBodyDto,
    opts: { ifMatch?: number; idempotencyKey?: string },
  ): Promise<MobileDayThemesBatchResultDto> {
    await this.access.assertTripMember(tripId, userId);
    this.assertWriteHeaders(opts);

    const bodyHash = this.hashBody(body);
    const cached = this.lookupIdempotency(tripId, 'day-themes', opts.idempotencyKey!, bodyHash);
    if (cached) return cached as MobileDayThemesBatchResultDto;

    await this.assertIfMatch(tripId, opts.ifMatch!);

    if (!Array.isArray(body.days) || body.days.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'days 不能为空',
      });
    }

    const dayCount = await this.countTripDays(tripId);
    const mutations: Array<{
      dayIndex: number;
      theme: string | null;
      label?: string | null;
    }> = [];

    for (const row of body.days) {
      const dayIndex = this.normalizeDayIndex(row.dayIndex);
      if (dayIndex > dayCount) {
        throw new NotFoundException({
          code: 'DAY_NOT_FOUND',
          message: `dayIndex ${dayIndex} 超出行程天数（共 ${dayCount} 天）`,
        });
      }
      const themeNorm = normalizeThemeWriteInput({ theme: row.theme });
      if (themeNorm.ok === false) {
        throw new BadRequestException({ code: themeNorm.code, message: themeNorm.message });
      }
      const labelNorm = normalizeLabelWriteInput(row.label);
      if (labelNorm.ok === false) {
        throw new BadRequestException({ code: labelNorm.code, message: labelNorm.message });
      }
      mutations.push({
        dayIndex,
        theme: themeNorm.value,
        label: labelNorm.value,
      });
    }

    const source = body.source ?? 'user';
    const persisted = await this.persistDayThemeMutations(tripId, mutations, source);

    const result: MobileDayThemesBatchResultDto = {
      days: persisted.days,
      updatedAt: persisted.updatedAt,
      contextVersion: persisted.contextVersion,
      planVersion: persisted.planVersion,
    };
    this.saveIdempotency(tripId, 'day-themes', opts.idempotencyKey!, bodyHash, result);
    return result;
  }

  /**
   * Mobile alias → attraction-explore/auto-arrange (same proposal contract).
   * POST /api/mobile/trips/:tripId/planning/auto-arrange
   */
  async autoArrange(
    tripId: string,
    userId: string,
    body: AttractionExploreAutoArrangeDto = {},
  ) {
    await this.access.assertTripMember(tripId, userId);
    return this.orchestrator.mutateWithMode({
      tripId,
      userId,
      commitMode: body.mode === 'proposal' ? 'proposal' : body.commitMode ?? 'proposal',
      buildProposal: () =>
        this.orchestrator.createProposal({
          tripId,
          userId,
          intent: 'AUTO_ARRANGE',
          payload: {
            candidateIds: body.candidateIds ?? [],
            dayIndex: body.dayIndex,
            options: body.options,
          },
        }),
      applyDirect: async () => {
        throw new Error('mobile planning/auto-arrange does not support direct commit');
      },
      mapDirect: () => ({}),
    });
  }

  /**
   * 添加活动页「加入今天」
   * POST /api/mobile/trips/:tripId/planning/activities
   */
  async addPlanningActivity(tripId: string, userId: string, body: AddPlanningActivityBodyDto) {
    await this.access.assertTripMember(tripId, userId);

    const dayIndex = Math.max(1, Math.floor(Number(body.dayIndex) || 0));
    if (!Number.isFinite(dayIndex) || dayIndex < 1) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'dayIndex 必填且为 ≥1 的整数',
      });
    }

    const placeId = await this.resolvePlaceIdForActivity(body.placeId, body.attractionId);
    const place = await this.prisma.place.findUnique({ where: { id: placeId } });
    const title =
      body.title?.trim() ||
      body.placeName?.trim() ||
      place?.nameCN?.trim() ||
      place?.nameEN?.trim() ||
      '新活动';

    const mutation = await this.arrangeItems.createItem({
      tripId,
      userId,
      body: {
        dayIndex,
        placeId,
        type: ItemType.ACTIVITY,
        startTime: body.startTime?.trim() || '11:00',
        endTime: body.endTime?.trim() || '12:30',
        note: body.note?.trim() || `[添加活动] ${title}`,
        placeName: title,
        insertMode: 'append',
        forceCreate: true,
      },
    });

    const itemId =
      mutation.itineraryItem && typeof mutation.itineraryItem === 'object'
        ? String((mutation.itineraryItem as { id?: string }).id ?? '')
        : '';

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true },
    });
    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const constraintsVersion = snapshot?.bindings?.constraintsVersion ?? 0;
    const contextVersion = computeMobileContextVersion({
      constraintsVersion,
      tripUpdatedAt: trip?.updatedAt ?? new Date(),
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      planVersion: constraintsVersion,
      changedSections: ['plan'],
    });

    return {
      tripId,
      dayIndex,
      itemId: itemId || undefined,
      itineraryItem: mutation.itineraryItem,
      scheduleTimeline: mutation.scheduleTimeline,
      contextVersion,
      planVersion: constraintsVersion,
    };
  }

  private async resolvePlaceIdForActivity(
    placeId?: number | string,
    attractionId?: string,
  ): Promise<number> {
    if (placeId != null && placeId !== '') {
      const n = typeof placeId === 'number' ? placeId : Number.parseInt(String(placeId), 10);
      if (Number.isFinite(n) && n > 0) {
        const exists = await this.prisma.place.findUnique({ where: { id: n }, select: { id: true } });
        if (exists) return exists.id;
        throw new NotFoundException({ code: 'PLACE_NOT_FOUND', message: `景点 ${n} 不存在` });
      }
    }
    if (attractionId?.trim()) {
      const place = await this.prisma.place.findFirst({
        where: {
          OR: [{ uuid: attractionId.trim() }, { googlePlaceId: attractionId.trim() }],
        },
        select: { id: true },
      });
      if (!place) {
        throw new NotFoundException({
          code: 'PLACE_NOT_FOUND',
          message: `景点 ${attractionId} 不存在`,
        });
      }
      return place.id;
    }
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: '请提供 placeId 或 attractionId',
    });
  }

  /**
   * Planning-phase team roster with preference completion — not execution presence.
   * GET /api/mobile/trips/:tripId/planning/team-status
   */
  async getTeamStatus(
    tripId: string,
    userId: string,
  ): Promise<MobilePlanningTeamStatusDto> {
    await this.access.assertTripMember(tripId, userId);

    const [collaborators, pendingInvites, profilingRows, trip] = await Promise.all([
      this.prisma.tripCollaborator.findMany({
        where: { tripId },
        select: { id: true, userId: true, role: true, updatedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tripMemberInvite.findMany({
        where: { tripId, status: 'PENDING' },
        select: {
          id: true,
          inviteCode: true,
          label: true,
          roleSlot: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tripDecisionProfilingStatus.findMany({
        where: { tripId },
        select: {
          userId: true,
          travelStyleCompleted: true,
          moneyDnaCompleted: true,
          quizCompleted: true,
          updatedAt: true,
        },
      }),
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      }),
    ]);

    const userIds = collaborators.map((c) => c.userId);
    const [users, travelStyleCards] = await Promise.all([
      userIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true, avatarUrl: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.userTravelStyleCard.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, styleLabel: true, coreDrivers: true },
          })
        : Promise.resolve([]),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const profilingMap = new Map(profilingRows.map((r) => [r.userId, r]));
    const styleCardMap = new Map(travelStyleCards.map((c) => [c.userId, c]));

    const metadata =
      trip?.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};
    const storedProfiles =
      (metadata.memberOnboardingProfiles as Record<string, unknown> | undefined) ?? {};

    const joinedMembers = collaborators.map((row) => {
      const user = userMap.get(row.userId);
      const profilingRow = profilingMap.get(row.userId);
      const profiling: PlanningMemberProfilingFacts = {
        travelStyleCompleted: profilingRow?.travelStyleCompleted ?? false,
        moneyDnaCompleted: profilingRow?.moneyDnaCompleted ?? false,
        quizCompleted: profilingRow?.quizCompleted ?? false,
      };
      const focusAreas = this.resolveFocusAreas(
        storedProfiles[row.userId],
        styleCardMap.get(row.userId),
      );

      return projectPlanningTeamMember({
        id: row.id,
        name:
          user?.displayName?.trim() ||
          user?.email?.split('@')[0] ||
          '成员',
        role: mapCollaboratorRole(row.role),
        avatarUrl: user?.avatarUrl ?? null,
        lastActiveAt: (
          profilingRow?.updatedAt ?? row.updatedAt
        ).toISOString(),
        isPlaceholder: false,
        profiling,
        focusAreas,
      });
    });

    const invitePlaceholders = pendingInvites.map((invite) =>
      projectPlanningTeamMember({
        id: invite.id,
        name: invite.label?.trim() || '待邀请成员',
        role: 'member',
        isPlaceholder: true,
        lastActiveAt: invite.createdAt.toISOString(),
      }),
    );

    const travelerCount = resolveTravelerCount(metadata, collaborators.length);
    const filledSlots = collaborators.length + pendingInvites.length;
    const gapPlaceholders = Math.max(0, travelerCount - filledSlots);
    const anonymousPlaceholders = Array.from({ length: gapPlaceholders }, (_, i) =>
      projectPlanningTeamMember({
        id: `placeholder-${tripId}-${i + 1}`,
        name: '待邀请',
        role: 'member',
        isPlaceholder: true,
      }),
    );

    const members = [
      ...joinedMembers,
      ...invitePlaceholders,
      ...anonymousPlaceholders,
    ];

    const invitePendingCount = invitePlaceholders.length + anonymousPlaceholders.length;

    return {
      memberCount: members.length,
      invitePendingCount,
      members,
    };
  }

  private resolveFocusAreas(
    storedProfile: unknown,
    styleCard?: { styleLabel: string | null; coreDrivers: unknown } | null,
  ): string[] | undefined {
    const areas: string[] = [];

    if (storedProfile && typeof storedProfile === 'object') {
      const record = storedProfile as Record<string, unknown>;
      if (hasCompletedProfile(storedProfile)) {
        const coreWishes = readStoredField(record, 'coreWishes');
        if (Array.isArray(coreWishes)) {
          for (const wish of coreWishes) {
            if (typeof wish === 'string' && wish.trim()) areas.push(wish.trim());
          }
        }
        const mustExperience = readStoredString(record, 'mustExperience');
        if (mustExperience.trim()) areas.push(mustExperience.trim());
      }
    }

    if (areas.length === 0 && styleCard) {
      const drivers = styleCard.coreDrivers;
      if (Array.isArray(drivers)) {
        for (const d of drivers) {
          if (typeof d === 'string' && d.trim()) areas.push(d.trim());
        }
      }
      if (areas.length === 0 && styleCard.styleLabel?.trim()) {
        areas.push(styleCard.styleLabel.trim());
      }
    }

    const truncated = truncateFocusAreas(areas);
    return truncated.length > 0 ? truncated : undefined;
  }

  private async resolvePlanVersions(tripId: string): Promise<{
    contextVersion: number;
    planVersion: number;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `行程 ${tripId} 不存在` });
    }
    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const constraintsVersion = snapshot?.bindings?.constraintsVersion ?? 0;
    const meta =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};
    const spatialPlanVersion = Number(meta.spatialPlanVersion ?? 0);
    return {
      contextVersion: computeMobileContextVersion({
        constraintsVersion,
        tripUpdatedAt: trip.updatedAt,
        effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
      }),
      planVersion: Math.max(
        constraintsVersion,
        Number.isFinite(spatialPlanVersion) ? spatialPlanVersion : 0,
      ),
    };
  }

  private resolveDayThemes(metadata: unknown): Record<string | number, string> {
    return this.readStringMap(metadata, 'dayThemes');
  }

  private resolveDayLabels(metadata: unknown): Record<string | number, string> {
    const labels = this.readStringMap(metadata, 'dayLabels');
    if (Object.keys(labels).length > 0) return labels;
    // Fallback: regionLabels / dayRegions if present
    const regions = this.readStringMap(metadata, 'dayRegions');
    return Object.keys(regions).length > 0 ? regions : this.readStringMap(metadata, 'dayThemes');
  }

  private readStringMap(
    metadata: unknown,
    key: string,
  ): Record<string | number, string> {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    const raw = (metadata as Record<string, unknown>)[key];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string | number, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  }

  private resolveNightCount(trip: {
    startDate?: Date | null;
    endDate?: Date | null;
    TripDay: unknown[];
  }): number {
    if (trip.startDate && trip.endDate) {
      const ms = trip.endDate.getTime() - trip.startDate.getTime();
      const nights = Math.round(ms / (24 * 60 * 60 * 1000));
      if (Number.isFinite(nights) && nights >= 0) return nights;
    }
    return Math.max(0, trip.TripDay.length - 1);
  }

  private normalizeDayIndex(dayIndex?: number): number {
    if (dayIndex == null || !Number.isFinite(dayIndex)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'dayIndex 必须是有效数字',
      });
    }
    const n = Math.floor(dayIndex);
    if (n < 1) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'dayIndex 必须 ≥ 1（1-based）',
      });
    }
    return n;
  }

  private async countTripDays(tripId: string): Promise<number> {
    return this.prisma.tripDay.count({ where: { tripId } });
  }

  private assertWriteHeaders(opts: { ifMatch?: number; idempotencyKey?: string }) {
    if (opts.ifMatch == null || !Number.isFinite(opts.ifMatch)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 If-Match: <contextVersion>',
      });
    }
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }
  }

  private async assertIfMatch(tripId: string, ifMatch: number) {
    const versions = await this.resolvePlanVersions(tripId);
    if (versions.contextVersion !== ifMatch) {
      throw new ConflictException({
        code: 'CONTEXT_VERSION_CONFLICT',
        message: 'contextVersion 已过期，请刷新后重试',
        currentContextVersion: versions.contextVersion,
      });
    }
  }

  private async persistDayThemeMutations(
    tripId: string,
    mutations: Array<{
      dayIndex: number;
      theme: string | null;
      label?: string | null;
    }>,
    source: string,
  ): Promise<{
    days: Array<{ dayIndex: number; theme: string | null; label?: string | null }>;
    theme: string | null;
    label?: string | null;
    updatedAt: string;
    contextVersion: number;
    planVersion: number;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `行程 ${tripId} 不存在` });
    }

    let metadata =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? { ...(trip.metadata as Record<string, unknown>) }
        : {};

    for (const m of mutations) {
      metadata = applyDayThemeMutation(metadata, m.dayIndex, m.theme, m.label, source);
    }

    const prevPlan = Number(metadata.spatialPlanVersion ?? 0);
    const spatialPlanVersion = (Number.isFinite(prevPlan) ? prevPlan : 0) + 1;
    metadata.spatialPlanVersion = spatialPlanVersion;

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        updatedAt: new Date(),
        metadata: metadata as object,
      },
      select: { updatedAt: true, metadata: true },
    });

    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const constraintsVersion = snapshot?.bindings?.constraintsVersion ?? 0;
    const planVersion = Math.max(constraintsVersion, spatialPlanVersion);
    const contextVersion = computeMobileContextVersion({
      constraintsVersion,
      tripUpdatedAt: updated.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      planVersion,
      changedSections: ['plan'],
    });

    const themes = readDayThemeMap(updated.metadata);
    const labels = readDayLabelMap(updated.metadata);
    const days = mutations.map((m) => ({
      dayIndex: m.dayIndex,
      theme: lookupDayTheme(themes, m.dayIndex),
      label: lookupDayTheme(labels, m.dayIndex),
    }));
    const first = days[0];

    return {
      days,
      theme: first?.theme ?? null,
      label: first?.label ?? null,
      updatedAt: updated.updatedAt.toISOString(),
      contextVersion,
      planVersion,
    };
  }

  /**
   * Commit contextual same-day micro-plan into Active Plan.
   * POST /api/mobile/trips/:tripId/planning/contextual-recommendations/commit
   */
  async commitContextualRecommendation(
    tripId: string,
    userId: string,
    body: ContextualRecommendationsCommitDto,
    opts: { ifMatch?: number; idempotencyKey?: string },
  ): Promise<ContextualCommitResult & { contextVersion: number; planVersion: number }> {
    await this.access.assertTripMember(tripId, userId);

    if (opts.ifMatch == null || !Number.isFinite(opts.ifMatch)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 If-Match: <contextVersion>',
      });
    }
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }

    const bodyHash = this.hashBody(body);
    const cached = this.lookupIdempotency(tripId, 'contextual-commit', opts.idempotencyKey, bodyHash);
    if (cached && 'createdItemIds' in cached) {
      return cached as ContextualCommitResult & { contextVersion: number; planVersion: number };
    }

    const current = await this.resolvePlanVersions(tripId);
    if (current.contextVersion !== opts.ifMatch) {
      throw new ConflictException({
        code: 'CONTEXT_VERSION_CONFLICT',
        message: 'contextVersion 已过期，请刷新后重试',
        currentContextVersion: current.contextVersion,
      });
    }

    const committed = await this.contextualCommit.commit(tripId, userId, body ?? {});
    const versions = await this.bumpPlanVersions(tripId);
    const result = {
      ...committed,
      contextVersion: versions.contextVersion,
      planVersion: versions.planVersion,
    };
    this.saveIdempotency(tripId, 'contextual-commit', opts.idempotencyKey, bodyHash, result);
    return result;
  }

  private async bumpPlanVersions(tripId: string): Promise<{
    contextVersion: number;
    planVersion: number;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `行程 ${tripId} 不存在` });
    }
    const metadata =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? { ...(trip.metadata as Record<string, unknown>) }
        : {};
    const prevPlan = Number(metadata.spatialPlanVersion ?? 0);
    const spatialPlanVersion = (Number.isFinite(prevPlan) ? prevPlan : 0) + 1;
    metadata.spatialPlanVersion = spatialPlanVersion;

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        updatedAt: new Date(),
        metadata: metadata as object,
      },
      select: { updatedAt: true },
    });

    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const constraintsVersion = snapshot?.bindings?.constraintsVersion ?? 0;
    const planVersion = Math.max(constraintsVersion, spatialPlanVersion);
    const contextVersion = computeMobileContextVersion({
      constraintsVersion,
      tripUpdatedAt: updated.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      planVersion,
      changedSections: ['plan'],
    });

    return { contextVersion, planVersion };
  }

  private hashBody(body: unknown): string {
    return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
  }

  private lookupIdempotency(
    tripId: string,
    op: string,
    key: string,
    bodyHash: string,
  ): MobilePlanningIdempotentResponse | null {
    const storeKey = `${op}:${tripId}:${key}`;
    const existing = this.idempotency.get(storeKey);
    if (!existing) return null;
    if (existing.bodyHash !== bodyHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency-Key 已用于不同请求体',
      });
    }
    return existing.response;
  }

  private saveIdempotency(
    tripId: string,
    op: string,
    key: string,
    bodyHash: string,
    response: MobilePlanningIdempotentResponse,
  ) {
    this.idempotency.set(`${op}:${tripId}:${key}`, { bodyHash, response });
  }
}
