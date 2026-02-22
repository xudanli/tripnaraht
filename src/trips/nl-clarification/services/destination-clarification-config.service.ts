// src/trips/nl-clarification/services/destination-clarification-config.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CountriesService } from '../../../countries/countries.service';
import {
  DestinationClarificationConfig,
  ClarificationRound,
  ClarificationQuestionDef,
} from '../config/destination-clarification.config';
import { ConversationMessage } from '../../services/nl-conversation-context.service';

@Injectable()
export class DestinationClarificationConfigService {
  private readonly logger = new Logger(DestinationClarificationConfigService.name);

  // 内存缓存（避免频繁查询数据库）
  private configCache = new Map<string, { config: DestinationClarificationConfig; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟

  constructor(
    private readonly prisma: PrismaService,
    private readonly countriesService: CountriesService,
  ) {}

  /**
   * 清除指定目的地的缓存（用于配置更新后）
   */
  clearCache(destinationCode?: string): void {
    if (destinationCode) {
      this.configCache.delete(destinationCode.toUpperCase());
      this.logger.debug(`已清除 ${destinationCode} 的配置缓存`);
    } else {
      this.configCache.clear();
      this.logger.debug('已清除所有配置缓存');
    }
  }

  /**
   * 获取目的地的澄清配置
   */
  async getConfig(destinationCode: string): Promise<DestinationClarificationConfig | null> {
    const cacheKey = destinationCode.toUpperCase();
    
    // 检查缓存
    const cached = this.configCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.config;
    }
    
    try {
      const configEntity = await this.prisma.destinationClarificationConfig.findUnique({
        where: { destinationCode: cacheKey },
      });
      
      if (!configEntity || !configEntity.enabled) {
        return null; // 未启用特化配置，使用通用流程
      }
      
      const config = configEntity.config as unknown as DestinationClarificationConfig;
      
      // 🆕 验证配置完整性（调试用）
      if (config.userPersonas && !config.userPersonas.ai_decision_logic) {
        this.logger.warn(`配置 ${cacheKey} 缺少 ai_decision_logic，但继续使用`);
      }
      
      // 更新缓存
      this.configCache.set(cacheKey, {
        config,
        timestamp: Date.now(),
      });
      
      return config;
    } catch (error: any) {
      this.logger.error(`获取目的地配置失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 获取当前轮次应该问的问题
   */
  async getCurrentRoundQuestions(
    destinationCode: string,
    currentParams: Record<string, any>,
    conversationHistory: ConversationMessage[]
  ): Promise<{
    round: ClarificationRound;
    questions: ClarificationQuestionDef[];
    shouldTriggerGate?: boolean;
  } | null> {
    const config = await this.getConfig(destinationCode);
    if (!config) {
      return null; // 使用通用流程
    }
    
    // 确定当前应该进入哪个轮次
    const currentRound = this.determineCurrentRound(config, currentParams, conversationHistory);
    if (!currentRound) {
      return null; // 所有轮次已完成
    }
    
    // 过滤已问过的问题
    const askedQuestionIds = this.extractAskedQuestionIds(conversationHistory);
    this.logger.debug(`[${destinationCode}] 已问过的问题ID: ${askedQuestionIds.join(', ') || '无'}`);
    this.logger.debug(`[${destinationCode}] 当前轮次 ${currentRound.roundId} 共有 ${currentRound.questions.length} 个问题`);
    const questions = currentRound.questions.filter(q => !askedQuestionIds.includes(q.id));
    this.logger.debug(`[${destinationCode}] 过滤已问过的问题后: ${questions.length}/${currentRound.questions.length} 个问题`);
    
    if (questions.length > 0) {
      this.logger.debug(`[${destinationCode}] 剩余问题ID: ${questions.map(q => q.id).join(', ')}`);
    }
    
    // 应用依赖规则
    const filteredQuestions = this.applyDependencies(questions, currentParams);
    this.logger.debug(`[${destinationCode}] 应用依赖规则后: ${filteredQuestions.length}/${questions.length} 个问题`);
    
    if (filteredQuestions.length === 0 && questions.length > 0) {
      this.logger.warn(`[${destinationCode}] 所有问题都被依赖规则过滤掉了，当前参数: ${JSON.stringify(currentParams)}`);
      this.logger.warn(`[${destinationCode}] 被过滤的问题: ${questions.map(q => `${q.id}(${q.dependencies?.length || 0}个依赖)`).join(', ')}`);
    }
    
    if (filteredQuestions.length === 0 && currentRound.questions.length > 0) {
      this.logger.warn(`[${destinationCode}] 当前轮次 ${currentRound.roundId} 没有可问的问题，可能所有问题都已问过或被过滤`);
    }
    
    // 🆕 如果当前轮次的问题为空（如round_1_basic），但完成条件未满足，仍然返回该轮次
    // 这样系统可以继续等待LLM解析更多字段，而不是跳过该轮次
    if (filteredQuestions.length === 0 && currentRound.questions.length === 0) {
      const isCompleted = this.checkCompletionConditions(currentRound.completionConditions, currentParams, currentRound);
      if (!isCompleted) {
        this.logger.debug(`[${destinationCode}] 当前轮次 ${currentRound.roundId} 无问题但未完成，返回该轮次等待LLM解析更多字段`);
        // 仍然返回该轮次，但questions为空，系统会继续使用通用流程提取字段
        return {
          round: currentRound,
          questions: [],
          shouldTriggerGate: false,
        };
      }
    }
    
    return {
      round: currentRound,
      questions: filteredQuestions,
      shouldTriggerGate: currentRound.roundId === 'round_4_gate',
    };
  }

  /**
   * 确定当前应该进入哪个轮次
   */
  private determineCurrentRound(
    config: DestinationClarificationConfig,
    currentParams: Record<string, any>,
    conversationHistory: ConversationMessage[]
  ): ClarificationRound | null {
    // 按优先级排序
    const sortedRounds = [...config.clarificationRounds].sort((a, b) => a.priority - b.priority);
    
    for (const round of sortedRounds) {
      // 检查触发条件
      if (this.checkTriggerConditions(round.triggerConditions, currentParams, conversationHistory, config)) {
        // 检查是否已完成
        const isCompleted = this.checkCompletionConditions(round.completionConditions, currentParams);
        
        // 🆕 如果轮次未完成，但问题为空（如round_1_basic），跳过它继续检查下一轮
        // 这样可以避免在基础字段未完全解析时就卡在round_1_basic
        if (!isCompleted) {
          if (round.questions.length === 0) {
            // round_1_basic 无问题但未完成，继续检查下一轮
            this.logger.debug(`[${config.destinationCode}] 轮次 ${round.roundId} 未完成但无问题，跳过继续检查下一轮`);
            continue;
          }
          return round; // 找到未完成的轮次且有问题的轮次
        }
      }
    }
    
    return null; // 所有轮次都已完成
  }

  /**
   * 检查触发条件
   */
  private checkTriggerConditions(
    conditions: ClarificationRound['triggerConditions'],
    currentParams: Record<string, any>,
    conversationHistory: ConversationMessage[],
    config?: DestinationClarificationConfig
  ): boolean {
    // 检查必需字段
    if (conditions.requiredFields && conditions.requiredFields.length > 0) {
      for (const field of conditions.requiredFields) {
        if (!currentParams[field]) {
          return false;
        }
      }
    }
    
    // 检查上一轮次是否完成
    if (conditions.previousRoundCompleted && config) {
      const previousRound = this.findRoundById(conditions.previousRoundCompleted, config);
      if (previousRound) {
        const isCompleted = this.checkCompletionConditions(
          previousRound.completionConditions,
          currentParams,
          previousRound
        );
        if (!isCompleted) {
          this.logger.debug(`上一轮次 ${conditions.previousRoundCompleted} 未完成，当前轮次无法触发`);
          return false; // 上一轮次未完成
        } else {
          this.logger.debug(`上一轮次 ${conditions.previousRoundCompleted} 已完成，当前轮次可以触发`);
        }
      } else {
        // 如果找不到上一轮次，检查是否是因为配置问题
        // 如果配置中有 previousRoundCompleted 要求，但找不到对应的轮次，记录警告
        // 但为了容错，如果当前轮次的所有必需字段都已满足，允许继续
        this.logger.warn(`找不到上一轮次: ${conditions.previousRoundCompleted}，但继续检查当前轮次条件`);
        // 不返回 false，允许继续检查（如果必需字段都满足）
      }
    }
    
    return true;
  }

  /**
   * 检查完成条件
   */
  private checkCompletionConditions(
    conditions: ClarificationRound['completionConditions'],
    currentParams: Record<string, any>,
    round?: ClarificationRound
  ): boolean {
    // 检查必需字段
    for (const field of conditions.requiredFields) {
      if (!currentParams[field]) {
        this.logger.debug(`完成条件检查失败: 缺少必需字段 ${field}`);
        return false;
      }
    }
    
    // 如果要求所有问题已回答，检查该轮次的所有问题是否都已回答
    if (conditions.allQuestionsAnswered && round) {
      for (const question of round.questions) {
        const fieldName = question.metadata?.fieldName;
        if (fieldName && !currentParams[fieldName]) {
          this.logger.debug(`完成条件检查失败: 问题 ${question.id} (字段 ${fieldName}) 未回答`);
          return false;
        }
        // 如果没有 fieldName，检查问题是否在对话历史中被回答过
        // 这里简化处理，主要依赖 fieldName
      }
    }
    
    return true;
  }

  /**
   * 查找轮次（辅助方法）
   */
  private findRoundById(
    roundId: string,
    config: DestinationClarificationConfig
  ): ClarificationRound | null {
    // 从配置中查找轮次
    return config.clarificationRounds.find(r => r.roundId === roundId) || null;
  }

  /**
   * 应用依赖规则
   */
  private applyDependencies(
    questions: ClarificationQuestionDef[],
    currentParams: Record<string, any>
  ): ClarificationQuestionDef[] {
    return questions.filter(q => {
      if (!q.dependencies || q.dependencies.length === 0) {
        return true; // 无依赖，始终显示
      }
      
      // 检查所有依赖是否满足
      return q.dependencies.every(dep => {
        const fieldValue = currentParams[dep.fieldId];
        // 支持数组字段（如 activityTypes）
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(dep.value);
        }
        return fieldValue === dep.value;
      });
    });
  }

  /**
   * 提取已问过的问题ID
   */
  private extractAskedQuestionIds(conversationHistory: ConversationMessage[]): string[] {
    const questionIds: string[] = [];
    
    for (const msg of conversationHistory) {
      if (msg.role === 'assistant' && msg.metadata?.clarificationQuestions) {
        const questions = msg.metadata.clarificationQuestions as any[];
        questions.forEach((q: any) => {
          if (q.id) {
            questionIds.push(q.id);
          }
        });
      }
    }
    
    return questionIds;
  }

  /**
   * 创建或更新配置
   */
  async createOrUpdateConfig(
    destinationCode: string,
    config: DestinationClarificationConfig,
    userId?: string
  ): Promise<void> {
    const cacheKey = destinationCode.toUpperCase();
    
    await this.prisma.destinationClarificationConfig.upsert({
      where: { destinationCode: cacheKey },
      update: {
        destinationName: config.destinationName,
        enabled: config.enabled,
        config: config as any,
        metadata: config.metadata as any,
        updatedBy: userId || 'system',
        updatedAt: new Date(),
      },
      create: {
        destinationCode: cacheKey,
        destinationName: config.destinationName,
        enabled: config.enabled,
        config: config as any,
        metadata: config.metadata as any,
        createdBy: userId || 'system',
      },
    });
    
    // 清除缓存
    this.configCache.delete(cacheKey);
  }

  /**
   * 启用/禁用配置
   */
  async setEnabled(destinationCode: string, enabled: boolean, userId?: string): Promise<void> {
    const cacheKey = destinationCode.toUpperCase();
    
    await this.prisma.destinationClarificationConfig.update({
      where: { destinationCode: cacheKey },
      data: {
        enabled,
        updatedBy: userId || 'system',
        updatedAt: new Date(),
      },
    });
    
    // 清除缓存
    this.configCache.delete(cacheKey);
  }

  /**
   * 获取所有配置
   */
  async getAllConfigs(): Promise<Array<{
    destinationCode: string;
    destinationName: string;
    enabled: boolean;
    metadata?: any;
    userPersonas?: {
      user_personas?: Array<{ persona_id: string; persona_name: string }>;
    };
  }>> {
    const configs = await this.prisma.destinationClarificationConfig.findMany({
      select: {
        destinationCode: true,
        destinationName: true,
        enabled: true,
        metadata: true,
        config: true, // 🆕 添加 config 字段以获取用户画像信息
      },
      orderBy: {
        destinationCode: 'asc',
      },
    });
    
    return configs.map(c => {
      const configData = c.config as any;
      return {
        destinationCode: c.destinationCode,
        destinationName: c.destinationName,
        enabled: c.enabled,
        metadata: c.metadata as any,
        // 🆕 添加用户画像摘要信息
        userPersonas: configData.userPersonas ? {
          user_personas: configData.userPersonas.user_personas?.map((p: any) => ({
            persona_id: p.persona_id,
            persona_name: p.persona_name,
            persona_name_en: p.persona_name_en,
            percentage_of_visitors: p.percentage_of_visitors || p.percentage_of_climbers,
          })) || [],
        } : undefined,
      };
    });
  }

  /**
   * 🆕 获取目的地的所有 Critical 字段列表
   * 包含配置中的 Critical 问题 + 交易货币（currency，目的地支持时）
   */
  async getCriticalFields(destinationCode: string): Promise<Array<{
    fieldName: string;
    questionId: string;
    question: string;
  }>> {
    const criticalFields: Array<{
      fieldName: string;
      questionId: string;
      question: string;
    }> = [];

    const config = await this.getConfig(destinationCode);
    if (config) {
      for (const round of config.clarificationRounds) {
        for (const question of round.questions) {
          if (question.metadata?.isCritical && question.metadata?.fieldName) {
            criticalFields.push({
              fieldName: question.metadata.fieldName,
              questionId: question.id,
              question: question.question,
            });
          }
        }
      }
    }

    // 🆕 交易货币：目的地有国家档案时，添加 currency 为 Critical 字段
    try {
      const supported = await this.countriesService.getSupportedCurrencies(destinationCode);
      if (supported.length > 0 && !criticalFields.some((f) => f.fieldName === 'currency')) {
        criticalFields.push({
          fieldName: 'currency',
          questionId: 'gl_currency',
          question: '你希望用什么货币来规划预算？',
        });
      }
    } catch {
      // 国家档案不存在时跳过
    }

    return criticalFields;
  }

  /**
   * 🆕 根据字段名获取对应的问题定义
   * 对 currency 字段返回动态生成的选项（目的地支持的货币）
   */
  async getQuestionsForFields(
    destinationCode: string,
    fieldNames: string[],
  ): Promise<ClarificationQuestionDef[]> {
    const questions: ClarificationQuestionDef[] = [];
    const fieldNameSet = new Set(fieldNames);

    // 🆕 交易货币：动态生成选项
    if (fieldNameSet.has('currency')) {
      try {
        const supported = await this.countriesService.getSupportedCurrencies(destinationCode);
        questions.push({
          id: 'gl_currency',
          question: '你希望用什么货币来规划预算？',
          type: 'single_choice',
          options: supported.map((c) => ({
            value: c.code,
            label: c.isLocal ? `${c.name}（当地）` : c.name,
          })),
          required: true,
          metadata: { fieldName: 'currency', isCritical: true, category: 'budget', priority: 'high' },
          default: 'CNY',
        });
      } catch (err: any) {
        this.logger.warn(`获取目的地货币失败: ${err?.message}`);
      }
    }

    const config = await this.getConfig(destinationCode);
    if (config) {
      for (const round of config.clarificationRounds) {
        for (const question of round.questions) {
          if (question.metadata?.fieldName && fieldNameSet.has(question.metadata.fieldName)) {
            questions.push(question);
          }
        }
      }
    }

    return questions;
  }
}
