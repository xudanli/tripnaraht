"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var LearningService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearningService = void 0;
const common_1 = require("@nestjs/common");
let LearningService = LearningService_1 = class LearningService {
    constructor() {
        this.logger = new common_1.Logger(LearningService_1.name);
    }
    learnFromLogs(logs, userFeedback) {
        if (logs.length === 0) {
            return {
                policyAdjustments: {},
                confidence: 0,
                sampleSize: 0,
                recommendations: ['需要更多数据才能学习'],
            };
        }
        const metrics = this.calculateMetrics(logs, userFeedback);
        const patterns = this.analyzePatterns(logs, metrics);
        const adjustments = this.generateAdjustments(patterns, metrics);
        const confidence = this.calculateConfidence(logs.length, metrics);
        const recommendations = this.generateRecommendations(patterns, metrics);
        return {
            policyAdjustments: adjustments,
            confidence,
            sampleSize: logs.length,
            recommendations,
        };
    }
    calculateMetrics(logs, userFeedback) {
        var _a;
        const feedbackMap = new Map((userFeedback === null || userFeedback === void 0 ? void 0 : userFeedback.map(f => [f.logId, f])) || []);
        let adoptedCount = 0;
        let totalStability = 0;
        let totalExecutability = 0;
        let totalSatisfaction = 0;
        let satisfactionCount = 0;
        for (const log of logs) {
            const feedback = feedbackMap.get(log.runId);
            if (!feedback || feedback.accepted) {
                adoptedCount++;
            }
            if (log.diff) {
                const stability = 1 - log.diff.editDistanceScore / 100;
                totalStability += Math.max(0, Math.min(1, stability));
            }
            const violationCount = ((_a = log.violations) === null || _a === void 0 ? void 0 : _a.length) || 0;
            const executability = violationCount === 0 ? 1.0 : 0.0;
            totalExecutability += executability;
            if ((feedback === null || feedback === void 0 ? void 0 : feedback.satisfaction) !== undefined) {
                totalSatisfaction += feedback.satisfaction;
                satisfactionCount++;
            }
        }
        const sampleSize = logs.length;
        return {
            adoptionRate: sampleSize > 0 ? adoptedCount / sampleSize : 0,
            stabilityScore: sampleSize > 0 ? totalStability / sampleSize : 0,
            executabilityRate: sampleSize > 0 ? totalExecutability / sampleSize : 0,
            satisfactionScore: satisfactionCount > 0
                ? totalSatisfaction / satisfactionCount
                : undefined,
        };
    }
    analyzePatterns(logs, metrics) {
        const patterns = {};
        const triggerCounts = {};
        for (const log of logs) {
            triggerCounts[log.trigger] = (triggerCounts[log.trigger] || 0) + 1;
        }
        patterns.commonTriggers = Object.entries(triggerCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([trigger]) => trigger);
        const strategyCounts = {};
        for (const log of logs) {
            for (const strategy of log.strategyMix || []) {
                strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
            }
        }
        patterns.commonStrategies = Object.entries(strategyCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([strategy]) => strategy);
        const violationCounts = {};
        for (const log of logs) {
            for (const violation of log.violations || []) {
                violationCounts[violation.code] =
                    (violationCounts[violation.code] || 0) + 1;
            }
        }
        patterns.commonViolations = Object.entries(violationCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([code]) => code);
        return patterns;
    }
    generateAdjustments(patterns, metrics) {
        const adjustments = {};
        if (metrics.executabilityRate < 0.8) {
            adjustments.objectiveWeights = {
                satisfaction: 1.0,
                violationRisk: 1.5,
                robustness: 1.0,
                cost: 1.0,
            };
        }
        if (metrics.stabilityScore < 0.7) {
            if (!adjustments.objectiveWeights) {
                adjustments.objectiveWeights = {
                    satisfaction: 1.0,
                    violationRisk: 1.0,
                    robustness: 1.3,
                    cost: 1.0,
                };
            }
            else {
                adjustments.objectiveWeights.robustness = 1.3;
            }
        }
        if (metrics.adoptionRate < 0.6) {
            this.logger.warn(`Low adoption rate: ${metrics.adoptionRate}, consider strategy adjustment`);
        }
        return adjustments;
    }
    calculateConfidence(sampleSize, metrics) {
        const sizeConfidence = Math.min(1.0, sampleSize / 100);
        const consistency = (metrics.adoptionRate +
            metrics.stabilityScore +
            metrics.executabilityRate) /
            3;
        return (sizeConfidence * 0.6 + consistency * 0.4);
    }
    generateRecommendations(patterns, metrics) {
        const recommendations = [];
        if (metrics.executabilityRate < 0.8) {
            recommendations.push('建议增加约束校验的严格程度，提高计划可执行性');
        }
        if (metrics.stabilityScore < 0.7) {
            recommendations.push('建议增加计划稳定性权重，减少频繁调整');
        }
        if (patterns.commonViolations && patterns.commonViolations.length > 0) {
            recommendations.push(`常见问题：${patterns.commonViolations.join('、')}，建议优化相关策略`);
        }
        if (recommendations.length === 0) {
            recommendations.push('当前策略表现良好，无需调整');
        }
        return recommendations;
    }
};
exports.LearningService = LearningService;
exports.LearningService = LearningService = LearningService_1 = __decorate([
    (0, common_1.Injectable)()
], LearningService);
//# sourceMappingURL=learning.service.js.map