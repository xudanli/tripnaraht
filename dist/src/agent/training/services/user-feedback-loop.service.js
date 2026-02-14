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
var UserFeedbackLoopService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserFeedbackLoopService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const reward_signal_extractor_service_1 = require("./reward-signal-extractor.service");
const crypto_1 = require("crypto");
let UserFeedbackLoopService = UserFeedbackLoopService_1 = class UserFeedbackLoopService {
    constructor(prisma, rewardExtractor) {
        this.prisma = prisma;
        this.rewardExtractor = rewardExtractor;
        this.logger = new common_1.Logger(UserFeedbackLoopService_1.name);
        this.actions = new Map();
        this.feedbacks = new Map();
    }
    async trackUserAction(userId, actionType, context) {
        this.logger.debug(`[UserFeedbackLoop] 追踪用户行为: actionType=${actionType}, requestId=${context.request_id}`);
        const action = {
            action_id: `action_${(0, crypto_1.randomUUID)()}`,
            user_id: userId,
            request_id: context.request_id,
            plan_id: context.plan_id,
            decision_id: context.decision_id,
            action_type: actionType,
            timestamp: new Date().toISOString(),
            metadata: context.metadata || {},
        };
        this.actions.set(action.action_id, action);
        this.logger.log(`[UserFeedbackLoop] 用户行为已追踪: actionId=${action.action_id}, actionType=${actionType}`);
        return action;
    }
    async collectFeedback(userId, requestId, planId, feedback) {
        this.logger.debug(`[UserFeedbackLoop] 收集用户反馈: requestId=${requestId}, satisfaction=${feedback.satisfaction}`);
        const userFeedback = {
            feedback_id: `feedback_${(0, crypto_1.randomUUID)()}`,
            user_id: userId,
            request_id: requestId,
            plan_id: planId,
            satisfaction: feedback.satisfaction,
            comments: feedback.comments,
            issues: feedback.issues,
            timestamp: new Date().toISOString(),
            metadata: {},
        };
        this.feedbacks.set(userFeedback.feedback_id, userFeedback);
        this.logger.log(`[UserFeedbackLoop] 用户反馈已收集: feedbackId=${userFeedback.feedback_id}`);
        return userFeedback;
    }
    async analyzeFeedback(startDate, endDate) {
        this.logger.log(`[UserFeedbackLoop] 分析用户反馈: startDate=${startDate}, endDate=${endDate}`);
        const startTime = new Date(startDate).getTime();
        const endTime = new Date(endDate).getTime();
        const periodFeedbacks = Array.from(this.feedbacks.values()).filter((f) => {
            const feedbackTime = new Date(f.timestamp).getTime();
            return feedbackTime >= startTime && feedbackTime <= endTime;
        });
        const periodActions = Array.from(this.actions.values()).filter((a) => {
            const actionTime = new Date(a.timestamp).getTime();
            return actionTime >= startTime && actionTime <= endTime;
        });
        const satisfactions = periodFeedbacks
            .filter((f) => f.satisfaction !== undefined)
            .map((f) => f.satisfaction);
        const avgSatisfaction = satisfactions.length > 0
            ? satisfactions.reduce((a, b) => a + b, 0) / satisfactions.length
            : 0;
        const actionDistribution = {
            ADOPT: 0,
            EDIT: 0,
            EXPORT: 0,
            ABANDON: 0,
            FEEDBACK: 0,
        };
        for (const action of periodActions) {
            actionDistribution[action.action_type] =
                (actionDistribution[action.action_type] || 0) + 1;
        }
        const issueCounts = {};
        for (const feedback of periodFeedbacks) {
            if (feedback.issues) {
                for (const issue of feedback.issues) {
                    issueCounts[issue] = (issueCounts[issue] || 0) + 1;
                }
            }
        }
        const commonIssues = Object.entries(issueCounts)
            .map(([issue, count]) => ({
            issue,
            count,
            percentage: (count / periodFeedbacks.length) * 100,
        }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        const satisfactionTrend = this.calculateTrend(satisfactions);
        const adoptionRateTrend = this.calculateTrend(periodActions.filter((a) => a.action_type === 'ADOPT').map(() => 1));
        const analysis = {
            period_start: startDate,
            period_end: endDate,
            total_feedbacks: periodFeedbacks.length,
            avg_satisfaction: avgSatisfaction,
            action_distribution: actionDistribution,
            common_issues: commonIssues,
            trends: {
                satisfaction_trend: satisfactionTrend,
                adoption_rate_trend: adoptionRateTrend,
            },
        };
        this.logger.log(`[UserFeedbackLoop] 反馈分析完成: totalFeedbacks=${periodFeedbacks.length}, avgSatisfaction=${avgSatisfaction.toFixed(2)}`);
        return analysis;
    }
    async applyFeedbackToReward(requestId) {
        this.logger.debug(`[UserFeedbackLoop] 将反馈应用到Reward: requestId=${requestId}`);
        const actions = Array.from(this.actions.values()).filter((a) => a.request_id === requestId);
        const feedbacks = Array.from(this.feedbacks.values()).filter((f) => f.request_id === requestId);
        const rewardSignals = [];
        for (const action of actions) {
            switch (action.action_type) {
                case 'ADOPT':
                    rewardSignals.push({
                        type: 'USER_APPROVAL',
                        value: 1.0,
                        timestamp: action.timestamp,
                        metadata: { action_type: 'ADOPT' },
                    });
                    break;
                case 'ABANDON':
                    rewardSignals.push({
                        type: 'USER_APPROVAL',
                        value: -0.5,
                        timestamp: action.timestamp,
                        metadata: { action_type: 'ABANDON' },
                    });
                    break;
                case 'EXPORT':
                    rewardSignals.push({
                        type: 'PLAN_COMMIT',
                        value: 0.8,
                        timestamp: action.timestamp,
                        metadata: { action_type: 'EXPORT' },
                    });
                    break;
            }
        }
        for (const feedback of feedbacks) {
            if (feedback.satisfaction !== undefined) {
                const satisfactionReward = (feedback.satisfaction - 1) / 4;
                rewardSignals.push({
                    type: 'DECISION_ALIGNMENT',
                    value: satisfactionReward,
                    timestamp: feedback.timestamp,
                    metadata: {
                        satisfaction: feedback.satisfaction,
                        comments: feedback.comments,
                    },
                });
            }
        }
        const totalReward = rewardSignals.reduce((sum, s) => sum + s.value, 0);
        this.logger.log(`[UserFeedbackLoop] 反馈已应用到Reward: requestId=${requestId}, totalReward=${totalReward.toFixed(3)}`);
        return {
            reward_signals: rewardSignals,
            total_reward: totalReward,
        };
    }
    calculateTrend(values) {
        if (values.length < 2)
            return 'STABLE';
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const diff = secondAvg - firstAvg;
        const threshold = 0.1;
        if (diff > threshold)
            return 'INCREASING';
        if (diff < -threshold)
            return 'DECREASING';
        return 'STABLE';
    }
};
exports.UserFeedbackLoopService = UserFeedbackLoopService;
exports.UserFeedbackLoopService = UserFeedbackLoopService = UserFeedbackLoopService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        reward_signal_extractor_service_1.RewardSignalExtractorService])
], UserFeedbackLoopService);
//# sourceMappingURL=user-feedback-loop.service.js.map