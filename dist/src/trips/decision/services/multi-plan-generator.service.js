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
var MultiPlanGenerator_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiPlanGenerator = void 0;
const common_1 = require("@nestjs/common");
const trip_decision_engine_service_1 = require("../trip-decision-engine.service");
const constraint_checker_1 = require("../constraints/constraint-checker");
let MultiPlanGenerator = MultiPlanGenerator_1 = class MultiPlanGenerator {
    constructor(decisionEngine, constraintChecker) {
        this.decisionEngine = decisionEngine;
        this.constraintChecker = constraintChecker;
        this.logger = new common_1.Logger(MultiPlanGenerator_1.name);
    }
    async generateMultiplePlans(state, constraints) {
        if (!this.decisionEngine) {
            throw new Error('TripDecisionEngineService is required for multi-plan generation');
        }
        const variants = [];
        const conservativePlan = await this.generatePlanWithStrategy(state, constraints, 'conservative');
        if (conservativePlan) {
            variants.push(conservativePlan);
        }
        const balancedPlan = await this.generatePlanWithStrategy(state, constraints, 'balanced');
        if (balancedPlan) {
            variants.push(balancedPlan);
        }
        const aggressivePlan = await this.generatePlanWithStrategy(state, constraints, 'aggressive');
        if (aggressivePlan) {
            variants.push(aggressivePlan);
        }
        this.logger.log(`生成了 ${variants.length} 个方案变体`);
        return variants;
    }
    async generatePlanWithStrategy(state, constraints, strategy) {
        var _a;
        try {
            const strategyConstraints = this.adjustConstraintsForStrategy(constraints, strategy);
            const stateCopy = this.cloneState(state);
            if (this.decisionEngine) {
                this.decisionEngine.injectConstraints(stateCopy, strategyConstraints);
            }
            const { plan, log } = await this.decisionEngine.generatePlan(stateCopy);
            let feasibility = {
                isValid: true,
                violations: 0,
                conflicts: 0,
            };
            if (this.constraintChecker) {
                const checkResult = await this.constraintChecker.checkPlan(stateCopy, plan);
                feasibility = {
                    isValid: checkResult.isValid,
                    violations: checkResult.summary.errorCount + checkResult.summary.warningCount,
                    conflicts: ((_a = checkResult.conflicts) === null || _a === void 0 ? void 0 : _a.conflicts.length) || 0,
                };
            }
            const score = this.scorePlan(plan, constraints, strategy, stateCopy);
            const tradeoffs = this.analyzeTradeoffs(plan, constraints, strategy, stateCopy);
            return {
                id: strategy,
                plan,
                score,
                tradeoffs,
                feasibility,
            };
        }
        catch (error) {
            this.logger.warn(`生成${strategy}方案失败: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
    adjustConstraintsForStrategy(constraints, strategy) {
        const adjusted = JSON.parse(JSON.stringify(constraints));
        if (adjusted.soft_constraints) {
            if (strategy === 'conservative') {
                if (adjusted.soft_constraints.pace) {
                    adjusted.soft_constraints.pace.weight *= 0.7;
                }
                if (adjusted.soft_constraints.comfort_level) {
                    adjusted.soft_constraints.comfort_level.weight *= 0.7;
                }
                if (adjusted.soft_constraints.scenery) {
                    adjusted.soft_constraints.scenery.weight *= 0.7;
                }
            }
            else if (strategy === 'aggressive') {
                if (adjusted.soft_constraints.pace) {
                    adjusted.soft_constraints.pace.weight = Math.min(1.0, adjusted.soft_constraints.pace.weight * 1.3);
                }
                if (adjusted.soft_constraints.comfort_level) {
                    adjusted.soft_constraints.comfort_level.weight = Math.min(1.0, adjusted.soft_constraints.comfort_level.weight * 1.3);
                }
                if (adjusted.soft_constraints.scenery) {
                    adjusted.soft_constraints.scenery.weight = Math.min(1.0, adjusted.soft_constraints.scenery.weight * 1.3);
                }
            }
        }
        return adjusted;
    }
    scorePlan(plan, constraints, strategy, state) {
        const satisfaction = this.calculateSatisfactionScore(plan, constraints, state);
        const violationRisk = this.calculateViolationRiskScore(plan, constraints, state);
        const robustness = this.calculateRobustnessScore(plan, constraints, state);
        const cost = this.calculateCostScore(plan, constraints, state);
        const weights = this.getStrategyWeights(strategy);
        const total = satisfaction * weights.satisfaction +
            violationRisk * weights.violationRisk +
            robustness * weights.robustness +
            cost * weights.cost;
        return {
            total,
            breakdown: {
                satisfaction,
                violationRisk,
                robustness,
                cost,
            },
        };
    }
    calculateSatisfactionScore(plan, constraints, state) {
        var _a, _b, _c;
        let score = 0.5;
        if ((_a = constraints.soft_constraints) === null || _a === void 0 ? void 0 : _a.pace) {
            const preferredPace = constraints.soft_constraints.pace.preference;
            const actualPace = this.calculateActualPace(plan);
            const paceMatch = this.matchPace(preferredPace, actualPace);
            score += paceMatch * constraints.soft_constraints.pace.weight * 0.2;
        }
        if ((_b = constraints.soft_constraints) === null || _b === void 0 ? void 0 : _b.scenery) {
            const preferredScenery = constraints.soft_constraints.scenery.nature_vs_city;
            const actualScenery = this.calculateActualScenery(plan, state);
            const sceneryMatch = this.matchScenery(preferredScenery, actualScenery);
            score += sceneryMatch * constraints.soft_constraints.scenery.weight * 0.2;
        }
        if ((_c = constraints.soft_constraints) === null || _c === void 0 ? void 0 : _c.photography) {
            const photographyScore = this.calculatePhotographyScore(plan, state);
            score += photographyScore * constraints.soft_constraints.photography.importance * 0.1;
        }
        return Math.min(1.0, score);
    }
    calculateViolationRiskScore(plan, constraints, state) {
        let risk = 0.3;
        const bookingRequiredCount = plan.days.reduce((sum, day) => sum +
            day.timeSlots.filter(slot => {
                const candidate = this.findCandidate(slot.poiId, day.date, state);
                return candidate === null || candidate === void 0 ? void 0 : candidate.requiresBooking;
            }).length, 0);
        if (bookingRequiredCount > plan.days.length * 2) {
            risk += 0.2;
        }
        return Math.max(0, 1.0 - risk);
    }
    calculateRobustnessScore(plan, constraints, state) {
        let robustness = 0.5;
        const indoorCount = plan.days.reduce((sum, day) => sum +
            day.timeSlots.filter(slot => {
                const candidate = this.findCandidate(slot.poiId, day.date, state);
                return (candidate === null || candidate === void 0 ? void 0 : candidate.indoorOutdoor) === 'indoor';
            }).length, 0);
        const totalActivities = plan.days.reduce((sum, day) => sum + day.timeSlots.filter(s => s.type !== 'rest' && s.type !== 'transport').length, 0);
        if (totalActivities > 0) {
            const indoorRatio = indoorCount / totalActivities;
            robustness += indoorRatio * 0.3;
        }
        return Math.min(1.0, robustness);
    }
    calculateCostScore(plan, constraints, state) {
        var _a, _b;
        if (!((_a = constraints.hard_constraints) === null || _a === void 0 ? void 0 : _a.budget)) {
            return 0.5;
        }
        const budgetMax = constraints.hard_constraints.budget.max;
        const estimatedCost = ((_b = plan.metrics) === null || _b === void 0 ? void 0 : _b.estTotalCost) || 0;
        if (estimatedCost === 0) {
            return 0.5;
        }
        const costRatio = estimatedCost / budgetMax;
        if (costRatio <= 0.8) {
            return 1.0;
        }
        else if (costRatio <= 1.0) {
            return 1.0 - (costRatio - 0.8) * 2.5;
        }
        else {
            return Math.max(0, 1.0 - (costRatio - 1.0) * 5);
        }
    }
    getStrategyWeights(strategy) {
        switch (strategy) {
            case 'conservative':
                return {
                    satisfaction: 0.8,
                    violationRisk: 1.5,
                    robustness: 1.2,
                    cost: 1.0,
                };
            case 'aggressive':
                return {
                    satisfaction: 1.5,
                    violationRisk: 0.8,
                    robustness: 1.0,
                    cost: 0.9,
                };
            case 'balanced':
            default:
                return {
                    satisfaction: 1.2,
                    violationRisk: 1.0,
                    robustness: 1.0,
                    cost: 1.0,
                };
        }
    }
    analyzeTradeoffs(plan, constraints, strategy, state) {
        var _a, _b, _c;
        const tradeoffs = [];
        if ((_a = constraints.soft_constraints) === null || _a === void 0 ? void 0 : _a.pace) {
            const actualPace = this.calculateActualPace(plan);
            const preferredPace = constraints.soft_constraints.pace.preference;
            if (actualPace !== preferredPace) {
                tradeoffs.push({
                    constraint: 'pace',
                    sacrificed: `节奏从 ${preferredPace} 调整为 ${actualPace}`,
                    reason: strategy === 'conservative'
                        ? '为了满足硬约束（时间/预算）'
                        : strategy === 'aggressive'
                            ? '为了最大化体验密度'
                            : '为了平衡各项约束',
                    can_adjust: true,
                    impact_score: 0.6,
                });
            }
        }
        if ((_b = constraints.soft_constraints) === null || _b === void 0 ? void 0 : _b.comfort_level) {
            const preferredQuality = constraints.soft_constraints.comfort_level.hotel_quality;
            const actualQuality = 'medium';
            if (actualQuality !== preferredQuality && preferredQuality === 'high') {
                tradeoffs.push({
                    constraint: 'comfort_level',
                    sacrificed: `住宿品质从 ${preferredQuality} 调整为 ${actualQuality}`,
                    reason: '为了满足预算约束',
                    can_adjust: true,
                    impact_score: 0.7,
                });
            }
        }
        if ((_c = constraints.soft_constraints) === null || _c === void 0 ? void 0 : _c.scenery) {
            const preferredScenery = constraints.soft_constraints.scenery.nature_vs_city;
            const actualScenery = this.calculateActualScenery(plan, state);
            if (actualScenery !== preferredScenery && preferredScenery !== 'balanced') {
                tradeoffs.push({
                    constraint: 'scenery',
                    sacrificed: `风景偏好从 ${preferredScenery} 调整为 ${actualScenery}`,
                    reason: '为了满足其他约束（时间/可达性）',
                    can_adjust: true,
                    impact_score: 0.5,
                });
            }
        }
        return tradeoffs;
    }
    calculateActualPace(plan) {
        const avgActivitiesPerDay = plan.days.reduce((sum, day) => sum + day.timeSlots.filter(s => s.type !== 'rest' && s.type !== 'transport').length, 0) / plan.days.length;
        if (avgActivitiesPerDay <= 2) {
            return 'relaxed';
        }
        else if (avgActivitiesPerDay <= 4) {
            return 'moderate';
        }
        else {
            return 'intense';
        }
    }
    matchPace(preferred, actual) {
        if (preferred === actual) {
            return 1.0;
        }
        const paceOrder = ['relaxed', 'moderate', 'intense'];
        const preferredIndex = paceOrder.indexOf(preferred);
        const actualIndex = paceOrder.indexOf(actual);
        const distance = Math.abs(preferredIndex - actualIndex);
        return distance === 1 ? 0.7 : 0.3;
    }
    calculateActualScenery(plan, state) {
        const natureTypes = ['nature', 'sightseeing'];
        const cityTypes = ['museum', 'food', 'shopping'];
        let natureCount = 0;
        let cityCount = 0;
        for (const day of plan.days) {
            for (const slot of day.timeSlots) {
                if (slot.poiId) {
                    const candidate = this.findCandidate(slot.poiId, day.date, state);
                    if (candidate) {
                        if (natureTypes.includes(candidate.type)) {
                            natureCount++;
                        }
                        else if (cityTypes.includes(candidate.type)) {
                            cityCount++;
                        }
                    }
                }
            }
        }
        if (natureCount > cityCount * 1.5) {
            return 'nature';
        }
        else if (cityCount > natureCount * 1.5) {
            return 'city';
        }
        else {
            return 'balanced';
        }
    }
    matchScenery(preferred, actual) {
        if (preferred === 'balanced' || actual === 'balanced') {
            return 0.8;
        }
        return preferred === actual ? 1.0 : 0.5;
    }
    calculatePhotographyScore(plan, state) {
        const photographyTypes = ['nature', 'sightseeing'];
        let photographyCount = 0;
        for (const day of plan.days) {
            for (const slot of day.timeSlots) {
                if (slot.poiId) {
                    const candidate = this.findCandidate(slot.poiId, day.date, state);
                    if (candidate && photographyTypes.includes(candidate.type)) {
                        photographyCount++;
                    }
                }
            }
        }
        const totalActivities = plan.days.reduce((sum, day) => sum + day.timeSlots.filter(s => s.type !== 'rest' && s.type !== 'transport').length, 0);
        return totalActivities > 0 ? Math.min(1.0, photographyCount / totalActivities * 2) : 0.5;
    }
    findCandidate(poiId, date, state) {
        if (!poiId)
            return undefined;
        const candidates = state.candidatesByDate[date] || [];
        return candidates.find(c => c.id === poiId);
    }
    cloneState(state) {
        return JSON.parse(JSON.stringify(state));
    }
};
exports.MultiPlanGenerator = MultiPlanGenerator;
exports.MultiPlanGenerator = MultiPlanGenerator = MultiPlanGenerator_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [trip_decision_engine_service_1.TripDecisionEngineService,
        constraint_checker_1.ConstraintChecker])
], MultiPlanGenerator);
//# sourceMappingURL=multi-plan-generator.service.js.map