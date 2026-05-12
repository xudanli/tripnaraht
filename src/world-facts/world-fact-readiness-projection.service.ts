import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { driveSafetyWindThresholdMps } from '../trips/ontology/environment/weather.schema';
import { WorldFactResolverService } from './world-fact-resolver.service';
import type { ReadinessProjectionItem } from './world-fact.types';

/**
 * Phase 1：只读 WorldFact → 人类可读准备度片段（不替代 Pack，仅补充 + derivedFrom）。
 * Phase 2：统一经 {@link WorldFactResolverService} 读取事实（不单直连仓库）。
 */
@Injectable()
export class WorldFactReadinessProjectionService {
  private readonly logger = new Logger(WorldFactReadinessProjectionService.name);

  constructor(
    private readonly resolver: WorldFactResolverService,
    private readonly config: ConfigService,
  ) {}

  private projectionEnabled(): boolean {
    const v =
      this.config.get<string>('WORLD_FACT_READINESS_PROJECTION_ENABLED') ??
      process.env.WORLD_FACT_READINESS_PROJECTION_ENABLED;
    return v === '1' || v === 'true' || v === 'yes';
  }

  /**
   * 基于最新 country 级风速事实生成一条安全提示（若有）。
   */
  async projectWindDriveAdvisory(countryCode: string): Promise<ReadinessProjectionItem | null> {
    if (!this.projectionEnabled()) return null;

    const cc = countryCode.toUpperCase();
    try {
      const resolved = await this.resolver.resolveLatestBySubjectPredicate('country', cc, 'aggregated_wind_mps');
      if (!resolved?.fact?.valueJson || typeof resolved.fact.valueJson !== 'object') return null;

      const row = resolved.fact;
      const mps = (row.valueJson as { mps?: number }).mps;
      if (typeof mps !== 'number' || !Number.isFinite(mps)) return null;

      const thr = driveSafetyWindThresholdMps('2WD');
      if (mps <= thr) return null;

      return {
        message: `根据观测风速聚合（约 ${mps.toFixed(1)} m/s），自驾风险升高；建议确认车型与防风策略（WorldFact 投影）。`,
        derivedFromFactIds: [row.id],
        templateId: 'country.wind_gt_threshold_safety_v1',
      };
    } catch (e: any) {
      this.logger.warn(`Readiness projection failed: ${e?.message ?? e}`);
      return null;
    }
  }
}
