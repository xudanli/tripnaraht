import { Injectable } from '@nestjs/common';
import { AttractionExploreAccessService } from './attraction-explore-access.service';
import { AttractionExploreContextService } from './attraction-explore-context.service';
import { AttractionExploreCandidateService } from './attraction-explore-candidate.service';
import { AttractionExploreRecommendationsService } from './attraction-explore-recommendations.service';
import { AttractionExploreMapService } from './attraction-explore-map.service';
import { AttractionExploreAutoArrangeService } from './attraction-explore-auto-arrange.service';
import { AttractionExploreAiConsultService } from './attraction-explore-ai-consult.service';
import { AttractionExploreSeedService } from './attraction-explore-seed.service';
import { AttractionExploreIntentCompileService } from './attraction-explore-intent-compile.service';
import type {
  AttractionExploreRecommendationsView,
  AttractionExploreSearchView,
} from '../types/attraction-explore.types';
import type {
  AddAttractionExploreCandidateDto,
  AttractionExploreAiConsultDto,
  AttractionExploreAutoArrangeDto,
  AttractionExploreRecommendationsQueryDto,
  AttractionExploreSearchDto,
  PatchAttractionExploreCandidatesDto,
  UpdateAttractionExploreContextDto,
} from '../dto/attraction-explore.dto';
import { parseCsvIds, parseSortId } from '../dto/attraction-explore.dto';

function withRecommendationAliases<T extends AttractionExploreRecommendationsView>(view: T): T {
  return {
    ...view,
    groups: view.groups.map((group) => ({
      ...group,
      attractions: group.items,
    })),
    ...(view.items
      ? {
          items: view.items,
        }
      : {}),
  };
}

@Injectable()
export class AttractionExploreOrchestratorService {
  constructor(
    private readonly access: AttractionExploreAccessService,
    private readonly context: AttractionExploreContextService,
    private readonly candidates: AttractionExploreCandidateService,
    private readonly recommendations: AttractionExploreRecommendationsService,
    private readonly mapService: AttractionExploreMapService,
    private readonly autoArrangeService: AttractionExploreAutoArrangeService,
    private readonly aiConsultService: AttractionExploreAiConsultService,
    private readonly seed: AttractionExploreSeedService,
    private readonly intentCompile: AttractionExploreIntentCompileService,
  ) {}

  async getContext(tripId: string, userId: string, opts?: { dayIndex?: number }) {
    await this.access.assertTripMember(tripId, userId);
    return this.context.getContext(tripId, opts);
  }

  async updateContext(tripId: string, userId: string, body: UpdateAttractionExploreContextDto) {
    await this.access.assertTripMember(tripId, userId);
    return this.context.updateFilters(tripId, body);
  }

  async getRecommendations(tripId: string, userId: string, query: AttractionExploreRecommendationsQueryDto) {
    const trip = await this.access.assertTripMember(tripId, userId);
    const ctx = await this.context.getContext(tripId, { dayIndex: query.dayIndex });
    const themeIds = parseCsvIds(query.themeIds);
    const suitabilityIds = parseCsvIds(query.suitabilityIds);
    const quickFromQuery = [
      ...parseCsvIds(query.quickFilterIds),
      ...(query.quickFilter?.trim() ? [query.quickFilter.trim()] : []),
    ];
    const quickFilterIds = quickFromQuery.length
      ? [...new Set(quickFromQuery)]
      : (ctx.selectedFilters.quickFilterIds ?? []);
    const sort =
      parseSortId(query.sort) ?? ctx.selectedFilters.sort ?? 'smart';

    return withRecommendationAliases(
      await this.recommendations.getRecommendations({
        tripId,
        destination: trip.destination,
        themeIds: themeIds.length ? themeIds : ctx.selectedFilters.themeIds,
        suitabilityIds: suitabilityIds.length ? suitabilityIds : ctx.selectedFilters.suitabilityIds,
        viewTab: query.viewTab ?? ctx.selectedFilters.viewTab,
        weatherHint: ctx.travelConditions.weatherHint,
        useLiveRoutes: query.useLiveRoutes,
        dayIndex: query.dayIndex,
        quickFilterIds,
        sort,
        q: query.q,
        lat: query.lat,
        lng: query.lng,
      }),
    );
  }

  async compileExploreIntent(query: string, options?: { useLlm?: boolean }) {
    return this.intentCompile.compile(query, options);
  }

  async search(tripId: string, userId: string, body: AttractionExploreSearchDto) {
    const trip = await this.access.assertTripMember(tripId, userId);
    const ctx = await this.context.getContext(tripId, { dayIndex: body.dayIndex });
    return withRecommendationAliases(
      await this.recommendations.search({
        tripId,
        destination: trip.destination,
        query: body.query,
        themeIds: body.themeIds ?? ctx.selectedFilters.themeIds,
        suitabilityIds: body.suitabilityIds ?? ctx.selectedFilters.suitabilityIds,
        viewTab: body.viewTab ?? ctx.selectedFilters.viewTab,
        limit: body.limit,
        weatherHint: ctx.travelConditions.weatherHint,
        useLiveRoutes: body.useLiveRoutes,
        useLlmIntent: body.useLlmIntent,
        dayIndex: body.dayIndex,
        quickFilterIds: ctx.selectedFilters.quickFilterIds,
        sort: ctx.selectedFilters.sort,
      }),
    ) as AttractionExploreSearchView;
  }

  async listCandidates(tripId: string, userId: string) {
    await this.access.assertTripMember(tripId, userId);
    await this.seed.ensureBootstrapCandidates(tripId);
    return this.candidates.listCandidates(tripId);
  }

  async addCandidate(tripId: string, userId: string, body: AddAttractionExploreCandidateDto) {
    await this.access.assertTripMember(tripId, userId);
    return this.candidates.addCandidate(tripId, userId, body, 'manual');
  }

  async patchCandidates(tripId: string, userId: string, body: PatchAttractionExploreCandidatesDto) {
    await this.access.assertTripMember(tripId, userId);
    return this.candidates.patchCandidates(tripId, body);
  }

  async deleteCandidate(tripId: string, userId: string, candidateId: string) {
    await this.access.assertTripMember(tripId, userId);
    return this.candidates.deleteCandidate(tripId, candidateId);
  }

  async autoArrange(tripId: string, userId: string, body: AttractionExploreAutoArrangeDto) {
    await this.access.assertTripMember(tripId, userId);
    return this.autoArrangeService.autoArrange({ tripId, candidateIds: body.candidateIds });
  }

  async aiConsult(tripId: string, userId: string, body: AttractionExploreAiConsultDto) {
    await this.access.assertTripMember(tripId, userId);
    return this.aiConsultService.consult({
      tripId,
      question: body.question,
      candidateIds: body.candidateIds,
    });
  }

  async getMap(tripId: string, userId: string, query: {
    candidateIds?: string;
    viewTab?: string;
    dayIndex?: number;
    highlightItemId?: string;
    includeInsertHints?: boolean;
  }) {
    await this.access.assertTripMember(tripId, userId);
    return this.mapService.getMap({ tripId, ...query });
  }
}
