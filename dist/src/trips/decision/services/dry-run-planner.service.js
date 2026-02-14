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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DryRunPlannerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DryRunPlannerService = void 0;
const common_1 = require("@nestjs/common");
const dem_daily_energy_service_1 = require("./dem-daily-energy.service");
const dem_risk_scoring_service_1 = require("./dem-risk-scoring.service");
let DryRunPlannerService = DryRunPlannerService_1 = class DryRunPlannerService {
    constructor(demDailyEnergyService, demRiskScoringService) {
        this.demDailyEnergyService = demDailyEnergyService;
        this.demRiskScoringService = demRiskScoringService;
        this.logger = new common_1.Logger(DryRunPlannerService_1.name);
    }
    async simulatePlan(state, plan, decisionParams) {
        var _a, _b, _c, _d, _e, _f, _g;
        const result = {
            willFail: false,
            riskPoints: [],
            energyOverloads: [],
            constraintViolations: [],
            recommendations: [],
        };
        this.logger.debug(`Starting dry-run simulation for ${plan.days.length} days`);
        if (this.demDailyEnergyService) {
            for (const day of plan.days) {
                try {
                    const energyBudget = await this.demDailyEnergyService.calculateDynamicDailyBudget(day, undefined, state.context.preferences.pace || 'moderate');
                    if (energyBudget.totalEnergyCost > energyBudget.maxEnergyCost) {
                        const overload = energyBudget.totalEnergyCost - energyBudget.maxEnergyCost;
                        result.energyOverloads.push({
                            day: day.day,
                            expectedEnergy: energyBudget.totalEnergyCost,
                            maxEnergy: energyBudget.maxEnergyCost,
                            overload,
                        });
                        result.riskPoints.push({
                            day: day.day,
                            riskLevel: overload > 50 ? 'HIGH' : 'MEDIUM',
                            reason: `体力消耗超限 ${overload.toFixed(1)} 单位`,
                            suggestion: '建议拆天或减少活动强度',
                        });
                    }
                }
                catch (error) {
                    this.logger.warn(`Failed to calculate energy budget for day ${day.day}: ${error}`);
                }
            }
        }
        const constraints = (decisionParams === null || decisionParams === void 0 ? void 0 : decisionParams.constraints) || ((_a = state.policies) === null || _a === void 0 ? void 0 : _a.hardConstraints) || {};
        const softConstraints = (decisionParams === null || decisionParams === void 0 ? void 0 : decisionParams.constraints) || ((_b = state.policies) === null || _b === void 0 ? void 0 : _b.softConstraints) || {};
        for (const day of plan.days) {
            if (constraints.maxElevationM && ((_c = day.terrainFacts) === null || _c === void 0 ? void 0 : _c.maxElevation)) {
                if (day.terrainFacts.maxElevation > constraints.maxElevationM) {
                    result.constraintViolations.push({
                        day: day.day,
                        constraint: 'maxElevationM',
                        value: day.terrainFacts.maxElevation,
                        limit: constraints.maxElevationM,
                    });
                    result.riskPoints.push({
                        day: day.day,
                        riskLevel: 'HIGH',
                        reason: `海拔 ${day.terrainFacts.maxElevation}m 超过限制 ${constraints.maxElevationM}m`,
                        suggestion: '建议选择低海拔路线或增加适应日',
                    });
                }
            }
            if (softConstraints.maxDailyAscentM && ((_d = day.terrainFacts) === null || _d === void 0 ? void 0 : _d.totalAscent)) {
                if (day.terrainFacts.totalAscent > softConstraints.maxDailyAscentM) {
                    result.constraintViolations.push({
                        day: day.day,
                        constraint: 'maxDailyAscentM',
                        value: day.terrainFacts.totalAscent,
                        limit: softConstraints.maxDailyAscentM,
                    });
                    result.riskPoints.push({
                        day: day.day,
                        riskLevel: 'MEDIUM',
                        reason: `每日爬升 ${day.terrainFacts.totalAscent}m 超过建议值 ${softConstraints.maxDailyAscentM}m`,
                        suggestion: '建议拆天或增加休息时间',
                    });
                }
            }
        }
        if (this.demRiskScoringService) {
            try {
                const planRiskScore = await this.demRiskScoringService.calculatePlanRiskScore(plan);
                if (planRiskScore && planRiskScore.totalRiskScore > 70) {
                    result.riskPoints.push({
                        day: 0,
                        riskLevel: 'HIGH',
                        reason: `整体风险评分 ${planRiskScore.totalRiskScore.toFixed(1)}% 过高`,
                        suggestion: '建议选择更稳定的路线或增加缓冲时间',
                    });
                }
                if (planRiskScore === null || planRiskScore === void 0 ? void 0 : planRiskScore.dailyRiskScores) {
                    for (const dailyRisk of planRiskScore.dailyRiskScores) {
                        if (dailyRisk.riskScore > 0.7) {
                            result.riskPoints.push({
                                day: dailyRisk.day,
                                riskLevel: 'HIGH',
                                reason: `第 ${dailyRisk.day} 天风险评分 ${(dailyRisk.riskScore * 100).toFixed(1)}% 过高`,
                                suggestion: ((_e = dailyRisk.riskFlags) === null || _e === void 0 ? void 0 : _e.map(f => f.message).join('; ')) || '建议调整行程',
                            });
                        }
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Failed to calculate risk score: ${error}`);
            }
        }
        let consecutiveIntenseDays = 0;
        for (const day of plan.days) {
            const effortLevel = (_f = day.terrainFacts) === null || _f === void 0 ? void 0 : _f.effortLevel;
            if (effortLevel === 'CHALLENGE' || effortLevel === 'EXTREME') {
                consecutiveIntenseDays += 1;
                if (consecutiveIntenseDays >= 3) {
                    result.riskPoints.push({
                        day: day.day,
                        riskLevel: 'MEDIUM',
                        reason: `连续 ${consecutiveIntenseDays} 天高强度活动`,
                        suggestion: '建议在第 ' + (day.day - 1) + ' 天插入休息日',
                    });
                }
            }
            else {
                consecutiveIntenseDays = 0;
            }
        }
        if (result.energyOverloads.length > 0) {
            result.recommendations.push('检测到体力超限，建议调整活动强度或增加休息时间');
        }
        if (result.constraintViolations.length > 0) {
            result.recommendations.push('检测到约束违反，建议调整路线或降低难度');
        }
        if (result.riskPoints.filter(r => r.riskLevel === 'HIGH').length > 0) {
            result.recommendations.push('检测到高风险点，建议重新评估路线选择');
        }
        const highRiskCount = result.riskPoints.filter(r => r.riskLevel === 'HIGH').length;
        const criticalViolations = result.constraintViolations.filter(v => v.constraint === 'maxElevationM').length;
        result.willFail = highRiskCount >= 2 || criticalViolations > 0;
        if (result.willFail) {
            const highRiskDays = result.riskPoints
                .filter(r => r.riskLevel === 'HIGH')
                .map(r => r.day)
                .filter(d => d > 0);
            if (highRiskDays.length > 0) {
                result.failureDay = Math.min(...highRiskDays);
                result.failureReason = ((_g = result.riskPoints
                    .find(r => r.day === result.failureDay && r.riskLevel === 'HIGH')) === null || _g === void 0 ? void 0 : _g.reason) || '高风险活动';
            }
        }
        this.logger.debug(`Dry-run completed: willFail=${result.willFail}, ` +
            `riskPoints=${result.riskPoints.length}, ` +
            `violations=${result.constraintViolations.length}`);
        return result;
    }
    generateAdjustmentSuggestions(result) {
        const suggestions = [];
        if (result.willFail && result.failureDay) {
            suggestions.push(`⚠️ 预计在第 ${result.failureDay} 天可能失败：${result.failureReason}`);
        }
        if (result.energyOverloads.length > 0) {
            const avgOverload = result.energyOverloads.reduce((sum, e) => sum + e.overload, 0) /
                result.energyOverloads.length;
            suggestions.push(`💪 平均体力超限 ${avgOverload.toFixed(1)} 单位，建议：` +
                `1) 减少每日活动数量 2) 增加休息时间 3) 降低活动强度`);
        }
        if (result.constraintViolations.length > 0) {
            const elevationViolations = result.constraintViolations.filter(v => v.constraint === 'maxElevationM');
            if (elevationViolations.length > 0) {
                suggestions.push(`⛰️ 检测到海拔超限，建议选择低海拔路线或增加适应日`);
            }
        }
        const highRiskDays = result.riskPoints.filter(r => r.riskLevel === 'HIGH');
        if (highRiskDays.length > 0) {
            suggestions.push(`⚠️ 检测到 ${highRiskDays.length} 个高风险点，建议：` +
                `1) 选择更稳定的路线 2) 增加缓冲时间 3) 准备应急预案`);
        }
        return suggestions;
    }
};
exports.DryRunPlannerService = DryRunPlannerService;
exports.DryRunPlannerService = DryRunPlannerService = DryRunPlannerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [dem_daily_energy_service_1.DEMDailyEnergyService,
        dem_risk_scoring_service_1.DEMRiskScoringService])
], DryRunPlannerService);
//# sourceMappingURL=dry-run-planner.service.js.map