// Round 3: Semantic Memory Service
// 语义记忆：存储抽象模式和偏好
// 参考: Synapse 2026, Generative Agents 2023 (reflection mechanism)

import { Injectable, Logger } from '@nestjs/common';
import {
  SemanticMemory,
  MemoryType,
  EpisodicMemory,
} from '../attribution/types/self-evolution.types';

/**
 * 语义记忆反思请求
 */
export interface SemanticMemoryReflectionRequest {
  userId: string;
  episodicMemories: EpisodicMemory[];
  minFrequency?: number; // 最小出现频率
  minConfidence?: number; // 最小置信度
}

/**
 * 语义记忆检索请求
 */
export interface SemanticMemoryRetrievalRequest {
  userId: string;
  queryEmbedding?: number[];
  queryText?: string;
  topK?: number;
  minConfidence?: number;
  pattern?: string; // 模式过滤
}

@Injectable()
export class SemanticMemoryService {
  private readonly logger = new Logger(SemanticMemoryService.name);
  private memories = new Map<string, SemanticMemory>(); // 内存存储（实际应该用数据库）

  /**
   * 反思：从多条情景记忆聚合语义记忆
   * 参考: Generative Agents 的 reflection 机制
   */
  async reflect(request: SemanticMemoryReflectionRequest): Promise<SemanticMemory[]> {
    const { userId, episodicMemories, minFrequency = 2, minConfidence = 0.6 } = request;

    if (episodicMemories.length < minFrequency) {
      this.logger.log(
        `Not enough episodic memories for reflection (${episodicMemories.length} < ${minFrequency})`,
      );
      return [];
    }

    // 提取模式（简化实现，实际应该用 LLM）
    const patterns = await this.extractPatterns(episodicMemories);

    // 生成语义记忆
    const semanticMemories: SemanticMemory[] = [];

    for (const pattern of patterns) {
      if (pattern.frequency < minFrequency || pattern.confidence < minConfidence) {
        continue;
      }

      const summary = await this.generatePatternSummary(pattern);
      const embedding = await this.generateEmbedding(summary);

      const memory: SemanticMemory = {
        id: this.generateId(),
        userId,
        type: MemoryType.SEMANTIC,
        content: summary,
        embedding,
        activationScore: 1.0,
        lastAccessedAt: new Date(),
        accessHistory: [new Date()],
        confidence: pattern.confidence,
        sourceMemoryIds: pattern.sourceMemoryIds,
        metadata: {
          pattern: pattern.pattern,
          frequency: pattern.frequency,
          lastConfirmed: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      semanticMemories.push(memory);
      this.memories.set(memory.id, memory);
    }

    this.logger.log(
      `Generated ${semanticMemories.length} semantic memories for user ${userId}`,
    );
    return semanticMemories;
  }

  /**
   * 提取模式
   */
  private async extractPatterns(memories: EpisodicMemory[]): Promise<any[]> {
    // 简化实现：基于内容关键词提取模式
    // 实际应该用 LLM 进行模式识别

    const patternMap = new Map<string, any>();

    for (const memory of memories) {
      // 提取关键词（简化）
      const keywords = this.extractKeywords(memory.content);

      for (const keyword of keywords) {
        if (!patternMap.has(keyword)) {
          patternMap.set(keyword, {
            pattern: keyword,
            frequency: 0,
            confidence: 0,
            sourceMemoryIds: [],
          });
        }

        const pattern = patternMap.get(keyword)!;
        pattern.frequency++;
        pattern.sourceMemoryIds.push(memory.id);
        pattern.confidence = Math.min(1, pattern.frequency / memories.length);
      }
    }

    return Array.from(patternMap.values());
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简化实现：基于常见旅行关键词
    const keywords = [
      '冬季',
      '夏季',
      '摄影',
      '小团体',
      '预算',
      '搭子',
      '日出',
      '极光',
      '温泉',
      '美食',
      '徒步',
      '自驾',
      '文化',
      '历史',
    ];

    return keywords.filter(keyword => text.includes(keyword));
  }

  /**
   * 生成模式摘要
   */
  private async generatePatternSummary(pattern: any): Promise<string> {
    // 简化实现：基于模式生成摘要
    // 实际应该用 LLM 生成更自然的摘要

    return `偏好模式：${pattern.pattern}（出现 ${pattern.frequency} 次，置信度 ${(pattern.confidence * 100).toFixed(0)}%）`;
  }

  /**
   * 生成 embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // 简化实现：基于文本哈希生成伪 embedding
    const hash = this.simpleHash(text);
    const embedding = new Array(1536).fill(0);
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = ((hash >> (i % 32)) & 0xff) / 255;
    }
    return embedding;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * 检索语义记忆
   */
  async retrieve(request: SemanticMemoryRetrievalRequest): Promise<SemanticMemory[]> {
    const userMemories = Array.from(this.memories.values()).filter(
      m => m.userId === request.userId && m.type === MemoryType.SEMANTIC,
    );

    // 过滤
    let filtered = userMemories;
    if (request.minConfidence !== undefined) {
      const minConfidence = request.minConfidence;
      filtered = filtered.filter(m => m.confidence >= minConfidence);
    }
    if (request.pattern) {
      const pattern = request.pattern;
      filtered = filtered.filter(m => m.metadata.pattern.includes(pattern));
    }

    // 排序（按置信度降序）
    filtered.sort((a, b) => b.confidence - a.confidence);

    // 取 Top-K
    const topK = request.topK || 10;
    const results = filtered.slice(0, topK);

    // 更新访问历史
    for (const memory of results) {
      memory.lastAccessedAt = new Date();
      memory.accessHistory.push(new Date());
    }

    this.logger.log(`Retrieved ${results.length} semantic memories for user ${request.userId}`);
    return results;
  }

  /**
   * 更新语义记忆
   */
  async updateMemory(
    memoryId: string,
    updates: Partial<SemanticMemory>,
  ): Promise<SemanticMemory | null> {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      this.logger.warn(`Memory ${memoryId} not found for update`);
      return null;
    }

    Object.assign(memory, updates);
    memory.updatedAt = new Date();

    this.logger.log(`Updated semantic memory ${memoryId}`);
    return memory;
  }

  /**
   * 合并语义记忆
   * 当发现相似模式时，合并现有记忆
   */
  async mergeMemories(memoryIds: string[]): Promise<SemanticMemory | null> {
    if (memoryIds.length === 0) return null;

    const memories = memoryIds.map(id => this.memories.get(id)).filter(Boolean) as SemanticMemory[];
    if (memories.length === 0) return null;

    // 合并内容
    const mergedContent = this.mergeContent(memories.map(m => m.content));
    const mergedEmbedding = await this.generateEmbedding(mergedContent);
    const mergedSourceIds = memories.flatMap(m => m.sourceMemoryIds);
    const mergedFrequency = memories.reduce((sum, m) => sum + m.metadata.frequency, 0);
    const mergedConfidence = Math.min(1, memories.reduce((sum, m) => sum + m.confidence, 0) / memories.length);

    const mergedMemory: SemanticMemory = {
      id: this.generateId(),
      userId: memories[0].userId,
      type: MemoryType.SEMANTIC,
      content: mergedContent,
      embedding: mergedEmbedding,
      activationScore: 1.0,
      lastAccessedAt: new Date(),
      accessHistory: [new Date()],
      confidence: mergedConfidence,
      sourceMemoryIds: mergedSourceIds,
      metadata: {
        pattern: memories[0].metadata.pattern,
        frequency: mergedFrequency,
        lastConfirmed: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 删除旧记忆
    for (const id of memoryIds) {
      this.memories.delete(id);
    }

    // 存储合并后的记忆
    this.memories.set(mergedMemory.id, mergedMemory);

    this.logger.log(`Merged ${memoryIds.length} semantic memories into ${mergedMemory.id}`);
    return mergedMemory;
  }

  /**
   * 合并内容
   */
  private mergeContent(contents: string[]): string {
    // 简化实现：拼接内容
    // 实际应该用 LLM 生成更自然的合并摘要
    return contents.join('；');
  }

  /**
   * 获取用户的所有语义记忆
   */
  getUserMemories(userId: string): SemanticMemory[] {
    return Array.from(this.memories.values()).filter(
      m => m.userId === userId && m.type === MemoryType.SEMANTIC,
    );
  }

  /**
   * 删除记忆
   */
  async deleteMemory(memoryId: string): Promise<void> {
    this.memories.delete(memoryId);
    this.logger.log(`Deleted semantic memory ${memoryId}`);
  }

  /**
   * 批量反思
   */
  async reflectBatch(requests: SemanticMemoryReflectionRequest[]): Promise<SemanticMemory[][]> {
    return Promise.all(requests.map(req => this.reflect(req)));
  }

  /**
   * 定期反思调度
   * 建议每完成 3 次旅行或每月运行一次
   */
  async scheduleReflection(userId: string, episodicMemories: EpisodicMemory[]): Promise<void> {
    const recentMemories = episodicMemories.slice(-10); // 最近 10 条
    if (recentMemories.length >= 3) {
      await this.reflect({
        userId,
        episodicMemories: recentMemories,
        minFrequency: 2,
        minConfidence: 0.6,
      });
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `semantic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
