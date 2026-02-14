"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanBudgetDetectOverrunSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanBudgetDetectOverrunSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanBudgetDetectOverrunSkill = PlanBudgetDetectOverrunSkill_1 = class PlanBudgetDetectOverrunSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanBudgetDetectOverrunSkill_1.name);
        this.metadata = {
            name: 'plan.budget.detectOverrun',
            description: '实时检测预算是否超支，识别超支来源',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a;
        this.logger.debug(`执行 plan.budget.detectOverrun: planId=${input.planState.plan_id}`);
        try {
            const budgetTotal = (_a = input.planState.constraints.budget) === null || _a === void 0 ? void 0 : _a.total;
            const budgetBreakdown = input.planState.budget.breakdown;
            if (!budgetTotal || !budgetBreakdown) {
                return {
                    overrun: null,
                };
            }
            const totalEstimated = budgetBreakdown.categories.reduce((sum, cat) => sum + cat.estimated, 0);
            const overrunAmount = totalEstimated > budgetTotal ? totalEstimated - budgetTotal : 0;
            if (overrunAmount <= 0) {
                return {
                    overrun: null,
                };
            }
            const overrunDrivers = budgetBreakdown.categories
                .map(cat => ({
                category: cat.category,
                amount: cat.estimated,
                percentage: (cat.estimated / totalEstimated) * 100,
                reason: this.getOverrunReason(cat.category, input.planState),
            }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 3);
            return {
                overrun: {
                    overrunAmount,
                    overrunDrivers,
                },
            };
        }
        catch (error) {
            this.logger.error(`检测超支失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    getOverrunReason(category, planState) {
        var _a;
        const reasons = {
            transportation: `跨城段较多（${planState.mobility.transferSegments.length} 段）或选择了高成本交通方式`,
            accommodation: `住宿档位较高（${((_a = planState.constraints.accommodation) === null || _a === void 0 ? void 0 : _a.level) || '未指定'}）`,
            food: `目的地消费水平较高或天数较多（${planState.constraints.time.days} 天）`,
            tickets: `包含多个付费景点或活动`,
            experiences: `包含特殊体验项目`,
            buffer: `缓冲比例设置较高`,
        };
        return reasons[category] || '该类别预算估算较高';
    }
};
exports.PlanBudgetDetectOverrunSkill = PlanBudgetDetectOverrunSkill;
exports.PlanBudgetDetectOverrunSkill = PlanBudgetDetectOverrunSkill = PlanBudgetDetectOverrunSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanBudgetDetectOverrunSkill);
//# sourceMappingURL=plan-budget-detect-overrun.skill.js.map