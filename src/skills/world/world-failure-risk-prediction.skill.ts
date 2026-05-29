/**
 * world.failureRiskPrediction Skill
 * 
 * 预测行程失败风险
 * 使用world.weatherPrediction Skill获取天气预测，然后计算失败风险
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import { FailureRiskPredictionService } from './services/failure-risk-prediction.service';
import { WorldWeatherPredictionSkill } from './world-weather-prediction.skill';
import { FailureRiskPrediction } from './interfaces/unified-world-model.interface';
import { markWorldSkillDegraded } from './utils/world-skill-degraded.util';

export interface WorldFailureRiskPredictionInput extends SkillInput {
  /** 路线方向ID */
  routeDirectionId: string;
  
  /** 用户画像 */
  userProfile: {
    userId?: string;
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    fitness?: 'low' | 'medium' | 'high';
  };
  
  /** 日期范围 */
  dateRange: {
    start: Date;
    end: Date;
  };
  
  /** 区域代码（用于获取天气预测） */
  region: string;
  
  /** 坐标（用于获取天气预测） */
  location: {
    lat: number;
    lng: number;
  };
}

export interface WorldFailureRiskPredictionOutput extends SkillOutput {
  /** 失败风险预测 */
  prediction: FailureRiskPrediction;

  /** 证据ID */
  evidence_id: string;

  /** 数据源 */
  source: string;

  degraded?: boolean;
  degradedReason?: string;
}

@SkillDecorator({
  name: 'world.failureRiskPrediction',
  description: '预测行程失败风险（使用world.weatherPrediction Skill）',
  version: '1.0.0',
  category: 'world',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class WorldFailureRiskPredictionSkill implements Skill<WorldFailureRiskPredictionInput, WorldFailureRiskPredictionOutput> {
  private readonly logger = new Logger(WorldFailureRiskPredictionSkill.name);

  metadata = {
    name: 'world.failureRiskPrediction',
    description: '预测行程失败风险（使用world.weatherPrediction Skill）',
    version: '1.0.0',
    category: 'world' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['routeDirectionId', 'userProfile', 'dateRange', 'region', 'location'],
      typeChecks: {
        routeDirectionId: { type: 'string' as const },
        region: { type: 'string' as const },
      },
    },
  };

  constructor(
    @Optional() private failureRiskPredictionService?: FailureRiskPredictionService,
    @Optional() private worldWeatherPredictionSkill?: WorldWeatherPredictionSkill,
  ) {
    this.logger.log(`[WorldFailureRiskPredictionSkill] 已初始化`);
  }

  async execute(input: WorldFailureRiskPredictionInput): Promise<WorldFailureRiskPredictionOutput> {
    this.logger.log(
      `执行 world.failureRiskPrediction: routeDirectionId=${input.routeDirectionId}, userId=${input.userProfile.userId}`,
    );

    try {
      // 1. 优先使用FailureRiskPredictionService（如果可用）
      if (this.failureRiskPredictionService) {
        const prediction = await this.failureRiskPredictionService.predictFailureRisk(
          input.routeDirectionId,
          input.userProfile,
          input.dateRange,
        );

        return {
          prediction,
          evidence_id: `world_failure_risk_prediction_${Date.now()}`,
          source: 'FailureRiskPredictionService',
        };
      }

      // 2. 降级策略：使用world.weatherPrediction Skill + 简单风险计算
      if (this.worldWeatherPredictionSkill) {
        try {
          // 获取天气预测
          const weatherPredictionResult = await this.worldWeatherPredictionSkill.execute({
            region: input.region,
            dateRange: input.dateRange,
            location: input.location,
          });

          // 基于天气预测计算失败风险
          const predictions = this.calculateFailureRisksFromWeather(
            weatherPredictionResult.predictions,
            input.userProfile,
          );

          const prediction: FailureRiskPrediction = {
            routeDirectionId: input.routeDirectionId,
            date: input.dateRange.start,
            predictions,
          };

          return {
            prediction,
            evidence_id: weatherPredictionResult.evidence_id,
            source: 'WorldWeatherPredictionSkill',
          };
        } catch (error: any) {
          this.logger.warn(
            `[WorldFailureRiskPredictionSkill] world.weatherPrediction Skill失败: ${error.message}`,
          );
          // 继续到最终降级
        }
      }

      // 3. 最终降级：返回空预测（显式 degraded）
      this.logger.warn(`[WorldFailureRiskPredictionSkill] 无可用服务，返回空预测`);
      return markWorldSkillDegraded(
        {
          prediction: {
            routeDirectionId: input.routeDirectionId,
            date: input.dateRange.start,
            predictions: [],
          },
          evidence_id: `world_failure_risk_prediction_fallback_${Date.now()}`,
          source: 'fallback',
        },
        'FailureRiskPredictionService and WorldWeatherPredictionSkill unavailable',
      );
    } catch (error: any) {
      this.logger.error(
        `world.failureRiskPrediction 失败: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * 基于天气预测计算失败风险
   */
  private calculateFailureRisksFromWeather(
    weatherPredictions: any[],
    userProfile: WorldFailureRiskPredictionInput['userProfile'],
  ): FailureRiskPrediction['predictions'] {
    const predictions: FailureRiskPrediction['predictions'] = [];

    for (let day = 0; day < weatherPredictions.length; day++) {
      const weather = weatherPredictions[day];
      if (!weather) continue;

      // 1. 基础风险（基于天气）
      let baseRisk = 0;
      if (weather.riskFactors && weather.riskFactors.length > 0) {
        baseRisk = 0.3; // 有风险因素，基础风险0.3
      }

      // 2. 可达性风险
      const accessibilityRisk = 1 - weather.accessibilityScore;
      baseRisk = Math.max(baseRisk, accessibilityRisk * 0.5);

      // 3. 用户能力风险
      let capabilityRisk = 0;
      if (userProfile.fitness === 'low' && weather.windSpeed > 15) {
        capabilityRisk = 0.2; // 低体能 + 大风 = 高风险
      }
      if (userProfile.riskTolerance === 'LOW' && baseRisk > 0.3) {
        capabilityRisk = 0.15; // 低风险承受度 + 高基础风险
      }

      // 4. 综合风险
      const totalRisk = Math.min(1, baseRisk + capabilityRisk);
      const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
        totalRisk > 0.7 ? 'HIGH' : totalRisk > 0.4 ? 'MEDIUM' : 'LOW';

      // 5. 风险因素
      const riskFactors: string[] = [];
      if (weather.riskFactors) {
        riskFactors.push(...weather.riskFactors);
      }
      if (capabilityRisk > 0) {
        riskFactors.push('user_capability_mismatch');
      }

      // 6. 缓解措施
      const mitigation: string[] = [];
      if (riskLevel === 'HIGH') {
        mitigation.push('考虑推迟行程');
        mitigation.push('增加缓冲时间');
        mitigation.push('准备备用方案');
      } else if (riskLevel === 'MEDIUM') {
        mitigation.push('增加缓冲时间');
        mitigation.push('准备应急计划');
      }
      if (weather.riskFactors?.includes('high_wind')) {
        mitigation.push('关注天气预报');
        mitigation.push('准备防风装备');
      }

      predictions.push({
        day: day + 1,
        riskLevel,
        riskFactors,
        mitigation,
        confidence: {
          lower: Math.max(0, totalRisk - 0.2),
          upper: Math.min(1, totalRisk + 0.2),
          level: riskLevel === 'HIGH' ? 'HIGH' : riskLevel === 'MEDIUM' ? 'MEDIUM' : 'LOW',
        },
      });
    }

    return predictions;
  }
}
