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
var RagFallbackService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagFallbackService = exports.QueryCategory = void 0;
const common_1 = require("@nestjs/common");
const chunk_retrieval_service_1 = require("./chunk-retrieval.service");
const prisma_service_1 = require("../../prisma/prisma.service");
const mcp_tools_service_1 = require("./mcp-tools.service");
var QueryCategory;
(function (QueryCategory) {
    QueryCategory["RULES"] = "RULES";
    QueryCategory["GATE"] = "GATE";
    QueryCategory["POI"] = "POI";
    QueryCategory["SPATIAL"] = "SPATIAL";
    QueryCategory["GENERAL"] = "GENERAL";
})(QueryCategory || (exports.QueryCategory = QueryCategory = {}));
let RagFallbackService = RagFallbackService_1 = class RagFallbackService {
    constructor(chunkRetrievalService, prisma, mcpTools) {
        this.chunkRetrievalService = chunkRetrievalService;
        this.prisma = prisma;
        this.mcpTools = mcpTools;
        this.logger = new common_1.Logger(RagFallbackService_1.name);
        this.THRESHOLDS = {
            HIGH: 0.75,
            MEDIUM: 0.60,
            LOW: 0.40,
        };
    }
    async queryWithFallback(query, params, context) {
        var _a, _b, _c;
        const startTime = Date.now();
        const attemptedMethods = [];
        this.logger.debug(`[Fallback] 开始查询: "${query.substring(0, 50)}...", category=${context.category}`);
        try {
            attemptedMethods.push('VECTOR_RAG');
            const vectorResult = await this.chunkRetrievalService.retrieve({
                ...params,
                query,
                useHybridSearch: false,
                limit: params.limit || 10,
            });
            const maxSimilarity = ((_a = vectorResult[0]) === null || _a === void 0 ? void 0 : _a.similarity) || 0;
            if (maxSimilarity >= this.THRESHOLDS.HIGH) {
                this.logger.debug(`[Fallback] Level 1 成功: Vector RAG, similarity=${maxSimilarity.toFixed(3)}`);
                return {
                    results: vectorResult,
                    method: 'VECTOR_RAG',
                    confidence: maxSimilarity,
                    metadata: {
                        attemptedMethods,
                        latency: Date.now() - startTime,
                    },
                };
            }
            attemptedMethods.push('HYBRID_RAG');
            const hybridResult = await this.chunkRetrievalService.retrieve({
                ...params,
                query,
                useHybridSearch: true,
                denseWeight: 0.6,
                sparseWeight: 0.4,
                limit: (params.limit || 10) * 2,
            });
            const maxHybridScore = ((_b = hybridResult[0]) === null || _b === void 0 ? void 0 : _b.hybridScore) || ((_c = hybridResult[0]) === null || _c === void 0 ? void 0 : _c.similarity) || 0;
            if (maxHybridScore >= this.THRESHOLDS.MEDIUM) {
                this.logger.debug(`[Fallback] Level 2 成功: Hybrid RAG, score=${maxHybridScore.toFixed(3)}`);
                return {
                    results: hybridResult.slice(0, params.limit || 10),
                    method: 'HYBRID_RAG',
                    confidence: maxHybridScore,
                    metadata: {
                        attemptedMethods,
                        degradationReason: `Vector similarity ${maxSimilarity.toFixed(3)} < threshold ${this.THRESHOLDS.HIGH}`,
                        latency: Date.now() - startTime,
                    },
                };
            }
            attemptedMethods.push('KEYWORD_FALLBACK');
            const keywordResult = await this.keywordSearch(query, params);
            if (keywordResult.length > 0) {
                this.logger.warn(`[Fallback] Level 3 降级: Keyword Fallback, results=${keywordResult.length}`);
                return {
                    results: keywordResult,
                    method: 'KEYWORD_FALLBACK',
                    confidence: 0.5,
                    metadata: {
                        attemptedMethods,
                        degradationReason: `Hybrid score ${maxHybridScore.toFixed(3)} < threshold ${this.THRESHOLDS.MEDIUM}`,
                        latency: Date.now() - startTime,
                    },
                };
            }
            if ((context.category === QueryCategory.RULES || context.category === QueryCategory.GATE) &&
                context.allowWebBrowse !== false) {
                attemptedMethods.push('WEB_BROWSE');
                try {
                    const webBrowseResult = await this.webBrowseSearch(query, context);
                    if (webBrowseResult.success) {
                        this.logger.log(`[Fallback] Level 4 成功: Web Browse, content_length=${webBrowseResult.content.length}`);
                        const webChunk = {
                            id: `web_browse_${Date.now()}`,
                            chunkId: `web_browse_${Date.now()}`,
                            content: webBrowseResult.content,
                            type: 'web_browse',
                            credibilityScore: 0.7,
                            keywords: this.extractKeywords(query),
                            metadata: {
                                source: 'WEB_BROWSE',
                                url: webBrowseResult.url,
                                query: query,
                                timestamp: new Date().toISOString(),
                            },
                            fileId: 'web_browse',
                            similarity: 0.6,
                            sourceFile: webBrowseResult.url,
                        };
                        return {
                            results: [webChunk],
                            method: 'WEB_BROWSE',
                            confidence: 0.6,
                            metadata: {
                                attemptedMethods,
                                degradationReason: 'Local RAG data insufficient, fetched from web',
                                latency: Date.now() - startTime,
                            },
                        };
                    }
                }
                catch (webError) {
                    this.logger.error(`[Fallback] Level 4 Web Browse 失败: ${webError.message}`);
                }
                await this.recordKnowledgeGap({
                    query,
                    category: context.category,
                    timestamp: new Date(),
                    attemptedMethods,
                    source: 'WEB_BROWSE_FAILED',
                    needsIndex: true,
                });
            }
            attemptedMethods.push('GRACEFUL_FAILURE');
            this.logger.error(`[Fallback] Level 5 最终降级: Graceful Failure, query="${query.substring(0, 50)}..."`);
            await this.recordKnowledgeGap({
                query,
                category: context.category,
                timestamp: new Date(),
                attemptedMethods,
                needsIndex: true,
            });
            return {
                results: [],
                method: 'GRACEFUL_FAILURE',
                confidence: 0,
                fallback: {
                    message: '暂无该信息，建议查阅官方资源',
                    officialLinks: this.getOfficialLinks(context.category),
                    recordedInGapLog: true,
                },
                metadata: {
                    attemptedMethods,
                    degradationReason: '所有检索方法均未找到相关结果',
                    latency: Date.now() - startTime,
                },
            };
        }
        catch (error) {
            this.logger.error(`[Fallback] 查询失败: ${error.message}`, error.stack);
            await this.recordKnowledgeGap({
                query,
                category: context.category,
                timestamp: new Date(),
                attemptedMethods: [...attemptedMethods, 'ERROR'],
                needsIndex: true,
            });
            return {
                results: [],
                method: 'GRACEFUL_FAILURE',
                confidence: 0,
                fallback: {
                    message: `查询失败: ${error.message}`,
                    officialLinks: this.getOfficialLinks(context.category),
                    recordedInGapLog: true,
                },
                metadata: {
                    attemptedMethods,
                    degradationReason: error.message,
                    latency: Date.now() - startTime,
                },
            };
        }
    }
    async keywordSearch(query, params) {
        const keywords = this.extractKeywords(query);
        if (keywords.length === 0) {
            return [];
        }
        const conditions = [];
        const paramsList = [];
        const keywordConditions = keywords.map((kw) => {
            const paramIdx = paramsList.length + 1;
            paramsList.push(`%${kw}%`);
            return `(c.content ILIKE $${paramIdx} OR EXISTS(SELECT 1 FROM unnest(c.keywords) AS k WHERE LOWER(k) LIKE LOWER($${paramIdx})))`;
        });
        conditions.push(`(${keywordConditions.join(' OR ')})`);
        if (params.type) {
            conditions.push(`c.type = $${paramsList.length + 1}`);
            paramsList.push(params.type);
        }
        if (params.credibilityMin) {
            conditions.push(`c.credibility_score >= $${paramsList.length + 1}`);
            paramsList.push(params.credibilityMin);
        }
        const whereClause = conditions.join(' AND ');
        paramsList.push(params.limit || 10);
        const querySql = `
      SELECT
        c.id,
        c.chunk_id,
        c.content,
        c.type,
        c.credibility_score,
        c.keywords,
        c.metadata,
        c.file_id,
        0.5 as similarity
      FROM chunks c
      WHERE ${whereClause}
      LIMIT $${paramsList.length}
    `;
        const results = await this.prisma.$queryRawUnsafe(querySql, ...keywords.map(kw => `%${kw}%`), ...paramsList.slice(keywords.length));
        return results.map((r) => ({
            id: r.id,
            chunkId: r.chunk_id,
            content: r.content,
            type: r.type,
            credibilityScore: Number(r.credibility_score),
            keywords: r.keywords || [],
            metadata: r.metadata,
            fileId: r.file_id,
            similarity: 0.5,
        }));
    }
    extractKeywords(query) {
        const cleaned = query
            .toLowerCase()
            .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')
            .trim();
        const words = cleaned
            .split(/\s+/)
            .filter((w) => w.length >= 2)
            .filter((w) => !this.isStopWord(w));
        return words;
    }
    isStopWord(word) {
        const stopWords = new Set([
            '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
        ]);
        return stopWords.has(word.toLowerCase());
    }
    async webBrowseSearch(query, context) {
        const officialLinks = this.getOfficialLinks(context.category);
        for (const url of officialLinks) {
            try {
                const result = await this.mcpTools.webBrowse({
                    url,
                    query,
                    cacheTtlMinutes: context.category === QueryCategory.RULES ? 60 : 30,
                });
                if (result.success && result.content.length > 100) {
                    return {
                        success: true,
                        content: result.content,
                        url: result.url,
                    };
                }
            }
            catch (error) {
                this.logger.warn(`[WebBrowse] Failed to browse ${url}: ${error.message}`);
                continue;
            }
        }
        return {
            success: false,
            content: '',
            url: '',
        };
    }
    getOfficialLinks(category) {
        const links = {
            [QueryCategory.RULES]: [
                'https://www.road.is',
                'https://www.safetravel.is',
                'https://www.ferdamalastofa.is',
            ],
            [QueryCategory.GATE]: [
                'https://www.road.is',
                'https://en.vedur.is',
                'https://www.safetravel.is/safety/emergencies',
            ],
            [QueryCategory.POI]: [
                'https://guidetoiceland.is',
                'https://www.visiticeland.com',
            ],
            [QueryCategory.SPATIAL]: [
                'https://www.google.com/maps',
                'https://ja.is/kort',
            ],
            [QueryCategory.GENERAL]: [
                'https://www.visiticeland.com',
                'https://guidetoiceland.is',
            ],
        };
        return links[category] || links[QueryCategory.GENERAL];
    }
    async recordKnowledgeGap(gap) {
        try {
            await this.prisma.ragKnowledgeGap.create({
                data: {
                    query: gap.query,
                    category: gap.category,
                    timestamp: new Date(gap.timestamp),
                    attemptedMethods: gap.attemptedMethods,
                    source: gap.source,
                    needsIndex: gap.needsIndex,
                    notes: gap.notes,
                },
            });
            this.logger.warn(`[KnowledgeGap] 记录数据缺口: query="${gap.query.substring(0, 50)}...", category=${gap.category}, methods=${gap.attemptedMethods.join('→')}`);
        }
        catch (error) {
            this.logger.error(`[KnowledgeGap] 记录失败: ${error.message}`);
        }
    }
    async getKnowledgeGapStats(params) {
        return {
            totalGaps: 0,
            byCategory: {
                [QueryCategory.RULES]: 0,
                [QueryCategory.GATE]: 0,
                [QueryCategory.POI]: 0,
                [QueryCategory.SPATIAL]: 0,
                [QueryCategory.GENERAL]: 0,
            },
            topQueries: [],
            needsIndexCount: 0,
        };
    }
};
exports.RagFallbackService = RagFallbackService;
exports.RagFallbackService = RagFallbackService = RagFallbackService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [chunk_retrieval_service_1.ChunkRetrievalService,
        prisma_service_1.PrismaService,
        mcp_tools_service_1.McpToolsService])
], RagFallbackService);
//# sourceMappingURL=rag-fallback.service.js.map