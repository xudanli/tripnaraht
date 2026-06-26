// src/trips/services/budget-evaluation.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetDecisionLogService } from '../budget-os/services/budget-decision-log.service';
import { BudgetStructureService } from '../budget-os/services/budget-structure.service';
import { TripBudgetIntentService } from '../budget-os/services/trip-budget-intent.service';
import { TravelWalletService } from '../budget-os/services/travel-wallet.service';
import { resolveTripWalletRoster } from '../budget-os/services/trip-wallet-roster.service';
import type {
  BudgetStructure,
  BudgetViolation,
  TripBudgetIntent,
} from '../budget-os/types/trip-budget-os.types';
import { parseBudgetConfig } from '../budget-os/utils/budget-config.util';
import { toInputJsonValue } from '../budget-os/utils/prisma-json.util';
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
    experience?: number;
  };
  budgetConstraint: BudgetConstraint;
  budgetIntent?: TripBudgetIntent;
  budgetStructure?: BudgetStructure;
}

export type BudgetEvaluationVerdict = 'ALLOW' | 'NEED_ADJUST' | 'NEED_CONFIRM' | 'REJECT';

export interface BudgetEvaluationResponse {
  verdict: BudgetEvaluationVerdict;
  reason: string;
  confidence: number;
  /** @deprecated use budgetViolations */
  violations?: Array<{
    category: string;
    exceeded: number;
    percentage: number;
  }>;
  budgetViolations?: BudgetViolation[];
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
  verdict: BudgetEvaluationVerdict;
  estimatedCost: number;
  budgetConstraint: BudgetConstraint;
  reason: string;
  evidenceRefs: string[];
  budgetViolations?: BudgetViolation[];
  persona?: 'ABU';
}

@Injectable()
export class BudgetEvaluationService {
  private readonly logger = new Logger(BudgetEvaluationService.name);

  constructor(
    private prisma: PrismaService,
    private tripBudgetService: TripBudgetService,
    private intentService: TripBudgetIntentService,
    private structureService: BudgetStructureService,
    private walletService: TravelWalletService,
    private decisionLogService: BudgetDecisionLogService,
  ) {}

  /**
   * 评估规划方案的预算合理性
   */
  async evaluateBudget(request: BudgetEvaluationRequest): Promise<BudgetEvaluationResponse> {
    const { planId, tripId, estimatedCost, categoryBreakdown, budgetConstraint } = request;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const intent =
      request.budgetIntent ?? (await this.intentService.getIntent(tripId));
    const structure =
      request.budgetStructure ?? (await this.structureService.getStructure(tripId));

    const totalBudget = intent?.total ?? budgetConstraint.total;
    const currency = intent?.currency ?? budgetConstraint.currency ?? 'CNY';
    const ratio = totalBudget > 0 ? estimatedCost / totalBudget : 0;

    const legacyViolations: NonNullable<BudgetEvaluationResponse['violations']> = [];
    const budgetViolations: BudgetViolation[] = [];
    const recommendations: BudgetEvaluationResponse['recommendations'] = [];

    let verdict: BudgetEvaluationVerdict = 'ALLOW';
    let reason = '';
    let confidence = 0.9;

    if (ratio > 1.0) {
      verdict = 'REJECT';
      reason = `预估成本 ${estimatedCost.toFixed(2)} ${currency} 超出总预算 ${totalBudget.toFixed(2)} ${currency}，超支 ${((ratio - 1) * 100).toFixed(1)}%`;
      confidence = 0.95;
      budgetViolations.push({
        type: 'TOTAL_EXCEEDED',
        estimatedAmount: estimatedCost,
        intentAmount: totalBudget,
        variance: estimatedCost - totalBudget,
        variancePercent: (ratio - 1) * 100,
        message: reason,
      });
    } else if (ratio > 0.95) {
      verdict = 'NEED_ADJUST';
      reason = `预估成本 ${estimatedCost.toFixed(2)} ${currency} 接近预算上限，使用率 ${(ratio * 100).toFixed(1)}%，建议优化`;
      confidence = 0.85;
    } else if (ratio > 0.8) {
      verdict = 'ALLOW';
      reason = `预估成本 ${estimatedCost.toFixed(2)} ${currency} 在预算范围内，但使用率 ${(ratio * 100).toFixed(1)}% 较高`;
      confidence = 0.8;
    } else {
      verdict = 'ALLOW';
      reason = `预估成本 ${estimatedCost.toFixed(2)} ${currency} 在预算范围内，使用率 ${(ratio * 100).toFixed(1)}%`;
      confidence = 0.9;
    }

    // Legacy categoryLimits (ceiling semantics)
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
          legacyViolations.push({ category, exceeded, percentage });
          budgetViolations.push({
            type: 'CATEGORY_EXCEEDED',
            category,
            intentAmount: limit,
            estimatedAmount: actual,
            variance: exceeded,
            variancePercent: percentage,
            message: `${category} 分类超支 ${percentage.toFixed(1)}%`,
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

    // L2 structure mismatch (allocation intent vs estimate)
    if (structure) {
      const mismatches = this.structureService.evaluateStructureMismatch(
        structure,
        categoryBreakdown,
      );
      for (const m of mismatches) {
        const msg = `${m.category} 预估 ${m.estimatedAmount.toFixed(0)} 与结构分配 ${m.intentAmount.toFixed(0)} 偏差 ${(m.variancePercent * 100).toFixed(0)}%`;
        budgetViolations.push({
          type: 'STRUCTURE_MISMATCH',
          category: m.category,
          intentAmount: m.intentAmount,
          estimatedAmount: m.estimatedAmount,
          variance: m.estimatedAmount - m.intentAmount,
          variancePercent: m.variancePercent * 100,
          message: msg,
        });
        reason += `；${msg}`;
        if (verdict !== 'REJECT') {
          verdict = 'NEED_CONFIRM';
        }
      }
    }

    const roster = await resolveTripWalletRoster(this.prisma, tripId);
    if (roster.length >= 2) {
      const hasRule = await this.walletService.hasPaymentRule(tripId);
      if (!hasRule) {
        budgetViolations.push({
          type: 'WALLET_UNSET',
          message: '组队行程尚未设置付款规则（L3 Travel Wallet）',
        });
        reason += '；组队行程尚未设置付款规则';
        if (verdict === 'ALLOW') {
          verdict = 'NEED_CONFIRM';
        }
      }
    }

    if (verdict !== 'ALLOW' && verdict !== 'NEED_CONFIRM') {
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

    const violationTypes = [...new Set(budgetViolations.map((v) => v.type))];
    await this.persistGateStatus(tripId, {
      verdict,
      violationTypes,
      evaluatedAt: new Date().toISOString(),
      planId,
    });

    const logItem: BudgetDecisionLogItem = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      planId,
      verdict,
      estimatedCost,
      budgetConstraint,
      reason,
      evidenceRefs: [],
      budgetViolations: budgetViolations.length ? budgetViolations : undefined,
      persona: 'ABU',
    };

    await this.decisionLogService.appendLog(tripId, logItem);

    return {
      verdict,
      reason,
      confidence,
      violations: legacyViolations.length > 0 ? legacyViolations : undefined,
      budgetViolations: budgetViolations.length > 0 ? budgetViolations : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      evidenceRefs: [],
    };
  }

  private async persistGateStatus(
    tripId: string,
    gateStatus: {
      verdict: BudgetEvaluationVerdict;
      violationTypes: BudgetViolation['type'][];
      evaluatedAt: string;
      planId: string;
    },
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return;
    const config = parseBudgetConfig(trip.budgetConfig);
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        budgetConfig: toInputJsonValue({
          ...config,
          gateStatus,
          updatedAt: new Date().toISOString(),
        }),
      },
    });
  }

  async getBudgetDecisionLog(
    planId: string,
    tripId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ items: BudgetDecisionLogItem[]; total: number }> {
    return this.decisionLogService.listLogs(
      planId,
      tripId,
      limit ?? 50,
      offset ?? 0,
    );
  }

  async getPlanBudgetEvaluation(
    planId: string,
    tripId: string,
  ): Promise<{
    planId: string;
    budgetEvaluation: BudgetEvaluationResponse;
    personaOutput?: {
      persona: 'ABU';
      verdict: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
      explanation: string;
      evidence: Array<{ type: string; content: string }>;
    };
  }> {
    const latestLog = await this.decisionLogService.getLatestLog(planId, tripId);

    if (!latestLog) {
      throw new NotFoundException(`未找到方案 ${planId} 的预算评估结果`);
    }

    const budgetEvaluation: BudgetEvaluationResponse = {
      verdict: latestLog.verdict,
      reason: latestLog.reason,
      confidence: 0.85,
      evidenceRefs: latestLog.evidenceRefs,
      budgetViolations: latestLog.budgetViolations,
    };

    const personaVerdictMap: Record<string, 'ALLOW' | 'NEED_CONFIRM' | 'REJECT'> = {
      ALLOW: 'ALLOW',
      NEED_ADJUST: 'NEED_CONFIRM',
      NEED_CONFIRM: 'NEED_CONFIRM',
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
