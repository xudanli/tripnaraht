"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var QualityAssessorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QualityAssessorService = void 0;
const common_1 = require("@nestjs/common");
let QualityAssessorService = QualityAssessorService_1 = class QualityAssessorService {
    constructor() {
        this.logger = new common_1.Logger(QualityAssessorService_1.name);
    }
    async assessDecisionQuality(log, plan, conflicts, feedbacks) {
        this.logger.debug(`[质量评估] 评估决策质量: runId=${log.runId}`);
        const planQualityScore = this.assessPlanQuality(plan, log);
        const conflictExplanationQualityScore = this.assessConflictExplanationQuality(conflicts, feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.conflictFeedbacks);
        const tradeoffOptionsQualityScore = this.assessTradeoffOptionsQuality(conflicts, feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.conflictFeedbacks);
        const decisionSpeedScore = this.assessDecisionSpeed(log);
        const userSatisfactionScore = this.assessUserSatisfaction(feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.decisionQualityFeedback, feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.planVariantFeedbacks);
        const overallQualityScore = this.calculateOverallQualityScore({
            planQualityScore,
            conflictExplanationQualityScore,
            tradeoffOptionsQualityScore,
            decisionSpeedScore,
            userSatisfactionScore,
        });
        const qualityGrade = this.determineQualityGrade(overallQualityScore);
        const improvementSuggestions = this.generateImprovementSuggestions({
            planQualityScore,
            conflictExplanationQualityScore,
            tradeoffOptionsQualityScore,
            decisionSpeedScore,
            userSatisfactionScore,
            overallQualityScore,
        });
        return {
            metrics: {
                planQualityScore,
                conflictExplanationQualityScore,
                tradeoffOptionsQualityScore,
                decisionSpeedScore,
                userSatisfactionScore,
                overallQualityScore,
            },
            qualityGrade,
            improvementSuggestions,
            assessedAt: new Date(),
        };
    }
    assessPlanQuality(plan, log) {
        if (!plan) {
            return 0;
        }
        let score = 0.5;
        if (log.violations && log.violations.length > 0) {
            score -= 0.2 * Math.min(log.violations.length / 5, 1);
        }
        if (plan.days && plan.days.length > 0) {
            const totalSlots = plan.days.reduce((sum, day) => { var _a; return sum + (((_a = day.timeSlots) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0);
            if (totalSlots > 0) {
                score += 0.2;
            }
        }
        if (log.explanation && log.explanation.length > 0) {
            score += 0.1;
        }
        if (log.strategyMix && log.strategyMix.length > 0) {
            score += 0.1;
        }
        if (log.predictedImpact) {
            score += 0.1;
        }
        return Math.max(0, Math.min(1, score));
    }
    assessConflictExplanationQuality(conflicts, conflictFeedbacks) {
        if (conflicts.length === 0) {
            return 1.0;
        }
        if (!conflictFeedbacks || conflictFeedbacks.length === 0) {
            let score = 0.5;
            for (const conflict of conflicts) {
                if (conflict.description && conflict.description.length > 0) {
                    score += 0.2;
                }
                if (conflict.tradeoff_options && conflict.tradeoff_options.length > 0) {
                    score += 0.3;
                }
            }
            return Math.max(0, Math.min(1, score / conflicts.length));
        }
        let totalScore = 0;
        let count = 0;
        for (const feedback of conflictFeedbacks) {
            let score = 0.5;
            if (feedback.understood) {
                score += 0.3;
            }
            if (feedback.explanationClear) {
                score += 0.2;
            }
            totalScore += score;
            count++;
        }
        return count > 0 ? Math.max(0, Math.min(1, totalScore / count)) : 0.5;
    }
    assessTradeoffOptionsQuality(conflicts, conflictFeedbacks) {
        if (conflicts.length === 0) {
            return 1.0;
        }
        if (!conflictFeedbacks || conflictFeedbacks.length === 0) {
            let score = 0.5;
            for (const conflict of conflicts) {
                if (conflict.tradeoff_options && conflict.tradeoff_options.length > 0) {
                    score += 0.5 / conflicts.length;
                }
            }
            return Math.max(0, Math.min(1, score));
        }
        let totalScore = 0;
        let count = 0;
        for (const feedback of conflictFeedbacks) {
            let score = 0.5;
            if (feedback.tradeoffOptionsUseful) {
                score += 0.5;
            }
            if (feedback.selectedTradeoffOption) {
                score += 0.2;
            }
            totalScore += score;
            count++;
        }
        return count > 0 ? Math.max(0, Math.min(1, totalScore / count)) : 0.5;
    }
    assessDecisionSpeed(log) {
        return 0.8;
    }
    assessUserSatisfaction(decisionQualityFeedback, planVariantFeedbacks) {
        if (decisionQualityFeedback) {
            return decisionQualityFeedback.overallSatisfaction / 5;
        }
        if (planVariantFeedbacks && planVariantFeedbacks.length > 0) {
            const selectedCount = planVariantFeedbacks.filter(f => f.userChoice === 'selected').length;
            const rejectedCount = planVariantFeedbacks.filter(f => f.userChoice === 'rejected').length;
            if (selectedCount > rejectedCount) {
                return 0.7;
            }
            else if (rejectedCount > selectedCount) {
                return 0.3;
            }
            else {
                return 0.5;
            }
        }
        return 0.5;
    }
    calculateOverallQualityScore(metrics) {
        const weights = {
            planQualityScore: 0.3,
            conflictExplanationQualityScore: 0.2,
            tradeoffOptionsQualityScore: 0.2,
            decisionSpeedScore: 0.1,
            userSatisfactionScore: 0.2,
        };
        return (metrics.planQualityScore * weights.planQualityScore +
            metrics.conflictExplanationQualityScore *
                weights.conflictExplanationQualityScore +
            metrics.tradeoffOptionsQualityScore * weights.tradeoffOptionsQualityScore +
            metrics.decisionSpeedScore * weights.decisionSpeedScore +
            metrics.userSatisfactionScore * weights.userSatisfactionScore);
    }
    determineQualityGrade(overallQualityScore) {
        if (overallQualityScore >= 0.8) {
            return 'EXCELLENT';
        }
        else if (overallQualityScore >= 0.6) {
            return 'GOOD';
        }
        else if (overallQualityScore >= 0.4) {
            return 'FAIR';
        }
        else {
            return 'POOR';
        }
    }
    generateImprovementSuggestions(metrics) {
        const suggestions = [];
        if (metrics.planQualityScore < 0.6) {
            suggestions.push('计划质量需要改进：减少违规，提高计划完整性');
        }
        if (metrics.conflictExplanationQualityScore < 0.6) {
            suggestions.push('冲突解释质量需要改进：提供更清晰的冲突描述');
        }
        if (metrics.tradeoffOptionsQualityScore < 0.6) {
            suggestions.push('权衡选项质量需要改进：提供更多有用的权衡选项');
        }
        if (metrics.decisionSpeedScore < 0.6) {
            suggestions.push('决策速度需要改进：优化决策算法性能');
        }
        if (metrics.userSatisfactionScore < 0.6) {
            suggestions.push('用户满意度需要改进：收集更多用户反馈并优化决策');
        }
        if (suggestions.length === 0) {
            suggestions.push('整体质量良好，继续保持');
        }
        return suggestions;
    }
};
exports.QualityAssessorService = QualityAssessorService;
exports.QualityAssessorService = QualityAssessorService = QualityAssessorService_1 = __decorate([
    (0, common_1.Injectable)()
], QualityAssessorService);
//# sourceMappingURL=quality-assessor.service.js.map