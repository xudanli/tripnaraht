import { Injectable, Logger } from '@nestjs/common';
import { PlaceCategory } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ATTRACTION_EXPLORE_METADATA_KEY } from '../constants/attraction-explore-catalog.constants';
import { AttractionExploreCandidateService } from './attraction-explore-candidate.service';
import type { GuideItineraryDraft } from '../../../guide-to-plan/services/guide-plan-builder.service';
import { isCoreAttraction } from '../utils/attraction-explore-place.util';

@Injectable()
export class AttractionExploreSeedService {
  private readonly logger = new Logger(AttractionExploreSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: AttractionExploreCandidateService,
  ) {}

  async seedFromGuideAccept(input: {
    tripId: string;
    itineraryDraft: GuideItineraryDraft;
    sessionId: string;
    planCandidateId: string;
  }): Promise<number> {
    const placeIds = input.itineraryDraft.days
      .flatMap((day) => day.items)
      .map((item) => item.placeId)
      .filter((id): id is number => typeof id === 'number' && id > 0);

    const count = await this.candidates.seedCandidates(
      input.tripId,
      placeIds,
      'guide_accept',
      {
        guideSessionId: input.sessionId,
        planCandidateId: input.planCandidateId,
      },
      'must_go',
    );

    await this.markSeeded(input.tripId, 'guide_accept');
    this.logger.log(`Seeded ${count} attraction explore candidates from guide accept for trip ${input.tripId}`);
    return count;
  }

  async seedFromExplorationRoute(input: {
    tripId: string;
    scenarioId: string;
    routeId: string;
    strategyId: string;
  }): Promise<number> {
    const variant = await this.prisma.explorationRouteVariant.findFirst({
      where: { scenarioId: input.scenarioId, routeId: input.routeId },
    });
    if (!variant) return 0;

    const routeDetail = variant.routeDetail as Record<string, unknown> | null;
    const resolvedPois = Array.isArray(routeDetail?.resolvedPois)
      ? (routeDetail!.resolvedPois as Array<{ placeId?: number; resolved?: boolean }>)
      : [];

    const placeIds = resolvedPois
      .filter((p) => p.resolved !== false && typeof p.placeId === 'number')
      .map((p) => p.placeId!);

    const count = await this.candidates.seedCandidates(
      input.tripId,
      placeIds,
      'route_seed',
      {
        scenarioId: input.scenarioId,
        routeId: input.routeId,
        strategyId: input.strategyId,
      },
      'very_interested',
    );

    await this.markSeeded(input.tripId, 'exploration_route');
    this.logger.log(`Seeded ${count} attraction explore candidates from route ${input.routeId} for trip ${input.tripId}`);
    return count;
  }

  /** 冰岛自驾 create：按 region 目录 placeIds 灌 Attraction Explore 候选 */
  async seedFromIcelandSelfDriveRegions(input: {
    tripId: string;
    placeIds: number[];
    regionIds: string[];
  }): Promise<number> {
    const existing = await this.prisma.tripAttractionExploreCandidate.count({
      where: { tripId: input.tripId },
    });
    if (existing > 0) return 0;

    const placeIds = [...new Set(input.placeIds.filter((id) => id > 0))];
    if (placeIds.length === 0) return 0;

    const count = await this.candidates.seedCandidates(
      input.tripId,
      placeIds,
      'route_seed',
      { mode: 'iceland_self_drive', regionIds: input.regionIds },
      'very_interested',
    );

    if (count > 0) {
      await this.markSeeded(input.tripId, 'iceland_self_drive');
      this.logger.log(
        `Seeded ${count} attraction explore candidates from iceland_self_drive regions for trip ${input.tripId}`,
      );
    }
    return count;
  }

  /** 探索/攻略 trip 尚无候选时，用目的地核心景点填充（联调 fallback） */
  async seedFromDestinationDefaults(tripId: string): Promise<number> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return 0;

    const existing = await this.prisma.tripAttractionExploreCandidate.count({ where: { tripId } });
    if (existing > 0) return 0;

    const destination = trip.destination?.toUpperCase() ?? 'IS';
    const places = await this.prisma.place.findMany({
      where: {
        category: PlaceCategory.ATTRACTION,
        OR: [
          { City: { countryCode: destination } },
          { metadata: { path: ['countryCode'], equals: destination } },
        ],
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'desc' }],
      take: 40,
    });

    const core = places.filter((p) => isCoreAttraction(p));
    const picked = (core.length >= 4 ? core : places).slice(0, 8);
    const placeIds = picked.map((p) => p.id);
    if (placeIds.length === 0) return 0;

    const count = await this.candidates.seedCandidates(
      tripId,
      placeIds,
      'route_seed',
      { mode: 'destination_defaults', destination },
      'very_interested',
    );

    if (count > 0) {
      await this.markSeeded(tripId, 'destination_defaults');
      this.logger.log(`Seeded ${count} default attraction explore candidates for trip ${tripId}`);
    }
    return count;
  }

  async ensureBootstrapCandidates(tripId: string): Promise<number> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return 0;

    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const slice = metadata[ATTRACTION_EXPLORE_METADATA_KEY] as Record<string, unknown> | undefined;
    const shouldBootstrap =
      metadata.source === 'exploration' ||
      metadata.source === 'guide_to_plan' ||
      metadata.source === 'iceland_self_drive' ||
      slice?.suggestAttractionExplore === true ||
      Boolean(metadata.explorationScenarioId);

    if (!shouldBootstrap) return 0;
    return this.seedFromDestinationDefaults(tripId);
  }

  private async markSeeded(tripId: string, seededFrom: string): Promise<void> {
    const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    const metadata = { ...((trip.metadata as Record<string, unknown> | null) ?? {}) };
    const slice = (metadata[ATTRACTION_EXPLORE_METADATA_KEY] as Record<string, unknown> | undefined) ?? {};
    metadata[ATTRACTION_EXPLORE_METADATA_KEY] = {
      ...slice,
      seededFrom,
      suggestAttractionExplore: true,
    };
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: metadata as object },
    });
  }
}
