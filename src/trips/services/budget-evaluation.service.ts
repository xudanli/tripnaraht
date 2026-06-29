// src/trips/services/budget-evaluation.service.ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ItineraryItemsService } from '../../itinerary-items/itinerary-items.service';
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
import {
  buildBudgetEvidence,
  buildOptimizationProposals,
  type BudgetEvidenceItem,
  type BudgetOptimizationProposal,
} from './budget-optimization.util';
import {
  buildPriceEvidence,
  pickRecommendedPlanId,
  topHotspotFromViolations,
  type BudgetPlanCompareInput,
  type BudgetPlanCompareRow,
  type BudgetPriceEvidenceItem,
} from './budget-comparison.util';
import { TripBudgetProfileService } from '../budget-os/services/trip-budget-profile.service';
import {
  formatBudgetCategoryLabel,
  formatStructureMismatchDetail,
  formatUserBudgetEvaluationReason,
  sumCategoryBreakdown,
  type StructureMismatchRow,
} from './budget-evaluation-copy.util';

export type { BudgetEvidenceItem, BudgetOptimizationProposal };

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

export interface BudgetEvaluationHotspot {
  type: BudgetViolation['type'];
  category?: string;
  message: string;
  variancePercent?: number;
  intentAmount?: number;
  estimatedAmount?: number;
}

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
  /** Checker 右侧热点：结构偏差 / 分类超支 / 钱包未设等 */
  hotspots?: BudgetEvaluationHotspot[];
  recommendations?: Array<{
    action: string;
    impact: string;
    estimatedSavings: number;
  }>;
  /** Checker 证据 Tab */
  evidence?: BudgetEvidenceItem[];
  /** 可应用的优化草案（与 pendingOptimizations 同步） */
  optimizations?: BudgetOptimizationProposal[];
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

export interface ApplyBudgetOptimizationRequest {
  planId: string;
  tripId: string;
  optimizationIds: string[];
  autoCommit?: boolean;
}

export interface ApplyBudgetOptimizationResult {
  planId: string;
  appliedOptimizations: Array<{
    id: string;
    type: BudgetOptimizationProposal['type'];
    estimatedSavings: number;
    status: 'success' | 'skipped' | 'failed';
    itemId?: string;
    message?: string;
  }>;
  totalSavings: number;
  newEstimatedCost: number;
  dryRun: boolean;
}

export interface BudgetComparePlansRequest {
  tripId: string;
  plans: BudgetPlanCompareInput[];
  budgetConstraint?: BudgetConstraint;
  budgetIntent?: TripBudgetIntent;
  budgetStructure?: BudgetStructure;
}

export interface BudgetComparePlansResponse {
  schema: 'tripnara.budget_comparison@v1';
  tripId: string;
  intentTotal: number;
  currency: string;
  structure?: {
    allocations: BudgetStructure['allocations'];
    spendingPersona?: BudgetStructure['spendingPersona'];
  };
  plans: BudgetPlanCompareRow[];
  recommendedPlanId?: string;
  priceEvidence: BudgetPriceEvidenceItem[];
}

export interface BudgetWorkbenchDetailsResponse {
  tripId: string;
  planId?: string;
  profile: Awaited<ReturnType<TripBudgetProfileService['getProfile']>>;
  evidence: BudgetEvidenceItem[];
  optimizations: BudgetOptimizationProposal[];
  priceEvidence: BudgetPriceEvidenceItem[];
}

interface BudgetEvaluationCoreResult {
  verdict: BudgetEvaluationVerdict;
  reason: string;
  confidence: number;
  legacyViolations: NonNullable<BudgetEvaluationResponse['violations']>;
  budgetViolations: BudgetViolation[];
  recommendations: NonNullable<BudgetEvaluationResponse['recommendations']>;
  hotspots: BudgetEvaluationHotspot[];
  totalBudget: number;
  currency: string;
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
    private itineraryItemsService: ItineraryItemsService,
    private profileService: TripBudgetProfileService,
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

    const core = await this.computeBudgetEvaluationCore({
      tripId,
      estimatedCost,
      categoryBreakdown,
      budgetConstraint,
      intent,
      structure,
    });

    const {
      verdict,
      reason,
      confidence,
      legacyViolations,
      budgetViolations,
      recommendations,
      hotspots,
      totalBudget,
      currency,
    } = core;

    const violationTypes = [...new Set(budgetViolations.map((v) => v.type))];

    const tripItems = await this.loadTripItemsWithCost(tripId);
    const targetSavings = Math.max(0, estimatedCost - totalBudget);
    const optimizations = buildOptimizationProposals({
      items: tripItems,
      violations: budgetViolations,
      recommendations,
      targetSavings,
    });
    const evidence = buildBudgetEvidence({
      tripId,
      estimatedCost,
      categoryBreakdown,
      intentTotal: totalBudget,
      currency,
      violations: budgetViolations,
      structureAllocations: structure?.allocations,
    });
    const evidenceRefs = evidence.map((e) => e.id);

    await this.persistPendingBudgetArtifacts(tripId, planId, optimizations, evidence);

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
      evidenceRefs,
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
      hotspots: hotspots.length > 0 ? hotspots : undefined,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
      evidence,
      optimizations,
      evidenceRefs,
    };
  }

  async compareBudgetPlans(
    request: BudgetComparePlansRequest,
  ): Promise<BudgetComparePlansResponse> {
    const { tripId, plans } = request;
    if (!plans.length) {
      throw new BadRequestException('plans 至少包含一个方案');
    }

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const intent =
      request.budgetIntent ?? (await this.intentService.getIntent(tripId));
    const structure =
      request.budgetStructure ?? (await this.structureService.getStructure(tripId));
    const budgetConstraint =
      request.budgetConstraint ??
      ({
        total: intent?.total ?? 0,
        currency: intent?.currency ?? 'CNY',
      } as BudgetConstraint);

    const intentTotal = intent?.total ?? budgetConstraint.total;
    const currency = intent?.currency ?? budgetConstraint.currency ?? 'CNY';

    const rows: BudgetPlanCompareRow[] = [];
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const core = await this.computeBudgetEvaluationCore({
        tripId,
        estimatedCost: plan.estimatedCost,
        categoryBreakdown: plan.categoryBreakdown,
        budgetConstraint,
        intent,
        structure,
      });
      rows.push({
        planId: plan.planId,
        label: plan.label ?? `方案 ${String.fromCharCode(65 + i)}`,
        estimatedCost: plan.estimatedCost,
        budgetUsagePercent:
          intentTotal > 0
            ? Math.round((plan.estimatedCost / intentTotal) * 1000) / 10
            : 0,
        vsIntentDelta: plan.estimatedCost - intentTotal,
        verdict: core.verdict,
        violationCount: core.budgetViolations.length,
        topHotspot: topHotspotFromViolations(core.budgetViolations),
        categoryBreakdown: plan.categoryBreakdown,
      });
    }

    return {
      schema: 'tripnara.budget_comparison@v1',
      tripId,
      intentTotal,
      currency,
      structure: structure
        ? {
            allocations: structure.allocations,
            spendingPersona: structure.spendingPersona,
          }
        : undefined,
      plans: rows,
      recommendedPlanId: pickRecommendedPlanId(rows),
      priceEvidence: buildPriceEvidence({
        currency,
        intentTotal,
        structureAllocations: structure?.allocations,
      }),
    };
  }

  async getWorkbenchBudgetDetails(
    tripId: string,
    planId?: string,
  ): Promise<BudgetWorkbenchDetailsResponse> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const profile = await this.profileService.getProfile(tripId, [
      'actuals',
      'wallet',
    ]);
    const config = parseBudgetConfig(trip.budgetConfig);
    const evidence = planId ? config.pendingBudgetEvidence?.[planId] ?? [] : [];
    const optimizations = planId ? config.pendingOptimizations?.[planId] ?? [] : [];

    return {
      tripId,
      planId,
      profile,
      evidence,
      optimizations,
      priceEvidence: buildPriceEvidence({
        currency: profile.intent?.currency ?? 'CNY',
        intentTotal: profile.intent?.total,
        structureAllocations: profile.structure?.allocations,
      }),
    };
  }

  private async computeBudgetEvaluationCore(input: {
    tripId: string;
    estimatedCost: number;
    categoryBreakdown: BudgetEvaluationRequest['categoryBreakdown'];
    budgetConstraint: BudgetConstraint;
    intent: TripBudgetIntent | null;
    structure: BudgetStructure | null;
  }): Promise<BudgetEvaluationCoreResult> {
    const { tripId, estimatedCost, categoryBreakdown, budgetConstraint, intent, structure } =
      input;

    const totalBudget = intent?.total ?? budgetConstraint.total;
    const currency = intent?.currency ?? budgetConstraint.currency ?? 'CNY';
    const ratio = totalBudget > 0 ? estimatedCost / totalBudget : 0;

    const legacyViolations: NonNullable<BudgetEvaluationResponse['violations']> = [];
    const budgetViolations: BudgetViolation[] = [];
    const recommendations: NonNullable<BudgetEvaluationResponse['recommendations']> = [];

    let verdict: BudgetEvaluationVerdict = 'ALLOW';
    let confidence = 0.9;
    const structureMismatches: StructureMismatchRow[] = [];
    const categoryExceeded: string[] = [];
    let walletUnset = false;

    if (ratio > 1.0) {
      verdict = 'REJECT';
      confidence = 0.95;
      budgetViolations.push({
        type: 'TOTAL_EXCEEDED',
        estimatedAmount: estimatedCost,
        intentAmount: totalBudget,
        variance: estimatedCost - totalBudget,
        variancePercent: (ratio - 1) * 100,
        message: `超出总预算约 ${Math.round((ratio - 1) * 100)}%`,
      });
    } else if (ratio > 0.95) {
      verdict = 'NEED_ADJUST';
      confidence = 0.85;
    } else if (ratio > 0.8) {
      verdict = 'ALLOW';
      confidence = 0.8;
    } else {
      verdict = 'ALLOW';
      confidence = 0.9;
    }

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
            message: `${formatBudgetCategoryLabel(category)}分类超支 ${percentage.toFixed(0)}%`,
          });
          categoryExceeded.push(category);

          if (percentage > 20) {
            verdict = 'REJECT';
          } else if (verdict === 'ALLOW') {
            verdict = 'NEED_ADJUST';
          }
        }
      }
    }

    const hasCostData = estimatedCost > 0 && sumCategoryBreakdown(categoryBreakdown) > 0;
    if (structure && hasCostData) {
      const mismatches = this.structureService.evaluateStructureMismatch(
        structure,
        categoryBreakdown,
      );
      for (const m of mismatches) {
        structureMismatches.push(m);
        budgetViolations.push({
          type: 'STRUCTURE_MISMATCH',
          category: m.category,
          intentAmount: m.intentAmount,
          estimatedAmount: m.estimatedAmount,
          variance: m.estimatedAmount - m.intentAmount,
          variancePercent: m.variancePercent * 100,
          message: formatStructureMismatchDetail(m),
        });
        if (verdict !== 'REJECT') {
          verdict = 'NEED_CONFIRM';
        }
      }
    }

    const roster = await resolveTripWalletRoster(this.prisma, tripId);
    if (roster.length >= 2) {
      const hasRule = await this.walletService.hasPaymentRule(tripId);
      if (!hasRule) {
        walletUnset = true;
        budgetViolations.push({
          type: 'WALLET_UNSET',
          message: '组队行程尚未设置付款规则',
        });
        if (verdict === 'ALLOW') {
          verdict = 'NEED_CONFIRM';
        }
      }
    }

    const reason = formatUserBudgetEvaluationReason({
      estimatedCost,
      totalBudget,
      currency,
      ratio,
      structureMismatches,
      categoryExceeded,
      walletUnset,
    });

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

    const hotspots: BudgetEvaluationHotspot[] = budgetViolations.map((v) => ({
      type: v.type,
      category: v.category,
      message: v.message,
      variancePercent: v.variancePercent,
      intentAmount: v.intentAmount,
      estimatedAmount: v.estimatedAmount,
    }));

    return {
      verdict,
      reason,
      confidence,
      legacyViolations,
      budgetViolations,
      recommendations,
      hotspots,
      totalBudget,
      currency,
    };
  }

  async applyBudgetOptimizations(
    request: ApplyBudgetOptimizationRequest,
  ): Promise<ApplyBudgetOptimizationResult> {
    const { planId, tripId, optimizationIds } = request;
    const dryRun = request.autoCommit !== true;

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const config = parseBudgetConfig(trip.budgetConfig);
    const pending = config.pendingOptimizations?.[planId] ?? [];
    if (pending.length === 0) {
      throw new BadRequestException(
        `未找到方案 ${planId} 的预算优化草案，请先调用 budget/evaluate`,
      );
    }

    const selected = pending.filter((p) => optimizationIds.includes(p.id));
    if (selected.length === 0) {
      throw new BadRequestException('optimizationIds 与最近一次 evaluate 结果不匹配');
    }

    const appliedOptimizations: ApplyBudgetOptimizationResult['appliedOptimizations'] = [];
    let totalSavings = 0;

    for (const opt of selected) {
      try {
        if (!opt.itemId) {
          appliedOptimizations.push({
            id: opt.id,
            type: opt.type,
            estimatedSavings: opt.estimatedSavings,
            status: 'skipped',
            message: '无可绑定的行程项，需手动调整',
          });
          continue;
        }

        const item = await this.prisma.itineraryItem.findUnique({
          where: { id: opt.itemId },
          include: { TripDay: { select: { tripId: true } } },
        });
        if (!item || item.TripDay.tripId !== tripId) {
          appliedOptimizations.push({
            id: opt.id,
            type: opt.type,
            estimatedSavings: opt.estimatedSavings,
            status: 'failed',
            itemId: opt.itemId,
            message: '行程项不存在或不属于该 trip',
          });
          continue;
        }

        if (dryRun) {
          appliedOptimizations.push({
            id: opt.id,
            type: opt.type,
            estimatedSavings: opt.estimatedSavings,
            status: 'success',
            itemId: opt.itemId,
            message: '预览模式：未写入',
          });
          totalSavings += opt.estimatedSavings;
          continue;
        }

        if (opt.type === 'REMOVE') {
          await this.itineraryItemsService.remove(opt.itemId);
        } else {
          const current = item.estimatedCost ?? item.actualCost ?? 0;
          const next = Math.max(0, current - opt.estimatedSavings);
          await this.prisma.itineraryItem.update({
            where: { id: opt.itemId },
            data: {
              estimatedCost: next,
              costNote: item.costNote
                ? `${item.costNote}；预算优化：${opt.action}`
                : `预算优化：${opt.action}`,
            },
          });
        }

        appliedOptimizations.push({
          id: opt.id,
          type: opt.type,
          estimatedSavings: opt.estimatedSavings,
          status: 'success',
          itemId: opt.itemId,
        });
        totalSavings += opt.estimatedSavings;
      } catch (error) {
        appliedOptimizations.push({
          id: opt.id,
          type: opt.type,
          estimatedSavings: opt.estimatedSavings,
          status: 'failed',
          itemId: opt.itemId,
          message: error instanceof Error ? error.message : '应用失败',
        });
      }
    }

    const summary = await this.tripBudgetService.getBudgetSummary(tripId);
    const latestLog = await this.decisionLogService.getLatestLog(planId, tripId);
    const baseEstimate = latestLog?.estimatedCost ?? summary.totalSpent;
    const newEstimatedCost = Math.max(0, baseEstimate - totalSavings);

    if (!dryRun && appliedOptimizations.some((a) => a.status === 'success')) {
      const remaining = pending.filter((p) => !optimizationIds.includes(p.id));
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          budgetConfig: toInputJsonValue({
            ...config,
            pendingOptimizations: {
              ...(config.pendingOptimizations ?? {}),
              [planId]: remaining,
            },
            updatedAt: new Date().toISOString(),
          }),
        },
      });
    }

    return {
      planId,
      appliedOptimizations,
      totalSavings,
      newEstimatedCost,
      dryRun,
    };
  }

  private async loadTripItemsWithCost(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: {
            ItineraryItem: {
              include: { Place: { select: { nameCN: true, nameEN: true } } },
            },
          },
        },
      },
    });
    if (!trip) return [];
    return (trip.TripDay ?? []).flatMap((day) => day.ItineraryItem ?? []);
  }

  private async persistPendingBudgetArtifacts(
    tripId: string,
    planId: string,
    optimizations: BudgetOptimizationProposal[],
    evidence: BudgetEvidenceItem[],
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return;
    const config = parseBudgetConfig(trip.budgetConfig);
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        budgetConfig: toInputJsonValue({
          ...config,
          pendingOptimizations: {
            ...(config.pendingOptimizations ?? {}),
            [planId]: optimizations,
          },
          pendingBudgetEvidence: {
            ...(config.pendingBudgetEvidence ?? {}),
            [planId]: evidence,
          },
          updatedAt: new Date().toISOString(),
        }),
      },
    });
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
      hotspots: latestLog.budgetViolations?.map((v) => ({
        type: v.type,
        category: v.category,
        message: v.message,
        variancePercent: v.variancePercent,
        intentAmount: v.intentAmount,
        estimatedAmount: v.estimatedAmount,
      })),
    };

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    const config = parseBudgetConfig(trip?.budgetConfig);
    const pendingEvidence = config.pendingBudgetEvidence;
    const evidence = pendingEvidence?.[planId] ?? [];
    const optimizations = config.pendingOptimizations?.[planId];
    if (evidence.length) {
      budgetEvaluation.evidence = evidence;
    }
    if (optimizations?.length) {
      budgetEvaluation.optimizations = optimizations;
    }

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
        evidence: evidence.map((e) => ({ type: e.type, content: e.content })),
      },
    };
  }
}
