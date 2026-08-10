import { Logger } from '@nestjs/common';
import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { XiaohongshuDirectService } from '../../../mcp/xiaohongshu-direct.service';
import type { XhsExperienceBundle } from '../../../mcp/xiaohongshu-evidence.mapper';
import { formatXhsExperienceNarratorBlock } from '../../../mcp/format-xhs-experience-narrator.util';
import type { DecisionState } from '../decision-state.types';
import type { ObservationExecutionResult, ObservationToolExecutor } from './observation-harness.types';
import { scoreEvidenceHeuristic } from './tavily-evidence-scoring';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function destinationHint(dso: DecisionState): string | null {
  const dest = dso.userIntent?.destination;
  if (typeof dest === 'string' && dest.trim()) return dest.trim();
  return null;
}

function buildXhsSnsKeyword(
  action: Extract<TripObservationAction, { type: 'OBSERVATION_SNS_CRAWL' }>,
  dso: DecisionState,
): string {
  const terms = (action.queryTerms ?? []).map((t) => String(t).trim()).filter(Boolean);
  const dest = destinationHint(dso);
  const parts = [...terms];
  if (dest && !parts.some((p) => p.includes(dest))) parts.unshift(dest);
  if (parts.length === 0) parts.push('路况 天气 封路');
  // 社区检索偏中文旅行体验词
  const joined = parts.join(' ');
  if (!/路况|封路|天气|体验|值得/.test(joined)) {
    return `${joined} 近期路况 旅行体验`;
  }
  return joined;
}

function factsToText(bundle: XhsExperienceBundle): string {
  return bundle.facts
    .map((f) => [f.title, f.excerpt].filter(Boolean).join(' '))
    .join('\n');
}

/**
 * OBSERVATION_SNS_CRAWL：优先小红书社区体验证据；失败/无样本时回落 fallback（通常为 Tavily）。
 * 非 SNS 动作一律交给 fallback。
 */
export class CompositeSnsObservationExecutor implements ObservationToolExecutor {
  private readonly logger = new Logger(CompositeSnsObservationExecutor.name);

  constructor(
    private readonly xhs: XiaohongshuDirectService | undefined,
    private readonly fallback: ObservationToolExecutor,
  ) {}

  async execute(
    action: TripObservationAction,
    dso: DecisionState,
  ): Promise<ObservationExecutionResult> {
    if (action.type === 'OBSERVATION_SNS_CRAWL' && this.xhs?.isServiceAvailable()) {
      try {
        const xhsResult = await this.tryXiaohongshuSns(action, dso);
        if (xhsResult) return xhsResult;
        this.logger.warn(
          '[ObservationSNS] 小红书无可用样本，回落 Tavily/Default',
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[ObservationSNS] 小红书失败，回落: ${msg.slice(0, 200)}`);
      }
    }
    return this.fallback.execute(action, dso);
  }

  private async tryXiaohongshuSns(
    action: Extract<TripObservationAction, { type: 'OBSERVATION_SNS_CRAWL' }>,
    dso: DecisionState,
  ): Promise<ObservationExecutionResult | null> {
    if (!this.xhs) return null;
    const keyword = buildXhsSnsKeyword(action, dso);
    const searched = await this.xhs.searchAsExperienceBundle({
      keyword,
      limit: 12,
      destinationHint: destinationHint(dso),
    });
    if (!searched.success || !searched.bundle || searched.bundle.sampleSize <= 0) {
      return null;
    }
    const bundle = searched.bundle;
    const scored = scoreEvidenceHeuristic('sns', factsToText(bundle));
    // 社区 UGC：证据权重上限低于官方/多源聚合
    const evidenceWeight = clamp01(Math.min(scored.evidenceWeight, 0.55) * 0.85);
    return {
      evidenceKind: 'recent_social_image',
      passability01: scored.passability01,
      evidenceWeight,
      routeSegmentInfeasible: scored.routeSegmentInfeasible,
      evidenceContradiction: scored.evidenceContradiction,
      affectedPoiIds: scored.affectedPoiIds,
      summary: formatXhsExperienceNarratorBlock(bundle),
      communityExperience: bundle as unknown as Record<string, unknown>,
      disclaimerZh: bundle.disclaimerZh,
      provider: 'xiaohongshu',
    };
  }
}
