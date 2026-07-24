import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { extractPlaceMeta, resolvePlaceCoordsOrNull } from '../utils/attraction-explore-place.util';
import { AttractionExploreRouteDetourService } from './attraction-explore-route-detour.service';

export interface CandidatePrecheckWarning {
  code: string;
  message: string;
  severity: 'info' | 'warn';
}

export interface CandidatePrecheckResult {
  placeId: number;
  priority: string;
  feasible: boolean;
  warnings: CandidatePrecheckWarning[];
}

@Injectable()
export class AttractionExploreCandidatePrecheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeDetour: AttractionExploreRouteDetourService,
  ) {}

  async precheck(input: {
    tripId: string;
    placeId: number;
    priority: string;
  }): Promise<CandidatePrecheckResult> {
    const warnings: CandidatePrecheckWarning[] = [];

    const [tripDays, scheduledItems, candidateCount, place, routeItems] =
      await Promise.all([
        this.prisma.tripDay.count({ where: { tripId: input.tripId } }),
        this.prisma.itineraryItem.count({
          where: { TripDay: { tripId: input.tripId }, placeId: input.placeId },
        }),
        this.prisma.tripAttractionExploreCandidate.count({ where: { tripId: input.tripId } }),
        this.prisma.place.findUnique({ where: { id: input.placeId }, include: { City: true } }),
        this.prisma.itineraryItem.findMany({
          where: { TripDay: { tripId: input.tripId }, placeId: { not: null } },
          select: { placeId: true },
        }),
      ]);

    if (!place) {
      return {
        placeId: input.placeId,
        priority: input.priority,
        feasible: false,
        warnings: [{ code: 'place_not_found', message: '景点不存在', severity: 'warn' }],
      };
    }

    if (scheduledItems > 0) {
      warnings.push({
        code: 'already_scheduled',
        message: '该景点已在行程中安排',
        severity: 'warn',
      });
    }

    const mustGoCount = await this.prisma.tripAttractionExploreCandidate.count({
      where: { tripId: input.tripId, priority: 'must_go' },
    });
    if (input.priority === 'must_go' && mustGoCount >= tripDays) {
      warnings.push({
        code: 'must_go_exceeds_days',
        message: `必去候选（${mustGoCount + 1}）可能超过可用天数（${tripDays}）`,
        severity: 'warn',
      });
    }

    if (candidateCount >= tripDays * 4) {
      warnings.push({
        code: 'candidate_pool_large',
        message: '候选清单较多，编排时可能需要取舍',
        severity: 'info',
      });
    }

    const meta = extractPlaceMeta(place);
    const routePlaceIds = [...new Set(routeItems.map((r) => r.placeId!).filter(Boolean))];
    const anchors = (
      await this.prisma.place.findMany({
        where: { id: { in: routePlaceIds } },
      })
    )
      .map((p) => resolvePlaceCoordsOrNull(p))
      .filter((c): c is { lat: number; lng: number } => c != null);

    const placeCoords = resolvePlaceCoordsOrNull(place);
    let detour: number | null = null;
    if (placeCoords && anchors.length > 0) {
      const estimate = await this.routeDetour.estimatePlaceDetourToRouteAsync({
        place: placeCoords,
        routeAnchors: anchors,
      });
      detour = estimate?.detourMinutes ?? null;
    }
    if (detour != null && detour > 45 && input.priority === 'must_go') {
      warnings.push({
        code: 'high_detour_must_go',
        message: `预计绕路约 ${detour} 分钟，与必去优先级可能冲突`,
        severity: 'warn',
      });
    }

    if (meta.physicalLevel === 'HIGH' && input.priority === 'must_go') {
      warnings.push({
        code: 'high_intensity_must_go',
        message: '高强度景点标记为必去，请确认成员体力',
        severity: 'warn',
      });
    }

    return {
      placeId: input.placeId,
      priority: input.priority,
      feasible: !warnings.some((w) => w.code === 'already_scheduled'),
      warnings,
    };
  }
}
