import { Injectable } from '@nestjs/common';
import {
  listStrategyProfilesForExploration,
  resolveRegionTemplate,
} from '../config/exploration-protocol.registry';
import { resolveIcelandRouteDetail } from '../config/iceland-route-detail.catalog';
import { buildRouteVariantFromStrategy } from '../utils/route-variant-builder.util';
import type {
  GeneratedRouteVariantBundle,
  RouteGenerationContext,
} from '../types/exploration-route-generation.types';

@Injectable()
export class StaticArchetypeRouteProvider {
  generate(ctx: RouteGenerationContext): GeneratedRouteVariantBundle[] {
    const template = resolveRegionTemplate(ctx.destinationCode);
    const strategies = listStrategyProfilesForExploration(ctx.protocolId, ctx.destinationCode);
    if (!template || strategies.length === 0) return [];

    return strategies.map((strategy, index) => {
      const built = buildRouteVariantFromStrategy({
        strategy,
        template,
        routeIndex: index,
        generationVersion: ctx.generationVersion,
      });
      const catalog = resolveIcelandRouteDetail(built.routeId);
      return {
        routeId: built.routeId,
        strategyId: built.strategyId,
        variantBranchKey: built.variantBranchKey,
        title: built.title,
        narrative: built.narrative,
        metrics: built.metrics,
        gains: built.gains,
        sacrifices: built.sacrifices,
        generationSource: 'STATIC_CATALOG' as const,
        routeDetail: catalog?.detail,
        tagline: catalog?.tagline,
        badge: catalog?.badge,
      };
    });
  }
}
