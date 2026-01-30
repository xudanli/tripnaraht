// src/trips/services/evidence-confidence-calculator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { 
  EvidenceItemDto, 
  EvidenceConfidenceDto, 
  EvidenceConfidenceLevel,
  EvidenceFreshnessStatus,
  EvidenceType
} from '../dto/evidence.dto';

/**
 * 证据置信度计算服务
 * 
 * 职责：
 * 1. 基于数据源可靠性计算置信度
 * 2. 基于数据新鲜度调整置信度
 * 3. 基于多源验证提升置信度
 * 4. 基于数据完整性调整置信度
 */
@Injectable()
export class EvidenceConfidenceCalculator {
  private readonly logger = new Logger(EvidenceConfidenceCalculator.name);

  /**
   * 数据源可靠性映射（0-1）
   */
  private readonly SOURCE_RELIABILITY_MAP: Record<string, number> = {
    'Google Places API': 0.9,
    'apis.is': 0.85,
    'road.is': 0.85,
    'WeatherAPI.com': 0.8,
    'OpenWeather': 0.75,
    '高德地图API': 0.8,
    'Gaode Maps API': 0.8,
    '决策日志': 0.7,  // LLM生成，可靠性较低
    'Decision Log': 0.7,
  };

  /**
   * 计算证据置信度
   * 
   * @param item 证据项
   * @returns 置信度信息
   */
  calculateConfidence(item: EvidenceItemDto): EvidenceConfidenceDto {
    let confidence = 0.5;  // 基础置信度
    const factors: string[] = [];

    // 1. 基于数据源可靠性（权重：30%）
    const sourceReliability = this.getSourceReliability(item.source);
    confidence += sourceReliability * 0.3;
    if (sourceReliability >= 0.8) {
      factors.push('数据来源可靠');
    } else if (sourceReliability < 0.5) {
      factors.push('数据来源可靠性较低');
    }

    // 2. 基于数据新鲜度（权重：30%）
    if (item.freshness) {
      const freshnessScore = this.getFreshnessScore(item.freshness.freshnessStatus);
      confidence += freshnessScore * 0.3;
      
      if (item.freshness.freshnessStatus === EvidenceFreshnessStatus.FRESH) {
        factors.push('数据新鲜');
      } else if (item.freshness.freshnessStatus === EvidenceFreshnessStatus.EXPIRED) {
        factors.push('数据已过期');
      } else {
        factors.push('数据较旧');
      }
    } else {
      // 没有新鲜度信息，默认中等置信度
      confidence += 0.1;
    }

    // 3. 基于多源验证（权重：20%）
    const crossValidationCount = item.metadata?.crossValidationCount || 0;
    if (crossValidationCount > 0) {
      const multiSourceScore = Math.min(0.2, crossValidationCount * 0.05);
      confidence += multiSourceScore;
      if (crossValidationCount >= 2) {
        factors.push('多源验证');
      }
    }

    // 4. 基于数据完整性（权重：10%）
    const completenessScore = this.getCompletenessScore(item);
    confidence += completenessScore * 0.1;
    if (completenessScore >= 0.8) {
      factors.push('数据完整');
    } else if (completenessScore < 0.5) {
      factors.push('数据不完整');
    }

    // 确保置信度在0-1范围内
    confidence = Math.max(0, Math.min(1, confidence));

    // 确定置信度等级
    let level: EvidenceConfidenceLevel;
    if (confidence >= 0.75) {
      level = EvidenceConfidenceLevel.HIGH;
    } else if (confidence >= 0.5) {
      level = EvidenceConfidenceLevel.MEDIUM;
    } else {
      level = EvidenceConfidenceLevel.LOW;
    }

    // 如果没有因素，添加默认说明
    if (factors.length === 0) {
      factors.push('基础置信度');
    }

    return {
      score: confidence,
      level,
      factors,
    };
  }

  /**
   * 获取数据源可靠性（0-1）
   */
  private getSourceReliability(source?: string): number {
    if (!source) {
      return 0.5;  // 默认中等可靠性
    }

    // 精确匹配
    if (this.SOURCE_RELIABILITY_MAP[source]) {
      return this.SOURCE_RELIABILITY_MAP[source];
    }

    // 模糊匹配（包含关键词）
    for (const [key, reliability] of Object.entries(this.SOURCE_RELIABILITY_MAP)) {
      if (source.toLowerCase().includes(key.toLowerCase())) {
        return reliability;
      }
    }

    // 默认中等可靠性
    return 0.5;
  }

  /**
   * 获取新鲜度分数（-0.2 到 0.3）
   */
  private getFreshnessScore(status: EvidenceFreshnessStatus): number {
    const scoreMap = {
      [EvidenceFreshnessStatus.FRESH]: 0.3,
      [EvidenceFreshnessStatus.STALE]: 0.1,
      [EvidenceFreshnessStatus.EXPIRED]: -0.2,
    };
    return scoreMap[status] || 0;
  }

  /**
   * 计算数据完整性分数（0-1）
   */
  private getCompletenessScore(item: EvidenceItemDto): number {
    let score = 0;
    let maxScore = 0;

    // 检查必需字段
    if (item.title) { score += 1; maxScore += 1; }
    if (item.description) { score += 1; maxScore += 1; }
    if (item.source) { score += 1; maxScore += 1; }
    if (item.timestamp) { score += 1; maxScore += 1; }

    // 检查元数据完整性（根据类型）
    if (item.type === EvidenceType.OPENING_HOURS && item.metadata?.openingHours) {
      score += 1;
      maxScore += 1;
    }
    if (item.type === EvidenceType.WEATHER && item.metadata?.weatherInfo) {
      score += 1;
      maxScore += 1;
    }
    if (item.type === EvidenceType.ROAD_CLOSURE && item.metadata?.roadStatus) {
      score += 1;
      maxScore += 1;
    }

    return maxScore > 0 ? score / maxScore : 0.5;
  }
}
