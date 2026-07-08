import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  AttractionExploreCandidateSource,
  AttractionExploreCandidatesView,
  AttractionExplorePriority,
} from '../types/attraction-explore.types';
import {
  extractPlaceMeta,
  mapPlaceToRecommendationItem,
} from '../utils/attraction-explore-place.util';
import {
  computeAttractionExploreRouteSpanKm,
} from '../utils/attraction-explore-trip-context.util';
import type {
  AddAttractionExploreCandidateDto,
  PatchAttractionExploreCandidatesDto,
} from '../dto/attraction-explore.dto';
import { AttractionExploreCandidatePrecheckService } from './attraction-explore-candidate-precheck.service';
import type { CandidatePrecheckResult } from './attraction-explore-candidate-precheck.service';
import { readPlanningWorkbenchMode } from '../../utils/planning-workbench-mode.util';

export interface CopilotNextAction {
  action: 'draft_for_candidate' | 'draft_all_must_go';
  candidateId: string;
  endpoint: string;
}

export type AttractionExploreCandidatesWithPrecheck = AttractionExploreCandidatesView & {
  precheck?: CandidatePrecheckResult;
  copilotNextAction?: CopilotNextAction;
};

@Injectable()
export class AttractionExploreCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly precheck: AttractionExploreCandidatePrecheckService,
  ) {}

  async listCandidates(tripId: string): Promise<AttractionExploreCandidatesView> {
    const rows = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: { tripId },
      include: { Place: { include: { City: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const candidates = rows.map((row) => {
      const item = mapPlaceToRecommendationItem(row.Place);
      return {
        ...item,
        id: row.id,
        placeId: row.placeId,
        priority: row.priority as AttractionExplorePriority,
        sortOrder: row.sortOrder,
        source: row.source as AttractionExploreCandidateSource,
        meta: extractPlaceMeta(row.Place),
      };
    });

    return {
      tripId,
      candidates,
      summary: await this.buildSummary(tripId, candidates.length),
    };
  }

  async addCandidate(
    tripId: string,
    userId: string,
    input: AddAttractionExploreCandidateDto,
    source: AttractionExploreCandidateSource = 'manual',
    sourceRef?: Record<string, unknown>,
  ): Promise<AttractionExploreCandidatesWithPrecheck> {
    const placeId = await this.resolvePlaceId(input.placeId, input.attractionId);
    const priority = input.priority ?? 'very_interested';
    const precheckResult = await this.precheck.precheck({ tripId, placeId, priority });

    const maxSort = await this.prisma.tripAttractionExploreCandidate.aggregate({
      where: { tripId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    await this.prisma.tripAttractionExploreCandidate.upsert({
      where: { tripId_placeId: { tripId, placeId } },
      create: {
        tripId,
        placeId,
        priority,
        sortOrder,
        source,
        sourceRef: sourceRef ? toInputJsonValue(sourceRef) : undefined,
        addedByUserId: userId,
      },
      update: {
        priority,
        source,
        sourceRef: sourceRef ? toInputJsonValue(sourceRef) : undefined,
        addedByUserId: userId,
      },
    });

    const view = await this.listCandidates(tripId);
    const copilotNextAction = await this.buildCopilotNextAction({
      tripId,
      candidateId: (
        await this.prisma.tripAttractionExploreCandidate.findFirstOrThrow({
          where: { tripId, placeId },
          select: { id: true },
        })
      ).id,
      priority,
    });

    return { ...view, precheck: precheckResult, copilotNextAction };
  }

  private async buildCopilotNextAction(input: {
    tripId: string;
    candidateId: string;
    priority: string;
  }): Promise<CopilotNextAction | undefined> {
    if (input.priority !== 'must_go' && input.priority !== 'very_interested') {
      return undefined;
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: input.tripId },
      select: { metadata: true },
    });
    if (readPlanningWorkbenchMode(trip.metadata) !== 'copilot') {
      return undefined;
    }

    return {
      action: 'draft_for_candidate',
      candidateId: input.candidateId,
      endpoint: `/api/trips/${input.tripId}/arrange-itinerary/copilot-actions`,
    };
  }

  async patchCandidates(
    tripId: string,
    input: PatchAttractionExploreCandidatesDto,
  ): Promise<AttractionExploreCandidatesView> {
    const ids = input.candidates.map((c) => c.id);
    const existing = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: { tripId, id: { in: ids } },
    });
    if (existing.length !== ids.length) {
      throw new NotFoundException('部分候选不存在或不属于该行程');
    }

    await this.prisma.$transaction(
      input.candidates.map((c) =>
        this.prisma.tripAttractionExploreCandidate.update({
          where: { id: c.id },
          data: { priority: c.priority, sortOrder: c.sortOrder },
        }),
      ),
    );

    return this.listCandidates(tripId);
  }

  async deleteCandidate(
    tripId: string,
    candidateId: string,
  ): Promise<AttractionExploreCandidatesView> {
    const row = await this.prisma.tripAttractionExploreCandidate.findFirst({
      where: { id: candidateId, tripId },
    });
    if (!row) {
      throw new NotFoundException('候选不存在或不属于该行程');
    }

    await this.prisma.tripAttractionExploreCandidate.delete({ where: { id: candidateId } });
    return this.listCandidates(tripId);
  }

  async seedCandidates(
    tripId: string,
    placeIds: number[],
    source: AttractionExploreCandidateSource,
    sourceRef?: Record<string, unknown>,
    priority: AttractionExplorePriority = 'very_interested',
  ): Promise<number> {
    const uniqueIds = [...new Set(placeIds.filter((id) => Number.isFinite(id) && id > 0))];
    if (uniqueIds.length === 0) return 0;

    const existing = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: { tripId },
      select: { placeId: true, sortOrder: true },
    });
    const existingPlaceIds = new Set(existing.map((e) => e.placeId));
    let sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder), -1);

    const toCreate = uniqueIds.filter((id) => !existingPlaceIds.has(id));
    if (toCreate.length === 0) return 0;

    await this.prisma.tripAttractionExploreCandidate.createMany({
      data: toCreate.map((placeId) => {
        sortOrder += 1;
        return {
          tripId,
          placeId,
          priority,
          sortOrder,
          source,
          sourceRef: sourceRef ? toInputJsonValue(sourceRef) : undefined,
        };
      }),
      skipDuplicates: true,
    });

    return toCreate.length;
  }

  private async resolvePlaceId(placeId?: number, attractionId?: string): Promise<number> {
    if (placeId != null && Number.isFinite(placeId)) {
      const place = await this.prisma.place.findUnique({ where: { id: placeId } });
      if (!place) throw new NotFoundException(`地点 ${placeId} 不存在`);
      return place.id;
    }
    if (attractionId?.trim()) {
      const place = await this.prisma.place.findFirst({
        where: { OR: [{ uuid: attractionId.trim() }, { googlePlaceId: attractionId.trim() }] },
      });
      if (!place) throw new NotFoundException(`景点 ${attractionId} 不存在`);
      return place.id;
    }
    throw new BadRequestException('请提供 placeId 或 attractionId');
  }

  private async buildSummary(tripId: string, attractionCount: number) {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { TripDay: true },
    });

    const dwellRows = await this.prisma.tripAttractionExploreCandidate.findMany({
      where: { tripId },
      include: { Place: true },
    });
    const totalDwellMinutes = dwellRows.reduce((sum, row) => {
      const meta = extractPlaceMeta(row.Place);
      return sum + (meta.suggestedDwellMinutes ?? 90);
    }, 0);
    const estimatedDays = Math.max(1, Math.ceil(totalDwellMinutes / (8 * 60)));

    const metadata = (trip.metadata as Record<string, unknown> | null) ?? {};
    const routeSpanKm = await computeAttractionExploreRouteSpanKm(this.prisma, tripId, metadata);

    return {
      attractionCount,
      estimatedDays: Math.min(estimatedDays, Math.max(trip.TripDay.length, 1)),
      routeSpanKm,
    };
  }
}
