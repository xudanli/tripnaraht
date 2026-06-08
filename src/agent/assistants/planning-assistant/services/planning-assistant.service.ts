// src/agent/assistants/planning-assistant/services/planning-assistant.service.ts

/**
 * 规划助手智能体服务 (V2.1 重构)
 * 
 * 架构定位：用户交互层入口
 * 
 * 职责（V2.1 收紧后）：
 * ✅ 对话引导 - 引导式多轮对话
 * ✅ 参数收集 - 收集用户偏好、约束
 * ✅ 结果展示/解释 - 格式化输出、人格化表达
 * ✅ 触发编排动作 - 通过 CoreGateway 触发核心动作
 * 
 * ❌ 移除（下沉到核心层）：
 * - 方案生成 → CoreGateway.generatePlan()
 * - 方案对比 → CoreGateway.comparePlans()
 * - 三人格评估 → PlanningCoreAgent 内部
 * 
 * 依赖注入（V2.1 规范）：
 * - CoreGateway: 触发核心动作的唯一入口
 * - LLMExecutor: LLM 调用的唯一入口（用于对话）
 * - 其他服务保留用于展示/解释
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmService } from '../../../../llm/services/llm.service';
import { LlmProvider } from '../../../../llm/dto/llm-request.dto';
import { PlanningWorkbenchAgentService, PlanningWorkbenchResponse } from '../../../services/planning-workbench-agent.service';
import { PersonaShellService, PersonaShellOutput } from '../../../services/persona-shell.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PersonaLanguageService, PersonaContext } from '../../shared/services/persona-language.service';
import { RecommendationEngineService } from '../../shared/services/recommendation-engine.service';
import { PreferenceLearningService } from '../../shared/services/preference-learning.service';
import { LLMExecutorService } from '../../../infra/llm-executor.service';
import { CoreGatewayService } from '../../../infra/core-gateway.service';
import {
  PlanningConversationState,
  PlanningAssistantRequest,
  PlanningAssistantResponse,
  PlanningIntent,
  UserPreferences,
  DestinationRecommendation,
  PlanCandidate,
  ConversationMessage,
} from '../interfaces/planning-assistant.interface';
import { PaConversationContextService } from './pa-conversation-context.service';
import { ConstraintSinkService } from '../../../memory/constraint-sink/constraint-sink.service';
import { compressWorldStateToNarrative } from '../../../runtime/decision-os-narrative-projection.util';
import type { DecisionOsWorldState } from '../../../runtime/decision-os-world-state.types';
import { formatDecisionOsTripTime } from '../../../runtime/decision-os-world-state.types';
import { randomUUID as uuidv4 } from 'crypto';

@Injectable()
export class PlanningAssistantService {
  private readonly logger = new Logger(PlanningAssistantService.name);

  // 会话过期时间（24小时）
  private readonly SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly paConversationContext: PaConversationContextService,
    // V2.1 Infra 层服务
    @Optional() private readonly coreGateway?: CoreGatewayService,
    @Optional() private readonly llmExecutor?: LLMExecutorService,
    // 保留用于展示/解释/偏好学习
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly planningWorkbench?: PlanningWorkbenchAgentService,
    @Optional() private readonly personaShell?: PersonaShellService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly personaLanguage?: PersonaLanguageService,
    @Optional() private readonly recommendationEngine?: RecommendationEngineService,
    @Optional() private readonly preferenceLearning?: PreferenceLearningService,
    @Optional() private readonly constraintSinkService?: ConstraintSinkService,
  ) {
    this.logger.log('🚀 规划助手智能体已初始化 (V2.1 架构)');
    this.logger.debug(`服务注入状态: CoreGateway=${!!coreGateway}, LLMExecutor=${!!llmExecutor}, LLM=${!!llmService}, PlanningWorkbench=${!!planningWorkbench}, PersonaShell=${!!personaShell}, Prisma=${!!prisma}`);
  }

  /**
   * 处理用户消息
   */
  async chat(request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    const startTime = Date.now();
    this.logger.debug(`[规划助手] 收到消息: sessionId=${request.sessionId}, message=${request.message.substring(0, 50)}...`);

    try {
      // 1. 加载或创建会话状态
      let state = await this.loadOrCreateSession(request.sessionId, request.userId);
      
      // 2. 记录用户消息
      state = this.addMessage(state, {
        id: uuidv4(),
        role: 'user',
        content: request.message,
        timestamp: new Date().toISOString(),
      });

      // 3. 分析用户意图（使用 LLM）
      const intent = await this.analyzeIntentWithLLM(request.message, state);
      this.logger.debug(`[规划助手] 意图分析: ${intent}`);

      // 4. 根据意图处理
      let response: PlanningAssistantResponse;
      
      switch (intent) {
        case 'EXPLORE':
          response = await this.handleExplore(state, request);
          break;
        case 'RECOMMEND':
          response = await this.handleRecommendWithReadiness(state, request);
          break;
        case 'COLLECT_INFO':
          response = await this.handleCollectInfo(state, request);
          break;
        case 'GENERATE_PLAN':
          response = await this.handleGeneratePlanWithWorkbench(state, request);
          break;
        case 'COMPARE':
          response = await this.handleCompare(state, request);
          break;
        case 'ADJUST':
          response = await this.handleAdjust(state, request);
          break;
        case 'CONFIRM':
          response = await this.handleConfirmAndSaveTrip(state, request);
          break;
        case 'QUESTION':
          response = await this.handleQuestionWithLLM(state, request);
          break;
        default:
          response = await this.handleGeneralWithLLM(state, request);
      }

      // 5. 记录助手回复
      state = this.addMessage(state, {
        id: uuidv4(),
        role: 'assistant',
        content: response.message,
        intent,
        timestamp: new Date().toISOString(),
      });

      // 6. 更新会话状态
      state.phase = response.phase;
      state.updatedAt = new Date().toISOString();
      await this.saveSession(state);

      this.logger.debug(`[规划助手] 处理完成: 耗时=${Date.now() - startTime}ms, phase=${response.phase}`);
      
      return response;
    } catch (error: any) {
      this.logger.error(`[规划助手] 处理失败: ${error.message}`, error.stack);
      return this.createErrorResponse(error.message);
    }
  }

  /**
   * 创建新会话
   */
  async createSession(userId?: string): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    
    const state: PlanningConversationState = {
      sessionId,
      userId,
      phase: 'INITIAL',
      preferences: {},
      messageHistory: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(Date.now() + this.SESSION_TTL_MS).toISOString(),
    };
    
    await this.saveSession(state);
    this.logger.debug(`[规划助手] 创建新会话: ${sessionId}`);
    
    return sessionId;
  }

  /**
   * 获取会话状态
   */
  async getSessionState(sessionId: string, userId?: string): Promise<PlanningConversationState | null> {
    return this.paConversationContext.get(sessionId, userId);
  }

  /** 持久化会话（供 V2 业务路径在编排回调后写入） */
  async saveSession(state: PlanningConversationState): Promise<void> {
    await this.paConversationContext.set(state);
    this.scheduleConstraintSinkFromSession(state);
  }

  /** PA 对话落库后异步抽取结构化约束写入 TripTaskMemory（不阻塞响应） */
  private scheduleConstraintSinkFromSession(state: PlanningConversationState): void {
    if (!this.constraintSinkService?.isEnabled()) return;

    const tripId =
      state.boundTripId ?? state.confirmedTripId ?? state.lastAccommodationTripId;
    const userId = state.userId;
    if (!tripId || !userId) return;

    const lastUser = [...state.messageHistory].reverse().find((m) => m.role === 'user');
    if (!lastUser?.content?.trim()) return;

    this.constraintSinkService.schedule({
      sessionId: state.sessionId,
      tripId,
      userId,
      messageId: lastUser.id,
      message: lastUser.content,
      recentHistory: state.messageHistory
        .slice(-6)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    });
  }

  /** 删除会话上下文（Redis + 内存） */
  async deleteSession(sessionId: string): Promise<void> {
    await this.paConversationContext.delete(sessionId);
  }

  // ==================== LLM 增强的意图分析 ====================

  /**
   * 使用 LLM 分析用户意图
   */
  private async analyzeIntentWithLLM(message: string, state: PlanningConversationState): Promise<PlanningIntent> {
    // 如果没有 LLM 服务，回退到关键词分析
    if (!this.llmService) {
      return this.analyzeIntentByKeywords(message, state);
    }

    try {
      const prompt = `你是一个旅行规划助手的意图分析器。分析用户消息并返回最匹配的意图。

当前对话阶段: ${state.phase}
用户已收集的偏好: ${JSON.stringify(state.preferences)}
最近3条消息: ${state.messageHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

用户最新消息: "${message}"

可选意图:
- EXPLORE: 用户想探索目的地，还不确定去哪里
- RECOMMEND: 用户想要推荐
- COLLECT_INFO: 用户在回答问题，提供偏好信息
- GENERATE_PLAN: 用户想生成行程方案
- COMPARE: 用户想对比方案
- ADJUST: 用户想调整方案
- CONFIRM: 用户确认方案
- QUESTION: 用户在问问题
- GENERAL: 其他通用对话

只返回意图名称，不要其他内容:`;

      const result = await this.llmService.callLlmWithSchema(LlmProvider.DEEPSEEK, prompt);
      const intent = result.trim().toUpperCase() as PlanningIntent;
      
      // 验证返回的意图是否有效
      const validIntents: PlanningIntent[] = ['EXPLORE', 'RECOMMEND', 'COLLECT_INFO', 'GENERATE_PLAN', 'COMPARE', 'ADJUST', 'CONFIRM', 'QUESTION', 'GENERAL'];
      if (validIntents.includes(intent)) {
        return intent;
      }
    } catch (error: any) {
      this.logger.warn(`LLM 意图分析失败: ${error.message}，回退到关键词分析`);
    }

    return this.analyzeIntentByKeywords(message, state);
  }

  /**
   * 关键词意图分析（回退方案）
   */
  private analyzeIntentByKeywords(message: string, state: PlanningConversationState): PlanningIntent {
    const lowerMessage = message.toLowerCase();
    
    // 探索类
    if (lowerMessage.includes('去哪') || lowerMessage.includes('推荐') || 
        lowerMessage.includes('哪里') || lowerMessage.includes('目的地') ||
        lowerMessage.includes('where') || lowerMessage.includes('recommend')) {
      return state.phase === 'INITIAL' ? 'EXPLORE' : 'RECOMMEND';
    }
    
    // 生成方案
    if (lowerMessage.includes('规划') || lowerMessage.includes('安排') ||
        lowerMessage.includes('行程') || lowerMessage.includes('计划') ||
        lowerMessage.includes('plan') || lowerMessage.includes('itinerary')) {
      return 'GENERATE_PLAN';
    }
    
    // 对比
    if (lowerMessage.includes('对比') || lowerMessage.includes('比较') ||
        lowerMessage.includes('哪个好') || lowerMessage.includes('compare')) {
      return 'COMPARE';
    }
    
    // 调整
    if (lowerMessage.includes('修改') || lowerMessage.includes('调整') ||
        lowerMessage.includes('换') || lowerMessage.includes('改') ||
        lowerMessage.includes('adjust') || lowerMessage.includes('change')) {
      return 'ADJUST';
    }
    
    // 确认
    if (lowerMessage.includes('确认') || lowerMessage.includes('就这个') ||
        lowerMessage.includes('可以') || lowerMessage.includes('好的') ||
        lowerMessage.includes('confirm') || lowerMessage.includes('ok')) {
      if (state.selectedPlanId) {
        return 'CONFIRM';
      }
    }
    
    // 问题咨询
    if (lowerMessage.includes('?') || lowerMessage.includes('？') ||
        lowerMessage.includes('什么') || lowerMessage.includes('怎么') ||
        lowerMessage.includes('为什么') || lowerMessage.includes('多少')) {
      return 'QUESTION';
    }
    
    // 根据当前阶段判断
    if (state.phase === 'INITIAL' || state.phase === 'EXPLORING') {
      return 'COLLECT_INFO';
    }
    
    return 'GENERAL';
  }

  // ==================== Readiness 增强的目的地推荐 (P1: 推荐算法优化) ====================

  /**
   * 从 Readiness Pack 获取目的地推荐
   * P1 增强：使用推荐引擎进行多因素评分排序
   */
  private async handleRecommendWithReadiness(state: PlanningConversationState, request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    let recommendations: DestinationRecommendation[] = [];
    
    // P1: 合并学习到的偏好
    let mergedPreferences = state.preferences;
    if (this.preferenceLearning && request.userId) {
      try {
        mergedPreferences = await this.preferenceLearning.mergeWithLearnedPreferences(
          request.userId,
          state.preferences,
        );
        this.logger.debug(`[规划助手] 已合并用户学习偏好`);
      } catch (error: any) {
        this.logger.warn(`[规划助手] 合并偏好失败: ${error.message}`);
      }
    }

    // P1: 优先使用推荐引擎（如果指定了国家代码，传递给引擎过滤）
    if (this.recommendationEngine) {
      try {
        const scoredDestinations = await this.recommendationEngine.getRecommendations({
          preferences: mergedPreferences,
          limit: 5,
          excludeDestinations: [],
          countryCode: request.countryCode, // 传递国家代码用于过滤
        });

        recommendations = scoredDestinations.map(sd => sd.destination);
        this.logger.debug(`[规划助手] 推荐引擎返回 ${recommendations.length} 个目的地${request.countryCode ? ` (过滤: ${request.countryCode})` : ''}`);
      } catch (error: any) {
        this.logger.warn(`[规划助手] 推荐引擎调用失败: ${error.message}`);
      }
    }

    // 回退：从数据库获取（支持国家代码过滤）
    if (recommendations.length === 0 && this.prisma) {
      try {
        const where: any = { isActive: true };
        // 如果指定了国家代码，添加过滤条件
        if (request.countryCode) {
          where.countryCode = request.countryCode.toUpperCase();
          this.logger.debug(`[规划助手] 数据库查询过滤国家代码: ${request.countryCode}`);
        }
        const packs = await this.prisma.readinessPack.findMany({
          where,
          take: 10,
          orderBy: { updatedAt: 'desc' },
          select: {
            packId: true,
            destinationId: true,
            displayName: true,
            countryCode: true,
            region: true,
            city: true,
            packData: true,
          },
        });

        recommendations = packs.slice(0, 5).map((pack, index) => {
          const packData = pack.packData as any;
          const displayNameEN = packData?.displayName?.en || pack.displayName;
          const displayNameCN = packData?.displayName?.zh || pack.displayName;
          return {
            id: pack.packId,
            countryCode: pack.countryCode,
            name: displayNameEN,
            nameCN: displayNameCN,
            description: packData?.overview?.en || `Explore ${displayNameEN}`,
            descriptionCN: packData?.overview?.zh || `探索${displayNameCN}`,
            highlights: packData?.highlights?.en || [],
            highlightsCN: packData?.highlights?.zh || [],
            matchScore: 95 - index * 5,
            matchReasons: this.generateMatchReasons(pack, mergedPreferences),
            matchReasonsCN: this.generateMatchReasonsCN(pack, mergedPreferences),
            estimatedBudget: {
              min: packData?.budget?.min || 2000,
              max: packData?.budget?.max || 5000,
              currency: 'USD',
            },
            bestSeasons: packData?.bestSeasons || ['Spring', 'Autumn'],
            tags: packData?.tags || ['culture', 'nature'],
          };
        });
      } catch (error: any) {
        this.logger.warn(`[规划助手] 获取 Readiness 数据失败: ${error.message}`);
      }
    }

    // 最后回退：使用默认推荐
    if (recommendations.length === 0) {
      recommendations = this.getDefaultRecommendations();
    }

    state.recommendations = recommendations;

    // P1: 生成人格化响应
    let personaComments = '';
    let personaCommentsCN = '';
    if (this.personaLanguage && recommendations.length > 0) {
      try {
        const topRec = recommendations[0];
        const context: PersonaContext = {
          scenario: 'destination_recommend',
          destination: topRec.name,
          data: {
            budget: mergedPreferences.budget?.total,
          },
        };

        const statements = await this.personaLanguage.generateAllPersonaStatements(context);
        personaComments = `\n\n${statements.abu.icon} **Abu**: ${statements.abu.message}`;
        personaCommentsCN = `\n\n${statements.abu.icon} **Abu 说**: ${statements.abu.messageCN}`;
        personaComments += `\n${statements.neptune.icon} **Neptune**: ${statements.neptune.message}`;
        personaCommentsCN += `\n${statements.neptune.icon} **Neptune 说**: ${statements.neptune.messageCN}`;
      } catch (error: any) {
        this.logger.warn(`[规划助手] 生成人格评论失败: ${error.message}`);
      }
    }

    // 生成响应文本
    const recommendText = recommendations.slice(0, 3).map((r, i) => 
      `${i + 1}. **${r.nameCN}** (${r.name}) - 匹配度 ${r.matchScore}%\n   ${r.descriptionCN}\n   ${r.matchReasonsCN.slice(0, 2).join(' | ')}`
    ).join('\n\n');

    return {
      message: `Based on your preferences, here are my top recommendations:\n\n${recommendations.slice(0, 3).map((r, i) => 
        `${i + 1}. **${r.name}** - Match: ${r.matchScore}%\n   ${r.description}\n   ${r.matchReasons.slice(0, 2).join(' | ')}`
      ).join('\n\n')}${personaComments}\n\nWhich destination interests you most?`,
      messageCN: `根据你的偏好，这是我推荐的目的地：\n\n${recommendText}${personaCommentsCN}\n\n你最感兴趣哪个目的地？我可以为你创建详细的行程规划！`,
      phase: 'RECOMMENDING',
      recommendations,
      suggestedActions: recommendations.slice(0, 3).map(r => ({
        action: `select_${r.id}`,
        label: `Choose ${r.name}`,
        labelCN: `选择${r.nameCN}`,
      })),
    };
  }

  // ==================== 方案生成 (V2.1: 通过 CoreGateway 触发) ====================

  /**
   * 生成方案
   * V2.1 架构：通过 CoreGateway 触发核心动作，不直接调用 PlanningWorkbench
   */
  private async handleGeneratePlanWithWorkbench(state: PlanningConversationState, request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    // 提取用户选择的目的地
    const destination = this.extractDestination(request.message, state);
    if (destination) {
      state.selectedDestination = destination;
      
      // P1: 学习用户目的地选择
      if (this.preferenceLearning && request.userId) {
        try {
          await this.preferenceLearning.learnFromAction({
            userId: request.userId,
            action: 'destination_selected',
            data: {
              destination,
              destinationType: state.recommendations?.find(r => r.name === destination)?.tags,
            },
          });
        } catch (error: any) {
          this.logger.warn(`[规划助手] 学习偏好失败: ${error.message}`);
        }
      }
    }

    let planCandidates: PlanCandidate[] = [];
    let personaEvaluation: PersonaShellOutput | undefined;

    // V2.1: 通过 CoreGateway 触发方案生成
    if (this.coreGateway && state.selectedDestination) {
      try {
        this.logger.debug(`[规划助手] 通过 CoreGateway 触发方案生成: ${state.selectedDestination}`);
        
        // 计算天数
        const startDate = state.preferences.dateRange?.startDate || this.getDefaultStartDate();
        const endDate = state.preferences.dateRange?.endDate || this.getDefaultEndDate();
        const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) || 10;
        
        // V2.1: 使用 CoreGateway.generatePlan() 而不是直接调用 PlanningWorkbench
        const coreResult = await this.coreGateway.generatePlan({
          userId: request.userId || 'anonymous',
          sessionId: state.sessionId,
          destination: state.selectedDestination,
          preferences: {
            budget: state.preferences.budget,
            travelers: state.preferences.travelers,
            dateRange: { startDate, endDate },
            activities: state.preferences.activities,
          },
          constraints: {
            days,
            startDate,
            endDate,
          },
          tripId: state.confirmedTripId,
        });

        if (coreResult.success && coreResult.data) {
          const workbenchResponse = coreResult.data as PlanningWorkbenchResponse;
          
          // 转换核心层输出为方案候选
          if (workbenchResponse.uiOutput?.skeletonOptions?.options) {
            planCandidates = workbenchResponse.uiOutput.skeletonOptions.options.map((opt, index) => ({
              id: `plan-${index}`,
              name: opt.name || `Option ${index + 1}`,
              nameCN: `方案 ${index + 1}`,
              description: 'A carefully crafted itinerary',
              descriptionCN: '精心设计的行程',
              destination: state.selectedDestination || '',
              duration: days,
              highlights: [],
              estimatedBudget: {
                total: 5000,
                breakdown: {
                  flight: 1500,
                  accommodation: 2000,
                  activities: 1000,
                  food: 500,
                  other: 0,
                },
              },
              pace: 'moderate' as const,
              suitability: {
                score: 90 - index * 5,
                reasons: [],
              },
            }));
          }

          // 获取三人格评估（核心层已处理）
          if (workbenchResponse.uiOutput?.personas) {
            personaEvaluation = workbenchResponse.uiOutput.personas;
          }
        }

        this.logger.debug(`[规划助手] CoreGateway 返回 ${planCandidates.length} 个方案 (traceId=${coreResult.meta?.traceId})`);
      } catch (error: any) {
        this.logger.warn(`[规划助手] CoreGateway 调用失败: ${error.message}，使用默认方案`);
      }
    }
    // 降级：如果 CoreGateway 不可用，尝试直接调用 PlanningWorkbench（向后兼容）
    else if (this.planningWorkbench && state.selectedDestination) {
      this.logger.warn(`[规划助手] CoreGateway 不可用，降级使用直接调用`);
      try {
        const startDate = state.preferences.dateRange?.startDate || this.getDefaultStartDate();
        const endDate = state.preferences.dateRange?.endDate || this.getDefaultEndDate();
        const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) || 10;
        
        const workbenchResponse = await this.planningWorkbench.execute({
          context: {
            destination: {
              country: state.selectedDestination,
              city: state.selectedDestination,
            },
            days,
            constraints: {
              time: { days, startDate, endDate },
              budget: {
                total: state.preferences.budget?.total || 5000,
                currency: state.preferences.budget?.currency || 'USD',
              },
              companions: { count: state.preferences.travelers?.adults || 2 },
            },
          },
          userAction: 'generate',
        });

        if (workbenchResponse.uiOutput.skeletonOptions?.options) {
          planCandidates = workbenchResponse.uiOutput.skeletonOptions.options.map((opt, index) => ({
            id: `plan-${index}`,
            name: opt.name || `Option ${index + 1}`,
            nameCN: `方案 ${index + 1}`,
            description: 'A carefully crafted itinerary',
            descriptionCN: '精心设计的行程',
            destination: state.selectedDestination || '',
            duration: days,
            highlights: [],
            estimatedBudget: {
              total: 5000,
              breakdown: { flight: 1500, accommodation: 2000, activities: 1000, food: 500, other: 0 },
            },
            pace: 'moderate' as const,
            suitability: { score: 90 - index * 5, reasons: [] },
          }));
        }

        if (workbenchResponse.uiOutput.personas) {
          personaEvaluation = workbenchResponse.uiOutput.personas;
        } else if (this.personaShell && workbenchResponse.planState) {
          personaEvaluation = await this.personaShell.wrapAsPersonas(workbenchResponse.planState);
        }
      } catch (error: any) {
        this.logger.warn(`[规划助手] 降级调用也失败: ${error.message}`);
      }
    }

    // 如果没有生成方案，使用默认
    if (planCandidates.length === 0) {
      planCandidates = this.getDefaultPlanCandidates(state);
    }

    state.planCandidates = planCandidates;
    
    // P1: 学习用户方案生成偏好
    if (this.preferenceLearning && request.userId) {
      try {
        await this.preferenceLearning.learnFromAction({
          userId: request.userId,
          action: 'plan_generated',
          data: {
            destination: state.selectedDestination,
            budget: state.preferences.budget?.total,
            days: planCandidates[0]?.duration,
            travelers: state.preferences.travelers,
          },
        });
      } catch (error: any) {
        this.logger.warn(`[规划助手] 学习偏好失败: ${error.message}`);
      }
    }

    // 构建响应
    const planText = planCandidates.map((p, i) => {
      const budgetStr = `$${p.estimatedBudget.total.toLocaleString()}`;
      return `${i + 1}. **${p.nameCN}** - ${budgetStr}\n   ${p.duration}天 | ${p.descriptionCN}\n   匹配度：${p.suitability.score}%`;
    }).join('\n\n');

    // P1: 使用人格语言服务生成更有温度的评价
    let personaText = '';
    let personaTextCN = '';
    
    if (this.personaLanguage && planCandidates.length > 0) {
      try {
        const topPlan = planCandidates[0];
        const context: PersonaContext = {
          scenario: 'plan_evaluation',
          destination: state.selectedDestination,
          planName: topPlan.nameCN,
          data: {
            budget: topPlan.estimatedBudget.total,
            duration: topPlan.duration,
            fatigueScore: topPlan.pace === 'intensive' ? 70 : topPlan.pace === 'moderate' ? 40 : 20,
          },
        };

        const statements = await this.personaLanguage.generateAllPersonaStatements(context);
        
        personaText = `\n\n🐻‍❄️ **Abu**: ${statements.abu.message}`;
        personaText += `\n🐕 **Dr.Dre**: ${statements.drdre.message}`;
        personaText += `\n🦦 **Neptune**: ${statements.neptune.message}`;
        
        personaTextCN = `\n\n🐻‍❄️ **Abu 说**: ${statements.abu.messageCN}`;
        personaTextCN += `\n🐕 **Dr.Dre 说**: ${statements.drdre.messageCN}`;
        personaTextCN += `\n🦦 **Neptune 说**: ${statements.neptune.messageCN}`;
        
        this.logger.debug(`[规划助手] 人格语言服务生成评价成功`);
      } catch (error: any) {
        this.logger.warn(`[规划助手] 人格语言服务调用失败: ${error.message}，使用 PersonaShell 回退`);
      }
    }
    
    // 回退：使用 PersonaShell 的评估
    if (!personaText && personaEvaluation) {
      if (personaEvaluation.personas.abu) {
        personaText += `\n\n🐻‍❄️ **Abu**: ${personaEvaluation.personas.abu.explanation}`;
        personaTextCN += `\n\n🐻‍❄️ **Abu 说**: ${personaEvaluation.personas.abu.explanation}`;
      }
      if (personaEvaluation.personas.drdre) {
        personaText += `\n🐕 **Dr.Dre**: ${personaEvaluation.personas.drdre.explanation}`;
        personaTextCN += `\n🐕 **Dr.Dre 说**: ${personaEvaluation.personas.drdre.explanation}`;
      }
      if (personaEvaluation.personas.neptune) {
        personaText += `\n🦦 **Neptune**: ${personaEvaluation.personas.neptune.explanation}`;
        personaTextCN += `\n🦦 **Neptune 说**: ${personaEvaluation.personas.neptune.explanation}`;
      }
    }

    return {
      message: `I've created ${planCandidates.length} itinerary options for ${state.selectedDestination}:\n\n${planCandidates.map((p, i) => 
        `${i + 1}. **${p.name}** - $${p.estimatedBudget.total.toLocaleString()}\n   ${p.duration} days | ${p.description}`
      ).join('\n\n')}${personaText}\n\nWhich plan would you like to explore further?`,
      messageCN: `我为你的${state.selectedDestination}之旅创建了 ${planCandidates.length} 个方案：\n\n${planText}${personaTextCN}\n\n想详细了解哪个方案？`,
      phase: 'PLANNING',
      planCandidates,
      suggestedActions: planCandidates.map(p => ({
        action: `view_${p.id}`,
        label: `View ${p.name}`,
        labelCN: `查看${p.nameCN}`,
      })),
    };
  }

  // ==================== Trip 保存 (P1: 偏好学习) ====================

  /**
   * 确认方案并保存 Trip
   * P1 增强：确认时学习用户偏好
   */
  private async handleConfirmAndSaveTrip(state: PlanningConversationState, request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    // 提取用户选择的方案
    const selectedPlanId = this.extractSelectedPlanId(request.message, state);
    if (selectedPlanId) {
      state.selectedPlanId = selectedPlanId;
    }

    const selectedPlan = state.planCandidates?.find(p => p.id === state.selectedPlanId);
    
    // 尝试保存到数据库
    let tripId = `trip-${Date.now()}`;
    
    if (this.prisma && selectedPlan) {
      try {
        // 生成默认行程名称
        const { generateDefaultTripName } = require('../../../../trips/utils/trip-name.util');
        const destination = state.selectedDestination || selectedPlan.destination;
        const startDate = state.preferences.dateRange?.startDate || this.getDefaultStartDate();
        const tripName = generateDefaultTripName({
          destination,
          startDate: new Date(startDate),
        });

        const trip = await this.prisma.trip.create({
          data: {
            id: tripId,
            name: tripName, // 新增：行程名称
            destination: destination,
            startDate: new Date(startDate),
            endDate: new Date(state.preferences.dateRange?.endDate || this.getDefaultEndDate()),
            status: 'PLANNING',
            updatedAt: new Date(),
            budgetConfig: {
              total: selectedPlan.estimatedBudget.total,
              breakdown: selectedPlan.estimatedBudget.breakdown,
            },
            metadata: {
              userId: state.userId,
              travelers: state.preferences.travelers?.adults || 2,
              planId: selectedPlan.id,
              sessionId: state.sessionId,
            },
          },
        });
        tripId = trip.id;
        this.logger.debug(`[规划助手] Trip 已保存: ${tripId}`);
      } catch (error: any) {
        this.logger.warn(`[规划助手] 保存 Trip 失败: ${error.message}，使用临时 ID`);
      }
    }

    state.confirmedTripId = tripId;
    
    // P1: 学习用户确认的偏好（高权重）
    if (this.preferenceLearning && request.userId && selectedPlan) {
      try {
        await this.preferenceLearning.learnFromAction({
          userId: request.userId,
          action: 'plan_confirmed',
          data: {
            destination: state.selectedDestination,
            destinationType: state.recommendations?.find(r => r.name === state.selectedDestination)?.tags,
            budget: selectedPlan.estimatedBudget.total,
            days: selectedPlan.duration,
            travelers: state.preferences.travelers,
            pace: selectedPlan.pace,
          },
        });
        this.logger.debug(`[规划助手] 已学习用户确认偏好`);
      } catch (error: any) {
        this.logger.warn(`[规划助手] 学习偏好失败: ${error.message}`);
      }
    }

    // P1: 生成人格化祝福语
    let personaFarewell = '';
    let personaFarewellCN = '';
    if (this.personaLanguage) {
      try {
        const context: PersonaContext = {
          scenario: 'general',
          destination: state.selectedDestination,
          planName: selectedPlan?.nameCN,
        };
        const statements = await this.personaLanguage.generateAllPersonaStatements(context);
        
        personaFarewell = `\n\n${statements.abu.icon} ${statements.abu.message}`;
        personaFarewell += `\n${statements.drdre.icon} ${statements.drdre.message}`;
        personaFarewell += `\n${statements.neptune.icon} ${statements.neptune.message}`;
        
        personaFarewellCN = `\n\n${statements.abu.icon} ${statements.abu.messageCN}`;
        personaFarewellCN += `\n${statements.drdre.icon} ${statements.drdre.messageCN}`;
        personaFarewellCN += `\n${statements.neptune.icon} ${statements.neptune.messageCN}`;
      } catch (error: any) {
        this.logger.warn(`[规划助手] 生成祝福语失败: ${error.message}`);
      }
    }

    return {
      message: `🎉 Excellent choice! Your trip has been confirmed!

**Trip ID**: ${tripId}
**Destination**: ${state.selectedDestination || selectedPlan?.destination || 'Your destination'}
**Duration**: ${selectedPlan?.duration || 10} days
**Plan**: ${selectedPlan?.name || 'Your selected plan'}

What's next?
- View your detailed itinerary
- Start preparing (packing list, visa info, etc.)
- Share with travel companions
${personaFarewell}
Have a wonderful trip! 🌟`,
      messageCN: `🎉 太棒了！你的行程已确认！

**行程编号**: ${tripId}
**目的地**: ${state.selectedDestination || selectedPlan?.destination || '你的目的地'}
**时长**: ${selectedPlan?.duration || 10}天
**方案**: ${selectedPlan?.nameCN || '你选择的方案'}

接下来可以：
- 查看详细行程安排
- 开始准备（打包清单、签证信息等）
- 分享给同行伙伴
${personaFarewellCN}
祝你旅途愉快！🌟`,
      phase: 'COMPLETED',
      confirmedTripId: tripId,
      suggestedActions: [
        { action: 'view_itinerary', label: 'View Itinerary', labelCN: '查看行程' },
        { action: 'start_preparing', label: 'Start Preparing', labelCN: '开始准备' },
        { action: 'share_trip', label: 'Share Trip', labelCN: '分享行程' },
      ],
    };
  }

  // ==================== LLM 增强的问答 ====================

  /** 规划工作台绑定 Trip：注入库内日程，避免模型称「尚未选择住宿」而左侧已有酒店/POI */
  private async buildBoundTripDigestBlock(tripId?: string): Promise<string> {
    const tid = tripId?.trim();
    if (!tid || !this.prisma) return '';
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tid },
        select: {
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          destination: true,
          TripDay: {
            orderBy: { date: 'asc' },
            select: {
              date: true,
              ItineraryItem: {
                orderBy: { startTime: 'asc' },
                select: {
                  note: true,
                  type: true,
                  startTime: true,
                  endTime: true,
                  Place: { select: { nameCN: true, nameEN: true } },
                },
              },
            },
          },
        },
      });
      if (!trip?.TripDay?.length) return '';
      const worldState: DecisionOsWorldState = {
        revision: 'v1',
        tripId: tid,
        name: trip.name,
        status: trip.status,
        destination: trip.destination,
        startDate: trip.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: trip.endDate?.toISOString().slice(0, 10) ?? null,
        days: (trip.TripDay ?? []).map((day) => ({
          date: day.date?.toISOString().slice(0, 10) ?? '?',
          items: (day.ItineraryItem ?? []).map((it) => ({
            type: it.type,
            note: it.note,
            placeName: it.Place?.nameCN ?? it.Place?.nameEN ?? null,
            startTime: formatDecisionOsTripTime(it.startTime),
            endTime: formatDecisionOsTripTime(it.endTime),
          })),
        })),
      };
      const block = compressWorldStateToNarrative(worldState, tid);
      if (!block.trim()) return '';
      return `${block}\n\n【约束】上文为库内已入库行程草案。若已列出酒店、超市/景点与时间窗，分析/预算须基于这些具体安排；禁止写「用户尚未提供住宿、餐饮或活动选择」等与此矛盾的表述。无标价项可给区间估算但须说明依据。`;
    } catch (e: unknown) {
      this.logger.warn(
        `[规划助手] bound trip digest failed trip_id=${tid}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return '';
    }
  }

  /**
   * 使用 LLM 回答问题
   */
  private async handleQuestionWithLLM(state: PlanningConversationState, request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    if (!this.llmService) {
      return this.handleQuestionDefault(state, request);
    }

    try {
      const tripDigest = await this.buildBoundTripDigestBlock(request.tripId);
      const contextInfo = state.selectedDestination 
        ? `用户正在规划去${state.selectedDestination}的旅行。` 
        : '用户还在探索目的地。';
      
      const prompt = `你是一个专业的旅行规划助手。请回答用户的问题。

${contextInfo}
用户偏好: ${JSON.stringify(state.preferences)}
${tripDigest ? `\n${tripDigest}\n` : ''}

用户问题: "${request.message}"

请用友好、专业的语气回答，同时提供中英双语回复。格式：
EN: [英文回复]
CN: [中文回复]`;

      const result = await this.llmService.callLlmWithSchema(LlmProvider.DEEPSEEK, prompt);
      
      // 解析 LLM 回复
      const enMatch = result.match(/EN:\s*(.+?)(?=CN:|$)/s);
      const cnMatch = result.match(/CN:\s*(.+?)$/s);
      
      const messageEN = enMatch?.[1]?.trim() || result;
      const messageCN = cnMatch?.[1]?.trim() || result;

      return {
        message: messageEN,
        messageCN: messageCN,
        phase: state.phase,
      };
    } catch (error: any) {
      this.logger.warn(`LLM 问答失败: ${error.message}`);
      return this.handleQuestionDefault(state, request);
    }
  }

  /**
   * 默认问答处理
   */
  private handleQuestionDefault(state: PlanningConversationState, _request: PlanningAssistantRequest): PlanningAssistantResponse {
    return {
      message: `That's a great question! Based on my knowledge, I'd suggest exploring more about your destination. Is there anything specific about ${state.selectedDestination || 'your trip'} you'd like to know?`,
      messageCN: `这是个好问题！根据我的了解，建议你多了解目的地的情况。关于${state.selectedDestination || '你的旅行'}，有什么具体想知道的吗？`,
      phase: state.phase,
    };
  }

  /**
   * 使用 LLM 处理通用对话
   */
  private async handleGeneralWithLLM(state: PlanningConversationState, request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    if (!this.llmService) {
      return this.handleGeneralDefault(state, request);
    }

    try {
      const tripDigest = await this.buildBoundTripDigestBlock(request.tripId);
      const prompt = `你是一个友好的旅行规划助手。用户发来了一条消息，请自然地回应并引导用户继续规划旅行。

当前状态: ${state.phase}
${tripDigest ? `\n${tripDigest}\n` : ''}
用户消息: "${request.message}"

回复要简洁友好，引导用户继续对话。格式：
EN: [英文回复]
CN: [中文回复]`;

      const result = await this.llmService.callLlmWithSchema(LlmProvider.DEEPSEEK, prompt);
      
      const enMatch = result.match(/EN:\s*(.+?)(?=CN:|$)/s);
      const cnMatch = result.match(/CN:\s*(.+?)$/s);

      return {
        message: enMatch?.[1]?.trim() || result,
        messageCN: cnMatch?.[1]?.trim() || result,
        phase: state.phase,
        suggestedActions: [
          { action: 'explore', label: 'Explore destinations', labelCN: '探索目的地' },
          { action: 'start_planning', label: 'Start planning', labelCN: '开始规划' },
        ],
      };
    } catch (error: any) {
      return this.handleGeneralDefault(state, request);
    }
  }

  /**
   * 默认通用对话
   */
  private handleGeneralDefault(state: PlanningConversationState, _request: PlanningAssistantRequest): PlanningAssistantResponse {
    return {
      message: `I'm here to help you plan your perfect trip! 🌟

You can:
- Tell me where you'd like to go
- Ask for destination recommendations
- Let me create an itinerary for you

What would you like to do?`,
      messageCN: `我在这里帮你规划完美的旅行！🌟

你可以：
- 告诉我你想去哪里
- 让我推荐目的地
- 让我为你创建行程

你想做什么呢？`,
      phase: state.phase,
      suggestedActions: [
        { action: 'explore', label: 'Explore destinations', labelCN: '探索目的地' },
        { action: 'start_planning', label: 'Start planning', labelCN: '开始规划' },
      ],
    };
  }

  // ==================== 其他处理方法 ====================

  /**
   * 处理探索意图
   */
  private async handleExplore(_state: PlanningConversationState, _request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    return {
      message: `Great! I'd love to help you plan your trip! 🌟

To give you the best recommendations, I'd like to know a bit more:

1. **When** are you planning to travel?
2. **Who** will be traveling?
3. **What's your budget** range?`,
      messageCN: `太好了！我很乐意帮你规划旅行！🌟

为了给你更好的推荐，我想先了解一下：

1. **什么时候**出发？
2. **谁一起去**？
3. **预算大概多少**？`,
      phase: 'EXPLORING',
      guidingQuestions: [
        {
          question: 'When are you planning to travel?',
          questionCN: '计划什么时候出发？',
          type: 'text',
        },
        {
          question: 'Who will be traveling?',
          questionCN: '谁一起去？',
          options: ['Solo', 'Couple', 'Family', 'Friends'],
          optionsCN: ['独自出行', '情侣', '家庭', '朋友'],
          type: 'single',
        },
      ],
    };
  }

  /**
   * 处理信息收集
   */
  private async handleCollectInfo(state: PlanningConversationState, request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    // 从消息中提取偏好
    const extractedPreferences = this.extractPreferences(request.message);
    state.preferences = { ...state.preferences, ...extractedPreferences };

    // 判断是否收集到足够信息
    const missingInfo = this.getMissingInfo(state.preferences);
    
    if (missingInfo.length === 0) {
      return this.handleRecommendWithReadiness(state, request);
    }

    return {
      message: `Got it! Could you also tell me about ${missingInfo[0]}?`,
      messageCN: `明白了！能再告诉我${this.translateMissingInfo(missingInfo[0])}吗？`,
      phase: 'EXPLORING',
      guidingQuestions: [
        {
          question: `What about your ${missingInfo[0]}?`,
          questionCN: `关于${this.translateMissingInfo(missingInfo[0])}呢？`,
          type: 'text',
        },
      ],
    };
  }

  /**
   * 处理方案对比
   */
  private async handleCompare(state: PlanningConversationState, _request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    const candidates = state.planCandidates || [];
    
    return {
      message: `Here's a comparison of your options:\n\n${candidates.map(c => 
        `**${c.name}**: $${c.estimatedBudget.total} | ${c.pace} pace | Score: ${c.suitability.score}%`
      ).join('\n')}\n\nWhich one appeals to you most?`,
      messageCN: `这是方案对比：\n\n${candidates.map(c => 
        `**${c.nameCN}**: ¥${(c.estimatedBudget.total * 7).toLocaleString()} | ${this.translatePace(c.pace)} | 匹配度: ${c.suitability.score}%`
      ).join('\n')}\n\n你更喜欢哪个？`,
      phase: 'COMPARING',
    };
  }

  /**
   * 处理调整请求
   */
  private async handleAdjust(_state: PlanningConversationState, _request: PlanningAssistantRequest): Promise<PlanningAssistantResponse> {
    return {
      message: `Sure! What would you like to adjust?
- Duration
- Budget  
- Pace
- Specific activities`,
      messageCN: `没问题！你想调整什么？
- 时长
- 预算
- 节奏
- 具体活动`,
      phase: 'ADJUSTING',
    };
  }

  // ==================== 辅助方法 ====================

  private async loadOrCreateSession(sessionId: string, userId?: string): Promise<PlanningConversationState> {
    let state = await this.paConversationContext.get(sessionId, userId);

    if (!state || new Date(state.expiresAt) < new Date()) {
      const now = new Date().toISOString();
      state = {
        sessionId,
        userId,
        phase: 'INITIAL',
        preferences: {},
        messageHistory: [],
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + this.SESSION_TTL_MS).toISOString(),
      };
      await this.paConversationContext.set(state);
    }

    return state;
  }

  private addMessage(state: PlanningConversationState, message: ConversationMessage): PlanningConversationState {
    return {
      ...state,
      messageHistory: [...state.messageHistory, message],
    };
  }

  private createErrorResponse(_errorMessage: string): PlanningAssistantResponse {
    return {
      message: `I apologize, something went wrong. Please try again.`,
      messageCN: `抱歉，出了点问题。请重试。`,
      phase: 'INITIAL',
    };
  }

  private extractPreferences(message: string): Partial<UserPreferences> {
    const preferences: Partial<UserPreferences> = {};
    const lowerMessage = message.toLowerCase();
    
    // 预算提取
    const budgetMatch = message.match(/(\d+)\s*(万|k|thousand|usd|rmb|美元|人民币)?/i);
    if (budgetMatch) {
      const amount = parseInt(budgetMatch[1]);
      const unit = budgetMatch[2]?.toLowerCase() || '';
      let total = amount;
      if (unit.includes('万') || unit === 'k') total = amount * 10000;
      preferences.budget = { total, currency: unit.includes('usd') || unit.includes('美元') ? 'USD' : 'CNY' };
    }

    // 人数提取 - 先尝试匹配数字+人的通用模式
    const travelerPatterns = [
      /(\d+)\s*个人/,      // "2个人", "3个人"
      /(\d+)\s*人/,        // "2人", "3人"
      /(\d+)\s*位/,        // "2位", "3位"
      /(\d+)\s*persons?/i, // "2 persons"
      /(\d+)\s*people/i,   // "2 people"
      /(\d+)\s*adults?/i,  // "2 adults"
    ];
    
    let travelersMatched = false;
    for (const pattern of travelerPatterns) {
      const match = message.match(pattern);
      if (match) {
        const count = parseInt(match[1], 10);
        if (count > 0 && count <= 20) { // 合理范围限制
          preferences.travelers = { adults: count };
          travelersMatched = true;
          break;
        }
      }
    }
    
    // 如果没有匹配到数字模式，再尝试固定短语匹配
    if (!travelersMatched) {
      if (lowerMessage.includes('一个人') || lowerMessage.includes('solo') || lowerMessage.includes('独自')) {
        preferences.travelers = { adults: 1 };
      } else if (lowerMessage.includes('两个人') || lowerMessage.includes('couple') || lowerMessage.includes('情侣')) {
        preferences.travelers = { adults: 2 };
      }
    }

    // 日期提取
    const monthMatch = message.match(/(\d{1,2})月|(\w+)\s*月/);
    if (monthMatch) {
      const month = parseInt(monthMatch[1]) || this.parseMonth(monthMatch[2]);
      if (month) {
        const year = new Date().getFullYear();
        preferences.dateRange = {
          preferredMonths: [month],
          startDate: `${year}-${month.toString().padStart(2, '0')}-01`,
        };
      }
    }

    return preferences;
  }

  private parseMonth(monthStr: string): number | undefined {
    const months: Record<string, number> = {
      'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
      'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
      'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'september': 9,
      'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12,
    };
    return months[monthStr?.toLowerCase()];
  }

  private getMissingInfo(preferences: UserPreferences): string[] {
    const missing: string[] = [];
    if (!preferences.dateRange?.startDate && !preferences.dateRange?.preferredMonths) missing.push('travel dates');
    if (!preferences.travelers?.adults) missing.push('number of travelers');
    if (!preferences.budget?.total && !preferences.budget?.level) missing.push('budget');
    return missing;
  }

  private translateMissingInfo(info: string): string {
    const translations: Record<string, string> = {
      'travel dates': '出行时间',
      'number of travelers': '出行人数',
      'budget': '预算',
    };
    return translations[info] || info;
  }

  private translatePace(pace: string): string {
    const translations: Record<string, string> = {
      'relaxed': '悠闲',
      'moderate': '适中',
      'intensive': '紧凑',
    };
    return translations[pace] || pace;
  }

  private extractDestination(message: string, state: PlanningConversationState): string | undefined {
    // 从消息中提取目的地
    const destinations = ['iceland', 'japan', 'newzealand', '冰岛', '日本', '新西兰'];
    for (const dest of destinations) {
      if (message.toLowerCase().includes(dest.toLowerCase())) {
        return dest;
      }
    }
    // 检查推荐中的选择
    if (state.recommendations) {
      for (const rec of state.recommendations) {
        if (message.toLowerCase().includes(rec.id) || 
            message.toLowerCase().includes(rec.name.toLowerCase()) ||
            message.includes(rec.nameCN)) {
          return rec.nameCN || rec.name;
        }
      }
    }
    return state.selectedDestination;
  }

  private extractSelectedPlanId(message: string, state: PlanningConversationState): string | undefined {
    if (state.planCandidates) {
      for (const plan of state.planCandidates) {
        if (message.toLowerCase().includes(plan.id) ||
            message.toLowerCase().includes(plan.name.toLowerCase()) ||
            message.includes(plan.nameCN)) {
          return plan.id;
        }
      }
    }
    // 默认选择第一个（用户确认时）
    return state.planCandidates?.[0]?.id || state.selectedPlanId;
  }

  private getDefaultStartDate(): string {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
  }

  private getDefaultEndDate(): string {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(date.getDate() + 10);
    return date.toISOString().split('T')[0];
  }

  private generateMatchReasons(pack: any, preferences: UserPreferences): string[] {
    const reasons: string[] = [];
    reasons.push('Safe destination');
    reasons.push('Good for your travel period');
    if (preferences.travelers?.adults === 2) reasons.push('Romantic destination');
    return reasons;
  }

  private generateMatchReasonsCN(pack: any, preferences: UserPreferences): string[] {
    const reasons: string[] = [];
    reasons.push('安全目的地');
    reasons.push('适合你的出行时间');
    if (preferences.travelers?.adults === 2) reasons.push('浪漫目的地');
    return reasons;
  }

  private getDefaultRecommendations(): DestinationRecommendation[] {
    return [
      {
        id: 'iceland',
        countryCode: 'IS',
        name: 'Iceland',
        nameCN: '冰岛',
        description: 'Land of fire and ice with stunning landscapes',
        descriptionCN: '冰与火之国，拥有令人惊叹的自然景观',
        highlights: ['Northern Lights', 'Glaciers', 'Geysers'],
        highlightsCN: ['极光', '冰川', '间歇泉'],
        matchScore: 95,
        matchReasons: ['Unique landscapes', 'Safe'],
        matchReasonsCN: ['独特地貌', '安全'],
        estimatedBudget: { min: 3000, max: 6000, currency: 'USD' },
        bestSeasons: ['Sep-Mar', 'Jun-Aug'],
        tags: ['nature', 'adventure'],
      },
      {
        id: 'japan',
        countryCode: 'JP',
        name: 'Japan',
        nameCN: '日本',
        description: 'Perfect blend of tradition and innovation',
        descriptionCN: '传统与现代的完美融合',
        highlights: ['Cherry Blossoms', 'Temples', 'Food'],
        highlightsCN: ['樱花', '寺庙', '美食'],
        matchScore: 92,
        matchReasons: ['Rich culture', 'Great food'],
        matchReasonsCN: ['丰富文化', '美食天堂'],
        estimatedBudget: { min: 2500, max: 5000, currency: 'USD' },
        bestSeasons: ['Mar-May', 'Oct-Nov'],
        tags: ['culture', 'food'],
      },
      {
        id: 'newzealand',
        countryCode: 'NZ',
        name: 'New Zealand',
        nameCN: '新西兰',
        description: 'Adventure paradise with breathtaking scenery',
        descriptionCN: '冒险天堂，壮丽风景',
        highlights: ['Lord of the Rings', 'Bungee', 'Fjords'],
        highlightsCN: ['魔戒取景地', '蹦极', '峡湾'],
        matchScore: 88,
        matchReasons: ['Adventure', 'Nature'],
        matchReasonsCN: ['冒险活动', '自然风光'],
        estimatedBudget: { min: 3500, max: 7000, currency: 'USD' },
        bestSeasons: ['Dec-Feb', 'Jun-Aug'],
        tags: ['adventure', 'nature'],
      },
    ];
  }

  private getDefaultPlanCandidates(state: PlanningConversationState): PlanCandidate[] {
    const destination = state.selectedDestination || 'Your Destination';
    return [
      {
        id: 'plan-relaxed',
        name: 'Relaxed Explorer',
        nameCN: '悠闲探索者',
        description: 'Comfortable pace with time to enjoy',
        descriptionCN: '舒适节奏，充分享受每个目的地',
        destination,
        duration: 10,
        highlights: ['Scenic views', 'Local cuisine', 'Cultural sites'],
        estimatedBudget: { total: 4500, breakdown: { flight: 1200, accommodation: 1800, activities: 800, food: 500, other: 200 } },
        pace: 'relaxed',
        suitability: { score: 92, reasons: ['Matches pace preference', 'Within budget'] },
      },
      {
        id: 'plan-adventure',
        name: 'Adventure Seeker',
        nameCN: '冒险探索者',
        description: 'Action-packed itinerary',
        descriptionCN: '紧凑刺激的行程',
        destination,
        duration: 10,
        highlights: ['Outdoor activities', 'Unique experiences', 'Hidden gems'],
        estimatedBudget: { total: 5500, breakdown: { flight: 1200, accommodation: 1600, activities: 1800, food: 600, other: 300 } },
        pace: 'intensive',
        suitability: { score: 85, reasons: ['Exciting', 'Unique'] },
        warnings: ['Physically demanding'],
      },
      {
        id: 'plan-balanced',
        name: 'Best of Both',
        nameCN: '精华平衡版',
        description: 'Perfect balance of adventure and relaxation',
        descriptionCN: '冒险与休闲的完美平衡',
        destination,
        duration: 10,
        highlights: ['Top attractions', 'Local experiences', 'Free time'],
        estimatedBudget: { total: 5000, breakdown: { flight: 1200, accommodation: 1700, activities: 1200, food: 600, other: 300 } },
        pace: 'moderate',
        suitability: { score: 95, reasons: ['Best value', 'Balanced'] },
      },
    ];
  }

  // ==================== P1: 用户偏好管理 ====================

  /**
   * 获取用户偏好摘要
   */
  async getUserPreferenceSummary(userId: string): Promise<{
    summary: string;
    summaryCN: string;
    topPreferences: { label: string; labelCN: string; value: string }[];
    learnedPreferences?: any;
  }> {
    if (!this.preferenceLearning) {
      return {
        summary: 'Preference learning is not available.',
        summaryCN: '偏好学习服务不可用。',
        topPreferences: [],
      };
    }

    try {
      const result = await this.preferenceLearning.getPreferenceSummary(userId);
      const learnedPrefs = await this.preferenceLearning.getAsUserPreferences(userId);
      
      return {
        ...result,
        learnedPreferences: learnedPrefs,
      };
    } catch (error: any) {
      this.logger.warn(`[规划助手] 获取用户偏好摘要失败: ${error.message}`);
      return {
        summary: 'Failed to load preferences.',
        summaryCN: '加载偏好失败。',
        topPreferences: [],
      };
    }
  }

  /**
   * 清除用户偏好
   */
  async clearUserPreferences(userId: string): Promise<void> {
    if (!this.preferenceLearning) {
      this.logger.warn('[规划助手] 偏好学习服务不可用，无法清除偏好');
      return;
    }

    try {
      await this.preferenceLearning.clearProfile(userId);
      this.logger.log(`[规划助手] 已清除用户偏好: ${userId}`);
    } catch (error: any) {
      this.logger.warn(`[规划助手] 清除用户偏好失败: ${error.message}`);
      throw error;
    }
  }
}
