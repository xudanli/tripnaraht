// src/trips/services/evidence-completeness-checker.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EvidenceType } from '../dto/evidence.dto';
import { Place } from '@prisma/client';

/**
 * 证据完整性检查结果
 */
export interface EvidenceCompletenessResult {
  /**
   * 完整性评分（0-1）
   */
  completenessScore: number;

  /**
   * 缺失的证据类型
   */
  missingEvidence: Array<{
    poiId: number;
    poiName: string;
    missingTypes: EvidenceType[];
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
    reason: string;
  }>;

  /**
   * 补充建议
   */
  recommendations: Array<{
    action: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    estimatedTime: number;  // 秒
    evidenceTypes: EvidenceType[];
    affectedPois: number[];
  }>;
}

/**
 * 证据完整性检查服务
 * 
 * 职责：
 * 1. 检查期望的证据类型（基于POI类别、canonicalType等）
 * 2. 识别缺失的证据
 * 3. 提供补充建议
 */
@Injectable()
export class EvidenceCompletenessChecker {
  private readonly logger = new Logger(EvidenceCompletenessChecker.name);

  /**
   * POI类别到期望证据类型的映射
   */
  private readonly CATEGORY_EVIDENCE_MAP: Record<string, EvidenceType[]> = {
    'ATTRACTION': [EvidenceType.OPENING_HOURS, EvidenceType.WEATHER],
    'RESTAURANT': [EvidenceType.OPENING_HOURS],
    'ACCOMMODATION': [EvidenceType.BOOKING],
    'TRANSPORT': [EvidenceType.ROAD_CLOSURE],
    'NATURE': [EvidenceType.WEATHER, EvidenceType.ROAD_CLOSURE],
    'ADVENTURE': [EvidenceType.WEATHER, EvidenceType.ROAD_CLOSURE, EvidenceType.BOOKING],
  };

  /**
   * CanonicalType到期望证据类型的映射
   */
  private readonly CANONICAL_TYPE_EVIDENCE_MAP: Record<string, EvidenceType[]> = {
    'museum': [EvidenceType.OPENING_HOURS],
    'restaurant': [EvidenceType.OPENING_HOURS],
    'hotel': [EvidenceType.BOOKING],
    'hiking_trail': [EvidenceType.WEATHER, EvidenceType.ROAD_CLOSURE],
    'scenic_viewpoint': [EvidenceType.WEATHER],
    'beach': [EvidenceType.WEATHER],
    'mountain': [EvidenceType.WEATHER, EvidenceType.ROAD_CLOSURE],
    'waterfall': [EvidenceType.WEATHER, EvidenceType.ROAD_CLOSURE],
    'glacier': [EvidenceType.WEATHER, EvidenceType.ROAD_CLOSURE],
    'volcano': [EvidenceType.WEATHER, EvidenceType.ROAD_CLOSURE],
    'national_park': [EvidenceType.WEATHER, EvidenceType.ROAD_CLOSURE],
    'adventure_activity': [EvidenceType.WEATHER, EvidenceType.BOOKING],
  };

  /**
   * 检查行程的证据完整性
   * 
   * @param places Place列表（包含metadata）
   * @param existingEvidence 已存在的证据项列表
   * @param tripStartDate 行程开始日期（用于季节判断）
   * @returns 完整性检查结果
   */
  checkCompleteness(
    places: Place[],
    existingEvidence: Array<{ poiId?: string; type: EvidenceType }>,
    tripStartDate?: string,
  ): EvidenceCompletenessResult {
    const missingEvidence: EvidenceCompletenessResult['missingEvidence'] = [];
    const evidenceMap = this.buildEvidenceMap(existingEvidence);
    const isWinter = this.isWinterSeason(tripStartDate);

    let totalExpected = 0;
    let totalMissing = 0;

    for (const place of places) {
      const expectedTypes = this.getExpectedEvidenceTypes(place, isWinter);
      totalExpected += expectedTypes.length;

      const existingTypes = evidenceMap.get(place.id) || new Set<EvidenceType>();
      const missingTypes = expectedTypes.filter(type => !existingTypes.has(type));

      if (missingTypes.length > 0) {
        totalMissing += missingTypes.length;
        const impact = this.calculateImpact(missingTypes, place);
        
        missingEvidence.push({
          poiId: place.id,
          poiName: place.nameCN || place.nameEN || `Place ${place.id}`,
          missingTypes,
          impact,
          reason: this.getMissingReason(missingTypes, place),
        });
      }
    }

    // 计算完整性评分
    const completenessScore = totalExpected > 0
      ? 1 - (totalMissing / totalExpected)
      : 1.0;

    // 生成补充建议
    const recommendations = this.generateRecommendations(missingEvidence, places);

    return {
      completenessScore,
      missingEvidence,
      recommendations,
    };
  }

  /**
   * 构建证据映射（poiId -> Set<EvidenceType>）
   */
  private buildEvidenceMap(
    existingEvidence: Array<{ poiId?: string; type: EvidenceType }>,
  ): Map<number, Set<EvidenceType>> {
    const map = new Map<number, Set<EvidenceType>>();

    for (const evidence of existingEvidence) {
      if (evidence.poiId) {
        const poiId = parseInt(evidence.poiId);
        if (!isNaN(poiId)) {
          if (!map.has(poiId)) {
            map.set(poiId, new Set());
          }
          map.get(poiId)!.add(evidence.type);
        }
      }
    }

    return map;
  }

  /**
   * 获取期望的证据类型
   */
  private getExpectedEvidenceTypes(place: Place, isWinter: boolean): EvidenceType[] {
    const expectedTypes = new Set<EvidenceType>();
    const metadata = place.metadata as any || {};
    const category = place.category?.toUpperCase() || '';
    const canonicalType = metadata.canonicalType || '';

    // 1. 基于类别
    if (this.CATEGORY_EVIDENCE_MAP[category]) {
      this.CATEGORY_EVIDENCE_MAP[category].forEach(type => expectedTypes.add(type));
    }

    // 2. 基于canonicalType
    if (canonicalType && this.CANONICAL_TYPE_EVIDENCE_MAP[canonicalType]) {
      this.CANONICAL_TYPE_EVIDENCE_MAP[canonicalType].forEach(type => expectedTypes.add(type));
    }

    // 3. 冬季特殊需求
    if (isWinter) {
      // 冬季需要更多天气和道路信息
      if (category === 'NATURE' || category === 'ADVENTURE') {
        expectedTypes.add(EvidenceType.WEATHER);
        expectedTypes.add(EvidenceType.ROAD_CLOSURE);
      }
    }

    return Array.from(expectedTypes);
  }

  /**
   * 判断是否为冬季
   */
  private isWinterSeason(tripStartDate?: string): boolean {
    if (!tripStartDate) {
      return false;
    }

    try {
      const date = new Date(tripStartDate);
      const month = date.getMonth() + 1;  // 1-12
      // 北半球：12月、1月、2月为冬季
      // 南半球：6月、7月、8月为冬季
      // 这里简化处理，假设是北半球
      return month === 12 || month === 1 || month === 2;
    } catch {
      return false;
    }
  }

  /**
   * 计算缺失证据的影响
   */
  private calculateImpact(
    missingTypes: EvidenceType[],
    place: Place,
  ): 'LOW' | 'MEDIUM' | 'HIGH' {
    // 如果缺失关键证据类型，影响高
    if (missingTypes.includes(EvidenceType.ROAD_CLOSURE)) {
      return 'HIGH';  // 道路封闭信息对安全至关重要
    }

    if (missingTypes.includes(EvidenceType.WEATHER)) {
      const category = place.category?.toUpperCase() || '';
      if (category === 'NATURE' || category === 'ADVENTURE') {
        return 'HIGH';  // 自然景点和冒险活动需要天气信息
      }
      return 'MEDIUM';
    }

    if (missingTypes.includes(EvidenceType.OPENING_HOURS)) {
      const category = place.category?.toUpperCase() || '';
      if (category === 'ATTRACTION' || category === 'RESTAURANT') {
        return 'MEDIUM';  // 景点和餐厅需要营业时间
      }
      return 'LOW';
    }

    if (missingTypes.includes(EvidenceType.BOOKING)) {
      return 'MEDIUM';  // 预订信息影响行程规划
    }

    return 'LOW';
  }

  /**
   * 获取缺失原因说明
   */
  private getMissingReason(
    missingTypes: EvidenceType[],
    place: Place,
  ): string {
    const reasons: string[] = [];
    const category = place.category?.toUpperCase() || '';

    if (missingTypes.includes(EvidenceType.OPENING_HOURS)) {
      if (category === 'ATTRACTION') {
        reasons.push('景点需要营业时间信息');
      } else if (category === 'RESTAURANT') {
        reasons.push('餐厅需要营业时间信息');
      } else {
        reasons.push('需要营业时间信息');
      }
    }

    if (missingTypes.includes(EvidenceType.WEATHER)) {
      if (category === 'NATURE' || category === 'ADVENTURE') {
        reasons.push('自然景点/冒险活动需要天气信息');
      } else {
        reasons.push('需要天气信息');
      }
    }

    if (missingTypes.includes(EvidenceType.ROAD_CLOSURE)) {
      reasons.push('需要道路封闭信息（安全关键）');
    }

    if (missingTypes.includes(EvidenceType.BOOKING)) {
      reasons.push('需要预订确认信息');
    }

    return reasons.join('、') || '缺少必要证据';
  }

  /**
   * 生成补充建议
   */
  private generateRecommendations(
    missingEvidence: EvidenceCompletenessResult['missingEvidence'],
    _places: Place[],
  ): EvidenceCompletenessResult['recommendations'] {
    const recommendations: EvidenceCompletenessResult['recommendations'] = [];

    // 按证据类型分组
    const typeGroups = new Map<EvidenceType, number[]>();
    for (const missing of missingEvidence) {
      for (const type of missing.missingTypes) {
        if (!typeGroups.has(type)) {
          typeGroups.set(type, []);
        }
        typeGroups.get(type)!.push(missing.poiId);
      }
    }

    // 为每种证据类型生成建议
    for (const [type, poiIds] of typeGroups.entries()) {
      const highImpactCount = missingEvidence.filter(
        m => poiIds.includes(m.poiId) && m.impact === 'HIGH'
      ).length;

      const priority = highImpactCount > 0 ? 'HIGH' : 'MEDIUM';
      const estimatedTime = this.estimateFetchTime(type, poiIds.length);

      recommendations.push({
        action: this.getActionDescription(type, poiIds.length),
        priority,
        estimatedTime,
        evidenceTypes: [type],
        affectedPois: poiIds,
      });
    }

    // 按优先级排序
    recommendations.sort((a, b) => {
      const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    return recommendations;
  }

  /**
   * 估算获取时间（秒）
   */
  private estimateFetchTime(type: EvidenceType, count: number): number {
    // 基础时间 + 每个POI的时间
    const baseTime: Record<EvidenceType, number> = {
      [EvidenceType.WEATHER]: 2,        // 2秒基础 + 1秒/POI
      [EvidenceType.ROAD_CLOSURE]: 3,   // 3秒基础 + 1秒/POI
      [EvidenceType.OPENING_HOURS]: 1,  // 1秒基础 + 0.5秒/POI
      [EvidenceType.BOOKING]: 1,        // 1秒基础 + 0.5秒/POI
      [EvidenceType.OTHER]: 1,
    };

    const perItemTime: Record<EvidenceType, number> = {
      [EvidenceType.WEATHER]: 1,
      [EvidenceType.ROAD_CLOSURE]: 1,
      [EvidenceType.OPENING_HOURS]: 0.5,
      [EvidenceType.BOOKING]: 0.5,
      [EvidenceType.OTHER]: 0.5,
    };

    return baseTime[type] + (perItemTime[type] * count);
  }

  /**
   * 获取操作描述
   */
  private getActionDescription(type: EvidenceType, count: number): string {
    const typeNames: Record<EvidenceType, string> = {
      [EvidenceType.WEATHER]: '天气数据',
      [EvidenceType.ROAD_CLOSURE]: '道路封闭信息',
      [EvidenceType.OPENING_HOURS]: '营业时间',
      [EvidenceType.BOOKING]: '预订确认信息',
      [EvidenceType.OTHER]: '其他证据',
    };

    return `为 ${count} 个POI获取${typeNames[type]}`;
  }
}
