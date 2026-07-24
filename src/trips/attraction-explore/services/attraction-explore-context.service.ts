import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import {
  ATTRACTION_EXPLORE_METADATA_KEY,
  ATTRACTION_EXPLORE_QUICK_FILTERS,
  ATTRACTION_EXPLORE_SORT_OPTIONS,
  ATTRACTION_EXPLORE_SUITABILITIES,
  ATTRACTION_EXPLORE_THEMES,
} from '../constants/attraction-explore-catalog.constants';
import type {
  AttractionExploreContextView,
  AttractionExploreFilters,
  AttractionExploreSortId,
  AttractionExploreTripMetadataSlice,
  AttractionExploreViewTab,
} from '../types/attraction-explore.types';
import {
  normalizeContextPatch,
  type UpdateAttractionExploreContextDto,
} from '../dto/attraction-explore.dto';
import { resolveAttractionExploreOrigin } from '../utils/attraction-explore-trip-context.util';
import { buildContextTip } from '../utils/attraction-explore-card.util';

@Injectable()
export class AttractionExploreContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(
    tripId: string,
    opts?: { dayIndex?: number },
  ): Promise<AttractionExploreContextView> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { TripCollaborator: true, TripDay: { orderBy: { date: 'asc' }, select: { id: true } } },
    });

    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const slice = this.readSlice(metadata);
    const pacing = (trip.pacingConfig as Record<string, unknown> | null) ?? {};
    const explorationInput = metadata.explorationInput as Record<string, unknown> | undefined;
    const mobility = explorationInput?.mobilityContext as Record<string, unknown> | undefined;

    const memberCount = Math.max(
      1,
      trip.TripCollaborator.length ||
        (Array.isArray(metadata.travelers as unknown[] | undefined)
          ? (metadata.travelers as unknown[]).length
          : 1),
    );

    const origin = await resolveAttractionExploreOrigin(this.prisma, trip);
    const selectedFilters = this.buildSelectedFilters(slice);
    const dayIndex = this.normalizeDayIndex(opts?.dayIndex);
    const dayMeta = dayIndex != null ? this.resolveDayMeta(metadata, dayIndex, trip.TripDay.length) : null;

    const weatherHint =
      typeof metadata.weatherHint === 'string' ? metadata.weatherHint : null;
    const contextTip = buildContextTip(weatherHint);

    return {
      tripId,
      ...(dayIndex != null ? { dayIndex } : {}),
      ...(dayMeta?.dayLabel ? { dayLabel: dayMeta.dayLabel } : {}),
      subtitle: dayMeta?.subtitle ?? contextTip ?? undefined,
      destination: trip.destination,
      quickFilters: ATTRACTION_EXPLORE_QUICK_FILTERS.map((f) => ({
        id: f.id,
        label: f.label,
        icon: f.icon,
        selected: (selectedFilters.quickFilterIds ?? []).includes(f.id),
      })),
      themes: ATTRACTION_EXPLORE_THEMES.map((t) => ({ id: t.id, label: t.label })),
      suitabilities: ATTRACTION_EXPLORE_SUITABILITIES.map((s) => ({ id: s.id, label: s.label })),
      selectedFilters,
      sortOptions: ATTRACTION_EXPLORE_SORT_OPTIONS.map((s) => ({ id: s.id, label: s.label })),
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
        weatherHint,
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
      quickFilterIds:
        patch.quickFilterIds !== undefined
          ? patch.quickFilterIds
          : (slice.quickFilterIds ?? []),
      sort:
        patch.sort !== undefined
          ? patch.sort
          : ((slice.sort ?? 'smart') as AttractionExploreSortId),
      ...(slice.seededFrom ? { seededFrom: slice.seededFrom } : {}),
      ...(slice.suggestAttractionExplore ? { suggestAttractionExplore: true } : {}),
    };

    metadata[ATTRACTION_EXPLORE_METADATA_KEY] = next;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(metadata) },
    });

    return this.getContext(tripId, { dayIndex: patch.dayIndex });
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
      quickFilterIds: slice.quickFilterIds ?? [],
      sort: (slice.sort ?? 'smart') as AttractionExploreSortId,
    };
  }

  private normalizeDayIndex(dayIndex?: number): number | undefined {
    if (dayIndex == null || !Number.isFinite(dayIndex)) return undefined;
    return Math.max(1, Math.floor(dayIndex));
  }

  private resolveDayMeta(
    metadata: Record<string, unknown>,
    dayIndex: number,
    dayCount: number,
  ): { dayLabel?: string; subtitle?: string } | null {
    if (dayCount > 0 && dayIndex > dayCount) return { dayLabel: `Day ${dayIndex}` };

    const themes =
      metadata.dayThemes && typeof metadata.dayThemes === 'object' && !Array.isArray(metadata.dayThemes)
        ? (metadata.dayThemes as Record<string, unknown>)
        : {};
    const labels =
      metadata.dayLabels && typeof metadata.dayLabels === 'object' && !Array.isArray(metadata.dayLabels)
        ? (metadata.dayLabels as Record<string, unknown>)
        : {};

    const themeRaw = themes[String(dayIndex)];
    const labelRaw = labels[String(dayIndex)];
    const theme = typeof themeRaw === 'string' ? themeRaw.trim() : '';
    const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';

    const dayLabel = label || `Day ${dayIndex}`;
    const subtitle = theme && theme !== label ? theme : undefined;
    return { dayLabel, subtitle };
  }
}
