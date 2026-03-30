// src/trips/services/budget-evaluation.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripBudgetService, BudgetConstraint } from './trip-budget.service';

export interface BudgetEvaluationRequest {
  planId: string;
  tripId: string;
  estimatedCost: number;
  categoryBreakdown: {
    accommodation: number;
    transportation: number;
    food: number;
    activities: number;
    other: number;
  };
  budgetConstraint: BudgetConstraint;
}

export interface BudgetEvaluationResponse {
  verdict: 'ALLOW' | 'NEED_ADJUST' | 'REJECT';
  reason: string;
  confidence: number;
  violations?: Array<{
    category: string;
    exceeded: number;
    percentage: number;
  }>;
  recommendations?: Array<{
    action: string;
    impact: string;
    estimatedSavings: number;
  }>;
  evidenceRefs?: string[];
}

export interface BudgetDecisionLogItem {
  id: string;
  timestamp: string;
  planId: string;
  verdict: 'ALLOW' | 'NEED_ADJUST' | 'REJECT';
  estimatedCost: number;
  budgetConstraint: BudgetConstraint;
  reason: string;
  evidenceRefs: string[];
  persona?: 'ABU';
}

@Injectable()
export class BudgetEvaluationService {
  private readonly logger = new Logger(BudgetEvaluationService.name);
  private decisionLogs: Map<string, BudgetDecisionLogItem[]> = new Map();

  constructor(
    private prisma: PrismaService,
    private tripBudgetService: TripBudgetService,
  ) {}

  /**
   * 评估规划方案的预算合理性
   */
  async evaluateBudget(request: BudgetEvaluationRequest): Promise<BudgetEvaluationResponse> {
    const { planId, tripId, estimatedCost, categoryBreakdown, budgetConstraint } = request;

    // 验证行程存在
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const totalBudget = budgetConstraint.total;
    const ratio = totalBudget > 0 ? estimatedCost / totalBudget : 0;
    const violations: BudgetEvaluationResponse['violations'] = [];
    const recommendations: BudgetEvaluationResponse['recommendations'] = [];

    // 评估总预算
    let verdict: 'ALLOW' | 'NEED_ADJUST' | 'REJECT' = 'ALLOW';
    let reason = '';
    let confidence = 0.9;

    if (ratio > 1.0) {
      // 严重超支
      verdict = 'REJECT';
      reason = `预估成本 ${estimatedCost.toFixed(2)} ${budgetConstraint.currency} 超出总预算 ${totalBudget.toFixed(2)} ${budgetConstraint.currency}，超支 ${((ratio - 1) * 100).toFixed(1)}%`;
      confidence = 0.95;
    } else if (ratio > 0.95) {
      // 接近预算上限，需要调整
      verdict = 'NEED_ADJUST';
      reason = `预估成本 ${estimatedCost.toFixed(2)} ${budgetConstraint.currency} 接近预算上限，使用率 ${(ratio * 100).toFixed(1)}%，建议优化`;
      confidence = 0.85;
    } else if (ratio > 0.8) {
      // 预算使用率较高，给出警告
      verdict = 'ALLOW';
      reason = `预估成本 ${estimatedCost.toFixed(2)} ${budgetConstraint.currency} 在预算范围内，但使用率 ${(ratio * 100).toFixed(1)}% 较高`;
      confidence = 0.8;
    } else {
      verdict = 'ALLOW';
      reason = `预估成本 ${estimatedCost.toFixed(2)} ${budgetConstraint.currency} 在预算范围内，使用率 ${(ratio * 100).toFixed(1)}%`;
      confidence = 0.9;
    }

    // 检查分类预算限制
    if (budgetConstraint.categoryLimits) {
      const categoryMap: Record<string, keyof typeof categoryBreakdown> = {
        accommodation: 'accommodation',
        transportation: 'transportation',
        food: 'food',
        activities: 'activities',
        other: 'other',
      };

      for (const [category, limit] of Object.entries(budgetConstraint.categoryLimits)) {
        const actual = categoryBreakdown[categoryMap[category] || 'other'] || 0;
        if (limit && actual > limit) {
          const exceeded = actual - limit;
          const percentage = (exceeded / limit) * 100;
          violations.push({
            category,
            exceeded,
            percentage,
          });

          if (percentage > 20) {
            verdict = 'REJECT';
            reason += `；${category} 分类超支 ${percentage.toFixed(1)}%`;
          } else if (verdict === 'ALLOW') {
            verdict = 'NEED_ADJUST';
            reason += `；${category} 分类超支 ${percentage.toFixed(1)}%`;
          }
        }
      }
    }

    // 生成优化建议
    if (verdict !== 'ALLOW') {
      const totalExceeded = estimatedCost - totalBudget;
      if (totalExceeded > 0) {
        recommendations.push({
          action: '移除最贵的可选活动',
          impact: '可节省约 10-20% 的成本',
          estimatedSavings: totalExceeded * 0.15,
        });
        recommendations.push({
          action: '选择更经济的住宿选项',
          impact: '可节省约 20-30% 的住宿成本',
          estimatedSavings: categoryBreakdown.accommodation * 0.25,
        });
        recommendations.push({
          action: '调整餐饮预算',
          impact: '可节省约 15-25% 的餐饮成本',
          estimatedSavings: categoryBreakdown.food * 0.2,
        });
      }
    }

    // 记录决策日志
    const logItem: BudgetDecisionLogItem = {
      id: `${planId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      planId,
      verdict,
      estimatedCost,
      budgetConstraint,
      reason,
      evidenceRefs: [],
      persona: 'ABU',
    };

    if (!this.decisionLogs.has(tripId)) {
      this.decisionLogs.set(tripId, []);
    }
    this.decisionLogs.get(tripId)!.push(logItem);

    return {
      verdict,
      reason,
      confidence,
      violations: violations.length > 0 ? violations : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      evidenceRefs: [],
    };
  }

  /**
   * 获取预算决策日志
   */
  async getBudgetDecisionLog(
    planId: string,
    tripId: string,
    limit?: number,
    offset?: number
  ): Promise<{
    items: BudgetDecisionLogItem[];
    total: number;
  }> {
    const logs = this.decisionLogs.get(tripId) || [];
    const filteredLogs = logs.filter(log => log.planId === planId);

    const total = filteredLogs.length;
    const paginatedLogs = filteredLogs.slice(offset || 0, (offset || 0) + (limit || 50));

    return {
      items: paginatedLogs,
      total,
    };
  }

  /**
   * 获取规划方案的预算评估结果
   */
  async getPlanBudgetEvaluation(planId: string, tripId: string): Promise<{
    planId: string;
    budgetEvaluation: BudgetEvaluationResponse;
    personaOutput?: {
      persona: 'ABU';
      verdict: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
      explanation: string;
      evidence: Array<{ type: string; content: string }>;
    };
  }> {
    const logs = this.decisionLogs.get(tripId) || [];
    const latestLog = logs.filter(log => log.planId === planId).pop();

    if (!latestLog) {
      throw new NotFoundException(`未找到方案 ${planId} 的预算评估结果`);
    }

    // 简化：从日志中恢复评估结果
    const budgetEvaluation: BudgetEvaluationResponse = {
      verdict: latestLog.verdict,
      reason: latestLog.reason,
      confidence: 0.85,
      evidenceRefs: latestLog.evidenceRefs,
    };

    // 映射到三人格输出
    const personaVerdictMap: Record<string, 'ALLOW' | 'NEED_CONFIRM' | 'REJECT'> = {
      ALLOW: 'ALLOW',
      NEED_ADJUST: 'NEED_CONFIRM',
      REJECT: 'REJECT',
    };

    return {
      planId,
      budgetEvaluation,
      personaOutput: {
        persona: 'ABU',
        verdict: personaVerdictMap[latestLog.verdict] || 'NEED_CONFIRM',
        explanation: latestLog.reason,
        evidence: [],
      },
    };
  }
}
