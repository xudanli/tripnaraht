import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import { LlmService } from '../../../llm/services/llm.service';
import {
  isLlmRouteNarrativeEnabled,
  isLlmRouteNarrativeLive,
} from '../config/exploration-route-generation.config';
import type {
  GeneratedRouteVariantBundle,
  RouteGenerationContext,
} from '../types/exploration-route-generation.types';
import { ICELAND_CANONICAL_POI_CATALOG } from '../../../canonical-poi-resolution/fixtures/iceland-canonical-poi.catalog';
import { collectRoutePoiCandidateNames } from '../utils/collect-route-poi-candidate-names.util';

const ROUTE_NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    routes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          routeId: { type: 'string' },
          narrative: { type: 'string' },
          tagline: { type: 'string' },
          poiMentions: {
            type: 'array',
            items: { type: 'string' },
            description: '该路线核心 POI 官方名或已知别名',
          },
        },
        required: ['routeId', 'narrative', 'poiMentions'],
      },
    },
  },
  required: ['routes'],
};

/**
 * Phase 3 LLM 叙事 — 模板 stub + 可选真实 LLM（EXPLORATION_LLM_ROUTE_NARRATIVE_LIVE=1）
 */
@Injectable()
export class LlmRouteNarrativeProvider {
  private readonly logger = new Logger(LlmRouteNarrativeProvider.name);

  constructor(@Optional() private readonly llm?: LlmService) {}

  async enrich(
    variants: GeneratedRouteVariantBundle[],
    ctx: RouteGenerationContext,
  ): Promise<GeneratedRouteVariantBundle[]> {
    if (!isLlmRouteNarrativeEnabled()) {
      return variants;
    }

    if (isLlmRouteNarrativeLive() && this.llm) {
      try {
        return await this.enrichViaLlm(variants, ctx);
      } catch (err) {
        this.logger.warn(
          `LLM route narrative failed, using template: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return this.enrichViaTemplate(variants, ctx);
  }

  private async enrichViaLlm(
    variants: GeneratedRouteVariantBundle[],
    ctx: RouteGenerationContext,
  ): Promise<GeneratedRouteVariantBundle[]> {
    const prompt = this.buildLlmPrompt(variants, ctx);
    const response = await this.llm!.callLlmWithSchema(
      LlmProvider.DEEPSEEK,
      prompt,
      ROUTE_NARRATIVE_SCHEMA,
    );

    const parsed = JSON.parse(response) as {
      routes: Array<{
        routeId: string;
        narrative: string;
        tagline?: string;
        poiMentions?: string[];
      }>;
    };
    const byRouteId = new Map(parsed.routes.map((r) => [r.routeId, r]));

    return variants.map((variant) => {
      const llm = byRouteId.get(variant.routeId);
      if (!llm) return this.applyTemplate(variant, ctx);
      return {
        ...variant,
        generationSource: 'LLM',
        narrative: this.mergeNarrativeWithPois(llm.narrative, llm.poiMentions),
        tagline: llm.tagline ?? variant.tagline,
        routeDetail: variant.routeDetail
          ? {
              ...variant.routeDetail,
              poiMentions: (llm.poiMentions ?? []).map((p) => p.trim()).filter((p) => p.length >= 2),
            }
          : variant.routeDetail,
      };
    });
  }

  private buildLlmPrompt(
    variants: GeneratedRouteVariantBundle[],
    ctx: RouteGenerationContext,
  ): string {
    const days = this.tripDayCount(ctx);
    const vehicle = ctx.initialInput.mobilityContext?.vehicleType ?? '2WD_COMPACT_SUV';
    const principles = ctx.rankedPrinciples?.join(', ') ?? '未指定';

    const routesJson = variants.map((v) => ({
      routeId: v.routeId,
      title: v.title,
      strategyId: v.strategyId,
      baseNarrative: v.narrative,
      gains: v.gains.map((g) => g.label),
      sacrifices: v.sacrifices.map((s) => s.label),
      highlights: v.routeDetail?.highlights ?? [],
      days: (v.routeDetail?.days ?? []).map((d) => ({
        day: d.day,
        theme: d.theme,
        route: d.route,
        experience: d.experience,
      })),
    }));

    return `你是 TripNARA 冰岛自驾规划助手。用户 ${days} 天行程，车辆 ${vehicle}，旅行原则优先级：${principles}。

请为以下路线各写：
1. narrative：180 字以内中文，专业诚实，强调「典型走法对比」；正文须自然提及该路线 6–12 个核心 POI（用官方英文名或通行中文别名，如 Reynisfjara、黄金瀑布、Jökulsárlón）。
2. tagline：20 字以内。
3. poiMentions：从下方 days/highlights 提取的核心 POI 数组（6–12 个，用 CPRE 可解析的官方名/别名，不要泛化描述如「南岸瀑布」）。

路线数据：
${JSON.stringify(routesJson, null, 2)}

返回 JSON：{ "routes": [{ "routeId", "narrative", "tagline", "poiMentions": ["..."] }] }`;
  }

  /** 将 LLM 输出的 poiMentions 追加到 narrative 末尾，供 CPRE 文本扫描 */
  private mergeNarrativeWithPois(narrative: string, poiMentions?: string[]): string {
    const pois = (poiMentions ?? []).map((p) => p.trim()).filter((p) => p.length >= 2);
    if (pois.length === 0) return narrative;
    return `${narrative.trim()} 途经：${pois.join('、')}。`;
  }

  private enrichViaTemplate(
    variants: GeneratedRouteVariantBundle[],
    ctx: RouteGenerationContext,
  ): GeneratedRouteVariantBundle[] {
    return variants.map((variant) => this.applyTemplate(variant, ctx));
  }

  private applyTemplate(
    variant: GeneratedRouteVariantBundle,
    ctx: RouteGenerationContext,
  ): GeneratedRouteVariantBundle {
    const topPrinciple = ctx.rankedPrinciples?.[0];
    const narrative = this.buildTemplateNarrative(variant, ctx, topPrinciple);
    const poiMentions = this.extractTemplatePoiMentions(variant);
    const poiSuffix = poiMentions.length > 0 ? `途经：${poiMentions.join('、')}。` : '';
    return {
      ...variant,
      generationSource: 'LLM',
      narrative: poiSuffix ? `${narrative} ${poiSuffix}` : narrative,
      tagline: variant.tagline
        ? `${variant.tagline} · AI 解读`
        : 'AI 为你解读这条走法',
      routeDetail: variant.routeDetail
        ? { ...variant.routeDetail, poiMentions }
        : variant.routeDetail,
    };
  }

  /** 模板路径：从 routeDetail 提取 POI mention 列表 */
  private extractTemplatePoiMentions(variant: GeneratedRouteVariantBundle): string[] {
    return collectRoutePoiCandidateNames({
      narrative: variant.narrative,
      routeDetail: variant.routeDetail,
      catalog: ICELAND_CANONICAL_POI_CATALOG,
    });
  }

  private buildTemplateNarrative(
    variant: GeneratedRouteVariantBundle,
    ctx: RouteGenerationContext,
    topPrinciple?: string,
  ): string {
    const days = this.tripDayCount(ctx);
    const vehicle = ctx.initialInput.mobilityContext?.vehicleType ?? '2WD_COMPACT_SUV';
    const principleNote = topPrinciple
      ? `你最看重「${this.principleLabel(topPrinciple)}」，`
      : '';

    return (
      `${principleNote}这条「${variant.title}」方案适合 ${days} 天、${vehicle} 的配置。` +
      `${variant.narrative} ` +
      `AI 建议：先对比 gains/sacrifices，再进入可靠性检查确认可执行性。`
    );
  }

  private tripDayCount(ctx: RouteGenerationContext): number {
    const start = new Date(ctx.initialInput.dateRange.startDate);
    const end = new Date(ctx.initialInput.dateRange.endDate);
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  }

  private principleLabel(key: string): string {
    const map: Record<string, string> = {
      PACE: '少开车',
      LOW_DRIVING: '少开车',
      SAFETY: '安全优先',
      CORE_EXPERIENCE: '核心体验优先',
      CORE_EXPERIENCE_FIRST: '核心体验优先',
      FEWER_HOTEL_CHANGES: '少换酒店',
      STAY_STABILITY: '少换酒店',
      REMOTE_EXPLORATION: '偏远探索',
      BUDGET_FLEXIBLE: '预算灵活',
    };
    return map[key] ?? key;
  }
}
