// src/trips/decision/services/decision-stats.service.ts
/**
 * Decision Statistics Service（决策统计服务）
 * 
 * 目标：回答两个问题：
 * 1. TripNARA 的决策，有多少是"硬现实驱动"（PHYSICAL + HUMAN 比例）？
 * 2. 不同国家/路线，决策源分布有什么差异？
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionSource } from '../shared/decision-result.types';

/**
 * 决策统计结果
 */
export interface DecisionStatsResult {
  /** 国家代码 */
  countryCode?: string;
  /** 路线方向 ID */
  routeDirectionId?: string;
  /** 决策来源 */
  decisionSource: DecisionSource;
  /** 决策数量 */
  decisionCount: number;
  /** 占比（0-1） */
  percentage: number;
}

/**
 * 按维度统计决策分布
 */
export interface DecisionDistributionStats {
  /** 总决策数 */
  totalDecisions: number;
  /** 按决策源统计 */
  bySource: {
    PHYSICAL: number;
    HUMAN: number;
    PHILOSOPHY: number;
    HEURISTIC: number;
    UTILITY: number;
    USER: number;
  };
  /** 按决策源占比 */
  bySourcePercentage: {
    PHYSICAL: number;
    HUMAN: number;
    PHILOSOPHY: number;
    HEURISTIC: number;
    UTILITY: number;
    USER: number;
  };
  /** 硬现实驱动比例（PHYSICAL + HUMAN） */
  realityDrivenRatio: number;
  /** 详细统计（按国家/路线） */
  details: DecisionStatsResult[];
}

/**
 * Persona 触发统计
 */
export interface PersonaTriggerStats {
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
  triggerCount: number;
  /** 按决策源统计 */
  bySource: {
    PHYSICAL: number;
    HUMAN: number;
    PHILOSOPHY: number;
    HEURISTIC: number;
    UTILITY: number;
    USER: number;
  };
  /** 主要决策来源 */
  primarySource: DecisionSource;
}

@Injectable()
export class DecisionStatsService {
  private readonly logger = new Logger(DecisionStatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按国家统计决策分布
   * 
   * 回答：冰岛/尼泊尔/西藏 哪个更靠 PHYSICAL
   */
  async getStatsByCountry(
    countryCode?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DecisionDistributionStats> {
    this.logger.debug(`统计决策分布（国家: ${countryCode || '全部'})`);

    // 构建查询条件
    const where: any = {};
    if (countryCode) {
      where.countryCode = countryCode;
    }
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // 查询决策日志
    const logs = await this.prisma.decisionLog.findMany({
      where,
      select: {
        decisionSource: true,
        countryCode: true,
      },
    });

    // 统计
    const totalDecisions = logs.length;
    const bySource = {
      PHYSICAL: logs.filter(l => l.decisionSource === 'PHYSICAL').length,
      HUMAN: logs.filter(l => l.decisionSource === 'HUMAN').length,
      PHILOSOPHY: logs.filter(l => l.decisionSource === 'PHILOSOPHY').length,
      HEURISTIC: logs.filter(l => l.decisionSource === 'HEURISTIC').length,
      UTILITY: logs.filter(l => l.decisionSource === 'UTILITY').length,
      USER: logs.filter(l => l.decisionSource === 'USER').length,
    };

    const bySourcePercentage = {
      PHYSICAL: totalDecisions > 0 ? bySource.PHYSICAL / totalDecisions : 0,
      HUMAN: totalDecisions > 0 ? bySource.HUMAN / totalDecisions : 0,
      PHILOSOPHY: totalDecisions > 0 ? bySource.PHILOSOPHY / totalDecisions : 0,
      HEURISTIC: totalDecisions > 0 ? bySource.HEURISTIC / totalDecisions : 0,
      UTILITY: totalDecisions > 0 ? bySource.UTILITY / totalDecisions : 0,
      USER: totalDecisions > 0 ? bySource.USER / totalDecisions : 0,
    };

    const realityDrivenRatio = totalDecisions > 0
      ? (bySource.PHYSICAL + bySource.HUMAN) / totalDecisions
      : 0;

    // 按国家+决策源分组统计
    const detailsMap = new Map<string, { countryCode?: string; decisionSource: DecisionSource; count: number }>();
    for (const log of logs) {
      const key = `${log.countryCode || 'UNKNOWN'}_${log.decisionSource}`;
      const existing = detailsMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        detailsMap.set(key, {
          countryCode: log.countryCode || undefined,
          decisionSource: log.decisionSource as DecisionSource,
          count: 1,
        });
      }
    }

    const details: DecisionStatsResult[] = Array.from(detailsMap.values()).map(item => ({
      countryCode: item.countryCode,
      decisionSource: item.decisionSource,
      decisionCount: item.count,
      percentage: totalDecisions > 0 ? item.count / totalDecisions : 0,
    }));

    return {
      totalDecisions,
      bySource,
      bySourcePercentage,
      realityDrivenRatio,
      details,
    };
  }

  /**
   * 按路线方向统计决策分布
   */
  async getStatsByRouteDirection(
    routeDirectionId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DecisionDistributionStats> {
    this.logger.debug(`统计决策分布（路线: ${routeDirectionId || '全部'})`);

    // 构建查询条件
    const where: any = {};
    if (routeDirectionId) {
      where.routeDirectionId = routeDirectionId;
    }
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // 查询决策日志
    const logs = await this.prisma.decisionLog.findMany({
      where,
      select: {
        decisionSource: true,
        routeDirectionId: true,
      },
    });

    // 统计（与 getStatsByCountry 类似）
    const totalDecisions = logs.length;
    const bySource = {
      PHYSICAL: logs.filter(l => l.decisionSource === 'PHYSICAL').length,
      HUMAN: logs.filter(l => l.decisionSource === 'HUMAN').length,
      PHILOSOPHY: logs.filter(l => l.decisionSource === 'PHILOSOPHY').length,
      HEURISTIC: logs.filter(l => l.decisionSource === 'HEURISTIC').length,
      UTILITY: logs.filter(l => l.decisionSource === 'UTILITY').length,
      USER: logs.filter(l => l.decisionSource === 'USER').length,
    };

    const bySourcePercentage = {
      PHYSICAL: totalDecisions > 0 ? bySource.PHYSICAL / totalDecisions : 0,
      HUMAN: totalDecisions > 0 ? bySource.HUMAN / totalDecisions : 0,
      PHILOSOPHY: totalDecisions > 0 ? bySource.PHILOSOPHY / totalDecisions : 0,
      HEURISTIC: totalDecisions > 0 ? bySource.HEURISTIC / totalDecisions : 0,
      UTILITY: totalDecisions > 0 ? bySource.UTILITY / totalDecisions : 0,
      USER: totalDecisions > 0 ? bySource.USER / totalDecisions : 0,
    };

    const realityDrivenRatio = totalDecisions > 0
      ? (bySource.PHYSICAL + bySource.HUMAN) / totalDecisions
      : 0;

    const details: DecisionStatsResult[] = [];
    if (routeDirectionId) {
      for (const source of [
        'PHYSICAL',
        'HUMAN',
        'PHILOSOPHY',
        'HEURISTIC',
        'UTILITY',
        'USER',
      ] as DecisionSource[]) {
        const count = bySource[source];
        if (count > 0) {
          details.push({
            routeDirectionId,
            decisionSource: source,
            decisionCount: count,
            percentage: totalDecisions > 0 ? count / totalDecisions : 0,
          });
        }
      }
    }

    return {
      totalDecisions,
      bySource,
      bySourcePercentage,
      realityDrivenRatio,
      details,
    };
  }

  /**
   * 按 Persona 统计触发频次和源头
   * 
   * 回答：Abu/Dr.Dre/Neptune 触发频次 & 源头
   */
  async getPersonaTriggerStats(
    startDate?: Date,
    endDate?: Date
  ): Promise<PersonaTriggerStats[]> {
    this.logger.debug('统计 Persona 触发频次');

    // 构建查询条件
    const where: any = {};
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = startDate;
      }
      if (endDate) {
        where.timestamp.lte = endDate;
      }
    }

    // 查询决策日志
    const logs = await this.prisma.decisionLog.findMany({
      where,
      select: {
        persona: true,
        decisionSource: true,
      },
    });

    // 按 Persona 分组统计
    const personaMap = new Map<
      string,
      {
        persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        bySource: Record<DecisionSource, number>;
      }
    >();

    for (const log of logs) {
      const persona = log.persona as 'ABU' | 'DR_DRE' | 'NEPTUNE';
      const source = log.decisionSource as DecisionSource;

      let stats = personaMap.get(persona);
      if (!stats) {
        stats = {
          persona,
          bySource: {
            PHYSICAL: 0,
            HUMAN: 0,
            PHILOSOPHY: 0,
            HEURISTIC: 0,
            UTILITY: 0,
            USER: 0,
          },
        };
        personaMap.set(persona, stats);
      }

      stats.bySource[source] = (stats.bySource[source] ?? 0) + 1;
    }

    // 转换为结果格式
    const result: PersonaTriggerStats[] = Array.from(personaMap.values()).map(stats => {
      const triggerCount =
        stats.bySource.PHYSICAL +
        stats.bySource.HUMAN +
        stats.bySource.PHILOSOPHY +
        stats.bySource.HEURISTIC +
        stats.bySource.UTILITY +
        stats.bySource.USER;
      
      // 确定主要决策来源
      let primarySource: DecisionSource = 'HEURISTIC';
      let maxCount = 0;
      for (const [source, count] of Object.entries(stats.bySource)) {
        if (count > maxCount) {
          maxCount = count;
          primarySource = source as DecisionSource;
        }
      }

      return {
        persona: stats.persona,
        triggerCount,
        bySource: stats.bySource,
        primarySource,
      };
    });

    return result;
  }

  /**
   * 获取硬现实驱动比例
   * 
   * 返回：X% 的关键决策来自物理现实建模
   */
  async getRealityDrivenRatio(
    countryCode?: string,
    routeDirectionId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    const stats = countryCode
      ? await this.getStatsByCountry(countryCode, startDate, endDate)
      : await this.getStatsByRouteDirection(routeDirectionId, startDate, endDate);

    return stats.realityDrivenRatio;
  }

  /**
   * 获取 HEURISTIC 决策热点
   * 
   * 用于"减肥计划"：识别哪些地方 HEURISTIC 触发最多
   */
  async getHeuristicHotspots(
    limit: number = 10
  ): Promise<Array<{
    countryCode?: string;
    routeDirectionId?: string;
    heuristicCount: number;
    totalDecisions: number;
    heuristicRatio: number;
    suggestions: string[];
  }>> {
    this.logger.debug(`识别 HEURISTIC 决策热点（Top ${limit}）`);

    // 查询所有 HEURISTIC 决策
    const heuristicLogs = await this.prisma.decisionLog.findMany({
      where: {
        decisionSource: 'HEURISTIC',
      },
      select: {
        countryCode: true,
        routeDirectionId: true,
        persona: true,
      },
    });

    // 按国家+路线分组统计
    const hotspotMap = new Map<string, {
      countryCode?: string;
      routeDirectionId?: string;
      heuristicCount: number;
      totalDecisions: number;
    }>();

    for (const log of heuristicLogs) {
      const key = `${log.countryCode || 'UNKNOWN'}_${log.routeDirectionId || 'UNKNOWN'}`;
      const existing = hotspotMap.get(key);
      if (existing) {
        existing.heuristicCount++;
      } else {
        hotspotMap.set(key, {
          countryCode: log.countryCode || undefined,
          routeDirectionId: log.routeDirectionId || undefined,
          heuristicCount: 1,
          totalDecisions: 0, // 需要查询总数
        });
      }
    }

    // 查询每个热点对应的总决策数
    for (const [, hotspot] of hotspotMap.entries()) {
      const where: any = {};
      if (hotspot.countryCode) {
        where.countryCode = hotspot.countryCode;
      }
      if (hotspot.routeDirectionId) {
        where.routeDirectionId = hotspot.routeDirectionId;
      }

      const total = await this.prisma.decisionLog.count({ where });
      hotspot.totalDecisions = total;
    }

    // 转换为结果格式并排序
    const hotspots = Array.from(hotspotMap.values())
      .map(hotspot => {
        const heuristicRatio = hotspot.totalDecisions > 0
          ? hotspot.heuristicCount / hotspot.totalDecisions
          : 0;

        // 生成建议
        const suggestions: string[] = [];
        if (hotspot.routeDirectionId?.includes('neptune') || heuristicLogs.some(l => l.persona === 'NEPTUNE' && l.routeDirectionId === hotspot.routeDirectionId)) {
          suggestions.push('Neptune 经常用 HEURISTIC 决策 → 说明这条线的 corridor / hazard / POI 数据不完整');
          suggestions.push('建议补充 F-road 状态数据和 POI 可用性数据');
        } else if (hotspot.routeDirectionId?.includes('drdre') || heuristicLogs.some(l => l.persona === 'DR_DRE' && l.routeDirectionId === hotspot.routeDirectionId)) {
          suggestions.push('Dr.Dre 有 HEURISTIC 条目 → 说明用户画像里的某部分还没正式抽进 HumanCapabilityModel');
          suggestions.push('建议从用户反馈学习 HumanCapabilityModel');
        }

        return {
          ...hotspot,
          heuristicRatio,
          suggestions,
        };
      })
      .sort((a, b) => b.heuristicRatio - a.heuristicRatio)
      .slice(0, limit);

    return hotspots;
  }
}

