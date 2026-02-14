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
var ContextMetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextMetricsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const skills_registry_service_1 = require("../../../skills/services/skills-registry.service");
const skills_registry_token_1 = require("../../../skills/services/skills-registry.token");
let ContextMetricsService = ContextMetricsService_1 = class ContextMetricsService {
    constructor(prisma, skillsRegistry) {
        this.prisma = prisma;
        this.skillsRegistry = skillsRegistry;
        this.logger = new common_1.Logger(ContextMetricsService_1.name);
        this.metricsStore = new Map();
    }
    async recordMetrics(contextPackage, metadata) {
        var _a;
        try {
            const tokens = {
                total: contextPackage.totalTokens,
                budget: contextPackage.tokenBudget,
                overBudget: contextPackage.totalTokens > contextPackage.tokenBudget,
                overBudgetRate: contextPackage.totalTokens / contextPackage.tokenBudget,
            };
            const blocks = {
                total: contextPackage.blocks.length,
                public: contextPackage.blocks.filter((b) => b.visibility === 'public').length,
                private: contextPackage.blocks.filter((b) => b.visibility === 'private').length,
                compressed: contextPackage.compressed,
                compressionRate: ((_a = contextPackage.metadata) === null || _a === void 0 ? void 0 : _a.originalBlocksCount)
                    ? contextPackage.blocks.length / contextPackage.metadata.originalBlocksCount
                    : undefined,
            };
            let quality = {
                noiseRate: contextPackage.blocks.filter((b) => b.priority < 30).length / contextPackage.blocks.length || 0,
                quality: 'GOOD',
            };
            if (this.skillsRegistry) {
                const contextEvaluateSkill = this.skillsRegistry.getSkill('context.evaluate');
                if (contextEvaluateSkill) {
                    try {
                        const evaluation = await contextEvaluateSkill.execute({
                            contextPackage,
                            usedBlockKeys: metadata.usedBlockKeys,
                            userQuery: metadata.userQuery,
                            phase: metadata.phase,
                        });
                        quality = {
                            hitRate: evaluation.metrics.hitRate,
                            noiseRate: evaluation.metrics.noiseRate,
                            relevanceScore: evaluation.metrics.relevanceScore,
                            quality: evaluation.summary.quality,
                        };
                    }
                    catch (error) {
                        this.logger.warn(`调用 context.evaluate 失败: ${error.message}`);
                    }
                }
            }
            const blockTypeDistribution = {};
            for (const block of contextPackage.blocks) {
                blockTypeDistribution[block.type] = (blockTypeDistribution[block.type] || 0) + 1;
            }
            const priorityDistribution = {
                high: contextPackage.blocks.filter((b) => b.priority >= 80).length,
                medium: contextPackage.blocks.filter((b) => b.priority >= 50 && b.priority < 80).length,
                low: contextPackage.blocks.filter((b) => b.priority < 50).length,
            };
            const record = {
                id: `metrics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                tripId: metadata.tripId,
                phase: metadata.phase,
                agent: metadata.agent,
                timestamp: new Date().toISOString(),
                tokens,
                blocks,
                quality,
                performance: {
                    buildTimeMs: metadata.buildTimeMs,
                    cacheHit: metadata.cacheHit,
                    cacheLevel: metadata.cacheLevel || (metadata.cacheHit ? 'L1' : 'none'),
                    skillsCalled: metadata.skillsCalled,
                },
                blockTypeDistribution,
                priorityDistribution,
            };
            this.storeMetrics(record);
            this.logger.debug(`记录 Context Package 指标: tripId=${metadata.tripId || 'none'}, phase=${metadata.phase}, quality=${quality.quality}`);
            return record;
        }
        catch (error) {
            this.logger.error(`记录指标失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async storeMetrics(record) {
        const key = record.tripId || 'global';
        if (!this.metricsStore.has(key)) {
            this.metricsStore.set(key, []);
        }
        this.metricsStore.get(key).push(record);
        const records = this.metricsStore.get(key);
        if (records.length > 100) {
            records.shift();
        }
    }
    async getMetricsSummary(options) {
        const key = options.tripId || 'global';
        let records = this.metricsStore.get(key) || [];
        if (options.phase) {
            records = records.filter((r) => r.phase === options.phase);
        }
        if (options.agent) {
            records = records.filter((r) => r.agent === options.agent);
        }
        if (options.startTime) {
            records = records.filter((r) => r.timestamp >= options.startTime);
        }
        if (options.endTime) {
            records = records.filter((r) => r.timestamp <= options.endTime);
        }
        if (records.length === 0) {
            return {
                timeRange: {
                    start: options.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                    end: options.endTime || new Date().toISOString(),
                },
                totalRecords: 0,
                avgTokens: 0,
                avgCompressionRate: 0,
                avgNoiseRate: 0,
                cacheHitRate: 0,
                avgBuildTimeMs: 0,
                qualityDistribution: {
                    EXCELLENT: 0,
                    GOOD: 0,
                    FAIR: 0,
                    POOR: 0,
                },
                topBlockTypes: [],
            };
        }
        const totalRecords = records.length;
        const avgTokens = records.reduce((sum, r) => sum + r.tokens.total, 0) / totalRecords;
        const avgCompressionRate = records
            .filter((r) => r.blocks.compressionRate !== undefined)
            .reduce((sum, r) => sum + (r.blocks.compressionRate || 0), 0) /
            records.filter((r) => r.blocks.compressionRate !== undefined).length || 0;
        const avgHitRate = records
            .filter((r) => r.quality.hitRate !== undefined)
            .reduce((sum, r) => sum + (r.quality.hitRate || 0), 0) /
            records.filter((r) => r.quality.hitRate !== undefined).length;
        const avgNoiseRate = records.reduce((sum, r) => sum + r.quality.noiseRate, 0) / totalRecords;
        const cacheHitRate = records.filter((r) => r.performance.cacheHit).length / totalRecords;
        const avgBuildTimeMs = records.reduce((sum, r) => sum + r.performance.buildTimeMs, 0) / totalRecords;
        const qualityDistribution = {
            EXCELLENT: records.filter((r) => r.quality.quality === 'EXCELLENT').length,
            GOOD: records.filter((r) => r.quality.quality === 'GOOD').length,
            FAIR: records.filter((r) => r.quality.quality === 'FAIR').length,
            POOR: records.filter((r) => r.quality.quality === 'POOR').length,
        };
        const blockTypeCounts = {};
        for (const record of records) {
            for (const [type, count] of Object.entries(record.blockTypeDistribution)) {
                blockTypeCounts[type] = (blockTypeCounts[type] || 0) + count;
            }
        }
        const topBlockTypes = Object.entries(blockTypeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type, count]) => ({ type, count }));
        const timestamps = records.map((r) => new Date(r.timestamp).getTime());
        const startTime = new Date(Math.min(...timestamps)).toISOString();
        const endTime = new Date(Math.max(...timestamps)).toISOString();
        return {
            timeRange: {
                start: startTime,
                end: endTime,
            },
            totalRecords,
            avgTokens: Math.round(avgTokens),
            avgCompressionRate: Math.round(avgCompressionRate * 100) / 100,
            avgHitRate: avgHitRate ? Math.round(avgHitRate * 100) / 100 : undefined,
            avgNoiseRate: Math.round(avgNoiseRate * 100) / 100,
            cacheHitRate: Math.round(cacheHitRate * 100) / 100,
            avgBuildTimeMs: Math.round(avgBuildTimeMs),
            qualityDistribution,
            topBlockTypes,
        };
    }
    getRecentMetrics(tripId, limit = 10) {
        const key = tripId || 'global';
        const records = this.metricsStore.get(key) || [];
        return records
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, limit);
    }
    getAllMetrics(options = {}) {
        let allRecords = [];
        for (const records of this.metricsStore.values()) {
            allRecords.push(...records);
        }
        if (options.tripId) {
            allRecords = allRecords.filter((r) => r.tripId === options.tripId);
        }
        if (options.phase) {
            allRecords = allRecords.filter((r) => r.phase === options.phase);
        }
        if (options.agent) {
            allRecords = allRecords.filter((r) => r.agent === options.agent);
        }
        if (options.startTime) {
            allRecords = allRecords.filter((r) => r.timestamp >= options.startTime);
        }
        if (options.endTime) {
            allRecords = allRecords.filter((r) => r.timestamp <= options.endTime);
        }
        return allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    getStatsByAgent(options = {}) {
        const records = this.getAllMetrics(options);
        const stats = {};
        for (const record of records) {
            if (!stats[record.agent]) {
                stats[record.agent] = {
                    count: 0,
                    tokens: [],
                    buildTimes: [],
                    cacheHits: 0,
                };
            }
            stats[record.agent].count++;
            stats[record.agent].tokens.push(record.tokens.total);
            stats[record.agent].buildTimes.push(record.performance.buildTimeMs);
            if (record.performance.cacheHit) {
                stats[record.agent].cacheHits++;
            }
        }
        const result = {};
        for (const [agent, data] of Object.entries(stats)) {
            result[agent] = {
                count: data.count,
                avgTokens: Math.round(data.tokens.reduce((sum, t) => sum + t, 0) / data.tokens.length),
                avgBuildTimeMs: Math.round(data.buildTimes.reduce((sum, t) => sum + t, 0) / data.buildTimes.length),
                cacheHitRate: data.cacheHits / data.count,
            };
        }
        return result;
    }
    getStatsByPhase(options = {}) {
        const records = this.getAllMetrics(options);
        const stats = {};
        for (const record of records) {
            if (!stats[record.phase]) {
                stats[record.phase] = {
                    count: 0,
                    tokens: [],
                    buildTimes: [],
                    cacheHits: 0,
                };
            }
            stats[record.phase].count++;
            stats[record.phase].tokens.push(record.tokens.total);
            stats[record.phase].buildTimes.push(record.performance.buildTimeMs);
            if (record.performance.cacheHit) {
                stats[record.phase].cacheHits++;
            }
        }
        const result = {};
        for (const [phase, data] of Object.entries(stats)) {
            result[phase] = {
                count: data.count,
                avgTokens: Math.round(data.tokens.reduce((sum, t) => sum + t, 0) / data.tokens.length),
                avgBuildTimeMs: Math.round(data.buildTimes.reduce((sum, t) => sum + t, 0) / data.buildTimes.length),
                cacheHitRate: data.cacheHits / data.count,
            };
        }
        return result;
    }
};
exports.ContextMetricsService = ContextMetricsService;
exports.ContextMetricsService = ContextMetricsService = ContextMetricsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('PrismaService')),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(skills_registry_token_1.SKILLS_REGISTRY_TOKEN)),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        skills_registry_service_1.SkillsRegistryService])
], ContextMetricsService);
//# sourceMappingURL=context-metrics.service.js.map