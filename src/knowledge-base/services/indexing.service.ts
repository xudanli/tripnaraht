// src/knowledge-base/services/indexing.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { LoaderService } from './loader.service';
import { ChunkingService } from './chunking.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private prisma: PrismaService,
    private loader: LoaderService,
    private chunking: ChunkingService,
    private embedding: EmbeddingService,
  ) {}

  /**
   * 索引所有知识库
   */
  async indexAllKnowledgeBase(): Promise<void> {
    this.logger.log('🚀 开始索引知识库...\n');

    // 1. 加载文件
    const files = await this.loader.loadAllFiles();

    for (const file of files) {
      await this.indexSingleFile(file);
    }

    this.logger.log('\n✅ 知识库索引完成！');
  }

  /**
   * 索引单个文件
   */
  async indexSingleFile(fileData: any): Promise<void> {
    this.logger.log(`\n📝 索引文件: ${fileData.filename}`);

    // 1. 保存文件记录
    const fileId = await this.loader.saveFile(fileData);

    // 2. 分块
    const chunks = this.chunking.autoChunk(fileData);
    this.logger.log(`  ✂️  生成 ${chunks.length} 个chunks`);

    // 3. 向量化
    const texts = chunks.map((c) => c.content);
    const embeddings = await this.embedding.generateEmbeddingsBatch(texts);
    this.logger.log(`  🔢 完成向量化`);

    // 4. 准备数据并批量插入
    const chunkData = chunks.map((chunk, index) => ({
      id: uuidv4(),
      chunkId: chunk.chunkId,
      content: chunk.content.substring(0, 50000), // 限制长度
      embedding: embeddings[index],
      type: chunk.type,
      credibilityScore: chunk.credibilityScore,
      keywords: chunk.keywords,
      fileId,
      section: chunk.section,
      metadata: chunk.metadata,
    }));

    // 5. 批量插入（使用事务）
    await this.batchInsertChunks(chunkData);
    this.logger.log(`  💾 已保存到数据库`);
  }

  /**
   * 批量插入 chunks
   */
  private async batchInsertChunks(chunks: Array<{
    id: string;
    chunkId: string;
    content: string;
    embedding: number[];
    type: string;
    credibilityScore: number;
    keywords: string[];
    fileId: string;
    section?: string;
    metadata?: any;
  }>): Promise<void> {
    // 分批处理，每批 100 个
    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      await this.prisma.$transaction(
        batch.map((chunk) =>
          this.prisma.$executeRaw`
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
          `
        )
      );
    }
  }

  /**
   * 清空索引
   */
  async clearIndex(): Promise<void> {
    await this.prisma.chunk.deleteMany();
    await this.prisma.knowledgeFile.deleteMany();
    this.logger.log('🗑️  已清空知识库索引');
  }

  /**
   * 重建索引
   */
  async rebuildIndex(): Promise<void> {
    await this.clearIndex();
    await this.indexAllKnowledgeBase();
  }
}
