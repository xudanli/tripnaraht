import { Injectable } from '@nestjs/common';
import { resolveIcelandRouteDetail } from '../config/iceland-route-detail.catalog';
import { StaticArchetypeRouteProvider } from './static-archetype-route.provider';
import type {
  GeneratedRouteVariantBundle,
  RouteGenerationContext,
} from '../types/exploration-route-generation.types';
import type { ExplorationRouteDetailPayload } from '../config/iceland-route-detail.catalog';
import { densifyRouteMapGeometry } from '../utils/route-map-geometry.util';

@Injectable()
export class PersonalizedRouteProvider {
  constructor(private readonly staticProvider: StaticArchetypeRouteProvider) {}

  generate(ctx: RouteGenerationContext): GeneratedRouteVariantBundle[] {
    const base = this.staticProvider.generate(ctx);
    const vehicle = ctx.initialInput.mobilityContext?.vehicleType ?? '2WD_COMPACT_SUV';
    const is4wd = vehicle.includes('4WD');
    const topPrinciple = ctx.rankedPrinciples?.[0];

    return base.map((variant) => {
      const catalog = resolveIcelandRouteDetail(variant.routeId);
      const detail = this.personalizeDetail(catalog?.detail, ctx, variant.strategyId);
      const narrative = this.personalizeNarrative(variant, ctx, is4wd, topPrinciple);

      return {
        ...variant,
        narrative,
        generationSource: 'PERSONALIZED',
        routeDetail: detail,
        metrics: this.adjustMetrics(variant.metrics, ctx, variant.strategyId),
        sacrifices: this.adjustSacrifices(variant.sacrifices, is4wd, variant.strategyId),
        tagline: this.personalizeTagline(catalog?.tagline, topPrinciple),
        badge: catalog?.badge,
      };
    });
  }

  private personalizeNarrative(
    variant: GeneratedRouteVariantBundle,
    ctx: RouteGenerationContext,
    is4wd: boolean,
    topPrinciple?: string,
  ): string {
    const days = this.tripDayCount(ctx);
    const vehicleNote = is4wd ? '四驱配置' : '2WD 配置';
    const principleNote = topPrinciple
      ? `优先原则：${this.principleLabel(topPrinciple)}`
      : '基于你的旅行原则';
    return `${variant.narrative} 本方案按你的 ${days} 天行程与${vehicleNote}个性化；${principleNote}。`;
  }

  private personalizeTagline(tagline?: string, topPrinciple?: string): string | undefined {
    if (!tagline || !topPrinciple) return tagline;
    return `${tagline} · 契合 ${this.principleLabel(topPrinciple)}`;
  }

  private personalizeDetail(
    detail: ExplorationRouteDetailPayload | undefined,
    ctx: RouteGenerationContext,
    strategyId: string,
  ): ExplorationRouteDetailPayload | undefined {
    if (!detail) return undefined;

    const vehicle = ctx.initialInput.mobilityContext?.vehicleType ?? '2WD_COMPACT_SUV';
    const is4wd = vehicle.includes('4WD');
    const days = this.tripDayCount(ctx);

    const preparations = [...detail.preparations];
    if (strategyId === 'remote-highlands-south' && !is4wd) {
      preparations.unshift('当前选择 2WD：高地 F 路段风险更高，建议升级四驱或调整策略');
    }
    if (is4wd && strategyId === 'remote-highlands-south') {
      preparations.unshift('已选四驱：更适合 F 路探索，仍需确认季节性开放');
    }

    return {
      ...detail,
      summary: `${detail.summary}（${days} 天 · ${vehicle}）`,
      preparations,
      map: densifyRouteMapGeometry(detail.map),
      days: detail.days.map((d) => ({
        ...d,
        tip:
          d.highlight && strategyId === 'remote-highlands-south' && !is4wd
            ? '高地日 + 2WD：强烈建议关注 F 路车辆要求'
            : d.tip,
      })),
    };
  }

  private adjustMetrics(
    metrics: Record<string, number>,
    ctx: RouteGenerationContext,
    strategyId: string,
  ): Record<string, number> {
    const next = { ...metrics };
    const top = ctx.rankedPrinciples?.[0];
    if (top === 'PACE' || top === 'LOW_DRIVING') {
      next.drivingIntensity = Math.max(0, (next.drivingIntensity ?? 0.5) - 0.08);
    }
    if (top === 'REMOTE_EXPLORATION' && strategyId === 'remote-highlands-south') {
      next.exploration = Math.min(1, (next.exploration ?? 0.5) + 0.1);
    }
    return next;
  }

  private adjustSacrifices(
    sacrifices: Array<{ id: string; label: string }>,
    is4wd: boolean,
    strategyId: string,
  ) {
    if (strategyId !== 'remote-highlands-south' || is4wd) return sacrifices;
    return [
      ...sacrifices,
      { id: 'sac_2wd_highlands', label: '2WD 进入高地门槛更高' },
    ];
  }

  private tripDayCount(ctx: RouteGenerationContext): number {
    const start = new Date(ctx.initialInput.dateRange.startDate);
    const end = new Date(ctx.initialInput.dateRange.endDate);
    return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
  }

  private principleLabel(key: string): string {
    const map: Record<string, string> = {
      PACE: '少开车',
      SAFETY: '安全优先',
      CORE_EXPERIENCE: '核心体验优先',
      FEWER_HOTEL_CHANGES: '少换酒店',
      REMOTE_EXPLORATION: '偏远探索',
    };
    return map[key] ?? key;
  }
}
