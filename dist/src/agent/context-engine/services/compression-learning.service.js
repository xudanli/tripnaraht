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
var CompressionLearningService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompressionLearningService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let CompressionLearningService = CompressionLearningService_1 = class CompressionLearningService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CompressionLearningService_1.name);
        this.compressionCache = new Map();
        this.cacheTtl = 60 * 60 * 1000;
        this.logger.log('压缩策略学习服务已初始化');
    }
    async learnCompressionStrategy(event) {
        if (event.eventType !== 'context_used' || !event.eventData.contextPackage) {
            return;
        }
        if (!this.prisma) {
            this.logger.warn('PrismaService 未注入，压缩策略学习功能不可用');
            return;
        }
        try {
            const usedBlocks = event.eventData.usedBlocks || [];
            const allBlocks = event.eventData.contextPackage.blocks || [];
            for (const block of allBlocks) {
                const wasUsed = usedBlocks.includes(block.key);
                await this.updateCompressionScore(block.key, block.type, wasUsed ? 0.1 : 0.9, wasUsed ? 0.0 : 0.5, event.userId, event.phase, event.agent);
            }
            this.logger.debug(`压缩策略学习完成: block总数=${allBlocks.length}, 使用=${usedBlocks.length}, ` +
                `未使用=${allBlocks.length - usedBlocks.length}`);
        }
        catch (error) {
            this.logger.error(`学习压缩策略失败: ${error.message}`, error.stack);
        }
    }
    async updateCompressionScore(blockKey, blockType, compressionScore, omissionScore, userId, phase, agent) {
        if (!this.prisma) {
            return;
        }
        try {
            const existing = await this.prisma.contextLearningResult.findFirst({
                where: {
                    userId: userId || null,
                    blockKey,
                    blockType,
                    eventType: 'context_used',
                    phase: phase || null,
                    agent: agent || null,
                },
            });
            if (existing) {
                const newCompressionScore = existing.importanceScore * 0.95 + compressionScore * 0.05;
                const newOmissionScore = (existing.relevanceScore || 0) * 0.95 + omissionScore * 0.05;
                await this.prisma.contextLearningResult.update({
                    where: { id: existing.id },
                    data: {
                        importanceScore: Math.max(0, Math.min(1, newCompressionScore)),
                        relevanceScore: Math.max(0, Math.min(1, newOmissionScore)),
                        sampleSize: existing.sampleSize + 1,
                        confidence: Math.min(1.0, (existing.sampleSize + 1) / 10),
                        updatedAt: new Date(),
                    },
                });
            }
            else {
                await this.prisma.contextLearningResult.create({
                    data: {
                        userId: userId || null,
                        blockKey,
                        blockType,
                        eventType: 'context_used',
                        importanceScore: compressionScore,
                        relevanceScore: omissionScore,
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
            const cacheKey = `${blockKey}:${blockType}:${userId || 'global'}:${phase || 'all'}:${agent || 'all'}`;
            this.compressionCache.delete(cacheKey);
        }
        catch (error) {
            this.logger.warn(`更新压缩评分失败: blockKey=${blockKey}, error=${error.message}`);
        }
    }
    async getCompressionStrategy(blocks, userId, phase, agent) {
        if (!this.prisma) {
            return {
                compress: [],
                omit: [],
                keep: blocks,
            };
        }
        try {
            const compressionScores = await Promise.all(blocks.map(async (block) => {
                const cacheKey = `${block.key}:${block.type}:${userId || 'global'}:${phase || 'all'}:${agent || 'all'}`;
                const cached = this.compressionCache.get(cacheKey);
                if (cached && Date.now() - cached.timestamp < cached.ttl) {
                    return cached.learning;
                }
                const result = await this.prisma.contextLearningResult.findFirst({
                    where: {
                        userId: userId || null,
                        blockKey: block.key,
                        blockType: block.type,
                        eventType: 'context_used',
                        phase: phase || null,
                        agent: agent || null,
                    },
                });
                const learning = {
                    blockKey: block.key,
                    blockType: block.type,
                    compressionScore: (result === null || result === void 0 ? void 0 : result.importanceScore) || 0.5,
                    omissionScore: (result === null || result === void 0 ? void 0 : result.relevanceScore) || 0.0,
                    sampleSize: (result === null || result === void 0 ? void 0 : result.sampleSize) || 0,
                    confidence: (result === null || result === void 0 ? void 0 : result.confidence) || 0,
                };
                this.compressionCache.set(cacheKey, {
                    learning,
                    timestamp: Date.now(),
                    ttl: this.cacheTtl,
                });
                return learning;
            }));
            const compress = [];
            const omit = [];
            const keep = [];
            for (let i = 0; i < blocks.length; i++) {
                const block = blocks[i];
                const score = compressionScores[i];
                if (score.confidence >= 0.3) {
                    if (score.omissionScore > 0.8) {
                        omit.push(block);
                    }
                    else if (score.compressionScore > 0.7) {
                        compress.push(block);
                    }
                    else {
                        keep.push(block);
                    }
                }
                else {
                    keep.push(block);
                }
            }
            this.logger.debug(`压缩策略生成: 总数=${blocks.length}, 压缩=${compress.length}, ` +
                `省略=${omit.length}, 保留=${keep.length}`);
            return {
                compress,
                omit,
                keep,
            };
        }
        catch (error) {
            this.logger.error(`获取压缩策略失败: ${error.message}`, error.stack);
            return {
                compress: [],
                omit: [],
                keep: blocks,
            };
        }
    }
    cleanExpiredCache() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, value] of this.compressionCache.entries()) {
            if (now - value.timestamp >= value.ttl) {
                expiredKeys.push(key);
            }
        }
        for (const key of expiredKeys) {
            this.compressionCache.delete(key);
        }
    }
};
exports.CompressionLearningService = CompressionLearningService;
exports.CompressionLearningService = CompressionLearningService = CompressionLearningService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CompressionLearningService);
//# sourceMappingURL=compression-learning.service.js.map