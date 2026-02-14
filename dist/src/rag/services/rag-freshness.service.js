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
var RagFreshnessService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagFreshnessService = exports.FreshnessStatus = exports.ChunkCategory = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const embedding_service_1 = require("../../places/services/embedding.service");
const mcp_tools_service_1 = require("./mcp-tools.service");
const parallel_executor_service_1 = require("./parallel-executor.service");
var ChunkCategory;
(function (ChunkCategory) {
    ChunkCategory["RULES"] = "RULES";
    ChunkCategory["POI_HOURS"] = "POI_HOURS";
    ChunkCategory["POI_INFO"] = "POI_INFO";
    ChunkCategory["GATE"] = "GATE";
    ChunkCategory["WEATHER"] = "WEATHER";
    ChunkCategory["GENERAL"] = "GENERAL";
})(ChunkCategory || (exports.ChunkCategory = ChunkCategory = {}));
var FreshnessStatus;
(function (FreshnessStatus) {
    FreshnessStatus["FRESH"] = "FRESH";
    FreshnessStatus["STALE"] = "STALE";
    FreshnessStatus["EXPIRED"] = "EXPIRED";
    FreshnessStatus["VERIFYING"] = "VERIFYING";
})(FreshnessStatus || (exports.FreshnessStatus = FreshnessStatus = {}));
let RagFreshnessService = RagFreshnessService_1 = class RagFreshnessService {
    constructor(prisma, embeddingService, mcpTools, parallelExecutor) {
        this.prisma = prisma;
        this.embeddingService = embeddingService;
        this.mcpTools = mcpTools;
        this.parallelExecutor = parallelExecutor;
        this.logger = new common_1.Logger(RagFreshnessService_1.name);
        this.FRESHNESS_RULES = {
            [ChunkCategory.RULES]: {
                staleDays: 30,
                mustVerify: true,
                verifyTool: 'web_browse',
            },
            [ChunkCategory.POI_HOURS]: {
                staleDays: 7,
                mustVerify: true,
                verifyTool: 'google_places',
            },
            [ChunkCategory.POI_INFO]: {
                staleDays: 90,
                mustVerify: false,
            },
            [ChunkCategory.GATE]: {
                staleDays: 1,
                mustVerify: true,
                verifyTool: 'road_status,weather_api',
            },
            [ChunkCategory.WEATHER]: {
                staleDays: 0,
                mustVerify: true,
                verifyTool: 'weather_api',
            },
            [ChunkCategory.GENERAL]: {
                staleDays: 180,
                mustVerify: false,
            },
        };
    }
    async ensureFreshness(chunks, category) {
        var _a;
        if (chunks.length === 0) {
            return chunks;
        }
        const rule = this.FRESHNESS_RULES[category];
        const now = new Date();
        this.logger.debug(`[Freshness] 检查新鲜度: category=${category}, chunks=${chunks.length}, rule=${JSON.stringify(rule)}`);
        const freshChunks = [];
        const staleChunks = [];
        for (const chunk of chunks) {
            const lastVerified = chunk.lastVerified || ((_a = chunk.metadata) === null || _a === void 0 ? void 0 : _a.last_verified_at);
            const daysSince = lastVerified
                ? this.daysSince(new Date(lastVerified))
                : Infinity;
            if (daysSince <= rule.staleDays) {
                freshChunks.push({
                    ...chunk,
                    metadata: {
                        ...chunk.metadata,
                        freshness: FreshnessStatus.FRESH,
                        lastVerified,
                        staleDays: daysSince,
                    },
                });
            }
            else {
                staleChunks.push({
                    ...chunk,
                    metadata: {
                        ...chunk.metadata,
                        freshness: FreshnessStatus.STALE,
                        lastVerified,
                        staleDays: daysSince,
                    },
                });
            }
        }
        this.logger.debug(`[Freshness] 分类结果: fresh=${freshChunks.length}, stale=${staleChunks.length}`);
        if (staleChunks.length === 0) {
            return freshChunks;
        }
        if (!rule.mustVerify) {
            this.logger.debug(`[Freshness] Category ${category} 不需要强制验证，标记为 STALE 后返回`);
            return [...freshChunks, ...staleChunks];
        }
        this.logger.warn(`[Freshness] 发现 ${staleChunks.length} 个过期 chunks，触发验证: tool=${rule.verifyTool}`);
        const updatedChunks = await this.verifyAndUpdateBatch(staleChunks, rule);
        return [...freshChunks, ...updatedChunks];
    }
    async verifyAndUpdateBatch(chunks, rule) {
        if (chunks.length === 0) {
            return [];
        }
        if (this.parallelExecutor && chunks.length > 1) {
            this.logger.debug(`[Freshness] 使用并行模式验证 ${chunks.length} 个 chunks`);
            const tasks = chunks.map((chunk) => ({
                id: chunk.chunkId,
                operation: async () => this.verifyAndUpdate(chunk, rule),
                timeout: 30000,
            }));
            const results = await this.parallelExecutor.executeAll(tasks, {
                maxConcurrency: 5,
                taskTimeout: 30000,
                delayMs: 100,
            });
            const updatedChunks = results.map((result, index) => {
                var _a, _b;
                const chunk = chunks[index];
                if (result.success && result.result) {
                    return result.result;
                }
                else {
                    this.logger.error(`[Freshness] 并行验证失败: chunkId=${chunk.chunkId}, error=${(_a = result.error) === null || _a === void 0 ? void 0 : _a.message}`);
                    return {
                        ...chunk,
                        metadata: {
                            ...chunk.metadata,
                            freshness: FreshnessStatus.EXPIRED,
                            verifyError: ((_b = result.error) === null || _b === void 0 ? void 0 : _b.message) || 'Unknown error',
                        },
                    };
                }
            });
            const stats = this.parallelExecutor.getStats(results);
            this.logger.log(`[Freshness] 并行验证完成: success=${stats.success}/${stats.total}, avgDuration=${stats.avgDuration.toFixed(0)}ms`);
            return updatedChunks;
        }
        this.logger.debug(`[Freshness] 使用顺序模式验证 ${chunks.length} 个 chunks`);
        const updatedChunks = [];
        for (const chunk of chunks) {
            try {
                const updated = await this.verifyAndUpdate(chunk, rule);
                updatedChunks.push(updated);
            }
            catch (error) {
                this.logger.error(`[Freshness] 验证失败: chunkId=${chunk.chunkId}, error=${error.message}`);
                updatedChunks.push({
                    ...chunk,
                    metadata: {
                        ...chunk.metadata,
                        freshness: FreshnessStatus.EXPIRED,
                        verifyError: error.message,
                    },
                });
            }
        }
        return updatedChunks;
    }
    async verifyAndUpdate(chunk, rule) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        this.logger.debug(`[Freshness] 验证 chunk: chunkId=${chunk.chunkId}, tool=${rule.verifyTool}`);
        let updatedContent = null;
        if (chunk.category === ChunkCategory.POI_HOURS) {
            try {
                const placeResult = await this.mcpTools.getPlaceDetails({
                    place_id: (_a = chunk.metadata) === null || _a === void 0 ? void 0 : _a.place_id,
                    place_name: (_b = chunk.metadata) === null || _b === void 0 ? void 0 : _b.place_name,
                    fields: ['opening_hours'],
                    cacheTtlMinutes: 0,
                });
                if (placeResult.success && placeResult.opening_hours) {
                    updatedContent = JSON.stringify({
                        place_id: placeResult.place_id,
                        name: placeResult.name,
                        opening_hours: placeResult.opening_hours,
                        last_verified: new Date().toISOString(),
                    });
                    this.logger.log(`[Freshness] POI_HOURS 验证成功: ${placeResult.name}`);
                }
                else {
                    this.logger.warn(`[Freshness] POI_HOURS 验证失败（API 未返回数据）`);
                }
            }
            catch (error) {
                this.logger.error(`[Freshness] POI_HOURS 验证异常: ${error.message}`);
            }
        }
        else if (chunk.category === ChunkCategory.RULES) {
            try {
                const webResult = await this.mcpTools.webBrowse({
                    url: ((_c = chunk.metadata) === null || _c === void 0 ? void 0 : _c.source_url) || ((_d = chunk.metadata) === null || _d === void 0 ? void 0 : _d.url) || '',
                    query: chunk.content.substring(0, 100),
                    cacheTtlMinutes: 0,
                });
                if (webResult.success && webResult.content) {
                    updatedContent = webResult.content;
                    this.logger.log(`[Freshness] RULES 验证成功: ${webResult.url}`);
                }
                else {
                    this.logger.warn(`[Freshness] RULES 验证失败（Web Browse 未返回数据）`);
                }
            }
            catch (error) {
                this.logger.error(`[Freshness] RULES 验证异常: ${error.message}`);
            }
        }
        else if (chunk.category === ChunkCategory.GATE) {
            try {
                const roadResult = await this.mcpTools.getRoadStatus({
                    road_id: ((_e = chunk.metadata) === null || _e === void 0 ? void 0 : _e.road_id) || ((_f = chunk.metadata) === null || _f === void 0 ? void 0 : _f.road_name) || '',
                    cacheTtlMinutes: 0,
                });
                if (roadResult.success) {
                    updatedContent = JSON.stringify({
                        road_id: roadResult.road_id,
                        status: roadResult.status,
                        conditions: roadResult.conditions,
                        last_updated: roadResult.last_updated,
                    });
                    this.logger.log(`[Freshness] GATE/ROAD 验证成功: ${roadResult.road_id} - ${roadResult.status}`);
                }
                else {
                    this.logger.warn(`[Freshness] GATE/ROAD 验证失败（API 未返回数据）`);
                }
            }
            catch (error) {
                this.logger.error(`[Freshness] GATE/ROAD 验证异常: ${error.message}`);
            }
        }
        else if (chunk.category === ChunkCategory.WEATHER) {
            try {
                const weatherResult = await this.mcpTools.getWeather({
                    location: ((_g = chunk.metadata) === null || _g === void 0 ? void 0 : _g.location) || '',
                    lat: (_h = chunk.metadata) === null || _h === void 0 ? void 0 : _h.lat,
                    lng: (_j = chunk.metadata) === null || _j === void 0 ? void 0 : _j.lng,
                    cacheTtlMinutes: 0,
                });
                if (weatherResult.success) {
                    updatedContent = JSON.stringify({
                        location: weatherResult.location,
                        timestamp: weatherResult.timestamp,
                        temperature: weatherResult.temperature,
                        conditions: weatherResult.conditions,
                        wind_speed: weatherResult.wind_speed,
                        visibility: weatherResult.visibility,
                        warnings: weatherResult.warnings,
                    });
                    this.logger.log(`[Freshness] WEATHER 验证成功: ${weatherResult.location} - ${weatherResult.conditions}`);
                }
                else {
                    this.logger.warn(`[Freshness] WEATHER 验证失败（API 未返回数据）`);
                }
            }
            catch (error) {
                this.logger.error(`[Freshness] WEATHER 验证异常: ${error.message}`);
            }
        }
        if (updatedContent) {
            const updatedChunk = await this.updateChunk(chunk, updatedContent);
            return {
                ...updatedChunk,
                metadata: {
                    ...updatedChunk.metadata,
                    freshness: FreshnessStatus.FRESH,
                    lastVerified: new Date(),
                },
            };
        }
        return {
            ...chunk,
            metadata: {
                ...chunk.metadata,
                freshness: FreshnessStatus.STALE,
                verifyError: '验证工具暂未实现',
            },
        };
    }
    async updateChunk(chunk, newContent) {
        this.logger.log(`[Freshness] 更新 chunk: chunkId=${chunk.chunkId}, oldLength=${chunk.content.length}, newLength=${newContent.length}`);
        const newEmbedding = await this.embeddingService.generateEmbedding(newContent);
        const embeddingStr = `[${newEmbedding.join(',')}]`;
        await this.prisma.$executeRaw `
      UPDATE chunks
      SET
        content = ${newContent},
        embedding = ${embeddingStr}::vector,
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{last_verified_at}',
          to_jsonb(NOW()::text)
        ),
        updated_at = NOW()
      WHERE chunk_id = ${chunk.chunkId}
    `;
        return {
            ...chunk,
            content: newContent,
            embedding: newEmbedding,
            lastVerified: new Date(),
        };
    }
    daysSince(date) {
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }
    async getFreshnessStats(params) {
        return {
            totalChunks: 0,
            byFreshness: {
                [FreshnessStatus.FRESH]: 0,
                [FreshnessStatus.STALE]: 0,
                [FreshnessStatus.EXPIRED]: 0,
                [FreshnessStatus.VERIFYING]: 0,
            },
            byCategory: {},
            staleChunks: [],
        };
    }
    async refreshStaleChunks(params) {
        this.logger.log(`[Freshness] 手动刷新过期 chunks: category=${(params === null || params === void 0 ? void 0 : params.category) || 'all'}, force=${(params === null || params === void 0 ? void 0 : params.force) || false}`);
        return {
            refreshed: 0,
            failed: 0,
            skipped: 0,
        };
    }
    async dailyFreshnessCheck() {
        this.logger.log('[Freshness] 开始每日新鲜度检查');
        for (const category of Object.values(ChunkCategory)) {
            const rule = this.FRESHNESS_RULES[category];
            if (!rule.mustVerify) {
                continue;
            }
            this.logger.log(`[Freshness] 检查类别: ${category}, staleDays=${rule.staleDays}`);
        }
        this.logger.log('[Freshness] 每日新鲜度检查完成');
    }
};
exports.RagFreshnessService = RagFreshnessService;
exports.RagFreshnessService = RagFreshnessService = RagFreshnessService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        embedding_service_1.EmbeddingService,
        mcp_tools_service_1.McpToolsService,
        parallel_executor_service_1.ParallelExecutorService])
], RagFreshnessService);
//# sourceMappingURL=rag-freshness.service.js.map