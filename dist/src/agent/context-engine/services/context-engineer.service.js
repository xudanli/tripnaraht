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
var ContextEngineerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextEngineerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const skills_registry_service_1 = require("../../../skills/services/skills-registry.service");
const skills_registry_token_1 = require("../../../skills/services/skills-registry.token");
const redis_service_1 = require("../../../redis/redis.service");
const context_metrics_service_1 = require("./context-metrics.service");
const context_prometheus_metrics_service_1 = require("./context-prometheus-metrics.service");
const context_learning_service_1 = require("./context-learning.service");
const user_profile_service_1 = require("./user-profile.service");
const compression_learning_service_1 = require("./compression-learning.service");
let ContextEngineerService = ContextEngineerService_1 = class ContextEngineerService {
    constructor(prisma, skillsRegistry, redisService, metricsService, prometheusMetrics, learningService, userProfileService, compressionLearningService) {
        this.prisma = prisma;
        this.skillsRegistry = skillsRegistry;
        this.redisService = redisService;
        this.metricsService = metricsService;
        this.prometheusMetrics = prometheusMetrics;
        this.learningService = learningService;
        this.userProfileService = userProfileService;
        this.compressionLearningService = compressionLearningService;
        this.logger = new common_1.Logger(ContextEngineerService_1.name);
        this.memoryCache = new Map();
        this.packageStore = new Map();
        this.l1CacheTtl = 5 * 60 * 1000;
        this.l2CacheTtl = 15 * 60 * 1000;
        this.cacheKeyPrefix = 'context_package:';
        this.inFlightBuilds = new Map();
        this.skillsCalledInBuild = [];
        if (this.redisService) {
            this.logger.log('Context Package 持久化缓存已启用（Redis）');
        }
        else {
            this.logger.log('Context Package 使用内存缓存（Redis 不可用）');
        }
        if (this.metricsService) {
            this.logger.log('Context Package 监控指标已启用');
        }
    }
    async build(options, useCache = true) {
        const buildStartTime = Date.now();
        this.logger.debug(`Building context package: tripId=${options.tripId}, phase=${options.phase}, agent=${options.agent}`);
        this.skillsCalledInBuild = [];
        let cacheHit = false;
        const cacheKey = this.buildCacheKey(options);
        const inFlightBuild = this.inFlightBuilds.get(cacheKey);
        if (inFlightBuild) {
            this.logger.debug(`🔄 复用正在进行的 Context Package 构建: ${cacheKey}`);
            return inFlightBuild;
        }
        if (useCache) {
            const memoryCached = this.memoryCache.get(cacheKey);
            if (memoryCached && Date.now() - memoryCached.timestamp < this.l1CacheTtl) {
                this.logger.debug(`✅ L1缓存命中: ${cacheKey}`);
                cacheHit = true;
                if (this.metricsService) {
                    await this.metricsService.recordMetrics(memoryCached.package, {
                        tripId: options.tripId,
                        phase: options.phase,
                        agent: options.agent,
                        buildTimeMs: Date.now() - buildStartTime,
                        cacheHit: true,
                        cacheLevel: 'L1',
                        skillsCalled: [],
                        userQuery: options.userQuery,
                    });
                }
                if (this.prometheusMetrics) {
                    this.prometheusMetrics.recordBuild(options.phase, options.agent, Date.now() - buildStartTime, true, 'L1');
                }
                return memoryCached.package;
            }
            if (this.redisService) {
                try {
                    const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
                    const cached = await this.redisService.get(redisKey);
                    if (cached) {
                        this.logger.debug(`✅ L2缓存命中: ${cacheKey}`);
                        cacheHit = true;
                        this.memoryCache.set(cacheKey, {
                            package: cached,
                            timestamp: Date.now(),
                        });
                        if (this.metricsService) {
                            await this.metricsService.recordMetrics(cached, {
                                tripId: options.tripId,
                                phase: options.phase,
                                agent: options.agent,
                                buildTimeMs: Date.now() - buildStartTime,
                                cacheHit: true,
                                cacheLevel: 'L2',
                                skillsCalled: [],
                                userQuery: options.userQuery,
                            });
                        }
                        if (this.prometheusMetrics) {
                            this.prometheusMetrics.recordBuild(options.phase, options.agent, Date.now() - buildStartTime, true, 'L2');
                        }
                        return cached;
                    }
                }
                catch (error) {
                    this.logger.warn(`从 L2 Redis 获取缓存失败: ${error.message}`);
                }
            }
        }
        const enhancedOptions = await this.applyLearningResults(options);
        const buildPromise = this.doBuild(enhancedOptions, cacheKey);
        this.inFlightBuilds.set(cacheKey, buildPromise);
        try {
            const result = await buildPromise;
            if (useCache) {
                await this.writeToCache(cacheKey, result);
            }
            return result;
        }
        finally {
            this.inFlightBuilds.delete(cacheKey);
        }
    }
    async doBuild(options, cacheKey) {
        const buildStartTime = Date.now();
        const tokenBudget = options.tokenBudget || 3600;
        const blocks = [];
        try {
            if (options.tripId) {
                const worldBlocks = await this.buildWorldModelBlocks(options.tripId, options.phase);
                blocks.push(...worldBlocks);
            }
            const [countryBlocksResult, planBlocksResult] = await Promise.allSettled([
                options.requiredTopics && options.requiredTopics.length > 0
                    ? this.buildCountryPackBlocks(options.tripId, options.requiredTopics, options.phase)
                    : Promise.resolve([]),
                options.tripId && this.shouldIncludePlanBlocks(options.phase, options.agent)
                    ? this.buildPlanBlocks(options.tripId, options.phase, options.agent)
                    : Promise.resolve([]),
            ]);
            if (countryBlocksResult.status === 'fulfilled') {
                blocks.push(...countryBlocksResult.value);
            }
            else {
                this.logger.warn(`获取国家包块失败: ${countryBlocksResult.reason}`);
            }
            if (planBlocksResult.status === 'fulfilled') {
                blocks.push(...planBlocksResult.value);
            }
            else {
                this.logger.warn(`获取计划块失败: ${planBlocksResult.reason}`);
            }
            if (options.tripId) {
                const decisionBlocks = await this.buildDecisionLogBlocks(options.tripId, options.phase);
                blocks.push(...decisionBlocks);
            }
            if (options.tripId) {
                const constraintBlocks = await this.buildConstraintBlocks(options.tripId, options.phase);
                blocks.push(...constraintBlocks);
            }
            if (options.includeApiDocs) {
                const apiDocBlocks = await this.buildApiDocumentationBlocks(options.apiDocCategories || ['ALL'], options.userQuery);
                blocks.push(...apiDocBlocks);
            }
            const totalTokens = this.estimateTokens(blocks);
            const sortedBlocks = this.sortAndTrimBlocks(blocks, tokenBudget, options.includePrivate || false);
            let finalBlocks = sortedBlocks;
            let compressed = false;
            if (this.estimateTokens(sortedBlocks) > tokenBudget) {
                finalBlocks = await this.compressBlocks(sortedBlocks, tokenBudget, options.userId, options.phase, options.agent);
                compressed = true;
            }
            const buildTimeMs = Date.now() - buildStartTime;
            const packageId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const contextPackage = {
                id: packageId,
                tripId: options.tripId,
                phase: options.phase,
                agent: options.agent,
                userQuery: options.userQuery,
                blocks: finalBlocks,
                totalTokens: this.estimateTokens(finalBlocks),
                tokenBudget,
                compressed,
                createdAt: new Date().toISOString(),
                metadata: {
                    originalBlocksCount: blocks.length,
                    finalBlocksCount: finalBlocks.length,
                    buildTimeMs: Date.now() - buildStartTime,
                    skillsCalled: [...this.skillsCalledInBuild],
                },
            };
            this.packageStore.set(packageId, contextPackage);
            if (this.packageStore.size > 1000) {
                const oldestKey = Array.from(this.packageStore.keys())[0];
                this.packageStore.delete(oldestKey);
            }
            if (this.metricsService) {
                await this.metricsService.recordMetrics(contextPackage, {
                    tripId: options.tripId,
                    phase: options.phase,
                    agent: options.agent,
                    buildTimeMs: Date.now() - buildStartTime,
                    cacheHit: false,
                    cacheLevel: 'none',
                    skillsCalled: [...this.skillsCalledInBuild],
                    userQuery: options.userQuery,
                });
            }
            if (this.prometheusMetrics) {
                const buildTimeMs = Date.now() - buildStartTime;
                this.prometheusMetrics.recordBuild(options.phase, options.agent, buildTimeMs, false, 'none');
                this.prometheusMetrics.recordTokenUsage(options.phase, options.agent, contextPackage.totalTokens, contextPackage.tokenBudget);
                this.prometheusMetrics.recordBlockStats(options.phase, options.agent, contextPackage.blocks.map((b) => ({
                    type: b.type,
                    priority: b.priority,
                    visibility: b.visibility,
                })));
            }
            return contextPackage;
            return contextPackage;
        }
        catch (error) {
            this.logger.error(`Failed to build context package: ${error}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    buildCacheKey(options) {
        var _a, _b;
        const topics = ((_a = options.requiredTopics) === null || _a === void 0 ? void 0 : _a.sort().join(',')) || '';
        const excludeTopics = ((_b = options.excludeTopics) === null || _b === void 0 ? void 0 : _b.sort().join(',')) || '';
        const includePrivate = options.includePrivate ? 'true' : 'false';
        let queryHash = '';
        if (options.userQuery) {
            const queryText = options.userQuery.substring(0, 100).trim().toLowerCase();
            queryHash = this.simpleHash(queryText);
        }
        return `tripId:${options.tripId || 'none'}:phase:${options.phase}:agent:${options.agent}:topics:${topics}:excludeTopics:${excludeTopics}:budget:${options.tokenBudget || 3600}:includePrivate:${includePrivate}:queryHash:${queryHash}`;
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    async applyLearningResults(options) {
        if (!this.learningService) {
            return options;
        }
        try {
            const globalLearningResult = await this.learningService.getLearningResult(undefined, options.phase, options.agent);
            let personalizedRecommended = [];
            if (options.userId && this.userProfileService) {
                personalizedRecommended = await this.userProfileService.getRecommendedContext(options.userId, options.phase, options.agent, {
                    recommendedBlocks: globalLearningResult.recommendedBlocks,
                    confidence: globalLearningResult.confidence,
                });
            }
            else {
                personalizedRecommended = globalLearningResult.recommendedBlocks || [];
            }
            const useGlobal = !options.userId || !this.userProfileService;
            const confidence = useGlobal
                ? globalLearningResult.confidence
                : Math.max(globalLearningResult.confidence, 0.3);
            if (confidence < 0.3 || globalLearningResult.sampleSize < 5) {
                this.logger.debug(`学习结果置信度较低，不应用: confidence=${confidence}, sampleSize=${globalLearningResult.sampleSize}`);
                return options;
            }
            if (personalizedRecommended.length > 0) {
                const recommended = personalizedRecommended.filter((block) => { var _a; return !((_a = options.requiredTopics) === null || _a === void 0 ? void 0 : _a.includes(block)); });
                if (recommended.length > 0) {
                    this.logger.debug(`应用${useGlobal ? '全局' : '个性化'}推荐: 添加推荐Block=${recommended.length}个, ` +
                        `confidence=${confidence}, userId=${options.userId || 'none'}`);
                    return {
                        ...options,
                        requiredTopics: [
                            ...(options.requiredTopics || []),
                            ...recommended,
                        ],
                    };
                }
            }
            return options;
        }
        catch (error) {
            this.logger.warn(`应用学习结果失败: ${error.message}`);
            return options;
        }
    }
    async writeToCache(cacheKey, contextPackage) {
        this.memoryCache.set(cacheKey, {
            package: contextPackage,
            timestamp: Date.now(),
        });
        this.cleanExpiredMemoryCache();
        if (this.redisService) {
            try {
                const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
                const ttlSeconds = Math.floor(this.l2CacheTtl / 1000);
                await this.redisService.set(redisKey, contextPackage, ttlSeconds);
                this.logger.debug(`✅ Context Package 已存入 L2 Redis: ${cacheKey} (TTL: ${ttlSeconds}s)`);
            }
            catch (error) {
                this.logger.warn(`存入 L2 Redis 失败: ${error.message}`);
            }
        }
    }
    cleanExpiredMemoryCache() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, value] of this.memoryCache.entries()) {
            if (now - value.timestamp >= this.l1CacheTtl) {
                expiredKeys.push(key);
            }
        }
        for (const key of expiredKeys) {
            this.memoryCache.delete(key);
        }
        if (expiredKeys.length > 0) {
            this.logger.debug(`清理了 ${expiredKeys.length} 个过期内存缓存`);
        }
        if (this.memoryCache.size > 100) {
            const entries = Array.from(this.memoryCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toRemove = Math.floor(entries.length * 0.2);
            for (let i = 0; i < toRemove; i++) {
                this.memoryCache.delete(entries[i][0]);
            }
            this.logger.debug(`内存缓存过大，清理了最旧的 ${toRemove} 个条目`);
        }
    }
    async clearCache() {
        const memorySize = this.memoryCache.size;
        this.memoryCache.clear();
        this.logger.debug(`清除了 ${memorySize} 个内存缓存条目`);
        if (this.redisService) {
            try {
                this.logger.debug('Redis 缓存通过 TTL 自动过期，无需手动清除');
            }
            catch (error) {
                this.logger.warn(`清除 Redis 缓存失败: ${error.message}`);
            }
        }
    }
    async getCacheStats() {
        return {
            memorySize: this.memoryCache.size,
            memoryKeys: Array.from(this.memoryCache.keys()),
            redisEnabled: this.redisService !== undefined,
        };
    }
    async buildWorldModelBlocks(tripId, phase) {
        const blocks = [];
        try {
            if (this.prisma) {
                const trip = await this.prisma.trip.findUnique({
                    where: { id: tripId },
                    include: {
                        TripDay: {
                            include: {
                                ItineraryItem: true,
                            },
                        },
                    },
                });
                if (trip) {
                    blocks.push({
                        key: 'WORLD_MODEL',
                        type: 'WORLD_MODEL',
                        text: `目的地: ${trip.destination}, 日期: ${trip.startDate.toISOString().split('T')[0]} - ${trip.endDate.toISOString().split('T')[0]}`,
                        priority: 90,
                        visibility: 'public',
                        provenance: {
                            source: 'db',
                            identifier: `trip:${tripId}`,
                            timestamp: new Date().toISOString(),
                        },
                    });
                }
            }
        }
        catch (error) {
            this.logger.warn(`Failed to build world model blocks: ${error}`);
        }
        return blocks;
    }
    async buildCountryPackBlocks(tripId, topics, phase) {
        const blocks = [];
        try {
            let countryCode;
            if (tripId && this.prisma) {
                try {
                    const trip = await this.prisma.trip.findUnique({
                        where: { id: tripId },
                        select: { destination: true },
                    });
                    if (trip === null || trip === void 0 ? void 0 : trip.destination) {
                        const dest = trip.destination.trim().toUpperCase();
                        countryCode = dest.includes('_') ? dest.split('_')[0] : dest;
                        if (countryCode.length === 2 && /^[A-Z]{2}$/.test(countryCode)) {
                        }
                        else {
                            this.logger.warn(`国家代码格式不正确: ${countryCode}，期望 ISO 3166-1 alpha-2 格式`);
                            countryCode = undefined;
                        }
                    }
                }
                catch (error) {
                    this.logger.warn(`获取行程信息失败: ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
                }
            }
            if (!countryCode) {
                this.logger.warn(`无法获取国家代码 (tripId: ${tripId})，跳过国家包块`);
                return blocks;
            }
            if (!this.skillsRegistry) {
                this.logger.warn(`SkillsRegistryService 未注入，跳过国家包块`);
                return blocks;
            }
            const countryPackGetBlocksSkill = this.skillsRegistry.getSkill('countryPack.getBlocks');
            if (countryPackGetBlocksSkill) {
                this.skillsCalledInBuild.push('countryPack.getBlocks');
                const result = await countryPackGetBlocksSkill.execute({
                    packId: countryCode,
                    topics: topics,
                    phase,
                });
                if (result.blocks) {
                    blocks.push(...result.blocks);
                }
                if (result.missingTopics && result.missingTopics.length > 0) {
                    this.logger.debug(`国家包缺失主题: ${result.missingTopics.join(', ')}`);
                }
            }
            else {
                this.logger.warn(`找不到 countryPack.getBlocks skill`);
            }
        }
        catch (error) {
            this.logger.warn(`构建国家包块失败: ${error}`);
        }
        return blocks;
    }
    shouldIncludePlanBlocks(phase, agent) {
        return agent === 'DrDre' || agent === 'Neptune' || phase.includes('adjust') || phase.includes('repair');
    }
    async buildPlanBlocks(tripId, phase, agent) {
        const blocks = [];
        try {
            if (!this.skillsRegistry) {
                this.logger.warn(`SkillsRegistryService 未注入，跳过计划块`);
                return blocks;
            }
            const scope = [];
            if (agent === 'DrDre' || agent === 'Neptune') {
                scope.push('day:1');
                scope.push('rejection:last');
            }
            else if (phase.includes('adjust') || phase.includes('repair')) {
                scope.push('rejection:last');
            }
            const planSelectSlicesSkill = this.skillsRegistry.getSkill('plan.selectSlices');
            if (planSelectSlicesSkill && scope.length > 0) {
                this.skillsCalledInBuild.push('plan.selectSlices');
                const result = await planSelectSlicesSkill.execute({
                    tripId,
                    scope,
                    phase,
                });
                if (result.blocks) {
                    blocks.push(...result.blocks);
                }
            }
            else if (scope.length === 0) {
                this.logger.debug(`当前 phase=${phase}, agent=${agent} 不需要计划块`);
            }
            else {
                this.logger.warn(`找不到 plan.selectSlices skill`);
            }
        }
        catch (error) {
            this.logger.warn(`构建计划块失败: ${error}`);
        }
        return blocks;
    }
    async buildDecisionLogBlocks(tripId, phase) {
        const blocks = [];
        try {
            if (this.prisma) {
                const recentLogs = await this.prisma.decisionLog.findMany({
                    where: { tripId },
                    orderBy: { timestamp: 'desc' },
                    take: 5,
                });
                if (recentLogs.length > 0) {
                    const logSummary = recentLogs
                        .map((log) => `[${log.persona}] ${log.action}: ${log.explanation} (${log.reasonCodes.join(', ')})`)
                        .join('\n');
                    blocks.push({
                        key: 'DECISION_LOG',
                        type: 'DECISION_LOG',
                        text: `最近的决策日志:\n${logSummary}`,
                        priority: 70,
                        visibility: 'public',
                        provenance: {
                            source: 'db',
                            identifier: `decision_logs:trip:${tripId}`,
                            timestamp: new Date().toISOString(),
                        },
                        data: {
                            logCount: recentLogs.length,
                            logs: recentLogs.map((log) => ({
                                persona: log.persona,
                                action: log.action,
                                explanation: log.explanation,
                                reasonCodes: log.reasonCodes,
                                timestamp: log.timestamp.toISOString(),
                            })),
                        },
                    });
                }
            }
        }
        catch (error) {
            this.logger.warn(`Failed to build decision log blocks: ${error}`);
        }
        return blocks;
    }
    async buildConstraintBlocks(tripId, phase) {
        const blocks = [];
        try {
            if (!this.prisma) {
                return blocks;
            }
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                select: {
                    budgetConfig: true,
                    pacingConfig: true,
                    metadata: true,
                },
            });
            if (trip) {
                const constraints = [];
                if (trip.budgetConfig) {
                    const budget = trip.budgetConfig;
                    if (budget.maxBudget) {
                        constraints.push(`预算限制: ${budget.maxBudget} ${budget.currency || '元'}`);
                    }
                }
                if (trip.pacingConfig) {
                    const pacing = trip.pacingConfig;
                    if (pacing.pace) {
                        constraints.push(`节奏偏好: ${pacing.pace}`);
                    }
                }
                if (trip.metadata) {
                    const metadata = trip.metadata;
                    if (metadata.constraints && Array.isArray(metadata.constraints)) {
                        constraints.push(...metadata.constraints.map((c) => String(c)));
                    }
                }
                if (constraints.length > 0) {
                    blocks.push({
                        key: 'CONSTRAINTS',
                        type: 'CONSTRAINTS',
                        text: `约束条件:\n${constraints.join('\n')}`,
                        priority: 75,
                        visibility: 'public',
                        provenance: {
                            source: 'db',
                            identifier: `trip:${tripId}:constraints`,
                            timestamp: new Date().toISOString(),
                        },
                        data: {
                            constraints,
                        },
                    });
                }
                if (trip.metadata) {
                    const metadata = trip.metadata;
                    if (metadata.userProfile) {
                        blocks.push({
                            key: 'USER_PROFILE',
                            type: 'USER_PROFILE',
                            text: `用户画像: ${JSON.stringify(metadata.userProfile).substring(0, 200)}`,
                            priority: 60,
                            visibility: 'public',
                            provenance: {
                                source: 'db',
                                identifier: `trip:${tripId}:userProfile`,
                                timestamp: new Date().toISOString(),
                            },
                            data: metadata.userProfile,
                        });
                    }
                }
            }
        }
        catch (error) {
            this.logger.warn(`构建约束块失败: ${error}`);
        }
        return blocks;
    }
    async buildApiDocumentationBlocks(categories, userQuery) {
        const blocks = [];
        const includeAll = categories.includes('ALL');
        try {
            if (includeAll || categories.includes('ROLL')) {
                blocks.push({
                    key: 'API_DOC_ROLL',
                    type: 'API_DOCUMENTATION',
                    text: this.getRollApiSummary(),
                    priority: 40,
                    visibility: 'public',
                    provenance: {
                        source: 'computed',
                        identifier: 'api-docs:roll',
                        timestamp: new Date().toISOString(),
                    },
                    data: {
                        category: 'ROLL',
                        endpoints: this.getRollEndpoints(),
                    },
                });
            }
            if (includeAll || categories.includes('ADMIN')) {
                blocks.push({
                    key: 'API_DOC_ADMIN',
                    type: 'API_DOCUMENTATION',
                    text: this.getAdminApiSummary(),
                    priority: 35,
                    visibility: 'public',
                    provenance: {
                        source: 'computed',
                        identifier: 'api-docs:admin',
                        timestamp: new Date().toISOString(),
                    },
                    data: {
                        category: 'ADMIN',
                        endpoints: this.getAdminEndpoints(),
                    },
                });
            }
            if (includeAll || categories.includes('CONTEXT')) {
                blocks.push({
                    key: 'API_DOC_CONTEXT',
                    type: 'API_DOCUMENTATION',
                    text: this.getContextApiSummary(),
                    priority: 45,
                    visibility: 'public',
                    provenance: {
                        source: 'computed',
                        identifier: 'api-docs:context',
                        timestamp: new Date().toISOString(),
                    },
                    data: {
                        category: 'CONTEXT',
                        endpoints: this.getContextEndpoints(),
                    },
                });
            }
            if (includeAll || categories.includes('TRAINING')) {
                blocks.push({
                    key: 'API_DOC_TRAINING',
                    type: 'API_DOCUMENTATION',
                    text: this.getTrainingApiSummary(),
                    priority: 30,
                    visibility: 'public',
                    provenance: {
                        source: 'computed',
                        identifier: 'api-docs:training',
                        timestamp: new Date().toISOString(),
                    },
                    data: {
                        category: 'TRAINING',
                        endpoints: this.getTrainingEndpoints(),
                    },
                });
            }
            if (includeAll || categories.includes('AGENT')) {
                blocks.push({
                    key: 'API_DOC_AGENT',
                    type: 'API_DOCUMENTATION',
                    text: this.getAgentApiSummary(),
                    priority: 50,
                    visibility: 'public',
                    provenance: {
                        source: 'computed',
                        identifier: 'api-docs:agent',
                        timestamp: new Date().toISOString(),
                    },
                    data: {
                        category: 'AGENT',
                        endpoints: this.getAgentEndpoints(),
                    },
                });
            }
            if (includeAll || categories.includes('TRIPS')) {
                blocks.push({
                    key: 'API_DOC_TRIPS',
                    type: 'API_DOCUMENTATION',
                    text: this.getTripsApiSummary(),
                    priority: 55,
                    visibility: 'public',
                    provenance: {
                        source: 'computed',
                        identifier: 'api-docs:trips',
                        timestamp: new Date().toISOString(),
                    },
                    data: {
                        category: 'TRIPS',
                        endpoints: this.getTripsEndpoints(),
                    },
                });
            }
            if (includeAll || categories.includes('DECISION')) {
                blocks.push({
                    key: 'API_DOC_DECISION',
                    type: 'API_DOCUMENTATION',
                    text: this.getDecisionApiSummary(),
                    priority: 45,
                    visibility: 'public',
                    provenance: {
                        source: 'computed',
                        identifier: 'api-docs:decision',
                        timestamp: new Date().toISOString(),
                    },
                    data: {
                        category: 'DECISION',
                        endpoints: this.getDecisionEndpoints(),
                    },
                });
            }
            this.logger.debug(`构建了 ${blocks.length} 个 API 文档块`);
        }
        catch (error) {
            this.logger.warn(`构建 API 文档块失败: ${error}`);
        }
        return blocks;
    }
    getRollApiSummary() {
        return `ROLL 架构 API:
- GET /api/training/roll/metrics - 获取 ROLL 监控指标
- GET /api/training/roll/workers/status - 获取 Workers 状态
- GET /api/training/roll/health - 健康检查
- POST /api/training/roll/ab-test/create - 创建 A/B 测试实验
- POST /api/training/roll/ab-test/analyze - 分析 A/B 测试结果
- GET /api/training/roll/ab-test/should-use - 检查是否使用 ROLL

Python Bridge Service (localhost:8001):
- POST /api/actor/generate-trajectory - 生成轨迹
- POST /api/reward/compute - 计算奖励
- POST /api/policy/predict - 策略推理
- POST /api/training/start - 启动训练`;
    }
    getRollEndpoints() {
        return [
            { method: 'GET', path: '/api/training/roll/metrics', description: '获取 ROLL 监控指标' },
            { method: 'GET', path: '/api/training/roll/workers/status', description: '获取 Workers 状态' },
            { method: 'GET', path: '/api/training/roll/health', description: '健康检查' },
            { method: 'POST', path: '/api/training/roll/ab-test/create', description: '创建 A/B 测试实验' },
            { method: 'POST', path: '/api/training/roll/ab-test/analyze', description: '分析 A/B 测试结果' },
            { method: 'GET', path: '/api/training/roll/ab-test/should-use', description: '检查是否使用 ROLL' },
        ];
    }
    getAdminApiSummary() {
        return `后台管理 API:
Agent 管理:
- GET /api/agent/admin/runs/stats - 获取运行统计
- GET /api/agent/admin/performance - 性能分析
- GET /api/agent/admin/runs - 运行列表
- GET /api/agent/admin/runs/:id - 运行详情
- POST /api/agent/admin/runs/:id/cancel - 取消运行
- GET /api/agent/admin/attempts - Attempt 列表

Context 管理:
- GET /api/context/admin/metrics - Context 指标
- GET /api/context/admin/packages - Package 列表
- GET /api/context/admin/analytics - 使用分析`;
    }
    getAdminEndpoints() {
        return [
            { method: 'GET', path: '/api/agent/admin/runs/stats', description: '获取运行统计' },
            { method: 'GET', path: '/api/agent/admin/performance', description: '性能分析' },
            { method: 'GET', path: '/api/agent/admin/runs', description: '运行列表' },
            { method: 'GET', path: '/api/agent/admin/runs/:id', description: '运行详情' },
            { method: 'POST', path: '/api/agent/admin/runs/:id/cancel', description: '取消运行' },
            { method: 'GET', path: '/api/context/admin/metrics', description: 'Context 指标' },
            { method: 'GET', path: '/api/context/admin/packages', description: 'Package 列表' },
        ];
    }
    getContextApiSummary() {
        return `Context Engine API:
- POST /api/context/build - 构建 Context Package
- POST /api/context/compress - 压缩 Context
- POST /api/context/project-state - 获取项目状态
- POST /api/context/write-back - 写回数据
- GET /api/context/metrics - 获取 Context 指标

参数说明:
- tripId: 行程 ID
- phase: 规划阶段 (INITIAL_PLANNING, REFINEMENT, FINALIZATION)
- agent: Agent 类型 (planning-assistant, journey-assistant)
- tokenBudget: Token 预算 (默认 8000)
- includeApiDocs: 是否包含 API 文档`;
    }
    getContextEndpoints() {
        return [
            { method: 'POST', path: '/api/context/build', description: '构建 Context Package' },
            { method: 'POST', path: '/api/context/compress', description: '压缩 Context' },
            { method: 'POST', path: '/api/context/project-state', description: '获取项目状态' },
            { method: 'POST', path: '/api/context/write-back', description: '写回数据' },
            { method: 'GET', path: '/api/context/metrics', description: '获取 Context 指标' },
        ];
    }
    getTrainingApiSummary() {
        return `训练相关 API:
轨迹收集:
- POST /api/training/trajectories/collect - 收集规划轨迹
- POST /api/training/trajectories/:id/validate - 验证轨迹质量
- GET /api/training/trajectories/by-request/:requestId - 按请求ID查找轨迹

批次处理:
- POST /api/training/batches/prepare - 准备训练批次
- POST /api/training/batches/:id/export/jsonl - 导出 JSONL 格式

训练任务:
- POST /api/training/jobs - 创建训练任务
- POST /api/training/jobs/:id/start - 启动训练
- GET /api/training/jobs/:id - 获取任务状态`;
    }
    getTrainingEndpoints() {
        return [
            { method: 'POST', path: '/api/training/trajectories/collect', description: '收集规划轨迹' },
            { method: 'POST', path: '/api/training/batches/prepare', description: '准备训练批次' },
            { method: 'POST', path: '/api/training/jobs', description: '创建训练任务' },
            { method: 'GET', path: '/api/training/jobs/:id', description: '获取任务状态' },
        ];
    }
    getAgentApiSummary() {
        return `Agent 相关 API:
核心接口:
- POST /api/agent/route-and-run - 智能路由和执行
- POST /api/agent/plan-execute - 规划执行
- GET /api/agent/status/:runId - 获取执行状态

规划工作台:
- POST /api/planning-workbench/start - 开始规划会话
- POST /api/planning-workbench/message - 发送消息
- GET /api/planning-workbench/session/:id - 获取会话状态`;
    }
    getAgentEndpoints() {
        return [
            { method: 'POST', path: '/api/agent/route-and-run', description: '智能路由和执行' },
            { method: 'POST', path: '/api/agent/plan-execute', description: '规划执行' },
            { method: 'GET', path: '/api/agent/status/:runId', description: '获取执行状态' },
            { method: 'POST', path: '/api/planning-workbench/start', description: '开始规划会话' },
        ];
    }
    getTripsApiSummary() {
        return `行程相关 API:
行程管理:
- POST /api/trips - 创建行程
- GET /api/trips/:id - 获取行程详情
- PUT /api/trips/:id - 更新行程
- DELETE /api/trips/:id - 删除行程
- GET /api/trips/user/:userId - 获取用户行程列表

行程天:
- POST /api/trips/:id/days - 添加行程天
- GET /api/trips/:id/days - 获取行程天列表
- PUT /api/trips/:id/days/:dayId - 更新行程天`;
    }
    getTripsEndpoints() {
        return [
            { method: 'POST', path: '/api/trips', description: '创建行程' },
            { method: 'GET', path: '/api/trips/:id', description: '获取行程详情' },
            { method: 'PUT', path: '/api/trips/:id', description: '更新行程' },
            { method: 'DELETE', path: '/api/trips/:id', description: '删除行程' },
            { method: 'GET', path: '/api/trips/user/:userId', description: '获取用户行程列表' },
        ];
    }
    getDecisionApiSummary() {
        return `决策相关 API:
决策管理:
- POST /api/decision/create - 创建决策
- GET /api/decision/:id - 获取决策详情
- POST /api/decision/:id/approve - 批准决策
- POST /api/decision/:id/reject - 拒绝决策

审批流程:
- GET /api/approvals/pending - 获取待审批列表
- POST /api/approvals/:id/action - 执行审批动作

统计:
- GET /api/decision-stats/overview - 决策统计概览
- GET /api/decision-stats/by-type - 按类型统计`;
    }
    getDecisionEndpoints() {
        return [
            { method: 'POST', path: '/api/decision/create', description: '创建决策' },
            { method: 'GET', path: '/api/decision/:id', description: '获取决策详情' },
            { method: 'POST', path: '/api/decision/:id/approve', description: '批准决策' },
            { method: 'GET', path: '/api/approvals/pending', description: '获取待审批列表' },
            { method: 'GET', path: '/api/decision-stats/overview', description: '决策统计概览' },
        ];
    }
    estimateTokens(blocks) {
        let totalChars = 0;
        for (const block of blocks) {
            totalChars += block.text.length;
            if (block.data) {
                totalChars += JSON.stringify(block.data).length;
            }
        }
        const chineseChars = totalChars * 0.7;
        const englishChars = totalChars * 0.3;
        const tokens = Math.ceil(chineseChars / 1.5 + englishChars / 4);
        return tokens;
    }
    sortAndTrimBlocks(blocks, tokenBudget, includePrivate) {
        let filteredBlocks = includePrivate
            ? blocks
            : blocks.filter((b) => b.visibility === 'public');
        filteredBlocks.sort((a, b) => b.priority - a.priority);
        const trimmedBlocks = [];
        let currentTokens = 0;
        for (const block of filteredBlocks) {
            const blockTokens = block.estimatedTokens || this.estimateTokens([block]);
            if (currentTokens + blockTokens <= tokenBudget) {
                trimmedBlocks.push(block);
                currentTokens += blockTokens;
            }
            else {
                break;
            }
        }
        return trimmedBlocks;
    }
    async compressBlocks(blocks, tokenBudget, userId, phase, agent) {
        try {
            let strategy = null;
            if (this.compressionLearningService) {
                try {
                    strategy = await this.compressionLearningService.getCompressionStrategy(blocks, userId, phase, agent);
                }
                catch (error) {
                    this.logger.warn(`获取压缩策略失败: ${error.message}，使用默认策略`);
                }
            }
            let remainingBlocks = blocks;
            if (strategy && strategy.omit.length > 0) {
                remainingBlocks = blocks.filter((block) => !strategy.omit.includes(block));
                this.logger.debug(`压缩策略: 省略了 ${strategy.omit.length} 个 Block`);
            }
            let currentTokens = this.estimateTokens(remainingBlocks);
            if (currentTokens <= tokenBudget) {
                return remainingBlocks;
            }
            if (this.skillsRegistry) {
                const contextCompressSkill = this.skillsRegistry.getSkill('context.compress');
                if (contextCompressSkill) {
                    this.skillsCalledInBuild.push('context.compress');
                    const blocksToCompress = (strategy === null || strategy === void 0 ? void 0 : strategy.compress) || remainingBlocks;
                    const result = await contextCompressSkill.execute({
                        blocks: remainingBlocks,
                        tokenBudget,
                        strategy: 'balanced',
                        preserveKeys: (strategy === null || strategy === void 0 ? void 0 : strategy.keep.map((b) => b.key)) || [],
                    });
                    if (result.compressedBlocks) {
                        const compressedTokens = this.estimateTokens(result.compressedBlocks);
                        if (compressedTokens <= tokenBudget) {
                            this.logger.debug(`压缩完成: 原始=${currentTokens}, 压缩后=${compressedTokens}, ` +
                                `省略=${(strategy === null || strategy === void 0 ? void 0 : strategy.omit.length) || 0}, 压缩=${(strategy === null || strategy === void 0 ? void 0 : strategy.compress.length) || 0}`);
                            return result.compressedBlocks;
                        }
                    }
                }
            }
        }
        catch (error) {
            this.logger.warn(`调用 context.compress skill 失败: ${error}，使用简单压缩策略`);
        }
        const compressed = [...blocks];
        return compressed.filter((b) => b.priority >= 30);
    }
    async projectState(state, config) {
        const cfg = {
            decisionLogLimit: 5,
            rejectionLogLimit: 3,
            tokenBudget: 3600,
            ...config,
        };
        try {
            const isTripState = 'user_intent' in state;
            if (isTripState) {
                return await this.projectTripState(state, cfg);
            }
            else {
                return await this.projectLangGraphState(state, cfg);
            }
        }
        catch (error) {
            this.logger.error(`状态投影失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async projectTripState(state, config) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
        const decisionLogSummary = (state.decision_log || [])
            .slice(-config.decisionLogLimit)
            .map((entry) => ({
            agent: entry.agent,
            action: entry.action,
            reasonCode: entry.reasonCode || '',
            explanation: entry.explanation,
            timestamp: entry.timestamp,
        }));
        const rejectionLogSummary = (state.rejection_log || []).slice(-config.rejectionLogLimit);
        const planSummary = state.plan
            ? {
                totalDays: ((_a = state.plan.days) === null || _a === void 0 ? void 0 : _a.length) || 0,
                totalSegments: ((_b = state.plan.days) === null || _b === void 0 ? void 0 : _b.reduce((sum, day) => { var _a; return sum + (((_a = day.segments) === null || _a === void 0 ? void 0 : _a.length) || 0); }, 0)) || 0,
                keyHighlights: ((_c = state.plan.days) === null || _c === void 0 ? void 0 : _c.slice(0, 3).map((d) => d.summary || d.name || '')) || [],
            }
            : undefined;
        const publicState = {
            user_intent: state.user_intent,
            strategy_mode: state.strategy_mode,
            strategy_params_summary: state.strategy_params
                ? JSON.stringify(state.strategy_params).substring(0, 200)
                : undefined,
            world_summary: {
                countryCode: (_e = (_d = state.world) === null || _d === void 0 ? void 0 : _d.physical) === null || _e === void 0 ? void 0 : _e.countryCode,
                season: ((_h = (_g = (_f = state.world) === null || _f === void 0 ? void 0 : _f.physical) === null || _g === void 0 ? void 0 : _g.month) === null || _h === void 0 ? void 0 : _h.toString()) || undefined,
                routeDirectionId: ((_k = (_j = state.world) === null || _j === void 0 ? void 0 : _j.routeDirection) === null || _k === void 0 ? void 0 : _k.id) || undefined,
                routeDirectionName: (_m = (_l = state.world) === null || _l === void 0 ? void 0 : _l.routeDirection) === null || _m === void 0 ? void 0 : _m.name,
            },
            planning_phase: state.planning_phase,
            riskSignals: (_o = state.metadata) === null || _o === void 0 ? void 0 : _o.riskSignals,
            decisionLogSummary,
            rejectionLogSummary: rejectionLogSummary.length > 0 ? rejectionLogSummary : undefined,
            planSummary,
            topCountryBlocks: (_p = state.metadata) === null || _p === void 0 ? void 0 : _p.topCountryBlocks,
        };
        const privateState = {
            fullState: config.includeFullState ? state : undefined,
            toolRawOutputs: {},
            debugLogs: [],
            longLists: {
                pois: (_q = state.metadata) === null || _q === void 0 ? void 0 : _q.poiListRef,
                segments: (_r = state.metadata) === null || _r === void 0 ? void 0 : _r.segmentListRef,
            },
            largeFileRefs: {
                gpx: (_s = state.metadata) === null || _s === void 0 ? void 0 : _s.gpxRef,
                geojson: (_t = state.metadata) === null || _t === void 0 ? void 0 : _t.geojsonRef,
            },
            intermediateResults: (_u = state.metadata) === null || _u === void 0 ? void 0 : _u.intermediateResults,
        };
        const publicText = JSON.stringify(publicState);
        const tokenCount = Math.ceil((publicText.length * 0.7) / 1.5 + (publicText.length * 0.3) / 4);
        let truncated = false;
        if (config.tokenBudget && tokenCount > config.tokenBudget) {
            truncated = true;
            this.logger.warn(`Public state token count (${tokenCount}) exceeds budget (${config.tokenBudget})`);
        }
        return {
            public: publicState,
            private: privateState,
            metadata: {
                projectedAt: new Date().toISOString(),
                tokenCount,
                truncated,
            },
        };
    }
    async projectLangGraphState(state, config) {
        var _a, _b, _c, _d;
        const publicState = {
            user_intent: state.userQuery || '',
            planning_phase: state.planningPhase || '',
            strategy_mode: state.strategyMode,
            world_summary: {
                countryCode: (_a = state.extractedParams) === null || _a === void 0 ? void 0 : _a.countryCode,
                routeDirectionId: ((_b = state.extractedParams) === null || _b === void 0 ? void 0 : _b.routeDirectionId)
                    ? parseInt(state.extractedParams.routeDirectionId, 10)
                    : undefined,
            },
            decisionLogSummary: [],
            planSummary: undefined,
        };
        const privateState = {
            fullLangGraphState: config.includeFullState ? state : undefined,
            toolRawOutputs: {
                coreToolOutput: state.coreToolOutput ? 'REF:coreToolOutput' : undefined,
            },
            debugLogs: ((_c = state.metadata) === null || _c === void 0 ? void 0 : _c.debugLogs) || [],
            longLists: {},
            largeFileRefs: {},
            intermediateResults: (_d = state.metadata) === null || _d === void 0 ? void 0 : _d.intermediateResults,
        };
        const publicText = JSON.stringify(publicState);
        const tokenCount = Math.ceil((publicText.length * 0.7) / 1.5 + (publicText.length * 0.3) / 4);
        const truncated = config.tokenBudget ? tokenCount > config.tokenBudget : false;
        return {
            public: publicState,
            private: privateState,
            metadata: {
                projectedAt: new Date().toISOString(),
                tokenCount,
                truncated,
            },
        };
    }
    async writeBack(tripRunId, attemptNumber, scratchpad, decisionLogDelta, artifactsRefs) {
        try {
            if (this.prisma) {
                await this.prisma.tripAttempt.upsert({
                    where: {
                        tripRunId_attemptNumber: {
                            tripRunId,
                            attemptNumber,
                        },
                    },
                    update: {
                        planOutline: scratchpad.planOutline,
                        openQuestions: scratchpad.openQuestions || [],
                        constraintsAssumed: scratchpad.constraintsAssumed || [],
                        nextActions: scratchpad.nextActions || [],
                        failureNotes: scratchpad.failureNotes,
                        artifacts: artifactsRefs || {},
                        updatedAt: new Date(),
                    },
                    create: {
                        id: `attempt_${tripRunId}_${attemptNumber}`,
                        tripRunId,
                        attemptNumber,
                        planOutline: scratchpad.planOutline,
                        openQuestions: scratchpad.openQuestions || [],
                        constraintsAssumed: scratchpad.constraintsAssumed || [],
                        nextActions: scratchpad.nextActions || [],
                        failureNotes: scratchpad.failureNotes,
                        artifacts: artifactsRefs || {},
                        status: 'IN_PROGRESS',
                    },
                });
                if (decisionLogDelta && decisionLogDelta.length > 0) {
                }
            }
        }
        catch (error) {
            this.logger.error(`Failed to write back: ${error}`, error instanceof Error ? error.stack : undefined);
        }
    }
    getPackages(options) {
        let packages = Array.from(this.packageStore.values());
        if (options.tripId) {
            packages = packages.filter((p) => p.tripId === options.tripId);
        }
        if (options.phase) {
            packages = packages.filter((p) => p.phase === options.phase);
        }
        if (options.agent) {
            packages = packages.filter((p) => p.agent === options.agent);
        }
        if (options.startTime) {
            packages = packages.filter((p) => p.createdAt >= options.startTime);
        }
        if (options.endTime) {
            packages = packages.filter((p) => p.createdAt <= options.endTime);
        }
        if (options.search) {
            const searchLower = options.search.toLowerCase();
            packages = packages.filter((p) => p.userQuery.toLowerCase().includes(searchLower) ||
                (p.tripId && p.tripId.toLowerCase().includes(searchLower)));
        }
        packages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const page = options.page || 1;
        const limit = options.limit || 20;
        const total = packages.length;
        const totalPages = Math.ceil(total / limit);
        const skip = (page - 1) * limit;
        const paginatedPackages = packages.slice(skip, skip + limit);
        return {
            packages: paginatedPackages,
            total,
            page,
            limit,
            totalPages,
        };
    }
    getPackageById(packageId) {
        return this.packageStore.get(packageId);
    }
};
exports.ContextEngineerService = ContextEngineerService;
exports.ContextEngineerService = ContextEngineerService = ContextEngineerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('PrismaService')),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(skills_registry_token_1.SKILLS_REGISTRY_TOKEN)),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        skills_registry_service_1.SkillsRegistryService,
        redis_service_1.RedisService,
        context_metrics_service_1.ContextMetricsService,
        context_prometheus_metrics_service_1.ContextPrometheusMetricsService,
        context_learning_service_1.ContextLearningService,
        user_profile_service_1.UserProfileService,
        compression_learning_service_1.CompressionLearningService])
], ContextEngineerService);
//# sourceMappingURL=context-engineer.service.js.map