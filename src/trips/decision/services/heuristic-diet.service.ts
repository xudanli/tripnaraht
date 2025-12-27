// src/trips/decision/services/heuristic-diet.service.ts
/**
 * HEURISTIC Diet Service（HEURISTIC 减肥计划服务）
 * 
 * 目标：把 HEURISTIC 决策逐步转换为 PHYSICAL / HUMAN / PHILOSOPHY 决策
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionStatsService } from './decision-stats.service';
import { DecisionSource } from '../shared/decision-result.types';

/**
 * HEURISTIC 转换目标
 */
export interface HeuristicConversionTarget {
  /** 当前 HEURISTIC 触发场景 */
  scenario: string;
  /** 目标转换类型 */
  targetSource: DecisionSource;
  /** 转换优先级（1-10，10 最高） */
  priority: number;
  /** 转换方案 */
  conversionPlan: {
    /** 需要补充的数据 */
    requiredData: string[];
    /** 需要实现的模型/服务 */
    requiredModels: string[];
    /** 预计工作量（人天） */
    estimatedEffort: number;
  };
  /** 当前 HEURISTIC 触发次数 */
  currentHeuristicCount: number;
}

/**
 * HEURISTIC 减肥计划报告
 */
export interface HeuristicDietPlan {
  /** 总 HEURISTIC 决策数 */
  totalHeuristicDecisions: number;
  /** 总决策数 */
  totalDecisions: number;
  /** HEURISTIC 占比 */
  heuristicRatio: number;
  /** 转换目标列表 */
  conversionTargets: HeuristicConversionTarget[];
  /** 预计转换后 HEURISTIC 占比 */
  estimatedHeuristicRatioAfterConversion: number;
}

@Injectable()
export class HeuristicDietService {
  private readonly logger = new Logger(HeuristicDietService.name);

  constructor(private readonly decisionStats: DecisionStatsService) {}

  /**
   * 生成 HEURISTIC 减肥计划
   */
  async generateDietPlan(): Promise<HeuristicDietPlan> {
    this.logger.debug('生成 HEURISTIC 减肥计划');

    // 1. 获取 HEURISTIC 热点
    const hotspots = await this.decisionStats.getHeuristicHotspots(20);

    // 2. 分析每个热点，生成转换目标
    const conversionTargets: HeuristicConversionTarget[] = [];

    for (const hotspot of hotspots) {
      // 分析场景
      if (hotspot.routeDirectionId?.includes('neptune')) {
        // Neptune 的 HEURISTIC 决策
        conversionTargets.push({
          scenario: `Neptune 在 ${hotspot.countryCode} ${hotspot.routeDirectionId} 使用 HEURISTIC 决策`,
          targetSource: 'PHYSICAL',
          priority: hotspot.heuristicRatio > 0.2 ? 10 : 7,
          conversionPlan: {
            requiredData: [
              'corridorGeom 数据',
              'hazard zone 数据',
              'POI 可用性数据',
              'road status 数据',
            ],
            requiredModels: [
              'SpatialIssueDetectorService（完善）',
              'SpatialReplacementService（完善）',
            ],
            estimatedEffort: 5,
          },
          currentHeuristicCount: hotspot.heuristicCount,
        });
      } else if (hotspot.routeDirectionId?.includes('drdre')) {
        // Dr.Dre 的 HEURISTIC 决策
        conversionTargets.push({
          scenario: `Dr.Dre 在 ${hotspot.countryCode} ${hotspot.routeDirectionId} 使用 HEURISTIC 决策`,
          targetSource: 'HUMAN',
          priority: hotspot.heuristicRatio > 0.15 ? 9 : 6,
          conversionPlan: {
            requiredData: [
              '用户历史旅程反馈',
              '用户体能画像数据',
            ],
            requiredModels: [
              'HumanCapabilityModel（从用户反馈学习）',
              'FatigueCalculatorService（基于真实数据校准）',
            ],
            estimatedEffort: 3,
          },
          currentHeuristicCount: hotspot.heuristicCount,
        });
      }
    }

    // 3. 按优先级排序
    conversionTargets.sort((a, b) => b.priority - a.priority);

    // 4. 计算预计转换后占比
    const totalHeuristic = conversionTargets.reduce(
      (sum, target) => sum + target.currentHeuristicCount,
      0
    );
    const stats = await this.decisionStats.getStatsByCountry();
    const estimatedReduction = totalHeuristic * 0.7; // 假设转换 70%
    const estimatedHeuristicRatioAfterConversion =
      (stats.totalDecisions * stats.bySourcePercentage.HEURISTIC - estimatedReduction) /
      stats.totalDecisions;

    return {
      totalHeuristicDecisions: totalHeuristic,
      totalDecisions: stats.totalDecisions,
      heuristicRatio: stats.bySourcePercentage.HEURISTIC,
      conversionTargets,
      estimatedHeuristicRatioAfterConversion: Math.max(0, estimatedHeuristicRatioAfterConversion),
    };
  }

  /**
   * 获取转换建议（用于文档）
   */
  getConversionGuidelines(): string {
    return `
# HEURISTIC 转换指南

## 原则

将 HEURISTIC 决策逐步转换为 PHYSICAL / HUMAN / PHILOSOPHY 决策。

## 转换场景

### 1. Neptune HEURISTIC → PHYSICAL

**场景**：Neptune 经常用 HEURISTIC 决策

**原因**：corridor / hazard / POI 数据不完整

**转换方案**：
- 补充 corridorGeom 数据（PostGIS）
- 补充 hazard zone 数据
- 补充 POI 可用性数据
- 完善 SpatialIssueDetectorService

### 2. Dr.Dre HEURISTIC → HUMAN

**场景**：Dr.Dre 有 HEURISTIC 条目

**原因**：用户画像里的某部分还没正式抽进 HumanCapabilityModel

**转换方案**：
- 从用户反馈学习 HumanCapabilityModel
- 基于真实数据校准 FatigueCalculatorService
- 建立用户画像 → HumanCapabilityModel 映射表

### 3. Abu HEURISTIC → PHYSICAL

**场景**：Abu 使用 HEURISTIC（理论上不应该）

**原因**：PhysicalRealityModel 数据缺失

**转换方案**：
- 补充 DEM 数据
- 补充 road status 数据
- 补充 hazard zone 数据
- 补充 climate seasonality 数据

## 优先级

1. 高优先级（priority >= 9）：HEURISTIC 占比 > 20%
2. 中优先级（priority 6-8）：HEURISTIC 占比 10-20%
3. 低优先级（priority < 6）：HEURISTIC 占比 < 10%

## 验收标准

转换完成后，该场景的 HEURISTIC 决策应 < 5%。
`;
  }
}

