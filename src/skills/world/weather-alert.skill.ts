/**
 * WeatherAlertSkill: 冰岛天气告警检查
 *
 * 用途: 在行程规划时检查天气条件，识别高风险天气
 * 集成: Should-Exist Gate (Step 0.5 - 地域特定检查)
 *
 * 触发规则:
 * - 风速 > 20 m/s → BLOCK (极端风险)
 * - 风速 > 15 m/s → ADJUST_REQUIRED (高风险)
 * - 能见度 < 1km → BLOCK (零能见度)
 * - 能见度 < 5km → ADJUST_REQUIRED (低能见度)
 * - 恶劣天气代码 (95+) → ADJUST_REQUIRED (雷暴/冰雹)
 */

import { Injectable, Logger } from '@nestjs/common';
import { IcelandWeatherRealtimeService, WeatherForecast, WeatherWarning } from './services/iceland-weather-realtime.service';

/**
 * Skill 输入
 */
export interface WeatherAlertSkillInput {
  /**
   * 行程涉及的位置列表
   */
  locations: Array<{
    lat: number;
    lng: number;
    name?: string;
    type?: 'start' | 'end' | 'waypoint';
  }>;

  /**
   * 行程日期范围
   */
  dateRange: {
    start: Date;
    end: Date;
  };

  /**
   * 风险容忍度 (可选)
   */
  riskTolerance?: 'low' | 'medium' | 'high';
}

/**
 * Skill 输出
 */
export interface WeatherAlertSkillOutput {
  /**
   * 整体天气风险等级
   */
  overallRisk: 'safe' | 'moderate' | 'high' | 'extreme';

  /**
   * Gate 决策建议
   */
  gateRecommendation: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';

  /**
   * 每个位置的天气详情
   */
  locationWeather: Array<{
    location: { lat: number; lng: number; name?: string };
    forecast: WeatherForecast | null;
    riskLevel: 'safe' | 'moderate' | 'high' | 'extreme';
    blockers: string[]; // 阻塞原因
    warnings: string[]; // 告警信息
  }>;

  /**
   * 建议的调整措施
   */
  adjustments: string[];

  /**
   * 证据引用
   */
  evidenceRefs: Array<{
    type: 'weather_forecast';
    location: string;
    timestamp: Date;
    source: string;
    confidence: number;
  }>;

  /**
   * 执行总结
   */
  summary: string;
}

@Injectable()
export class WeatherAlertSkill {
  private readonly logger = new Logger('WeatherAlertSkill');

  constructor(private readonly weatherService: IcelandWeatherRealtimeService) {
    this.logger.log('✅ WeatherAlertSkill 已初始化');
  }

  /**
   * 执行天气告警检查
   */
  async execute(input: WeatherAlertSkillInput): Promise<WeatherAlertSkillOutput> {
    this.logger.log(`执行天气检查: ${input.locations.length} 个位置`);

    const riskTolerance = input.riskTolerance || 'medium';
    const locationWeather: WeatherAlertSkillOutput['locationWeather'] = [];
    const evidenceRefs: WeatherAlertSkillOutput['evidenceRefs'] = [];
    const adjustments: string[] = [];

    let maxRiskLevel: 'safe' | 'moderate' | 'high' | 'extreme' = 'safe';

    // 检查每个位置的天气
    for (const location of input.locations) {
      const forecast = await this.weatherService.getWeatherByLocation(location.lat, location.lng);

      if (!forecast) {
        // 无法获取天气数据
        locationWeather.push({
          location,
          forecast: null,
          riskLevel: 'moderate',
          blockers: [],
          warnings: ['无法获取天气数据'],
        });
        continue;
      }

      // 评估风险
      const { riskLevel, blockers, warnings } = this.assessWeatherRisk(forecast, riskTolerance);

      locationWeather.push({
        location,
        forecast,
        riskLevel,
        blockers,
        warnings,
      });

      // 更新最大风险等级
      if (this.riskLevelToNumber(riskLevel) > this.riskLevelToNumber(maxRiskLevel)) {
        maxRiskLevel = riskLevel;
      }

      // 添加证据引用
      evidenceRefs.push({
        type: 'weather_forecast',
        location: location.name || `${location.lat}, ${location.lng}`,
        timestamp: forecast.forecastTime,
        source: forecast.dataSource,
        confidence: forecast.confidence,
      });
    }

    // 生成调整建议
    if (maxRiskLevel === 'extreme') {
      adjustments.push('极端天气，建议延期出行或选择其他路线');
      adjustments.push('如必须出行，请联系当地紧急服务部门 (1777)');
    } else if (maxRiskLevel === 'high') {
      adjustments.push('天气条件恶劣，建议推迟出发时间');
      adjustments.push('准备应急物资（食物、水、保暖衣物）');
      adjustments.push('确保车辆状况良好，携带通讯设备');
    } else if (maxRiskLevel === 'moderate') {
      adjustments.push('注意天气变化，随时查看最新预报');
      adjustments.push('携带雨具和保暖衣物');
    }

    // 提取所有阻塞原因
    const allBlockers = locationWeather.flatMap(lw => lw.blockers);

    // 决定 Gate 建议
    let gateRecommendation: WeatherAlertSkillOutput['gateRecommendation'];

    if (maxRiskLevel === 'extreme') {
      gateRecommendation = 'BLOCK';
    } else if (maxRiskLevel === 'high') {
      gateRecommendation = riskTolerance === 'high' ? 'NEED_USER_CONFIRM' : 'ADJUST_REQUIRED';
    } else if (maxRiskLevel === 'moderate') {
      gateRecommendation = 'NEED_USER_CONFIRM';
    } else {
      gateRecommendation = 'ALLOW';
    }

    // 生成摘要
    const summary = this.generateSummary(locationWeather, maxRiskLevel, gateRecommendation);

    this.logger.log(
      `天气检查完成: ${maxRiskLevel} 风险, ${gateRecommendation} 建议, ${allBlockers.length} 个阻塞因素`
    );

    return {
      overallRisk: maxRiskLevel,
      gateRecommendation,
      locationWeather,
      adjustments,
      evidenceRefs,
      summary,
    };
  }

  /**
   * 评估单个位置的天气风险
   */
  private assessWeatherRisk(
    forecast: WeatherForecast,
    riskTolerance: 'low' | 'medium' | 'high'
  ): {
    riskLevel: 'safe' | 'moderate' | 'high' | 'extreme';
    blockers: string[];
    warnings: string[];
  } {
    const blockers: string[] = [];
    const warnings: string[] = [];
    let riskLevel: 'safe' | 'moderate' | 'high' | 'extreme' = 'safe';

    // 检查风速
    if (forecast.windSpeed !== undefined) {
      if (forecast.windSpeed > 20) {
        blockers.push(`极端风速: ${forecast.windSpeed.toFixed(1)} m/s (> 20 m/s)`);
        riskLevel = 'extreme';
      } else if (forecast.windSpeed > 15) {
        warnings.push(`高风速: ${forecast.windSpeed.toFixed(1)} m/s (> 15 m/s)`);
        riskLevel = this.maxRisk(riskLevel, 'high');
      } else if (forecast.windSpeed > 10) {
        warnings.push(`中等风速: ${forecast.windSpeed.toFixed(1)} m/s (> 10 m/s)`);
        riskLevel = this.maxRisk(riskLevel, 'moderate');
      }
    }

    // 检查能见度
    if (forecast.visibility !== undefined) {
      if (forecast.visibility < 1000) {
        blockers.push(`零能见度: ${forecast.visibility}m (< 1km)`);
        riskLevel = 'extreme';
      } else if (forecast.visibility < 5000) {
        warnings.push(`低能见度: ${forecast.visibility}m (< 5km)`);
        riskLevel = this.maxRisk(riskLevel, 'high');
      }
    }

    // 检查降水
    if (forecast.precipitation !== undefined && forecast.precipitation > 5) {
      warnings.push(`强降水: ${forecast.precipitation} mm/h (> 5 mm/h)`);
      riskLevel = this.maxRisk(riskLevel, 'high');
    }

    // 检查天气代码（雷暴等）
    if (forecast.weatherCode) {
      const code = parseInt(forecast.weatherCode, 10);
      if (code >= 95) {
        warnings.push(`恶劣天气: ${forecast.conditions} (code ${code})`);
        riskLevel = this.maxRisk(riskLevel, 'high');
      }
    }

    // 检查已有的告警
    if (forecast.warnings.length > 0) {
      forecast.warnings.forEach((w: WeatherWarning) => {
        if (w.severity === 'very_high') {
          blockers.push(`${w.type}: ${w.message}`);
          riskLevel = 'extreme';
        } else if (w.severity === 'high') {
          warnings.push(`${w.type}: ${w.message}`);
          riskLevel = this.maxRisk(riskLevel, 'high');
        }
      });
    }

    // 根据风险容忍度调整
    if (riskTolerance === 'high') {
      // 高风险容忍度：降低一级
      if (riskLevel === 'high') riskLevel = 'moderate';
      if (riskLevel === 'moderate') riskLevel = 'safe';
    } else if (riskTolerance === 'low') {
      // 低风险容忍度：提升一级
      if (riskLevel === 'moderate') riskLevel = 'high';
      if (riskLevel === 'safe' && warnings.length > 0) riskLevel = 'moderate';
    }

    return { riskLevel, blockers, warnings };
  }

  /**
   * 返回两个风险等级中的较高者
   */
  private maxRisk(
    a: 'safe' | 'moderate' | 'high' | 'extreme',
    b: 'safe' | 'moderate' | 'high' | 'extreme'
  ): 'safe' | 'moderate' | 'high' | 'extreme' {
    const levels = { safe: 0, moderate: 1, high: 2, extreme: 3 };
    return levels[a] >= levels[b] ? a : b;
  }

  /**
   * 风险等级转数字（用于比较）
   */
  private riskLevelToNumber(level: 'safe' | 'moderate' | 'high' | 'extreme'): number {
    const levels = { safe: 0, moderate: 1, high: 2, extreme: 3 };
    return levels[level];
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    locationWeather: WeatherAlertSkillOutput['locationWeather'],
    overallRisk: 'safe' | 'moderate' | 'high' | 'extreme',
    gateRecommendation: string
  ): string {
    const totalLocations = locationWeather.length;
    const locationsWithWarnings = locationWeather.filter(lw => lw.warnings.length > 0).length;
    const locationsWithBlockers = locationWeather.filter(lw => lw.blockers.length > 0).length;

    if (overallRisk === 'extreme') {
      return `极端天气风险！${totalLocations} 个位置中有 ${locationsWithBlockers} 个存在阻塞性天气条件。建议：${gateRecommendation}`;
    } else if (overallRisk === 'high') {
      return `高天气风险。${totalLocations} 个位置中有 ${locationsWithWarnings} 个存在告警。建议：${gateRecommendation}`;
    } else if (overallRisk === 'moderate') {
      return `中等天气风险。${locationsWithWarnings} 个位置有轻微告警。建议：${gateRecommendation}`;
    } else {
      return `天气条件良好，${totalLocations} 个位置均安全。建议：${gateRecommendation}`;
    }
  }
}

/**
 * 使用示例
 */
export async function exampleUsage() {
  const weatherService = new IcelandWeatherRealtimeService();
  const skill = new WeatherAlertSkill(weatherService);

  // 检查 Reykjavík 到 Vík 的路线天气
  const result = await skill.execute({
    locations: [
      { lat: 64.1466, lng: -21.9426, name: 'Reykjavík', type: 'start' },
      { lat: 63.4186, lng: -19.0059, name: 'Vík', type: 'end' },
    ],
    dateRange: {
      start: new Date(),
      end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
    riskTolerance: 'medium',
  });

  console.log('天气检查结果:', result.summary);
  console.log('Gate 建议:', result.gateRecommendation);
  console.log('整体风险:', result.overallRisk);
  console.log('调整建议:', result.adjustments);
}
