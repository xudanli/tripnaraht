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
var MemoryUpdaterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryUpdaterService = void 0;
const common_1 = require("@nestjs/common");
const learning_service_1 = require("../learning/learning.service");
let MemoryUpdaterService = MemoryUpdaterService_1 = class MemoryUpdaterService {
    constructor(learningService) {
        this.learningService = learningService;
        this.logger = new common_1.Logger(MemoryUpdaterService_1.name);
    }
    async updateMemoryFromFeedback(log, qualityAssessment, feedbacks) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.logger.debug(`[记忆更新] 根据反馈更新记忆: runId=${log.runId}`);
        const updatedMemoryTypes = [];
        const updatedParameters = {};
        if (qualityAssessment.qualityGrade === 'POOR') {
            this.logger.warn(`[记忆更新] 决策质量较差，触发学习更新: runId=${log.runId}`);
            if (this.learningService) {
                const learningResult = this.learningService.learnFromLogs([log], (_a = feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.planVariantFeedbacks) === null || _a === void 0 ? void 0 : _a.map(f => ({
                    logId: log.runId,
                    accepted: f.userChoice === 'selected',
                    satisfaction: f.rating ? f.rating / 5 : undefined,
                })));
                if (learningResult.policyAdjustments && Object.keys(learningResult.policyAdjustments).length > 0) {
                    updatedMemoryTypes.push('policy_adjustments');
                    updatedParameters.policyAdjustments = learningResult.policyAdjustments;
                    this.logger.log(`[记忆更新] 策略调整: ${JSON.stringify(learningResult.policyAdjustments)}`);
                }
            }
            else {
                this.logger.warn(`[记忆更新] LearningService 不可用，跳过策略调整`);
            }
        }
        if (qualityAssessment.metrics.conflictExplanationQualityScore < 0.6) {
            updatedMemoryTypes.push('conflict_explanation_improvement');
            updatedParameters.conflictExplanationIssues = (_b = feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.conflictFeedbacks) === null || _b === void 0 ? void 0 : _b.filter(f => !f.understood || !f.explanationClear).map(f => ({
                conflictId: f.conflictId,
                conflictType: f.conflictType,
                issue: !f.understood ? 'not_understood' : 'explanation_unclear',
            }));
            this.logger.log(`[记忆更新] 记录冲突解释改进点: ${((_c = updatedParameters.conflictExplanationIssues) === null || _c === void 0 ? void 0 : _c.length) || 0}个`);
        }
        if (qualityAssessment.metrics.tradeoffOptionsQualityScore < 0.6) {
            updatedMemoryTypes.push('tradeoff_options_improvement');
            updatedParameters.tradeoffOptionsIssues = (_d = feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.conflictFeedbacks) === null || _d === void 0 ? void 0 : _d.filter(f => !f.tradeoffOptionsUseful).map(f => ({
                conflictId: f.conflictId,
                conflictType: f.conflictType,
            }));
            this.logger.log(`[记忆更新] 记录权衡选项改进点: ${((_e = updatedParameters.tradeoffOptionsIssues) === null || _e === void 0 ? void 0 : _e.length) || 0}个`);
        }
        if (qualityAssessment.metrics.userSatisfactionScore < 0.6) {
            updatedMemoryTypes.push('user_satisfaction_improvement');
            updatedParameters.userSatisfactionIssues = {
                overallSatisfaction: (_f = feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.decisionQualityFeedback) === null || _f === void 0 ? void 0 : _f.overallSatisfaction,
                planQuality: (_g = feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.decisionQualityFeedback) === null || _g === void 0 ? void 0 : _g.planQuality,
                additionalFeedback: (_h = feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.decisionQualityFeedback) === null || _h === void 0 ? void 0 : _h.additionalFeedback,
            };
            this.logger.log(`[记忆更新] 记录用户满意度改进点: satisfaction=${updatedParameters.userSatisfactionIssues.overallSatisfaction}`);
        }
        if (feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.planVariantFeedbacks) {
            const selectedVariants = feedbacks.planVariantFeedbacks.filter(f => f.userChoice === 'selected');
            if (selectedVariants.length > 0) {
                updatedMemoryTypes.push('successful_variants');
                updatedParameters.successfulVariants = selectedVariants.map(f => ({
                    variantId: f.variantId,
                    variantStrategy: f.variantStrategy,
                    rating: f.rating,
                }));
                this.logger.log(`[记忆更新] 记录成功变体: ${selectedVariants.length}个`);
            }
        }
        if (feedbacks === null || feedbacks === void 0 ? void 0 : feedbacks.conflictFeedbacks) {
            const selectedTradeoffs = feedbacks.conflictFeedbacks.filter(f => f.selectedTradeoffOption);
            if (selectedTradeoffs.length > 0) {
                updatedMemoryTypes.push('successful_tradeoffs');
                updatedParameters.successfulTradeoffs = selectedTradeoffs.map(f => ({
                    conflictId: f.conflictId,
                    conflictType: f.conflictType,
                    selectedOption: f.selectedTradeoffOption,
                }));
                this.logger.log(`[记忆更新] 记录成功权衡选项: ${selectedTradeoffs.length}个`);
            }
        }
        return {
            success: updatedMemoryTypes.length > 0,
            updatedMemoryTypes,
            updatedParameters,
            reason: `根据反馈更新记忆: ${updatedMemoryTypes.join(', ')}`,
            updatedAt: new Date(),
        };
    }
    async batchUpdateMemory(logs, qualityAssessments, feedbacksArray) {
        this.logger.debug(`[记忆更新] 批量更新记忆: ${logs.length}个决策`);
        const results = [];
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            const qualityAssessment = qualityAssessments[i];
            const feedbacks = feedbacksArray[i];
            try {
                const result = await this.updateMemoryFromFeedback(log, qualityAssessment, feedbacks);
                results.push(result);
            }
            catch (error) {
                this.logger.error(`[记忆更新] 更新记忆失败: runId=${log.runId}, ` +
                    `error=${error instanceof Error ? error.message : String(error)}`);
                results.push({
                    success: false,
                    updatedMemoryTypes: [],
                    updatedParameters: {},
                    reason: `更新失败: ${error instanceof Error ? error.message : String(error)}`,
                    updatedAt: new Date(),
                });
            }
        }
        this.logger.log(`[记忆更新] 批量更新完成: ${results.filter(r => r.success).length}/${results.length}成功`);
        return results;
    }
};
exports.MemoryUpdaterService = MemoryUpdaterService;
exports.MemoryUpdaterService = MemoryUpdaterService = MemoryUpdaterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(learning_service_1.LearningService)),
    __metadata("design:paramtypes", [learning_service_1.LearningService])
], MemoryUpdaterService);
//# sourceMappingURL=memory-updater.service.js.map