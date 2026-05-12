import { Injectable } from '@nestjs/common';
import type { ExplainabilityReason } from './explainability/trip-explainability.types';
import { impactLevelFromEffect, type DecisionFactor } from './decision-awareness.types';
import type { ResolvedWorldFact } from './world-fact-resolver.types';
import {
  explainabilityReasonToDecisionFactor,
  explainabilityReasonsToDecisionFactors,
} from './decision-factor.mapper';
import { driveSafetyWindThresholdMps } from '../trips/ontology/environment/weather.schema';

/**
 * 唯一对外 DecisionFactor 构造入口。
 * P2：直接由 WorldFact（Resolved）生成 DSL 化因子；ExplainabilityReason 仅保留遗留映射。
 */
@Injectable()
export class DecisionFactorFactoryService {
  /** @deprecated 遗留路径；新链路使用 fromCountryWindResolved / fromRouteVehicleResolved */
  fromExplainabilityReason(reason: ExplainabilityReason): DecisionFactor {
    return explainabilityReasonToDecisionFactor(reason);
  }

  /** @deprecated 遗留路径 */
  fromExplainabilityReasons(reasons: ExplainabilityReason[]): DecisionFactor[] {
    return explainabilityReasonsToDecisionFactors(reasons);
  }

  /**
   * country:{CC}:aggregated_wind_mps → DecisionFactor[]（唯一叙事 + DSL 字段）
   */
  decisionFactorsFromCountryWindResolved(
    resolved: ResolvedWorldFact | null,
    opts?: { verboseLowWind?: boolean },
  ): DecisionFactor[] {
    if (!resolved) return [];

    const { fact, freshness } = resolved;
    const mps = (fact.valueJson as { mps?: number })?.mps;
    const thr = driveSafetyWindThresholdMps('2WD');

    if (freshness.isExpiredByValidTo) {
      const effect = 'NONE' as const;
      return [
        {
          factorType: 'WEATHER',
          title: '风速观测（已过期）',
          summary: `库中存在聚合风速记录，但 validTo 已过期；不宜单独作为当前路况依据。freshness=${freshness.freshnessScore.toFixed(2)}。`,
          impactLevel: impactLevelFromEffect(effect),
          derivedFromFactIds: [fact.id],
          confidence: fact.confidence ?? undefined,
          assert: 'validTo_expired',
          effect,
          target: 'COUNTRY',
          actionHint: 'NONE',
        },
      ];
    }

    if (typeof mps !== 'number' || !Number.isFinite(mps)) {
      return [];
    }

    if (mps > thr) {
      const effect = 'WARNING' as const;
      return [
        {
          factorType: 'WEATHER',
          title: '横风 / 风速偏高',
          summary: `本国关联区域聚合风速约 ${mps.toFixed(1)} m/s（阈值参考 ${thr.toFixed(1)} m/s），自驾侧风风险升高；建议确认车型与防风策略。`,
          impactLevel: impactLevelFromEffect(effect),
          derivedFromFactIds: [fact.id],
          confidence: fact.confidence ?? undefined,
          assert: `aggregated_wind_mps(${mps.toFixed(2)}) > threshold_2wd(${thr.toFixed(2)})`,
          effect,
          target: 'ROUTE',
          actionHint: 'DEGRADE_ROUTE',
        },
      ];
    }

    if (opts?.verboseLowWind) {
      const effect = 'SUGGEST' as const;
      return [
        {
          factorType: 'WEATHER',
          title: '风速观测',
          summary: `当前聚合风速约 ${mps.toFixed(1)} m/s，低于常用自驾防风警戒阈值（${thr.toFixed(1)} m/s）。`,
          impactLevel: impactLevelFromEffect(effect),
          derivedFromFactIds: [fact.id],
          confidence: fact.confidence ?? undefined,
          assert: `aggregated_wind_mps(${mps.toFixed(2)}) <= threshold_2wd(${thr.toFixed(2)})`,
          effect,
          target: 'COUNTRY',
          actionHint: 'NONE',
        },
      ];
    }

    return [];
  }

  /**
   * route_direction:{id}:vehicle_required → DecisionFactor[]
   */
  decisionFactorsFromRouteVehicleResolved(
    resolved: ResolvedWorldFact | null,
    routeDirectionId: string,
  ): DecisionFactor[] {
    if (!resolved) return [];

    const { fact, freshness } = resolved;
    const raw = (fact.valueJson as { raw?: unknown })?.raw ?? fact.valueJson;
    const expired = freshness.isExpiredByValidTo;
    const effect = expired ? ('NONE' as const) : ('WARNING' as const);

    return [
      {
        factorType: 'ROAD_ACCESS',
        title: '路段车辆要求',
        summary: `关联路线方向 ${routeDirectionId} 当前记录的车型约束：${typeof raw === 'string' ? raw : JSON.stringify(raw)}${expired ? '（validTo 已过期，仅供参考）' : ''}`,
        impactLevel: impactLevelFromEffect(effect),
        derivedFromFactIds: [fact.id],
        confidence: fact.confidence ?? undefined,
        assert: expired
          ? `vehicle_required_expired(route_direction_id=${routeDirectionId})`
          : `vehicle_required(route_direction_id=${routeDirectionId})`,
        effect,
        target: 'SEGMENT',
        actionHint: expired ? 'NONE' : 'ADD_CAUTION',
      },
    ];
  }
}
