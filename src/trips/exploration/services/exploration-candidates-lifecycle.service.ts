import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EXPLORATION_ROUTE_VARIANT_STATUS } from '../constants/exploration-status.constants';
import { resolveRouteGenerationMode } from '../config/exploration-route-generation.config';
import type { ExplorationCandidatesStatusView } from '../types/exploration.types';

@Injectable()
export class ExplorationCandidatesLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(scenarioId: string): Promise<ExplorationCandidatesStatusView> {
    const [drafts, selected, archivedCount] = await Promise.all([
      this.prisma.explorationRouteVariant.findMany({
        where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT },
        select: { generationVersion: true },
      }),
      this.prisma.explorationRouteVariant.findFirst({
        where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED },
        select: { routeId: true, generationVersion: true },
      }),
      this.prisma.explorationRouteVariant.count({
        where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
      }),
    ]);

    const generationMode = resolveRouteGenerationMode();

    if (selected) {
      return {
        status: 'SELECTED',
        activeCount: drafts.length,
        generationVersion: selected.generationVersion,
        generationMode,
        selectedRouteId: selected.routeId,
      };
    }

    if (drafts.length > 0) {
      return {
        status: 'READY',
        activeCount: drafts.length,
        generationVersion: Math.max(...drafts.map((d) => d.generationVersion)),
        generationMode,
        selectedRouteId: null,
      };
    }

    if (archivedCount > 0) {
      return {
        status: 'STALE',
        activeCount: 0,
        generationVersion: null,
        generationMode,
        selectedRouteId: null,
      };
    }

    return {
      status: 'EMPTY',
      activeCount: 0,
      generationVersion: null,
      generationMode,
      selectedRouteId: null,
    };
  }

  async invalidateDrafts(scenarioId: string): Promise<number> {
    const result = await this.prisma.explorationRouteVariant.updateMany({
      where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.DRAFT },
      data: { status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
    });
    return result.count;
  }

  async nextGenerationVersion(scenarioId: string): Promise<number> {
    const rows = await this.prisma.explorationRouteVariant.findMany({
      where: { scenarioId },
      select: { generationVersion: true },
    });
    if (rows.length === 0) return 1;
    return Math.max(...rows.map((r) => r.generationVersion)) + 1;
  }

  async hasSelectedRoute(scenarioId: string): Promise<boolean> {
    const selected = await this.prisma.explorationRouteVariant.findFirst({
      where: { scenarioId, status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED },
      select: { id: true },
    });
    return Boolean(selected);
  }
}
