"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanConstraintsDetectConflictsSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanConstraintsDetectConflictsSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanConstraintsDetectConflictsSkill = PlanConstraintsDetectConflictsSkill_1 = class PlanConstraintsDetectConflictsSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanConstraintsDetectConflictsSkill_1.name);
        this.metadata = {
            name: 'plan.constraints.detectConflicts',
            description: '检测约束冲突（预算不足、时间不够、节奏过载、不可达）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a, _b, _c;
        this.logger.debug(`执行 plan.constraints.detectConflicts: planId=${input.planState.plan_id}`);
        try {
            const conflicts = [];
            if (input.planState.budget.overrun && input.planState.budget.overrun.overrunAmount > 0) {
                const severity = input.planState.budget.overrun.overrunAmount > ((_a = input.planState.constraints.budget) === null || _a === void 0 ? void 0 : _a.total) * 0.2
                    ? 'critical'
                    : input.planState.budget.overrun.overrunAmount > ((_b = input.planState.constraints.budget) === null || _b === void 0 ? void 0 : _b.total) * 0.1
                        ? 'high'
                        : 'medium';
                conflicts.push({
                    type: 'budget',
                    severity,
                    description: `预算超支 ${input.planState.budget.overrun.overrunAmount} ${((_c = input.planState.constraints.budget) === null || _c === void 0 ? void 0 : _c.currency) || 'CNY'}`,
                    affectedDays: undefined,
                    affectedSegments: undefined,
                });
            }
            const timeWindows = input.planState.pace.timeWindows || [];
            const insufficientTime = timeWindows.filter(tw => {
                const start = parseInt(tw.start.split(':')[0]);
                const end = parseInt(tw.end.split(':')[0]);
                return (end - start) < 6;
            });
            if (insufficientTime.length > 0) {
                conflicts.push({
                    type: 'time',
                    severity: insufficientTime.length > timeWindows.length / 2 ? 'high' : 'medium',
                    description: `${insufficientTime.length} 天可用时间不足`,
                    affectedDays: insufficientTime.map(tw => tw.day),
                    affectedSegments: undefined,
                });
            }
            if (input.planState.pace.fatigueScore && input.planState.pace.fatigueScore.paceScore > 70) {
                conflicts.push({
                    type: 'pace',
                    severity: input.planState.pace.fatigueScore.paceScore > 85 ? 'high' : 'medium',
                    description: `疲劳评分过高: ${input.planState.pace.fatigueScore.paceScore}/100`,
                    affectedDays: input.planState.pace.fatigueScore.fatigueDrivers.map(d => 0),
                    affectedSegments: undefined,
                });
            }
            const infeasibleSegments = input.planState.mobility.transferSegments.filter(seg => seg.feasibility === 'infeasible');
            if (infeasibleSegments.length > 0) {
                conflicts.push({
                    type: 'feasibility',
                    severity: 'critical',
                    description: `${infeasibleSegments.length} 段不可达`,
                    affectedDays: undefined,
                    affectedSegments: infeasibleSegments.map(seg => seg.id),
                });
            }
            return {
                conflicts: {
                    conflicts,
                },
            };
        }
        catch (error) {
            this.logger.error(`检测冲突失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanConstraintsDetectConflictsSkill = PlanConstraintsDetectConflictsSkill;
exports.PlanConstraintsDetectConflictsSkill = PlanConstraintsDetectConflictsSkill = PlanConstraintsDetectConflictsSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanConstraintsDetectConflictsSkill);
//# sourceMappingURL=plan-constraints-detect-conflicts.skill.js.map