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
var IndexingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const embedding_service_1 = require("../../places/services/embedding.service");
const loader_service_1 = require("./loader.service");
const chunking_service_1 = require("./chunking.service");
const uuid_1 = require("uuid");
let IndexingService = IndexingService_1 = class IndexingService {
    constructor(prisma, loader, chunking, embedding) {
        this.prisma = prisma;
        this.loader = loader;
        this.chunking = chunking;
        this.embedding = embedding;
        this.logger = new common_1.Logger(IndexingService_1.name);
    }
    async indexAllKnowledgeBase() {
        this.logger.log('🚀 开始索引知识库...\n');
        const files = await this.loader.loadAllFiles();
        for (const file of files) {
            await this.indexSingleFile(file);
        }
        this.logger.log('\n✅ 知识库索引完成！');
    }
    async indexSingleFile(fileData) {
        this.logger.log(`\n📝 索引文件: ${fileData.filename}`);
        const fileId = await this.loader.saveFile(fileData);
        const chunks = this.chunking.autoChunk(fileData);
        this.logger.log(`  ✂️  生成 ${chunks.length} 个chunks`);
        const texts = chunks.map((c) => c.content);
        const embeddings = await this.embedding.generateEmbeddingsBatch(texts);
        this.logger.log(`  🔢 完成向量化`);
        const chunkData = chunks.map((chunk, index) => ({
            id: (0, uuid_1.v4)(),
            chunkId: chunk.chunkId,
            content: chunk.content.substring(0, 50000),
            embedding: embeddings[index],
            type: chunk.type,
            credibilityScore: chunk.credibilityScore,
            keywords: chunk.keywords,
            fileId,
            section: chunk.section,
            metadata: chunk.metadata,
        }));
        await this.batchInsertChunks(chunkData);
        this.logger.log(`  💾 已保存到数据库`);
    }
    async batchInsertChunks(chunks) {
        const batchSize = 100;
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            await this.prisma.$transaction(batch.map((chunk) => this.prisma.$executeRaw `
            INSERT INTO chunks (
              id, chunk_id, content, embedding, type, credibility_score, 
              keywords, file_id, section, metadata, created_at, updated_at
            )
            VALUES (
              ${chunk.id}::uuid,
              ${chunk.chunkId},
              ${chunk.content},
              ${JSON.stringify(chunk.embedding)}::vector,
              ${chunk.type},
              ${chunk.credibilityScore},
              ${chunk.keywords}::text[],
              ${chunk.fileId}::uuid,
              ${chunk.section || null},
              ${chunk.metadata ? JSON.stringify(chunk.metadata) : null}::jsonb,
              NOW(),
              NOW()
            )
          `));
        }
    }
    async clearIndex() {
        await this.prisma.chunk.deleteMany();
        await this.prisma.knowledgeFile.deleteMany();
        this.logger.log('🗑️  已清空知识库索引');
    }
    async rebuildIndex() {
        await this.clearIndex();
        await this.indexAllKnowledgeBase();
    }
};
exports.IndexingService = IndexingService;
exports.IndexingService = IndexingService = IndexingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        loader_service_1.LoaderService,
        chunking_service_1.ChunkingService,
        embedding_service_1.EmbeddingService])
], IndexingService);
//# sourceMappingURL=indexing.service.js.map