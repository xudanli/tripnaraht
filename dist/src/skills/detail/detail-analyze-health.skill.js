"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DetailAnalyzeHealthSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DetailAnalyzeHealthSkill = void 0;
const common_1 = require("@nestjs/common");
let DetailAnalyzeHealthSkill = DetailAnalyzeHealthSkill_1 = class DetailAnalyzeHealthSkill {
    constructor() {
        this.logger = new common_1.Logger(DetailAnalyzeHealthSkill_1.name);
        this.metadata = {
            name: 'detail.analyzeHealth',
            description: '分析行程健康度（时间、预算、节奏、可达性），识别问题和风险',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 detail.analyzeHealth: tripId=${input.tripId}`);
        try {
            const schedule = this.analyzeSchedule(input.tripData, input.planState);
            const budget = this.analyzeBudget(input.tripData, input.planState);
            const pace = this.analyzePace(input.tripData, input.planState);
            const feasibility = this.analyzeFeasibility(input.tripData, input.planState);
            const scores = [schedule.score, budget.score, pace.score, feasibility.score];
            const overallScore = Math.min(...scores);
            let overall = 'healthy';
            if (overallScore < 50) {
                overall = 'critical';
            }
            else if (overallScore < 70) {
                overall = 'warning';
            }
            const health = {
                overall,
                dimensions: {
                    schedule,
                    budget,
                    pace,
                    feasibility,
                },
            };
            return {
                health,
            };
        }
        catch (error) {
            this.logger.error(`分析健康度失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    analyzeSchedule(tripData, planState) {
        var _a;
        const issues = [];
        let score = 100;
        if ((_a = planState === null || planState === void 0 ? void 0 : planState.pace) === null || _a === void 0 ? void 0 : _a.timeWindows) {
            const insufficientDays = planState.pace.timeWindows.filter((tw) => {
                const start = parseInt(tw.start.split(':')[0]);
                const end = parseInt(tw.end.split(':')[0]);
                return (end - start) < 6;
            }).length;
            if (insufficientDays > 0) {
                issues.push(`${insufficientDays} 天可用时间不足`);
                score -= insufficientDays * 10;
            }
        }
        const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
        return { status, score: Math.max(0, score), issues };
    }
    analyzeBudget(tripData, planState) {
        var _a, _b;
        const issues = [];
        let score = 100;
        if ((_a = planState === null || planState === void 0 ? void 0 : planState.budget) === null || _a === void 0 ? void 0 : _a.overrun) {
            const overrunRatio = planState.budget.overrun.overrunAmount / (((_b = planState.constraints.budget) === null || _b === void 0 ? void 0 : _b.total) || 1);
            if (overrunRatio > 0.2) {
                issues.push(`预算超支 ${Math.round(overrunRatio * 100)}%`);
                score -= 50;
            }
            else if (overrunRatio > 0.1) {
                issues.push(`预算超支 ${Math.round(overrunRatio * 100)}%`);
                score -= 30;
            }
        }
        const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
        return { status, score: Math.max(0, score), issues };
    }
    analyzePace(tripData, planState) {
        var _a;
        const issues = [];
        let score = 100;
        if ((_a = planState === null || planState === void 0 ? void 0 : planState.pace) === null || _a === void 0 ? void 0 : _a.fatigueScore) {
            const fatigueScore = planState.pace.fatigueScore.paceScore;
            if (fatigueScore > 85) {
                issues.push(`疲劳评分过高: ${fatigueScore}/100`);
                score -= 40;
            }
            else if (fatigueScore > 70) {
                issues.push(`疲劳评分略高: ${fatigueScore}/100`);
                score -= 20;
            }
        }
        const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
        return { status, score: Math.max(0, score), issues };
    }
    analyzeFeasibility(tripData, planState) {
        var _a;
        const issues = [];
        let score = 100;
        if ((_a = planState === null || planState === void 0 ? void 0 : planState.mobility) === null || _a === void 0 ? void 0 : _a.transferSegments) {
            const infeasibleCount = planState.mobility.transferSegments.filter((seg) => seg.feasibility === 'infeasible').length;
            if (infeasibleCount > 0) {
                issues.push(`${infeasibleCount} 段不可达`);
                score -= infeasibleCount * 30;
            }
        }
        const status = score >= 70 ? 'healthy' : score >= 50 ? 'warning' : 'critical';
        return { status, score: Math.max(0, score), issues };
    }
};
exports.DetailAnalyzeHealthSkill = DetailAnalyzeHealthSkill;
exports.DetailAnalyzeHealthSkill = DetailAnalyzeHealthSkill = DetailAnalyzeHealthSkill_1 = __decorate([
    (0, common_1.Injectable)()
], DetailAnalyzeHealthSkill);
//# sourceMappingURL=detail-analyze-health.skill.js.map