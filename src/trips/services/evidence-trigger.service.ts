// src/trips/services/evidence-trigger.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { EvidenceType } from '../dto/evidence.dto';
import { EvidenceCompletenessChecker, EvidenceCompletenessResult } from './evidence-completeness-checker.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 证据获取建议
 */
export interface EvidenceFetchSuggestion {
  /**
   * 建议ID
   */
  id: string;

  /**
   * 建议描述
   */
  description: string;

  /**
   * 优先级
   */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';

  /**
   * 证据类型
   */
  evidenceTypes: EvidenceType[];

  /**
   * 受影响的POI ID列表
   */
  affectedPoiIds: number[];

  /**
   * 预计时间（秒）
   */
  estimatedTime: number;

  /**
   * 建议原因
   */
  reason: string;

  /**
   * 是否可批量获取
   */
  canBatchFetch: boolean;
}

/**
 * 智能触发检查结果
 */
export interface EvidenceTriggerResult {
  /**
   * 是否有缺失证据
   */
  hasMissingEvidence: boolean;

  /**
   * 完整性评分
   */
  completenessScore: number;

  /**
   * 获取建议列表（按优先级排序）
   */
  suggestions: EvidenceFetchSuggestion[];

  /**
   * 一键批量获取建议（包含所有高优先级建议）
   */
  bulkFetchSuggestion?: {
    evidenceTypes: EvidenceType[];
    affectedPoiIds: number[];
    estimatedTime: number;
    description: string;
  };
}

/**
 * 证据智能触发服务
 * 
 * 职责：
 * 1. 自动检测缺失证据
 * 2. 提供获取建议
 * 3. 支持一键批量获取
 */
@Injectable()
export class EvidenceTriggerService {
  private readonly logger = new Logger(EvidenceTriggerService.name);

  constructor(
    private readonly completenessChecker: EvidenceCompletenessChecker,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 检查并生成获取建议
   * 
   * @param tripId 行程ID
   * @returns 触发检查结果
   */
  async checkAndSuggest(tripId: string): Promise<EvidenceTriggerResult> {
    // 1. 获取行程信息
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new Error(`行程 ID ${tripId} 不存在`);
    }

    // 2. 收集所有Place
    const places = [];
    for (const tripDay of trip.TripDay) {
      for (const item of tripDay.ItineraryItem) {
        if (item.Place) {
          places.push(item.Place);
        }
      }
    }

    // 3. 获取现有证据
    const evidenceResult = await this.getExistingEvidence(tripId);
    const existingEvidence = evidenceResult.items.map(item => ({
      poiId: item.poiId,
      type: item.type,
    }));

    // 4. 检查完整性
    const completenessResult = this.completenessChecker.checkCompleteness(
      places,
      existingEvidence,
      trip.startDate?.toISOString(),
    );

    // 5. 生成获取建议
    const suggestions = this.generateSuggestions(completenessResult);

    // 6. 生成一键批量获取建议
    const bulkFetchSuggestion = this.generateBulkFetchSuggestion(suggestions);

    return {
      hasMissingEvidence: completenessResult.missingEvidence.length > 0,
      completenessScore: completenessResult.completenessScore,
      suggestions,
      bulkFetchSuggestion,
    };
  }

  /**
   * 获取现有证据（简化版，避免循环依赖）
   */
  private async getExistingEvidence(tripId: string): Promise<{ items: Array<{ poiId?: string; type: EvidenceType }> }> {
    // 这里需要调用TripsService.getEvidence，但为了避免循环依赖，
    // 我们直接从数据库查询证据状态
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: {
                Place: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      return { items: [] };
    }

    const items: Array<{ poiId?: string; type: EvidenceType }> = [];

    // 从Place.metadata中提取证据
    for (const tripDay of trip.TripDay) {
      for (const item of tripDay.ItineraryItem) {
        if (item.Place) {
          const metadata = item.Place.metadata as any || {};
          
          if (metadata.openingHours || metadata.opening_hours) {
            items.push({ poiId: item.Place.id.toString(), type: EvidenceType.OPENING_HOURS });
          }
          if (metadata.weatherInfo || metadata.weather) {
            items.push({ poiId: item.Place.id.toString(), type: EvidenceType.WEATHER });
          }
          if (metadata.roadStatus || metadata.roadClosure) {
            items.push({ poiId: item.Place.id.toString(), type: EvidenceType.ROAD_CLOSURE });
          }
          if (metadata.bookingConfirmation || metadata.reservation) {
            items.push({ poiId: item.Place.id.toString(), type: EvidenceType.BOOKING });
          }
        }
      }
    }

    return { items };
  }

  /**
   * 生成获取建议
   */
  private generateSuggestions(
    completenessResult: EvidenceCompletenessResult,
  ): EvidenceFetchSuggestion[] {
    const suggestions: EvidenceFetchSuggestion[] = [];

    // 基于完整性检查的推荐生成建议
    for (const recommendation of completenessResult.recommendations) {
      // 获取受影响的POI名称
      const affectedPois = completenessResult.missingEvidence.filter(
        m => recommendation.affectedPois.includes(m.poiId)
      );

      const reason = affectedPois.map(p => p.reason).join('；');

      suggestions.push({
        id: `suggestion-${recommendation.evidenceTypes.join('-')}-${Date.now()}`,
        description: recommendation.action,
        priority: recommendation.priority,
        evidenceTypes: recommendation.evidenceTypes,
        affectedPoiIds: recommendation.affectedPois,
        estimatedTime: recommendation.estimatedTime,
        reason,
        canBatchFetch: true,
      });
    }

    return suggestions;
  }

  /**
   * 生成一键批量获取建议
   */
  private generateBulkFetchSuggestion(
    suggestions: EvidenceFetchSuggestion[],
  ): EvidenceTriggerResult['bulkFetchSuggestion'] | undefined {
    // 只包含高优先级建议
    const highPrioritySuggestions = suggestions.filter(s => s.priority === 'HIGH');

    if (highPrioritySuggestions.length === 0) {
      return undefined;
    }

    // 合并所有高优先级建议
    const allEvidenceTypes = new Set<EvidenceType>();
    const allPoiIds = new Set<number>();
    let totalTime = 0;

    for (const suggestion of highPrioritySuggestions) {
      suggestion.evidenceTypes.forEach(type => allEvidenceTypes.add(type));
      suggestion.affectedPoiIds.forEach(id => allPoiIds.add(id));
      totalTime += suggestion.estimatedTime;
    }

    return {
      evidenceTypes: Array.from(allEvidenceTypes),
      affectedPoiIds: Array.from(allPoiIds),
      estimatedTime: totalTime,
      description: `一键获取 ${highPrioritySuggestions.length} 项高优先级证据（${allPoiIds.size} 个POI）`,
    };
  }

  /**
   * 检查是否应该自动触发证据获取
   * 
   * @param tripId 行程ID
   * @param threshold 完整性阈值（低于此值建议自动触发）
   * @returns 是否应该触发
   */
  async shouldAutoTrigger(tripId: string, threshold: number = 0.7): Promise<boolean> {
    const result = await this.checkAndSuggest(tripId);
    
    // 如果完整性评分低于阈值，建议自动触发
    if (result.completenessScore < threshold) {
      return true;
    }

    // 如果有高优先级缺失证据，建议自动触发
    const hasHighPriorityMissing = result.suggestions.some(s => s.priority === 'HIGH');
    return hasHighPriorityMissing;
  }
}
