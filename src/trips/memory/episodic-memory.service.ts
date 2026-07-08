// Round 3: Episodic Memory Service
// 情景记忆：存储具体旅行体验
// 参考: Synapse 2026, Generative Agents 2023

import { Injectable, Logger } from '@nestjs/common';
import {
  EpisodicMemory,
  MemoryType,
  ShapleyAttribution,
  TripOutcomeDimensions,
  ActrDecayParams,
  LifeEventType,
} from '../attribution/types/self-evolution.types';

/**
 * 情景记忆生成请求
 */
export interface EpisodicMemoryRequest {
  userId: string;
  tripId: string;
  events: any[]; // TravelEvent 事件
  attribution: ShapleyAttribution[];
  outcome: TripOutcomeDimensions;
  timestamp: Date;
}

/**
 * 情景记忆检索请求
 */
export interface EpisodicMemoryRetrievalRequest {
  userId: string;
  queryEmbedding?: number[];
  queryText?: string;
  topK?: number;
  minActivationScore?: number;
  season?: string; // 季节过滤
}

@Injectable()
export class EpisodicMemoryService {
  private readonly logger = new Logger(EpisodicMemoryService.name);
  private memories = new Map<string, EpisodicMemory>(); // 内存存储（实际应该用数据库）

  // ACT-R 衰减参数
  private actrParams: ActrDecayParams = {
    d: 0.5, // 衰减参数
    baseActivation: 1.0,
    eventTriggerReset: true,
    seasonalReinforcement: true,
    socialCorrection: true,
  };

  /**
   * 从 Trajectory 事件生成情景记忆
   */
  async generate(request: EpisodicMemoryRequest): Promise<EpisodicMemory> {
    // 提取关键事件（最近 10 个）
    const keyEvents = request.events.slice(-10);

    // 生成自然语言摘要（简化实现，实际应该用 LLM）
    const summary = await this.generateSummary({
      keyEvents,
      attribution: request.attribution.slice(0, 3), // Top-3 归因
      outcome: request.outcome,
    });

    // 生成 embedding（简化实现，实际应该用 embedding 服务）
    const embedding = await this.generateEmbedding(summary);

    // 创建情景记忆
    const memory: EpisodicMemory = {
      id: this.generateId(),
      userId: request.userId,
      tripId: request.tripId,
      type: MemoryType.EPISODIC,
      content: summary,
      embedding,
      activationScore: this.actrParams.baseActivation,
      lastAccessedAt: new Date(),
      accessHistory: [new Date()],
      seasonalityFactor: this.calculateSeasonality(request.timestamp),
      socialCorrection: [], // 初始为空，后续更新
      confidence: 0.7, // 初始置信度
      metadata: {
        attribution: request.attribution,
        outcome: request.outcome,
        timestamp: request.timestamp,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 存储记忆
    this.memories.set(memory.id, memory);

    this.logger.log(`Generated episodic memory for trip ${request.tripId}`);
    return memory;
  }

  /**
   * 生成自然语言摘要
   */
  private async generateSummary(params: {
    keyEvents: any[];
    attribution: ShapleyAttribution[];
    outcome: TripOutcomeDimensions;
  }): Promise<string> {
    // 简化实现：基于归因和结果生成摘要
    // 实际应该用 LLM 生成更自然的摘要

    const topAttribution = params.attribution[0];
    const overallScore = params.outcome.overallSatisfaction.score;

    const summary = `${params.keyEvents[0]?.occurredAt?.toISOString().split('T')[0] || 'Unknown'} 的旅行，满意度 ${overallScore.toFixed(2)}/5。关键决策：${topAttribution?.nodeName || '未知'} 贡献最大 (${(topAttribution?.shapleyValue || 0).toFixed(2)})。搭子满意度 ${params.outcome.companionSatisfaction.score.toFixed(2)}，预算准确度 ${params.outcome.budgetAccuracy.score.toFixed(2)}。`;

    return summary;
  }

  /**
   * 生成 embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // 简化实现：基于文本哈希生成伪 embedding
    // 实际应该用 embedding 服务（如 OpenAI embeddings）
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
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * 计算季节性因子
   */
  private calculateSeasonality(timestamp: Date): any {
    const month = timestamp.getMonth();
    let season: string;
    let activation: number;

    if (month >= 2 && month <= 4) {
      season = 'spring';
      activation = 1.0;
    } else if (month >= 5 && month <= 7) {
      season = 'summer';
      activation = 1.0;
    } else if (month >= 8 && month <= 10) {
      season = 'autumn';
      activation = 1.0;
    } else {
      season = 'winter';
      activation = 1.0;
    }

    return { season, activation };
  }

  /**
   * 检索情景记忆
   */
  async retrieve(request: EpisodicMemoryRetrievalRequest): Promise<EpisodicMemory[]> {
    const userMemories = Array.from(this.memories.values()).filter(
      m => m.userId === request.userId && m.type === MemoryType.EPISODIC,
    );

    // 更新激活度
    for (const memory of userMemories) {
      memory.activationScore = this.calculateActivation(memory);
    }

    // 过滤
    let filtered = userMemories;
    if (request.minActivationScore !== undefined) {
      const minScore = request.minActivationScore;
      filtered = filtered.filter(m => m.activationScore >= minScore);
    }
    if (request.season) {
      filtered = filtered.filter(
        m => m.seasonalityFactor.season === request.season,
      );
    }

    // 排序（按激活度降序）
    filtered.sort((a, b) => b.activationScore - a.activationScore);

    // 取 Top-K
    const topK = request.topK || 10;
    const results = filtered.slice(0, topK);

    // 更新访问历史
    for (const memory of results) {
      memory.lastAccessedAt = new Date();
      memory.accessHistory.push(new Date());
    }

    this.logger.log(`Retrieved ${results.length} episodic memories for user ${request.userId}`);
    return results;
  }

  /**
   * ACT-R 激活度计算
   * B(t) = ln(Σ t_j^(-d))
   */
  private calculateActivation(memory: EpisodicMemory): number {
    const d = this.actrParams.d;
    const currentTime = new Date();
    const accesses = memory.accessHistory;

    if (accesses.length === 0) {
      return memory.activationScore;
    }

    const sum = accesses.reduce((acc, accessTime) => {
      const t = (currentTime.getTime() - accessTime.getTime()) / (1000 * 60 * 60 * 24); // 天数
      return acc + Math.pow(t + 1, -d); // +1 避免除零
    }, 0);

    const activation = Math.log(sum);

    // 应用季节性强化
    if (this.actrParams.seasonalReinforcement) {
      const currentSeason = this.getCurrentSeason();
      if (memory.seasonalityFactor.season === currentSeason) {
        return Math.min(1, activation * memory.seasonalityFactor.activation);
      }
    }

    // 应用社交修正
    if (this.actrParams.socialCorrection && memory.socialCorrection.length > 0) {
      const socialFactor = memory.socialCorrection.reduce(
        (acc, correction) => acc * correction.correctionFactor,
        1.0,
      );
      return Math.min(1, activation * socialFactor);
    }

    return Math.min(1, Math.max(0, activation));
  }

  /**
   * 获取当前季节
   */
  private getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
  }

  /**
   * 事件触发重置
   */
  async resetOnLifeEvent(userId: string, eventType: LifeEventType): Promise<void> {
    const userMemories = Array.from(this.memories.values()).filter(
      m => m.userId === userId,
    );

    const resetFactor = this.getResetFactor(eventType);

    for (const memory of userMemories) {
      memory.activationScore *= resetFactor;
      memory.updatedAt = new Date();
    }

    this.logger.log(
      `Reset memories for user ${userId} on life event ${eventType} with factor ${resetFactor}`,
    );
  }

  /**
   * 获取重置因子
   */
  private getResetFactor(eventType: LifeEventType): number {
    switch (eventType) {
      case LifeEventType.MARRIAGE:
      case LifeEventType.CHILDBIRTH:
        return 0.5; // 重大生活事件，大幅降低旧记忆权重
      case LifeEventType.RETIREMENT:
      case LifeEventType.RELOCATION:
        return 0.7;
      case LifeEventType.CAREER_CHANGE:
        return 0.8;
      default:
        return 0.9;
    }
  }

  /**
   * 社交修正
   */
  async applySocialCorrection(
    memoryId: string,
    companionId: string,
    correctionFactor: number,
  ): Promise<void> {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      this.logger.warn(`Memory ${memoryId} not found for social correction`);
      return;
    }

    // 查找或创建社交修正记录
    const existingCorrection = memory.socialCorrection.find(
      c => c.companionId === companionId,
    );
    if (existingCorrection) {
      existingCorrection.correctionFactor = correctionFactor;
    } else {
      memory.socialCorrection.push({ companionId, correctionFactor });
    }

    memory.updatedAt = new Date();
    this.logger.log(
      `Applied social correction to memory ${memoryId} for companion ${companionId}`,
    );
  }

  /**
   * 获取用户的所有情景记忆
   */
  getUserMemories(userId: string): EpisodicMemory[] {
    return Array.from(this.memories.values()).filter(
      m => m.userId === userId && m.type === MemoryType.EPISODIC,
    );
  }

  /**
   * 删除记忆
   */
  async deleteMemory(memoryId: string): Promise<void> {
    this.memories.delete(memoryId);
    this.logger.log(`Deleted memory ${memoryId}`);
  }

  /**
   * 批量生成情景记忆
   */
  async generateBatch(requests: EpisodicMemoryRequest[]): Promise<EpisodicMemory[]> {
    return Promise.all(requests.map(req => this.generate(req)));
  }

  /**
   * 配置 ACT-R 参数
   */
  updateActrParams(params: Partial<ActrDecayParams>): void {
    this.actrParams = { ...this.actrParams, ...params };
    this.logger.log('ACT-R params updated', this.actrParams);
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `episodic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
