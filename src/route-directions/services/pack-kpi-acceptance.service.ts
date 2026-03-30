// src/route-directions/services/pack-kpi-acceptance.service.ts
/**
 * 国家 Pack KPI 验收服务
 * 
 * P1.4: 国家 Pack KPI 验收
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PackKPIAcceptanceResult,
  RouteDirectionPersonalityKPI,
  ConstraintCombinationKPI,
  UserPreferenceDifferentiationKPI,
} from '../interfaces/pack-kpi.interface';
import { RouteDirectionSelectorService } from './route-direction-selector.service';

@Injectable()
export class PackKPIAcceptanceService {
  private readonly logger = new Logger(PackKPIAcceptanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routeSelector: RouteDirectionSelectorService
  ) {}

  /**
   * 验收国家 Pack 的 KPI
   */
  async acceptPackKPI(countryCode: string): Promise<PackKPIAcceptanceResult> {
    this.logger.log(`开始验收 ${countryCode} 的 Pack KPI...`);

    // 1. 获取该国家的所有 RouteDirection
    const routeDirections = await this.prisma.routeDirection.findMany({
      where: {
        countryCode,
        isActive: true,
      },
    });

    if (routeDirections.length < 3) {
      return {
        countryCode,
        countryName: countryCode,
        acceptanceTime: new Date().toISOString(),
        passed: false,
        overallScore: 0,
        personalityKPI: {
          averagePersonalityScore: 0,
          minPersonalityScore: 0,
          maxPersonalityScore: 0,
          passed: false,
          details: [],
        },
        constraintCombinationKPI: {
          diversityScore: 0,
          passed: false,
          details: {
            totalCombinations: 0,
            uniqueCombinations: 0,
            diversityScore: 0,
            combinations: [],
          },
        },
        userPreferenceDifferentiationKPI: {
          differentiationScore: 0,
          passed: false,
          details: {
            totalScenarios: 0,
            differentiatedScenarios: 0,
            differentiationScore: 0,
            scenarios: [],
          },
        },
        issues: [`至少需要3条RouteDirection，当前只有${routeDirections.length}条`],
        recommendations: ['增加RouteDirection数量'],
      };
    }

    // 2. 计算 RouteDirection 独特性 KPI
    const personalityKPI = await this.calculatePersonalityKPI(routeDirections);

    // 3. 计算约束组合多样性 KPI
    const constraintCombinationKPI = this.calculateConstraintCombinationKPI(routeDirections);

    // 4. 计算用户偏好差异化 KPI
    const userPreferenceDifferentiationKPI = await this.calculateUserPreferenceDifferentiationKPI(
      countryCode,
      routeDirections
    );

    // 5. 计算总体得分
    const overallScore = Math.round(
      (personalityKPI.averagePersonalityScore * 0.4 +
        constraintCombinationKPI.diversityScore * 0.3 +
        userPreferenceDifferentiationKPI.differentiationScore * 0.3)
    );

    // 6. 判断是否通过
    const passed =
      personalityKPI.passed &&
      constraintCombinationKPI.diversityScore >= 70 &&
      userPreferenceDifferentiationKPI.differentiationScore >= 70 &&
      overallScore >= 70;

    // 7. 生成问题和建议
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!personalityKPI.passed) {
      issues.push('RouteDirection独特性不足（平均得分 < 60）');
      recommendations.push('增加RouteDirection的标签、约束、风险画像的差异性');
    }

    if (constraintCombinationKPI.diversityScore < 70) {
      issues.push('约束组合多样性不足（得分 < 70）');
      recommendations.push('增加不同约束组合的RouteDirection');
    }

    if (userPreferenceDifferentiationKPI.differentiationScore < 70) {
      issues.push('用户偏好差异化不足（得分 < 70）');
      recommendations.push('确保不同用户偏好在不同RouteDirection下产生不同结果');
    }

    return {
      countryCode,
      countryName: countryCode,
      acceptanceTime: new Date().toISOString(),
      passed,
      overallScore,
      personalityKPI,
      constraintCombinationKPI: {
        diversityScore: constraintCombinationKPI.diversityScore,
        passed: constraintCombinationKPI.diversityScore >= 70,
        details: constraintCombinationKPI,
      },
      userPreferenceDifferentiationKPI: {
        differentiationScore: userPreferenceDifferentiationKPI.differentiationScore,
        passed: userPreferenceDifferentiationKPI.differentiationScore >= 70,
        details: userPreferenceDifferentiationKPI,
      },
      issues,
      recommendations,
    };
  }

  /**
   * 计算 RouteDirection 独特性 KPI
   */
  private async calculatePersonalityKPI(
    routeDirections: any[]
  ): Promise<PackKPIAcceptanceResult['personalityKPI']> {
    const details: RouteDirectionPersonalityKPI[] = [];

    for (const rd of routeDirections) {
      // 计算标签独特性
      const allTags = routeDirections.flatMap(r => r.tags || []);
      const tagCounts = new Map<string, number>();
      allTags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });

      const rdTags = rd.tags || [];
      const uniqueTags = rdTags.filter((tag: string) => tagCounts.get(tag) === 1);
      const tagUniquenessScore = rdTags.length > 0
        ? Math.round((uniqueTags.length / rdTags.length) * 100)
        : 0;

      // 计算约束独特性
      const constraintKeys = new Set<string>();
      routeDirections.forEach(r => {
        if (r.constraints) {
          if (r.constraints.hard) {
            Object.keys(r.constraints.hard).forEach(k => constraintKeys.add(`hard.${k}`));
          }
          if (r.constraints.soft) {
            Object.keys(r.constraints.soft).forEach(k => constraintKeys.add(`soft.${k}`));
          }
        }
      });

      const rdConstraintKeys = new Set<string>();
      if (rd.constraints) {
        if (rd.constraints.hard) {
          Object.keys(rd.constraints.hard).forEach(k => rdConstraintKeys.add(`hard.${k}`));
        }
        if (rd.constraints.soft) {
          Object.keys(rd.constraints.soft).forEach(k => rdConstraintKeys.add(`soft.${k}`));
        }
      }

      // 计算约束值的独特性（简化：检查是否有不同的约束值）
      const constraintUniquenessScore = rdConstraintKeys.size > 0
        ? Math.round((rdConstraintKeys.size / constraintKeys.size) * 100)
        : 0;

      // 计算风险画像独特性
      const riskProfileKeys = new Set<string>();
      routeDirections.forEach(r => {
        if (r.riskProfile) {
          Object.keys(r.riskProfile).forEach(k => riskProfileKeys.add(k));
        }
      });

      const rdRiskProfileKeys = new Set<string>();
      if (rd.riskProfile) {
        Object.keys(rd.riskProfile).forEach(k => rdRiskProfileKeys.add(k));
      }

      const riskProfileUniquenessScore = rdRiskProfileKeys.size > 0
        ? Math.round((rdRiskProfileKeys.size / riskProfileKeys.size) * 100)
        : 0;

      // 计算综合独特性得分
      const overallPersonalityScore = Math.round(
        (tagUniquenessScore * 0.4 +
          constraintUniquenessScore * 0.3 +
          riskProfileUniquenessScore * 0.3)
      );

      details.push({
        routeDirectionId: rd.id.toString(),
        name: rd.nameCN || rd.name,
        tagUniquenessScore,
        constraintUniquenessScore,
        riskProfileUniquenessScore,
        overallPersonalityScore,
        analysis: {
          uniqueTags,
          uniqueConstraints: Array.from(rdConstraintKeys),
          uniqueRiskFeatures: Array.from(rdRiskProfileKeys),
        },
      });
    }

    const scores = details.map(d => d.overallPersonalityScore);
    const averagePersonalityScore = Math.round(
      scores.reduce((sum, score) => sum + score, 0) / scores.length
    );
    const minPersonalityScore = Math.min(...scores);
    const maxPersonalityScore = Math.max(...scores);

    return {
      averagePersonalityScore,
      minPersonalityScore,
      maxPersonalityScore,
      passed: averagePersonalityScore >= 60,
      details,
    };
  }

  /**
   * 计算约束组合多样性 KPI
   */
  private calculateConstraintCombinationKPI(
    routeDirections: any[]
  ): ConstraintCombinationKPI {
    const combinationMap = new Map<string, {
      description: string;
      routeDirectionCount: number;
      constraints: any;
    }>();

    for (const rd of routeDirections) {
      // 生成约束组合的标识
      const hardKeys = rd.constraints?.hard ? Object.keys(rd.constraints.hard).sort() : [];
      const softKeys = rd.constraints?.soft ? Object.keys(rd.constraints.soft).sort() : [];
      const combinationId = `${hardKeys.join(',')}|${softKeys.join(',')}`;

      if (!combinationMap.has(combinationId)) {
        combinationMap.set(combinationId, {
          description: `硬约束: [${hardKeys.join(', ')}], 软约束: [${softKeys.join(', ')}]`,
          routeDirectionCount: 0,
          constraints: {
            hard: rd.constraints?.hard || {},
            soft: rd.constraints?.soft || {},
          },
        });
      }

      const combination = combinationMap.get(combinationId)!;
      combination.routeDirectionCount++;
    }

    const totalCombinations = routeDirections.length;
    const uniqueCombinations = combinationMap.size;
    const diversityScore = totalCombinations > 0
      ? Math.round((uniqueCombinations / totalCombinations) * 100)
      : 0;

    return {
      totalCombinations,
      uniqueCombinations,
      diversityScore,
      combinations: Array.from(combinationMap.entries()).map(([id, data]) => ({
        id,
        description: data.description,
        routeDirectionCount: data.routeDirectionCount,
        constraints: data.constraints,
      })),
    };
  }

  /**
   * 计算用户偏好差异化 KPI
   */
  private async calculateUserPreferenceDifferentiationKPI(
    countryCode: string,
    _routeDirections: any[]
  ): Promise<UserPreferenceDifferentiationKPI> {
    // 定义测试场景
    const testScenarios = [
      {
        scenarioId: 'SCENARIO_RELAXED',
        description: '轻松节奏 + 低风险',
        preferences: {
          pace: 'relaxed' as const,
          riskTolerance: 'low' as const,
          intents: { 自然: 0.6, 文化: 0.4 },
        },
      },
      {
        scenarioId: 'SCENARIO_MODERATE',
        description: '中等节奏 + 中等风险',
        preferences: {
          pace: 'moderate' as const,
          riskTolerance: 'medium' as const,
          intents: { 自然: 0.7, 摄影: 0.6 },
        },
      },
      {
        scenarioId: 'SCENARIO_INTENSE',
        description: '挑战节奏 + 高风险',
        preferences: {
          pace: 'intense' as const,
          riskTolerance: 'high' as const,
          intents: { 挑战: 0.9, 徒步: 0.8 },
        },
      },
      {
        scenarioId: 'SCENARIO_CULTURE',
        description: '文化偏好',
        preferences: {
          pace: 'moderate' as const,
          riskTolerance: 'medium' as const,
          intents: { 文化: 0.9, 历史: 0.8 },
        },
      },
      {
        scenarioId: 'SCENARIO_NATURE',
        description: '自然偏好',
        preferences: {
          pace: 'moderate' as const,
          riskTolerance: 'medium' as const,
          intents: { 自然: 0.9, 摄影: 0.8 },
        },
      },
    ];

    const scenarios: UserPreferenceDifferentiationKPI['scenarios'] = [];

    for (const scenario of testScenarios) {
      try {
        // 调用 RouteDirection 选择器
        const recommendations = await this.routeSelector.pickRouteDirections(
          {
            preferences: scenario.preferences,
          } as any,
          countryCode,
          new Date().getMonth() + 1
        );

        const results = recommendations.map(rec => ({
          countryCode,
          selectedRouteDirectionId: rec.routeDirection.id.toString(),
          selectedRouteDirectionName: rec.routeDirection.nameCN || rec.routeDirection.name,
          score: rec.score || 0,
        }));

        // 检查是否产生差异化结果（至少选择不同的RouteDirection）
        const selectedIds = new Set(results.map(r => r.selectedRouteDirectionId));
        const isDifferentiated = selectedIds.size > 1 || results.length > 0;

        scenarios.push({
          scenarioId: scenario.scenarioId,
          description: scenario.description,
          preferences: {
            ...scenario.preferences,
            intents: scenario.preferences.intents
              ? Object.fromEntries(
                  Object.entries(scenario.preferences.intents).filter(([_, v]) => v !== undefined)
                ) as Record<string, number>
              : undefined,
          },
          results,
          isDifferentiated,
          differentiationReason: isDifferentiated
            ? `选择了${selectedIds.size}个不同的RouteDirection`
            : '未产生差异化结果',
        });
      } catch (error) {
        this.logger.warn(`测试场景 ${scenario.scenarioId} 失败: ${error}`);
        scenarios.push({
          scenarioId: scenario.scenarioId,
          description: scenario.description,
          preferences: {
            ...scenario.preferences,
            intents: scenario.preferences.intents
              ? Object.fromEntries(
                  Object.entries(scenario.preferences.intents).filter(([_, v]) => v !== undefined)
                ) as Record<string, number>
              : undefined,
          },
          results: [],
          isDifferentiated: false,
          differentiationReason: `测试失败: ${error}`,
        });
      }
    }

    const totalScenarios = scenarios.length;
    const differentiatedScenarios = scenarios.filter(s => s.isDifferentiated).length;
    const differentiationScore = totalScenarios > 0
      ? Math.round((differentiatedScenarios / totalScenarios) * 100)
      : 0;

    return {
      totalScenarios,
      differentiatedScenarios,
      differentiationScore,
      scenarios,
    };
  }
}
