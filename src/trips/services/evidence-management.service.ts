// src/trips/services/evidence-management.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EvidenceItemDto } from '../dto/evidence.dto';
import { Place } from '@prisma/client';
import { EvidenceFreshnessCalculator } from './evidence-freshness-calculator.service';
import { EvidenceConfidenceCalculator } from './evidence-confidence-calculator.service';
import { EvidenceQualityScorer } from './evidence-quality-scorer.service';

/**
 * 证据管理服务
 * 
 * 职责：
 * 1. 统一管理证据增强逻辑
 * 2. 批量处理证据项
 * 3. 协调各个计算服务
 */
@Injectable()
export class EvidenceManagementService {
  private readonly logger = new Logger(EvidenceManagementService.name);

  constructor(
    private readonly freshnessCalculator: EvidenceFreshnessCalculator,
    private readonly confidenceCalculator: EvidenceConfidenceCalculator,
    private readonly qualityScorer: EvidenceQualityScorer,
  ) {}

  /**
   * 增强单个证据项
   * 
   * @param item 证据项
   * @param place 关联的地点（可选）
   * @returns 增强后的证据项
   */
  async enrichEvidenceItem(
    item: EvidenceItemDto,
    place?: Place,
  ): Promise<EvidenceItemDto> {
    // 1. 计算时效性
    const freshness = this.freshnessCalculator.calculateFreshness(item, place);

    // 2. 计算置信度（需要先设置freshness）
    const itemWithFreshness = freshness ? { ...item, freshness } : item;
    const confidence = this.confidenceCalculator.calculateConfidence(itemWithFreshness);

    // 3. 计算质量评分（需要先设置freshness和confidence）
    const itemWithConfidence = { ...itemWithFreshness, confidence };
    const qualityScore = await this.qualityScorer.calculateQualityScore(itemWithConfidence);

    // 4. 合并所有增强信息
    return {
      ...item,
      ...(freshness && { freshness }),
      confidence,
      qualityScore,
    };
  }

  /**
   * 批量增强证据项
   * 
   * @param items 证据项列表
   * @param places 地点映射（placeId -> Place），可选
   * @returns 增强后的证据项列表
   */
  async enrichEvidenceItems(
    items: EvidenceItemDto[],
    places?: Map<number, Place>,
  ): Promise<EvidenceItemDto[]> {
    // 并行处理所有证据项
    return Promise.all(
      items.map(async (item) => {
        // 从places映射中查找关联的地点
        const place = item.poiId && places
          ? places.get(parseInt(item.poiId))
          : undefined;

        return this.enrichEvidenceItem(item, place);
      }),
    );
  }
}
