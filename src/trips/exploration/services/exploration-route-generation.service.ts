import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  resolveRouteGenerationMode,
  type ExplorationRouteGenerationMode,
} from '../config/exploration-route-generation.config';
import { PersonalizedRouteProvider } from '../providers/personalized-route.provider';
import { StaticArchetypeRouteProvider } from '../providers/static-archetype-route.provider';
import { EngineGeometryRouteProvider } from '../providers/engine-geometry-route.provider';
import { LlmRouteNarrativeProvider } from '../providers/llm-route-narrative.provider';
import type {
  GeneratedRouteVariantBundle,
  RouteGenerationContext,
} from '../types/exploration-route-generation.types';
import { getConstraintsVersion } from '../../trip-constraint-solver/utils/constraints-metadata.util';

@Injectable()
export class ExplorationRouteGenerationService {
  private readonly logger = new Logger(ExplorationRouteGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staticProvider: StaticArchetypeRouteProvider,
    private readonly personalizedProvider: PersonalizedRouteProvider,
    @Optional() private readonly engineProvider?: EngineGeometryRouteProvider,
    @Optional() private readonly llmNarrative?: LlmRouteNarrativeProvider,
  ) {}

  getActiveMode(): ExplorationRouteGenerationMode {
    return resolveRouteGenerationMode();
  }

  async generate(ctx: RouteGenerationContext): Promise<{
    mode: ExplorationRouteGenerationMode;
    variants: GeneratedRouteVariantBundle[];
  }> {
    const rankedPrinciples = await this.readRankedPrinciples(ctx.tripId);
    const enriched: RouteGenerationContext = { ...ctx, rankedPrinciples };

    const mode = this.getActiveMode();
    let variants: GeneratedRouteVariantBundle[];

    switch (mode) {
      case 'ENGINE':
        variants =
          (await this.engineProvider?.generate(enriched)) ??
          this.personalizedProvider.generate(enriched);
        break;
      case 'PERSONALIZED':
        variants = this.personalizedProvider.generate(enriched);
        break;
      case 'STATIC':
      default:
        variants = this.staticProvider.generate(enriched);
    }

    variants = (await this.llmNarrative?.enrich(variants, enriched)) ?? variants;

    this.logger.log(
      `Generated ${variants.length} route variants mode=${mode} scenario=${ctx.scenarioId}`,
    );

    return { mode, variants };
  }

  private async readRankedPrinciples(tripId: string): Promise<string[] | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip?.metadata || typeof trip.metadata !== 'object') return undefined;
    const meta = trip.metadata as Record<string, unknown>;
    const version = getConstraintsVersion(meta);
    const constraints = meta.constraints as Record<string, unknown> | undefined;
    const objectives = constraints?.objectives as Record<string, unknown> | undefined;
    const ranked = objectives?.rankedPrinciples;
    if (Array.isArray(ranked) && ranked.every((x) => typeof x === 'string')) {
      return ranked as string[];
    }
    void version;
    return undefined;
  }
}
