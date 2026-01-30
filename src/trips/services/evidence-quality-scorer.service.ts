// src/trips/services/evidence-quality-scorer.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { 
  EvidenceItemDto, 
  EvidenceQualityScoreDto,
  EvidenceQualityComponentsDto,
  EvidenceQualityLevel,
  EvidenceFreshnessStatus,
  EvidenceType,
} from '../dto/evidence.dto';

/**
 * 证据质量评分服务
 * 
 * 职责：
 * 1. 基于多维度计算证据质量评分
 * 2. 生成质量说明
 * 3. 确定质量等级
 */
@Injectable()
export class EvidenceQualityScorer {
  private readonly logger = new Logger(EvidenceQualityScorer.name);

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
    '决策日志': 0.7,
    'Decision Log': 0.7,
  };

  /**
   * 计算证据质量评分
   * 
   * @param item 证据项
   * @returns 质量评分信息
   */
  async calculateQualityScore(item: EvidenceItemDto): Promise<EvidenceQualityScoreDto> {
    // 1. 数据源可靠性（0-1）
    const sourceReliability = this.getSourceReliability(item.source);

    // 2. 时效性（0-1）
    const timeliness = item.freshness
      ? this.calculateTimelinessScore(item.freshness.freshnessStatus)
      : 0.5;  // 没有时间戳，默认中等

    // 3. 完整性（0-1）
    const completeness = this.calculateCompletenessScore(item);

    // 4. 多源验证（0-1）
    const multiSourceVerification = item.metadata?.crossValidationCount
      ? Math.min(1, item.metadata.crossValidationCount / 3)  // 3个以上源 = 1.0
      : 0;

    // 5. 加权平均
    const overallScore = (
      sourceReliability * 0.3 +
      timeliness * 0.3 +
      completeness * 0.2 +
      multiSourceVerification * 0.2
    );

    // 6. 质量等级
    const level = overallScore >= 0.8 
      ? EvidenceQualityLevel.HIGH 
      : overallScore >= 0.6 
        ? EvidenceQualityLevel.MEDIUM 
        : EvidenceQualityLevel.LOW;

    // 7. 生成解释
    const explanation = this.generateExplanation(
      overallScore,
      { sourceReliability, timeliness, completeness, multiSourceVerification },
      level,
    );

    return {
      overallScore,
      components: {
        sourceReliability,
        timeliness,
        completeness,
        multiSourceVerification,
      },
      level,
      explanation,
    };
  }

  /**
   * 获取数据源可靠性（0-1）
   */
  private getSourceReliability(source?: string): number {
    if (!source) {
      return 0.5;
    }

    // 精确匹配
    if (this.SOURCE_RELIABILITY_MAP[source]) {
      return this.SOURCE_RELIABILITY_MAP[source];
    }

    // 模糊匹配
    for (const [key, reliability] of Object.entries(this.SOURCE_RELIABILITY_MAP)) {
      if (source.toLowerCase().includes(key.toLowerCase())) {
        return reliability;
      }
    }

    return 0.5;
  }

  /**
   * 计算时效性分数（0-1）
   */
  private calculateTimelinessScore(status: EvidenceFreshnessStatus): number {
    const scoreMap = {
      [EvidenceFreshnessStatus.FRESH]: 1.0,
      [EvidenceFreshnessStatus.STALE]: 0.6,
      [EvidenceFreshnessStatus.EXPIRED]: 0.2,
    };
    return scoreMap[status] || 0.5;
  }

  /**
   * 计算完整性分数（0-1）
   */
  private calculateCompletenessScore(item: EvidenceItemDto): number {
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

  /**
   * 生成质量说明
   */
  private generateExplanation(
    overallScore: number,
    components: EvidenceQualityComponentsDto,
    level: EvidenceQualityLevel,
  ): string {
    const factors: string[] = [];

    if (components.sourceReliability >= 0.8) {
      factors.push('数据来源可靠');
    }
    if (components.timeliness >= 0.8) {
      factors.push('数据新鲜');
    }
    if (components.completeness >= 0.8) {
      factors.push('数据完整');
    }
    if (components.multiSourceVerification >= 0.6) {
      factors.push('多源验证');
    }

    const scorePercent = Math.round(overallScore * 100);
    
    if (factors.length === 0) {
      return `${level}质量：综合评分 ${scorePercent}/100`;
    }

    return `${level}质量：${factors.join('、')}，综合评分 ${scorePercent}/100`;
  }
}
