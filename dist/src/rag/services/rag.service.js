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
var RagService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const embedding_service_1 = require("../../places/services/embedding.service");
let RagService = RagService_1 = class RagService {
    constructor(prisma, embeddingService) {
        this.prisma = prisma;
        this.embeddingService = embeddingService;
        this.logger = new common_1.Logger(RagService_1.name);
        this.logger.log('✅ RagService 已统一使用新系统：KnowledgeFile + Chunks');
    }
    async retrieve(params) {
        this.logger.warn('⚠️  document_index表已删除，RagService.retrieve()不再可用。请使用ChunkRetrievalService（基于chunks表）');
        return [];
    }
    async fallbackKeywordSearch(params) {
        this.logger.warn('document_index表已删除，降级策略不再可用');
        return [];
    }
    async indexDocument(item) {
        this.logger.warn('⚠️  document_index表已删除，RagService.indexDocument()不再可用。请使用新系统（KnowledgeFile + Chunks）');
        throw new Error('document_index表已删除，请使用新系统（KnowledgeFile + Chunks）进行索引');
    }
    async indexDocuments(items) {
        this.logger.warn('⚠️  document_index表已删除，RagService.indexDocuments()不再可用。请使用新系统（KnowledgeFile + Chunks）');
        throw new Error('document_index表已删除，请使用新系统（KnowledgeFile + Chunks）进行索引');
    }
    async deleteDocument(id) {
        this.logger.warn('⚠️  document_index表已删除，RagService.deleteDocument()不再可用');
        throw new Error('document_index表已删除');
    }
    async updateDocument(id, item) {
        this.logger.warn('⚠️  document_index表已删除，RagService.updateDocument()不再可用');
        throw new Error('document_index表已删除');
    }
    async getDocuments(params) {
        const { collection, countryCode, tags, search, page = 1, pageSize = 20 } = params;
        const skip = (page - 1) * pageSize;
        const where = {};
        if (collection) {
            where.category = collection;
        }
        if (search) {
            where.OR = [
                { filename: { contains: search, mode: 'insensitive' } },
                { filepath: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [files, total] = await Promise.all([
            this.prisma.knowledgeFile.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: { updatedAt: 'desc' },
                include: {
                    _count: {
                        select: { chunks: true },
                    },
                    chunks: {
                        take: 3,
                        orderBy: { createdAt: 'asc' },
                        select: {
                            content: true,
                            type: true,
                        },
                    },
                },
            }),
            this.prisma.knowledgeFile.count({ where }),
        ]);
        const documents = files.map(file => {
            const contentPreview = file.chunks.length > 0
                ? file.chunks
                    .map(chunk => `[${chunk.type}] ${chunk.content}`)
                    .join('\n\n---\n\n')
                    .substring(0, 500) + (file.chunks.length > 0 ? '...' : '')
                : `文件: ${file.filename}\n路径: ${file.filepath}\n类别: ${file.category}`;
            return {
                id: file.id,
                collection: file.category,
                title: file.filename,
                content: contentPreview,
                source: file.filepath,
                countryCode: null,
                tags: file.dataSources || [],
                metadata: {
                    version: file.version,
                    language: file.language,
                    credibilityScore: file.credibilityScore,
                    dataSources: file.dataSources,
                    category: file.category,
                    filepath: file.filepath,
                    filename: file.filename,
                },
                createdAt: file.createdAt,
                updatedAt: file.updatedAt,
                fileId: file.id,
                chunksCount: file._count.chunks,
            };
        });
        return {
            documents,
            pagination: {
                page,
                pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
        };
    }
    async getDocument(id) {
        const file = await this.prisma.knowledgeFile.findUnique({
            where: { id },
            include: {
                chunks: {
                    take: 10,
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        chunkId: true,
                        content: true,
                        type: true,
                    },
                },
                _count: {
                    select: { chunks: true },
                },
            },
        });
        if (!file) {
            return null;
        }
        const content = file.chunks
            .map(chunk => `[${chunk.type}] ${chunk.content.substring(0, 500)}`)
            .join('\n\n---\n\n') || `文件: ${file.filename}\n路径: ${file.filepath}`;
        return {
            id: file.id,
            collection: file.category,
            title: file.filename,
            content,
            source: file.filepath,
            countryCode: null,
            tags: file.dataSources || [],
            metadata: {
                version: file.version,
                language: file.language,
                credibilityScore: file.credibilityScore,
                dataSources: file.dataSources,
                category: file.category,
                filepath: file.filepath,
                filename: file.filename,
            },
            createdAt: file.createdAt,
            updatedAt: file.updatedAt,
            fileId: file.id,
            chunksCount: file._count.chunks,
            chunks: file.chunks.map(chunk => ({
                id: chunk.id,
                chunkId: chunk.chunkId,
                content: chunk.content,
                type: chunk.type,
            })),
        };
    }
    async getStats(collection) {
        try {
            const where = collection ? { category: collection } : undefined;
            const totalCount = await this.prisma.knowledgeFile.count({
                where,
            });
            const categoryStats = await this.prisma.$queryRaw `
        SELECT 
          kf.category,
          COUNT(DISTINCT kf.id)::bigint as count,
          COUNT(c.id)::bigint as chunks_count
        FROM knowledge_files kf
        LEFT JOIN chunks c ON c.file_id = kf.id
        ${collection ? client_1.Prisma.sql `WHERE kf.category = ${collection}` : client_1.Prisma.empty}
        GROUP BY kf.category
        ORDER BY kf.category
      `;
            const collections = categoryStats.map((stat) => ({
                name: stat.category,
                count: Number(stat.count),
                countries: [],
                tags: [],
            }));
            const result = {
                totalDocuments: totalCount,
                collections,
            };
            if (collection) {
                const collectionInfo = collections.find((c) => c.name === collection);
                if (collectionInfo) {
                    result.byCollection = collectionInfo;
                }
            }
            return result;
        }
        catch (error) {
            this.logger.error(`获取 RAG 统计失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.RagService = RagService;
exports.RagService = RagService = RagService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        embedding_service_1.EmbeddingService])
], RagService);
//# sourceMappingURL=rag.service.js.map