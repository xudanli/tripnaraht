import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import type { CompilationResult } from '../contracts/compilation-result.types';
import type { CanonicalTravelGraph } from '../contracts/canonical-travel-graph.types';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import { graphToItinerary } from '../projection/graph-to-itinerary.util';
import {
  TRIP_METADATA_CANONICAL_TRAVEL_GRAPH,
  TRIP_METADATA_TRAVEL_COMPILATION,
  TRIP_METADATA_GRAPH_PROJECTED_ITINERARY,
} from '../constants/travel-graph-metadata.constants';

export type StoredTravelCompilation = Pick<
  CompilationResult,
  'compileId' | 'status' | 'score' | 'createdAt' | 'finishedAt'
> & {
  warningCount: number;
  errorCount: number;
};

@Injectable()
export class TravelGraphStoreService {
  private readonly logger = new Logger(TravelGraphStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  async persistCompilation(tripId: string, result: CompilationResult): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const prev = (trip.metadata ?? {}) as Record<string, unknown>;
    const summary: StoredTravelCompilation = {
      compileId: result.compileId,
      status: result.status,
      score: result.score,
      createdAt: result.createdAt,
      finishedAt: result.finishedAt,
      warningCount: result.warnings.length,
      errorCount: result.errors.length,
    };

    const next: Record<string, unknown> = {
      ...prev,
      travelCompilationSummary: summary,
      [TRIP_METADATA_TRAVEL_COMPILATION]: result,
    };
    if (result.graph) {
      next[TRIP_METADATA_CANONICAL_TRAVEL_GRAPH] = result.graph;
      next[TRIP_METADATA_GRAPH_PROJECTED_ITINERARY] = graphToItinerary(result.graph);
    }

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata: toInputJsonValue(next) },
    });

    this.logger.debug(
      `Persisted travel graph tripId=${tripId} compileId=${result.compileId} status=${result.status}`,
    );
  }

  readGraphFromMetadata(metadata: unknown): CanonicalTravelGraph | undefined {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const graph = meta[TRIP_METADATA_CANONICAL_TRAVEL_GRAPH];
    if (!graph || typeof graph !== 'object') return undefined;
    return graph as CanonicalTravelGraph;
  }

  readCompilationFromMetadata(metadata: unknown): CompilationResult | undefined {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const raw = meta.travelCompilationResult ?? meta[TRIP_METADATA_TRAVEL_COMPILATION];
    if (!raw || typeof raw !== 'object') return undefined;
    if ('graph' in (raw as CompilationResult) || 'phaseReports' in (raw as CompilationResult)) {
      return raw as CompilationResult;
    }
    return undefined;
  }

  readCompilationSummary(metadata: unknown): StoredTravelCompilation | undefined {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const summaryRaw = meta.travelCompilationSummary;
    if (summaryRaw && typeof summaryRaw === 'object') {
      return summaryRaw as StoredTravelCompilation;
    }
    const full = this.readCompilationFromMetadata(metadata);
    if (!full) return undefined;
    return {
      compileId: full.compileId,
      status: full.status,
      score: full.score,
      createdAt: full.createdAt,
      finishedAt: full.finishedAt,
      warningCount: full.warnings.length,
      errorCount: full.errors.length,
    };
  }

  async getGraph(tripId: string): Promise<CanonicalTravelGraph | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }
    return this.readGraphFromMetadata(trip.metadata);
  }

  readProjectedItinerary(metadata: unknown): Itinerary | undefined {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const raw = meta[TRIP_METADATA_GRAPH_PROJECTED_ITINERARY];
    if (!raw || typeof raw !== 'object') return undefined;
    return raw as Itinerary;
  }

  async getArtifacts(tripId: string): Promise<{
    graph?: CanonicalTravelGraph;
    compilation?: CompilationResult;
    summary?: StoredTravelCompilation;
    projectedItinerary?: Itinerary;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }
    return {
      graph: this.readGraphFromMetadata(trip.metadata),
      compilation: this.readCompilationFromMetadata(trip.metadata),
      summary: this.readCompilationSummary(trip.metadata),
      projectedItinerary: this.readProjectedItinerary(trip.metadata),
    };
  }
}
