// src/trips/readiness/services/risk-quantification.service.ts

/**
 * Risk Quantification Service
 * 
 * 为准备度检查中的风险提供量化指标和概率
 */

import { Injectable, Logger } from '@nestjs/common';
import { RiskQuantification } from '../types/readiness-findings.types';
import { HazardType, RuleSeverity, LocalizedString } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';

@Injectable()
export class RiskQuantificationService {
  private readonly logger = new Logger(RiskQuantificationService.name);

  /**
   * 为风险计算量化指标
   */
  quantifyRisk(
    riskType: HazardType,
    severity: RuleSeverity,
    context?: TripContext,
    lang: 'en' | 'zh' = 'zh'
  ): RiskQuantification {
    const baseScore = this.getBaseRiskScore(severity);
    const quantification = this.calculateRiskMetrics(riskType, severity, context, lang);
    const probability = this.estimateProbability(riskType, severity, context);

    return {
      score: baseScore,
      probability,
      ...quantification,
    };
  }

  private getBaseRiskScore(severity: RuleSeverity): number {
    switch (severity) {
      case 'high': return 0.8;
      case 'medium': return 0.5;
      case 'low': return 0.2;
      default: return 0.5;
    }
  }

  private calculateRiskMetrics(
    riskType: HazardType,
    severity: RuleSeverity,
    context?: TripContext,
    lang: 'en' | 'zh' = 'zh'
  ): Partial<RiskQuantification> {
    switch (riskType) {
      case 'weather_extreme': return this.quantifyWeatherRisk(severity, context, lang);
      case 'terrain': return this.quantifyTerrainRisk(severity, context, lang);
      case 'water_safety': return this.quantifyWaterSafetyRisk(severity, context, lang);
      case 'wildlife': return this.quantifyWildlifeRisk(severity, context, lang);
      case 'healthcare_gap': return this.quantifyHealthcareRisk(severity, context, lang);
      case 'logistics_remote': return this.quantifyLogisticsRisk(severity, context, lang);
      case 'crime': return this.quantifyCrimeRisk(severity, context, lang);
      case 'regulatory': return this.quantifyRegulatoryRisk(severity, context, lang);
      default: return {
        levelExplanation: lang === 'zh'
          ? `该风险等级为${this.getSeverityLabel(severity, lang)}，需要采取相应的预防措施。`
          : `This risk level is ${this.getSeverityLabel(severity, lang)}, requiring appropriate preventive measures.`,
      };
    }
  }

  private quantifyWeatherRisk(severity: RuleSeverity, context?: TripContext, lang: 'en' | 'zh' = 'zh'): Partial<RiskQuantification> {
    const metrics: RiskQuantification['metrics'] = [];
    let levelExplanation: LocalizedString;

    if (severity === 'high') {
      metrics.push({
        name: lang === 'zh' ? '失温风险时间' : 'Hypothermia Risk Time',
        value: lang === 'zh' ? '15-30 分钟' : '15-30 minutes',
        unit: lang === 'zh' ? '分钟' : 'minutes',
        description: lang === 'zh' ? '在极端寒冷条件下，无防护暴露可能导致失温' : 'Unprotected exposure in extreme cold can lead to hypothermia',
      });
      levelExplanation = lang === 'zh'
        ? '极端风险：可能导致生命危险，必须采取严格防护措施'
        : 'Extreme risk: May cause life-threatening conditions, strict protective measures required';
    } else if (severity === 'medium') {
      metrics.push({
        name: lang === 'zh' ? '失温风险时间' : 'Hypothermia Risk Time',
        value: lang === 'zh' ? '30-60 分钟' : '30-60 minutes',
        unit: lang === 'zh' ? '分钟' : 'minutes',
      });
      levelExplanation = lang === 'zh' ? '中等风险：需要适当的防护措施和准备' : 'Medium risk: Appropriate protective measures and preparation required';
    } else {
      levelExplanation = lang === 'zh' ? '低风险：一般防护措施即可' : 'Low risk: General protective measures sufficient';
    }

    return { metrics, levelExplanation };
  }

  private quantifyTerrainRisk(severity: RuleSeverity, context?: TripContext, lang: 'en' | 'zh' = 'zh'): Partial<RiskQuantification> {
    const metrics: RiskQuantification['metrics'] = [];
    let levelExplanation: LocalizedString;

    if (context?.geo?.mountains) {
      const elevation = context.geo.mountains.mountainElevationAvg;
      if (elevation) {
        metrics.push({
          name: lang === 'zh' ? '平均海拔' : 'Average Elevation',
          value: `${elevation.toFixed(0)}`,
          unit: lang === 'zh' ? '米' : 'm',
          description: lang === 'zh' ? '高海拔可能导致高原反应' : 'High elevation may cause altitude sickness',
        });
      }
    }

    if (severity === 'high') {
      levelExplanation = lang === 'zh' ? '高风险：地形复杂，需要专业装备和经验' : 'High risk: Complex terrain requires professional equipment and experience';
    } else if (severity === 'medium') {
      levelExplanation = lang === 'zh' ? '中等风险：需要适当的装备和准备' : 'Medium risk: Appropriate equipment and preparation required';
    } else {
      levelExplanation = lang === 'zh' ? '低风险：一般注意即可' : 'Low risk: General caution sufficient';
    }

    return { metrics, levelExplanation };
  }

  private quantifyWaterSafetyRisk(severity: RuleSeverity, context?: TripContext, lang: 'en' | 'zh' = 'zh'): Partial<RiskQuantification> {
    const metrics: RiskQuantification['metrics'] = [];
    let levelExplanation: LocalizedString;
    let comparison: RiskQuantification['comparison'];

    if (severity === 'high') {
      metrics.push({
        name: lang === 'zh' ? '水温' : 'Water Temperature',
        value: lang === 'zh' ? '2-4°C' : '2-4°C',
        unit: '°C',
        description: lang === 'zh' ? '极低水温可能导致快速失温' : 'Extremely low water temperature can cause rapid hypothermia',
      });
      comparison = {
        baseline: lang === 'zh' ? '冰岛平均水温' : 'Average Iceland Water Temperature',
        difference: lang === 'zh' ? '低 5-8°C' : '5-8°C lower',
        context: lang === 'zh' ? 'Beagle Channel 的水温比冰岛更低，风险显著增加' : 'Beagle Channel water temperature is lower than Iceland, significantly increasing risk',
      };
      levelExplanation = lang === 'zh'
        ? '极端风险：冷水可能导致快速失温，必须穿戴专业防护装备'
        : 'Extreme risk: Cold water can cause rapid hypothermia, professional protective equipment required';
    } else if (severity === 'medium') {
      metrics.push({
        name: lang === 'zh' ? '水温' : 'Water Temperature',
        value: lang === 'zh' ? '5-10°C' : '5-10°C',
        unit: '°C',
      });
      levelExplanation = lang === 'zh' ? '中等风险：需要适当的防护措施' : 'Medium risk: Appropriate protective measures required';
    } else {
      levelExplanation = lang === 'zh' ? '低风险：一般注意即可' : 'Low risk: General caution sufficient';
    }

    return { metrics, comparison, levelExplanation };
  }

  private quantifyWildlifeRisk(severity: RuleSeverity, context?: TripContext, lang: 'en' | 'zh' = 'zh'): Partial<RiskQuantification> {
    let levelExplanation: LocalizedString;
    if (severity === 'high') {
      levelExplanation = lang === 'zh' ? '高风险：可能遇到危险野生动物，需要保持安全距离' : 'High risk: May encounter dangerous wildlife, maintain safe distance required';
    } else if (severity === 'medium') {
      levelExplanation = lang === 'zh' ? '中等风险：需要注意野生动物，遵守安全规则' : 'Medium risk: Be aware of wildlife, follow safety rules';
    } else {
      levelExplanation = lang === 'zh' ? '低风险：一般注意即可' : 'Low risk: General caution sufficient';
    }
    return { levelExplanation };
  }

  private quantifyHealthcareRisk(severity: RuleSeverity, context?: TripContext, lang: 'en' | 'zh' = 'zh'): Partial<RiskQuantification> {
    const metrics: RiskQuantification['metrics'] = [];
    let levelExplanation: LocalizedString;

    if (severity === 'high') {
      metrics.push({
        name: lang === 'zh' ? '最近医院距离' : 'Nearest Hospital Distance',
        value: lang === 'zh' ? '> 100 公里' : '> 100 km',
        unit: lang === 'zh' ? '公里' : 'km',
        description: lang === 'zh' ? '偏远地区，医疗资源有限' : 'Remote area with limited medical resources',
      });
      levelExplanation = lang === 'zh'
        ? '高风险：医疗资源有限，需要充分的医疗准备和保险'
        : 'High risk: Limited medical resources, comprehensive medical preparation and insurance required';
    } else if (severity === 'medium') {
      levelExplanation = lang === 'zh' ? '中等风险：医疗资源有限，建议购买旅行保险' : 'Medium risk: Limited medical resources, travel insurance recommended';
    } else {
      levelExplanation = lang === 'zh' ? '低风险：医疗资源充足' : 'Low risk: Adequate medical resources';
    }

    return { metrics, levelExplanation };
  }

  private quantifyLogisticsRisk(severity: RuleSeverity, context?: TripContext, lang: 'en' | 'zh' = 'zh'): Partial<RiskQuantification> {
    const metrics: RiskQuantification['metrics'] = [];
    let levelExplanation: LocalizedString;

    if (severity === 'high') {
      metrics.push({
        name: lang === 'zh' ? '最近补给点距离' : 'Nearest Supply Point Distance',
        value: lang === 'zh' ? '> 50 公里' : '> 50 km',
        unit: lang === 'zh' ? '公里' : 'km',
      });
      levelExplanation = lang === 'zh' ? '高风险：偏远地区，需要充分准备补给' : 'High risk: Remote area, comprehensive supply preparation required';
    } else if (severity === 'medium') {
      levelExplanation = lang === 'zh' ? '中等风险：需要提前规划补给' : 'Medium risk: Advance supply planning required';
    } else {
      levelExplanation = lang === 'zh' ? '低风险：补给充足' : 'Low risk: Adequate supplies';
    }

    return { metrics, levelExplanation };
  }

  private quantifyCrimeRisk(severity: RuleSeverity, context?: TripContext, lang: 'en' | 'zh' = 'zh'): Partial<RiskQuantification> {
    let levelExplanation: LocalizedString;
    if (severity === 'high') {
      levelExplanation = lang === 'zh' ? '高风险：犯罪率较高，需要提高警惕' : 'High risk: Higher crime rate, increased vigilance required';
    } else if (severity === 'medium') {
      levelExplanation = lang === 'zh' ? '中等风险：需要注意个人财物安全' : 'Medium risk: Be aware of personal property security';
    } else {
      levelExplanation = lang === 'zh' ? '低风险：一般注意即可' : 'Low risk: General caution sufficient';
    }
    return { levelExplanation };
  }

  private quantifyRegulatoryRisk(severity: RuleSeverity, context?: TripContext, lang: 'en' | 'zh' = 'zh'): Partial<RiskQuantification> {
    let levelExplanation: LocalizedString;
    if (severity === 'high') {
      levelExplanation = lang === 'zh' ? '高风险：违反法规可能导致严重后果，必须严格遵守' : 'High risk: Violations may cause serious consequences, strict compliance required';
    } else if (severity === 'medium') {
      levelExplanation = lang === 'zh' ? '中等风险：需要了解并遵守相关法规' : 'Medium risk: Understand and comply with relevant regulations';
    } else {
      levelExplanation = lang === 'zh' ? '低风险：一般遵守即可' : 'Low risk: General compliance sufficient';
    }
    return { levelExplanation };
  }

  private estimateProbability(riskType: HazardType, severity: RuleSeverity, _context?: TripContext): number | undefined {
    switch (severity) {
      case 'high': return 0.05 + Math.random() * 0.10;
      case 'medium': return 0.01 + Math.random() * 0.04;
      case 'low': return Math.random() * 0.01;
      default: return undefined;
    }
  }

  private getSeverityLabel(severity: RuleSeverity, lang: 'en' | 'zh'): string {
    if (lang === 'zh') {
      switch (severity) {
        case 'high': return '高';
        case 'medium': return '中';
        case 'low': return '低';
      }
    }
    return severity;
  }
}
