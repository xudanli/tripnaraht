import { Injectable, Logger } from '@nestjs/common';
import { WorldFactResolverService } from './world-fact-resolver.service';
import type { DecisionFactor, DecisionImpact } from './decision-awareness.types';
import { DecisionFactorFactoryService } from './decision-factor.factory';
import { routeImpactsFromWindDecisionFactors } from './builders/country-wind.builder';
import { routeVehicleFactKey } from './builders/route-access.builder';

/**
 * 将 Resolver 中的事实投影为 DecisionFactor / DecisionImpact。
 * WEATHER / ROAD_ACCESS 叙事与 Trip Explainability 同源（builders）。
 */
@Injectable()
export class DecisionAwarenessAugmentationService {
  private readonly logger = new Logger(DecisionAwarenessAugmentationService.name);

  constructor(
    private readonly resolver: WorldFactResolverService,
    private readonly decisionFactorFactory: DecisionFactorFactoryService,
  ) {}

  /**
   * 基于 country:{CC}:aggregated_wind_mps 生成因子与（示意性）路线调整影响。
   */
  async buildWeatherAwarenessForCountry(countryCode: string): Promise<{
    decisionFactors: DecisionFactor[];
    decisionImpacts: DecisionImpact[];
  }> {
    const cc = countryCode.trim().toUpperCase();

    try {
      const factKey = `country:${cc}:aggregated_wind_mps`;
      const resolved = await this.resolver.resolveLatestByFactKey(factKey);
      const decisionFactors = this.decisionFactorFactory.decisionFactorsFromCountryWindResolved(
        resolved,
        { verboseLowWind: false },
      );
      const decisionImpacts = routeImpactsFromWindDecisionFactors(decisionFactors, cc);
      return { decisionFactors, decisionImpacts };
    } catch (e: any) {
      this.logger.warn(`DecisionAwareness weather augmentation failed: ${e?.message ?? e}`);
      return { decisionFactors: [], decisionImpacts: [] };
    }
  }

  /**
   * 路线交互上下文：WEATHER（国家） + 可选 ROAD_ACCESS（routeDirectionId）。
   */
  async buildRouteInteractionsAwareness(params: {
    countryCode: string;
    routeDirectionId?: string;
  }): Promise<{ decisionFactors: DecisionFactor[]; decisionImpacts: DecisionImpact[] }> {
    const weather = await this.buildWeatherAwarenessForCountry(params.countryCode);
    const rdId = params.routeDirectionId?.trim();
    if (!rdId) {
      return weather;
    }

    try {
      const resolved = await this.resolver.resolveLatestByFactKey(routeVehicleFactKey(rdId));
      const roadFactors = this.decisionFactorFactory.decisionFactorsFromRouteVehicleResolved(
        resolved,
        rdId,
      );
      return {
        decisionFactors: [...weather.decisionFactors, ...roadFactors],
        decisionImpacts: weather.decisionImpacts,
      };
    } catch (e: any) {
      this.logger.warn(`DecisionAwareness ROAD_ACCESS augmentation failed: ${e?.message ?? e}`);
      return weather;
    }
  }
}
