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
var ChunkRetrievalService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkRetrievalService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const embedding_service_1 = require("../../places/services/embedding.service");
const reranking_service_1 = require("./reranking.service");
const rag_monitoring_service_1 = require("./rag-monitoring.service");
const query_expansion_service_1 = require("./query-expansion.service");
const query_intent_service_1 = require("./query-intent.service");
const redis_service_1 = require("../../redis/redis.service");
const parallel_executor_service_1 = require("./parallel-executor.service");
let ChunkRetrievalService = ChunkRetrievalService_1 = class ChunkRetrievalService {
    constructor(prisma, embeddingService, rerankingService, monitoringService, queryExpansionService, queryIntentService, redisService, parallelExecutor) {
        this.prisma = prisma;
        this.embeddingService = embeddingService;
        this.rerankingService = rerankingService;
        this.monitoringService = monitoringService;
        this.queryExpansionService = queryExpansionService;
        this.queryIntentService = queryIntentService;
        this.redisService = redisService;
        this.parallelExecutor = parallelExecutor;
        this.logger = new common_1.Logger(ChunkRetrievalService_1.name);
        this.resultCache = new Map();
        this.l1CacheTtl = 5 * 60 * 1000;
        this.l2CacheTtl = 15 * 60 * 1000;
        this.cacheKeyPrefix = 'rag_result:';
        this.inFlightRetrievals = new Map();
        this.SYNONYM_MAP = {
            '环岛': ['ring road', 'ring-road', 'route 1', '一号公路', '环线'],
            '环线': ['ring road', 'ring-road', '环岛'],
            '自驾': ['driving', 'self-drive', 'car rental', '驾车', '开车'],
            '路线': ['route', 'itinerary', '行程', '路径'],
            '行程': ['itinerary', 'route', '路线', '规划'],
            '天气': ['weather', 'climate', '气候', '气温'],
            '气候': ['climate', 'weather', '天气'],
            '极光': ['aurora', 'northern lights', '北极光'],
            '季节': ['season', 'monthly', '月份'],
            '蓝湖': ['blue lagoon', '蓝色温泉'],
            '冰河湖': ['jökulsárlón', 'jokulsarlon', '杰古沙龙', '冰川湖'],
            '瀑布': ['waterfall', 'foss'],
            '冰川': ['glacier', 'ice'],
            '温泉': ['hot spring', 'geothermal'],
            '黑沙滩': ['black sand beach', 'reynisfjara'],
            '住宿': ['accommodation', 'accommodations', 'hotel', 'stay', 'lodging', 'booking', '酒店', '旅馆', '民宿'],
            '酒店': ['hotel', 'accommodation', 'accommodations', 'lodging', '住宿'],
            '旅馆': ['guesthouse', 'hostel', 'accommodation', '住宿'],
            '民宿': ['airbnb', 'guesthouse', 'accommodation', '住宿'],
            '安全': ['safety', 'risk', 'danger', '危险', '注意'],
            '危险': ['danger', 'risk', 'hazard', '安全'],
            '注意': ['caution', 'warning', 'note', '小心'],
            '租车': ['car rental', 'rent a car', '租赁'],
            '保险': ['insurance', '全险'],
            '四驱': ['4x4', '4wd', 'suv', '四驱车'],
            'ring road': ['环岛', '环线', 'route 1'],
            'blue lagoon': ['蓝湖', '蓝色温泉'],
            'weather': ['天气', '气候', 'climate'],
            'safety': ['安全', '注意事项', 'risk'],
            'accommodation': ['住宿', '酒店', 'hotel'],
        };
        this.INTENT_BOOST = {
            accommodation: {
                triggers: ['住宿', '酒店', '旅馆', '民宿', 'hotel', 'accommodation', 'stay', 'lodging'],
                boostKeywords: ['accommodations', 'accommodation', 'hotel', 'booking'],
            },
            route: {
                triggers: ['路线', '环岛', '行程', 'route', 'ring road'],
                boostKeywords: ['ring-road', 'route', 'itinerary'],
            },
            weather: {
                triggers: ['天气', '气候', '温度', 'weather', 'climate'],
                boostKeywords: ['climate', 'weather', 'seasonal'],
            },
        };
        if (this.redisService) {
            this.logger.log('✅ RAG 结果缓存已启用（Redis）');
        }
        else {
            this.logger.log('⚠️ RAG 结果缓存使用内存缓存（Redis 不可用）');
        }
        if (this.parallelExecutor) {
            this.logger.log('✅ 批量检索优化已启用');
        }
    }
    async retrieve(params) {
        const cacheKey = this.buildCacheKey(params);
        const inFlightRetrieval = this.inFlightRetrievals.get(cacheKey);
        if (inFlightRetrieval) {
            this.logger.debug(`🔄 复用正在进行的 RAG 检索: ${cacheKey}`);
            return inFlightRetrieval;
        }
        const cached = await this.getCachedResult(cacheKey);
        if (cached) {
            this.logger.debug(`✅ RAG 缓存命中: ${cacheKey}`);
            return cached;
        }
        const retrievalPromise = this.doRetrieve(params, cacheKey);
        this.inFlightRetrievals.set(cacheKey, retrievalPromise);
        try {
            const results = await retrievalPromise;
            await this.writeToCache(cacheKey, results);
            return results;
        }
        finally {
            this.inFlightRetrievals.delete(cacheKey);
        }
    }
    async doRetrieve(params, cacheKey) {
        let { query, limit = 10, credibilityMin = 0.5, type, category, chunkCategory, fileId, useHybridSearch = true, denseWeight = 0.6, sparseWeight = 0.4, useReranking = false, rerankTopK = 20, useQueryExpansion = false, maxQueryVariants = 3, useIntentClassification = false, } = params;
        let intentInfo;
        if (useIntentClassification && this.queryIntentService && !chunkCategory) {
            const intent = this.queryIntentService.classifyIntent(query);
            if (this.queryIntentService.shouldFilterByCategory(intent)) {
                chunkCategory = intent.suggestedChunkCategory;
                intentInfo = `${intent.type}(${intent.confidence.toFixed(2)})`;
                this.logger.debug(`🎯 意图分类: ${intent.type} → chunkCategory=${chunkCategory}, reason: ${intent.reasoning}`);
            }
            if (intent.expandedKeywords.length > 0) {
                const enhancedQuery = this.queryIntentService.enhanceQuery(query);
                this.logger.debug(`📝 查询增强: "${query}" → "${enhancedQuery}"`);
                query = enhancedQuery;
            }
        }
        this.logger.debug(`Chunk 检索: query="${query.substring(0, 50)}...", hybrid=${useHybridSearch}, rerank=${useReranking}, expansion=${useQueryExpansion}${intentInfo ? `, intent=${intentInfo}` : ''}`);
        const startTime = Date.now();
        let embeddingLatency;
        const updatedParams = { ...params, query, chunkCategory };
        try {
            let results;
            if (useQueryExpansion && this.queryExpansionService) {
                results = await this.retrieveWithExpansion({
                    ...updatedParams,
                    denseWeight,
                    sparseWeight,
                    maxQueryVariants,
                });
            }
            else {
                if (useHybridSearch) {
                    results = await this.hybridRetrieve({
                        ...updatedParams,
                        denseWeight,
                        sparseWeight,
                    });
                }
                else {
                    const embeddingStart = Date.now();
                    results = await this.denseRetrieve(updatedParams);
                    embeddingLatency = Date.now() - embeddingStart;
                }
            }
            if (useReranking && this.rerankingService && results.length > 0) {
                const rerankedResults = await this.rerankingService.rerank({
                    query,
                    results,
                    topK: rerankTopK,
                    returnTop: limit,
                });
                this.logger.debug(`Reranking完成: 原始=${results.length}, 重排序后=${rerankedResults.length}`);
                if (this.monitoringService) {
                    const totalLatency = Date.now() - startTime;
                    this.monitoringService.recordRetrieval({
                        query,
                        latency: totalLatency,
                        embeddingLatency,
                        resultCount: rerankedResults.length,
                        useHybridSearch,
                        useReranking: true,
                    });
                }
                return rerankedResults;
            }
            const finalResults = results.slice(0, limit);
            if (this.monitoringService) {
                const totalLatency = Date.now() - startTime;
                this.monitoringService.recordRetrieval({
                    query,
                    latency: totalLatency,
                    embeddingLatency,
                    resultCount: finalResults.length,
                    useHybridSearch,
                    useReranking: false,
                });
            }
            return finalResults;
        }
        catch (error) {
            if (this.monitoringService) {
                const totalLatency = Date.now() - startTime;
                this.monitoringService.recordRetrieval({
                    query,
                    latency: totalLatency,
                    embeddingLatency,
                    resultCount: 0,
                    error: error.message,
                    useHybridSearch,
                    useReranking,
                });
            }
            this.logger.error(`Chunk 检索失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async retrieveWithExpansion(params) {
        var _a;
        const { query, limit = 10, useHybridSearch = true, denseWeight, sparseWeight, maxQueryVariants, ...restParams } = params;
        const expanded = await this.queryExpansionService.expandQuery({
            query,
            maxVariants: maxQueryVariants,
        });
        this.logger.debug(`查询扩展: 原始="${query}", 变体=${expanded.variants.length}, 总计=${expanded.allQueries.length}`);
        const retrievalPromises = expanded.allQueries.map((q) => {
            if (useHybridSearch) {
                return this.hybridRetrieve({
                    ...restParams,
                    query: q,
                    limit: limit * 2,
                    denseWeight,
                    sparseWeight,
                });
            }
            else {
                return this.denseRetrieve({
                    ...restParams,
                    query: q,
                    limit: limit * 2,
                });
            }
        });
        const allResults = await Promise.all(retrievalPromises);
        const resultsMap = new Map();
        expanded.allQueries.forEach((q, index) => {
            resultsMap.set(q, allResults[index]);
        });
        const mergedResults = this.queryExpansionService.mergeResults(resultsMap, query, limit);
        this.logger.debug(`查询扩展检索完成: 原始查询结果=${((_a = allResults[0]) === null || _a === void 0 ? void 0 : _a.length) || 0}, 合并后=${mergedResults.length}`);
        return mergedResults;
    }
    async denseRetrieve(params) {
        const { query, limit = 10, credibilityMin = 0.5, type, category, chunkCategory, fileId, } = params;
        const queryEmbedding = await this.embeddingService.generateEmbedding(query);
        const isZeroVector = queryEmbedding.every(v => v === 0);
        if (isZeroVector) {
            this.logger.warn(`⚠️ Dense检索: 查询embedding是零向量，可能API调用失败。查询: "${query.substring(0, 50)}..."`);
            return [];
        }
        this.logger.debug(`Dense检索: 查询embedding生成成功，维度=${queryEmbedding.length}, 非零值=${queryEmbedding.filter(v => v !== 0).length}`);
        const conditions = [];
        const paramsList = [JSON.stringify(queryEmbedding), limit];
        conditions.push('c.embedding IS NOT NULL');
        if (type) {
            conditions.push(`c.type = $${paramsList.length + 1}`);
            paramsList.push(type);
        }
        if (credibilityMin) {
            conditions.push(`c.credibility_score >= $${paramsList.length + 1}`);
            paramsList.push(credibilityMin);
        }
        if (fileId) {
            conditions.push(`c.file_id = $${paramsList.length + 1}::uuid`);
            paramsList.push(fileId);
        }
        if (chunkCategory) {
            conditions.push(`c.category = $${paramsList.length + 1}`);
            paramsList.push(chunkCategory);
            this.logger.debug(`🎯 Dense检索: 应用chunkCategory过滤 = ${chunkCategory}`);
        }
        let fromClause = 'FROM chunks c';
        if (category) {
            fromClause += ' INNER JOIN knowledge_files kf ON c.file_id = kf.id';
            conditions.push(`kf.category = $${paramsList.length + 1}`);
            paramsList.push(category);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        this.logger.debug(`Dense检索: conditions=${conditions.join(', ')}`);
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
        1 - (c.embedding <=> $1::vector) as similarity
      ${fromClause}
      ${whereClause}
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
    `;
        const results = await this.prisma.$queryRawUnsafe(querySql, ...paramsList);
        return this.formatResults(results, credibilityMin);
    }
    async hybridRetrieve(params) {
        const { query, limit = 10, credibilityMin = 0.5, type, category, chunkCategory, fileId, denseWeight, sparseWeight, } = params;
        this.logger.debug(`Hybrid检索参数: chunkCategory=${chunkCategory || 'N/A'}, denseWeight=${denseWeight}, sparseWeight=${sparseWeight}`);
        const [denseResults, sparseResults] = await Promise.all([
            this.denseRetrieve({ ...params, useHybridSearch: false }),
            this.sparseRetrieve({ ...params }),
        ]);
        const mergedResults = this.mergeWithRRF(denseResults, sparseResults, denseWeight, sparseWeight, limit);
        const filteredResults = mergedResults.filter((r) => {
            const score = r.hybridScore || r.similarity || 0;
            const credibility = r.credibilityScore || 0;
            return score > 0 && credibility >= (params.credibilityMin || 0);
        });
        this.logger.debug(`Hybrid检索完成: Dense=${denseResults.length}, Sparse=${sparseResults.length}, Merged=${filteredResults.length}`);
        return filteredResults;
    }
    async sparseRetrieve(params) {
        const { query, limit = 10, credibilityMin = 0.5, type, category, chunkCategory, fileId, } = params;
        const keywords = this.extractKeywords(query);
        if (keywords.length === 0) {
            return [];
        }
        const conditions = [];
        const paramsList = [];
        const keywordConditions = keywords.map((kw) => {
            const paramIdx = paramsList.length + 1;
            paramsList.push(`%${kw}%`);
            return `(c.content ILIKE $${paramIdx} OR EXISTS(SELECT 1 FROM unnest(c.keywords) AS kw WHERE LOWER(kw) LIKE LOWER($${paramIdx})))`;
        });
        conditions.push(`(${keywordConditions.join(' OR ')})`);
        if (type) {
            conditions.push(`c.type = $${paramsList.length + 1}`);
            paramsList.push(type);
        }
        if (credibilityMin) {
            conditions.push(`c.credibility_score >= $${paramsList.length + 1}`);
            paramsList.push(credibilityMin);
        }
        if (fileId) {
            conditions.push(`c.file_id = $${paramsList.length + 1}::uuid`);
            paramsList.push(fileId);
        }
        if (chunkCategory) {
            conditions.push(`c.category = $${paramsList.length + 1}`);
            paramsList.push(chunkCategory);
        }
        let fromClause = 'FROM chunks c';
        if (category) {
            fromClause += ' INNER JOIN knowledge_files kf ON c.file_id = kf.id';
            conditions.push(`kf.category = $${paramsList.length + 1}`);
            paramsList.push(category);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        paramsList.push(limit * 2);
        const scoreParts = [];
        keywords.forEach((kw, idx) => {
            const paramIdx = idx + 1;
            scoreParts.push(`
        (
          -- content中的匹配数
          (LENGTH(LOWER(c.content)) - LENGTH(REPLACE(LOWER(c.content), LOWER($${paramIdx}), ''))) / NULLIF(LENGTH($${paramIdx}), 0) +
          -- keywords数组中的匹配数（每个匹配+1）
          (SELECT COUNT(*) FROM unnest(c.keywords) AS kw WHERE LOWER(kw) LIKE LOWER($${paramIdx}))
        )
      `);
        });
        const scoreCalculation = scoreParts.length > 0
            ? `(${scoreParts.join(' + ')})::float / GREATEST(LENGTH(c.content), 1) * 100`
            : '0';
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
        ${scoreCalculation} as keyword_score
      ${fromClause}
      ${whereClause}
      ORDER BY keyword_score DESC
      LIMIT $${paramsList.length}
    `;
        const allParams = [...keywords.map(kw => `%${kw}%`), ...paramsList.slice(keywords.length)];
        const results = await this.prisma.$queryRawUnsafe(querySql, ...allParams);
        const fileIds = [...new Set(results.map((r) => r.file_id))];
        const files = fileIds.length > 0 ? await this.prisma.$queryRawUnsafe(`SELECT id, filename FROM knowledge_files WHERE id = ANY($1::uuid[])`, fileIds) : [];
        const fileMap = new Map();
        files.forEach((f) => {
            fileMap.set(f.id, f.filename);
        });
        return results.map((r) => ({
            id: r.id,
            chunkId: r.chunk_id,
            content: r.content,
            type: r.type,
            credibilityScore: parseFloat(String(r.credibility_score)),
            keywords: r.keywords || [],
            metadata: r.metadata,
            fileId: r.file_id,
            similarity: Math.min(parseFloat(String(r.keyword_score)) / 100, 1),
            sparseScore: Math.min(parseFloat(String(r.keyword_score)) / 100, 1),
            sourceFile: fileMap.get(r.file_id),
        }));
    }
    mergeWithRRF(denseResults, sparseResults, denseWeight, sparseWeight, limit) {
        const k = 60;
        const resultMap = new Map();
        denseResults.forEach((result, index) => {
            const rrfScore = denseWeight / (k + index + 1);
            const existing = resultMap.get(result.id);
            if (existing) {
                existing.hybridScore = (existing.hybridScore || 0) + rrfScore;
                existing.denseScore = result.similarity;
            }
            else {
                resultMap.set(result.id, {
                    ...result,
                    hybridScore: rrfScore,
                    denseScore: result.similarity,
                });
            }
        });
        sparseResults.forEach((result, index) => {
            const rrfScore = sparseWeight / (k + index + 1);
            const existing = resultMap.get(result.id);
            if (existing) {
                existing.hybridScore = (existing.hybridScore || 0) + rrfScore;
                existing.sparseScore = result.sparseScore || result.similarity;
            }
            else {
                resultMap.set(result.id, {
                    ...result,
                    hybridScore: rrfScore,
                    sparseScore: result.sparseScore || result.similarity,
                });
            }
        });
        const merged = Array.from(resultMap.values())
            .sort((a, b) => (b.hybridScore || 0) - (a.hybridScore || 0))
            .slice(0, limit);
        return merged;
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
        const expandedWords = new Set(words);
        const queryLower = query.toLowerCase();
        for (const [key, synonyms] of Object.entries(this.SYNONYM_MAP)) {
            if (queryLower.includes(key.toLowerCase())) {
                synonyms.forEach(syn => expandedWords.add(syn.toLowerCase()));
                this.logger.debug(`🔄 关键词扩展: "${key}" → [${synonyms.join(', ')}]`);
            }
        }
        for (const word of words) {
            const synonyms = this.SYNONYM_MAP[word];
            if (synonyms) {
                synonyms.forEach(syn => expandedWords.add(syn.toLowerCase()));
            }
        }
        const result = Array.from(expandedWords);
        const boostedKeywords = [];
        for (const [intent, config] of Object.entries(this.INTENT_BOOST)) {
            const triggered = config.triggers.some(t => queryLower.includes(t.toLowerCase()));
            if (triggered) {
                this.logger.debug(`🎯 意图boost: ${intent} → [${config.boostKeywords.join(', ')}]`);
                config.boostKeywords.forEach(kw => {
                    if (!boostedKeywords.includes(kw.toLowerCase())) {
                        boostedKeywords.push(kw.toLowerCase());
                    }
                });
            }
        }
        return [...boostedKeywords, ...result.filter(w => !boostedKeywords.includes(w))];
    }
    isStopWord(word) {
        const stopWords = new Set([
            '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can', 'must'
        ]);
        return stopWords.has(word.toLowerCase());
    }
    async formatResults(results, credibilityMin) {
        const fileIds = [...new Set(results.map((r) => r.file_id))];
        const files = await this.prisma.$queryRawUnsafe(`SELECT id, filename FROM knowledge_files WHERE id = ANY($1::uuid[])`, fileIds);
        const fileMap = new Map();
        files.forEach((f) => {
            fileMap.set(f.id, f.filename);
        });
        const similarityThreshold = credibilityMin <= 0.0 ? 0 : 0.01;
        const formattedResults = results
            .filter((r) => {
            const similarity = parseFloat(String(r.similarity));
            const credibility = parseFloat(String(r.credibility_score));
            const similarityPass = similarityThreshold === 0 ? true : similarity >= similarityThreshold;
            return similarityPass && credibility >= credibilityMin;
        })
            .map((r) => ({
            id: r.id,
            chunkId: r.chunk_id,
            content: r.content,
            type: r.type,
            credibilityScore: parseFloat(String(r.credibility_score)),
            keywords: r.keywords || [],
            metadata: r.metadata,
            fileId: r.file_id,
            similarity: parseFloat(String(r.similarity)),
            sourceFile: fileMap.get(r.file_id),
        }));
        const beforeFilter = results.length;
        const afterFilter = formattedResults.length;
        this.logger.debug(`检索完成: 原始结果=${beforeFilter}, 过滤后=${afterFilter}, ` +
            `阈值=${similarityThreshold}, credibilityMin=${credibilityMin}`);
        if (beforeFilter > 0 && afterFilter === 0) {
            const maxSim = Math.max(...results.map(r => parseFloat(String(r.similarity))));
            const minSim = Math.min(...results.map(r => parseFloat(String(r.similarity))));
            this.logger.warn(`⚠️ 所有结果被过滤: 最高相似度=${maxSim.toFixed(4)}, ` +
                `最低相似度=${minSim.toFixed(4)}, 阈值=${similarityThreshold}`);
        }
        return formattedResults;
    }
    async hybridRetrieveLegacy(params) {
        const { useLegacy = false, ...chunkParams } = params;
        const chunkResults = await this.retrieve(chunkParams);
        return chunkResults;
    }
    buildCacheKey(params) {
        const { query, limit = 10, credibilityMin = 0.5, type, category, chunkCategory, fileId, useHybridSearch = true, denseWeight = 0.6, sparseWeight = 0.4, useReranking = false, rerankTopK = 20, useQueryExpansion = false, maxQueryVariants = 3, useIntentClassification = false, } = params;
        const queryHash = this.simpleHash(query.substring(0, 100).trim().toLowerCase());
        return `query:${queryHash}:limit:${limit}:credibilityMin:${credibilityMin}:type:${type || 'none'}:category:${category || 'none'}:chunkCategory:${chunkCategory || 'none'}:fileId:${fileId || 'none'}:hybrid:${useHybridSearch}:denseWeight:${denseWeight}:sparseWeight:${sparseWeight}:rerank:${useReranking}:rerankTopK:${rerankTopK}:expansion:${useQueryExpansion}:maxVariants:${maxQueryVariants}:intent:${useIntentClassification}`;
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
    async getCachedResult(cacheKey) {
        const memoryCached = this.resultCache.get(cacheKey);
        if (memoryCached && Date.now() - memoryCached.timestamp < this.l1CacheTtl) {
            this.logger.debug(`✅ L1缓存命中: ${cacheKey}`);
            return memoryCached.results;
        }
        if (this.redisService) {
            try {
                const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
                const cached = await this.redisService.get(redisKey);
                if (cached) {
                    this.logger.debug(`✅ L2缓存命中: ${cacheKey}`);
                    this.resultCache.set(cacheKey, {
                        results: cached,
                        timestamp: Date.now(),
                    });
                    return cached;
                }
            }
            catch (error) {
                this.logger.warn(`从 L2 Redis 获取缓存失败: ${error.message}`);
            }
        }
        return null;
    }
    async writeToCache(cacheKey, results) {
        this.resultCache.set(cacheKey, {
            results,
            timestamp: Date.now(),
        });
        this.cleanExpiredCache();
        if (this.redisService) {
            try {
                const redisKey = `${this.cacheKeyPrefix}${cacheKey}`;
                const ttlSeconds = Math.floor(this.l2CacheTtl / 1000);
                await this.redisService.set(redisKey, results, ttlSeconds);
                this.logger.debug(`✅ RAG 结果已存入 L2 Redis: ${cacheKey} (TTL: ${ttlSeconds}s)`);
            }
            catch (error) {
                this.logger.warn(`存入 L2 Redis 失败: ${error.message}`);
            }
        }
    }
    cleanExpiredCache() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, value] of this.resultCache.entries()) {
            if (now - value.timestamp >= this.l1CacheTtl) {
                expiredKeys.push(key);
            }
        }
        for (const key of expiredKeys) {
            this.resultCache.delete(key);
        }
        if (this.resultCache.size > 500) {
            const entries = Array.from(this.resultCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toRemove = Math.floor(entries.length * 0.2);
            for (let i = 0; i < toRemove; i++) {
                this.resultCache.delete(entries[i][0]);
            }
            this.logger.debug(`RAG 结果缓存过大，清理了最旧的 ${toRemove} 个条目`);
        }
    }
    async batchRetrieve(queries, options) {
        var _a;
        if (!this.parallelExecutor) {
            this.logger.warn('ParallelExecutor 不可用，使用顺序执行');
            const results = new Map();
            for (const query of queries) {
                const cacheKey = this.buildCacheKey(query);
                const result = await this.retrieve(query);
                results.set(cacheKey, result);
            }
            return results;
        }
        const maxConcurrency = (options === null || options === void 0 ? void 0 : options.maxConcurrency) || 10;
        const taskTimeout = (options === null || options === void 0 ? void 0 : options.taskTimeout) || 5000;
        const tasks = queries.map((query) => ({
            id: this.buildCacheKey(query),
            operation: async () => this.retrieve(query),
            timeout: taskTimeout,
        }));
        const results = await this.parallelExecutor.executeAll(tasks, {
            maxConcurrency,
            taskTimeout,
            delayMs: 50,
        });
        const resultMap = new Map();
        for (let i = 0; i < queries.length; i++) {
            const task = tasks[i];
            const result = results[i];
            if (result.success && result.result) {
                resultMap.set(task.id, result.result);
            }
            else {
                this.logger.error(`批量检索失败: ${task.id}, error: ${(_a = result.error) === null || _a === void 0 ? void 0 : _a.message}`);
                resultMap.set(task.id, []);
            }
        }
        const stats = this.parallelExecutor.getStats(results);
        const totalTimeMs = Math.round(stats.avgDuration * stats.total);
        this.logger.log(`批量检索完成: 总数=${queries.length}, 成功=${stats.success}, ` +
            `失败=${stats.failed}, 总耗时≈${totalTimeMs}ms, ` +
            `平均耗时=${Math.round(stats.avgDuration)}ms`);
        return resultMap;
    }
};
exports.ChunkRetrievalService = ChunkRetrievalService;
exports.ChunkRetrievalService = ChunkRetrievalService = ChunkRetrievalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        embedding_service_1.EmbeddingService,
        reranking_service_1.RerankingService,
        rag_monitoring_service_1.RAGMonitoringService,
        query_expansion_service_1.QueryExpansionService,
        query_intent_service_1.QueryIntentService,
        redis_service_1.RedisService,
        parallel_executor_service_1.ParallelExecutorService])
], ChunkRetrievalService);
//# sourceMappingURL=chunk-retrieval.service.js.map