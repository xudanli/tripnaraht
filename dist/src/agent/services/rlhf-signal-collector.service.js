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
var RLHFSignalCollectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RLHFSignalCollectorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let RLHFSignalCollectorService = RLHFSignalCollectorService_1 = class RLHFSignalCollectorService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(RLHFSignalCollectorService_1.name);
        this.behaviorSignalsCache = new Map();
        this.executionSignalsCache = new Map();
        this.feedbackSignalsCache = new Map();
        this.qualityAssessmentsCache = new Map();
        this.logger.log('[RLHFSignalCollector] Initialized' + (prisma ? ' with Prisma persistence' : ' (memory only)'));
    }
    recordBehaviorSignal(signal) {
        const fullSignal = {
            ...signal,
            signal_id: `beh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
        };
        const signals = this.behaviorSignalsCache.get(signal.trip_run_id) || [];
        signals.push(fullSignal);
        this.behaviorSignalsCache.set(signal.trip_run_id, signals);
        this.persistBehaviorSignal(fullSignal).catch(e => this.logger.warn(`[RLHF] Failed to persist behavior signal: ${e === null || e === void 0 ? void 0 : e.message}`));
        this.logger.debug(`[RLHF] Behavior signal: ${signal.signal_type} on ${signal.target.element_type}`);
        return fullSignal;
    }
    async persistBehaviorSignal(signal) {
        var _a, _b, _c, _d;
        if (!this.prisma)
            return;
        try {
            await this.prisma.$executeRaw `
        INSERT INTO rlhf_behavior_signals (signal_id, trip_run_id, user_id, signal_type, element_type, element_id, element_context, duration_ms, scroll_depth, viewport_visible, timestamp)
        VALUES (${signal.signal_id}, ${signal.trip_run_id}, ${signal.user_id || null}, ${signal.signal_type}, ${signal.target.element_type}, ${signal.target.element_id}, ${signal.target.element_context || null}, ${((_a = signal.metadata) === null || _a === void 0 ? void 0 : _a.duration_ms) || null}, ${((_b = signal.metadata) === null || _b === void 0 ? void 0 : _b.scroll_depth) || null}, ${(_d = (_c = signal.metadata) === null || _c === void 0 ? void 0 : _c.viewport_visible) !== null && _d !== void 0 ? _d : null}, ${signal.timestamp}::timestamptz)
        ON CONFLICT (signal_id) DO NOTHING
      `;
        }
        catch (e) {
            this.logger.warn(`[RLHF] DB persist error (behavior): ${e === null || e === void 0 ? void 0 : e.message}`);
        }
    }
    recordPlanViewTime(tripRunId, planId, durationMs) {
        this.recordBehaviorSignal({
            trip_run_id: tripRunId,
            signal_type: 'TIME_SPENT',
            target: {
                element_type: 'PLAN',
                element_id: planId,
            },
            metadata: { duration_ms: durationMs },
        });
    }
    recordDetailInteraction(tripRunId, elementType, elementId, action) {
        this.recordBehaviorSignal({
            trip_run_id: tripRunId,
            signal_type: action,
            target: {
                element_type: elementType,
                element_id: elementId,
            },
        });
    }
    recordExecutionSignal(signal) {
        const fullSignal = {
            ...signal,
            signal_id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
        };
        const signals = this.executionSignalsCache.get(signal.trip_run_id) || [];
        signals.push(fullSignal);
        this.executionSignalsCache.set(signal.trip_run_id, signals);
        this.persistExecutionSignal(fullSignal).catch(e => this.logger.warn(`[RLHF] Failed to persist execution signal: ${e === null || e === void 0 ? void 0 : e.message}`));
        this.logger.debug(`[RLHF] Execution signal: ${signal.signal_type} for item ${signal.context.planned_item_id}`);
        return fullSignal;
    }
    async persistExecutionSignal(signal) {
        if (!this.prisma)
            return;
        try {
            await this.prisma.$executeRaw `
        INSERT INTO rlhf_execution_signals (signal_id, trip_run_id, signal_type, planned_item_id, planned_time, actual_time, deviation_minutes, reason, timestamp)
        VALUES (${signal.signal_id}, ${signal.trip_run_id}, ${signal.signal_type}, ${signal.context.planned_item_id}, ${signal.context.planned_time || null}::timestamptz, ${signal.context.actual_time || null}::timestamptz, ${signal.context.deviation_minutes || null}, ${signal.context.reason || null}, ${signal.timestamp}::timestamptz)
        ON CONFLICT (signal_id) DO NOTHING
      `;
        }
        catch (e) {
            this.logger.warn(`[RLHF] DB persist error (execution): ${e === null || e === void 0 ? void 0 : e.message}`);
        }
    }
    recordDeviation(tripRunId, plannedItemId, plannedTime, actualTime, reason) {
        const planned = new Date(plannedTime).getTime();
        const actual = new Date(actualTime).getTime();
        const deviationMinutes = Math.round((actual - planned) / 60000);
        const signalType = deviationMinutes > 30 ? 'DEVIATION' :
            deviationMinutes > 0 ? 'DELAY' :
                deviationMinutes < -15 ? 'EARLY' : 'START';
        this.recordExecutionSignal({
            trip_run_id: tripRunId,
            signal_type: signalType,
            context: {
                planned_item_id: plannedItemId,
                planned_time: plannedTime,
                actual_time: actualTime,
                deviation_minutes: deviationMinutes,
                reason,
            },
        });
    }
    recordSkippedActivity(tripRunId, plannedItemId, reason) {
        this.recordExecutionSignal({
            trip_run_id: tripRunId,
            signal_type: 'SKIP',
            context: {
                planned_item_id: plannedItemId,
                reason,
            },
        });
    }
    recordFeedbackSignal(signal) {
        const fullSignal = {
            ...signal,
            signal_id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
        };
        const signals = this.feedbackSignalsCache.get(signal.trip_run_id) || [];
        signals.push(fullSignal);
        this.feedbackSignalsCache.set(signal.trip_run_id, signals);
        this.persistFeedbackSignal(fullSignal).catch(e => this.logger.warn(`[RLHF] Failed to persist feedback signal: ${e === null || e === void 0 ? void 0 : e.message}`));
        this.logger.debug(`[RLHF] Feedback signal: ${signal.feedback_type} for decision ${signal.decision_point_id}`);
        return fullSignal;
    }
    async persistFeedbackSignal(signal) {
        if (!this.prisma)
            return;
        try {
            await this.prisma.$executeRaw `
        INSERT INTO rlhf_feedback_signals (signal_id, trip_run_id, user_id, decision_point_id, feedback_type, rating, choice, modification, comment, context, timestamp)
        VALUES (${signal.signal_id}, ${signal.trip_run_id}, ${signal.user_id || null}, ${signal.decision_point_id}, ${signal.feedback_type}, ${signal.value.rating || null}, ${signal.value.choice || null}, ${signal.value.modification ? JSON.stringify(signal.value.modification) : null}::jsonb, ${signal.value.comment || null}, ${JSON.stringify(signal.context)}::jsonb, ${signal.timestamp}::timestamptz)
        ON CONFLICT (signal_id) DO NOTHING
      `;
        }
        catch (e) {
            this.logger.warn(`[RLHF] DB persist error (feedback): ${e === null || e === void 0 ? void 0 : e.message}`);
        }
    }
    recordAcceptance(tripRunId, decisionPointId, chosenOptionId) {
        this.recordFeedbackSignal({
            trip_run_id: tripRunId,
            decision_point_id: decisionPointId,
            feedback_type: 'ACCEPT',
            value: { choice: chosenOptionId },
            context: {},
        });
    }
    recordRejection(tripRunId, decisionPointId, reason) {
        this.recordFeedbackSignal({
            trip_run_id: tripRunId,
            decision_point_id: decisionPointId,
            feedback_type: 'REJECT',
            value: { comment: reason },
            context: {},
        });
    }
    recordModification(tripRunId, decisionPointId, field, fromValue, toValue) {
        this.recordFeedbackSignal({
            trip_run_id: tripRunId,
            decision_point_id: decisionPointId,
            feedback_type: 'MODIFY',
            value: { modification: { field, from: fromValue, to: toValue } },
            context: {},
        });
    }
    recordRating(tripRunId, decisionPointId, rating, comment) {
        this.recordFeedbackSignal({
            trip_run_id: tripRunId,
            decision_point_id: decisionPointId,
            feedback_type: 'RATING',
            value: { rating, comment },
            context: {},
        });
    }
    assessDecisionQuality(tripRunId, decisionPointId, decisionOutput) {
        const behaviorSignals = this.behaviorSignalsCache.get(tripRunId) || [];
        const executionSignals = this.executionSignalsCache.get(tripRunId) || [];
        const feedbackSignals = this.feedbackSignalsCache.get(tripRunId) || [];
        const predictionAccuracy = this.calculatePredictionAccuracy(decisionOutput, executionSignals);
        const userSatisfaction = this.calculateUserSatisfaction(feedbackSignals);
        const executionAdherence = this.calculateExecutionAdherence(executionSignals);
        const overallQuality = (predictionAccuracy * 0.3 +
            userSatisfaction * 0.4 +
            executionAdherence * 0.3);
        const improvementSignals = this.identifyImprovementSignals(behaviorSignals, executionSignals, feedbackSignals);
        const assessment = {
            trip_run_id: tripRunId,
            decision_point_id: decisionPointId,
            assessed_at: new Date().toISOString(),
            metrics: {
                prediction_accuracy: predictionAccuracy,
                user_satisfaction: userSatisfaction,
                execution_adherence: executionAdherence,
                overall_quality: overallQuality,
            },
            factors: [
                { factor: 'Prediction Accuracy', score: predictionAccuracy, weight: 0.3, evidence: 'Based on execution signals' },
                { factor: 'User Satisfaction', score: userSatisfaction, weight: 0.4, evidence: 'Based on feedback signals' },
                { factor: 'Execution Adherence', score: executionAdherence, weight: 0.3, evidence: 'Based on deviation signals' },
            ],
            improvement_signals: improvementSignals,
        };
        const assessments = this.qualityAssessmentsCache.get(tripRunId) || [];
        assessments.push(assessment);
        this.qualityAssessmentsCache.set(tripRunId, assessments);
        this.logger.debug(`[RLHF] Quality assessment: overall=${overallQuality.toFixed(2)}`);
        return assessment;
    }
    generateLearningSignals(tripRunId) {
        const learningSignals = [];
        const behaviorSignals = this.behaviorSignalsCache.get(tripRunId) || [];
        const executionSignals = this.executionSignalsCache.get(tripRunId) || [];
        const feedbackSignals = this.feedbackSignalsCache.get(tripRunId) || [];
        const planViewTimes = behaviorSignals
            .filter(s => s.signal_type === 'TIME_SPENT' && s.target.element_type === 'PLAN')
            .map(s => { var _a; return ({ planId: s.target.element_id, duration: ((_a = s.metadata) === null || _a === void 0 ? void 0 : _a.duration_ms) || 0 }); });
        if (planViewTimes.length > 0) {
            const avgViewTime = planViewTimes.reduce((sum, p) => sum + p.duration, 0) / planViewTimes.length;
            const maxViewPlan = planViewTimes.reduce((max, p) => p.duration > max.duration ? p : max);
            if (maxViewPlan.duration > avgViewTime * 1.5) {
                learningSignals.push({
                    signal_id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: new Date().toISOString(),
                    signal_category: 'PREFERENCE',
                    signal_strength: 0.6,
                    observation: {
                        context: 'Plan comparison',
                        user_action: `Spent ${Math.round(maxViewPlan.duration / 1000)}s on plan ${maxViewPlan.planId}`,
                    },
                    learning_target: {
                        model_component: 'RANKING',
                        adjustment_direction: 'INCREASE',
                        adjustment_magnitude: 0.1,
                    },
                });
            }
        }
        const deviations = executionSignals.filter(s => s.signal_type === 'DEVIATION' || s.signal_type === 'SKIP');
        for (const deviation of deviations) {
            learningSignals.push({
                signal_id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                signal_category: 'CONSTRAINT',
                signal_strength: deviation.signal_type === 'SKIP' ? 0.8 : 0.5,
                observation: {
                    context: 'Execution deviation',
                    user_action: deviation.signal_type === 'SKIP' ? 'Skipped activity' : 'Significant time deviation',
                    actual_outcome: deviation.context.reason,
                },
                learning_target: {
                    model_component: 'CONSTRAINT',
                    adjustment_direction: 'ADJUST',
                    adjustment_magnitude: 0.15,
                },
            });
        }
        const rejections = feedbackSignals.filter(s => s.feedback_type === 'REJECT');
        for (const rejection of rejections) {
            learningSignals.push({
                signal_id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date().toISOString(),
                signal_category: 'PREFERENCE',
                signal_strength: 0.9,
                observation: {
                    context: 'User rejection',
                    user_action: 'Rejected recommendation',
                    actual_outcome: rejection.value.comment,
                },
                learning_target: {
                    model_component: 'PREFERENCE',
                    adjustment_direction: 'DECREASE',
                    adjustment_magnitude: 0.2,
                },
            });
        }
        this.logger.debug(`[RLHF] Generated ${learningSignals.length} learning signals`);
        return learningSignals;
    }
    getSignalSummary(tripRunId) {
        const behavior = this.behaviorSignalsCache.get(tripRunId) || [];
        const execution = this.executionSignalsCache.get(tripRunId) || [];
        const feedback = this.feedbackSignalsCache.get(tripRunId) || [];
        const ratings = feedback
            .filter(f => f.feedback_type === 'RATING' && f.value.rating !== undefined)
            .map(f => f.value.rating);
        return {
            behavior_count: behavior.length,
            execution_count: execution.length,
            feedback_count: feedback.length,
            deviations: execution.filter(e => e.signal_type === 'DEVIATION').length,
            skips: execution.filter(e => e.signal_type === 'SKIP').length,
            acceptances: feedback.filter(f => f.feedback_type === 'ACCEPT').length,
            rejections: feedback.filter(f => f.feedback_type === 'REJECT').length,
            avg_rating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined,
        };
    }
    calculatePredictionAccuracy(decisionOutput, executionSignals) {
        if (executionSignals.length === 0)
            return 0.7;
        const completedCount = executionSignals.filter(s => s.signal_type === 'COMPLETE').length;
        const skippedCount = executionSignals.filter(s => s.signal_type === 'SKIP').length;
        const deviationCount = executionSignals.filter(s => s.signal_type === 'DEVIATION').length;
        const total = completedCount + skippedCount + deviationCount;
        if (total === 0)
            return 0.7;
        return Math.max(0, Math.min(1, (completedCount - skippedCount * 0.5 - deviationCount * 0.3) / total + 0.5));
    }
    calculateUserSatisfaction(feedbackSignals) {
        if (feedbackSignals.length === 0)
            return 0.5;
        const acceptCount = feedbackSignals.filter(f => f.feedback_type === 'ACCEPT').length;
        const rejectCount = feedbackSignals.filter(f => f.feedback_type === 'REJECT').length;
        const ratings = feedbackSignals
            .filter(f => f.feedback_type === 'RATING' && f.value.rating !== undefined)
            .map(f => f.value.rating / 5);
        if (ratings.length > 0) {
            return ratings.reduce((a, b) => a + b, 0) / ratings.length;
        }
        const total = acceptCount + rejectCount;
        if (total === 0)
            return 0.5;
        return acceptCount / total;
    }
    calculateExecutionAdherence(executionSignals) {
        if (executionSignals.length === 0)
            return 0.7;
        const onTimeCount = executionSignals.filter(s => s.signal_type === 'START' || s.signal_type === 'COMPLETE').length;
        const deviationCount = executionSignals.filter(s => s.signal_type === 'DEVIATION' || s.signal_type === 'SKIP' || s.signal_type === 'ABORT').length;
        const total = onTimeCount + deviationCount;
        if (total === 0)
            return 0.7;
        return onTimeCount / total;
    }
    identifyImprovementSignals(behaviorSignals, executionSignals, feedbackSignals) {
        const signals = [];
        const skipCount = executionSignals.filter(s => s.signal_type === 'SKIP').length;
        if (skipCount > 2) {
            signals.push({
                signal_type: 'HIGH_SKIP_RATE',
                description: `${skipCount} activities were skipped - consider adjusting pace or activity density`,
                priority: 'HIGH',
            });
        }
        const rejectCount = feedbackSignals.filter(f => f.feedback_type === 'REJECT').length;
        if (rejectCount > 0) {
            signals.push({
                signal_type: 'USER_REJECTION',
                description: `${rejectCount} recommendation(s) rejected - review preference alignment`,
                priority: 'HIGH',
            });
        }
        const lowRatings = feedbackSignals.filter(f => f.feedback_type === 'RATING' && f.value.rating !== undefined && f.value.rating < 3);
        if (lowRatings.length > 0) {
            signals.push({
                signal_type: 'LOW_RATING',
                description: `${lowRatings.length} low rating(s) received - investigate user concerns`,
                priority: 'MEDIUM',
            });
        }
        return signals;
    }
};
exports.RLHFSignalCollectorService = RLHFSignalCollectorService;
exports.RLHFSignalCollectorService = RLHFSignalCollectorService = RLHFSignalCollectorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RLHFSignalCollectorService);
//# sourceMappingURL=rlhf-signal-collector.service.js.map