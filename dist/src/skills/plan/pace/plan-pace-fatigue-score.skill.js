"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PlanPaceFatigueScoreSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanPaceFatigueScoreSkill = void 0;
const common_1 = require("@nestjs/common");
let PlanPaceFatigueScoreSkill = PlanPaceFatigueScoreSkill_1 = class PlanPaceFatigueScoreSkill {
    constructor() {
        this.logger = new common_1.Logger(PlanPaceFatigueScoreSkill_1.name);
        this.metadata = {
            name: 'plan.pace.fatigueScore',
            description: '计算疲劳与节奏评分（连续早起、长距离移动、累计爬升/步行）',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
        };
    }
    async execute(input) {
        var _a, _b;
        this.logger.debug(`执行 plan.pace.fatigueScore: planId=${input.planState.plan_id}`);
        try {
            const days = input.planState.constraints.time.days;
            const transferSegments = input.planState.mobility.transferSegments;
            const fatigueDrivers = [];
            let totalScore = 0;
            const earlyMornings = ((_a = input.planState.pace.timeWindows) === null || _a === void 0 ? void 0 : _a.filter(tw => parseInt(tw.start.split(':')[0]) < 7).length) || 0;
            if (earlyMornings > 0) {
                const severity = Math.min(earlyMornings * 20, 100);
                fatigueDrivers.push({
                    type: 'early_morning',
                    severity,
                    description: `${earlyMornings} 天需要早起`,
                });
                totalScore += severity * 0.2;
            }
            const longTransfers = transferSegments.filter(seg => {
                var _a;
                return ((_a = seg.availableModes) === null || _a === void 0 ? void 0 : _a.some(m => m.time > 240)) || false;
            }).length;
            if (longTransfers > 0) {
                const severity = Math.min(longTransfers * 25, 100);
                fatigueDrivers.push({
                    type: 'long_transfer',
                    severity,
                    description: `${longTransfers} 段长距离移动`,
                });
                totalScore += severity * 0.3;
            }
            if ((_b = input.planState.world) === null || _b === void 0 ? void 0 : _b.physical) {
            }
            const paceScore = Math.min(totalScore, 100);
            const suggestedRestPoints = [];
            if (paceScore > 60) {
                const restDay = Math.floor(days / 2);
                suggestedRestPoints.push({
                    day: restDay,
                    reason: '疲劳评分较高，建议在此日安排轻松活动或休息',
                });
            }
            return {
                fatigueScore: {
                    paceScore,
                    fatigueDrivers,
                    suggestedRestPoints,
                },
            };
        }
        catch (error) {
            this.logger.error(`计算疲劳评分失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.PlanPaceFatigueScoreSkill = PlanPaceFatigueScoreSkill;
exports.PlanPaceFatigueScoreSkill = PlanPaceFatigueScoreSkill = PlanPaceFatigueScoreSkill_1 = __decorate([
    (0, common_1.Injectable)()
], PlanPaceFatigueScoreSkill);
//# sourceMappingURL=plan-pace-fatigue-score.skill.js.map