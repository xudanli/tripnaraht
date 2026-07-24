import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { runExactAliasStage } from '../pipeline/exact-alias.stage';
import { runFuzzyAliasStage } from '../pipeline/fuzzy-alias.stage';
import { PoiAliasRegistryService } from './poi-alias-registry.service';
import {
  CPRE_AMBIGUITY_DELTA,
  CPRE_MATCH_CONFIDENCE_THRESHOLD,
  type ResolvePoiBatchResult,
  type ResolvePoiBatchSummary,
  type ResolvePoiInput,
  type ResolutionResult,
} from '../types/canonical-poi.types';

@Injectable()
export class CanonicalPoiResolutionService {
  private readonly logger = new Logger(CanonicalPoiResolutionService.name);

  constructor(
    private readonly registry: PoiAliasRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  async resolve(input: ResolvePoiInput): Promise<ResolutionResult> {
    const result = this.resolveSync(input);
    await this.logResolution(input.name, result).catch((err) => {
      this.logger.debug(`resolution log skipped: ${String(err)}`);
    });
    return result;
  }

  async resolveBatch(items: ResolvePoiInput[]): Promise<ResolvePoiBatchResult> {
    const results: ResolutionResult[] = [];
    for (const item of items) {
      results.push(await this.resolve(item));
    }
    return {
      results,
      summary: this.summarize(results),
    };
  }

  getCanonicalPoi(poiId: string) {
    return this.registry.getByPoiId(poiId) ?? null;
  }

  private resolveSync(input: ResolvePoiInput): ResolutionResult {
    const trimmed = input.name?.trim();
    if (!trimmed) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        reason: 'empty query',
        evidence: [{ stage: 'INPUT', label: '' }],
      };
    }

    const catalog = this.registry.getCatalog(input.countryCode);
    const stageInput = {
      query: trimmed,
      countryCode: input.countryCode,
      catalog,
    };
    let stageMatches = runExactAliasStage(stageInput);
    if (stageMatches.length === 0) {
      stageMatches = runFuzzyAliasStage(stageInput);
    }

    if (stageMatches.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        reason: 'no match in registry',
        evidence: [{ stage: 'INPUT', label: trimmed }],
      };
    }

    const top = stageMatches[0]!;
    const runnerUp = stageMatches[1];
    const ambiguous =
      runnerUp != null && top.confidence - runnerUp.confidence <= CPRE_AMBIGUITY_DELTA;

    if (ambiguous) {
      return {
        status: 'AMBIGUOUS',
        confidence: top.confidence,
        candidates: stageMatches.slice(0, 5).map((m) => ({
          poiId: m.poi.poiId,
          canonicalName: m.poi.canonicalName,
          confidence: m.confidence,
        })),
        evidence: top.evidence,
        reason: 'multiple candidates with similar confidence',
      };
    }

    if (top.confidence < CPRE_MATCH_CONFIDENCE_THRESHOLD) {
      return {
        status: 'NEEDS_CONFIRMATION',
        method: top.method,
        poiId: top.poi.poiId,
        confidence: top.confidence,
        matchedPoi: top.poi,
        candidates: stageMatches.slice(0, 5).map((m) => ({
          poiId: m.poi.poiId,
          canonicalName: m.poi.canonicalName,
          confidence: m.confidence,
        })),
        evidence: top.evidence,
        reason: `confidence ${top.confidence.toFixed(2)} below threshold ${CPRE_MATCH_CONFIDENCE_THRESHOLD}`,
      };
    }

    return {
      status: 'MATCHED',
      method: top.method,
      poiId: top.poi.poiId,
      confidence: top.confidence,
      matchedPoi: top.poi,
      evidence: top.evidence,
    };
  }

  private summarize(results: ResolutionResult[]): ResolvePoiBatchSummary {
    return {
      total: results.length,
      matched: results.filter((r) => r.status === 'MATCHED').length,
      ambiguous: results.filter((r) => r.status === 'AMBIGUOUS').length,
      notFound: results.filter((r) => r.status === 'NOT_FOUND').length,
      needsConfirmation: results.filter((r) => r.status === 'NEEDS_CONFIRMATION').length,
    };
  }

  private async logResolution(queryName: string, result: ResolutionResult): Promise<void> {
    await this.prisma.poiResolutionLog.create({
      data: {
        queryName,
        poiId: result.poiId,
        method: result.method,
        confidence: result.confidence,
        evidence: (result.evidence ?? []) as object,
      },
    });
  }
}
