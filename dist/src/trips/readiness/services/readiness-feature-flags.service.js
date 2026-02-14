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
var ReadinessFeatureFlagsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessFeatureFlagsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../prisma/prisma.service");
const redis_service_1 = require("../../../redis/redis.service");
let ReadinessFeatureFlagsService = ReadinessFeatureFlagsService_1 = class ReadinessFeatureFlagsService {
    constructor(prisma, configService, redisService) {
        this.prisma = prisma;
        this.configService = configService;
        this.redisService = redisService;
        this.logger = new common_1.Logger(ReadinessFeatureFlagsService_1.name);
        this.featureFlagCache = new Map();
        this.CACHE_TTL_MS = 5 * 60 * 1000;
    }
    async onModuleInit() {
    }
    async isAIEnhancementEnabled(userId, feature = 'readiness_ai_enhancement') {
        var _a;
        const globalEnvFlag = this.configService.get(`FEATURE_FLAG_${feature.toUpperCase()}`);
        if (globalEnvFlag === false) {
            return false;
        }
        const globalFlag = await this.getGlobalFeatureFlag(feature);
        if ((globalFlag === null || globalFlag === void 0 ? void 0 : globalFlag.enabled) === false) {
            return false;
        }
        if (userId) {
            const userFlag = await this.getUserFeatureFlag(userId, feature);
            if ((userFlag === null || userFlag === void 0 ? void 0 : userFlag.enabled) === false) {
                return false;
            }
            if ((userFlag === null || userFlag === void 0 ? void 0 : userFlag.enabled) === true) {
                return true;
            }
        }
        return ((_a = globalFlag === null || globalFlag === void 0 ? void 0 : globalFlag.enabled) !== null && _a !== void 0 ? _a : this.configService.get(`FEATURE_FLAG_${feature.toUpperCase()}_DEFAULT`, false));
    }
    async getGlobalFeatureFlag(feature) {
        const cacheKey = `feature_flag:global:${feature}`;
        const cached = this.featureFlagCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return { enabled: cached.enabled };
        }
        const flag = await this.prisma.globalFeatureFlag.findUnique({
            where: { feature },
        });
        if (flag) {
            this.featureFlagCache.set(cacheKey, {
                enabled: flag.enabled,
                timestamp: Date.now(),
            });
            return flag;
        }
        return null;
    }
    async getUserFeatureFlag(userId, feature) {
        const cacheKey = `feature_flag:user:${userId}:${feature}`;
        const cached = this.featureFlagCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
            return { enabled: cached.enabled };
        }
        const flag = await this.prisma.userFeatureFlag.findUnique({
            where: {
                user_feature_flag_user_feature_unique: {
                    userId,
                    feature,
                },
            },
        });
        if (flag) {
            this.featureFlagCache.set(cacheKey, {
                enabled: flag.enabled,
                timestamp: Date.now(),
            });
            return flag;
        }
        return null;
    }
    async updateUserFeatureFlag(userId, feature, enabled) {
        await this.prisma.userFeatureFlag.upsert({
            where: {
                user_feature_flag_user_feature_unique: {
                    userId,
                    feature,
                },
            },
            update: { enabled, updatedAt: new Date() },
            create: {
                userId,
                feature,
                enabled,
            },
        });
        const cacheKey = `feature_flag:user:${userId}:${feature}`;
        this.featureFlagCache.delete(cacheKey);
    }
    async updateGlobalFeatureFlag(feature, enabled) {
        await this.prisma.globalFeatureFlag.upsert({
            where: { feature },
            update: { enabled, updatedAt: new Date() },
            create: {
                feature,
                enabled,
            },
        });
        const cacheKey = `feature_flag:global:${feature}`;
        this.featureFlagCache.delete(cacheKey);
    }
    async getABTestGroup(userId, experimentId) {
        const feature = `ab_test:${experimentId}`;
        const userFlag = await this.getUserFeatureFlag(userId, feature);
        if (userFlag && 'metadata' in userFlag && userFlag.metadata && typeof userFlag.metadata === 'object') {
            const metadata = userFlag.metadata;
            if (metadata.group) {
                return metadata.group;
            }
        }
        const hash = this.hashUserId(userId);
        const group = hash % 2 === 0 ? 'control' : 'treatment';
        await this.prisma.userFeatureFlag.upsert({
            where: {
                user_feature_flag_user_feature_unique: {
                    userId,
                    feature,
                },
            },
            update: {
                enabled: true,
                metadata: { group },
                updatedAt: new Date(),
            },
            create: {
                userId,
                feature,
                enabled: true,
                metadata: { group },
            },
        });
        const cacheKey = `feature_flag:user:${userId}:${feature}`;
        this.featureFlagCache.delete(cacheKey);
        return group;
    }
    hashUserId(userId) {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            const char = userId.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
};
exports.ReadinessFeatureFlagsService = ReadinessFeatureFlagsService;
exports.ReadinessFeatureFlagsService = ReadinessFeatureFlagsService = ReadinessFeatureFlagsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        redis_service_1.RedisService])
], ReadinessFeatureFlagsService);
//# sourceMappingURL=readiness-feature-flags.service.js.map