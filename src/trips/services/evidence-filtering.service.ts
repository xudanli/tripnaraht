// src/trips/services/evidence-filtering.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { 
  EvidenceItemDto, 
  EvidencePriorityFilter, 
  EvidenceGroupBy, 
  EvidenceSortBy,
  EvidenceSeverity,
  EvidenceFreshnessStatus,
} from '../dto/evidence.dto';

/**
 * 证据过滤和排序服务
 * 
 * 职责：
 * 1. 根据优先级过滤证据
 * 2. 按不同方式分组证据
 * 3. 智能排序证据
 */
@Injectable()
export class EvidenceFilteringService {
  private readonly logger = new Logger(EvidenceFilteringService.name);

  /**
   * 过滤和排序证据项
   * 
   * @param items 证据项列表
   * @param priority 优先级过滤
   * @param groupBy 分组方式
   * @param sortBy 排序方式
   * @param currentDay 当前天数（用于相关性排序，可选）
   * @returns 处理后的证据项列表
   */
  filterAndSort(
    items: EvidenceItemDto[],
    priority: EvidencePriorityFilter = EvidencePriorityFilter.ALL,
    groupBy: EvidenceGroupBy = EvidenceGroupBy.NONE,
    sortBy: EvidenceSortBy = EvidenceSortBy.TIME,
    currentDay?: number,
  ): EvidenceItemDto[] {
    // 1. 优先级过滤
    let filtered = this.filterByPriority(items, priority);

    // 2. 排序
    filtered = this.sortItems(filtered, sortBy, currentDay);

    // 3. 分组（如果需要）
    if (groupBy !== EvidenceGroupBy.NONE) {
      // 分组逻辑在返回时处理，这里先排序
      // 实际分组应该在前端或响应DTO中处理
    }

    return filtered;
  }

  /**
   * 根据优先级过滤证据
   */
  private filterByPriority(
    items: EvidenceItemDto[],
    priority: EvidencePriorityFilter,
  ): EvidenceItemDto[] {
    if (priority === EvidencePriorityFilter.ALL) {
      return items;
    }

    return items.filter(item => {
      const importance = this.calculateImportance(item);

      if (priority === EvidencePriorityFilter.HIGH) {
        return importance >= 0.7;  // 高优先级：重要性 >= 0.7
      } else if (priority === EvidencePriorityFilter.MEDIUM_AND_HIGH) {
        return importance >= 0.4;  // 中等和高优先级：重要性 >= 0.4
      }

      return true;
    });
  }

  /**
   * 计算证据重要性（0-1）
   * 
   * 基于：
   * - 严重程度（severity）
   * - 时效性状态（freshness）
   * - 质量评分（qualityScore）
   * - 置信度（confidence）
   */
  private calculateImportance(item: EvidenceItemDto): number {
    let importance = 0.5;  // 基础重要性

    // 1. 严重程度（权重：40%）
    if (item.severity === EvidenceSeverity.HIGH) {
      importance += 0.4;
    } else if (item.severity === EvidenceSeverity.MEDIUM) {
      importance += 0.2;
    }

    // 2. 时效性状态（权重：20%）
    if (item.freshness) {
      if (item.freshness.freshnessStatus === EvidenceFreshnessStatus.EXPIRED) {
        importance += 0.2;  // 过期证据需要关注
      } else if (item.freshness.freshnessStatus === EvidenceFreshnessStatus.STALE) {
        importance += 0.1;
      }
    }

    // 3. 质量评分（权重：20%）
    if (item.qualityScore) {
      if (item.qualityScore.level === 'HIGH') {
        importance += 0.2;
      } else if (item.qualityScore.level === 'MEDIUM') {
        importance += 0.1;
      }
    }

    // 4. 置信度（权重：20%）
    if (item.confidence) {
      if (item.confidence.level === 'HIGH') {
        importance += 0.2;
      } else if (item.confidence.level === 'MEDIUM') {
        importance += 0.1;
      }
    }

    return Math.min(1, Math.max(0, importance));
  }

  /**
   * 排序证据项
   */
  private sortItems(
    items: EvidenceItemDto[],
    sortBy: EvidenceSortBy,
    currentDay?: number,
  ): EvidenceItemDto[] {
    const sorted = [...items];

    switch (sortBy) {
      case EvidenceSortBy.IMPORTANCE:
        sorted.sort((a, b) => {
          const importanceA = this.calculateImportance(a);
          const importanceB = this.calculateImportance(b);
          return importanceB - importanceA;  // 降序
        });
        break;

      case EvidenceSortBy.RELEVANCE:
        sorted.sort((a, b) => {
          // 当前天数的证据优先
          if (currentDay !== undefined) {
            if (a.day === currentDay && b.day !== currentDay) return -1;
            if (a.day !== currentDay && b.day === currentDay) return 1;
          }
          // 然后按重要性排序
          const importanceA = this.calculateImportance(a);
          const importanceB = this.calculateImportance(b);
          return importanceB - importanceA;
        });
        break;

      case EvidenceSortBy.FRESHNESS:
        sorted.sort((a, b) => {
          const freshnessA = this.getFreshnessScore(a);
          const freshnessB = this.getFreshnessScore(b);
          return freshnessB - freshnessA;  // 降序（新鲜的在前面）
        });
        break;

      case EvidenceSortBy.QUALITY:
        sorted.sort((a, b) => {
          const qualityA = a.qualityScore?.overallScore || 0;
          const qualityB = b.qualityScore?.overallScore || 0;
          return qualityB - qualityA;  // 降序
        });
        break;

      case EvidenceSortBy.TIME:
      default:
        // 按时间倒序（最新的在前）
        sorted.sort((a, b) => {
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          return timeB - timeA;
        });
        break;
    }

    return sorted;
  }

  /**
   * 获取新鲜度分数（用于排序）
   */
  private getFreshnessScore(item: EvidenceItemDto): number {
    if (!item.freshness) {
      return 0.5;  // 没有新鲜度信息，默认中等
    }

    switch (item.freshness.freshnessStatus) {
      case EvidenceFreshnessStatus.FRESH:
        return 1.0;
      case EvidenceFreshnessStatus.STALE:
        return 0.5;
      case EvidenceFreshnessStatus.EXPIRED:
        return 0.0;
      default:
        return 0.5;
    }
  }

  /**
   * 分组证据项（返回分组后的结构）
   * 
   * 注意：这个方法返回的是分组结构，不是扁平列表
   * 如果需要扁平列表，应该使用 filterAndSort
   */
  groupItems(
    items: EvidenceItemDto[],
    groupBy: EvidenceGroupBy,
  ): Record<string, EvidenceItemDto[]> {
    const grouped: Record<string, EvidenceItemDto[]> = {};

    if (groupBy === EvidenceGroupBy.NONE) {
      return { 'all': items };
    }

    for (const item of items) {
      let key: string;

      switch (groupBy) {
        case EvidenceGroupBy.IMPORTANCE:
          const importance = this.calculateImportance(item);
          if (importance >= 0.7) {
            key = 'high';
          } else if (importance >= 0.4) {
            key = 'medium';
          } else {
            key = 'low';
          }
          break;

        case EvidenceGroupBy.TYPE:
          key = item.type;
          break;

        case EvidenceGroupBy.DAY:
          key = item.day ? `day-${item.day}` : 'unknown';
          break;

        default:
          key = 'all';
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(item);
    }

    return grouped;
  }
}
