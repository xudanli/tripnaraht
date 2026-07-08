import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import {
  ATTRACTION_EXPLORE_METADATA_KEY,
  ATTRACTION_EXPLORE_SUITABILITIES,
  ATTRACTION_EXPLORE_THEMES,
} from '../constants/attraction-explore-catalog.constants';
import type {
  AttractionExploreContextView,
  AttractionExploreFilters,
  AttractionExploreTripMetadataSlice,
  AttractionExploreViewTab,
} from '../types/attraction-explore.types';
import {
  normalizeContextPatch,
  type UpdateAttractionExploreContextDto,
} from '../dto/attraction-explore.dto';
import {
  resolveAttractionExploreOrigin,
} from '../utils/attraction-explore-trip-context.util';

@Injectable()
export class AttractionExploreContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(tripId: string): Promise<AttractionExploreContextView> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { TripCollaborator: true },
    });

    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const slice = this.readSlice(metadata);
    const pacing = (trip.pacingConfig as Record<string, unknown> | null) ?? {};
    const explorationInput = metadata.explorationInput as Record<string, unknown> | undefined;
    const mobility = explorationInput?.mobilityContext as Record<string, unknown> | undefined;

    const memberCount = Math.max(
      1,
      trip.TripCollaborator.length ||
        (Array.isArray((metadata.travelers as unknown[] | undefined))
          ? (metadata.travelers as unknown[]).length
          : 1),
    );

    const origin = await resolveAttractionExploreOrigin(this.prisma, trip);

    return {
      tripId,
      destination: trip.destination,
      themes: ATTRACTION_EXPLORE_THEMES.map((t) => ({ id: t.id, label: t.label })),
      suitabilities: ATTRACTION_EXPLORE_SUITABILITIES.map((s) => ({ id: s.id, label: s.label })),
      selectedFilters: this.buildSelectedFilters(slice),
      travelConditions: {
        origin,
        transportMode:
          (typeof mobility?.vehicleType === 'string' ? mobility.vehicleType : null) ??
          (typeof metadata.transport === 'string' ? metadata.transport : null),
        pace:
          typeof pacing.pace === 'string'
            ? pacing.pace
            : typeof pacing.tripPace === 'string'
              ? pacing.tripPace
              : null,
        weatherHint: typeof metadata.weatherHint === 'string' ? metadata.weatherHint : null,
      },
      memberPreferences: {
        memberCount,
        topThemes: slice.themeIds?.slice(0, 3) ?? [],
        topSuitabilities: slice.suitabilityIds?.slice(0, 3) ?? [],
      },
    };
  }

  async updateFilters(
    tripId: string,
    dto: UpdateAttractionExploreContextDto,
  ): Promise<AttractionExploreContextView> {
    const patch = normalizeContextPatch(dto);
    const trip = await this.prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    const metadata = { ...((trip.metadata as Record<string, unknown> | null) ?? {}) };
    const slice = this.readSlice(metadata);

    const next: AttractionExploreTripMetadataSlice = {
      themeIds: patch.themeIds !== undefined ? patch.themeIds : (slice.themeIds ?? []),
      suitabilityIds:
        patch.suitabilityIds !== undefined ? patch.suitabilityIds : (slice.suitabilityIds ?? []),
      viewTab:
        patch.viewTab !== undefined
          ? patch.viewTab
          : ((slice.viewTab ?? 'recommended') as AttractionExploreViewTab),
      ...(slice.seededFrom ? { seededFrom: slice.seededFrom } : {}),
      ...(slice.suggestAttractionExplore ? { suggestAttractionExplore: true } : {}),
    };

    metadata[ATTRACTION_EXPLORE_METADATA_KEY] = next;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    return this.getContext(tripId);
  }

  readSlice(metadata: Record<string, unknown>): AttractionExploreTripMetadataSlice {
    const raw = metadata[ATTRACTION_EXPLORE_METADATA_KEY];
    if (!raw || typeof raw !== 'object') return {};
    return raw as AttractionExploreTripMetadataSlice;
  }

  private buildSelectedFilters(slice: AttractionExploreTripMetadataSlice): AttractionExploreFilters {
    return {
      themeIds: slice.themeIds ?? [],
      suitabilityIds: slice.suitabilityIds ?? [],
      viewTab: (slice.viewTab ?? 'recommended') as AttractionExploreViewTab,
    };
  }
}
