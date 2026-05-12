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
  /**
   * 🆕 用于展示的答案标签（优先与用户所见选项 label 一致）
   * - key 与 questionAnswers 相同（questionId 或 questionId_paramKey）
   * - value/label 由 controller 基于 options 做映射后写入
   */
  questionAnswerLabels?: Record<string, { value: string | string[]; label: string }>;
  /** 行程ID（当行程创建成功时） */
  tripId?: string;
  /** 是否成功（当行程创建成功时） */
  success?: boolean;
  /** 思考过程（用于 NLChatInterface MessageBubble 展示，会话恢复时从 metadata 读取） */
  thinkingProcess?: { summary: string; content: string };
  /** 进展步骤（用于 NLChatInterface MessageBubble 展示，会话恢复时从 metadata 读取） */
  progressSteps?: Array<{ id?: string; label: string; detail?: string; status?: string }>;
  /** 阶段指示器（分层可见，会话恢复时从 metadata 读取） */
  phaseIndicator?: { phase: number; phaseName: string; progress: string; totalPhases?: number };
  /** Clarification DSL Compiler：供下一轮 NL 解析注入 LLM 的约束片段 */
  dslLlmPromptContext?: string;
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
  /**
   * 🆕 决策快照：已确认的意图参数锚点
   * - 用于多轮对话中保持“已确认事实”不丢失（如目的地/日期/预算）
   * - LLM parse 时应将其注入 prompt，禁止覆盖或遗忘
   */
  currentIntentSnapshot?: {
    version: number;
    confirmedParams: Record<string, any>;
    lastConfirmedAt?: string;
  };
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
 * 3. 会话退出时清空（前端调用 delete 接口）
 * 4. 非活动超时 30 分钟自动清空（防止残留数据）
 * 
 * 清理策略：
 * - 前端退出对话界面时应调用 DELETE /api/trips/nl/conversation/:sessionId
 * - 非活动 30 分钟后自动过期（作为兜底）
 */
@Injectable()
export class NLConversationContextService {
  private readonly logger = new Logger(NLConversationContextService.name);
  private readonly cachePrefix = 'nl_conversation:';
  private readonly defaultTtl = 30 * 60; // 30 分钟（非活动超时，秒）
  
  // 内存缓存（主存储，会话退出时清空）
  private readonly memoryCache = new Map<string, { context: NLConversationContext; expires: number }>();
  
  // 用户清空标记：记录哪些用户已清空所有会话
  private readonly userClearedFlags = new Set<string>();

  constructor(
    @Optional() private readonly redisService?: RedisService,
  ) {
    if (this.redisService) {
      this.logger.log('自然语言对话上下文已启用（Redis + 内存，30分钟非活动超时）');
    } else {
      this.logger.log('自然语言对话上下文已启用（仅内存，30分钟非活动超时）');
    }
  }

  /**
   * 创建或获取会话上下文
   * 
   * 🆕 修复：如果用户已设置清空标记，清除标记（新会话已创建）
   */
  async getOrCreateSession(sessionId: string | undefined, userId: string): Promise<string> {
    if (sessionId) {
      // 🆕 如果用户已设置清空标记，说明这是旧会话，应该创建新会话
      if (this.userClearedFlags.has(userId)) {
        this.logger.debug(`用户 ${userId} 已清空所有会话，忽略旧 sessionId ${sessionId}，创建新会话`);
        this.userClearedFlags.delete(userId); // 清除标记
        sessionId = undefined; // 强制创建新会话
      } else {
        // 验证会话是否存在
        const exists = await this.sessionExists(sessionId, userId);
        if (exists) {
          return sessionId;
        }
        this.logger.warn(`会话 ${sessionId} 不存在或已过期，创建新会话`);
      }
    }
    
    // 创建新会话
    const newSessionId = `nl_${userId}_${randomUUID().substring(0, 8)}`;
    const context: NLConversationContext = {
      sessionId: newSessionId,
      userId,
      messages: [],
      currentIntentSnapshot: {
        version: 1,
        confirmedParams: {},
        lastConfirmedAt: undefined,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.defaultTtl * 1000).toISOString(),
    };
    
    // 🆕 清除清空标记（新会话已创建）
    this.userClearedFlags.delete(userId);
    
    await this.saveContext(context);
    return newSessionId;
  }

  /**
   * 获取会话上下文
   * 
   * 🆕 修复：如果用户已设置清空标记，不从未知 sessionId 的 Redis 读取数据
   */
  async getContext(sessionId: string, userId: string): Promise<NLConversationContext | null> {
    const cacheKey = this.buildCacheKey(sessionId, userId);
    
    // 1. 先检查内存缓存
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && memoryEntry.expires > Date.now()) {
      if (memoryEntry.context.userId !== userId) {
        this.logger.warn(`用户 ${userId} 尝试访问其他用户的会话 ${sessionId}`);
        return null;
      }
      return memoryEntry.context;
    }
    
    // 2. 🆕 如果用户已设置清空标记，不从未知 sessionId 的 Redis 读取数据
    // 这样可以防止读取到旧会话数据
    if (this.userClearedFlags.has(userId)) {
      this.logger.debug(`用户 ${userId} 已清空所有会话，不从未知 sessionId ${sessionId} 的 Redis 读取数据`);
      return null;
    }
    
    // 3. 从 Redis 获取（如果内存缓存中没有且未设置清空标记）
    if (this.redisService) {
      try {
        const context = await this.redisService.get<NLConversationContext>(cacheKey);
        if (context) {
          // 验证用户权限
          if (context.userId !== userId) {
            this.logger.warn(`用户 ${userId} 尝试访问其他用户的会话 ${sessionId}`);
            return null;
          }
          // 🆕 同步到内存缓存
          this.memoryCache.set(cacheKey, {
            context,
            expires: Date.now() + this.defaultTtl * 1000,
          });
          return context;
        }
      } catch (error: any) {
        this.logger.warn(`从 Redis 获取上下文失败: ${error.message}`);
      }
    }
    
    return null;
  }

  /**
   * 保存会话上下文
   * 
   * 每次交互刷新 TTL（30分钟非活动超时）
   * 前端退出时应主动调用 deleteSession 清空
   */
  async saveContext(context: NLConversationContext): Promise<void> {
    const cacheKey = this.buildCacheKey(context.sessionId, context.userId);
    context.updatedAt = new Date().toISOString();
    // 刷新过期时间（每次交互时重置为30分钟后）
    context.expiresAt = new Date(Date.now() + this.defaultTtl * 1000).toISOString();
    
    // 保存到 Redis（作为跨实例共享和持久化备份）
    if (this.redisService) {
      try {
        await this.redisService.set(cacheKey, context, this.defaultTtl);
        this.logger.debug(`对话上下文已保存: ${context.sessionId}, TTL=${this.defaultTtl}秒`);
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
      currentIntentSnapshot?: {
        confirmedParams?: Record<string, any>;
        lastConfirmedAt?: string;
        version?: number;
      };
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

    if (updates.currentIntentSnapshot) {
      const base = context.currentIntentSnapshot ?? { version: 1, confirmedParams: {}, lastConfirmedAt: undefined };
      context.currentIntentSnapshot = {
        version:
          typeof updates.currentIntentSnapshot.version === 'number'
            ? updates.currentIntentSnapshot.version
            : base.version,
        confirmedParams: {
          ...(base.confirmedParams || {}),
          ...(updates.currentIntentSnapshot.confirmedParams || {}),
        },
        lastConfirmedAt: updates.currentIntentSnapshot.lastConfirmedAt ?? base.lastConfirmedAt,
      };
    }
    
    context.updatedAt = new Date().toISOString();
    await this.saveContext(context);
    return context;
  }

  /**
   * 更新指定消息的 metadata（用于补全 clarificationQuestions、plannerResponseBlocks 等）
   */
  async updateMessageMetadata(
    sessionId: string,
    userId: string,
    messageId: string,
    metadataUpdates: Partial<ConversationMessageMetadata>
  ): Promise<NLConversationContext> {
    const context = await this.getContext(sessionId, userId);
    if (!context) {
      throw new Error(`会话 ${sessionId} 不存在或已过期`);
    }
    const message = context.messages.find((m) => m.id === messageId);
    if (!message) {
      throw new Error(`消息 ${messageId} 不存在`);
    }
    if (!message.metadata) {
      message.metadata = {};
    }
    Object.assign(message.metadata, metadataUpdates);
    context.updatedAt = new Date().toISOString();
    await this.saveContext(context);
    return context;
  }

  /**
   * 删除会话（会话退出时调用）
   * 
   * ⚠️ 重要：前端在以下场景应调用此方法：
   * - 用户点击"结束对话"
   * - 用户关闭对话界面
   * - 用户切换到其他功能
   * - 行程创建成功后
   */
  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const cacheKey = this.buildCacheKey(sessionId, userId);
    
    // 从 Redis 删除
    if (this.redisService) {
      try {
        await this.redisService.del(cacheKey);
      } catch (error: any) {
        this.logger.warn(`从 Redis 删除失败: ${error.message}`);
      }
    }
    
    // 从内存缓存删除
    this.memoryCache.delete(cacheKey);
    this.logger.log(`会话已清空: ${sessionId}`);
  }

  /**
   * 🆕 删除用户的所有会话
   * 
   * 用于开始新对话时清空所有旧上下文
   * 
   * 关键修复：
   * 1. 清空内存缓存中该用户的所有会话
   * 2. 设置"清空标记"，防止后续从 Redis 读取旧数据
   * 3. 由于 Redis cache-manager 不支持模式匹配，无法直接删除 Redis 中所有匹配的键
   *    但通过清空标记，可以防止旧数据被读取
   */
  async deleteAllUserSessions(userId: string): Promise<number> {
    let deletedCount = 0;
    
    // 1. 先获取内存缓存中的所有会话（包括已过期的）
    const memorySessions: string[] = [];
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.context.userId === userId) {
        memorySessions.push(entry.context.sessionId);
        keysToDelete.push(key);
      }
    }
    
    this.logger.debug(`删除用户 ${userId} 的所有会话，内存缓存中找到 ${memorySessions.length} 个`);
    
    // 2. 删除每个会话（包括 Redis 和内存缓存）
    for (const sessionId of memorySessions) {
      try {
        await this.deleteSession(sessionId, userId);
        deletedCount++;
      } catch (error: any) {
        this.logger.warn(`删除会话 ${sessionId} 失败: ${error.message}`);
      }
    }
    
    // 3. 清理内存缓存中该用户的所有剩余会话（确保完全清空）
    for (const key of keysToDelete) {
      this.memoryCache.delete(key);
    }
    
    // 4. 🆕 设置"清空标记"，防止后续从 Redis 读取旧数据
    // 这个标记会在新会话创建后自动清除（通过 getOrCreateSession）
    this.userClearedFlags.add(userId);
    this.logger.debug(`已设置用户 ${userId} 的清空标记，防止从 Redis 读取旧数据`);
    
    // 5. 如果 Redis 可用，尝试删除已知的会话
    // 注意：由于 cache-manager 不支持模式匹配，无法删除 Redis 中所有匹配的键
    // 但通过清空标记，可以防止旧数据被读取
    if (this.redisService && memorySessions.length > 0) {
      this.logger.debug(`尝试从 Redis 删除 ${memorySessions.length} 个已知会话`);
    }
    
    this.logger.debug(`已删除用户 ${userId} 的 ${deletedCount} 个会话（内存缓存），并设置清空标记`);
    return deletedCount;
  }

  /**
   * 🆕 获取所有会话（用于管理/清理）
   * 
   * 返回所有用户的会话，用于批量操作
   */
  async getAllSessions(): Promise<Array<{ userId: string; sessionId: string }>> {
    const sessions: Array<{ userId: string; sessionId: string }> = [];
    
    for (const [, entry] of this.memoryCache.entries()) {
      if (entry.expires > Date.now() && entry.context.userId) {
        sessions.push({
          userId: entry.context.userId,
          sessionId: entry.context.sessionId,
        });
      }
    }
    
    return sessions;
  }

  /**
   * 🆕 清空所有会话（用于数据清理）
   * 
   * 清空内存缓存和 Redis 中的所有会话数据
   */
  async clearAllSessions(): Promise<number> {
    let deletedCount = 0;
    
    // 1. 获取所有会话
    const allSessions = await this.getAllSessions();
    const sessionsByUser = new Map<string, string[]>();
    
    for (const session of allSessions) {
      if (!sessionsByUser.has(session.userId)) {
        sessionsByUser.set(session.userId, []);
      }
      sessionsByUser.get(session.userId)!.push(session.sessionId);
    }
    
    this.logger.debug(`清空所有会话，共 ${sessionsByUser.size} 个用户，${allSessions.length} 个会话`);
    
    // 2. 删除每个用户的所有会话
    for (const [userId] of sessionsByUser.entries()) {
      const deleted = await this.deleteAllUserSessions(userId);
      deletedCount += deleted;
    }
    
    // 3. 清空内存缓存和清空标记
    this.memoryCache.clear();
    this.userClearedFlags.clear();
    
    this.logger.debug(`已清空所有会话，共删除 ${deletedCount} 个会话`);
    return deletedCount;
  }

  /**
   * 获取用户的所有会话
   * 🆕 优化：只返回最后一条消息用于预览
   */
  async getUserSessions(userId: string): Promise<Array<Omit<NLConversationContext, 'messages'> & { messages: ConversationMessage[] }>> {
    // 注意：Redis 的 cache-manager 不直接支持模式匹配
    // 这里只返回内存缓存中的会话
    const sessions: Array<Omit<NLConversationContext, 'messages'> & { messages: ConversationMessage[] }> = [];
    
    for (const [, entry] of this.memoryCache.entries()) {
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
    
    // 查找消息（支持多种ID格式）
    let message = context.messages.find(m => m.id === messageId);
    
    // 如果找不到，尝试查找最后一条 assistant 消息（可能是前端使用了错误的ID）
    if (!message) {
      const lastAssistantMessage = context.messages
        .filter(m => m.role === 'assistant')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      
      if (lastAssistantMessage) {
        this.logger.warn(
          `消息 ${messageId} 不存在，使用最后一条 assistant 消息 ${lastAssistantMessage.id} 代替`
        );
        message = lastAssistantMessage;
      }
    }
    
    if (!message) {
      throw new Error(`消息 ${messageId} 不存在，且会话中没有可用的 assistant 消息`);
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
    // 1. 获取问题定义（从 clarificationQuestions 中获取 fieldName 映射及 conditionalInputs 的 paramKey）
    const clarificationQuestions = message.metadata.clarificationQuestions as any[] | undefined;
    const questionToParamMap: Record<string, string> = {};
    const conditionalInputParamMap: Record<string, string> = {};
    
    if (clarificationQuestions && Array.isArray(clarificationQuestions)) {
      for (const question of clarificationQuestions) {
        if (question.id && question.metadata?.fieldName) {
          questionToParamMap[question.id] = question.metadata.fieldName;
        }
        // 为 conditionalInputs 建立映射
        // 有 paramKey: {questionId}_{paramKey} -> preferences.paramKey
        // 无 paramKey: {questionId}_{triggerValue} -> preferences.freeText
        const conditionalInputs = question.conditionalInputs as Array<{ paramKey?: string; triggerValue: string }> | undefined;
        if (conditionalInputs?.length && question.id) {
          let basePath = question.metadata?.fieldName === 'supplementPreferences' ? 'preferences' : (question.metadata?.fieldName || question.id);
          // 🆕 归一化：LLM 可能生成 qN_preferences，统一映射到 preferences，确保页面展示与下游创建行程一致
          if (/^q\d+_preferences$/i.test(question.id)) {
            basePath = 'preferences';
          }
          for (const inp of conditionalInputs) {
            if (inp.paramKey) {
              conditionalInputParamMap[`${question.id}_${inp.paramKey}`] = `${basePath}.${inp.paramKey}`;
            } else {
              conditionalInputParamMap[`${question.id}_${inp.triggerValue}`] = `${basePath}.freeText`;
            }
          }
        }
      }
    }
    
    // 2. 将问题答案转换为参数（使用 fieldName 映射，如果没有则使用问题ID）
    const paramsToUpdate: Record<string, any> = {};
    for (const [questionId, answer] of Object.entries(questionAnswers)) {
      // 🆕 confirm_inferred_info 的 conditionalInputs 需映射到顶层行程参数
      if (questionId.startsWith('confirm_inferred_info_')) {
        const paramKey = questionId.replace(/^confirm_inferred_info_/, '');
        if (paramKey === 'total_budget') {
          paramsToUpdate.totalBudget = typeof answer === 'number' ? answer : (answer != null ? Number(answer) : undefined);
        } else if (paramKey === 'date_range' && answer && typeof answer === 'object') {
          const range = answer as { start?: string; end?: string; startDate?: string; endDate?: string };
          const start = range.start ?? range.startDate;
          const end = range.end ?? range.endDate;
          if (start) paramsToUpdate.startDate = start;
          if (end) paramsToUpdate.endDate = end;
        } else if (paramKey === 'other') {
          paramsToUpdate.confirmInferredOther = answer;
        }
        continue;
      }
      if (conditionalInputParamMap[questionId]) {
        // conditionalInput 答案：merge 到嵌套路径
        // 注意：当前仅支持二级路径（如 preferences.pace），不支持三级路径
        const path = conditionalInputParamMap[questionId];
        const [parent, key] = path.includes('.') ? path.split(/\.(.*)/).filter(Boolean) : [path, null];
        if (parent && key) {
          if (!paramsToUpdate[parent]) paramsToUpdate[parent] = {};
          paramsToUpdate[parent][key] = answer;
        } else {
          paramsToUpdate[questionId] = answer;
        }
      } else {
        const paramName = questionToParamMap[questionId] || this.questionIdToParamName(questionId);
        paramsToUpdate[paramName] = answer;
      }
    }
    
    // 3. 更新 partialParams（嵌套对象如 preferences 需深度合并）
    if (!context.partialParams) {
      context.partialParams = {};
    }
    const isOtherModifyChoice = (val: unknown) => {
      if (val == null) return false;
      const s = String(val).trim();
      return /其他需要修改|其他需要调整/i.test(s);
    };
    for (const [k, v] of Object.entries(paramsToUpdate)) {
      // 🆕 防止覆盖：用户已选「确认无误」后，不允许多余的「其他需要修改」覆盖（常见于前端重复 PUT 或默认值误触发）
      if (
        k === 'confirmInferred' &&
        isOtherModifyChoice(v) &&
        (context.partialParams.confirmInferred === 'confirm' || context.partialParams.confirmInferred === '确认无误')
      ) {
        this.logger.debug(
          `忽略覆盖 confirmInferred：用户已确认，跳过将「${v}」写入（防止重复追问）`
        );
        continue;
      }
      if (v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v) && context.partialParams[k] && typeof context.partialParams[k] === 'object') {
        context.partialParams[k] = { ...context.partialParams[k], ...v };
      } else {
        context.partialParams[k] = v;
      }
    }
    
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
   * 🆕 改为 public，供外部调用
   */
  async sessionExists(sessionId: string, userId: string): Promise<boolean> {
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
