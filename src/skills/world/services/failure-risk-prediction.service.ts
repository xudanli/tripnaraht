/**
 * 失败风险预测服务
 * 
 * 负责预测行程失败风险，包括：
 * - 基于FailureProfile + 天气预测 + 用户能力预测风险
 * - 存储到 failure_risk_prediction 表
 * - 提供失败风险预测查询接口
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RiskThresholds } from '../utils/world-model-constants';
import { FailureRiskPrediction } from '../interfaces/unified-world-model.interface';
import { WeatherPredictionService } from './weather-prediction.service';
import { UserCapabilityLearningService } from './user-capability-learning.service';

@Injectable()
export class FailureRiskPredictionService {
  private readonly logger = new Logger(FailureRiskPredictionService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private weatherPredictionService?: WeatherPredictionService,
    @Optional() private userCapabilityLearningService?: UserCapabilityLearningService,
  ) {}

  /**
   * 预测失败风险
   */
  async predictFailureRisk(
    routeDirectionId: string,
    userProfile: {
      userId?: string;
      riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
      fitness?: 'low' | 'medium' | 'high';
    },
    dateRange: { start: Date; end: Date },
  ): Promise<FailureRiskPrediction> {
    this.logger.log(
      `[FailureRiskPrediction] 预测失败风险: routeDirectionId=${routeDirectionId}, userId=${userProfile.userId}`,
    );

    try {
      // 1. 获取RouteDirection的FailureProfile
      const failureProfile = await this.getFailureProfile(routeDirectionId);

      // 2. 获取天气预测
      const weatherPredictions = this.weatherPredictionService
        ? await this.weatherPredictionService.predictWeather('IS', dateRange)
        : [];

      // 3. 获取用户能力（学习后的）
      const learnedCapability = userProfile.userId && this.userCapabilityLearningService
        ? await this.userCapabilityLearningService.getLearnedCapability(userProfile.userId)
        : null;

      // 4. 计算每日失败风险
      const predictions = await this.calculateDailyFailureRisks(
        failureProfile,
        weatherPredictions,
        learnedCapability,
        userProfile,
        dateRange,
      );

      // 5. 存储到数据库
      await this.savePredictionToDB({
        routeDirectionId,
        tripId: undefined,
        dateRange,
        predictions,
      });

      return {
        routeDirectionId,
        date: dateRange.start,
        predictions,
      };
    } catch (error: any) {
      this.logger.error(
        `[FailureRiskPrediction] 预测失败风险失败: ${error.message}`,
        error.stack,
      );
      // 降级策略：返回空预测
      return {
        routeDirectionId,
        date: dateRange.start,
        predictions: [],
      };
    }
  }

  /**
   * 获取FailureProfile
   */
  private async getFailureProfile(routeDirectionId: string): Promise<any> {
    const routeDirection = await this.prisma.routeDirection.findFirst({
      where: { uuid: routeDirectionId },
    });

    if (!routeDirection) {
      throw new Error(`RouteDirection not found: ${routeDirectionId}`);
    }

    const metadata = routeDirection.metadata as any;
    return metadata?.extensions?.failureProfile || null;
  }

  /**
   * 计算每日失败风险
   */
  private async calculateDailyFailureRisks(
    failureProfile: any,
    weatherPredictions: any[],
    learnedCapability: any,
    userProfile: any,
    dateRange: { start: Date; end: Date },
  ): Promise<FailureRiskPrediction['predictions']> {
    const predictions: FailureRiskPrediction['predictions'] = [];

    // 计算天数
    const days = Math.ceil(
      (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    for (let day = 1; day <= days; day++) {
      // 1. 基础风险（基于FailureProfile）
      let baseRisk = this.getBaseRiskFromFailureProfile(failureProfile, day);

      // 2. 天气风险（基于天气预测）
      const weatherRisk = this.getWeatherRisk(weatherPredictions, day);

      // 3. 用户能力风险（基于学习后的能力）
      const capabilityRisk = this.getCapabilityRisk(learnedCapability, userProfile);

      // 4. 综合风险
      const totalRisk = baseRisk + weatherRisk + capabilityRisk;
      const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' =
        totalRisk > RiskThresholds.HIGH
          ? 'HIGH'
          : totalRisk > RiskThresholds.MEDIUM
            ? 'MEDIUM'
            : 'LOW';

      // 5. 风险因素
      const riskFactors: string[] = [];
      if (weatherRisk > 0.3) riskFactors.push('weather');
      if (capabilityRisk > 0.2) riskFactors.push('user_capability');
      if (baseRisk > 0.3) riskFactors.push('route_difficulty');

      // 6. 缓解措施
      const mitigation = this.getMitigationMeasures(riskLevel, riskFactors);

      predictions.push({
        day,
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

  /**
   * 从FailureProfile获取基础风险
   */
  private getBaseRiskFromFailureProfile(failureProfile: any, day: number): number {
    if (!failureProfile) {
      return 0.2; // 默认风险
    }

    const commonFailureDays = failureProfile.commonFailureDays || [];
    if (commonFailureDays.includes(day)) {
      return 0.5; // 常见失败日期，风险较高
    }

    return 0.2; // 默认风险
  }

  /**
   * 获取天气风险
   */
  private getWeatherRisk(weatherPredictions: any[], day: number): number {
    if (weatherPredictions.length === 0) {
      return 0; // 无天气预测数据
    }

    const prediction = weatherPredictions[day - 1];
    if (!prediction) {
      return 0;
    }

    let risk = 0;

    // 风速风险
    if (prediction.windSpeed > 20) {
      risk += 0.3;
    } else if (prediction.windSpeed > 15) {
      risk += 0.15;
    }

    // 降水风险
    if (prediction.precipitation > 10) {
      risk += 0.2;
    } else if (prediction.precipitation > 5) {
      risk += 0.1;
    }

    // 能见度风险
    if (prediction.visibility < 1000) {
      risk += 0.3;
    } else if (prediction.visibility < 5000) {
      risk += 0.15;
    }

    return Math.min(1, risk);
  }

  /**
   * 获取用户能力风险
   */
  private getCapabilityRisk(learnedCapability: any, userProfile: any): number {
    if (!learnedCapability) {
      return 0; // 无学习数据
    }

    let risk = 0;

    // 风险承受度不匹配
    if (userProfile.riskTolerance === 'LOW' && learnedCapability.actualRiskTolerance === 'HIGH') {
      risk += 0.2; // 用户低估了自己的风险承受度
    }

    // 体能不匹配
    if (userProfile.fitness === 'low' && learnedCapability.actualMaxAscent > 1000) {
      risk += 0.15; // 用户低估了自己的体能
    }

    return Math.min(1, risk);
  }

  /**
   * 获取缓解措施
   */
  private getMitigationMeasures(
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH',
    riskFactors: string[],
  ): string[] {
    const mitigation: string[] = [];

    if (riskLevel === 'HIGH') {
      mitigation.push('考虑推迟行程');
      mitigation.push('增加缓冲时间');
      mitigation.push('准备备用方案');
    } else if (riskLevel === 'MEDIUM') {
      mitigation.push('增加缓冲时间');
      mitigation.push('准备应急计划');
    }

    if (riskFactors.includes('weather')) {
      mitigation.push('关注天气预报');
      mitigation.push('准备防雨/防风装备');
    }

    if (riskFactors.includes('user_capability')) {
      mitigation.push('降低行程强度');
      mitigation.push('增加休息时间');
    }

    return mitigation;
  }

  /**
   * 保存预测到数据库
   */
  private async savePredictionToDB(data: {
    routeDirectionId: string;
    tripId?: string;
    dateRange: { start: Date; end: Date };
    predictions: FailureRiskPrediction['predictions'];
  }): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO failure_risk_prediction (
        route_direction_id,
        trip_id,
        prediction_date,
        predicted_risks,
        created_at,
        updated_at
      ) VALUES (
        $1::uuid,
        $2::uuid,
        $3::date,
        $4::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
    `,
      data.routeDirectionId,
      data.tripId || null,
      data.dateRange.start,
      JSON.stringify(data.predictions),
    );
  }
}
