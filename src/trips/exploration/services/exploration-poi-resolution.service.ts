import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CanonicalPoiResolutionService } from '../../../canonical-poi-resolution/services/canonical-poi-resolution.service';
import { PoiAliasRegistryService } from '../../../canonical-poi-resolution/services/poi-alias-registry.service';
import type {
  ResolutionMethod,
  ResolutionResult,
  ResolutionStatus,
} from '../../../canonical-poi-resolution/types/canonical-poi.types';
import { TravelCompilerService } from '../../../travel-compiler/travel-compiler.service';
import type { TravelGraphPoiNode } from '../../../travel-compiler/contracts/canonical-travel-graph.types';
import { isTravelCompilerEnabled } from '../../../travel-compiler/utils/travel-compiler-config.util';
import type { ExplorationRouteDetailPayload } from '../config/iceland-route-detail.catalog';
import type { GeneratedRouteVariantBundle } from '../types/exploration-route-generation.types';
import type { ExplorationResolvedPoiRef } from '../config/iceland-route-detail.catalog';
import { collectRoutePoiCandidateNames } from '../utils/collect-route-poi-candidate-names.util';

@Injectable()
export class ExplorationPoiResolutionService {
  constructor(
    private readonly cpre: CanonicalPoiResolutionService,
    private readonly registry: PoiAliasRegistryService,
    @Optional() private readonly travelCompiler?: TravelCompilerService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async enrichVariants(
    variants: GeneratedRouteVariantBundle[],
    destinationCode: string,
  ): Promise<GeneratedRouteVariantBundle[]> {
    const countryCode = destinationCode.toUpperCase();
    return Promise.all(
      variants.map(async (variant) => {
        if (!variant.routeDetail) return variant;
        const resolvedPois = await this.resolveForVariant(variant, countryCode);
        return {
          ...variant,
          routeDetail: { ...variant.routeDetail, resolvedPois },
        };
      }),
    );
  }

  async resolveForRouteDetail(
    routeDetail: unknown,
    narrative: string | null | undefined,
    destinationCode: string,
  ): Promise<ExplorationResolvedPoiRef[]> {
    const detail = routeDetail as ExplorationRouteDetailPayload | null | undefined;

    return this.resolveForVariant(
      { narrative: narrative ?? '', routeDetail: detail ?? undefined } as GeneratedRouteVariantBundle,
      destinationCode.toUpperCase(),
    );
  }

  mergeResolvedPoisIntoDetail(
    routeDetail: ExplorationRouteDetailPayload,
    resolvedPois: ExplorationResolvedPoiRef[],
  ): ExplorationRouteDetailPayload {
    return { ...routeDetail, resolvedPois };
  }

  private async resolveForVariant(
    variant: Pick<GeneratedRouteVariantBundle, 'narrative' | 'routeDetail'>,
    countryCode: string,
  ): Promise<ExplorationResolvedPoiRef[]> {
    const catalog = this.registry.getCatalog(countryCode);
    const names = collectRoutePoiCandidateNames({
      narrative: variant.narrative,
      routeDetail: variant.routeDetail,
      catalog,
    });
    if (names.length === 0) return [];

    if (
      this.travelCompiler &&
      isTravelCompilerEnabled(this.configService)
    ) {
      const compilation = await this.travelCompiler.compileFromPoiMentions({
        names,
        countryCode,
        source: 'exploration',
      });
      return mapCompilationToExplorationRefs(names, compilation);
    }

    const batch = await this.cpre.resolveBatch(
      names.map((name) => ({ name, countryCode })),
    );

    return batch.results.map((result, i) =>
      toExplorationResolvedPoiRef(names[i] ?? '', result),
    );
  }
}

function mapCompilationToExplorationRefs(
  names: string[],
  compilation: Awaited<ReturnType<TravelCompilerService['compileFromPoiMentions']>>,
): ExplorationResolvedPoiRef[] {
  const poiNodes = compilation.graph?.nodes.filter((n) => n.kind === 'POI') ?? [];
  return names.map((name, i) => {
    const node =
      poiNodes.find((n) => n.sourceSlotId === `mention_${i}`) ??
      poiNodes.find((n) => n.label === name || n.canonicalization?.rawText === name);
    const canon = node?.canonicalization;
    const matched = canon?.status === 'RESOLVED' || Boolean(node?.canonical?.poiId);
    return {
      name,
      resolved: matched,
      poiId: node?.canonical?.poiId,
      confidence: canon?.confidence ?? (matched ? 1 : 0),
      method: canon?.method as ResolutionMethod | undefined,
      status: (canon?.status === 'RESOLVED'
        ? 'MATCHED'
        : canon?.status === 'UNRESOLVED'
          ? 'NOT_FOUND'
          : (canon?.status as ResolutionStatus | undefined)) ?? (matched ? 'MATCHED' : 'NOT_FOUND'),
      canonicalName: node?.kind === 'POI' ? (node as TravelGraphPoiNode).displayNames?.en : undefined,
    };
  });
}

function toExplorationResolvedPoiRef(
  name: string,
  result: ResolutionResult,
): ExplorationResolvedPoiRef {
  const resolved = result.status === 'MATCHED';
  return {
    name,
    resolved,
    poiId: result.poiId,
    confidence: result.confidence,
    method: result.method as ResolutionMethod | undefined,
    status: result.status as ResolutionStatus,
    canonicalName: result.matchedPoi?.canonicalName,
  };
}
