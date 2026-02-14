"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EnhancedRiskAssessmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedRiskAssessmentService = void 0;
const common_1 = require("@nestjs/common");
let EnhancedRiskAssessmentService = EnhancedRiskAssessmentService_1 = class EnhancedRiskAssessmentService {
    constructor() {
        this.logger = new common_1.Logger(EnhancedRiskAssessmentService_1.name);
    }
    async assessCostRisk(route, context) {
        const factors = {};
        factors.budgetOverrun = this.assessBudgetOverrunRisk(route, context);
        factors.cancellationRisk = this.assessCancellationRisk(route, context);
        if ((context === null || context === void 0 ? void 0 : context.currency) && context.currency !== 'CNY') {
            factors.exchangeRateRisk = this.assessExchangeRateRisk(route, context);
        }
        factors.hiddenCosts = this.assessHiddenCosts(route, context);
        factors.peakSeasonSurcharge = this.assessPeakSeasonSurcharge(route, context);
        const overallScore = this.calculateCostRiskScore(factors);
        const overallLevel = this.scoreToRiskLevel(overallScore);
        const summary = this.generateCostRiskSummary(factors, overallLevel);
        const recommendations = this.generateCostRiskRecommendations(factors, overallLevel);
        const estimatedCostRange = this.estimateCostRange(route, factors, context);
        return {
            overallLevel,
            overallScore,
            factors,
            summary,
            recommendations,
            estimatedCostRange,
        };
    }
    async assessExperienceRisk(route, context) {
        const factors = {};
        factors.crowdingRisk = this.assessCrowdingRisk(route, context);
        factors.maintenanceClosure = this.assessMaintenanceClosureRisk(route, context);
        factors.expectationGap = this.assessExpectationGapRisk(route, context);
        factors.seasonalExperienceRisk = this.assessSeasonalExperienceRisk(route, context);
        factors.weatherImpactRisk = this.assessWeatherImpactRisk(route, context);
        const overallScore = this.calculateExperienceRiskScore(factors);
        const overallLevel = this.scoreToRiskLevel(overallScore);
        const summary = this.generateExperienceRiskSummary(factors, overallLevel);
        const recommendations = this.generateExperienceRiskRecommendations(factors, overallLevel);
        const expectedExperienceQuality = this.assessExpectedExperienceQuality(factors, overallScore);
        return {
            overallLevel,
            overallScore,
            factors,
            summary,
            recommendations,
            expectedExperienceQuality,
        };
    }
    generateMitigationMatrix(riskCategory, riskLevel, riskDetails) {
        const recommendedStrategies = this.selectMitigationStrategies(riskCategory, riskLevel);
        const measures = this.generateMitigationMeasures(riskCategory, riskLevel, riskDetails);
        const priority = this.determinePriority(riskCategory, riskLevel);
        return {
            riskCategory,
            riskLevel,
            recommendedStrategies,
            measures,
            priority,
        };
    }
    async assessComprehensiveRisk(route, context) {
        const costRisk = await this.assessCostRisk(route, context);
        const experienceRisk = await this.assessExperienceRisk(route, context);
        const safety = this.assessSafetyRisk(route);
        const physical = this.assessPhysicalRisk(route);
        const time = this.assessTimeRisk(route);
        const mitigationMatrix = [
            this.generateMitigationMatrix('SAFETY', safety.level, safety.details),
            this.generateMitigationMatrix('PHYSICAL', physical.level, physical.details),
            this.generateMitigationMatrix('TIME', time.level, time.details),
            this.generateMitigationMatrix('EXPERIENCE', experienceRisk.overallLevel, experienceRisk.factors),
            this.generateMitigationMatrix('COST', costRisk.overallLevel, costRisk.factors),
        ];
        const overallScore = this.calculateOverallRiskScore({
            safety: safety.score,
            physical: physical.score,
            time: time.score,
            experience: experienceRisk.overallScore,
            cost: costRisk.overallScore,
        });
        const overallLevel = this.scoreToRiskLevel(overallScore);
        const formattedSummary = this.formatRiskSummary({
            safety,
            physical,
            time,
            experience: experienceRisk,
            cost: costRisk,
            overallLevel,
        });
        return {
            safety,
            physical,
            time,
            experience: experienceRisk,
            cost: costRisk,
            overallLevel,
            overallScore,
            mitigationMatrix,
            formattedSummary,
        };
    }
    assessBudgetOverrunRisk(route, context) {
        var _a;
        const estimatedCost = this.estimateRouteCost(route, context);
        const budget = (context === null || context === void 0 ? void 0 : context.budget) || 0;
        if (budget === 0) {
            return {
                probability: 0.5,
                estimatedOverrun: estimatedCost * 0.2,
                reasons: ['缺少预算信息，无法准确评估'],
            };
        }
        const overrunAmount = Math.max(0, estimatedCost - budget);
        const probability = overrunAmount > 0 ? Math.min(1.0, overrunAmount / budget) : 0.3;
        const reasons = [];
        if (overrunAmount > 0) {
            reasons.push(`预计成本 ${estimatedCost} 超过预算 ${budget}`);
        }
        if (((_a = route.metadata) === null || _a === void 0 ? void 0 : _a.estimatedCost) && route.metadata.estimatedCost > budget) {
            reasons.push('路线预估成本超过预算');
        }
        return {
            probability,
            estimatedOverrun: overrunAmount,
            reasons: reasons.length > 0 ? reasons : ['预算充足'],
        };
    }
    assessCancellationRisk(route, context) {
        var _a;
        const constraints = route.constraints || {};
        const requiresPermit = constraints.requiresPermit;
        const weatherWindow = (_a = route.riskProfile) === null || _a === void 0 ? void 0 : _a.weatherWindow;
        let probability = 0.1;
        const reasons = [];
        if (weatherWindow) {
            probability = 0.3;
            reasons.push('路线受天气窗口限制');
        }
        if (requiresPermit) {
            probability += 0.2;
            reasons.push('需要许可证，可能因申请失败而取消');
        }
        const estimatedCost = this.estimateRouteCost(route);
        const cancellationFee = estimatedCost * (0.1 + probability * 0.2);
        return {
            probability: Math.min(1.0, probability),
            cancellationFee,
            refundable: probability < 0.5,
            reasons: reasons.length > 0 ? reasons : ['取消风险较低'],
        };
    }
    assessExchangeRateRisk(route, context) {
        const currency = (context === null || context === void 0 ? void 0 : context.currency) || 'USD';
        const estimatedCost = this.estimateRouteCost(route);
        const volatilityMap = {
            USD: 'MEDIUM',
            EUR: 'MEDIUM',
            GBP: 'HIGH',
            JPY: 'MEDIUM',
            CNY: 'LOW',
        };
        const volatility = volatilityMap[currency] || 'MEDIUM';
        const probability = volatility === 'HIGH' ? 0.4 : volatility === 'MEDIUM' ? 0.2 : 0.1;
        const estimatedImpact = estimatedCost * probability * 0.1;
        return {
            probability,
            estimatedImpact,
            currency,
            volatility,
        };
    }
    assessHiddenCosts(route, context) {
        var _a, _b, _c, _d, _e;
        const items = [];
        const travelerCount = (context === null || context === void 0 ? void 0 : context.travelerCount) || 1;
        if (((_a = route.tags) === null || _a === void 0 ? void 0 : _a.includes('自驾')) || ((_b = route.tags) === null || _b === void 0 ? void 0 : _b.includes('driving'))) {
            items.push({
                type: 'PARKING',
                description: '景点停车费',
                estimatedCost: 50 * travelerCount,
                probability: 0.8,
            });
        }
        const signaturePois = route.signaturePois || {};
        const poiCount = ((_c = signaturePois.types) === null || _c === void 0 ? void 0 : _c.length) || 0;
        if (poiCount > 0) {
            items.push({
                type: 'ENTRANCE_FEE',
                description: '部分景点可能需要额外门票',
                estimatedCost: 100 * poiCount * travelerCount,
                probability: 0.6,
            });
        }
        if (((_d = route.tags) === null || _d === void 0 ? void 0 : _d.includes('徒步')) || ((_e = route.tags) === null || _e === void 0 ? void 0 : _e.includes('hiking'))) {
            items.push({
                type: 'EQUIPMENT_RENTAL',
                description: '可能需要租赁装备',
                estimatedCost: 200 * travelerCount,
                probability: 0.4,
            });
        }
        const totalEstimated = items.reduce((sum, item) => sum + item.estimatedCost * item.probability, 0);
        return {
            items,
            totalEstimated,
        };
    }
    assessPeakSeasonSurcharge(route, context) {
        const seasonality = route.seasonality;
        const travelDate = context === null || context === void 0 ? void 0 : context.travelDate;
        if (!travelDate || !(seasonality === null || seasonality === void 0 ? void 0 : seasonality.bestMonths)) {
            return {
                isPeakSeason: false,
                surchargePercentage: 0,
                estimatedAdditionalCost: 0,
            };
        }
        const travelMonth = new Date(travelDate).getMonth() + 1;
        const isPeakSeason = seasonality.bestMonths.includes(travelMonth);
        if (isPeakSeason) {
            const surchargePercentage = 20;
            const baseCost = this.estimateRouteCost(route);
            const estimatedAdditionalCost = baseCost * (surchargePercentage / 100);
            return {
                isPeakSeason: true,
                surchargePercentage,
                estimatedAdditionalCost,
            };
        }
        return {
            isPeakSeason: false,
            surchargePercentage: 0,
            estimatedAdditionalCost: 0,
        };
    }
    calculateCostRiskScore(factors) {
        var _a;
        let score = 0;
        let weights = 0;
        if (factors.budgetOverrun) {
            score += factors.budgetOverrun.probability * 0.3;
            weights += 0.3;
        }
        if (factors.cancellationRisk) {
            score += factors.cancellationRisk.probability * 0.2;
            weights += 0.2;
        }
        if (factors.exchangeRateRisk) {
            const volatilityWeight = factors.exchangeRateRisk.volatility === 'HIGH' ? 0.3 : factors.exchangeRateRisk.volatility === 'MEDIUM' ? 0.2 : 0.1;
            score += factors.exchangeRateRisk.probability * volatilityWeight;
            weights += volatilityWeight;
        }
        if (factors.hiddenCosts && factors.hiddenCosts.totalEstimated > 0) {
            const baseCost = 10000;
            const hiddenCostRatio = Math.min(1.0, factors.hiddenCosts.totalEstimated / baseCost);
            score += hiddenCostRatio * 0.2;
            weights += 0.2;
        }
        if ((_a = factors.peakSeasonSurcharge) === null || _a === void 0 ? void 0 : _a.isPeakSeason) {
            score += (factors.peakSeasonSurcharge.surchargePercentage / 100) * 0.1;
            weights += 0.1;
        }
        return weights > 0 ? score / weights : 0.5;
    }
    generateCostRiskSummary(factors, level) {
        const parts = [];
        if (factors.budgetOverrun && factors.budgetOverrun.probability > 0.5) {
            parts.push(`预算超支风险较高（概率${Math.round(factors.budgetOverrun.probability * 100)}%）`);
        }
        if (factors.cancellationRisk && factors.cancellationRisk.probability > 0.3) {
            parts.push(`存在取消风险（概率${Math.round(factors.cancellationRisk.probability * 100)}%）`);
        }
        if (factors.hiddenCosts && factors.hiddenCosts.totalEstimated > 0) {
            parts.push(`存在隐性成本（约${Math.round(factors.hiddenCosts.totalEstimated)}元）`);
        }
        if (parts.length === 0) {
            return `成本风险${level === 'LOW' ? '较低' : level === 'MEDIUM' ? '中等' : '较高'}`;
        }
        return parts.join('；');
    }
    generateCostRiskRecommendations(factors, level) {
        var _a;
        const recommendations = [];
        if (factors.budgetOverrun && factors.budgetOverrun.probability > 0.5) {
            recommendations.push('建议增加预算缓冲（10-20%）');
            recommendations.push('考虑选择成本较低的替代方案');
        }
        if (factors.cancellationRisk && factors.cancellationRisk.probability > 0.3) {
            recommendations.push('建议购买可退改的机票和住宿');
            recommendations.push('提前了解取消政策');
        }
        if (factors.hiddenCosts && factors.hiddenCosts.totalEstimated > 0) {
            recommendations.push('提前了解可能的额外费用（停车、门票、装备等）');
        }
        if ((_a = factors.peakSeasonSurcharge) === null || _a === void 0 ? void 0 : _a.isPeakSeason) {
            recommendations.push('考虑错峰出行以节省成本');
        }
        if (recommendations.length === 0) {
            recommendations.push('成本风险可控，按计划执行即可');
        }
        return recommendations;
    }
    estimateCostRange(route, factors, context) {
        var _a;
        const base = this.estimateRouteCost(route, context ? { travelerCount: context.travelerCount } : undefined);
        let min = base;
        let max = base;
        if (factors.budgetOverrun) {
            max += factors.budgetOverrun.estimatedOverrun;
        }
        if (factors.hiddenCosts) {
            max += factors.hiddenCosts.totalEstimated;
        }
        if ((_a = factors.peakSeasonSurcharge) === null || _a === void 0 ? void 0 : _a.isPeakSeason) {
            max += factors.peakSeasonSurcharge.estimatedAdditionalCost;
        }
        if (factors.exchangeRateRisk) {
            max += factors.exchangeRateRisk.estimatedImpact;
        }
        return { min, max, base };
    }
    assessCrowdingRisk(route, context) {
        const seasonality = route.seasonality;
        const travelDate = context === null || context === void 0 ? void 0 : context.travelDate;
        if (!travelDate || !(seasonality === null || seasonality === void 0 ? void 0 : seasonality.bestMonths)) {
            return {
                level: 'MEDIUM',
                peakTimes: ['10:00-12:00', '14:00-16:00'],
                estimatedWaitTime: 30,
                impact: '可能需要排队等待',
            };
        }
        const travelMonth = new Date(travelDate).getMonth() + 1;
        const isPeakSeason = seasonality.bestMonths.includes(travelMonth);
        if (isPeakSeason) {
            return {
                level: 'HIGH',
                peakTimes: ['09:00-11:00', '13:00-17:00'],
                estimatedWaitTime: 60,
                impact: '旺季人流较多，可能需要较长时间排队',
            };
        }
        return {
            level: 'LOW',
            peakTimes: ['10:00-12:00'],
            estimatedWaitTime: 15,
            impact: '人流较少，体验较好',
        };
    }
    assessMaintenanceClosureRisk(route, context) {
        const travelDate = context === null || context === void 0 ? void 0 : context.travelDate;
        const probability = 0.1;
        const seasonality = route.seasonality;
        if (travelDate && (seasonality === null || seasonality === void 0 ? void 0 : seasonality.avoidMonths)) {
            const travelMonth = new Date(travelDate).getMonth() + 1;
            if (seasonality.avoidMonths.includes(travelMonth)) {
                return {
                    probability: 0.3,
                    impact: '淡季可能有维护关闭',
                    alternativeOptions: ['查看其他替代路线', '调整出行时间'],
                };
            }
        }
        return {
            probability,
            impact: '维护关闭风险较低',
            alternativeOptions: [],
        };
    }
    assessExpectationGapRisk(route, context) {
        var _a, _b;
        const potentialGaps = [];
        const probability = 0.2;
        const description = route.description || '';
        if (description.length < 100) {
            potentialGaps.push({
                aspect: 'SCENERY',
                description: '路线描述可能不够详细',
                severity: 'MEDIUM',
            });
        }
        const constraints = route.constraints || {};
        if (((_a = constraints.hard) === null || _a === void 0 ? void 0 : _a.requiresStairs) && !((_b = constraints.hard) === null || _b === void 0 ? void 0 : _b.hasElevator)) {
            potentialGaps.push({
                aspect: 'FACILITIES',
                description: '可能需要爬楼梯，无障碍设施可能不足',
                severity: 'MEDIUM',
            });
        }
        return {
            probability: potentialGaps.length > 0 ? Math.min(1.0, probability + potentialGaps.length * 0.1) : probability,
            potentialGaps,
            impact: potentialGaps.length > 0 ? '可能存在预期偏差' : '预期偏差风险较低',
        };
    }
    assessSeasonalExperienceRisk(route, context) {
        var _a;
        const seasonality = route.seasonality;
        const travelDate = context === null || context === void 0 ? void 0 : context.travelDate;
        if (!travelDate || !(seasonality === null || seasonality === void 0 ? void 0 : seasonality.bestMonths)) {
            return {
                currentSeason: '未知',
                optimalSeason: '未知',
                experienceDifference: '无法评估',
                impact: '缺少季节性信息',
            };
        }
        const travelMonth = new Date(travelDate).getMonth() + 1;
        const isBestMonth = seasonality.bestMonths.includes(travelMonth);
        const isAvoidMonth = (_a = seasonality.avoidMonths) === null || _a === void 0 ? void 0 : _a.includes(travelMonth);
        const currentSeason = this.getSeasonName(travelMonth);
        const optimalSeason = seasonality.bestMonths.map(m => this.getSeasonName(m)).join('、');
        if (isBestMonth) {
            return {
                currentSeason,
                optimalSeason,
                experienceDifference: '当前季节为最佳体验时间',
                impact: '体验质量预期良好',
            };
        }
        else if (isAvoidMonth) {
            return {
                currentSeason,
                optimalSeason,
                experienceDifference: '当前季节不适宜',
                impact: '体验质量可能较差',
            };
        }
        else {
            return {
                currentSeason,
                optimalSeason,
                experienceDifference: '当前季节可接受，但非最佳',
                impact: '体验质量中等',
            };
        }
    }
    assessWeatherImpactRisk(route, context) {
        var _a, _b;
        const weatherWindow = (_a = route.riskProfile) === null || _a === void 0 ? void 0 : _a.weatherWindow;
        const weatherWindowMonths = (_b = route.riskProfile) === null || _b === void 0 ? void 0 : _b.weatherWindowMonths;
        if (weatherWindow) {
            return {
                weatherDependent: true,
                weatherSensitivity: 'HIGH',
                impact: '路线受天气影响较大，天气不佳时体验可能显著下降',
            };
        }
        const tags = route.tags || [];
        if (tags.includes('户外') || tags.includes('outdoor')) {
            return {
                weatherDependent: true,
                weatherSensitivity: 'MEDIUM',
                impact: '户外活动受天气影响，建议关注天气预报',
            };
        }
        return {
            weatherDependent: false,
            weatherSensitivity: 'LOW',
            impact: '天气对体验影响较小',
        };
    }
    calculateExperienceRiskScore(factors) {
        let score = 0;
        let weights = 0;
        if (factors.crowdingRisk) {
            const levelScore = factors.crowdingRisk.level === 'HIGH' ? 0.8 : factors.crowdingRisk.level === 'MEDIUM' ? 0.5 : 0.2;
            score += levelScore * 0.3;
            weights += 0.3;
        }
        if (factors.maintenanceClosure) {
            score += factors.maintenanceClosure.probability * 0.2;
            weights += 0.2;
        }
        if (factors.expectationGap) {
            score += factors.expectationGap.probability * 0.2;
            weights += 0.2;
        }
        if (factors.seasonalExperienceRisk) {
            const isOptimal = factors.seasonalExperienceRisk.experienceDifference.includes('最佳');
            const isAvoid = factors.seasonalExperienceRisk.experienceDifference.includes('不适宜');
            const seasonScore = isOptimal ? 0.2 : isAvoid ? 0.8 : 0.5;
            score += seasonScore * 0.2;
            weights += 0.2;
        }
        if (factors.weatherImpactRisk) {
            const sensitivityScore = factors.weatherImpactRisk.weatherSensitivity === 'HIGH' ? 0.7 : factors.weatherImpactRisk.weatherSensitivity === 'MEDIUM' ? 0.4 : 0.2;
            score += sensitivityScore * 0.1;
            weights += 0.1;
        }
        return weights > 0 ? score / weights : 0.5;
    }
    generateExperienceRiskSummary(factors, level) {
        const parts = [];
        if (factors.crowdingRisk && factors.crowdingRisk.level === 'HIGH') {
            parts.push('人流拥挤风险较高');
        }
        if (factors.maintenanceClosure && factors.maintenanceClosure.probability > 0.2) {
            parts.push('存在维护关闭风险');
        }
        if (factors.seasonalExperienceRisk && factors.seasonalExperienceRisk.experienceDifference.includes('不适宜')) {
            parts.push('当前季节不适宜');
        }
        if (parts.length === 0) {
            return `体验风险${level === 'LOW' ? '较低' : level === 'MEDIUM' ? '中等' : '较高'}`;
        }
        return parts.join('；');
    }
    generateExperienceRiskRecommendations(factors, level) {
        var _a;
        const recommendations = [];
        if (factors.crowdingRisk && factors.crowdingRisk.level === 'HIGH') {
            recommendations.push('建议错峰出行，避开高峰时段');
            recommendations.push(`预计等待时间约${factors.crowdingRisk.estimatedWaitTime}分钟`);
        }
        if (factors.maintenanceClosure && factors.maintenanceClosure.probability > 0.2) {
            recommendations.push('提前查询景点开放状态');
            if (factors.maintenanceClosure.alternativeOptions) {
                recommendations.push(...factors.maintenanceClosure.alternativeOptions);
            }
        }
        if (factors.seasonalExperienceRisk && factors.seasonalExperienceRisk.experienceDifference.includes('不适宜')) {
            recommendations.push(`建议在${factors.seasonalExperienceRisk.optimalSeason}出行以获得最佳体验`);
        }
        if ((_a = factors.weatherImpactRisk) === null || _a === void 0 ? void 0 : _a.weatherDependent) {
            recommendations.push('关注天气预报，准备应对天气变化的方案');
        }
        if (recommendations.length === 0) {
            recommendations.push('体验风险可控，按计划执行即可');
        }
        return recommendations;
    }
    assessExpectedExperienceQuality(factors, riskScore) {
        const qualityScore = 1 - riskScore;
        let description;
        if (qualityScore >= 0.8) {
            description = '预期体验质量优秀';
        }
        else if (qualityScore >= 0.6) {
            description = '预期体验质量良好';
        }
        else if (qualityScore >= 0.4) {
            description = '预期体验质量中等';
        }
        else {
            description = '预期体验质量可能较差';
        }
        return { score: qualityScore, description };
    }
    selectMitigationStrategies(riskCategory, riskLevel) {
        const strategies = [];
        if (riskCategory === 'SAFETY') {
            if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
                strategies.push('AVOID', 'PREVENT');
            }
            else {
                strategies.push('PREVENT', 'MITIGATE');
            }
        }
        else if (riskCategory === 'COST') {
            strategies.push('PREVENT', 'MITIGATE', 'TRANSFER');
        }
        else if (riskCategory === 'EXPERIENCE') {
            strategies.push('MITIGATE', 'ACCEPT');
        }
        else {
            if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
                strategies.push('PREVENT', 'MITIGATE');
            }
            else {
                strategies.push('MITIGATE', 'ACCEPT');
            }
        }
        return strategies;
    }
    generateMitigationMeasures(riskCategory, riskLevel, riskDetails) {
        const measures = [];
        if (riskCategory === 'COST') {
            if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
                measures.push({
                    strategy: 'PREVENT',
                    description: '提前规划预算，增加缓冲',
                    actions: ['设置预算上限', '预留10-20%缓冲', '选择可退改选项'],
                    expectedEffect: '降低预算超支风险',
                    implementationDifficulty: 'LOW',
                    costImpact: 0,
                });
                measures.push({
                    strategy: 'TRANSFER',
                    description: '购买旅行保险',
                    actions: ['购买取消险', '购买延误险'],
                    expectedEffect: '转移部分成本风险',
                    implementationDifficulty: 'LOW',
                    costImpact: 200,
                });
            }
        }
        else if (riskCategory === 'EXPERIENCE') {
            if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
                measures.push({
                    strategy: 'MITIGATE',
                    description: '错峰出行，避开高峰',
                    actions: ['选择非旺季出行', '避开高峰时段', '提前预订'],
                    expectedEffect: '降低拥挤风险，提升体验',
                    implementationDifficulty: 'MEDIUM',
                    costImpact: 0,
                });
            }
        }
        measures.push({
            strategy: 'ACCEPT',
            description: '接受风险，准备应对方案',
            actions: ['了解风险详情', '准备备选方案', '保持灵活性'],
            expectedEffect: '降低风险影响',
            implementationDifficulty: 'LOW',
            costImpact: 0,
        });
        return measures;
    }
    determinePriority(riskCategory, riskLevel) {
        if (riskCategory === 'SAFETY') {
            return 'HIGH';
        }
        if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
            return 'HIGH';
        }
        if (riskLevel === 'MEDIUM') {
            return 'MEDIUM';
        }
        return 'LOW';
    }
    assessSafetyRisk(route) {
        const riskProfile = route.riskProfile || {};
        const details = [];
        if (riskProfile.altitudeSickness) {
            details.push('存在高反风险');
        }
        if (riskProfile.roadClosure) {
            details.push('存在封路风险');
        }
        if (riskProfile.weatherWindow) {
            details.push('受天气窗口限制');
        }
        const hasRisk = details.length > 0;
        return {
            level: hasRisk ? 'MEDIUM' : 'LOW',
            score: hasRisk ? 0.5 : 0.2,
            details,
        };
    }
    assessPhysicalRisk(route) {
        var _a, _b;
        const constraints = route.constraints || {};
        const details = [];
        if (((_a = constraints.hard) === null || _a === void 0 ? void 0 : _a.maxElevationM) && constraints.hard.maxElevationM > 3000) {
            details.push('高海拔路线');
        }
        if (((_b = constraints.hard) === null || _b === void 0 ? void 0 : _b.maxSlopePct) && constraints.hard.maxSlopePct > 20) {
            details.push('陡坡路线');
        }
        const hasRisk = details.length > 0;
        return {
            level: hasRisk ? 'MEDIUM' : 'LOW',
            score: hasRisk ? 0.4 : 0.2,
            details,
        };
    }
    assessTimeRisk(route) {
        const details = [];
        const riskProfile = route.riskProfile || {};
        if (riskProfile.ferryDependent) {
            details.push('依赖渡轮，时间可能不稳定');
        }
        if (riskProfile.weatherWindow) {
            details.push('受天气窗口限制，可能延误');
        }
        const hasRisk = details.length > 0;
        return {
            level: hasRisk ? 'MEDIUM' : 'LOW',
            score: hasRisk ? 0.3 : 0.2,
            details,
        };
    }
    calculateOverallRiskScore(scores) {
        return (scores.safety * 0.3 +
            scores.physical * 0.2 +
            scores.time * 0.15 +
            scores.experience * 0.2 +
            scores.cost * 0.15);
    }
    formatRiskSummary(risks) {
        const emojiMap = {
            LOW: '🟢',
            MEDIUM: '🟡',
            HIGH: '🟠',
            CRITICAL: '🔴',
        };
        const levelTextMap = {
            LOW: '低',
            MEDIUM: '中',
            HIGH: '高',
            CRITICAL: '极高',
        };
        return [
            `${emojiMap[risks.safety.level]} 安全风险：${levelTextMap[risks.safety.level]}`,
            `${emojiMap[risks.physical.level]} 体力风险：${levelTextMap[risks.physical.level]}`,
            `${emojiMap[risks.time.level]} 时间风险：${levelTextMap[risks.time.level]}`,
            `${emojiMap[risks.experience.overallLevel]} 体验风险：${levelTextMap[risks.experience.overallLevel]}`,
            `${emojiMap[risks.cost.overallLevel]} 成本风险：${levelTextMap[risks.cost.overallLevel]}`,
            `\n总体风险：${emojiMap[risks.overallLevel]} ${levelTextMap[risks.overallLevel]}`,
        ].join('\n');
    }
    scoreToRiskLevel(score) {
        if (score >= 0.8)
            return 'CRITICAL';
        if (score >= 0.6)
            return 'HIGH';
        if (score >= 0.4)
            return 'MEDIUM';
        return 'LOW';
    }
    estimateRouteCost(route, context) {
        const travelerCount = (context === null || context === void 0 ? void 0 : context.travelerCount) || 1;
        const metadata = route.metadata || {};
        if (metadata.estimatedCost) {
            return metadata.estimatedCost * travelerCount;
        }
        const estimatedDuration = metadata.estimatedDuration || 7;
        const baseDailyCost = 1000;
        return baseDailyCost * estimatedDuration * travelerCount;
    }
    getSeasonName(month) {
        if (month >= 3 && month <= 5)
            return '春季';
        if (month >= 6 && month <= 8)
            return '夏季';
        if (month >= 9 && month <= 11)
            return '秋季';
        return '冬季';
    }
};
exports.EnhancedRiskAssessmentService = EnhancedRiskAssessmentService;
exports.EnhancedRiskAssessmentService = EnhancedRiskAssessmentService = EnhancedRiskAssessmentService_1 = __decorate([
    (0, common_1.Injectable)()
], EnhancedRiskAssessmentService);
//# sourceMappingURL=enhanced-risk-assessment.service.js.map