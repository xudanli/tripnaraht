/**
 * PredictionCollectorService
 *
 * 抽离自 Orchestrator.collectPredictionData
 * 天气预测、失败风险预测，并聚合 weather_risk
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { WeatherPredictionService } from '../../../skills/world/services/weather-prediction.service';
import { FailureRiskPredictionService } from '../../../skills/world/services/failure-risk-prediction.service';
import { aggregateWeatherRisk } from '../../utils/weather-risk-aggregator.util';

/** 旅行请求最小字段（兼容 TripPlanRequest） */
export interface TripRequestForPrediction {
  date_range?: { start_date: string; end_date: string };
  party_profile?: {
    risk_tolerance?: string;
    fitness?: string;
  };
}

/** 请求上下文（用于失败风险预测） */
export interface PredictionRequestContext {
  route_direction_id?: string;
  user_id?: string;
}

@Injectable()
export class PredictionCollectorService {
  private readonly logger = new Logger(PredictionCollectorService.name);

  constructor(
    @Optional() private readonly weatherPredictionService?: WeatherPredictionService,
    @Optional() private readonly failureRiskPredictionService?: FailureRiskPredictionService,
  ) {}

  /**
   * 收集预测数据（天气预测、失败风险预测）
   * 并聚合 weather_risk 写入 researchData
   *
   * @param tripRequest 旅行请求
   * @param researchData 输出对象，会被 mutate
   * @param evidenceRefs 证据引用列表，会被 append
   * @param requestCtx 请求上下文（route_direction_id, user_id）
   */
  async collect(
    tripRequest: TripRequestForPrediction,
    researchData: Record<string, unknown>,
    evidenceRefs: string[],
    requestCtx?: PredictionRequestContext,
  ): Promise<void> {
    this.logger.debug(`[PredictionCollector] Collecting prediction data (护城河扩展)`);

    const promises: Promise<void>[] = [];

    // 1. 天气预测
    if (this.weatherPredictionService && tripRequest.date_range) {
      promises.push(
        this.weatherPredictionService
          .predictWeather('IS', {
            start: new Date(tripRequest.date_range.start_date),
            end: new Date(tripRequest.date_range.end_date),
          })
          .then((predictions) => {
            (researchData as Record<string, unknown>).weather_predictions = predictions;
            const evidenceId = `weather_predictions_${Date.now()}`;
            (researchData as Record<string, unknown>).weather_predictions_evidence_id = evidenceId;
            (researchData as Record<string, unknown>).weather_predictions_evidence_source =
              'WeatherPredictionService.predictWeather';
            evidenceRefs.push(evidenceId);
          })
          .catch((e) =>
            this.logger.warn(`[WeatherPredictionService] Failed: ${e?.message}`),
          ),
      );
    }

    // 2. 失败风险预测
    if (
      this.failureRiskPredictionService &&
      tripRequest.date_range &&
      requestCtx?.route_direction_id
    ) {
      promises.push(
        this.failureRiskPredictionService
          .predictFailureRisk(
            requestCtx.route_direction_id,
            {
              userId: requestCtx.user_id,
              riskTolerance: tripRequest.party_profile?.risk_tolerance as any,
              fitness: tripRequest.party_profile?.fitness as any,
            },
            {
              start: new Date(tripRequest.date_range.start_date),
              end: new Date(tripRequest.date_range.end_date),
            },
          )
          .then((prediction) => {
            (researchData as Record<string, unknown>).failure_risk_prediction = prediction;
            const evidenceId = `failure_risk_prediction_${Date.now()}`;
            (researchData as Record<string, unknown>).failure_risk_prediction_evidence_id = evidenceId;
            (researchData as Record<string, unknown>).failure_risk_prediction_evidence_source =
              'FailureRiskPredictionService.predictFailureRisk';
            evidenceRefs.push(evidenceId);

            // 提前预警高风险日期
            const highRiskDays = prediction.predictions
              .filter((p) => p.riskLevel === 'HIGH')
              .map((p) => p.day);

            if (highRiskDays.length > 0) {
              if (!(researchData as Record<string, unknown>).warnings) {
                (researchData as Record<string, unknown>).warnings = [];
              }
              ((researchData as Record<string, unknown>).warnings as Array<unknown>).push({
                type: 'HIGH_RISK_DAYS',
                days: highRiskDays,
                message: `预测到第${highRiskDays.join(', ')}天存在高风险`,
              });
            }
          })
          .catch((e) =>
            this.logger.warn(`[FailureRiskPredictionService] Failed: ${e?.message}`),
          ),
      );
    }

    await Promise.all(promises);

    // 缺口修复：聚合 weather_risk (0-1) 写入 research_data，供 DSO environmentState.weatherRisk
    const weatherRisk = aggregateWeatherRisk(researchData as Record<string, unknown>);
    if (weatherRisk !== undefined) {
      (researchData as Record<string, unknown>).weather_risk = weatherRisk;
      this.logger.debug(`[PredictionCollector] 聚合 weather_risk=${weatherRisk.toFixed(2)}`);
    }
  }
}
