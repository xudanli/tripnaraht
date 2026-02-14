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
var FeedbackCollectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackCollectorService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const prisma_service_1 = require("../../../prisma/prisma.service");
const context_learning_service_1 = require("../../../agent/context-engine/services/context-learning.service");
let FeedbackCollectorService = FeedbackCollectorService_1 = class FeedbackCollectorService {
    constructor(prisma, moduleRef) {
        this.prisma = prisma;
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(FeedbackCollectorService_1.name);
    }
    async collectPlanVariantFeedback(feedback) {
        try {
            this.logger.debug(`[反馈收集] 计划变体反馈: variantId=${feedback.variantId}, ` +
                `strategy=${feedback.variantStrategy}, choice=${feedback.userChoice}, ` +
                `rating=${feedback.rating}`);
            await this.prisma.$executeRaw `
        INSERT INTO decision_plan_variant_feedback (
          feedback_id, run_id, variant_id, variant_strategy, user_choice,
          rating, reason, trip_id, user_id, feedback_at, created_at
        ) VALUES (
          ${feedback.feedbackId}::VARCHAR,
          ${feedback.runId}::VARCHAR,
          ${feedback.variantId}::VARCHAR,
          ${feedback.variantStrategy}::VARCHAR,
          ${feedback.userChoice}::VARCHAR,
          ${feedback.rating || null}::INTEGER,
          ${feedback.reason || null}::TEXT,
          ${feedback.tripId || null}::VARCHAR,
          ${feedback.userId || null}::VARCHAR,
          ${feedback.feedbackAt}::TIMESTAMPTZ,
          NOW()
        )
        ON CONFLICT (feedback_id) DO NOTHING
      `;
            if (feedback.userChoice === 'selected') {
                this.logger.log(`[反馈收集] 用户选择了变体: variantId=${feedback.variantId}, ` +
                    `strategy=${feedback.variantStrategy}`);
            }
            if (feedback.userChoice === 'rejected') {
                this.logger.warn(`[反馈收集] 用户拒绝了变体: variantId=${feedback.variantId}, ` +
                    `strategy=${feedback.variantStrategy}, reason=${feedback.reason}`);
            }
        }
        catch (error) {
            this.logger.error(`[反馈收集] 收集计划变体反馈失败: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async collectConflictFeedback(feedback) {
        try {
            this.logger.debug(`[反馈收集] 约束冲突反馈: conflictId=${feedback.conflictId}, ` +
                `conflictType=${feedback.conflictType}, understood=${feedback.understood}, ` +
                `explanationClear=${feedback.explanationClear}, ` +
                `tradeoffOptionsUseful=${feedback.tradeoffOptionsUseful}`);
            await this.prisma.$executeRaw `
        INSERT INTO decision_conflict_feedback (
          feedback_id, run_id, conflict_id, conflict_type, understood,
          explanation_clear, tradeoff_options_useful, selected_tradeoff_option,
          trip_id, user_id, feedback_at, created_at
        ) VALUES (
          ${feedback.feedbackId}::VARCHAR,
          ${feedback.runId}::VARCHAR,
          ${feedback.conflictId}::VARCHAR,
          ${feedback.conflictType}::VARCHAR,
          ${feedback.understood}::BOOLEAN,
          ${feedback.explanationClear}::BOOLEAN,
          ${feedback.tradeoffOptionsUseful}::BOOLEAN,
          ${feedback.selectedTradeoffOption || null}::TEXT,
          ${feedback.tripId || null}::VARCHAR,
          ${feedback.userId || null}::VARCHAR,
          ${feedback.feedbackAt}::TIMESTAMPTZ,
          NOW()
        )
        ON CONFLICT (feedback_id) DO NOTHING
      `;
            if (!feedback.understood) {
                this.logger.warn(`[反馈收集] 用户不理解冲突: conflictId=${feedback.conflictId}, ` +
                    `conflictType=${feedback.conflictType}`);
            }
            if (!feedback.explanationClear) {
                this.logger.warn(`[反馈收集] 冲突解释不清晰: conflictId=${feedback.conflictId}`);
            }
            if (!feedback.tradeoffOptionsUseful) {
                this.logger.warn(`[反馈收集] 权衡选项没用: conflictId=${feedback.conflictId}`);
            }
            if (feedback.selectedTradeoffOption) {
                this.logger.log(`[反馈收集] 用户选择了权衡选项: conflictId=${feedback.conflictId}, ` +
                    `option=${feedback.selectedTradeoffOption}`);
            }
        }
        catch (error) {
            this.logger.error(`[反馈收集] 收集约束冲突反馈失败: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async collectDecisionQualityFeedback(feedback) {
        try {
            this.logger.debug(`[反馈收集] 决策质量反馈: runId=${feedback.runId}, ` +
                `overallSatisfaction=${feedback.overallSatisfaction}, ` +
                `planQuality=${feedback.planQuality}`);
            await this.prisma.$executeRaw `
        INSERT INTO decision_quality_feedback (
          feedback_id, run_id, overall_satisfaction, plan_quality,
          conflict_explanation_quality, tradeoff_options_quality,
          decision_speed, additional_feedback, trip_id, user_id,
          feedback_at, created_at
        ) VALUES (
          ${feedback.feedbackId}::VARCHAR,
          ${feedback.runId}::VARCHAR,
          ${feedback.overallSatisfaction}::INTEGER,
          ${feedback.planQuality}::INTEGER,
          ${feedback.conflictExplanationQuality || null}::INTEGER,
          ${feedback.tradeoffOptionsQuality || null}::INTEGER,
          ${feedback.decisionSpeed || null}::INTEGER,
          ${feedback.additionalFeedback || null}::TEXT,
          ${feedback.tripId || null}::VARCHAR,
          ${feedback.userId || null}::VARCHAR,
          ${feedback.feedbackAt}::TIMESTAMPTZ,
          NOW()
        )
        ON CONFLICT (feedback_id) DO NOTHING
      `;
            if (feedback.overallSatisfaction < 3) {
                this.logger.warn(`[反馈收集] 用户满意度低: runId=${feedback.runId}, ` +
                    `satisfaction=${feedback.overallSatisfaction}, ` +
                    `additionalFeedback=${feedback.additionalFeedback}`);
            }
            if (feedback.planQuality < 3) {
                this.logger.warn(`[反馈收集] 计划质量低: runId=${feedback.runId}, ` +
                    `planQuality=${feedback.planQuality}`);
            }
            this.recordUserFeedbackEvent(feedback).catch((error) => {
                this.logger.warn(`记录用户反馈学习事件失败: ${error.message}`, error.stack);
            });
        }
        catch (error) {
            this.logger.error(`[反馈收集] 收集决策质量反馈失败: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async collectBatchFeedback(planVariantFeedbacks, conflictFeedbacks, decisionQualityFeedbacks) {
        try {
            const promises = [];
            if (planVariantFeedbacks) {
                for (const feedback of planVariantFeedbacks) {
                    promises.push(this.collectPlanVariantFeedback(feedback));
                }
            }
            if (conflictFeedbacks) {
                for (const feedback of conflictFeedbacks) {
                    promises.push(this.collectConflictFeedback(feedback));
                }
            }
            if (decisionQualityFeedbacks) {
                for (const feedback of decisionQualityFeedbacks) {
                    promises.push(this.collectDecisionQualityFeedback(feedback));
                }
            }
            await Promise.all(promises);
            this.logger.log(`[反馈收集] 批量收集完成: ` +
                `planVariant=${(planVariantFeedbacks === null || planVariantFeedbacks === void 0 ? void 0 : planVariantFeedbacks.length) || 0}, ` +
                `conflict=${(conflictFeedbacks === null || conflictFeedbacks === void 0 ? void 0 : conflictFeedbacks.length) || 0}, ` +
                `decisionQuality=${(decisionQualityFeedbacks === null || decisionQualityFeedbacks === void 0 ? void 0 : decisionQualityFeedbacks.length) || 0}`);
        }
        catch (error) {
            this.logger.error(`[反馈收集] 批量收集失败: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async getFeedbackStats(userId, tripId, startDate, endDate) {
        var _a, _b, _c, _d, _e;
        try {
            this.logger.debug(`[反馈收集] 获取反馈统计: userId=${userId}, tripId=${tripId}`);
            const conditions = [];
            const params = [];
            if (userId) {
                conditions.push(`user_id = $${params.length + 1}`);
                params.push(userId);
            }
            if (tripId) {
                conditions.push(`trip_id = $${params.length + 1}`);
                params.push(tripId);
            }
            if (startDate) {
                conditions.push(`feedback_at >= $${params.length + 1}`);
                params.push(startDate);
            }
            if (endDate) {
                conditions.push(`feedback_at <= $${params.length + 1}`);
                params.push(endDate);
            }
            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            const planVariantQuery = `
        SELECT COUNT(*)::bigint as count
        FROM decision_plan_variant_feedback
        ${whereClause}
      `;
            const planVariantResult = await this.prisma.$queryRawUnsafe(planVariantQuery, ...params);
            const planVariantCount = Number(((_a = planVariantResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
            const conflictQuery = `
        SELECT COUNT(*)::bigint as count
        FROM decision_conflict_feedback
        ${whereClause}
      `;
            const conflictResult = await this.prisma.$queryRawUnsafe(conflictQuery, ...params);
            const conflictCount = Number(((_b = conflictResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
            const qualityQuery = `
        SELECT 
          COUNT(*)::bigint as count,
          AVG(overall_satisfaction)::numeric as avg_satisfaction,
          AVG(plan_quality)::numeric as avg_plan_quality
        FROM decision_quality_feedback
        ${whereClause}
      `;
            const qualityResult = await this.prisma.$queryRawUnsafe(qualityQuery, ...params);
            const decisionQualityCount = Number(((_c = qualityResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0);
            const averageSatisfaction = Number(((_d = qualityResult[0]) === null || _d === void 0 ? void 0 : _d.avg_satisfaction) || 0);
            const averagePlanQuality = Number(((_e = qualityResult[0]) === null || _e === void 0 ? void 0 : _e.avg_plan_quality) || 0);
            return {
                planVariantCount,
                conflictCount,
                decisionQualityCount,
                averageSatisfaction,
                averagePlanQuality,
            };
        }
        catch (error) {
            this.logger.error(`[反馈收集] 获取反馈统计失败: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async recordUserFeedbackEvent(feedback) {
        try {
            if (!this.contextLearningService) {
                try {
                    this.contextLearningService = this.moduleRef.get(context_learning_service_1.ContextLearningService, { strict: false });
                }
                catch (error) {
                    this.logger.debug('ContextLearningService 不可用，跳过用户反馈学习事件记录');
                    return;
                }
            }
            if (!this.contextLearningService) {
                return;
            }
            const feedbackText = feedback.additionalFeedback || '';
            const relevantBlocks = [];
            const irrelevantBlocks = [];
            const missingBlocks = [];
            if (feedback.overallSatisfaction >= 4) {
            }
            else if (feedback.overallSatisfaction < 3) {
            }
            await this.contextLearningService.learn({
                userId: feedback.userId || undefined,
                tripId: feedback.tripId || undefined,
                eventType: 'user_feedback',
                eventData: {
                    feedback: {
                        relevantBlocks: relevantBlocks.length > 0 ? relevantBlocks : undefined,
                        irrelevantBlocks: irrelevantBlocks.length > 0 ? irrelevantBlocks : undefined,
                        missingBlocks: missingBlocks.length > 0 ? missingBlocks : undefined,
                    },
                },
                phase: 'PLANNING',
                agent: 'PlanningWorkbench',
            });
            this.logger.debug(`已记录用户反馈学习事件: runId=${feedback.runId}, tripId=${feedback.tripId || 'none'}, satisfaction=${feedback.overallSatisfaction}`);
        }
        catch (error) {
            this.logger.warn(`记录用户反馈学习事件失败: ${error.message}`);
        }
    }
};
exports.FeedbackCollectorService = FeedbackCollectorService;
exports.FeedbackCollectorService = FeedbackCollectorService = FeedbackCollectorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        core_1.ModuleRef])
], FeedbackCollectorService);
//# sourceMappingURL=feedback-collector.service.js.map