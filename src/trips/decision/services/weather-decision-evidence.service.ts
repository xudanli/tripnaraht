// src/trips/decision/services/weather-decision-evidence.service.ts
/**
 * 天气决策证据服务
 * 
 * 强制规则：
 * ❌ 没有 WeatherEvidence 的 segment 不允许 finalize
 * ❌ 风速 > 15 m/s → 禁止侧风路段
 * ❌ 能去 ≠ 应该去
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  WeatherDecisionEvidence,
  WeatherEvidencePipelineResult,
  WeatherDecisionRules,
  WeatherViolationType,
} from '../interfaces/weather-decision-evidence.interface';
import { TripPlan, PlanDay } from '../plan-model';

@Injectable()
export class WeatherDecisionEvidenceService {
  private readonly logger = new Logger(WeatherDecisionEvidenceService.name);

  /**
   * 生成天气决策证据管道
   */
  async generateEvidencePipeline(
    plan: TripPlan,
    rules?: WeatherDecisionRules,
  ): Promise<WeatherEvidencePipelineResult> {
    const segmentEvidences: WeatherDecisionEvidence[] = [];

    // 为每个计划日生成天气证据
    for (const day of plan.days) {
      const evidence = await this.generateDayEvidence(day, rules);
      segmentEvidences.push(evidence);
    }

    const hasHardViolation = segmentEvidences.some(e => e.violation === 'HARD');
    const hasSoftViolation = segmentEvidences.some(e => e.violation === 'SOFT');

    const explainableFailure = this.generateExplainableFailure(
      segmentEvidences,
      hasHardViolation,
      hasSoftViolation,
    );

    return {
      segmentEvidences,
      hasHardViolation,
      hasSoftViolation,
      canProceed: !hasHardViolation,
      explainableFailure,
    };
  }

  /**
   * 生成单日天气证据
   */
  private async generateDayEvidence(
    day: PlanDay,
    rules?: WeatherDecisionRules,
  ): Promise<WeatherDecisionEvidence> {
    // TODO: 集成真实天气 API（OpenWeather, Iceland Vedur.is 等）
    // 这里使用模拟数据
    const mockWeather = this.getMockWeather(day.date);

    const evidence: WeatherDecisionEvidence = {
      segmentId: `day_${day.day}_${day.date}`,
      date: day.date,
      windSpeed: mockWeather.windSpeed,
      windDirection: mockWeather.windDirection,
      precipitation: mockWeather.precipitation,
      visibility: mockWeather.visibility,
      temperatureDrop: mockWeather.temperatureDrop,
      crosswindRisk: this.calculateCrosswindRisk(
        mockWeather.windSpeed,
        mockWeather.windDirection,
      ),
      violation: this.checkViolations(mockWeather, rules),
      explanation: this.generateExplanation(mockWeather, rules),
      suggestedAction: this.suggestAction(mockWeather, rules),
      metadata: {
        weatherWindowAvailable: mockWeather.windSpeed < (rules?.maxWindSpeed || 15),
        forecastReliability: 'MEDIUM',
        historicalRiskLevel: 'MEDIUM',
      },
    };

    return evidence;
  }

  /**
   * 检查违规
   */
  private checkViolations(
    weather: any,
    rules?: WeatherDecisionRules,
  ): WeatherViolationType {
    const maxWindSpeed = rules?.maxWindSpeed || 15; // 默认 15 m/s
    const maxCrosswindSpeed = rules?.maxCrosswindSpeed || 12; // 默认 12 m/s
    const maxPrecipitation = rules?.maxPrecipitation || 50; // 默认 50 mm/day
    const minVisibility = rules?.minVisibility || 1; // 默认 1 km

    // 硬违规检查
    if (weather.windSpeed > maxWindSpeed) {
      return 'HARD';
    }

    const crosswindRisk = this.calculateCrosswindRisk(
      weather.windSpeed,
      weather.windDirection,
    );
    if (crosswindRisk === 'HIGH' && weather.windSpeed > maxCrosswindSpeed) {
      return 'HARD';
    }

    if (weather.precipitation > maxPrecipitation) {
      return 'HARD';
    }

    if (weather.visibility < minVisibility) {
      return 'HARD';
    }

    // 软违规检查
    if (weather.windSpeed > maxWindSpeed * 0.8) {
      return 'SOFT';
    }

    if (weather.precipitation > maxPrecipitation * 0.7) {
      return 'SOFT';
    }

    return 'NONE';
  }

  /**
   * 计算侧风风险
   */
  private calculateCrosswindRisk(
    windSpeed: number,
    windDirection: number,
  ): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
    // 简化计算：假设道路方向为 0 度
    const crosswindComponent = Math.abs(
      windSpeed * Math.sin((windDirection * Math.PI) / 180),
    );

    if (crosswindComponent > 12) {
      return 'HIGH';
    }
    if (crosswindComponent > 8) {
      return 'MEDIUM';
    }
    if (crosswindComponent > 4) {
      return 'LOW';
    }
    return 'NONE';
  }

  /**
   * 生成解释
   */
  private generateExplanation(weather: any, rules?: WeatherDecisionRules): string {
    const parts: string[] = [];

    if (weather.windSpeed > (rules?.maxWindSpeed || 15)) {
      parts.push(`风速 ${weather.windSpeed.toFixed(1)} m/s 超过安全阈值`);
    }

    const crosswindRisk = this.calculateCrosswindRisk(
      weather.windSpeed,
      weather.windDirection,
    );
    if (crosswindRisk === 'HIGH') {
      parts.push('侧风风险高，不适合驾驶');
    }

    if (weather.precipitation > (rules?.maxPrecipitation || 50)) {
      parts.push(`降水量 ${weather.precipitation.toFixed(1)} mm 超过安全阈值`);
    }

    if (weather.visibility < (rules?.minVisibility || 1)) {
      parts.push(`能见度 ${weather.visibility.toFixed(1)} km 低于安全阈值`);
    }

    return parts.length > 0
      ? parts.join('；')
      : '天气条件在安全范围内';
  }

  /**
   * 建议行动
   */
  private suggestAction(
    weather: any,
    rules?: WeatherDecisionRules,
  ): 'DELAY' | 'REROUTE' | 'CANCEL' | 'PROCEED' {
    const violation = this.checkViolations(weather, rules);

    if (violation === 'HARD') {
      return 'CANCEL';
    }
    if (violation === 'SOFT') {
      return 'DELAY';
    }
    return 'PROCEED';
  }

  /**
   * 生成可解释的失败原因
   */
  private generateExplainableFailure(
    evidences: WeatherDecisionEvidence[],
    hasHardViolation: boolean,
    hasSoftViolation: boolean,
  ): WeatherEvidencePipelineResult['explainableFailure'] {
    if (!hasHardViolation && !hasSoftViolation) {
      return undefined;
    }

    const hardViolations = evidences.filter(e => e.violation === 'HARD');
    const affectedDays = hardViolations.map(e => e.segmentId);

    if (hasHardViolation) {
      return {
        reason: '天气条件不符合安全要求',
        affectedDays: affectedDays.map((_, i) => i + 1),
        userImpact: '计划无法执行，需要调整日期或路线',
      };
    }

    if (hasSoftViolation) {
      return {
        reason: '天气条件存在风险',
        affectedDays: evidences
          .filter(e => e.violation === 'SOFT')
          .map((_, i) => i + 1),
        userImpact: '建议延迟或调整计划',
      };
    }

    return undefined;
  }

  /**
   * 验证计划是否有天气证据
   */
  validatePlanHasWeatherEvidence(
    plan: TripPlan,
    evidenceResult: WeatherEvidencePipelineResult,
  ): { valid: boolean; reason?: string } {
    if (evidenceResult.segmentEvidences.length === 0) {
      return {
        valid: false,
        reason: '计划没有天气决策证据',
      };
    }

    if (evidenceResult.hasHardViolation) {
      return {
        valid: false,
        reason: '计划包含天气硬违规，不允许 finalize',
      };
    }

    return { valid: true };
  }

  /**
   * 获取模拟天气数据（TODO: 替换为真实天气 API）
   */
  private getMockWeather(date: string): any {
    // 模拟天气数据
    return {
      windSpeed: 8 + Math.random() * 10, // 8-18 m/s
      windDirection: Math.random() * 360, // 0-360 度
      precipitation: Math.random() * 30, // 0-30 mm
      visibility: 5 + Math.random() * 10, // 5-15 km
      temperatureDrop: Math.random() * 5, // 0-5 °C
    };
  }
}

