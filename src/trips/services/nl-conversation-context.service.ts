// src/trips/services/nl-conversation-context.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { randomUUID } from 'crypto';

/**
 * 对话消息的元数据（用于存储结构化响应数据）
 */
export interface ConversationMessageMetadata {
  /** 是否需要澄清 */
  needsClarification?: boolean;
  /** 建议的问题（字符串数组，向后兼容） */
  suggestedQuestions?: string[];
  /** 结构化响应内容块（新增） */
  plannerResponseBlocks?: any[];
  /** 结构化澄清问题（新增） */
  clarificationQuestions?: any[];
  /** 解析出的行程参数 */
  parsedParams?: Record<string, any>;
  /** 是否显示确认卡片 */
  showConfirmCard?: boolean;
  /** 问题答案映射（用户回答澄清问题后更新） */
  questionAnswers?: Record<string, string | string[] | number | boolean | null>;
  /** 行程ID（当行程创建成功时） */
  tripId?: string;
  /** 是否成功（当行程创建成功时） */
  success?: boolean;
  /** 其他元数据 */
  [key: string]: any;
}

/**
 * 对话消息
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: ConversationMessageMetadata;
}

/**
 * 对话上下文
 */
export interface NLConversationContext {
  sessionId: string;
  userId: string;
  messages: ConversationMessage[];
  conversationContext?: Record<string, any>;
  partialParams?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * 自然语言行程创建对话上下文服务
 * 
 * 功能：
 * 1. 存储和管理自然语言创建行程时的对话历史
 * 2. 支持会话恢复和上下文传递
 * 3. 使用 Redis 缓存，TTL 24 小时
 */
@Injectable()
export class NLConversationContextService {
  private readonly logger = new Logger(NLConversationContextService.name);
  private readonly cachePrefix = 'nl_conversation:';
  private readonly defaultTtl = 24 * 60 * 60; // 24 小时（秒）
  
  // 内存缓存降级（当 Redis 不可用时）
  private readonly memoryCache = new Map<string, { context: NLConversationContext; expires: number }>();

  constructor(
    @Optional() private readonly redisService?: RedisService,
  ) {
    if (this.redisService) {
      this.logger.log('自然语言对话上下文缓存已启用（Redis）');
    } else {
      this.logger.warn('Redis 不可用，使用内存缓存（数据将在服务重启后丢失）');
    }
  }

  /**
   * 创建或获取会话上下文
   */
  async getOrCreateSession(sessionId: string | undefined, userId: string): Promise<string> {
    if (sessionId) {
      // 验证会话是否存在
      const exists = await this.sessionExists(sessionId, userId);
      if (exists) {
        return sessionId;
      }
      this.logger.warn(`会话 ${sessionId} 不存在或已过期，创建新会话`);
    }
    
    // 创建新会话
    const newSessionId = `nl_${userId}_${randomUUID().substring(0, 8)}`;
    const context: NLConversationContext = {
      sessionId: newSessionId,
      userId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.defaultTtl * 1000).toISOString(),
    };
    
    await this.saveContext(context);
    return newSessionId;
  }

  /**
   * 获取会话上下文
   */
  async getContext(sessionId: string, userId: string): Promise<NLConversationContext | null> {
    const cacheKey = this.buildCacheKey(sessionId, userId);
    
    // 优先从 Redis 获取
    if (this.redisService) {
      try {
        const context = await this.redisService.get<NLConversationContext>(cacheKey);
        if (context) {
          // 验证用户权限
          if (context.userId !== userId) {
            this.logger.warn(`用户 ${userId} 尝试访问其他用户的会话 ${sessionId}`);
            return null;
          }
          return context;
        }
      } catch (error: any) {
        this.logger.warn(`从 Redis 获取上下文失败: ${error.message}`);
      }
    }
    
    // 降级到内存缓存
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && memoryEntry.expires > Date.now()) {
      if (memoryEntry.context.userId !== userId) {
        return null;
      }
      return memoryEntry.context;
    }
    
    return null;
  }

  /**
   * 保存会话上下文
   * 🆕 P2: 每次保存时刷新 TTL（24小时）
   */
  async saveContext(context: NLConversationContext): Promise<void> {
    const cacheKey = this.buildCacheKey(context.sessionId, context.userId);
    context.updatedAt = new Date().toISOString();
    // 🆕 P2: 刷新过期时间（每次交互时重置为24小时后）
    context.expiresAt = new Date(Date.now() + this.defaultTtl * 1000).toISOString();
    
    // 优先保存到 Redis
    if (this.redisService) {
      try {
        await this.redisService.set(cacheKey, context, this.defaultTtl);
        this.logger.debug(`对话上下文已保存到 Redis: ${context.sessionId}, TTL=${this.defaultTtl}秒`);
      } catch (error: any) {
        this.logger.warn(`保存到 Redis 失败: ${error.message}`);
      }
    }
    
    // 同时保存到内存缓存
    this.memoryCache.set(cacheKey, {
      context,
      expires: Date.now() + this.defaultTtl * 1000,
    });
    
    // 清理过期内存缓存
    this.cleanExpiredMemoryCache();
  }

  /**
   * 添加消息到会话
   * 
   * @param sessionId 会话ID
   * @param userId 用户ID
   * @param role 消息角色（user 或 assistant）
   * @param content 消息文本内容
   * @param metadata 消息元数据（可包含结构化响应数据）
   */
  async addMessage(
    sessionId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: ConversationMessageMetadata
  ): Promise<NLConversationContext> {
    const context = await this.getContext(sessionId, userId);
    if (!context) {
      throw new Error(`会话 ${sessionId} 不存在或已过期`);
    }
    
    const message: ConversationMessage = {
      id: randomUUID(),
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata,
    };
    
    context.messages.push(message);
    context.updatedAt = new Date().toISOString();
    
    await this.saveContext(context);
    return context;
  }

  /**
   * 更新对话上下文数据
   */
  async updateContext(
    sessionId: string,
    userId: string,
    updates: {
      conversationContext?: Record<string, any>;
      partialParams?: Record<string, any>;
    }
  ): Promise<NLConversationContext> {
    const context = await this.getContext(sessionId, userId);
    if (!context) {
      throw new Error(`会话 ${sessionId} 不存在或已过期`);
    }
    
    if (updates.conversationContext) {
      context.conversationContext = {
        ...context.conversationContext,
        ...updates.conversationContext,
      };
    }
    
    if (updates.partialParams) {
      context.partialParams = {
        ...context.partialParams,
        ...updates.partialParams,
      };
    }
    
    context.updatedAt = new Date().toISOString();
    await this.saveContext(context);
    return context;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const cacheKey = this.buildCacheKey(sessionId, userId);
    
    // 从 Redis 删除
    if (this.redisService) {
      try {
        const deleted = await this.redisService.del(cacheKey);
        this.logger.debug(`从 Redis 删除会话: ${cacheKey}, 结果: ${deleted}`);
      } catch (error: any) {
        this.logger.warn(`从 Redis 删除失败: ${error.message}`);
      }
    }
    
    // 从内存缓存删除
    const memoryDeleted = this.memoryCache.delete(cacheKey);
    this.logger.debug(`从内存缓存删除会话: ${cacheKey}, 结果: ${memoryDeleted}`);
  }

  /**
   * 获取用户的所有会话
   * 🆕 优化：只返回最后一条消息用于预览
   */
  async getUserSessions(userId: string): Promise<Array<Omit<NLConversationContext, 'messages'> & { messages: ConversationMessage[] }>> {
    // 注意：Redis 的 cache-manager 不直接支持模式匹配
    // 这里只返回内存缓存中的会话
    const sessions: Array<Omit<NLConversationContext, 'messages'> & { messages: ConversationMessage[] }> = [];
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires > Date.now() && entry.context.userId === userId) {
        // 🆕 只返回最后一条消息用于预览
        const lastMessage = entry.context.messages.length > 0 
          ? [entry.context.messages[entry.context.messages.length - 1]]
          : [];
        
        sessions.push({
          sessionId: entry.context.sessionId,
          userId: entry.context.userId,
          messages: lastMessage,
          conversationContext: entry.context.conversationContext,
          partialParams: entry.context.partialParams,
          createdAt: entry.context.createdAt,
          updatedAt: entry.context.updatedAt,
          expiresAt: entry.context.expiresAt,
        });
      }
    }
    
    return sessions.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }
  
  /**
   * 🆕 更新消息的问题答案
   * 
   * 同时将答案同步到 partialParams，确保答案立即传递给后续流程
   */
  async updateMessageQuestionAnswers(
    sessionId: string,
    userId: string,
    messageId: string,
    questionAnswers: Record<string, string | string[] | number | boolean | null>
  ): Promise<ConversationMessage> {
    const context = await this.getContext(sessionId, userId);
    if (!context) {
      throw new Error(`会话 ${sessionId} 不存在或已过期`);
    }
    
    const message = context.messages.find(m => m.id === messageId);
    if (!message) {
      throw new Error(`消息 ${messageId} 不存在`);
    }
    
    // 更新消息的 questionAnswers
    if (!message.metadata) {
      message.metadata = {};
    }
    message.metadata.questionAnswers = {
      ...message.metadata.questionAnswers,
      ...questionAnswers,
    };
    
    // 🆕 将 questionAnswers 同步到 partialParams
    // 1. 获取问题定义（从 clarificationQuestions 中获取 fieldName 映射）
    const clarificationQuestions = message.metadata.clarificationQuestions as any[] | undefined;
    const questionToParamMap: Record<string, string> = {};
    
    if (clarificationQuestions && Array.isArray(clarificationQuestions)) {
      for (const question of clarificationQuestions) {
        if (question.id && question.metadata?.fieldName) {
          questionToParamMap[question.id] = question.metadata.fieldName;
        }
      }
    }
    
    // 2. 将问题答案转换为参数（使用 fieldName 映射，如果没有则使用问题ID）
    const paramsToUpdate: Record<string, any> = {};
    for (const [questionId, answer] of Object.entries(questionAnswers)) {
      // 优先使用 fieldName，如果没有则使用问题ID（去掉前缀，如 gl_experience_level -> experienceLevel）
      const paramName = questionToParamMap[questionId] || this.questionIdToParamName(questionId);
      paramsToUpdate[paramName] = answer;
    }
    
    // 3. 更新 partialParams
    if (!context.partialParams) {
      context.partialParams = {};
    }
    context.partialParams = {
      ...context.partialParams,
      ...paramsToUpdate,
    };
    
    this.logger.debug(
      `同步问题答案到参数: ${JSON.stringify(questionAnswers)} -> ${JSON.stringify(paramsToUpdate)}`
    );
    
    context.updatedAt = new Date().toISOString();
    await this.saveContext(context);
    
    return message;
  }

  /**
   * 🆕 将问题ID转换为参数名（辅助方法）
   * 
   * 例如：
   * - gl_experience_level -> experienceLevel
   * - lft_arctic_experience -> arcticExperience
   * - gl_activity_types -> activityTypes
   */
  private questionIdToParamName(questionId: string): string {
    // 移除常见前缀（gl_, lft_, sj_, al_, k2_, tibet_）
    let paramName = questionId.replace(/^(gl_|lft_|sj_|al_|k2_|tibet_)/, '');
    
    // 将 snake_case 转换为 camelCase
    paramName = paramName.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    return paramName;
  }

  /**
   * 检查会话是否存在
   */
  private async sessionExists(sessionId: string, userId: string): Promise<boolean> {
    const context = await this.getContext(sessionId, userId);
    return context !== null;
  }

  /**
   * 构建缓存键
   */
  private buildCacheKey(sessionId: string, userId: string): string {
    return `${this.cachePrefix}${userId}:${sessionId}`;
  }

  /**
   * 清理过期内存缓存
   */
  private cleanExpiredMemoryCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires <= now) {
        this.memoryCache.delete(key);
      }
    }
  }
}
