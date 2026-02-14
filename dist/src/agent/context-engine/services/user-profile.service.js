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
var UserProfileService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserProfileService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let UserProfileService = UserProfileService_1 = class UserProfileService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(UserProfileService_1.name);
        this.profileCache = new Map();
        this.cacheTtl = 60 * 60 * 1000;
        this.logger.log('用户画像服务已初始化');
    }
    async learnUserProfile(userId, events) {
        if (!this.prisma) {
            this.logger.warn('PrismaService 未注入，用户画像学习功能不可用');
            return this.createEmptyProfile(userId);
        }
        try {
            const profile = await this.buildUserProfile(userId, events);
            await this.updateUserProfile(userId, profile);
            this.profileCache.set(userId, {
                profile,
                timestamp: Date.now(),
                ttl: this.cacheTtl,
            });
            return profile;
        }
        catch (error) {
            this.logger.error(`学习用户画像失败: ${error.message}`, error.stack);
            return this.createEmptyProfile(userId);
        }
    }
    async buildUserProfile(userId, events) {
        const preferredBlockTypes = new Map();
        const preferredTopics = new Map();
        const blockImportanceScores = {};
        for (const event of events) {
            if (event.eventType === 'context_built' && event.eventData.contextPackage) {
                const blocks = event.eventData.contextPackage.blocks || [];
                for (const block of blocks) {
                    const typeCount = preferredBlockTypes.get(block.type) || 0;
                    preferredBlockTypes.set(block.type, typeCount + block.priority / 100);
                    const topic = this.extractTopicFromBlockKey(block.key);
                    if (topic) {
                        const topicCount = preferredTopics.get(topic) || 0;
                        preferredTopics.set(topic, topicCount + block.priority / 100);
                    }
                    if (!blockImportanceScores[block.key]) {
                        blockImportanceScores[block.key] = block.priority / 100;
                    }
                    else {
                        blockImportanceScores[block.key] =
                            (blockImportanceScores[block.key] + block.priority / 100) / 2;
                    }
                }
            }
            if (event.eventType === 'context_used' && event.eventData.usedBlocks) {
                for (const blockKey of event.eventData.usedBlocks) {
                    if (!blockImportanceScores[blockKey]) {
                        blockImportanceScores[blockKey] = 0.7;
                    }
                    else {
                        blockImportanceScores[blockKey] = Math.min(1.0, blockImportanceScores[blockKey] + 0.1);
                    }
                }
            }
            if (event.eventType === 'user_feedback' && event.eventData.feedback) {
                const { relevantBlocks, irrelevantBlocks } = event.eventData.feedback;
                if (relevantBlocks) {
                    for (const blockKey of relevantBlocks) {
                        if (!blockImportanceScores[blockKey]) {
                            blockImportanceScores[blockKey] = 0.8;
                        }
                        else {
                            blockImportanceScores[blockKey] = Math.min(1.0, blockImportanceScores[blockKey] + 0.2);
                        }
                    }
                }
                if (irrelevantBlocks) {
                    for (const blockKey of irrelevantBlocks) {
                        if (blockImportanceScores[blockKey]) {
                            blockImportanceScores[blockKey] = Math.max(0, blockImportanceScores[blockKey] - 0.2);
                        }
                    }
                }
            }
        }
        const sortedBlockTypes = Array.from(preferredBlockTypes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type]) => type);
        const sortedTopics = Array.from(preferredTopics.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([topic]) => topic);
        const sampleSize = events.length;
        const confidence = Math.min(1.0, sampleSize / 10);
        return {
            userId,
            preferredBlockTypes: sortedBlockTypes,
            preferredTopics: sortedTopics,
            blockImportanceScores,
            lastUpdated: new Date(),
            sampleSize,
            confidence,
        };
    }
    extractTopicFromBlockKey(blockKey) {
        const parts = blockKey.split('_');
        if (parts.length >= 2) {
            return parts[0];
        }
        return null;
    }
    async getUserProfile(userId) {
        const cached = this.profileCache.get(userId);
        if (cached && Date.now() - cached.timestamp < cached.ttl) {
            this.logger.debug(`✅ 用户画像缓存命中: userId=${userId}`);
            return cached.profile;
        }
        if (!this.prisma) {
            return null;
        }
        try {
            const learningResults = await this.prisma.contextLearningResult.findMany({
                where: {
                    userId,
                },
                orderBy: {
                    updatedAt: 'desc',
                },
                take: 100,
            });
            if (learningResults.length === 0) {
                return null;
            }
            const profile = await this.buildUserProfileFromLearningResults(userId, learningResults);
            this.profileCache.set(userId, {
                profile,
                timestamp: Date.now(),
                ttl: this.cacheTtl,
            });
            return profile;
        }
        catch (error) {
            this.logger.error(`获取用户画像失败: ${error.message}`, error.stack);
            return null;
        }
    }
    async buildUserProfileFromLearningResults(userId, learningResults) {
        const preferredBlockTypes = new Map();
        const blockImportanceScores = {};
        for (const result of learningResults) {
            const typeCount = preferredBlockTypes.get(result.blockType) || 0;
            preferredBlockTypes.set(result.blockType, typeCount + result.importanceScore);
            if (!blockImportanceScores[result.blockKey]) {
                blockImportanceScores[result.blockKey] = result.importanceScore;
            }
            else {
                blockImportanceScores[result.blockKey] =
                    (blockImportanceScores[result.blockKey] * 0.7 + result.importanceScore * result.confidence * 0.3);
            }
        }
        const sortedBlockTypes = Array.from(preferredBlockTypes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([type]) => type);
        const sampleSize = learningResults.length;
        const confidence = Math.min(1.0, sampleSize / 10);
        return {
            userId,
            preferredBlockTypes: sortedBlockTypes,
            preferredTopics: [],
            blockImportanceScores,
            lastUpdated: new Date(),
            sampleSize,
            confidence,
        };
    }
    async getRecommendedContext(userId, phase, agent, globalLearningResult) {
        const profile = await this.getUserProfile(userId);
        if (!profile || profile.confidence < 0.3) {
            return (globalLearningResult === null || globalLearningResult === void 0 ? void 0 : globalLearningResult.recommendedBlocks) || [];
        }
        const recommended = this.fuseRecommendations(profile, (globalLearningResult === null || globalLearningResult === void 0 ? void 0 : globalLearningResult.recommendedBlocks) || []);
        this.logger.debug(`个性化推荐: userId=${userId}, 推荐Block数=${recommended.length}, ` +
            `用户画像置信度=${profile.confidence}, 全局置信度=${(globalLearningResult === null || globalLearningResult === void 0 ? void 0 : globalLearningResult.confidence) || 0}`);
        return recommended;
    }
    fuseRecommendations(profile, globalRecommended) {
        const recommended = new Set();
        const userPreferredBlocks = Object.entries(profile.blockImportanceScores)
            .filter(([_, score]) => score >= 0.6)
            .sort(([_, a], [__, b]) => b - a)
            .slice(0, 5)
            .map(([blockKey]) => blockKey);
        for (const blockKey of userPreferredBlocks) {
            recommended.add(blockKey);
        }
        for (const blockKey of globalRecommended) {
            if (!recommended.has(blockKey)) {
                recommended.add(blockKey);
            }
        }
        return Array.from(recommended);
    }
    async updateUserProfile(userId, profile) {
        this.logger.debug(`用户画像已更新: userId=${userId}, sampleSize=${profile.sampleSize}, confidence=${profile.confidence}`);
    }
    createEmptyProfile(userId) {
        return {
            userId,
            preferredBlockTypes: [],
            preferredTopics: [],
            blockImportanceScores: {},
            lastUpdated: new Date(),
            sampleSize: 0,
            confidence: 0,
        };
    }
    cleanExpiredCache() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, value] of this.profileCache.entries()) {
            if (now - value.timestamp >= value.ttl) {
                expiredKeys.push(key);
            }
        }
        for (const key of expiredKeys) {
            this.profileCache.delete(key);
        }
    }
};
exports.UserProfileService = UserProfileService;
exports.UserProfileService = UserProfileService = UserProfileService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UserProfileService);
//# sourceMappingURL=user-profile.service.js.map