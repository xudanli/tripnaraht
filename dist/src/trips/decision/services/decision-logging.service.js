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
var DecisionLoggingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionLoggingService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const prisma_service_1 = require("../../../prisma/prisma.service");
const context_learning_service_1 = require("../../../agent/context-engine/services/context-learning.service");
let DecisionLoggingService = DecisionLoggingService_1 = class DecisionLoggingService {
    constructor(prisma, moduleRef) {
        this.prisma = prisma;
        this.moduleRef = moduleRef;
        this.logger = new common_1.Logger(DecisionLoggingService_1.name);
    }
    async logDecision(tripId, decisionPoint, options, userChoice, systemAnalysis, context) {
        var _a;
        try {
            const alignmentScore = this.calculateAlignment((_a = systemAnalysis.topRecommendation) === null || _a === void 0 ? void 0 : _a.optionId, userChoice.optionId);
            const decisionLog = await this.prisma.decisionLog.create({
                data: {
                    tripId,
                    countryCode: context === null || context === void 0 ? void 0 : context.countryCode,
                    routeDirectionId: context === null || context === void 0 ? void 0 : context.routeDirectionId,
                    persona: (context === null || context === void 0 ? void 0 : context.persona) || 'NEPTUNE',
                    action: 'ALLOW',
                    decisionSource: (context === null || context === void 0 ? void 0 : context.decisionSource) || 'PHYSICAL',
                    decisionStage: (context === null || context === void 0 ? void 0 : context.decisionStage) || 'FINALIZE',
                    explanation: (context === null || context === void 0 ? void 0 : context.explanation) || `决策点：${decisionPoint}`,
                    reasonCodes: (context === null || context === void 0 ? void 0 : context.reasonCodes) || [],
                    evidenceRefs: (context === null || context === void 0 ? void 0 : context.evidenceRefs) || [],
                    timestamp: new Date(),
                    metadata: {
                        decisionPointType: decisionPoint,
                    },
                    availableOptions: options,
                    userChoice: {
                        selectedOptionId: userChoice.optionId,
                        selectionTime: userChoice.selectionTime,
                        userReasoning: userChoice.reasoning,
                        confidenceLevel: userChoice.confidenceLevel,
                    },
                    confidenceLevel: userChoice.confidenceLevel,
                    systemRecommendation: systemAnalysis.topRecommendation
                        ? {
                            optionId: systemAnalysis.topRecommendation.optionId,
                            rationale: systemAnalysis.topRecommendation.rationale,
                            recommendationRationale: systemAnalysis.recommendationRationale,
                        }
                        : undefined,
                    alignmentScore,
                },
            });
            this.logger.log(`记录决策点：${decisionPoint}，用户选择：${userChoice.optionId}，一致性：${alignmentScore}`);
            return { id: decisionLog.id };
        }
        catch (error) {
            this.logger.error(`记录决策点失败: ${error}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async logOutcome(decisionId, expectedOutcome, actualOutcome, userSatisfaction, userFeedback) {
        try {
            const decisionLog = await this.prisma.decisionLog.findUnique({
                where: { id: decisionId },
            });
            if (!decisionLog) {
                throw new Error(`决策日志 ${decisionId} 不存在`);
            }
            const deviation = this.calculateDeviation(expectedOutcome, actualOutcome);
            const learningSignals = this.generateLearningSignals(expectedOutcome, actualOutcome, userSatisfaction);
            const outcome = await this.prisma.decisionOutcome.create({
                data: {
                    decisionId,
                    expectedOutcome: expectedOutcome,
                    actualOutcome: actualOutcome,
                    deviation: deviation,
                    userSatisfaction,
                    userFeedback,
                    learningSignals: learningSignals,
                },
            });
            this.logger.log(`记录决策结果：${decisionId}，用户满意度：${userSatisfaction || '未提供'}`);
            this.recordDecisionMadeEvent(decisionLog, userSatisfaction).catch((error) => {
                this.logger.warn(`记录决策学习事件失败: ${error.message}`, error.stack);
            });
            return { id: outcome.id };
        }
        catch (error) {
            this.logger.error(`记录决策结果失败: ${error}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async recordDecisionMadeEvent(decisionLog, userSatisfaction) {
        try {
            if (!this.contextLearningService) {
                try {
                    this.contextLearningService = this.moduleRef.get(context_learning_service_1.ContextLearningService, { strict: false });
                }
                catch (error) {
                    this.logger.debug('ContextLearningService 不可用，跳过决策学习事件记录');
                    return;
                }
            }
            if (!this.contextLearningService) {
                return;
            }
            const tripId = decisionLog.tripId;
            const userId = decisionLog.userId || null;
            const phase = decisionLog.decisionStage || 'PLANNING';
            const agent = decisionLog.decisionSource === 'PHYSICAL' ? 'Gatekeeper' :
                decisionLog.decisionSource === 'HUMAN' ? 'PlanningWorkbench' :
                    'CoreDecision';
            let satisfaction;
            if (userSatisfaction !== undefined) {
                if (userSatisfaction <= 1) {
                    satisfaction = userSatisfaction;
                }
                else if (userSatisfaction <= 10) {
                    satisfaction = userSatisfaction / 10;
                }
                else {
                    satisfaction = userSatisfaction / 100;
                }
            }
            const accepted = decisionLog.action === 'ALLOW' || decisionLog.action === 'ACCEPT';
            await this.contextLearningService.learn({
                userId: userId || undefined,
                tripId: tripId || undefined,
                eventType: 'decision_made',
                eventData: {
                    decisionResult: {
                        accepted,
                        satisfaction,
                    },
                },
                phase,
                agent,
            });
            this.logger.debug(`已记录决策学习事件: decisionId=${decisionLog.id}, tripId=${tripId || 'none'}, satisfaction=${satisfaction || 'none'}`);
        }
        catch (error) {
            this.logger.warn(`记录决策学习事件失败: ${error.message}`);
        }
    }
    calculateAlignment(systemRecommendationOptionId, userChoiceOptionId) {
        if (!systemRecommendationOptionId) {
            return 0.5;
        }
        if (systemRecommendationOptionId === userChoiceOptionId) {
            return 1.0;
        }
        return 0.0;
    }
    calculateDeviation(expected, actual) {
        const satisfactionDiff = (actual.actualSatisfaction || 0) - (expected.expectedSatisfaction || 0);
        let type;
        let magnitude;
        if (satisfactionDiff > 1) {
            type = 'POSITIVE';
            magnitude = Math.min(satisfactionDiff / 10, 1.0);
        }
        else if (satisfactionDiff < -1) {
            type = 'NEGATIVE';
            magnitude = Math.min(Math.abs(satisfactionDiff) / 10, 1.0);
        }
        else {
            type = 'NEUTRAL';
            magnitude = Math.abs(satisfactionDiff) / 10;
        }
        const description = type === 'POSITIVE'
            ? '实际体验超出预期'
            : type === 'NEGATIVE'
                ? '实际体验低于预期'
                : '实际体验与预期基本一致';
        return {
            type,
            description,
            magnitude,
            details: {
                satisfactionDiff,
                expectedSatisfaction: expected.expectedSatisfaction,
                actualSatisfaction: actual.actualSatisfaction,
            },
        };
    }
    generateLearningSignals(expected, actual, userSatisfaction) {
        var _a, _b;
        const signals = {
            preferenceSignals: {},
            decisionPatternSignals: {},
            improvementSuggestions: [],
        };
        if (userSatisfaction && userSatisfaction >= 8) {
            signals.preferenceSignals = {
                highSatisfaction: true,
                satisfactionLevel: userSatisfaction,
            };
        }
        const satisfactionDiff = (actual.actualSatisfaction || 0) - (expected.expectedSatisfaction || 0);
        if (Math.abs(satisfactionDiff) > 2) {
            signals.decisionPatternSignals = {
                predictionAccuracy: 'LOW',
                deviationMagnitude: Math.abs(satisfactionDiff),
            };
            (_a = signals.improvementSuggestions) === null || _a === void 0 ? void 0 : _a.push('需要改进满意度预测模型，提高预测准确性');
        }
        if (actual.actualRisks &&
            expected.expectedRisks &&
            actual.actualRisks.length !== expected.expectedRisks.length) {
            signals.decisionPatternSignals = {
                ...signals.decisionPatternSignals,
                riskAssessmentAccuracy: 'NEEDS_IMPROVEMENT',
            };
            (_b = signals.improvementSuggestions) === null || _b === void 0 ? void 0 : _b.push('需要改进风险评估模型，更准确地识别潜在风险');
        }
        return signals;
    }
    async getUserDecisionLearning(userId, tripId) {
        try {
            const logs = await this.prisma.decisionLog.findMany({
                where: {
                    tripId: tripId || undefined,
                },
                include: {
                    outcomes: true,
                },
                orderBy: {
                    timestamp: 'desc',
                },
                take: 100,
            });
            const decisionPatterns = {};
            const preferenceSignals = {};
            const improvementSuggestions = [];
            let alignmentCount = 0;
            let totalDecisions = 0;
            for (const log of logs) {
                if (log.alignmentScore !== null) {
                    totalDecisions++;
                    if (log.alignmentScore >= 0.8) {
                        alignmentCount++;
                    }
                }
            }
            if (totalDecisions > 0) {
                decisionPatterns.alignmentRate = alignmentCount / totalDecisions;
                if (decisionPatterns.alignmentRate < 0.5) {
                    improvementSuggestions.push('系统推荐与用户选择的一致性较低，建议改进推荐算法');
                }
            }
            const satisfactions = [];
            for (const log of logs) {
                for (const outcome of log.outcomes) {
                    if (outcome.userSatisfaction !== null) {
                        satisfactions.push(outcome.userSatisfaction);
                    }
                }
            }
            if (satisfactions.length > 0) {
                const avgSatisfaction = satisfactions.reduce((a, b) => a + b, 0) / satisfactions.length;
                preferenceSignals.averageSatisfaction = avgSatisfaction;
                if (avgSatisfaction < 7) {
                    improvementSuggestions.push('用户整体满意度较低，建议分析原因并改进服务');
                }
            }
            return {
                decisionPatterns,
                preferenceSignals,
                improvementSuggestions,
            };
        }
        catch (error) {
            this.logger.error(`获取用户决策学习失败: ${error}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
};
exports.DecisionLoggingService = DecisionLoggingService;
exports.DecisionLoggingService = DecisionLoggingService = DecisionLoggingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        core_1.ModuleRef])
], DecisionLoggingService);
//# sourceMappingURL=decision-logging.service.js.map