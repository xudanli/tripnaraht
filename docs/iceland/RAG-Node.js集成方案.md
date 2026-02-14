# 冰岛知识库 RAG 集成方案 - NestJS + Prisma + pgvector 版本 v1.0

## 1. 概述

本文档说明如何使用 **NestJS + Prisma + pgvector** 构建 TripNARA 冰岛知识库的 RAG 系统。

**技术栈优势**：
- 🏗️ **NestJS** - 企业级框架，完善的依赖注入和模块化
- 🗄️ **Prisma** - 类型安全的 ORM，优秀的开发体验
- 🔢 **pgvector** - PostgreSQL 向量扩展，高性能向量搜索
- 🚀 **全栈 TypeScript** - 类型安全从前到后

---

## 2. 项目初始化

### 2.1 创建 NestJS 项目

```bash
# 安装 NestJS CLI
npm i -g @nestjs/cli

# 创建项目
nest new tripnara-rag-nestjs
cd tripnara-rag-nestjs

# 安装依赖
npm install @prisma/client
npm install -D prisma

# 安装 OpenAI SDK
npm install openai

# 安装其他工具
npm install @nestjs/config class-validator class-transformer
```

### 2.2 初始化 Prisma

```bash
# 初始化 Prisma（选择 PostgreSQL）
npx prisma init

# 这会创建：
# - prisma/schema.prisma
# - .env
```

### 2.3 配置 PostgreSQL + pgvector

```bash
# Docker 方式启动 PostgreSQL + pgvector
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=tripnara_kb \
  -p 5432:5432 \
  ankane/pgvector
```

或使用 Docker Compose:

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: ankane/pgvector
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: tripnara_kb
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

启动：
```bash
docker-compose up -d
```

---

## 3. Prisma Schema 设计

### 3.1 核心 Schema

```prisma
// prisma/schema.prisma

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgvector(map: "vector")]
}

// ===== 知识库文件表 =====
model KnowledgeFile {
  id        String   @id @default(uuid())
  filename  String   @unique
  filepath  String
  category  String   // practical_guides, decision_support, safety, etc.
  version   String
  language  String   @default("zh-CN")

  credibilityScore Float   @map("credibility_score")
  dataSources      String[] @map("data_sources")
  lastUpdated      DateTime @map("last_updated")

  chunks    Chunk[]

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("knowledge_files")
}

// ===== 文档分块表 =====
model Chunk {
  id       String @id @default(uuid())
  chunkId  String @unique @map("chunk_id") // rhythm_pattern_relaxed_001

  content  String @db.Text

  // pgvector 向量字段 (1536维度 - OpenAI text-embedding-3-large)
  embedding Unsupported("vector(1536)")?

  // 元数据
  type            String  // rhythm_pattern, legal_rule, operational_guide, etc.
  section         String?
  credibilityScore Float  @map("credibility_score")
  keywords        String[]

  // 关联
  fileId          String @map("file_id")
  file            KnowledgeFile @relation(fields: [fileId], references: [id], onDelete: Cascade)

  // 附加元数据（JSON）
  metadata        Json?

  tokenCount      Int? @map("token_count")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([type])
  @@index([credibilityScore])
  @@map("chunks")
}

// ===== 关键词索引表（辅助检索）=====
model KeywordIndex {
  id       String   @id @default(uuid())
  keyword  String   @unique
  files    String[] // 相关文件列表

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("keyword_indices")
}

// ===== 查询历史表（用于分析和优化）=====
model QueryHistory {
  id              String   @id @default(uuid())
  query           String
  retrievedChunks Json     @map("retrieved_chunks") // chunk IDs
  answer          String?  @db.Text

  avgCredibility  Float?   @map("avg_credibility")
  executionTimeMs Int      @map("execution_time_ms")

  userId          String?  @map("user_id") // 可选：关联用户

  createdAt DateTime @default(now()) @map("created_at")

  @@index([createdAt])
  @@map("query_history")
}
```

### 3.2 创建 pgvector 扩展

```sql
-- prisma/migrations/init/migration.sql

-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建向量索引（使用 IVFFlat 或 HNSW）
-- IVFFlat 索引
CREATE INDEX chunks_embedding_idx ON chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 或使用 HNSW 索引（更快但占用更多内存）
-- CREATE INDEX chunks_embedding_hnsw_idx ON chunks
-- USING hnsw (embedding vector_cosine_ops);
```

### 3.3 生成 Prisma Client

```bash
# 运行迁移
npx prisma migrate dev --name init

# 生成 Prisma Client
npx prisma generate

# 查看数据库
npx prisma studio
```

---

## 4. NestJS 项目结构

```
src/
├── main.ts
├── app.module.ts
├── config/
│   └── configuration.ts              # 环境配置
│
├── prisma/
│   ├── prisma.module.ts              # Prisma 模块
│   └── prisma.service.ts             # Prisma 服务
│
├── knowledge-base/
│   ├── knowledge-base.module.ts
│   ├── services/
│   │   ├── loader.service.ts         # 加载知识库文件
│   │   ├── chunking.service.ts       # 分块策略
│   │   └── indexing.service.ts       # 索引构建
│   ├── dto/
│   │   └── knowledge-file.dto.ts
│   └── entities/
│       └── knowledge-file.entity.ts
│
├── embedding/
│   ├── embedding.module.ts
│   ├── services/
│   │   └── embedding.service.ts      # OpenAI embedding
│   └── dto/
│       └── embedding.dto.ts
│
├── retrieval/
│   ├── retrieval.module.ts
│   ├── services/
│   │   ├── vector-search.service.ts  # pgvector 搜索
│   │   ├── keyword-boost.service.ts  # 关键词增强
│   │   └── reranker.service.ts       # 重排
│   └── dto/
│       └── search.dto.ts
│
├── rag/
│   ├── rag.module.ts
│   ├── services/
│   │   ├── rag-pipeline.service.ts   # RAG 主管道
│   │   ├── context-fusion.service.ts # 上下文融合
│   │   └── credibility.service.ts    # 可信度追踪
│   ├── controllers/
│   │   └── rag.controller.ts         # API 端点
│   └── dto/
│       ├── query.dto.ts
│       └── response.dto.ts
│
└── common/
    ├── decorators/
    ├── filters/
    ├── guards/
    └── interceptors/
```

---

## 5. 核心代码实现

### 5.1 Prisma Service

```typescript
// src/prisma/prisma.service.ts

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    console.log('✅ Prisma 已连接到数据库');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('👋 Prisma 已断开数据库连接');
  }

  /**
   * pgvector 向量搜索（原生 SQL）
   */
  async vectorSearch(
    embedding: number[],
    limit: number = 5,
    filters?: {
      type?: string;
      credibilityMin?: number;
      category?: string;
    },
  ) {
    const whereConditions = [];
    const params: any[] = [JSON.stringify(embedding), limit];

    if (filters?.type) {
      whereConditions.push(`type = $${params.length + 1}`);
      params.push(filters.type);
    }

    if (filters?.credibilityMin) {
      whereConditions.push(`credibility_score >= $${params.length + 1}`);
      params.push(filters.credibilityMin);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const query = `
      SELECT
        id,
        chunk_id,
        content,
        type,
        credibility_score,
        keywords,
        metadata,
        file_id,
        (1 - (embedding <=> $1::vector)) as similarity
      FROM chunks
      ${whereClause}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `;

    return await this.$queryRawUnsafe(query, ...params);
  }

  /**
   * 批量插入向量
   */
  async batchInsertChunks(chunks: any[]) {
    return await this.$transaction(
      chunks.map((chunk) =>
        this.$executeRaw`
          INSERT INTO chunks (id, chunk_id, content, embedding, type, credibility_score, keywords, file_id, metadata)
          VALUES (
            ${chunk.id}::uuid,
            ${chunk.chunkId},
            ${chunk.content},
            ${JSON.stringify(chunk.embedding)}::vector,
            ${chunk.type},
            ${chunk.credibilityScore},
            ${chunk.keywords}::text[],
            ${chunk.fileId}::uuid,
            ${JSON.stringify(chunk.metadata)}::jsonb
          )
        `,
      ),
    );
  }
}
```

```typescript
// src/prisma/prisma.module.ts

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### 5.2 Embedding Service

```typescript
// src/embedding/services/embedding.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  /**
   * 嵌入单个文本
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('嵌入失败:', error);
      throw error;
    }
  }

  /**
   * 批量嵌入（分批处理）
   */
  async embedTexts(texts: string[], batchSize: number = 100): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: batch,
        encoding_format: 'float',
      });

      embeddings.push(...response.data.map((d) => d.embedding));

      console.log(`嵌入进度: ${Math.min(i + batchSize, texts.length)}/${texts.length}`);
    }

    return embeddings;
  }

  /**
   * 计算向量维度
   */
  getEmbeddingDimension(): number {
    return 1536; // text-embedding-3-large
  }
}
```

### 5.3 Knowledge Base Loader Service

```typescript
// src/knowledge-base/services/loader.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

export interface KBFileData {
  filename: string;
  filepath: string;
  content: any;
  metadata: {
    version: string;
    credibility_score: number;
    language: string;
    data_sources: string[];
    last_updated: string;
  };
}

@Injectable()
export class LoaderService {
  private kbPath: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.kbPath = this.configService.get('KB_PATH') || './knowledge-base/iceland';
  }

  /**
   * 加载所有知识库文件
   */
  async loadAllFiles(): Promise<KBFileData[]> {
    const files: KBFileData[] = [];

    const walkDir = (dirPath: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith('.json')) {
          try {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

            files.push({
              filename: entry.name,
              filepath: fullPath,
              content,
              metadata: content.metadata || {
                version: '1.0.0',
                credibility_score: 0.8,
                language: 'zh-CN',
                data_sources: [],
                last_updated: new Date().toISOString(),
              },
            });

            console.log(`✅ 已加载: ${entry.name}`);
          } catch (error) {
            console.error(`❌ 加载失败 ${entry.name}:`, error);
          }
        }
      }
    };

    walkDir(this.kbPath);
    console.log(`\n📊 总共加载 ${files.length} 个文件`);
    return files;
  }

  /**
   * 保存文件到数据库
   */
  async saveFile(fileData: KBFileData): Promise<string> {
    const category = this.detectCategory(fileData.filename);

    const file = await this.prisma.knowledgeFile.upsert({
      where: { filename: fileData.filename },
      update: {
        filepath: fileData.filepath,
        category,
        version: fileData.metadata.version,
        credibilityScore: fileData.metadata.credibility_score,
        dataSources: fileData.metadata.data_sources,
        lastUpdated: new Date(fileData.metadata.last_updated),
      },
      create: {
        filename: fileData.filename,
        filepath: fileData.filepath,
        category,
        version: fileData.metadata.version,
        language: fileData.metadata.language,
        credibilityScore: fileData.metadata.credibility_score,
        dataSources: fileData.metadata.data_sources,
        lastUpdated: new Date(fileData.metadata.last_updated),
      },
    });

    return file.id;
  }

  /**
   * 检测文件分类
   */
  private detectCategory(filename: string): string {
    if (filename.includes('rhythm') || filename.includes('persona')) {
      return 'decision_support';
    }
    if (filename.includes('rental') || filename.includes('packing')) {
      return 'practical_guides';
    }
    if (filename.includes('rules')) {
      return 'culture_rules';
    }
    if (filename.includes('risk') || filename.includes('hazard')) {
      return 'safety';
    }
    if (filename.includes('weather') || filename.includes('seasonal')) {
      return 'geography_seasonal';
    }
    return 'general';
  }
}
```

### 5.4 Chunking Service

```typescript
// src/knowledge-base/services/chunking.service.ts

import { Injectable } from '@nestjs/common';
import { KBFileData } from './loader.service';

export interface Chunk {
  chunkId: string;
  content: string;
  type: string;
  credibilityScore: number;
  keywords: string[];
  section?: string;
  metadata?: any;
}

@Injectable()
export class ChunkingService {
  /**
   * 策略1: 按对象分块
   */
  chunkByObject(kbFile: KBFileData, arrayPath: string): Chunk[] {
    const chunks: Chunk[] = [];

    const array = this.getNestedValue(kbFile.content, arrayPath);
    if (!Array.isArray(array)) return chunks;

    array.forEach((item, index) => {
      const itemId = item.rhythm_id || item.route_id || `item_${index}`;

      chunks.push({
        chunkId: `${kbFile.filename}_${itemId}_${index}`,
        content: JSON.stringify(item, null, 2),
        type: this.detectType(item),
        credibilityScore: kbFile.metadata.credibility_score,
        keywords: this.extractKeywords(item),
        section: arrayPath,
        metadata: {
          file: kbFile.filename,
          index,
        },
      });
    });

    return chunks;
  }

  /**
   * 策略2: 按章节分块
   */
  chunkBySection(kbFile: KBFileData, sections: string[]): Chunk[] {
    const chunks: Chunk[] = [];
    const content = kbFile.content;

    sections.forEach((section) => {
      if (content[section]) {
        chunks.push({
          chunkId: `${kbFile.filename}_${section}`,
          content: JSON.stringify({ [section]: content[section] }, null, 2),
          type: 'operational_guide',
          credibilityScore: kbFile.metadata.credibility_score,
          keywords: [section],
          section,
          metadata: {
            file: kbFile.filename,
          },
        });
      }
    });

    return chunks;
  }

  /**
   * 自动选择分块策略
   */
  autoChunk(kbFile: KBFileData): Chunk[] {
    if (kbFile.filename.includes('rhythm')) {
      return this.chunkByObject(kbFile, 'rhythm_patterns');
    }

    if (kbFile.filename.includes('rental')) {
      return this.chunkBySection(kbFile, [
        'overview',
        'rental_companies',
        'vehicle_types',
        'insurance_breakdown',
        'pickup_process',
        'driving_rules',
        'return_process',
      ]);
    }

    if (kbFile.filename.includes('rules')) {
      return this.chunkByObject(kbFile, 'environmental_laws.laws');
    }

    // 默认：整个文件作为一个chunk
    return [
      {
        chunkId: `${kbFile.filename}_full`,
        content: JSON.stringify(kbFile.content, null, 2),
        type: 'general',
        credibilityScore: kbFile.metadata.credibility_score,
        keywords: [kbFile.filename],
      },
    ];
  }

  // 辅助方法
  private getNestedValue(obj: any, path: string) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  private detectType(item: any): string {
    if (item.rhythm_id) return 'rhythm_pattern';
    if (item.route_id) return 'route';
    if (item.law_id) return 'legal_rule';
    if (item.hazard_id) return 'hazard';
    return 'unknown';
  }

  private extractKeywords(item: any): string[] {
    const keywords: string[] = [];

    if (item.rhythm_name) keywords.push(item.rhythm_name);
    if (item.route_name) keywords.push(item.route_name);

    if (item.description) {
      const words = item.description
        .split(/[\s、，。]+/)
        .filter((w: string) => w.length > 2 && w.length < 20);
      keywords.push(...words.slice(0, 5));
    }

    return [...new Set(keywords)];
  }
}
```

### 5.5 Indexing Service

```typescript
// src/knowledge-base/services/indexing.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../embedding/services/embedding.service';
import { LoaderService } from './loader.service';
import { ChunkingService } from './chunking.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class IndexingService {
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
    console.log('🚀 开始索引知识库...\n');

    // 1. 加载文件
    const files = await this.loader.loadAllFiles();

    for (const file of files) {
      await this.indexSingleFile(file);
    }

    console.log('\n✅ 知识库索引完成！');
  }

  /**
   * 索引单个文件
   */
  async indexSingleFile(fileData: any): Promise<void> {
    console.log(`\n📝 索引文件: ${fileData.filename}`);

    // 1. 保存文件记录
    const fileId = await this.loader.saveFile(fileData);

    // 2. 分块
    const chunks = this.chunking.autoChunk(fileData);
    console.log(`  ✂️  生成 ${chunks.length} 个chunks`);

    // 3. 向量化
    const texts = chunks.map((c) => c.content);
    const embeddings = await this.embedding.embedTexts(texts);
    console.log(`  🔢 完成向量化`);

    // 4. 准备数据
    const chunkData = chunks.map((chunk, index) => ({
      id: uuidv4(),
      chunkId: chunk.chunkId,
      content: chunk.content,
      embedding: embeddings[index],
      type: chunk.type,
      credibilityScore: chunk.credibilityScore,
      keywords: chunk.keywords,
      fileId,
      metadata: chunk.metadata,
    }));

    // 5. 批量插入
    await this.prisma.batchInsertChunks(chunkData);
    console.log(`  💾 已保存到数据库`);
  }

  /**
   * 清空索引
   */
  async clearIndex(): Promise<void> {
    await this.prisma.chunk.deleteMany();
    await this.prisma.knowledgeFile.deleteMany();
    console.log('🗑️  已清空知识库索引');
  }

  /**
   * 重建索引
   */
  async rebuildIndex(): Promise<void> {
    await this.clearIndex();
    await this.indexAllKnowledgeBase();
  }
}
```

### 5.6 Vector Search Service

```typescript
// src/retrieval/services/vector-search.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../embedding/services/embedding.service';

export interface SearchResult {
  id: string;
  chunkId: string;
  content: string;
  type: string;
  credibilityScore: number;
  keywords: string[];
  metadata: any;
  fileId: string;
  similarity: number;
}

@Injectable()
export class VectorSearchService {
  constructor(
    private prisma: PrismaService,
    private embedding: EmbeddingService,
  ) {}

  /**
   * 向量搜索
   */
  async search(
    query: string,
    options: {
      limit?: number;
      credibilityMin?: number;
      type?: string;
      category?: string;
    } = {},
  ): Promise<SearchResult[]> {
    const { limit = 5, credibilityMin = 0.85, type } = options;

    // 1. 向量化查询
    const queryEmbedding = await this.embedding.embedText(query);

    // 2. pgvector 搜索
    const results = await this.prisma.vectorSearch(queryEmbedding, limit, {
      type,
      credibilityMin,
    });

    return results as SearchResult[];
  }

  /**
   * 混合搜索（向量 + 关键词）
   */
  async hybridSearch(
    query: string,
    keywords: string[],
    options: any = {},
  ): Promise<SearchResult[]> {
    // 向量搜索
    const vectorResults = await this.search(query, { ...options, limit: 10 });

    // 关键词匹配增强
    const boostedResults = vectorResults.map((result) => {
      let boost = 1.0;

      // 关键词匹配度提升
      const matchedKeywords = result.keywords.filter((kw) =>
        keywords.some((qkw) => kw.includes(qkw) || qkw.includes(kw)),
      );

      boost += matchedKeywords.length * 0.1;

      return {
        ...result,
        similarity: result.similarity * boost,
      };
    });

    // 重新排序并返回top-k
    return boostedResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit || 5);
  }
}
```

### 5.7 RAG Pipeline Service

```typescript
// src/rag/services/rag-pipeline.service.ts

import { Injectable } from '@nestjs/common';
import { VectorSearchService } from '../../retrieval/services/vector-search.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface RAGResponse {
  query: string;
  answer: string;
  sources: any[];
  credibilityReport: {
    averageScore: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
  executionTimeMs: number;
}

@Injectable()
export class RagPipelineService {
  private openai: OpenAI;

  constructor(
    private vectorSearch: VectorSearchService,
    private configService: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });
  }

  /**
   * 执行完整 RAG 流程
   */
  async execute(query: string): Promise<RAGResponse> {
    const startTime = Date.now();

    // 1. 检索相关文档
    console.log(`🔍 检索: "${query}"`);
    const results = await this.vectorSearch.search(query, {
      limit: 5,
      credibilityMin: 0.85,
    });

    // 2. 生成可信度报告
    const credibilityReport = this.generateCredibilityReport(results);

    // 3. 融合上下文
    const context = this.fuseContext(results);

    // 4. LLM 生成
    const answer = await this.generateAnswer(query, context, results);

    const executionTime = Date.now() - startTime;

    return {
      query,
      answer,
      sources: results,
      credibilityReport,
      executionTimeMs: executionTime,
    };
  }

  /**
   * 生成可信度报告
   */
  private generateCredibilityReport(results: any[]) {
    let total = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    results.forEach((r) => {
      const score = r.credibilityScore || r.credibility_score || 0;
      total += score;

      if (score >= 0.9) high++;
      else if (score >= 0.8) medium++;
      else low++;
    });

    return {
      averageScore: results.length > 0 ? total / results.length : 0,
      highConfidence: high,
      mediumConfidence: medium,
      lowConfidence: low,
    };
  }

  /**
   * 融合上下文
   */
  private fuseContext(results: any[]): string {
    return results
      .map((r, i) => {
        const score = r.credibilityScore || r.credibility_score || 0;
        const emoji = score >= 0.9 ? '🟢' : score >= 0.8 ? '🟡' : '🔴';

        return `
【文档 ${i + 1}】${emoji} 可信度: ${(score * 100).toFixed(0)}%
类型: ${r.type}

${r.content}
---`;
      })
      .join('\n\n');
  }

  /**
   * LLM 生成答案
   */
  private async generateAnswer(
    query: string,
    context: string,
    sources: any[],
  ): Promise<string> {
    const systemPrompt = `你是 TripNARA 冰岛旅行助手。

职责：
1. 基于下面的知识库内容回答用户问题
2. 必须在回复中明确标注来源
3. 如果不确定，要说"我没有找到相关信息"
4. 对于高风险信息（法律、安全），必须强调可信度评分

知识库内容：
${context}

重要提示：
- 法律相关必须标注 "⚖️ 来源：{来源}"
- 安全建议必须标注 "⚠️ 可信度：{评分}"`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `问题：${query}\n\n请基于知识库内容回答。`,
        },
      ],
      temperature: 0.7,
    });

    let answer = response.choices[0].message.content || '';

    // 添加来源追踪
    answer += `\n\n---\n📚 **参考来源**：\n`;
    sources.forEach((s, i) => {
      const score = s.credibilityScore || s.credibility_score || 0;
      answer += `${i + 1}. ${s.chunkId || s.chunk_id} (可信度: ${(score * 100).toFixed(0)}%)\n`;
    });

    return answer;
  }
}
```

### 5.8 RAG Controller

```typescript
// src/rag/controllers/rag.controller.ts

import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { RagPipelineService } from '../services/rag-pipeline.service';
import { VectorSearchService } from '../../retrieval/services/vector-search.service';
import { IndexingService } from '../../knowledge-base/services/indexing.service';

// DTOs
class QueryDto {
  query: string;
}

class RetrieveDto {
  query: string;
  limit?: number;
  credibilityMin?: number;
}

@Controller('api/rag')
export class RagController {
  constructor(
    private ragPipeline: RagPipelineService,
    private vectorSearch: VectorSearchService,
    private indexing: IndexingService,
  ) {}

  /**
   * POST /api/rag/query
   * 完整 RAG 查询
   */
  @Post('query')
  async query(@Body() dto: QueryDto) {
    return await this.ragPipeline.execute(dto.query);
  }

  /**
   * POST /api/rag/retrieve
   * 仅检索文档
   */
  @Post('retrieve')
  async retrieve(@Body() dto: RetrieveDto) {
    const results = await this.vectorSearch.search(dto.query, {
      limit: dto.limit || 5,
      credibilityMin: dto.credibilityMin || 0.85,
    });

    return {
      query: dto.query,
      results,
      count: results.length,
    };
  }

  /**
   * POST /api/rag/rebuild-index
   * 重建索引
   */
  @Post('rebuild-index')
  async rebuildIndex() {
    await this.indexing.rebuildIndex();
    return { message: '索引重建完成' };
  }

  /**
   * GET /api/rag/health
   * 健康检查
   */
  @Get('health')
  async health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
```

---

## 6. 模块配置

### 6.1 App Module

```typescript
// src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { RagModule } from './rag/rag.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    KnowledgeBaseModule,
    EmbeddingModule,
    RetrievalModule,
    RagModule,
  ],
})
export class AppModule {}
```

### 6.2 RAG Module

```typescript
// src/rag/rag.module.ts

import { Module } from '@nestjs/common';
import { RagController } from './controllers/rag.controller';
import { RagPipelineService } from './services/rag-pipeline.service';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';

@Module({
  imports: [RetrievalModule, KnowledgeBaseModule],
  controllers: [RagController],
  providers: [RagPipelineService],
  exports: [RagPipelineService],
})
export class RagModule {}
```

---

## 7. 环境配置

```bash
# .env

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tripnara_kb?schema=public"

# OpenAI
OPENAI_API_KEY="sk-..."

# Knowledge Base Path
KB_PATH="./knowledge-base/iceland"

# Server
PORT=3000
NODE_ENV=development
```

---

## 8. 使用示例

### 8.1 启动项目

```bash
# 开发模式
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

### 8.2 初始化索引

```bash
# 通过 API
curl -X POST http://localhost:3000/api/rag/rebuild-index

# 或通过 NestJS CLI（需要创建命令）
npm run cli -- index:rebuild
```

### 8.3 查询示例

```bash
# RAG 查询
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "冬季自驾需要什么装备？"}'

# 仅检索
curl -X POST http://localhost:3000/api/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "租车保险",
    "limit": 5,
    "credibilityMin": 0.90
  }'
```

---

## 9. 性能优化

### 9.1 pgvector 索引优化

```sql
-- 使用 HNSW 索引（更快的查询）
CREATE INDEX chunks_embedding_hnsw_idx ON chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- 调整查询参数
SET hnsw.ef_search = 100;
```

### 9.2 批量查询优化

```typescript
// 使用 Prisma 事务
await prisma.$transaction([
  prisma.chunk.findMany(...),
  prisma.keywordIndex.findMany(...),
]);
```

### 9.3 缓存策略

```typescript
// 安装 cache-manager
npm install cache-manager

// 使用 NestJS Cache
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      ttl: 300, // 5分钟
      max: 100, // 最多缓存100个查询
    }),
  ],
})
```

---

## 10. 总结

✅ **完整的 NestJS + Prisma + pgvector 实现**
- 企业级架构（模块化、依赖注入）
- 类型安全（TypeScript + Prisma）
- 高性能向量搜索（pgvector + HNSW 索引）
- 完整的 RAG 管道
- RESTful API

🚀 **技术栈优势**：
- ✅ NestJS：完善的框架生态，易于扩展
- ✅ Prisma：类型安全 ORM，优秀的开发体验
- ✅ pgvector：原生 PostgreSQL，成熟稳定

📝 **版本**: v1.0
**最后更新**: 2026-01-23
**维护人**: TripNARA 团队
