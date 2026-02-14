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
var RAGQueryCollectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGQueryCollectorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const rag_service_1 = require("./rag.service");
let RAGQueryCollectorService = RAGQueryCollectorService_1 = class RAGQueryCollectorService {
    constructor(prisma, ragService) {
        this.prisma = prisma;
        this.ragService = ragService;
        this.logger = new common_1.Logger(RAGQueryCollectorService_1.name);
    }
    async collectQueryDocumentPair(query, correctDocumentIds, metadata) {
        this.logger.debug(`[RAGQueryCollector] 收集 query-document 对: query="${query.substring(0, 50)}...", correctDocsCount=${correctDocumentIds.length}`);
        try {
            const pair = {
                id: `pair_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                query,
                correctDocumentIds,
                metadata: {
                    source: (metadata === null || metadata === void 0 ? void 0 : metadata.source) || 'USER_QUERY',
                    userId: metadata === null || metadata === void 0 ? void 0 : metadata.userId,
                    sessionId: metadata === null || metadata === void 0 ? void 0 : metadata.sessionId,
                    timestamp: (metadata === null || metadata === void 0 ? void 0 : metadata.timestamp) || new Date(),
                    collection: metadata === null || metadata === void 0 ? void 0 : metadata.collection,
                    countryCode: metadata === null || metadata === void 0 ? void 0 : metadata.countryCode,
                    tags: (metadata === null || metadata === void 0 ? void 0 : metadata.tags) || [],
                },
                createdAt: new Date(),
            };
            this.logger.log(`[RAGQueryCollector] query-document 对已收集: id=${pair.id}, correctDocsCount=${correctDocumentIds.length}`);
            return pair.id;
        }
        catch (error) {
            this.logger.error(`[RAGQueryCollector] 收集失败: query="${query.substring(0, 50)}...", error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async collectFromUserQuery(query, retrievedResults, userFeedback) {
        this.logger.debug(`[RAGQueryCollector] 从用户查询收集: query="${query.substring(0, 50)}...", retrievedCount=${retrievedResults.length}`);
        const correctDocumentIds = [];
        if (userFeedback === null || userFeedback === void 0 ? void 0 : userFeedback.relevantDocumentIds) {
            correctDocumentIds.push(...userFeedback.relevantDocumentIds);
        }
        if (userFeedback === null || userFeedback === void 0 ? void 0 : userFeedback.clickedDocumentIds) {
            for (const clickedId of userFeedback.clickedDocumentIds) {
                if (!correctDocumentIds.includes(clickedId)) {
                    correctDocumentIds.push(clickedId);
                }
            }
        }
        if (correctDocumentIds.length === 0 && retrievedResults.length > 0) {
            const topResult = retrievedResults[0];
            if (topResult.score > 0.7) {
                correctDocumentIds.push(topResult.id);
            }
        }
        if (correctDocumentIds.length === 0) {
            this.logger.debug(`[RAGQueryCollector] 没有正确答案，跳过收集`);
            return null;
        }
        return await this.collectQueryDocumentPair(query, correctDocumentIds, {
            source: userFeedback ? 'AUTO_ANNOTATION' : 'USER_QUERY',
            timestamp: new Date(),
        });
    }
    async collectBatch(pairs) {
        this.logger.log(`[RAGQueryCollector] 批量收集: pairsCount=${pairs.length}`);
        const ids = [];
        for (const pair of pairs) {
            try {
                const id = await this.collectQueryDocumentPair(pair.query, pair.correctDocumentIds, pair.metadata);
                ids.push(id);
            }
            catch (error) {
                this.logger.warn(`[RAGQueryCollector] 收集失败: query="${pair.query.substring(0, 50)}...", error=${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        this.logger.log(`[RAGQueryCollector] 批量收集完成: successCount=${ids.length}/${pairs.length}`);
        return ids;
    }
    async getCollectedPairs(options) {
        this.logger.warn(`[RAGQueryCollector] getCollectedPairs 未实现存储机制，返回空数组`);
        return [];
    }
    async exportForEvaluation(pairs) {
        return pairs.map((pair) => ({
            query: pair.query,
            ground_truth_document_ids: pair.correctDocumentIds,
        }));
    }
};
exports.RAGQueryCollectorService = RAGQueryCollectorService;
exports.RAGQueryCollectorService = RAGQueryCollectorService = RAGQueryCollectorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        rag_service_1.RagService])
], RAGQueryCollectorService);
//# sourceMappingURL=rag-query-collector.service.js.map