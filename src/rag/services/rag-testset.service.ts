// src/rag/services/rag-testset.service.ts
/**
 * RAG 测试集服务（文件存储）
 *
 * 用于建立/维护 query -> ground truth (chunkIds) 的评估数据集，
 * 支持读取、写入、以及简单校验。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface RagEvalTestCase {
  id: string;
  query: string;
  groundTruthChunkIds: string[];
  notes?: string;
  tags?: string[];
}

export interface RagEvalTestset {
  version: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  testCases: RagEvalTestCase[];
}

@Injectable()
export class RagTestsetService {
  private readonly logger = new Logger(RagTestsetService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getTestsetPath(): string {
    const configured = process.env.RAG_EVAL_TESTSET_PATH;
    if (configured && configured.trim()) return configured.trim();
    return path.resolve(process.cwd(), 'e2e-cases', 'rag-eval-testset.json');
  }

  async load(): Promise<RagEvalTestset> {
    const p = this.getTestsetPath();
    try {
      const raw = await fs.readFile(p, 'utf-8');
      const parsed = JSON.parse(raw) as RagEvalTestset;
      this.validate(parsed);
      return parsed;
    } catch (e: any) {
      // 不存在则返回默认空测试集
      if (e?.code === 'ENOENT') {
        const now = new Date().toISOString();
        const empty: RagEvalTestset = {
          version: 1,
          name: 'default',
          description: 'Auto-created empty testset. Populate testCases for evaluation.',
          createdAt: now,
          updatedAt: now,
          testCases: [],
        };
        return empty;
      }
      throw e;
    }
  }

  async save(testset: RagEvalTestset): Promise<void> {
    const p = this.getTestsetPath();
    const dir = path.dirname(p);
    await fs.mkdir(dir, { recursive: true });

    const now = new Date().toISOString();
    const toSave: RagEvalTestset = {
      ...testset,
      version: testset.version ?? 1,
      updatedAt: now,
      createdAt: testset.createdAt || now,
      testCases: Array.isArray(testset.testCases) ? testset.testCases : [],
    };

    this.validate(toSave);
    await fs.writeFile(p, JSON.stringify(toSave, null, 2), 'utf-8');
    this.logger.log(`✅ RAG testset saved: ${p} (cases=${toSave.testCases.length})`);
  }

  private validate(testset: RagEvalTestset): void {
    if (!testset || typeof testset !== 'object') throw new Error('Invalid testset');
    if (!Array.isArray(testset.testCases)) throw new Error('testCases must be an array');
    for (const tc of testset.testCases) {
      if (!tc.id || typeof tc.id !== 'string') throw new Error('testCase.id required');
      if (!tc.query || typeof tc.query !== 'string') throw new Error(`testCase.query required: ${tc.id}`);
      if (!Array.isArray(tc.groundTruthChunkIds)) {
        throw new Error(`testCase.groundTruthChunkIds must be array: ${tc.id}`);
      }
    }
  }

  /**
   * 查找与查询相关的 chunks（用于帮助填充 groundTruthChunkIds）
   */
  async findRelevantChunks(
    query: string,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    chunkId: string;
    content: string;
    type: string;
    keywords: string[];
    filename: string;
    category: string;
    similarity?: number;
  }>> {
    // 使用关键词匹配查找相关 chunks
    const keywords = this.extractKeywords(query);
    
    if (keywords.length === 0) {
      return [];
    }

    // 构建关键词搜索条件
    const keywordConditions = keywords.map((kw) => 
      `(c.content ILIKE '%${kw}%' OR EXISTS(SELECT 1 FROM unnest(c.keywords) AS k WHERE LOWER(k) LIKE LOWER('%${kw}%')))`
    ).join(' OR ');

    const querySql = `
      SELECT
        c.id,
        c.chunk_id,
        c.content,
        c.type,
        c.keywords,
        kf.filename,
        kf.category
      FROM chunks c
      INNER JOIN knowledge_files kf ON c.file_id = kf.id
      WHERE ${keywordConditions}
      LIMIT ${limit * 2}
    `;

    const results = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      chunk_id: string;
      content: string;
      type: string;
      keywords: string[];
      filename: string;
      category: string;
    }>>(querySql);

    // 按相关性评分
    const scored = results.map((r) => {
      const contentLower = r.content.toLowerCase();
      const keywordsLower = r.keywords.map((k) => k.toLowerCase());
      let score = 0;

      keywords.forEach((kw) => {
        if (contentLower.includes(kw.toLowerCase())) score += 2;
        if (keywordsLower.some((k) => k.includes(kw.toLowerCase()))) score += 3;
      });

      return { ...r, similarity: score };
    });

    scored.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    return scored.slice(0, limit).map((r) => ({
      id: r.id,
      chunkId: r.chunk_id,
      content: r.content,
      type: r.type,
      keywords: r.keywords,
      filename: r.filename,
      category: r.category,
      similarity: r.similarity,
    }));
  }

  /**
   * 获取所有 chunks 的简要信息（用于浏览）
   */
  async listAllChunks(limit: number = 100): Promise<Array<{
    id: string;
    chunkId: string;
    content: string;
    type: string;
    keywords: string[];
    filename: string;
    category: string;
  }>> {
    const chunks = await this.prisma.chunk.findMany({
      select: {
        id: true,
        chunkId: true,
        content: true,
        type: true,
        keywords: true,
        file: {
          select: {
            filename: true,
            category: true,
          },
        },
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return chunks.map((c) => ({
      id: c.id,
      chunkId: c.chunkId,
      content: c.content,
      type: c.type,
      keywords: c.keywords,
      filename: c.file.filename,
      category: c.file.category,
    }));
  }

  /**
   * 提取关键词
   */
  private extractKeywords(query: string): string[] {
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

  /**
   * 判断是否为停用词
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这',
      '怎么', '哪些', '什么', '时候', '需要',
    ]);
    return stopWords.has(word.toLowerCase());
  }
}
