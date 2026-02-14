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
var ContextLearningService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextLearningService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const parallel_executor_service_1 = require("../../../rag/services/parallel-executor.service");
const context_prometheus_metrics_service_1 = require("./context-prometheus-metrics.service");
let ContextLearningService = ContextLearningService_1 = class ContextLearningService {
    constructor(prisma, parallelExecutor, metrics) {
        this.prisma = prisma;
        this.parallelExecutor = parallelExecutor;
        this.metrics = metrics;
        this.logger = new common_1.Logger(ContextLearningService_1.name);
        this.learningWeights = {
            context_built: 0.1,
            context_used: 0.3,
            decision_made: 0.6,
            user_feedback: 0.8,
        };
        this.decayFactor = 0.95;
        this.learningResultCache = new Map();
        this.cacheTtl = 60 * 60 * 1000;
        this.logger.log('Context学习服务已初始化');
        if (this.parallelExecutor) {
            this.logger.log('✅ 批量学习优化已启用');
        }
        if (this.metrics) {
            this.logger.log('✅ Prometheus指标收集已启用');
        }
    }
    async learn(input) {
        this.logger.debug(`学习Context: userId=${input.userId || 'none'}, eventType=${input.eventType}`);
        const startTime = Date.now();
        const phase = input.phase || 'unknown';
        const agent = input.agent || 'unknown';
        if (!this.prisma) {
            this.logger.warn('PrismaService 未注入，Context学习功能不可用');
            return {
                learningResult: {
                    confidence: 0,
                    sampleSize: 0,
                },
            };
        }
        try {
            const weight = this.learningWeights[input.eventType] || 0.1;
            switch (input.eventType) {
                case 'context_built':
                    await this.learnFromContextBuilt(input, weight);
                    break;
                case 'context_used':
                    await this.learnFromContextUsed(input, weight);
                    break;
                case 'decision_made':
                    await this.learnFromDecisionMade(input, weight);
                    break;
                case 'user_feedback':
                    await this.learnFromUserFeedback(input, weight);
                    break;
            }
            const learningResult = await this.getLearningResult(input.userId, input.phase, input.agent);
            if (this.metrics) {
                const processingTimeMs = Date.now() - startTime;
                this.metrics.recordLearningEvent(input.eventType, phase, agent, processingTimeMs);
                if (learningResult.updatedPriorities) {
                    const blockTypes = new Set();
                    for (const blockKey of Object.keys(learningResult.updatedPriorities)) {
                        const blockType = blockKey.split('_').slice(0, -1).join('_') || blockKey;
                        blockTypes.add(blockType);
                    }
                    for (const blockType of blockTypes) {
                        this.metrics.recordPriorityUpdate(phase, agent, blockType);
                    }
                }
                if (learningResult.recommendedBlocks && learningResult.recommendedBlocks.length > 0) {
                    for (const blockKey of learningResult.recommendedBlocks.slice(0, 10)) {
                        this.metrics.updateLearningStats(phase, agent, blockKey, learningResult.confidence, learningResult.sampleSize);
                    }
                }
            }
            return {
                learningResult,
            };
        }
        catch (error) {
            this.logger.error(`Context学习失败: ${error.message}`, error.stack);
            if (this.metrics) {
                const processingTimeMs = Date.now() - startTime;
                this.metrics.recordLearningEvent(input.eventType, phase, agent, processingTimeMs);
            }
            return {
                learningResult: {
                    confidence: 0,
                    sampleSize: 0,
                },
            };
        }
    }
    async learnFromContextBuilt(input, weight) {
        if (!input.eventData.contextPackage || !this.prisma) {
            return;
        }
        const blocks = input.eventData.contextPackage.blocks || [];
        for (const block of blocks) {
            await this.updateBlockImportance(input.userId, input.tripId, block.key, block.type, block.priority / 100, weight, input.phase, input.agent);
        }
    }
    async learnFromContextUsed(input, weight) {
        if (!input.eventData.usedBlocks || !this.prisma) {
            return;
        }
        for (const blockKey of input.eventData.usedBlocks) {
            await this.updateBlockUsage(input.userId, input.tripId, blockKey, weight, input.phase, input.agent);
        }
    }
    async learnFromDecisionMade(input, weight) {
        if (!input.eventData.decisionResult || !this.prisma) {
            return;
        }
        const { accepted, satisfaction = 0.5 } = input.eventData.decisionResult;
        if (accepted && satisfaction >= 0.7) {
            if (input.eventData.contextPackage) {
                const blocks = input.eventData.contextPackage.blocks || [];
                for (const block of blocks) {
                    await this.updateBlockFeedback(input.userId, input.tripId, block.key, block.type, true, weight * satisfaction, input.phase, input.agent);
                }
            }
        }
        else if (!accepted || satisfaction < 0.3) {
            if (input.eventData.contextPackage) {
                const blocks = input.eventData.contextPackage.blocks || [];
                for (const block of blocks) {
                    await this.updateBlockFeedback(input.userId, input.tripId, block.key, block.type, false, weight * (1 - satisfaction), input.phase, input.agent);
                }
            }
        }
    }
    async learnFromUserFeedback(input, weight) {
        if (!input.eventData.feedback || !this.prisma) {
            return;
        }
        const { relevantBlocks = [], irrelevantBlocks = [], missingBlocks = [] } = input.eventData.feedback;
        for (const blockKey of relevantBlocks) {
            await this.updateBlockFeedback(input.userId, input.tripId, blockKey, 'UNKNOWN', true, weight, input.phase, input.agent);
        }
        for (const blockKey of irrelevantBlocks) {
            await this.updateBlockFeedback(input.userId, input.tripId, blockKey, 'UNKNOWN', false, weight, input.phase, input.agent);
        }
        for (const blockKey of missingBlocks) {
            await this.updateBlockImportance(input.userId, input.tripId, blockKey, 'UNKNOWN', 0.8, weight, input.phase, input.agent);
        }
    }
    async updateBlockImportance(userId, tripId, blockKey, blockType, importanceScore, weight, phase, agent) {
        if (!this.prisma) {
            return;
        }
        try {
            const existing = await this.prisma.contextLearningResult.findFirst({
                where: {
                    userId: userId || null,
                    blockKey,
                    eventType: 'context_built',
                    phase: phase || null,
                    agent: agent || null,
                },
            });
            if (existing) {
                const oldScore = existing.importanceScore;
                const newScore = oldScore * this.decayFactor + importanceScore * weight;
                const newSampleSize = existing.sampleSize + 1;
                const newConfidence = Math.min(1.0, newSampleSize / 10);
                await this.prisma.contextLearningResult.update({
                    where: { id: existing.id },
                    data: {
                        importanceScore: newScore,
                        sampleSize: newSampleSize,
                        confidence: newConfidence,
                        updatedAt: new Date(),
                    },
                });
            }
            else {
                const duplicate = await this.prisma.contextLearningResult.findFirst({
                    where: {
                        userId: userId || null,
                        blockKey,
                        eventType: 'context_built',
                        phase: phase || null,
                        agent: agent || null,
                    },
                });
                if (!duplicate) {
                    await this.prisma.contextLearningResult.create({
                        data: {
                            userId: userId || null,
                            tripId: tripId || null,
                            eventType: 'context_built',
                            blockKey,
                            blockType,
                            importanceScore,
                            usageCount: 0,
                            positiveFeedbackCount: 0,
                            negativeFeedbackCount: 0,
                            confidence: 0.1,
                            sampleSize: 1,
                            phase: phase || null,
                            agent: agent || null,
                        },
                    });
                }
            }
        }
        catch (error) {
            this.logger.warn(`更新Block重要性失败: blockKey=${blockKey}, error=${error.message}`);
        }
    }
    async updateBlockUsage(userId, tripId, blockKey, weight, phase, agent) {
        if (!this.prisma) {
            return;
        }
        try {
            const existing = await this.prisma.contextLearningResult.findFirst({
                where: {
                    userId: userId || null,
                    blockKey,
                    eventType: 'context_used',
                    phase: phase || null,
                    agent: agent || null,
                },
            });
            if (existing) {
                await this.prisma.contextLearningResult.update({
                    where: { id: existing.id },
                    data: {
                        usageCount: existing.usageCount + 1,
                        importanceScore: Math.min(1.0, existing.importanceScore + weight * 0.1),
                        sampleSize: existing.sampleSize + 1,
                        confidence: Math.min(1.0, (existing.sampleSize + 1) / 10),
                        updatedAt: new Date(),
                    },
                });
            }
            else {
                const duplicate = await this.prisma.contextLearningResult.findFirst({
                    where: {
                        userId: userId || null,
                        blockKey,
                        eventType: 'context_used',
                        phase: phase || null,
                        agent: agent || null,
                    },
                });
                if (!duplicate) {
                    await this.prisma.contextLearningResult.create({
                        data: {
                            userId: userId || null,
                            tripId: tripId || null,
                            eventType: 'context_used',
                            blockKey,
                            blockType: 'UNKNOWN',
                            importanceScore: weight * 0.5,
                            usageCount: 1,
                            positiveFeedbackCount: 0,
                            negativeFeedbackCount: 0,
                            confidence: 0.1,
                            sampleSize: 1,
                            phase: phase || null,
                            agent: agent || null,
                        },
                    });
                }
            }
        }
        catch (error) {
            this.logger.warn(`更新Block使用情况失败: blockKey=${blockKey}, error=${error.message}`);
        }
    }
    async updateBlockFeedback(userId, tripId, blockKey, blockType, isPositive, weight, phase, agent) {
        if (!this.prisma) {
            return;
        }
        try {
            const existing = await this.prisma.contextLearningResult.findFirst({
                where: {
                    userId: userId || null,
                    blockKey,
                    eventType: 'user_feedback',
                    phase: phase || null,
                    agent: agent || null,
                },
            });
            if (existing) {
                const newPositiveCount = isPositive
                    ? existing.positiveFeedbackCount + 1
                    : existing.positiveFeedbackCount;
                const newNegativeCount = !isPositive
                    ? existing.negativeFeedbackCount + 1
                    : existing.negativeFeedbackCount;
                const feedbackScore = newPositiveCount / (newPositiveCount + newNegativeCount + 1);
                const newImportanceScore = existing.importanceScore * this.decayFactor + feedbackScore * weight;
                await this.prisma.contextLearningResult.update({
                    where: { id: existing.id },
                    data: {
                        importanceScore: Math.max(0, Math.min(1, newImportanceScore)),
                        positiveFeedbackCount: newPositiveCount,
                        negativeFeedbackCount: newNegativeCount,
                        sampleSize: existing.sampleSize + 1,
                        confidence: Math.min(1.0, (existing.sampleSize + 1) / 10),
                        updatedAt: new Date(),
                    },
                });
            }
            else {
                const duplicate = await this.prisma.contextLearningResult.findFirst({
                    where: {
                        userId: userId || null,
                        blockKey,
                        eventType: 'user_feedback',
                        phase: phase || null,
                        agent: agent || null,
                    },
                });
                if (!duplicate) {
                    await this.prisma.contextLearningResult.create({
                        data: {
                            userId: userId || null,
                            tripId: tripId || null,
                            eventType: 'user_feedback',
                            blockKey,
                            blockType,
                            importanceScore: isPositive ? weight * 0.7 : weight * 0.3,
                            usageCount: 0,
                            positiveFeedbackCount: isPositive ? 1 : 0,
                            negativeFeedbackCount: !isPositive ? 1 : 0,
                            confidence: 0.1,
                            sampleSize: 1,
                            phase: phase || null,
                            agent: agent || null,
                        },
                    });
                }
            }
        }
        catch (error) {
            this.logger.warn(`更新Block反馈失败: blockKey=${blockKey}, error=${error.message}`);
        }
    }
    async getLearningResult(userId, phase, agent) {
        const cacheKey = `${userId || 'global'}:${phase || 'all'}:${agent || 'all'}`;
        const cached = this.learningResultCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < cached.ttl) {
            this.logger.debug(`✅ 学习结果缓存命中: ${cacheKey}`);
            return cached.result;
        }
        if (!this.prisma) {
            return {
                confidence: 0,
                sampleSize: 0,
            };
        }
        try {
            const where = {};
            if (userId) {
                where.userId = userId;
            }
            if (phase) {
                where.phase = phase;
            }
            if (agent) {
                where.agent = agent;
            }
            const results = await this.prisma.contextLearningResult.findMany({
                where,
                orderBy: [
                    { importanceScore: 'desc' },
                    { confidence: 'desc' },
                ],
                take: 100,
            });
            if (results.length === 0) {
                return {
                    confidence: 0,
                    sampleSize: 0,
                };
            }
            const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
            const totalSampleSize = results.reduce((sum, r) => sum + r.sampleSize, 0);
            const avgConfidence = totalConfidence / results.length;
            const updatedPriorities = {};
            const recommendedBlocks = [];
            for (const result of results) {
                if (result.confidence >= 0.3) {
                    updatedPriorities[result.blockKey] = Math.round(result.importanceScore * 100);
                    if (result.importanceScore >= 0.6 && result.confidence >= 0.5) {
                        recommendedBlocks.push(result.blockKey);
                    }
                }
            }
            const result = {
                updatedPriorities,
                recommendedBlocks,
                confidence: avgConfidence,
                sampleSize: totalSampleSize,
            };
            this.learningResultCache.set(cacheKey, {
                result,
                timestamp: Date.now(),
                ttl: this.cacheTtl,
            });
            this.cleanExpiredCache();
            return result;
        }
        catch (error) {
            this.logger.error(`获取学习结果失败: ${error.message}`, error.stack);
            return {
                confidence: 0,
                sampleSize: 0,
            };
        }
    }
    async batchLearn(events, options) {
        var _a;
        if (events.length === 0) {
            return [];
        }
        const batchSize = (options === null || options === void 0 ? void 0 : options.batchSize) || 100;
        const maxConcurrency = (options === null || options === void 0 ? void 0 : options.maxConcurrency) || 5;
        this.logger.log(`批量学习开始: 事件数=${events.length}, batchSize=${batchSize}, maxConcurrency=${maxConcurrency}`);
        if (!this.parallelExecutor) {
            this.logger.warn('ParallelExecutor 不可用，使用顺序处理');
            const results = [];
            for (const event of events) {
                try {
                    const result = await this.learn(event);
                    results.push(result);
                }
                catch (error) {
                    this.logger.error(`批量学习失败: eventType=${event.eventType}, error=${error.message}`);
                    results.push({
                        learningResult: {
                            confidence: 0,
                            sampleSize: 0,
                        },
                    });
                }
            }
            return results;
        }
        const batches = [];
        for (let i = 0; i < events.length; i += batchSize) {
            batches.push(events.slice(i, i + batchSize));
        }
        const allResults = [];
        for (const batch of batches) {
            const tasks = batch.map((event, index) => ({
                id: `${event.eventType}_${index}_${Date.now()}`,
                operation: async () => {
                    try {
                        return await this.learn(event);
                    }
                    catch (error) {
                        this.logger.error(`批量学习失败: eventType=${event.eventType}, error=${error.message}`);
                        return {
                            learningResult: {
                                confidence: 0,
                                sampleSize: 0,
                            },
                        };
                    }
                },
                timeout: 10000,
            }));
            const batchResults = await this.parallelExecutor.executeAll(tasks, {
                maxConcurrency,
                taskTimeout: 10000,
                delayMs: 50,
            });
            for (const result of batchResults) {
                if (result.success && result.result) {
                    allResults.push(result.result);
                }
                else {
                    this.logger.error(`批量学习任务失败: ${result.id}, error=${(_a = result.error) === null || _a === void 0 ? void 0 : _a.message}`);
                    allResults.push({
                        learningResult: {
                            confidence: 0,
                            sampleSize: 0,
                        },
                    });
                }
            }
        }
        const stats = this.parallelExecutor.getStats(allResults.map((r, i) => ({
            id: `result_${i}`,
            success: r.learningResult.sampleSize > 0,
            duration: 0,
        })));
        this.logger.log(`批量学习完成: 总数=${events.length}, 成功=${stats.success}, ` +
            `失败=${stats.failed}, 平均置信度=${allResults.reduce((sum, r) => sum + r.learningResult.confidence, 0) / allResults.length}`);
        return allResults;
    }
    cleanExpiredCache() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, value] of this.learningResultCache.entries()) {
            if (now - value.timestamp >= value.ttl) {
                expiredKeys.push(key);
            }
        }
        for (const key of expiredKeys) {
            this.learningResultCache.delete(key);
        }
        if (this.learningResultCache.size > 1000) {
            const entries = Array.from(this.learningResultCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toRemove = Math.floor(entries.length * 0.2);
            for (let i = 0; i < toRemove; i++) {
                this.learningResultCache.delete(entries[i][0]);
            }
            this.logger.debug(`学习结果缓存过大，清理了最旧的 ${toRemove} 个条目`);
        }
    }
    async getBlockLearningStats(blockKey, userId, phase, agent) {
        if (!this.prisma) {
            return null;
        }
        try {
            const where = { blockKey };
            if (userId) {
                where.userId = userId;
            }
            if (phase) {
                where.phase = phase;
            }
            if (agent) {
                where.agent = agent;
            }
            const results = await this.prisma.contextLearningResult.findMany({
                where,
            });
            if (results.length === 0) {
                return null;
            }
            const aggregated = {
                blockKey,
                blockType: results[0].blockType,
                importanceScore: 0,
                relevanceScore: undefined,
                usageCount: 0,
                positiveFeedbackCount: 0,
                negativeFeedbackCount: 0,
                confidence: 0,
                sampleSize: 0,
            };
            for (const result of results) {
                aggregated.importanceScore += result.importanceScore * result.confidence;
                aggregated.usageCount += result.usageCount;
                aggregated.positiveFeedbackCount += result.positiveFeedbackCount;
                aggregated.negativeFeedbackCount += result.negativeFeedbackCount;
                aggregated.sampleSize += result.sampleSize;
            }
            const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
            if (totalConfidence > 0) {
                aggregated.importanceScore /= totalConfidence;
            }
            aggregated.confidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
            return aggregated;
        }
        catch (error) {
            this.logger.error(`获取Block学习统计失败: ${error.message}`, error.stack);
            return null;
        }
    }
};
exports.ContextLearningService = ContextLearningService;
exports.ContextLearningService = ContextLearningService = ContextLearningService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        parallel_executor_service_1.ParallelExecutorService,
        context_prometheus_metrics_service_1.ContextPrometheusMetricsService])
], ContextLearningService);
//# sourceMappingURL=context-learning.service.js.map