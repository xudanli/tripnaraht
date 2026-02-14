"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var EvaluationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvaluationService = void 0;
const common_1 = require("@nestjs/common");
let EvaluationService = EvaluationService_1 = class EvaluationService {
    constructor() {
        this.logger = new common_1.Logger(EvaluationService_1.name);
    }
    evaluatePlan(state, plan, constraintResult, diff) {
        return {
            executability: this.calculateExecutability(constraintResult),
            stability: this.calculateStability(plan, diff),
            experience: this.calculateExperience(state, plan),
            cost: this.calculateCost(state, plan),
        };
    }
    calculateExecutability(constraintResult) {
        const { violations, summary } = constraintResult;
        const totalSlots = violations.length > 0
            ? violations.length
            : 1;
        return {
            violationsCount: violations.length,
            errorCount: summary.errorCount,
            warningCount: summary.warningCount,
            executabilityRate: summary.errorCount === 0 ? 1.0 : 0.0,
        };
    }
    calculateStability(plan, diff) {
        if (!diff) {
            return {
                editDistanceScore: 0,
                changedSlotsRatio: 0,
                stabilityScore: 1.0,
            };
        }
        const totalSlots = plan.days.reduce((sum, day) => sum + day.timeSlots.length, 0);
        const changedSlotsRatio = totalSlots > 0 ? diff.summary.totalChanged / totalSlots : 0;
        const stabilityScore = Math.max(0, 1 - (diff.summary.editDistanceScore / 100) - changedSlotsRatio * 0.5);
        return {
            editDistanceScore: diff.summary.editDistanceScore,
            changedSlotsRatio,
            stabilityScore: Math.min(1.0, Math.max(0, stabilityScore)),
        };
    }
    calculateExperience(state, plan) {
        let totalActiveMinutes = 0;
        let totalTravelMinutes = 0;
        const dailyActiveMinutes = [];
        const activityTypes = new Set();
        const coordinates = [];
        for (const day of plan.days) {
            let dayActiveMinutes = 0;
            for (const slot of day.timeSlots) {
                if (slot.type !== 'rest' && slot.type !== 'transport') {
                    const duration = slot.endTime && slot.time
                        ? this.timeDiffMinutes(slot.time, slot.endTime)
                        : 60;
                    dayActiveMinutes += duration;
                    totalActiveMinutes += duration;
                    activityTypes.add(slot.type);
                }
                if (slot.travelLegFromPrev) {
                    totalTravelMinutes += slot.travelLegFromPrev.durationMin;
                }
                if (slot.coordinates) {
                    coordinates.push(slot.coordinates);
                }
            }
            dailyActiveMinutes.push(dayActiveMinutes);
        }
        const avgDailyActive = dailyActiveMinutes.length > 0
            ? dailyActiveMinutes.reduce((a, b) => a + b, 0) / dailyActiveMinutes.length
            : 0;
        const variance = dailyActiveMinutes.length > 0
            ? dailyActiveMinutes.reduce((sum, val) => sum + Math.pow(val - avgDailyActive, 2), 0) / dailyActiveMinutes.length
            : 0;
        const stdDev = Math.sqrt(variance);
        const rhythmBalance = avgDailyActive > 0
            ? Math.max(0, 1 - stdDev / avgDailyActive)
            : 0;
        const diversity = activityTypes.size / Math.max(1, totalActiveMinutes / 60);
        const backtrackRatio = this.calculateBacktrackRatio(coordinates);
        return {
            rhythmBalance: Math.min(1.0, rhythmBalance),
            diversity: Math.min(1.0, diversity),
            backtrackRatio,
            totalActiveMinutes,
            totalTravelMinutes,
        };
    }
    calculateBacktrackRatio(coordinates) {
        if (coordinates.length < 3)
            return 0;
        let backtrackDistance = 0;
        let totalDistance = 0;
        for (let i = 1; i < coordinates.length; i++) {
            const prev = coordinates[i - 1];
            const curr = coordinates[i];
            const dist = this.calculateDistance(prev, curr);
            totalDistance += dist;
            if (i > 1) {
                const prevDist = this.calculateDistance(coordinates[i - 2], coordinates[i - 1]);
                if (dist < prevDist * 0.3) {
                    backtrackDistance += dist;
                }
            }
        }
        return totalDistance > 0 ? backtrackDistance / totalDistance : 0;
    }
    calculateCost(state, plan) {
        var _a;
        const estimatedTotalCost = ((_a = plan.metrics) === null || _a === void 0 ? void 0 : _a.estTotalCost) || 0;
        const costPerDay = state.context.durationDays > 0
            ? estimatedTotalCost / state.context.durationDays
            : 0;
        const budgetUtilization = state.context.budget
            ? Math.min(1.0, estimatedTotalCost / state.context.budget.amount)
            : 0;
        return {
            estimatedTotalCost,
            costPerDay,
            budgetUtilization,
        };
    }
    async replayWithConfig(state, config, planner) {
        this.logger.debug(`Replaying with config: ${JSON.stringify(config)}`);
        const { plan, log } = await planner(state, config);
        const constraintChecker = new (await Promise.resolve().then(() => __importStar(require('../constraints'))))
            .ConstraintChecker();
        const constraintResult = await constraintChecker.checkPlan(state, plan);
        const metrics = this.evaluatePlan(state, plan, constraintResult);
        return {
            config,
            plan,
            metrics,
            log,
            timestamp: new Date().toISOString(),
        };
    }
    async batchReplay(state, configs, planner) {
        const results = [];
        for (const config of configs) {
            try {
                const result = await this.replayWithConfig(state, config, planner);
                results.push(result);
            }
            catch (error) {
                this.logger.error(`Replay failed for config ${JSON.stringify(config)}:`, error);
            }
        }
        return results;
    }
    compareReplayResults(results) {
        if (results.length === 0) {
            return {
                bestByExecutability: null,
                bestByStability: null,
                bestByExperience: null,
                bestByCost: null,
                summary: [],
            };
        }
        const bestByExecutability = results.reduce((best, current) => current.metrics.executability.executabilityRate >
            best.metrics.executability.executabilityRate
            ? current
            : best);
        const bestByStability = results.reduce((best, current) => current.metrics.stability.stabilityScore >
            best.metrics.stability.stabilityScore
            ? current
            : best);
        const bestByExperience = results.reduce((best, current) => {
            const currentScore = current.metrics.experience.rhythmBalance *
                current.metrics.experience.diversity *
                (1 - current.metrics.experience.backtrackRatio);
            const bestScore = best.metrics.experience.rhythmBalance *
                best.metrics.experience.diversity *
                (1 - best.metrics.experience.backtrackRatio);
            return currentScore > bestScore ? current : best;
        });
        const bestByCost = results.reduce((best, current) => current.metrics.cost.budgetUtilization <
            best.metrics.cost.budgetUtilization
            ? current
            : best);
        const summary = results.map(r => ({
            config: r.config,
            executabilityRate: r.metrics.executability.executabilityRate,
            stabilityScore: r.metrics.stability.stabilityScore,
            experienceScore: r.metrics.experience.rhythmBalance *
                r.metrics.experience.diversity *
                (1 - r.metrics.experience.backtrackRatio),
            costUtilization: r.metrics.cost.budgetUtilization,
        }));
        return {
            bestByExecutability,
            bestByStability,
            bestByExperience,
            bestByCost,
            summary,
        };
    }
    timeDiffMinutes(start, end) {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        return (eh - sh) * 60 + (em - sm);
    }
    calculateDistance(from, to) {
        const R = 6371;
        const dLat = this.toRad(to.lat - from.lat);
        const dLon = this.toRad(to.lng - from.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(from.lat)) *
                Math.cos(this.toRad(to.lat)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(degrees) {
        return (degrees * Math.PI) / 180;
    }
};
exports.EvaluationService = EvaluationService;
exports.EvaluationService = EvaluationService = EvaluationService_1 = __decorate([
    (0, common_1.Injectable)()
], EvaluationService);
//# sourceMappingURL=evaluation.service.js.map