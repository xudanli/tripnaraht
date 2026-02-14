"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BudgetEvaluationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BudgetEvaluationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const trip_budget_service_1 = require("./trip-budget.service");
let BudgetEvaluationService = BudgetEvaluationService_1 = class BudgetEvaluationService {
    constructor(prisma, tripBudgetService) {
        this.prisma = prisma;
        this.tripBudgetService = tripBudgetService;
        this.logger = new common_1.Logger(BudgetEvaluationService_1.name);
        this.decisionLogs = new Map();
    }
    async evaluateBudget(request) {
        const { planId, tripId, estimatedCost, categoryBreakdown, budgetConstraint } = request;
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ${tripId} 不存在`);
        }
        const totalBudget = budgetConstraint.total;
        const ratio = totalBudget > 0 ? estimatedCost / totalBudget : 0;
        const violations = [];
        const recommendations = [];
        let verdict = 'ALLOW';
        let reason = '';
        let confidence = 0.9;
        if (ratio > 1.0) {
            verdict = 'REJECT';
            reason = `预估成本 ${estimatedCost.toFixed(2)} ${budgetConstraint.currency} 超出总预算 ${totalBudget.toFixed(2)} ${budgetConstraint.currency}，超支 ${((ratio - 1) * 100).toFixed(1)}%`;
            confidence = 0.95;
        }
        else if (ratio > 0.95) {
            verdict = 'NEED_ADJUST';
            reason = `预估成本 ${estimatedCost.toFixed(2)} ${budgetConstraint.currency} 接近预算上限，使用率 ${(ratio * 100).toFixed(1)}%，建议优化`;
            confidence = 0.85;
        }
        else if (ratio > 0.8) {
            verdict = 'ALLOW';
            reason = `预估成本 ${estimatedCost.toFixed(2)} ${budgetConstraint.currency} 在预算范围内，但使用率 ${(ratio * 100).toFixed(1)}% 较高`;
            confidence = 0.8;
        }
        else {
            verdict = 'ALLOW';
            reason = `预估成本 ${estimatedCost.toFixed(2)} ${budgetConstraint.currency} 在预算范围内，使用率 ${(ratio * 100).toFixed(1)}%`;
            confidence = 0.9;
        }
        if (budgetConstraint.categoryLimits) {
            const categoryMap = {
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
                    }
                    else if (verdict === 'ALLOW') {
                        verdict = 'NEED_ADJUST';
                        reason += `；${category} 分类超支 ${percentage.toFixed(1)}%`;
                    }
                }
            }
        }
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
        const logItem = {
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
        this.decisionLogs.get(tripId).push(logItem);
        return {
            verdict,
            reason,
            confidence,
            violations: violations.length > 0 ? violations : undefined,
            recommendations: recommendations.length > 0 ? recommendations : undefined,
            evidenceRefs: [],
        };
    }
    async getBudgetDecisionLog(planId, tripId, limit, offset) {
        const logs = this.decisionLogs.get(tripId) || [];
        const filteredLogs = logs.filter(log => log.planId === planId);
        const total = filteredLogs.length;
        const paginatedLogs = filteredLogs.slice(offset || 0, (offset || 0) + (limit || 50));
        return {
            items: paginatedLogs,
            total,
        };
    }
    async getPlanBudgetEvaluation(planId, tripId) {
        const logs = this.decisionLogs.get(tripId) || [];
        const latestLog = logs.filter(log => log.planId === planId).pop();
        if (!latestLog) {
            throw new common_1.NotFoundException(`未找到方案 ${planId} 的预算评估结果`);
        }
        const budgetConstraint = latestLog.budgetConstraint;
        const estimatedCost = latestLog.estimatedCost;
        const budgetEvaluation = {
            verdict: latestLog.verdict,
            reason: latestLog.reason,
            confidence: 0.85,
            evidenceRefs: latestLog.evidenceRefs,
        };
        const personaVerdictMap = {
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
};
exports.BudgetEvaluationService = BudgetEvaluationService;
exports.BudgetEvaluationService = BudgetEvaluationService = BudgetEvaluationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trip_budget_service_1.TripBudgetService])
], BudgetEvaluationService);
//# sourceMappingURL=budget-evaluation.service.js.map